/**
 * Apoio dos testes do motor de questões parecidas. Tudo aqui parte de dado REAL (perfis da revisão em fixtures/similaridade,
 * questões da carga do repositório); só a infraestrutura é simulada.
 */
import fs from "fs";
import path from "path";
import type { Candidate } from "../../../server/contentHub/similarity/engine";

export const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/similaridade/revisao-questoes");

export interface PerfilReal {
  id: string;
  tema: string | null;
  subtema: string | null;
  confianca: number | null;
  perfil: {
    competencia: string | null; cenario: string | null; problema_central: string | null; conceitos: string[];
    achados_discriminatorios: string[]; raciocinio_cobrado: string | null; tipo: string | null; complexidade: number | null;
  };
}

/** Os perfis reais da cópia (Revalida 2021 e 2022/2). */
export function perfisReais(): PerfilReal[] {
  const out: PerfilReal[] = [];
  for (const prova of fs.readdirSync(FIXTURE_DIR).sort()) {
    for (const f of fs.readdirSync(path.join(FIXTURE_DIR, prova)).filter((x) => x.endsWith(".json")).sort()) {
      out.push(...(JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, prova, f), "utf8")) as PerfilReal[]));
    }
  }
  return out;
}

export const slug = (s: string | null | undefined) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/**
 * Nó de taxonomia SÓ PARA TESTE, derivado do tema e do subtema reais (a Taxonomia Médica Oficial ainda não existe):
 * teste-<raiz>.<tema>.<subtema>; o pai é teste-<raiz>.<tema>.
 */
export function taxonomiaDeTeste(raiz: string, tema: string | null, subtema: string | null): { no: string; pai: string } {
  const pai = `teste-${slug(raiz) || "area"}.${slug(tema) || "sem-tema"}`;
  return { no: subtema && slug(subtema) ? `${pai}.${slug(subtema)}` : pai, pai: subtema && slug(subtema) ? pai : `teste-${slug(raiz) || "area"}` };
}

/** Vetor de teste: saco de palavras do texto REAL espalhado por hash em 768 posições, normalizado. Não é modelo nenhum. */
export function vetorDoTexto(text: string, dims = 768): number[] {
  const v = new Array<number>(dims).fill(0);
  for (const w of text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2)) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619) >>> 0;
    v[h % dims] += 1;
  }
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

export const cosseno = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

/** O perfil real no formato que o motor recebe do banco (sem enunciado; o nó da taxonomia é o de teste, quando pedido). */
export function ladoDoPerfil(e: PerfilReal, opts: { taxonomia?: boolean; via?: string[] } = {}): Candidate {
  const t = taxonomiaDeTeste("revisao", e.tema, e.subtema);
  return {
    id: e.id, area: null, topic: null, subtopic: null, tema: e.tema, subtema: e.subtema,
    taxonomy_node_id: opts.taxonomia ? t.no : null, taxonomy_parent_id: opts.taxonomia ? t.pai : null,
    competencia: e.perfil.competencia ?? null, cenario: e.perfil.cenario ?? null, problema_central: e.perfil.problema_central || null,
    conceitos: e.perfil.conceitos ?? [], achados: e.perfil.achados_discriminatorios ?? [], raciocinio: e.perfil.raciocinio_cobrado || null,
    tipo: e.perfil.tipo ?? null, complexidade: e.perfil.complexidade ?? null, confianca: e.confianca == null ? null : e.confianca / 100,
    fonte: "perfil", perfil_desatualizado: false, text_hash: null, group_id: null, statement: "",
    via: opts.via ?? ["taxonomia"], lex: null, cos_t: null, cos_c: null,
  };
}
