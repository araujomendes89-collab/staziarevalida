/**
 * Infraestrutura da Central de Conteúdo: acesso ao banco (como serviço ou como o usuário),
 * autenticação das requisições e armazenamento dos arquivos.
 *
 *   Desenvolvimento: banco do servidor (server/devDb) e pasta .data/content-hub.
 *   Produção: Supabase — funções ch_worker_* com a chave de serviço (só no servidor),
 *             funções app_* com o token do próprio usuário, arquivos no bucket privado "content-hub".
 *
 * Toda chamada ao banco passa os argumentos por safeForDb (o Postgres recusa o caractere nulo e metade solta de par substituto).
 */
import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request } from "express";
import type { AuthUser } from "../../src/novo/data/backend";
import type { DevDatabase } from "../devDb/devDatabase";

export interface Identity extends AuthUser {
  jwt?: string;
}

export interface ContentDb {
  readonly mode: "dev" | "supabase";
  /** Funções do processamento (ch_worker_*), executadas como serviço. */
  service<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
  /** Funções app_* executadas como o usuário, com o RLS valendo. */
  asUser<T>(user: Identity, fn: string, args?: Record<string, unknown>): Promise<T>;
  authenticate(req: Request): Promise<Identity | null>;
}

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  /** Endereço temporário para o navegador baixar direto do depósito (só no Supabase). */
  signedUrl?(key: string, seconds: number): Promise<string>;
  /** Envio direto do navegador ao depósito (só no Supabase): não passa pelo limite de corpo da Vercel (4,5 MB). */
  signedUpload?(key: string): Promise<{ path: string; token: string }>;
  /** Apaga arquivos (o que não existir é ignorado). */
  remove?(keys: string[]): Promise<void>;
}

const FN = /^(ch_worker_[a-z_]+|app_[a-z0-9_]+)$/;

/** Metade de par substituto (UTF-16) sem a outra metade: o Postgres recusa em jsonb. Sem a marca "u": olha cada unidade. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Texto que o Postgres aceita (falha vista em produção, 2026-10-09: "unsupported Unicode escape sequence"). O Postgres recusa o
 * caractere nulo (U+0000) em text e jsonb, e metade solta de par substituto em jsonb; uma resposta de IA ou o texto de um PDF com
 * um deles derrubava a gravação da etapa inteira, e cada nova tentativa pagava a IA de novo. Tira o nulo e troca a metade solta
 * pelo sinal de substituição (U+FFFD), em qualquer profundidade (chaves dos objetos inclusive). Pares válidos (emoji, letras
 * matemáticas) e acentos ficam como estão; Date, Buffer e outros objetos que não são simples passam sem mudança. Não muda o valor
 * recebido: devolve uma cópia.
 */
export function safeForDb<T>(value: T): T {
  if (typeof value === "string") return value.replace(/\u0000/g, "").replace(LONE_SURROGATE, "\uFFFD") as T;
  if (Array.isArray(value)) return value.map((v) => safeForDb(v)) as T;
  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [safeForDb(k), safeForDb(v)])) as T;
  }
  return value;
}
const bearer = (req: Request) => (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim() || null;

export function devContentDb(getDb: () => Promise<DevDatabase>): ContentDb {
  return {
    mode: "dev",
    async service<T>(fn: string, args: Record<string, unknown> = {}) {
      if (!FN.test(fn)) throw new Error(`Função não permitida: ${fn}`);
      const db = await getDb();
      const keys = Object.keys(args);
      if (keys.some((k) => !/^p_[a-z0-9_]+$/.test(k))) throw new Error("Argumento inválido.");
      const r = await db.db.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => safeForDb(args[k])));
      return r.rows[0]?.result as T;
    },
    async asUser<T>(user: Identity, fn: string, args: Record<string, unknown> = {}) {
      return (await getDb()).core.rpc<T>(user, fn, safeForDb(args));
    },
    async authenticate(req) {
      return (await getDb()).userForToken(bearer(req));
    },
  };
}

export function supabaseContentDb(): ContentDb {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) {
    throw new Error("Central de Conteúdo sem Supabase configurado no servidor (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_ANON_KEY).");
  }
  const admin: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const unwrap = <T>(r: { data: unknown; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data as T;
  };
  return {
    mode: "supabase",
    async service<T>(fn: string, args: Record<string, unknown> = {}) {
      if (!FN.test(fn)) throw new Error(`Função não permitida: ${fn}`);
      return unwrap<T>(await admin.rpc(fn, safeForDb(args)));
    },
    async asUser<T>(user: Identity, fn: string, args: Record<string, unknown> = {}) {
      const client = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${user.jwt}` } }, auth: { persistSession: false } });
      return unwrap<T>(await client.rpc(fn, safeForDb(args)));
    },
    async authenticate(req) {
      const jwt = bearer(req);
      if (!jwt) return null;
      const { data } = await admin.auth.getUser(jwt);
      return data.user ? { id: data.user.id, email: data.user.email ?? null, jwt } : null;
    },
  };
}

export function localStorageDir(dir = process.env.CONTENT_HUB_STORAGE_DIR || path.join(process.cwd(), ".data/content-hub")): Storage {
  const full = (key: string) => {
    if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..")) throw new Error("Caminho de arquivo inválido.");
    return path.join(dir, key);
  };
  return {
    async put(key, data) {
      fs.mkdirSync(path.dirname(full(key)), { recursive: true });
      fs.writeFileSync(full(key), data);
      return key;
    },
    async get(key) {
      return fs.readFileSync(full(key));
    },
    async exists(key) {
      return fs.existsSync(full(key));
    },
    async remove(keys) {
      for (const key of keys) fs.rmSync(full(key), { force: true });
      for (const d of [...new Set(keys.map((k) => path.dirname(full(k))))]) {
        try {
          if (path.resolve(d).startsWith(path.resolve(dir) + path.sep) && fs.readdirSync(d).length === 0) fs.rmdirSync(d);
        } catch {
          // pasta já saiu ou não está vazia
        }
      }
    },
  };
}

/** Depósito privado da Central de Conteúdo (PDFs enviados e arquivos finais). */
export const CONTENT_HUB_BUCKET = "content-hub";

export function supabaseStorage(bucket = CONTENT_HUB_BUCKET): Storage {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Armazenamento sem Supabase configurado no servidor.");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  return {
    async put(key, data, contentType) {
      const { error } = await admin.storage.from(bucket).upload(key, data, { contentType, upsert: true });
      if (error) throw new Error(error.message);
      return key;
    },
    async get(key) {
      const { data, error } = await admin.storage.from(bucket).download(key);
      if (error || !data) throw new Error(error?.message ?? "Arquivo não encontrado.");
      return Buffer.from(await data.arrayBuffer());
    },
    async exists(key) {
      const dir = path.posix.dirname(key);
      const { data } = await admin.storage.from(bucket).list(dir === "." ? "" : dir, { search: path.posix.basename(key) });
      return Boolean(data?.some((f) => f.name === path.posix.basename(key)));
    },
    async signedUrl(key, seconds) {
      const { data, error } = await admin.storage.from(bucket).createSignedUrl(key, seconds);
      if (error || !data) throw new Error(error?.message ?? "Arquivo não encontrado.");
      return data.signedUrl;
    },
    async signedUpload(key) {
      const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(key, { upsert: true });
      if (error || !data) throw new Error(error?.message ?? "Não foi possível preparar o envio.");
      return { path: data.path, token: data.token };
    },
    async remove(keys) {
      if (!keys.length) return;
      const { error } = await admin.storage.from(bucket).remove(keys);
      if (error) throw new Error(error.message);
    },
  };
}
