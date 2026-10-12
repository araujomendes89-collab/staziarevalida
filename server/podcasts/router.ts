/**
 * Rotas /api/podcasts: podcasts a partir dos materiais da equipe (estilo NotebookLM), com revisão humana. Chaves de IA e de voz
 * ficam só aqui no servidor; quem decide o acesso é o banco (as ch_worker_podcast_* conferem a equipe pelo usuário; publicar é
 * só do administrador, pela app_admin_podcast_publish).
 *
 *   fontes    → PDF ou DOCX (com o Supabase, envio assinado direto ao depósito "podcasts", como nas aulas), texto colado, link
 *               (https, sem rede interna) ou uma aula → o servidor extrai, divide em TRECHOS com a origem (documento e página);
 *   roteiro   → a IA escolhida (Gemini, Claude ou OpenAI) recebe só os trechos e escreve ANA e BRUNO, cada fala citando os
 *               trechos; o servidor confere (trecho existe; número com unidade está no trecho) e o roteiro entra PARA REVISÃO;
 *   revisão   → editar, conferir e aprovar são da equipe (app_admin_podcast_save_script e _approve, chamadas pelo app);
 *   áudio     → só de roteiro aprovado, em PARTES para caber no tempo de uma função da Vercel:
 *               start (plano das partes) → part (cada parte vira MP3) → finish (junta, grava e registra o custo);
 *   ouvir     → link assinado (Supabase) ou o arquivo pelo servidor (desenvolvimento); aluno só ouve episódio publicado;
 *   Flashcast → copia o MP3 aprovado para a aula ligada ao episódio (vira o "Áudio Flashcast" da aula).
 */
import crypto from "crypto";
import path from "path";
import express, { type NextFunction, type Request, type Response } from "express";
import { localStorageDir, supabaseStorage, type ContentDb, type Identity, type Storage } from "../contentHub/infra";
import type { AiProvider, StructuredRequest } from "../contentHub/ai/provider";
import type { ModelRef } from "../ai/config";
import { aiChoices } from "../ai/maestro";
import { chunkPagesInfo, extractDocx, extractPdf, fetchLink, isPdf, isZip, MAX_SOURCE_BYTES, readLimited, TooBigError, type ExtractedPage } from "./extract";
import { loadComplementarTerms } from "../contentHub/complementarGuard";
import { holdFile, recordFileSha, SHA_WARNING } from "../contentHub/fileSha";
import { checkScript, generateScript, PODCAST_PROMPT_VERSION, type PodcastScript, type ScriptLine, type SourceChunk } from "./script";
import { DEFAULT_VOICES, geminiTtsEnabled, pcmToMp3, pickVoices, SAMPLE_RATE, silence, splitParts, synthesizePart, ttsCost, ttsStatus, VOICE_OPTIONS, type PodcastVoices, type TtsKind } from "./audio";

export const PODCASTS_BUCKET = "podcasts";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOB = /^[0-9a-f]{16}$/;
const AUDIO_LINK_SECONDS = 6 * 3600; // dá para ouvir o episódio inteiro e voltar trechos com o mesmo endereço
const MAX_TEXT_CHARS = 400_000;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const FILE_TYPES: Record<string, { ext: "pdf" | "docx"; magic: (b: Buffer) => boolean }> = {
  "application/pdf": { ext: "pdf", magic: isPdf },
  [DOCX]: { ext: "docx", magic: isZip },
};
const SCRIPT_KINDS = ["gemini", "anthropic", "openai", "ollama", "mock"];
const TTS_KINDS: TtsKind[] = ["openai", "gemini", "mock"]; // a OpenAI vem primeiro: é a voz padrão por enquanto (a do Gemini fica desligada por variável)
const TTS_LABEL: Record<TtsKind, string> = { gemini: "Gemini (duas vozes na mesma conversa)", openai: "OpenAI (uma voz por fala)", mock: "Simulação (silêncio, sem IA)" };

type Authed = Request & { user?: Identity };
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const forbidden = (error: unknown) => /restrito|sem acesso|administrador|42501|Acesso/i.test(message(error));
const httpError = (status: number, text: string) => Object.assign(new Error(text), { status });
const statusOf = (error: any, fallback = 400) => error?.status ?? (forbidden(error) ? 403 : /não encontrad/i.test(message(error)) ? 404 : fallback);

export interface PodcastsDeps {
  db: ContentDb;
  storage: Storage;
  /** Depósito das aulas: PDF da aula como fonte e cópia do MP3 como Flashcast. */
  lessons?: Storage;
  log?: (m: string) => void;
  /** Testes: links sem rede, endereço conferido e voz e roteiro simulados. */
  fetchImpl?: typeof fetch;
  checkHost?: (host: string) => Promise<void>;
  tts?: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv };
  mockScript?: (req: StructuredRequest) => unknown;
  /** Só para testes: cria o provedor de uma ref pelo maestro. */
  aiMaker?: (ref: ModelRef) => AiProvider | null;
}

/** Depósito dos podcasts: bucket privado "podcasts" no Supabase; pasta .data/podcasts no desenvolvimento. */
export function podcastsStorage(mode: ContentDb["mode"]): Storage {
  return mode === "supabase" ? supabaseStorage(PODCASTS_BUCKET) : localStorageDir(process.env.PODCASTS_STORAGE_DIR || path.join(process.cwd(), ".data/podcasts"));
}

interface AudioManifest {
  job: string;
  podcast: string;
  approved_at: string;
  provider: TtsKind;
  model: string | null;
  voices: PodcastVoices;
  parts: number[][];
  chars: number;
  created_by: string;
  created_at: string;
}

const normalizeLines = (lines: unknown): ScriptLine[] =>
  (Array.isArray(lines) ? lines : []).map((l: any): ScriptLine => ({
    speaker: l?.speaker === "BRUNO" ? "BRUNO" : "ANA",
    text: String(l?.text ?? "").trim(),
    style: String(l?.style ?? ""),
    sources: (Array.isArray(l?.sources) ? l.sources : []).map(Number).filter(Number.isInteger),
  })).filter((l) => l.text);

export function createPodcastsRouter(deps: PodcastsDeps | null, pending: string | null = null) {
  const router = express.Router();

  router.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!deps) return fail(res, 503, pending ?? "Podcasts sem servidor configurado.");
    try {
      const user = await deps.db.authenticate(req);
      if (!user) return fail(res, 401, "Entre na sua conta.");
      req.user = user;
      next();
    } catch (error) {
      fail(res, 500, message(error));
    }
  });
  const asUser = <T>(req: Authed, fn: string, args: Record<string, unknown> = {}) => deps!.db.asUser<T>(req.user!, fn, args);
  const service = <T>(fn: string, args: Record<string, unknown>) => deps!.db.service<T>(fn, args);
  const log = (m: string) => deps?.log?.(m);
  const removeQuietly = async (storage: Storage | undefined, keys: (string | null | undefined)[]) => {
    const list = keys.filter((k): k is string => Boolean(k));
    if (!storage?.remove || !list.length) return;
    try {
      await storage.remove(list);
    } catch (error) {
      log(`podcasts: não consegui apagar ${list.length} arquivo(s): ${message(error)}`);
    }
  };
  /**
   * Apaga do depósito os arquivos que ficaram sem uso (áudio que deixou de valer, fonte tirada, episódio apagado). Nunca apaga "na
   * hora": o banco RESERVA o caminho (ch_worker_podcast_files_pending: só devolve o que nenhuma linha usa e, enquanto a reserva vale,
   * recusa quem tentar criar referência a ele) e só então o servidor apaga e confirma (ch_worker_podcast_files_done). A fila é
   * única: qualquer evento (ou a rota de repetir) limpa o que ficou pendente de qualquer episódio, inclusive de episódio já apagado.
   * Só lança "Acesso restrito" (quem não é equipe); qualquer outra falha NÃO desfaz a operação principal. Não há varredura de arquivos antigos.
   * Banco sem a 9721 (site novo antes do SQL): não apaga nada (nada se perde) e devolve `note` em português, nunca sucesso silencioso.
   */
  const SQL_ANTIGO = "Os arquivos antigos NÃO foram apagados do depósito: a migração 9721 (limpeza de arquivos antigos) ainda não foi aplicada no banco. Nada se perdeu; eles aparecem na lista de arquivos esquecidos.";
  const SEM_LIMPEZA = "Os arquivos antigos ainda não foram apagados do depósito (a limpeza não terminou). Eles saem na próxima limpeza.";
  const releaseFiles = async (user: string): Promise<{ ok: boolean; failed: number; note?: string }> => {
    const out: { ok: boolean; failed: number; note?: string } = { ok: true, failed: 0 };
    try {
      if (!deps!.storage.remove) return out;
      for (let round = 0; round < 5; round++) {
        const pending = await service<Array<{ id: number; path: string }>>("ch_worker_podcast_files_pending", { p_user: user, p_podcast: null });
        if (!Array.isArray(pending) || !pending.length) break;
        const results: Array<{ id: number; ok: boolean; error?: string }> = [];
        for (const file of pending) {
          try {
            await deps!.storage.remove([file.path]);
            results.push({ id: file.id, ok: true });
          } catch (error) {
            log(`podcasts: não consegui apagar ${file.path}: ${message(error)}`);
            results.push({ id: file.id, ok: false, error: message(error) });
          }
        }
        await service("ch_worker_podcast_files_done", { p_user: user, p_results: results });
        const failed = results.filter((r) => !r.ok).length;
        out.failed += failed;
        if (failed || pending.length < 50) break;
      }
    } catch (error) {
      if (/Acesso restrito/i.test(message(error))) throw error; // a rota de repetir é só da equipe: quem não é equipe recebe 403
      if (/ch_worker_podcast_files_/.test(message(error)) && /could not find the function|schema cache|PGRST202|42883|does not exist/i.test(message(error))) {
        log("podcasts: a migração 9721 não está aplicada no banco; nenhum arquivo antigo foi apagado");
        return { ok: false, failed: 0, note: SQL_ANTIGO };
      }
      log(`podcasts: limpeza de arquivos antigos não terminou (fica para a próxima): ${message(error)}`);
      return { ok: false, failed: out.failed, note: SEM_LIMPEZA };
    }
    return out;
  };
  /** Custo de IA no mesmo livro-caixa do Tutor (sem contar como interação do aluno). */
  const ledger = async (user: string, entry: Record<string, unknown>) => {
    try {
      await service("ch_worker_tutor_ledger", { p_user: user, p_session_id: null, p_entry: entry });
    } catch (error) {
      log(`podcasts: registro de custo falhou: ${message(error)}`);
    }
  };

  /** Equipe (conferida no banco) e episódio existente: devolve a visão da equipe. */
  const staffPodcast = async (req: Authed) => {
    if (!ID.test(req.params.id)) throw httpError(400, "Episódio inválido.");
    return asUser<any>(req, "app_admin_podcast", { p_id: req.params.id });
  };

  /** Texto extraído → trechos com a origem → banco. Documento longo demais entra cortado e a equipe é avisada (campo `note`). */
  const ingest = async (req: Authed, source: Record<string, unknown>, pages: ExtractedPage[]) => {
    const info = chunkPagesInfo(pages);
    const chunks = info.chunks;
    const chars = chunks.reduce((n, c) => n + c.text.length, 0);
    if (chars < 80) {
      throw httpError(422, source.kind === "pdf" ? "O PDF não tem texto aproveitável (pode ser escaneado). Cole o texto ou passe o PDF pela Central de Conteúdo (OCR)." : "A fonte não tem texto aproveitável.");
    }
    // a contagem de páginas da fonte é a do que entrou de fato (não o total do arquivo)
    const numbered = info.truncated ? pages.filter((p) => p.page != null && p.page <= (info.lastPage ?? 0)).length : info.pagesTotal;
    const view = await service<any>("ch_worker_podcast_add_source", {
      p_user: req.user!.id,
      p_podcast: req.params.id,
      p_source: { ...source, pages: numbered || null },
      p_chunks: chunks,
    });
    log(`podcasts: fonte ${source.kind} no episódio ${req.params.id} (${chunks.length} trechos${info.truncated ? `, cortado de ${info.total}` : ""})`);
    if (!info.truncated) return view;
    const ate = info.lastPage != null ? ` (até a página ${info.lastPage} de ${info.pagesTotal})` : " (só o começo do texto)";
    const note = `Documento longo: entraram só os primeiros ${chunks.length} de ${info.total} trechos${ate}. O resto não foi usado. Divida o documento em partes menores para o podcast cobrir tudo.`;
    return { ...view, note };
  };
  /**
   * Fonte de arquivo (PDF/DOCX) com o SHA-256 gravado, FECHANDO POR SEGURANÇA (ver contentHub/fileSha.ts): a retenção do caminho
   * é pedida antes de registrar; se o SHA-256 não puder ser gravado (nem na nova tentativa), a fonte fica escondida do aluno e a
   * resposta traz o aviso em `note`.
   */
  const ingestFile = async (req: Authed, source: Record<string, unknown>, pages: ExtractedPage[], key: string, bytes: Buffer) => {
    await holdFile(deps!.db, key, log, "podcasts");
    let view: any;
    try {
      view = await ingest(req, source, pages);
    } catch (error) {
      await recordFileSha(deps!.db, key, async () => bytes, undefined, "podcasts").catch(() => false); // se o arquivo já existia, solta a retenção
      throw error;
    }
    if (!(await recordFileSha(deps!.db, key, async () => bytes, log, "podcasts"))) return { ...view, note: [view?.note, SHA_WARNING].filter(Boolean).join(" ") };
    return { ...((await staffPodcast(req).catch(() => null)) ?? view), ...(view?.note ? { note: view.note } : {}) }; // a visão volta sem a marca de retenção
  };
  const extractFile = (buf: Buffer, ext: "pdf" | "docx") => (ext === "pdf" ? extractPdf(buf) : extractDocx(buf));

  /** O que está pronto no servidor: IA do roteiro, vozes e as opções de voz. */
  router.get("/providers", async (req: Authed, res) => {
    try {
      await asUser(req, "app_admin_podcasts");
      const env = deps!.tts?.env ?? process.env;
      const tts = TTS_KINDS.filter((k) => k !== "mock" || env.NODE_ENV !== "production").map((k) => {
        const { technical, ...status } = ttsStatus(k, env); // o detalhe técnico fica no registro do servidor, não vai para a tela
        if (technical && k !== "mock" && (k !== "gemini" || geminiTtsEnabled(env))) log(`podcasts: voz ${k} indisponível: ${technical}`);
        return { label: TTS_LABEL[k], ...status, kind: k };
      });
      res.json({ script: await aiChoices(deps!.db), tts, voices: VOICE_OPTIONS, default_voices: DEFAULT_VOICES });
    } catch (error) {
      fail(res, statusOf(error, 500), message(error));
    }
  });

  // ------------------------------------------------------------------ fontes
  /** 1) Prepara o envio direto ao depósito (Supabase). Sem envio assinado (desenvolvimento): { mode: "direct" }. */
  router.post("/:id/sources/upload", async (req: Authed, res) => {
    try {
      const { content_type, size_bytes } = (req.body ?? {}) as Record<string, unknown>;
      const spec = FILE_TYPES[String(content_type)];
      if (!spec) throw httpError(415, "Envie um PDF ou um DOCX.");
      const size = Number(size_bytes);
      if (!Number.isFinite(size) || size <= 0) throw httpError(400, "Arquivo vazio.");
      if (size > MAX_SOURCE_BYTES) throw httpError(413, `Arquivo acima de ${MAX_SOURCE_BYTES / 1024 / 1024} MB.`);
      await staffPodcast(req);
      if (!deps!.storage.signedUpload) return res.json({ mode: "direct" });
      const key = `podcasts/${req.params.id}/src-${crypto.randomBytes(8).toString("hex")}.${spec.ext}`;
      const signed = await deps!.storage.signedUpload(key);
      res.json({ mode: "signed", bucket: PODCASTS_BUCKET, key, path: signed.path, token: signed.token });
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  /** 2) Confirma o envio direto: o arquivo precisa estar no depósito, no caminho deste episódio. */
  router.post("/:id/sources/confirm", async (req: Authed, res) => {
    try {
      const { key, title, content_type } = (req.body ?? {}) as Record<string, unknown>;
      const spec = FILE_TYPES[String(content_type)];
      if (!spec) throw httpError(415, "Envie um PDF ou um DOCX.");
      await staffPodcast(req);
      if (typeof key !== "string" || !new RegExp(`^podcasts/${req.params.id}/src-[0-9a-f]{16}\\.${spec.ext}$`).test(key)) throw httpError(400, "Caminho de arquivo inválido.");
      if (!(await deps!.storage.exists(key))) throw httpError(400, "O arquivo não chegou ao depósito. Envie de novo.");
      const buf = await deps!.storage.get(key);
      if (!spec.magic(buf)) throw httpError(415, "O conteúdo não corresponde ao tipo informado.");
      const pages = await extractFile(buf, spec.ext);
      const view = await ingestFile(req, { kind: spec.ext, title: String(title || "Documento").slice(0, 200), storage_path: key }, pages, key, buf);
      res.status(201).json(view);
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  /** Envio pelo servidor (desenvolvimento): corpo bruto, tipo no Content-Type, nome em X-File-Name. */
  const raw = express.raw({ type: Object.keys(FILE_TYPES), limit: `${MAX_SOURCE_BYTES / 1024 / 1024}mb` });
  router.post("/:id/sources/file", raw, async (req: Authed, res) => {
    try {
      const body = req.body as Buffer;
      const type = String(req.headers["content-type"] ?? "").split(";")[0].trim();
      const spec = FILE_TYPES[type];
      if (!spec) throw httpError(415, "Envie um PDF ou um DOCX.");
      if (!Buffer.isBuffer(body) || body.length === 0) throw httpError(400, "Arquivo vazio.");
      if (!spec.magic(body)) throw httpError(415, "O conteúdo não corresponde ao tipo informado.");
      await staffPodcast(req);
      const key = `podcasts/${req.params.id}/src-${crypto.createHash("sha256").update(body).digest("hex").slice(0, 16)}.${spec.ext}`;
      if (!(await deps!.storage.exists(key))) await deps!.storage.put(key, body, type);
      const pages = await extractFile(body, spec.ext);
      const name = decodeURIComponent(String(req.headers["x-file-name"] ?? "Documento")).slice(0, 200) || "Documento";
      const view = await ingestFile(req, { kind: spec.ext, title: name, storage_path: key }, pages, key, body);
      res.status(201).json(view);
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  router.post("/:id/sources/text", async (req: Authed, res) => {
    try {
      const text = String(req.body?.text ?? "").trim();
      if (text.length < 80) throw httpError(400, "Cole pelo menos um parágrafo (80 caracteres).");
      if (text.length > MAX_TEXT_CHARS) throw httpError(413, "Texto longo demais: até 400 mil caracteres por fonte.");
      await staffPodcast(req);
      const title = String(req.body?.title ?? "").trim().slice(0, 200) || "Texto colado";
      res.status(201).json(await ingest(req, { kind: "text", title }, [{ page: null, text }]));
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  router.post("/:id/sources/link", async (req: Authed, res) => {
    try {
      const url = String(req.body?.url ?? "").trim();
      if (!/^https:\/\/\S+$/i.test(url) || url.length > 2000) throw httpError(400, "Use um link https.");
      await staffPodcast(req);
      let fetched;
      try {
        fetched = await fetchLink(url, deps!.fetchImpl ?? fetch, deps!.checkHost);
      } catch (error) {
        throw httpError(422, message(error));
      }
      const title = String(req.body?.title ?? "").trim() || fetched.title || url;
      res.status(201).json(await ingest(req, { kind: "link", title: title.slice(0, 200), url }, fetched.pages));
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  /** Aula como fonte: título, tema, resumo, pontos-chave e o PDF complementar (se houver). */
  router.post("/:id/sources/lesson", async (req: Authed, res) => {
    try {
      const lessonId = String(req.body?.lesson_id ?? "");
      if (!ID.test(lessonId)) throw httpError(400, "Aula inválida.");
      await staffPodcast(req);
      const lesson = await service<any>("ch_worker_podcast_lesson", { p_user: req.user!.id, p_lesson: lessonId });
      if (!lesson) throw httpError(404, "Aula não encontrada.");
      const keyPoints: string[] = (lesson.key_points ?? []).filter((k: unknown) => typeof k === "string" && k.trim());
      const head = [
        `Aula: ${lesson.title}`,
        lesson.topic ? `Tema: ${lesson.topic}` : "",
        lesson.summary ? `Resumo e racionalidade clínica:\n${lesson.summary}` : "",
        keyPoints.length ? `Pontos-chave:\n${keyPoints.map((k) => `- ${k}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");
      const pages: ExtractedPage[] = [{ page: null, text: head }];
      let note: string | null = null;
      const limitMb = MAX_SOURCE_BYTES / 1024 / 1024;
      const tooBig = (bytes?: number) => `O PDF da aula (${bytes ? `${Math.round(bytes / 1024 / 1024)} MB` : `mais de ${limitMb} MB`}) passa do limite de ${limitMb} MB das fontes e não foi lido; entraram o resumo e os pontos-chave.`;
      if (lesson.slides && deps!.lessons) {
        // Não confia no tamanho informado no envio: o download para ao passar de 30 MB (e o tamanho guardado só evita baixar à toa).
        const declared = Number(lesson.slides_bytes) || 0;
        if (declared > MAX_SOURCE_BYTES) {
          note = tooBig(declared);
        } else {
          try {
            pages.push(...(await extractPdf(await readLimited(deps!.lessons, lesson.slides, MAX_SOURCE_BYTES, deps!.fetchImpl ?? fetch))));
          } catch (error) {
            note = error instanceof TooBigError ? tooBig() : `O PDF da aula não foi lido (${message(error)}); entraram o resumo e os pontos-chave.`;
          }
        }
      }
      const view = await ingest(req, { kind: "lesson", title: `Aula: ${lesson.title}`.slice(0, 200), lesson_id: lessonId }, pages);
      const notes = [view?.note, note].filter(Boolean).join(" ");
      res.status(201).json(notes ? { ...view, note: notes } : view);
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  /** Tirar uma fonte (o roteiro deixa de valer) e apagar o arquivo dela. */
  router.delete("/:id/sources/:sourceId", async (req: Authed, res) => {
    try {
      if (!ID.test(req.params.sourceId)) throw httpError(400, "Fonte inválida.");
      const before = await staffPodcast(req);
      const source = (before.sources ?? []).find((s: any) => s.id === req.params.sourceId);
      if (!source) throw httpError(404, "Fonte não encontrada.");
      const view = await asUser<any>(req, "app_admin_podcast_remove_source", { p_source_id: req.params.sourceId });
      const released = await releaseFiles(req.user!.id); // o arquivo da fonte (se nenhuma outra linha o usa) e o áudio que deixou de valer
      res.json(released.note ? { ...(view ?? {}), note: released.note } : view);
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  /** Renomear a fonte: é o nome que o aluno lê na transcrição (nome de arquivo aparece a ele como "Documento N"). */
  router.patch("/:id/sources/:sourceId", async (req: Authed, res) => {
    try {
      if (!ID.test(req.params.sourceId)) throw httpError(400, "Fonte inválida.");
      const title = String(req.body?.title ?? "").trim();
      if (!title || title.length > 200) throw httpError(400, "Dê um nome de 1 a 200 caracteres.");
      const before = await staffPodcast(req);
      if (!(before.sources ?? []).some((s: any) => s.id === req.params.sourceId)) throw httpError(404, "Fonte não encontrada.");
      res.json(await asUser(req, "app_admin_podcast_rename_source", { p_source_id: req.params.sourceId, p_title: title }));
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  // ------------------------------------------------------------------ roteiro
  const loadMaterial = async (req: Authed) => {
    const m = await service<any>("ch_worker_podcast_material", { p_user: req.user!.id, p_podcast: req.params.id });
    if (!m) throw httpError(404, "Episódio não encontrado.");
    const chunks: SourceChunk[] = (m.chunks ?? []).map((c: any) => ({ id: Number(c.id), source: String(c.source), doc: Number(c.doc), page: c.page ?? null, text: String(c.text) }));
    return { m, chunks };
  };

  /** Gera o roteiro com a IA escolhida. Entra para revisão: nunca aprovado. */
  router.post("/:id/script", async (req: Authed, res) => {
    try {
      const kind = String(req.body?.provider ?? "gemini");
      if (!SCRIPT_KINDS.includes(kind)) throw httpError(400, "Escolha uma das IAs da lista.");
      const notes = String(req.body?.notes ?? "").trim().slice(0, 1000) || null;
      await staffPodcast(req);
      const { m, chunks } = await loadMaterial(req);
      if (m.status === "published") throw httpError(409, "Despublique o episódio antes de gerar outro roteiro.");
      if (!chunks.length) throw httpError(409, "Adicione fontes com texto antes de gerar o roteiro.");
      const started = Date.now();
      // lista de fontes que o aluno não pode ver: sem ela o roteiro não é gerado (503), nunca segue sem conferência
      const terms = await loadComplementarTerms(deps!.db, undefined, log);
      let r;
      try {
        r = await generateScript({ terms, kind: kind as any, topic: m.topic || m.title, minutes: Number(m.target_minutes) || 8, chunks, notes, mockRespond: kind === "mock" ? deps!.mockScript : undefined, db: deps!.db, actorId: req.user!.id, podcastId: req.params.id, aiMaker: deps!.aiMaker });
      } catch (error: any) {
        throw httpError(error?.status ?? 502, `A IA do roteiro falhou: ${message(error)}`);
      }
      const simulated = kind === "mock";
      const meta = {
        provider: r.usage.provider, model: r.usage.model, prompt_version: PODCAST_PROMPT_VERSION, input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens,
        cost_usd: r.usage.cost_usd, calls: r.usage.calls, used_chunks: r.used_chunks, sent_chunks: r.sent_ids, total_chunks: chunks.length, warnings: r.warnings, notes, seconds: Math.round((Date.now() - started) / 1000), simulated,
      };
      const view = await service<any>("ch_worker_podcast_set_script", { p_user: req.user!.id, p_podcast: req.params.id, p_script: r.script, p_meta: meta });
      if (!simulated) {
        await ledger(req.user!.id, { feature: "podcast_script", provider: r.usage.provider, model: r.usage.model, input_text_tokens: r.usage.input_tokens, output_text_tokens: r.usage.output_tokens, estimated_cost_usd: r.usage.cost_usd, meta: { podcast_id: req.params.id, calls: r.usage.calls } });
      }
      log(`podcasts: roteiro ${simulated ? "simulado" : r.usage.model} no episódio ${req.params.id} (${r.script.lines.length} falas, ${r.warnings.length} avisos)`);
      const released = await releaseFiles(req.user!.id); // o áudio do roteiro anterior deixou de valer
      res.json({ podcast: view, warnings: r.warnings, ...(released.note ? { note: released.note } : {}) });
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  /** Confere de novo o roteiro atual (depois de editar): trecho citado existe e número com unidade está no trecho. Sem IA. */
  router.get("/:id/script/check", async (req: Authed, res) => {
    try {
      const view = await staffPodcast(req);
      const { m, chunks } = await loadMaterial(req);
      const lines = normalizeLines(m.script?.lines);
      if (!lines.length) return res.json({ warnings: [] });
      const script: PodcastScript = { lines, missing: m.script?.missing ?? [] };
      const all = new Map(chunks.map((c) => [c.id, c]));
      // roteiro gerado pela IA: só os trechos que ela recebeu valem como citação (guardados na geração e mantidos nas edições);
      // roteiro antigo, sem essa lista, aceita todos os trechos do episódio
      const sent: unknown = view?.script_meta?.sent_chunks;
      const valid = Array.isArray(sent) ? new Map(chunks.filter((c) => (sent as unknown[]).map(Number).includes(c.id)).map((c) => [c.id, c])) : all;
      res.json({ warnings: checkScript(script, valid, all, await loadComplementarTerms(deps!.db, undefined, log)) });
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  // ------------------------------------------------------------------ áudio (em partes)
  const manifestKey = (podcast: string, job: string) => `podcasts/${podcast}/tmp/${job}/manifest.json`;
  const partsInFlight = new Map<string, Promise<number>>();
  const PART_LOCK_STALE_MS = 150_000; // marcador "em geração" mais velho que isso é de uma chamada que morreu
  const PART_WAIT_MS_MAX = 100_000;
  const PART_POLL_MS = Number(process.env.PODCASTS_PART_POLL_MS) || 1000;
  const partKey = (podcast: string, job: string, i: number, ext: "mp3" | "json" | "lock") => `podcasts/${podcast}/tmp/${job}/part-${i}.${ext}`;

  /** A geração em andamento, conferida contra o roteiro aprovado de agora (se mudou, para). */
  const currentJob = async (req: Authed) => {
    const job = String(req.body?.job ?? "");
    if (!JOB.test(job)) throw httpError(400, "Geração de áudio inválida.");
    const key = manifestKey(req.params.id, job);
    if (!(await deps!.storage.exists(key))) throw httpError(404, "Geração de áudio não encontrada. Comece de novo.");
    const manifest = JSON.parse((await deps!.storage.get(key)).toString("utf8")) as AudioManifest;
    const now = await service<any>("ch_worker_podcast_audio_job", { p_user: req.user!.id, p_podcast: req.params.id });
    if (String(now.approved_at) !== String(manifest.approved_at)) throw httpError(409, "O roteiro mudou depois que o áudio começou. Gere o áudio de novo.");
    return { manifest, lines: normalizeLines(now.lines), oldAudio: now.old_audio as string | null };
  };

  router.post("/:id/audio/start", async (req: Authed, res) => {
    try {
      const kind = String(req.body?.provider ?? "openai") as TtsKind;
      if (!TTS_KINDS.includes(kind)) throw httpError(400, "Escolha a voz da OpenAI ou do Gemini.");
      await staffPodcast(req);
      const st = ttsStatus(kind, deps!.tts?.env);
      if (!st.ready) {
        if (st.technical) log(`podcasts: voz ${kind} recusada: ${st.technical}`);
        throw httpError(503, `Voz indisponível: ${st.pending}`);
      }
      const job = await service<any>("ch_worker_podcast_audio_job", { p_user: req.user!.id, p_podcast: req.params.id });
      const lines = normalizeLines(job.lines);
      if (lines.length < 2) throw httpError(409, "O roteiro aprovado está vazio.");
      const manifest: AudioManifest = {
        job: crypto.randomBytes(8).toString("hex"),
        podcast: req.params.id,
        approved_at: String(job.approved_at),
        provider: kind,
        model: st.model,
        voices: pickVoices(kind, req.body?.voices),
        parts: splitParts(lines),
        chars: lines.reduce((n, l) => n + l.text.length, 0),
        created_by: req.user!.id,
        created_at: new Date().toISOString(),
      };
      await deps!.storage.put(manifestKey(req.params.id, manifest.job), Buffer.from(JSON.stringify(manifest)), "application/json");
      res.json({ job: manifest.job, parts: manifest.parts.length, provider: kind, model: st.model, voices: manifest.voices, lines: lines.length });
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  /** Uma parte: algumas falas viram voz (PCM) e depois MP3, com uma pausa curta no fim. */
  router.post("/:id/audio/part", async (req: Authed, res) => {
    try {
      await staffPodcast(req);
      const { manifest, lines } = await currentJob(req);
      const index = Number(req.body?.index);
      if (!Number.isInteger(index) || index < 0 || index >= manifest.parts.length) throw httpError(400, "Parte inválida.");
      const partLines = manifest.parts[index].map((i) => lines[i]).filter(Boolean);
      if (partLines.length !== manifest.parts[index].length) throw httpError(409, "O roteiro mudou depois que o áudio começou. Gere o áudio de novo.");
      const id = req.params.id;
      const body = (seconds: number) => ({ index, parts: manifest.parts.length, seconds: Math.round(seconds) });
      // Parte já gerada neste trabalho (o navegador tentou de novo porque a resposta se perdeu): devolve a guardada, sem chamar a voz
      // (e sem cobrar) outra vez. O MP3 é gravado por último: se ele existe, o registro .json (segundos) já existe.
      const saved = async (): Promise<number | null> => {
        try {
          if (!(await deps!.storage.exists(partKey(id, manifest.job, index, "mp3")))) return null;
          const seconds = Number(JSON.parse((await deps!.storage.get(partKey(id, manifest.job, index, "json"))).toString("utf8"))?.seconds);
          return Number.isFinite(seconds) ? seconds : null; // registro ilegível: gera a parte de novo
        } catch {
          return null;
        }
      };
      const ready = await saved();
      if (ready != null) {
        log(`podcasts: parte ${index + 1} do episódio ${id} já estava pronta; não chamei a voz de novo`);
        return res.json(body(ready));
      }
      // Duas chamadas ao mesmo tempo para a mesma parte: a segunda espera a primeira (nesta instância, pela promessa em andamento;
      // em outra instância, pelo marcador "em geração" gravado ANTES de chamar a voz) em vez de chamar e cobrar a voz de novo.
      const flight = `${id}:${manifest.job}:${index}`;
      const running = partsInFlight.get(flight);
      if (running) return res.json(body(await running));
      const lockKey = partKey(id, manifest.job, index, "lock");
      const lockedBy = async () => {
        if (!(await deps!.storage.exists(lockKey))) return false;
        try {
          return Date.now() - Number(JSON.parse((await deps!.storage.get(lockKey)).toString("utf8"))?.at) < PART_LOCK_STALE_MS;
        } catch {
          return false;
        }
      };
      if (await lockedBy()) {
        const limit = Date.now() + PART_WAIT_MS_MAX;
        while (Date.now() < limit) {
          await new Promise((r) => setTimeout(r, PART_POLL_MS));
          const again = await saved();
          if (again != null) return res.json(body(again));
          if (!(await lockedBy())) break; // a outra chamada falhou ou parou: esta gera a parte
        }
        const late = await saved();
        if (late != null) return res.json(body(late));
      }
      const work = (async () => {
        await deps!.storage.put(lockKey, Buffer.from(JSON.stringify({ at: Date.now() })), "application/json");
        try {
          let pcm: Buffer;
          try {
            pcm = Buffer.concat([await synthesizePart(manifest.provider, partLines, manifest.voices, deps!.tts), silence(320)]);
          } catch (error: any) {
            log(`podcasts: voz falhou na parte ${index + 1} do episódio ${id}: ${error?.technical ?? message(error)}`);
            throw httpError(error?.status ?? 502, `A voz falhou na parte ${index + 1}: ${message(error)}`);
          }
          const mp3 = await pcmToMp3(pcm);
          const seconds = pcm.length / 2 / SAMPLE_RATE;
          await deps!.storage.put(partKey(id, manifest.job, index, "json"), Buffer.from(JSON.stringify({ seconds, bytes: mp3.length })), "application/json");
          await deps!.storage.put(partKey(id, manifest.job, index, "mp3"), mp3, "audio/mpeg"); // por último: marca a parte como pronta
          return seconds;
        } finally {
          await removeQuietly(deps!.storage, [lockKey]);
        }
      })();
      partsInFlight.set(flight, work);
      try {
        res.json(body(await work));
      } finally {
        partsInFlight.delete(flight);
      }
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  /** Junta as partes (quadros MP3 em sequência), grava o episódio e registra o custo da voz. */
  router.post("/:id/audio/finish", async (req: Authed, res) => {
    let newKey: string | null = null;
    try {
      await staffPodcast(req);
      const { manifest } = await currentJob(req);
      const id = req.params.id;
      const pieces: Buffer[] = [];
      let seconds = 0;
      for (let i = 0; i < manifest.parts.length; i++) {
        const key = partKey(id, manifest.job, i, "mp3");
        if (!(await deps!.storage.exists(key))) throw httpError(409, `Falta a parte ${i + 1} de ${manifest.parts.length}.`);
        pieces.push(await deps!.storage.get(key));
        seconds += Number(JSON.parse((await deps!.storage.get(partKey(id, manifest.job, i, "json"))).toString("utf8")).seconds) || 0;
      }
      const audio = Buffer.concat(pieces);
      newKey = `podcasts/${id}/audio-${crypto.randomBytes(8).toString("hex")}.mp3`;
      await deps!.storage.put(newKey, audio, "audio/mpeg");
      const simulated = manifest.provider === "mock";
      const cost = ttsCost(manifest.provider, seconds, deps!.tts?.env);
      const view = await service<any>("ch_worker_podcast_set_audio", {
        p_user: req.user!.id,
        p_podcast: id,
        p_audio: { path: newKey, bytes: audio.length, seconds: Math.round(seconds), meta: { provider: manifest.provider, model: manifest.model, voices: manifest.voices, parts: manifest.parts.length, chars: manifest.chars, cost_usd: cost, job: manifest.job, simulated } },
      });
      if (!simulated) {
        await ledger(req.user!.id, { feature: "podcast_tts", provider: manifest.provider, model: manifest.model, duration_seconds: Math.round(seconds), characters: manifest.chars, estimated_cost_usd: cost, meta: { podcast_id: id, job: manifest.job } });
      }
      const tmp = manifest.parts.flatMap((_, i) => [partKey(id, manifest.job, i, "mp3"), partKey(id, manifest.job, i, "json"), partKey(id, manifest.job, i, "lock")]);
      await removeQuietly(deps!.storage, [...tmp, manifestKey(id, manifest.job)]);
      const released = await releaseFiles(req.user!.id); // o áudio anterior (a fila só o apaga se nenhuma linha do banco o usa)
      log(`podcasts: áudio pronto no episódio ${id} (${Math.round(seconds)} s, ${manifest.provider})`);
      res.json(released.note ? { ...(view ?? {}), note: released.note } : view);
    } catch (error) {
      if (newKey) await removeQuietly(deps?.storage, [newKey]);
      fail(res, statusOf(error), message(error));
    }
  });

  /**
   * Repetir a limpeza da fila inteira (qualquer episódio, inclusive já apagado). Só a equipe (o banco confere pela conta). Declarada
   * ANTES das rotas por episódio. Se a 9721 não está aplicada, diz isso em vez de responder sucesso.
   */
  router.post("/files/cleanup", async (req: Authed, res) => {
    try {
      const released = await releaseFiles(req.user!.id);
      res.json(released.ok ? { ok: true, ...(released.failed ? { falhas: released.failed } : {}) } : { ok: false, note: released.note });
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  /** A tela chama depois de editar o roteiro (a edição é feita direto no banco): apaga o áudio que deixou de valer. */
  router.post("/:id/files/cleanup", async (req: Authed, res) => {
    try {
      await staffPodcast(req);
      const released = await releaseFiles(req.user!.id);
      res.json(released.ok ? { ok: true, ...(released.failed ? { falhas: released.failed } : {}) } : { ok: false, note: released.note });
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  // ------------------------------------------------------------------ ouvir
  const audioPath = async (req: Authed) => {
    if (!ID.test(req.params.id)) throw httpError(400, "Episódio inválido.");
    const p = await service<string | null>("ch_worker_podcast_audio_path", { p_user: req.user!.id, p_podcast: req.params.id });
    if (!p) throw httpError(404, "Áudio não disponível.");
    return p;
  };

  /** Endereço para tocar: assinado (Supabase) ou nulo (o app baixa por /file). Aluno: só episódio publicado. */
  router.get("/:id/audio/link", async (req: Authed, res) => {
    try {
      const p = await audioPath(req);
      res.json({ url: deps!.storage.signedUrl ? await deps!.storage.signedUrl(p, AUDIO_LINK_SECONDS) : null });
    } catch (error) {
      fail(res, statusOf(error, 404), message(error));
    }
  });

  /** Arquivo pelo servidor (desenvolvimento). */
  router.get("/:id/audio/file", async (req: Authed, res) => {
    try {
      const data = await deps!.storage.get(await audioPath(req));
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "private, no-store");
      res.send(data);
    } catch (error) {
      fail(res, statusOf(error, 404), message(error));
    }
  });

  // ------------------------------------------------------------------ Flashcast da aula (só administrador, confirmado, episódio publicado)
  router.post("/:id/flashcast", async (req: Authed, res) => {
    let copied: string | null = null;
    try {
      if (!deps!.lessons) throw httpError(503, "Depósito das aulas indisponível.");
      const before = await staffPodcast(req);
      // Só o administrador (conferido no banco), com a confirmação dele, e só de episódio publicado: o aluno passa a ouvir a aula.
      if (req.body?.confirm !== true) throw httpError(400, "Confirme (confirm: true) que o áudio vai virar o Flashcast da aula, trocando o que ela já tem.");
      if (before?.status !== "published") throw httpError(409, "O Flashcast só pode ser copiado de um episódio publicado.");
      const f = await service<any>("ch_worker_podcast_flashcast", { p_user: req.user!.id, p_podcast: req.params.id });
      const lessonId = String(req.body?.lesson_id || f.lesson_id || "");
      if (!ID.test(lessonId)) throw httpError(400, "Ligue o episódio a uma aula antes.");
      const audio = await deps!.storage.get(f.audio_path);
      copied = `lessons/${lessonId}/flashcast-${crypto.randomBytes(8).toString("hex")}.mp3`;
      await deps!.lessons.put(copied, audio, "audio/mpeg");
      const lesson = await asUser(req, "app_admin_lesson_material", {
        p_lesson_id: lessonId,
        p_material: { kind: "flashcast", title: `Flashcast: ${f.title}`.slice(0, 200), storage_path: copied, content_type: "audio/mpeg", size_bytes: audio.length },
      });
      res.status(201).json({ lesson });
    } catch (error) {
      if (copied) await removeQuietly(deps?.lessons, [copied]);
      fail(res, statusOf(error), message(error));
    }
  });

  // ------------------------------------------------------------------ apagar (só administrador)
  router.delete("/:id", async (req: Authed, res) => {
    try {
      if (!ID.test(req.params.id)) throw httpError(400, "Episódio inválido.");
      await asUser(req, "app_admin_delete_podcast", { p_id: req.params.id });
      const released = await releaseFiles(req.user!.id); // áudio e arquivos das fontes do episódio apagado
      res.json({ deleted: true, ...(released.note ? { aviso: released.note } : {}) });
    } catch (error) {
      fail(res, statusOf(error), message(error));
    }
  });

  return router;
}
