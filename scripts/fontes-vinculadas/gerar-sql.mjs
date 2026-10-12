#!/usr/bin/env node
// Fontes vinculadas (pedido do dono de 12/10/2026): lê um JSON com os vínculos questão → fonte → trecho e gera o SQL que o
// dono cola no editor SQL do Supabase. O SQL pode ser colado de novo sem mudar nada (idempotente).
//
// Uso:  node scripts/fontes-vinculadas/gerar-sql.mjs <vinculos.json> --fontes <fontes-do-banco.csv|json> [--saida <arquivo.sql>] [--em-revisao]
//
// A fonte de cada vínculo é achada pelo LINK normalizado (a mesma regra do banco, ch_url_norm) e, se vier, pela versão, na lista
// de fontes exportada do banco (--fontes). Fonte que não está no banco: o script LISTA e NÃO gera aquele vínculo. Nada aqui
// conecta no banco nem usa chave nenhuma. Formato e passo a passo: README.md desta pasta.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PAPEIS = ["diagnostico", "conduta", "exame", "tratamento", "prevencao", "conceito", "outro"];
export const TEMPORAIS = ["vigente", "historica"];
export const CONFERENCIAS = ["confirmada", "nao_confirmada"];
// formato do agente Vinculador: força do vínculo ("fraca" não entra)
export const FORCAS = ["forte", "media", "fraca"];
// os mesmos limites das colunas do banco (migração 20261003009900_fontes_vinculadas.sql)
export const LIMITES = { citacao: 400, secao: 200, rotulo_pagina: 40, ato: 200, nota: 1000, motivo: 500, nota_atualizacao: 1000 };

/** Link normalizado: a mesma regra de public.ch_url_norm (sem #…, sem utm_*, sem :443, esquema e host em minúsculas). */
export function normUrl(url) {
  const v = String(url ?? "").replace(/^ +| +$/g, "").split("#")[0];
  if (v === "") return null;
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?]*)([^?]*)(\?(.*))?$/s.exec(v);
  if (!m) return v;
  const at = m[2].lastIndexOf("@");
  let host = at >= 0 ? m[2].slice(0, at + 1) + m[2].slice(at + 1).toLowerCase() : m[2].toLowerCase();
  host = host.replace(/:443$/, "");
  const query = (m[5] ?? "").split("&").filter((part) => part !== "" && !/^utm_/.test(part.toLowerCase())).join("&");
  return `${m[1].toLowerCase()}://${host}${m[3]}${query ? `?${query}` : ""}`;
}

/**
 * Chave para achar a fonte pelo link: o link normalizado sem o final de download/visualização do gov.br (@@download/file,
 * @@display-file/file, view) e sem barra no fim: a mesma chave da importação do catálogo para a biblioteca de fontes.
 */
export const chaveUrl = (u) => {
  const n = normUrl(u);
  return n ? n.replace(/\/(@@download\/file|@@display-file\/file|view)\/?$/, "").replace(/\/+$/, "") : null;
};

const normVersao = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
/** Espaços e quebras de linha do PDF viram um espaço (o banco faz o mesmo ao gravar). */
const limpa = (v) => (v == null ? null : String(v).replace(/\s+/g, " ").trim() || null);
/** Nota do que mudou: sem o título do bloco no começo ("O que mudou desde a prova:"), que a tela já mostra. */
export const limpaNotaAtualizacao = (v) => {
  const sem = limpa(limpa(v)?.replace(/^o que mudou desde a prova\s*:\s*/i, "") ?? null);
  return sem ? sem.charAt(0).toUpperCase() + sem.slice(1) : null;
};

/** CSV simples (aspas, vírgulas e quebras de linha dentro de aspas), primeira linha = cabeçalho. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const s = String(text).replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(field), (field = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += ch;
  }
  if (field !== "" || row.length) row.push(field), rows.push(row);
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] === undefined || r[i] === "" || r[i] === "NULL" ? null : r[i]])));
}

/** Lista de fontes exportada do banco (CSV ou JSON) → [{ id, url, version, title, organ, status, audience, kind, editorial_approved }]. */
export function parseFontes(text) {
  const t = String(text).replace(/^﻿/, "").trim();
  const list = t.startsWith("[") || t.startsWith("{") ? JSON.parse(t) : parseCsv(t);
  const arr = Array.isArray(list) ? list : Array.isArray(list?.rows) ? list.rows : [];
  return arr
    .map((f) => ({
      id: f.id ?? null,
      url: f.url ?? null,
      version: f.version ?? null,
      title: f.title ?? null,
      organ: f.organ ?? null,
      status: f.status ?? null,
      audience: f.audience ?? null,
      kind: f.kind ?? null,
      editorial_approved: f.editorial_approved == null ? null : f.editorial_approved === true || f.editorial_approved === "true" || f.editorial_approved === "t",
    }))
    .filter((f) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(f.id ?? "")) && f.url);
}

const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;

/**
 * Acha a fonte de um vínculo na lista do banco, pelo LINK (a versão só desempata quando o mesmo link tem mais de uma fonte).
 * Devolve { fonte, aviso? } ou { motivo } (por que não gera).
 */
export function acharFonte(fontes, vinculo) {
  const alvo = chaveUrl(vinculo.url_fonte);
  let cands = fontes.filter((f) => chaveUrl(f.url) === alvo);
  if (!cands.length) return { motivo: "fonte não encontrada no banco (cadastre o documento na biblioteca de fontes e exporte a lista de novo)" };
  const comVersao = vinculo.versao != null && String(vinculo.versao).trim() !== "";
  let aviso = null;
  if (comVersao) {
    const naVersao = cands.filter((f) => normVersao(f.version) === normVersao(vinculo.versao));
    if (naVersao.length) cands = naVersao;
    else if (cands.length === 1) aviso = `versão no arquivo "${vinculo.versao}", no banco "${cands[0].version ?? "sem versão"}" (achada pelo link)`;
    else {
      const tem = [...new Set(cands.map((f) => f.version ?? "sem versão"))].join(", ");
      return { motivo: `o link tem mais de uma fonte no banco e nenhuma na versão "${vinculo.versao}" (no banco: ${tem})` };
    }
  }
  if (cands.length > 1) {
    const vigentes = cands.filter((f) => (f.status ?? "current") === "current");
    if (vigentes.length !== 1) {
      return {
        motivo: comVersao
          ? "mais de uma fonte no banco com este link e esta versão: junte as repetidas na biblioteca de fontes antes"
          : "mais de uma fonte no banco com este link: informe a versão",
      };
    }
    cands = vigentes;
  }
  const fonte = cands[0];
  if (fonte.audience && fonte.audience !== "oficial") return { motivo: "fonte complementar não pode ser vinculada (nunca aparece ao aluno)" };
  if (vinculo.temporal === "vigente") {
    if (fonte.status && fonte.status !== "current") return { motivo: "na referência atual, a fonte do banco está substituída ou retirada: vincule a versão vigente" };
    if (["public_consultation", "preliminary"].includes(fonte.kind)) return { motivo: "consulta pública ou versão preliminar não vale como referência atual" };
    if (fonte.kind === "society_guideline" && fonte.editorial_approved === false) return { motivo: "diretriz de sociedade sem aprovação editorial na biblioteca de fontes" };
  }
  return aviso ? { fonte, aviso } : { fonte };
}

/** Problemas de um vínculo (formato e limites). Vazio = bom. */
export function problemasDoVinculo(v) {
  const p = [];
  if (!v || typeof v !== "object") return ["vínculo vazio"];
  if (typeof v.url_fonte !== "string" || !/^https?:\/\//i.test(v.url_fonte.trim())) p.push("url_fonte precisa ser um link http(s)");
  if (!TEMPORAIS.includes(v.temporal)) p.push('temporal deve ser "vigente" ou "historica"');
  if (!PAPEIS.includes(v.papel)) p.push(`papel deve ser um de: ${PAPEIS.join(", ")}`);
  const citacao = limpa(v.citacao);
  if (!citacao) p.push("falta a citação (trecho literal do documento)");
  else if (citacao.length > LIMITES.citacao) p.push(`citação com ${citacao.length} caracteres (máximo ${LIMITES.citacao}: use um trecho curto)`);
  if (v.pagina != null && !(Number.isInteger(v.pagina) && v.pagina >= 1 && v.pagina <= 100000)) p.push("pagina deve ser um número inteiro a partir de 1");
  const rotulo = limpa(v.rotulo_pagina);
  if (rotulo && rotulo.length > LIMITES.rotulo_pagina) p.push(`rotulo_pagina com mais de ${LIMITES.rotulo_pagina} caracteres`);
  const secao = limpa(v.secao);
  if (secao && secao.length > LIMITES.secao) p.push(`secao com mais de ${LIMITES.secao} caracteres`);
  const ato = limpa(v.ato);
  if (ato && ato.length > LIMITES.ato) p.push(`ato com mais de ${LIMITES.ato} caracteres`);
  if (v.pagina == null && !rotulo && !secao) p.push("falta a página (pagina ou rotulo_pagina) ou a seção do documento");
  if (v.forca != null && !FORCAS.includes(v.forca)) p.push('forca deve ser "forte", "media" ou "fraca"');
  const notaAtualizacao = limpaNotaAtualizacao(v.nota_atualizacao_proposta);
  if (notaAtualizacao && notaAtualizacao.length > LIMITES.nota_atualizacao) p.push(`nota_atualizacao_proposta com mais de ${LIMITES.nota_atualizacao} caracteres`);
  if (notaAtualizacao && v.temporal === "historica") p.push("nota_atualizacao_proposta só vale na referência atual (vigente)");
  if (v.divergencia != null && typeof v.divergencia !== "boolean") p.push("divergencia deve ser true ou false");
  return p;
}

// ---------------------------------------------------------------- SQL
const lit = (v, type) => {
  if (v == null) return `null::${type}`;
  if (type === "int") return `${Number(v)}::int`;
  if (type === "boolean") return v ? "true" : "false";
  return `'${String(v).replace(/\u0000/g, "").replace(/'/g, "''")}'::${type}`;
};
const QUESTAO = (alias) =>
  `public.questions q on ((${alias}.por_codigo and q.code = ${alias}.chave) or (not ${alias}.por_codigo and q.id = ${alias}.chave))`;

/**
 * Gera o SQL. itens = conteúdo do JSON de vínculos; fontes = parseFontes(...); opts.emRevisao = vínculos entram "em revisão"
 * (a equipe confirma na Administração › Questões). Devolve { sql, relatorio }; sql = null quando não há nada a gravar.
 */
export function gerarSql(itens, fontes, opts = {}) {
  const emRevisao = Boolean(opts.emRevisao);
  const arquivo = opts.arquivo ?? "vinculos.json";
  const geradoEm = opts.geradoEm ?? new Date();
  const relatorio = { questoes: 0, vinculos: [], conferencias: [], pulados: [], avisos: [] };
  if (!Array.isArray(itens)) throw new Error("O arquivo de vínculos precisa ser uma lista JSON: [ { question_code, conferencia, vinculos: [...] } ].");
  const vistos = new Set();
  const chavesVistas = new Set();
  for (const [n, item] of itens.entries()) {
    const ref = `item ${n + 1}`;
    if (!item || typeof item !== "object") {
      relatorio.pulados.push({ questao: ref, motivo: "item vazio" });
      continue;
    }
    // question_id manda; sem ele vale o código (question_code, ou "code" no formato do agente Vinculador)
    const porCodigo = item.question_id == null || String(item.question_id).trim() === "";
    const chave = String((porCodigo ? item.question_code ?? item.code : item.question_id) ?? "").trim();
    const nome = chave || ref;
    if (!chave) {
      relatorio.pulados.push({ questao: ref, motivo: "falta question_code ou question_id" });
      continue;
    }
    if (!CONFERENCIAS.includes(item.conferencia)) {
      relatorio.pulados.push({ questao: nome, motivo: 'conferencia deve ser "confirmada" ou "nao_confirmada"' });
      continue;
    }
    const nota = limpa(item.nota);
    if (nota && nota.length > LIMITES.nota) {
      relatorio.pulados.push({ questao: nome, motivo: `nota com mais de ${LIMITES.nota} caracteres` });
      continue;
    }
    if (item.conferido_em != null && !isDate(item.conferido_em)) {
      relatorio.pulados.push({ questao: nome, motivo: "conferido_em deve ser uma data AAAA-MM-DD" });
      continue;
    }
    if (item.vinculos != null && !Array.isArray(item.vinculos)) {
      relatorio.pulados.push({ questao: nome, motivo: "vinculos precisa ser uma lista" });
      continue;
    }
    const chaveQ = `${porCodigo ? "c" : "i"}:${chave}`;
    if (chavesVistas.has(chaveQ)) {
      relatorio.pulados.push({ questao: nome, motivo: "questão repetida no arquivo (junte os vínculos num item só)" });
      continue;
    }
    chavesVistas.add(chaveQ);
    relatorio.questoes++;
    let vigentes = 0; // referências atuais que entram confirmadas
    for (const v of item.vinculos ?? []) {
      const url = v?.url_fonte ?? "";
      const problemas = problemasDoVinculo(v);
      if (problemas.length) {
        relatorio.pulados.push({ questao: nome, url, motivo: problemas.join("; ") });
        continue;
      }
      if (v.forca === "fraca") {
        relatorio.pulados.push({ questao: nome, url, motivo: 'vínculo de força "fraca": não entra' });
        continue;
      }
      if (v.validado === false) {
        relatorio.pulados.push({ questao: nome, url, motivo: "vínculo não validado: não entra" });
        continue;
      }
      // divergência, nota do que mudou (só vai ao aluno aprovada pela equipe) ou o modo --em-revisao: entra "em revisão", com a
      // observação como motivo, e a equipe confirma em Administração › Questões
      const updateNote = limpaNotaAtualizacao(v.nota_atualizacao_proposta);
      const status = emRevisao || v.divergencia === true || updateNote ? "em_revisao" : "confirmada";
      if (item.conferencia === "nao_confirmada" && v.temporal === "vigente" && status === "confirmada") {
        relatorio.pulados.push({ questao: nome, url, motivo: 'conferência "nao_confirmada" não pode trazer referência atual confirmada (só a versão da época da prova, ou um vínculo com divergência para a equipe conferir)' });
        continue;
      }
      const achado = acharFonte(fontes, v);
      if (!achado.fonte) {
        relatorio.pulados.push({ questao: nome, url, motivo: achado.motivo });
        continue;
      }
      // um vínculo = um trecho: a mesma fonte pode sustentar o mesmo papel com outra citação
      const dup = `${chaveQ}|${achado.fonte.id}|${v.papel}|${v.temporal}|${limpa(v.citacao)}`;
      if (vistos.has(dup)) {
        relatorio.pulados.push({ questao: nome, url, motivo: "vínculo repetido (mesma fonte, mesmo papel, mesma referência e mesma citação)" });
        continue;
      }
      vistos.add(dup);
      if (achado.aviso) relatorio.avisos.push({ questao: nome, url, aviso: achado.aviso });
      if (v.temporal === "vigente" && status === "confirmada") vigentes++;
      const obs = status === "em_revisao" ? limpa(v.observacao) : null;
      relatorio.vinculos.push({
        chave, porCodigo, sourceId: achado.fonte.id, urlNorm: normUrl(achado.fonte.url), titulo: achado.fonte.title, role: v.papel, temporal: v.temporal,
        page: v.pagina ?? null, pageLabel: limpa(v.rotulo_pagina), section: limpa(v.secao), quote: limpa(v.citacao), act: limpa(v.ato),
        validity: v.temporal === "vigente" && status === "confirmada" ? item.conferido_em ?? null : null,
        status, reason: obs && obs.length > LIMITES.motivo ? `${obs.slice(0, LIMITES.motivo - 1)}…` : obs, updateNote,
      });
    }
    if (item.conferencia === "confirmada" && emRevisao) {
      // em revisão: quem confirma a referência atual é a equipe (o "Confirmar" grava a conferência)
    } else if (item.conferencia === "confirmada" && vigentes === 0) {
      relatorio.pulados.push({ questao: nome, motivo: 'conferência "confirmada" não gravada: nenhuma referência atual confirmada neste item (a questão segue "ainda não conferida" até a equipe confirmar)' });
    } else {
      relatorio.conferencias.push({ chave, porCodigo, status: item.conferencia, note: nota, checkedAt: item.conferido_em ?? null });
    }
  }
  if (!relatorio.vinculos.length && !relatorio.conferencias.length) return { sql: null, relatorio };

  const out = [];
  const nv = relatorio.vinculos.length;
  const nc = relatorio.conferencias.length;
  out.push(
    `-- StaziaMed · Fontes vinculadas: ${nv} ${nv === 1 ? "vínculo" : "vínculos"} e ${nc} ${nc === 1 ? "conferência" : "conferências"} (${relatorio.questoes} ${relatorio.questoes === 1 ? "questão" : "questões"}).`,
    `-- Gerado por scripts/fontes-vinculadas/gerar-sql.mjs em ${geradoEm.toISOString().slice(0, 10)} a partir de ${path.basename(arquivo)}${emRevisao ? ' (vínculos entram "em revisão": a equipe confirma na Administração › Questões)' : ""}.`,
    "-- Vínculos \"em revisão\" (com divergência) não aparecem ao aluno até a equipe confirmar em Administração › Questões.",
    "-- Cole este arquivo INTEIRO no editor SQL do Supabase (sem selecionar nada) e clique em Run. Precisa da migração 9900 (Fontes vinculadas) já colada.",
    "-- Pode colar de novo: o que já está igual não muda. No fim aparece uma linha \"OK: ...\" (ou \"FALTA: ...\", com o que não entrou).",
    "-- Nada aqui mexe no gabarito: o gabarito oficial do Inep nunca muda por diretriz.",
    ""
  );
  if (nv) {
    const rows = relatorio.vinculos.map(
      (v) =>
        `    (${lit(v.chave, "text")}, ${lit(v.porCodigo, "boolean")}, ${lit(v.sourceId, "uuid")}, ${lit(v.urlNorm, "text")}, ${lit(v.role, "text")}, ${lit(v.temporal, "text")}, ` +
        `${lit(v.page, "int")}, ${lit(v.pageLabel, "text")}, ${lit(v.section, "text")}, ${lit(v.quote, "text")}, ${lit(v.act, "text")}, ${lit(v.validity, "date")}, ` +
        `${lit(v.status, "text")}, ${lit(v.reason, "text")}, ${lit(v.updateNote, "text")})`
    );
    out.push(
      "-- 1) vínculos questão → fonte → trecho (a fonte é a do banco com este id E este link; questão e fonte que não existirem ficam de fora)",
      "with entrada (chave, por_codigo, source_id, url_norm, role, temporal, page, page_label, section, quote, act, validity_checked_on, status, reason, update_note) as (",
      "  values",
      rows.join(",\n"),
      "), alvo as (",
      "  select q.id as question_id, e.source_id, e.role, e.temporal, e.page, e.page_label, e.section, e.quote, e.act, e.validity_checked_on, e.status, e.reason, e.update_note",
      `  from entrada e join ${QUESTAO("e")}`,
      "  join public.ch_sources s on s.id = e.source_id and public.ch_url_norm(s.url) = e.url_norm",
      ")",
      "insert into public.question_source_links as l (question_id, source_id, role, temporal, page, page_label, section, quote, act, status, reason, update_note, origin, validity_checked_on)",
      "select question_id, source_id, role, temporal, page, page_label, section, quote, act, status, reason, update_note, 'importacao', validity_checked_on from alvo",
      "on conflict (question_id, source_id, role, temporal, (md5(coalesce(quote, '')))) do update",
      "  set page = excluded.page, page_label = excluded.page_label, section = excluded.section, quote = excluded.quote, act = excluded.act,",
      "      status = excluded.status, origin = excluded.origin, reason = excluded.reason, update_note = excluded.update_note,",
      "      verified_by = null, verified_at = null, validity_checked_on = excluded.validity_checked_on",
      "  where (l.page, l.page_label, l.section, l.quote, l.act, l.reason, l.update_note)",
      "        is distinct from (excluded.page, excluded.page_label, excluded.section, excluded.quote, excluded.act, excluded.reason, excluded.update_note)",
      "     or (excluded.status = 'confirmada' and l.status <> 'confirmada');",
      ""
    );
  }
  if (nc) {
    const rows = relatorio.conferencias.map(
      (c) => `    (${lit(c.chave, "text")}, ${lit(c.porCodigo, "boolean")}, ${lit(c.status, "text")}, ${lit(c.note, "text")}, ${lit(c.checkedAt ? `${c.checkedAt}T12:00:00-03:00` : null, "timestamptz")})`
    );
    out.push(
      "-- 2) conferência da referência atual (uma por questão). \"confirmada\" só entra se a questão tem referência atual confirmada.",
      "with entrada (chave, por_codigo, status, note, checked_at) as (",
      "  values",
      rows.join(",\n"),
      "), alvo as (",
      "  select q.id as question_id, e.status, e.note, coalesce(e.checked_at, now()) as checked_at",
      `  from entrada e join ${QUESTAO("e")}`,
      "  where e.status = 'nao_confirmada'",
      "     or exists (select 1 from public.question_source_links x where x.question_id = q.id and x.temporal = 'vigente' and x.status = 'confirmada')",
      ")",
      "insert into public.question_source_checks as c (question_id, status, note, origin, checked_at)",
      "select question_id, status, note, 'importacao', checked_at from alvo",
      "on conflict (question_id) do update",
      "  set status = excluded.status, note = excluded.note, origin = excluded.origin, checked_by = null, checked_at = excluded.checked_at",
      "  where (c.status, c.note) is distinct from (excluded.status, excluded.note);",
      ""
    );
  }
  // 3) conferência final (só lê)
  const ev = relatorio.vinculos.map((v) => `    (${lit(v.chave, "text")}, ${lit(v.porCodigo, "boolean")}, ${lit(v.sourceId, "uuid")}, ${lit(v.role, "text")}, ${lit(v.temporal, "text")}, ${lit(v.quote, "text")})`);
  const ec = relatorio.conferencias.map((c) => `    (${lit(c.chave, "text")}, ${lit(c.porCodigo, "boolean")}, ${lit(c.status, "text")})`);
  out.push(
    "-- 3) conferência (só lê): \"OK: ...\" quando tudo deste arquivo está no banco",
    "with ev (chave, por_codigo, source_id, role, temporal, quote) as (",
    nv ? `  values\n${ev.join(",\n")}` : "  select null::text, null::boolean, null::uuid, null::text, null::text, null::text where false",
    "), ec (chave, por_codigo, status) as (",
    nc ? `  values\n${ec.join(",\n")}` : "  select null::text, null::boolean, null::text where false",
    "), v as (",
    "  select e.chave, q.id as qid, s.id as sid, l.id as lid",
    `  from ev e left join ${QUESTAO("e")}`,
    "  left join public.ch_sources s on s.id = e.source_id",
    "  left join public.question_source_links l on l.question_id = q.id and l.source_id = e.source_id and l.role = e.role and l.temporal = e.temporal",
    "   and md5(coalesce(l.quote, '')) = md5(coalesce(e.quote, ''))",
    "), c as (",
    "  select e.chave, e.status, q.id as qid, k.status as gravado",
    `  from ec e left join ${QUESTAO("e")}`,
    "  left join public.question_source_checks k on k.question_id = q.id",
    "), falta as (",
    "  select chave || ': questão não encontrada' as m from v where qid is null",
    "  union all select chave || ': fonte não encontrada no banco' from v where qid is not null and sid is null",
    "  union all select chave || ': vínculo não gravado' from v where qid is not null and sid is not null and lid is null",
    "  union all select chave || ': questão não encontrada' from c where qid is null",
    "  union all select chave || ': conferência não gravada' from c where qid is not null and gravado is distinct from status",
    ")",
    `select case when not exists (select 1 from falta) then 'OK: Fontes vinculadas gravadas (${nv} ${nv === 1 ? "vínculo" : "vínculos"}, ${nc} ${nc === 1 ? "conferência" : "conferências"})'`,
    "            else 'FALTA: ' || (select string_agg(distinct m, '; ') from falta) end as resultado,",
    "       (select count(*) from v where lid is not null)::int as vinculos_no_banco,",
    "       (select count(*) from c where gravado is not distinct from status)::int as conferencias_no_banco;",
    ""
  );
  return { sql: out.join("\n"), relatorio };
}

/** Relatório em português para o terminal. */
export function textoDoRelatorio(relatorio, saida) {
  const v = relatorio.vinculos;
  const c = relatorio.conferencias;
  const linhas = [
    `Fontes vinculadas: ${relatorio.questoes} ${relatorio.questoes === 1 ? "questão lida" : "questões lidas"}.`,
    `  vínculos gerados: ${v.length} (${v.filter((x) => x.temporal === "vigente").length} referência atual, ${v.filter((x) => x.temporal === "historica").length} versão da época da prova; ${v.filter((x) => x.status === "em_revisao").length} em revisão para a equipe)`,
    `  conferências geradas: ${c.length} (${c.filter((x) => x.status === "confirmada").length} confirmadas, ${c.filter((x) => x.status === "nao_confirmada").length} não confirmadas)`,
  ];
  if (relatorio.pulados.length) {
    linhas.push(`  NÃO gerados (${relatorio.pulados.length}):`);
    for (const p of relatorio.pulados) linhas.push(`    - ${p.questao}${p.url ? ` · ${p.url}` : ""}: ${p.motivo}`);
  } else linhas.push("  nada ficou de fora.");
  if (relatorio.avisos?.length) {
    linhas.push(`  avisos (${relatorio.avisos.length}; o vínculo foi gerado):`);
    for (const a of relatorio.avisos) linhas.push(`    - ${a.questao}${a.url ? ` · ${a.url}` : ""}: ${a.aviso}`);
  }
  linhas.push(saida ? `SQL gravado em: ${saida}` : "Nada para gravar: nenhum SQL foi gerado.");
  return linhas.join("\n");
}

function main(argv) {
  const args = [...argv];
  const opt = (name) => {
    const i = args.indexOf(name);
    if (i < 0) return null;
    const value = args[i + 1];
    args.splice(i, 2);
    return value ?? null;
  };
  const fontesArq = opt("--fontes");
  let saida = opt("--saida");
  const emRevisao = args.includes("--em-revisao");
  const resto = args.filter((a) => a !== "--em-revisao");
  const entrada = resto[0];
  if (!entrada || !fontesArq) {
    console.error("Uso: node scripts/fontes-vinculadas/gerar-sql.mjs <vinculos.json> --fontes <fontes-do-banco.csv|json> [--saida <arquivo.sql>] [--em-revisao]");
    console.error("Veja scripts/fontes-vinculadas/README.md (como exportar a lista de fontes do banco).");
    return 2;
  }
  let itens;
  let fontes;
  try {
    itens = JSON.parse(fs.readFileSync(entrada, "utf8"));
  } catch (e) {
    console.error(`Não consegui ler ${entrada} como JSON: ${e.message}`);
    return 2;
  }
  try {
    fontes = parseFontes(fs.readFileSync(fontesArq, "utf8"));
  } catch (e) {
    console.error(`Não consegui ler a lista de fontes ${fontesArq}: ${e.message}`);
    return 2;
  }
  if (!fontes.length) {
    console.error(`A lista de fontes ${fontesArq} veio vazia (precisa das colunas id e url). Veja o README.`);
    return 2;
  }
  let r;
  try {
    r = gerarSql(itens, fontes, { emRevisao, arquivo: entrada });
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  if (r.sql) {
    saida ??= entrada.replace(/\.json$/i, "") + "-COLAR.sql";
    fs.writeFileSync(saida, r.sql);
  }
  console.log(textoDoRelatorio(r.relatorio, r.sql ? saida : null));
  return r.sql ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main(process.argv.slice(2)));
