/**
 * CÉREBRO DO TUTOR — indexador do conhecimento aprovado (tutor_kb_trechos + vetores). Roda no banco local agora
 * (scripts/conhecimento/indexar.ts) e, SÓ com ordem do dono, no processamento (Cloud Run) a cada 10 minutos.
 *
 * Ordem: para cada tipo, lista as origens aprovadas que faltam (ch_worker_tutor_kb_origens), limpa o texto (limpeza.ts), corta em
 * trechos (pedacos.ts) e grava (ch_worker_tutor_kb_gravar: o BANCO reconfere o portão de aprovação). Depois copia os vetores que a
 * Central já tem para as fontes (sem custo), gera os que faltam (gemini-embedding-2, 768) e os vetores dos rótulos (enunciados e
 * temas, para o material da abertura) e, por fim, limpa o que deixou de valer.
 *
 * Nunca lê roteiro do ator, checklist, pressões ou cena do médico (o banco nem devolve esses campos), questões de fixação,
 * practice_questions das atualizações, rascunhos ou documentos em revisão. Mapas mentais (arquivos do app) só entram com aprovação
 * humana registrada no arquivo (revisao.aprovacao_humana); hoje os 12 estão "pré-revisado por agente" e ficam fora.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadComplementarTerms } from "../../contentHub/complementarGuard";
import type { Embedder } from "../../contentHub/embeddings";
import type { ContentDb } from "../../contentHub/infra";
import { limparTexto } from "./limpeza";
import { trechosDe } from "./pedacos";
import { TIPOS, type MetaOrigem, type TipoConhecimento, type TrechoNovo } from "./tipos";

type Db = Pick<ContentDb, "service">;
type Origem = Record<string, any> & { origem_id: string; versao: string };

export interface Relato {
  tipos: Record<string, { origens: number; gravadas: number; recusadas: number; trechos: number; comandosRetirados: number }>;
  vetores: { copiados: number; gerados: number; tokens: number; custoUsd: number; erros: string[] };
  rotulos: { gerados: number; erros: string[] };
  limpeza: Record<string, number> | null;
  ms: number;
}

const txt = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const juntar = (...xs: unknown[]) => xs.map(txt).map((s) => s.trim()).filter(Boolean).join("\n");

/** Itens de uma lista que pode vir como strings ou objetos {t|text|texto|titulo|itens}. */
function textoDeItens(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(textoDeItens).filter(Boolean).join("\n");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return [o.titulo, o.rotulo, o.t, o.text, o.texto, o.task, o.tarefa, o.descricao].map(textoDeItens).filter(Boolean).join(": ") + (o.itens ? `\n${textoDeItens(o.itens)}` : "");
  }
  return String(v);
}

/** Primeira fonte citada de uma questão, como texto curto ("Título · órgão, ano, p. X"). */
function fonteDaQuestao(fontes: unknown): string {
  const f = Array.isArray(fontes) ? (fontes[0] as Record<string, unknown> | undefined) : undefined;
  if (!f || typeof f !== "object") return "";
  const t = [f.title, f.organ ?? f.organization].map(txt).filter(Boolean).join(" · ");
  return [t, txt(f.year), f.page ? `p. ${txt(f.page)}` : ""].filter(Boolean).join(", ");
}

/** Trechos + metadados de uma origem, por tipo. Devolve null se não sobrou texto. */
export function montarOrigem(tipo: TipoConhecimento, o: Origem, termos: readonly string[]): { meta: MetaOrigem; trechos: TrechoNovo[]; comandos: number } | null {
  let comandos = 0;
  const limpo = (s: unknown) => {
    const r = limparTexto(txt(s), termos);
    comandos += r.comandos;
    return r.texto;
  };
  const trechos: TrechoNovo[] = [];
  let meta: MetaOrigem;
  switch (tipo) {
    case "fonte": {
      const titulo = [txt(o.titulo), txt(o.orgao)].filter(Boolean).join(" · ").slice(0, 300);
      meta = { titulo, ano: o.ano ?? null, grupo: txt(o.grupo), nivel: "oficial" };
      trechos.push(...trechosDe(titulo, txt(o.secao) || null, limpo(o.texto), o.pagina ?? null));
      break;
    }
    case "aula": {
      const titulo = `Aula StaziaMed: ${txt(o.titulo)}`.slice(0, 300);
      meta = { titulo, ano: o.ano ?? null, area: o.area ?? null, grupo: txt(o.grupo), tema_ids: (o.tema_ids ?? []).map(String), nivel: "oficial" };
      for (const s of (o.secoes ?? []) as { titulo?: string; paragrafos?: string[] }[]) {
        trechos.push(...trechosDe(titulo, txt(s.titulo).slice(0, 300) || null, limpo((s.paragrafos ?? []).join("\n\n"))));
      }
      break;
    }
    case "atualizacao": {
      const titulo = `Atualização: ${txt(o.titulo)}${o.instituicao ? `, ${txt(o.instituicao)}` : ""}`.slice(0, 300);
      meta = { titulo, ano: o.ano ?? null, area: o.area ?? null, grupo: txt(o.grupo), nivel: "oficial" };
      const partes: [string, unknown][] = [
        ["Conduta atual", o.conduta], ["Como era antes", o.antes], ["Impacto clínico", o.impacto_clinico], ["Impacto na prova", o.impacto_prova],
        ["Armadilha", o.armadilha], ["Linha do tempo", textoDeItens(o.linha_do_tempo)],
      ];
      for (const [secao, t] of partes) trechos.push(...trechosDe(titulo, secao, limpo(t)));
      break;
    }
    case "questao": {
      const titulo = `Questão ${txt(o.prova)}${o.numero ? ` nº ${o.numero}` : ""}`.slice(0, 300);
      meta = { titulo, ano: o.ano ?? null, area: o.area ?? null, grupo: txt(o.grupo), tema_ids: (o.tema_ids ?? []).map(String), nivel: txt(o.nivel) || "ia" };
      const caso = limpo(o.enunciado);
      const corpo = juntar(
        `Caso: ${caso.length > 300 ? `${caso.slice(0, 300).replace(/\s+\S*$/, "")}…` : caso}`,
        o.correta ? `Resposta correta: ${txt(o.correta)}) ${limpo(o.texto_correta)}` : "",
        o.explicacao_correta ? `Explicação: ${limpo(o.explicacao_correta)}` : "",
        o.conduta ? `Conduta esperada: ${limpo(o.conduta)}` : "",
        fonteDaQuestao(o.fontes) ? `Fonte citada na questão: ${limpo(fonteDaQuestao(o.fontes))}` : "",
      );
      trechos.push(...trechosDe(titulo, "Explicação da questão", corpo));
      break;
    }
    case "flashcard": {
      const titulo = `Flashcard StaziaMed: ${txt(o.tema)}`.slice(0, 300);
      meta = { titulo, ano: o.ano ?? null, area: o.area ?? null, grupo: txt(o.grupo), nivel: "oficial" };
      trechos.push(...trechosDe(titulo, null, juntar(`Pergunta: ${limpo(o.frente)}`, `Resposta: ${limpo(o.verso)}`, o.mnemonico ? `Para lembrar: ${limpo(o.mnemonico)}` : "")));
      break;
    }
    case "estacao": {
      // só a PORTA: nome, tema, área, cenário e tarefas do candidato (o banco não devolve mais nada da estação)
      const titulo = `Estação: ${txt(o.titulo)}`.slice(0, 300);
      meta = { titulo, area: o.area ?? null, grupo: txt(o.grupo), nivel: "oficial", plano_minimo: o.pro ? "pro" : null };
      trechos.push(...trechosDe(titulo, "O que o candidato vê na porta", juntar(o.tema ? `Tema: ${limpo(o.tema)}` : "", o.cenario ? `Cenário: ${limpo(o.cenario)}` : "", o.tarefas ? `Tarefas: ${limpo(textoDeItens(o.tarefas))}` : "")));
      break;
    }
    case "mapa": {
      const titulo = `Mapa mental StaziaMed: ${txt(o.titulo)}`.slice(0, 300);
      meta = { titulo, ano: o.ano ?? null, area: o.area ?? null, grupo: txt(o.grupo), nivel: "humana" };
      for (const ramo of (o.ramos ?? []) as Record<string, unknown>[]) {
        trechos.push(...trechosDe(titulo, txt(ramo.titulo) || null, limpo(juntar(textoDeItens((ramo.revisao as Record<string, unknown> | undefined)?.itens), textoDeItens(ramo.aprofundado)))));
      }
      trechos.push(...trechosDe(titulo, "Pontos-chave e atenção", limpo(juntar(textoDeItens(o.pontos_chave), textoDeItens(o.atencao)))));
      break;
    }
  }
  // partes numeradas na ordem; no máximo 400 por origem
  return trechos.length ? { meta: meta!, trechos: trechos.slice(0, 400), comandos } : null;
}

/** Mapas mentais (arquivos do app) que têm aprovação humana registrada. */
export function lerMapas(dir: string): Origem[] {
  if (!fs.existsSync(dir)) return [];
  const out: Origem[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^GR-.*\.json$/.test(x)).sort()) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const ap = j?.revisao?.aprovacao_humana;
      if (!ap || (typeof ap === "object" && !ap.por && !ap.aprovado && !ap.em)) continue; // sem aprovação humana: fora
      const versao = createHash("sha256").update(JSON.stringify({ r: j.ramos, p: j.pontos_chave, a: j.atencao, rev: j.revisao })).digest("hex").slice(0, 32);
      out.push({ origem_id: String(j.slug || j.codigo || f), versao, grupo: String(j.codigo || f), titulo: j.titulo, area: j.area ?? null, ramos: j.ramos, pontos_chave: j.pontos_chave, atencao: j.atencao, ano: Number(String(j.revisao?.gerado_em ?? "").slice(0, 4)) || null });
    } catch {
      // arquivo ilegível: fica fora
    }
  }
  return out;
}

export interface OpcoesIndexador {
  embedder?: Embedder | null;
  tipos?: TipoConhecimento[];
  /** pasta dos mapas mentais (padrão: src/novo/app/mapas/dados) */
  dirMapas?: string | null;
  /** refaz todas as origens (não só as que mudaram) */
  todas?: boolean;
  /** máximo de vetores gerados nesta rodada (custo) */
  maxVetores?: number;
  log?: (m: string) => void;
  /** pausa entre lotes de vetores (cota do Google) */
  pausaMs?: number;
}

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sincronizar(db: Db, o: OpcoesIndexador = {}): Promise<Relato> {
  const t0 = Date.now();
  const log = o.log ?? (() => undefined);
  const termos = await loadComplementarTerms(db, undefined, log); // sem a lista, para (nada entra sem a conferência da apostila)
  const rel: Relato = { tipos: {}, vetores: { copiados: 0, gerados: 0, tokens: 0, custoUsd: 0, erros: [] }, rotulos: { gerados: 0, erros: [] }, limpeza: null, ms: 0 };
  const tipos = o.tipos ?? [...TIPOS];
  const dirMapas = o.dirMapas === undefined ? path.resolve(process.cwd(), "src/novo/app/mapas/dados") : o.dirMapas;
  const mapas = dirMapas ? lerMapas(dirMapas) : [];

  for (const tipo of tipos) {
    const r = (rel.tipos[tipo] = { origens: 0, gravadas: 0, recusadas: 0, trechos: 0, comandosRetirados: 0 });
    const grava = async (or: Origem) => {
      r.origens++;
      const m = montarOrigem(tipo, or, termos);
      const trechos = m?.trechos ?? [];
      r.comandosRetirados += m?.comandos ?? 0;
      const res = await db.service<{ ok: boolean; trechos?: number; motivo?: string }>("ch_worker_tutor_kb_gravar", {
        p_tipo: tipo, p_origem: String(or.origem_id), p_versao: String(or.versao), p_meta: m?.meta ?? { titulo: "-" },
        p_trechos: trechos.map((t) => ({ texto: t.texto, secao: t.secao ?? null, pagina: t.pagina ?? null, hash: t.hash })),
      });
      if (res?.ok) { r.gravadas++; r.trechos += res.trechos ?? 0; } else r.recusadas++;
    };
    if (tipo === "mapa") {
      for (const mp of mapas) await grava(mp);
      continue;
    }
    let depois = "";
    for (;;) {
      const lote = await db.service<Origem[]>("ch_worker_tutor_kb_origens", { p_tipo: tipo, p_limite: 100, p_depois: depois, p_todas: Boolean(o.todas) });
      if (!lote?.length) break;
      for (const or of lote) await grava(or);
      depois = String(lote[lote.length - 1].origem_id);
      if (lote.length < 100) break;
    }
    log(`[conhecimento] ${tipo}: ${r.gravadas} origens gravadas (${r.trechos} trechos), ${r.recusadas} recusadas pelo banco`);
  }

  const modelo = o.embedder?.model ?? "gemini-embedding-2";
  rel.vetores.copiados = await db.service<number>("ch_worker_tutor_kb_copiar_vetores_fontes", { p_model: modelo });
  log(`[conhecimento] vetores copiados da Central (fontes): ${rel.vetores.copiados}`);

  if (o.embedder) {
    const max = o.maxVetores ?? 20_000;
    while (rel.vetores.gerados < max) {
      const lote = await db.service<{ id: string; titulo: string; secao: string | null; texto: string; hash: string }[]>("ch_worker_tutor_kb_a_vetorizar", { p_model: modelo, p_limite: Math.min(50, max - rel.vetores.gerados) });
      if (!lote?.length) break;
      try {
        const e = await o.embedder.embedDocuments(lote.map((t) => ({ title: [t.titulo, t.secao].filter(Boolean).join(" — ") || null, text: t.texto })));
        await db.service("ch_worker_tutor_kb_gravar_vetores", { p_model: modelo, p_itens: lote.map((t, i) => ({ trecho_id: t.id, hash: t.hash, embedding: e.vectors[i] })) });
        rel.vetores.gerados += lote.length;
        rel.vetores.tokens += e.tokens;
        rel.vetores.custoUsd += e.costUsd;
      } catch (error) {
        rel.vetores.erros.push((error as Error).message.slice(0, 200));
        if (rel.vetores.erros.length >= 3) break; // cota ou configuração: para e tenta na próxima rodada
        await dorme(o.pausaMs ?? 5000);
      }
      if (o.pausaMs) await dorme(o.pausaMs);
    }
    // rótulos (enunciados e temas): só para o material da abertura
    while (rel.rotulos.gerados < max) {
      const lote = await db.service<{ chave: string; texto: string }[]>("ch_worker_tutor_kb_rotulos_a_vetorizar", { p_model: modelo, p_limite: 50 });
      if (!lote?.length) break;
      try {
        const vs: number[][] = [];
        for (const x of lote) vs.push(await o.embedder.embedQuery(x.texto));
        await db.service("ch_worker_tutor_kb_gravar_rotulos", { p_model: modelo, p_itens: lote.map((x, i) => ({ chave: x.chave, texto: x.texto, embedding: vs[i] })) });
        rel.rotulos.gerados += lote.length;
      } catch (error) {
        rel.rotulos.erros.push((error as Error).message.slice(0, 200));
        if (rel.rotulos.erros.length >= 3) break;
        await dorme(o.pausaMs ?? 5000);
      }
    }
    log(`[conhecimento] vetores gerados: ${rel.vetores.gerados} (US$ ${rel.vetores.custoUsd.toFixed(4)}), rótulos: ${rel.rotulos.gerados}`);
  }

  rel.limpeza = await db.service<Record<string, number>>("ch_worker_tutor_kb_limpar", { p_mapas: mapas.map((m) => String(m.origem_id)) });
  rel.ms = Date.now() - t0;
  return rel;
}

/** Custo estimado (US$) de vetorizar `caracteres` (≈ 3,5 caracteres por token em português; US$ 0,20 por milhão de tokens). */
export const custoEstimado = (caracteres: number, precoPorMilhao = 0.2) => Math.round(((caracteres / 3.5) * precoPorMilhao) / 1e6 * 1e4) / 1e4;
