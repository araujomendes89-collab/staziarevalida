#!/usr/bin/env node
// Carga das explicações das questões (pedido do dono de 12/10/2026). Lê o que os agentes Professor e Auditor gravaram em
// revisao-questoes/<prova>/ e gera o pacote de SQL que o dono cola no editor SQL do Supabase (uma parte por prova), mais o
// relatório, a lista de divergências para a tela do dono e os perfis para o ramo da similaridade. Re-executável: trabalha com o
// que existir e lista o que falta. Não conecta em banco nenhum e não usa chave de IA. Passo a passo: README.md desta pasta.
//
// Uso: node scripts/carga-explicacoes/gerar-sql.mjs [--pasta <revisao-questoes>] [--saida <pasta do pacote>] [--decisoes <json>]
//                                                    [--estrutura <migração 9920>] [--sem-pacote]
// --decisoes: decisoes-divergencias.json da tela do dono. Sem ele, NENHUMA divergente entra (nem em revisão).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const PASTA_PADRAO = "/private/tmp/claude-501/-Volumes-StaziaMed/5d3dd43b-7aaf-486f-81c4-583d693b3d8e/scratchpad/revisao-questoes";
export const SAIDA_PADRAO = path.join(process.env.HOME ?? "", "Downloads/publicacao-staziamed-2026-10-12-explicacoes");
export const ESTRUTURA_PADRAO = path.resolve(AQUI, "../../supabase/migrations/20261003009920_carga_explicacoes.sql");
export const AVISO_ANULADA = "Questão anulada pela banca do Inep. As explicações abaixo servem para estudo; nenhuma alternativa conta como gabarito.";
export const LETRAS = ["A", "B", "C", "D"];
/** Confiança mínima do Professor para a regra B (liberar direto). */
export const CONFIANCA_MINIMA_B = 80;
// pasta → nome da prova (a ordem do pacote)
export const PROVAS = [
  ["revalida_2020_1", "Revalida 2020"], ["revalida_2021_1", "Revalida 2021"], ["revalida_2022_1", "Revalida 2022/1"], ["revalida_2022_2", "Revalida 2022/2"],
  ["revalida_2023_1", "Revalida 2023/1"], ["revalida_2023_2", "Revalida 2023/2"], ["revalida_2024_1", "Revalida 2024/1"], ["revalida_2024_2", "Revalida 2024/2"],
  ["revalida_2025_1", "Revalida 2025/1"], ["revalida_2025_2", "Revalida 2025/2"], ["revalida_2026_1", "Revalida 2026/1"], ["revalida_2026_2", "Revalida 2026/2 (gabarito preliminar)"],
  ["enamed_2025", "ENAMED 2025"],
];
const NOME = Object.fromEntries(PROVAS);

// Avisos internos que NUNCA podem chegar ao aluno (regra dos agentes): a questão fica FORA da carga até ser reescrita.
export const BLOQUEIA = [
  [/revis[aã]o (m[eé]dica|humana)/i, "fala em revisão médica/humana (aviso interno)"],
  [/nota interna/i, "traz \"nota interna\""],
  [/diverg[eê]ncia (fica |foi |est[aá] )?(sinalizad|registrad|marcad)/i, "fala da divergência sinalizada (aviso interno)"],
  [/sinalizad[ao]s? para (a )?revis/i, "diz que foi sinalizada para revisão (aviso interno)"],
  [/gabarito oficial (diz|aponta|considera|marca)[^.]{0,80}\bmas\b/i, "desconfia do gabarito no texto do aluno"],
  [/motivo prov[aá]vel d[ae] anula|hip[oó]tese de anula/i, "traz a hipótese interna da anulação"],
  [/\bo auditor\b/i, "cita o Auditor"],
];
// Citação ou afirmação que os agentes não podem fazer: a questão entra, mas nunca direto (fica para o revisor médico).
export const ALERTA = [
  [/segundo a diretriz atual/i, "diz \"segundo a diretriz atual\""],
  [/\b(Portaria|Resolu[cç][aã]o|Decreto|Nota T[eé]cnica|Lei)\s+(n[º°o.]|\d)/i, "cita número de portaria, lei ou nota técnica"],
  [/\bet al\b/i, "cita autores"],
];
const CHAVES_ALUNO = ["explicacao", "conduta_esperada", "o_que_a_questao_avalia", "tema", "subtema", "nota_atualizacao"];
const CHAVES_INTERNAS = ["pontos_de_atencao", "precisa_conferir_diretriz", "divergencia_gabarito", "confianca", "perfil", "motivo_provavel_anulacao", "aviso_aluno"];

export const limpa = (v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());
export const md5 = (s) => crypto.createHash("md5").update(s, "utf8").digest("hex");
/** A mesma impressão do banco (question_explanations_fingerprint): A, B, C, D, conduta, avalia, tema, subtema. */
export const impressaoTextos = (x) => md5([...LETRAS.map((l) => x.explicacoes[l] ?? ""), x.conduta ?? "", x.avalia ?? "", x.tema ?? "", x.subtema ?? ""].join("\u001f"));
/** A mesma impressão do banco (question_read_fingerprint): enunciado e o texto das alternativas A a D. */
export const impressaoLida = (q) => md5([q.statement ?? "", ...LETRAS.map((l) => (q.options ?? []).find((o) => o.id === l)?.text ?? "")].join("\u001f"));

const lerJson = (arquivo, padrao) => {
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    return padrao;
  }
};

/** Lê os arquivos de uma prova. Professor e Auditor por id; a auditoria é "antiga" se o arquivo do Professor é mais novo. */
export function lerProva(pasta, slug) {
  const dir = path.join(pasta, slug);
  const avisos = [];
  const base = lerJson(path.join(dir, "corrigidas-todas.json"), null);
  let questoes = Array.isArray(base) ? base : [];
  if (!questoes.length && fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((x) => /^lote-\d+\.json$/.test(x)).sort()) questoes.push(...lerJson(path.join(dir, f), []));
  }
  const prof = new Map();
  const aud = new Map();
  // Arquivo final já mesclado (final/<prova>.json: o Auditor aplicado sobre o Professor, gabarito intacto): quando existe, manda.
  const final = lerJson(path.join(pasta, "final", `${slug}.json`), null);
  if (Array.isArray(final)) {
    for (const x of final) {
      if (!x || typeof x.id !== "string" || !x.professor_final) continue;
      prof.set(x.id, { p: x.professor_final, arquivo: `final/${slug}.json` });
      if (x.auditor && typeof x.auditor === "object") {
        const correcoes = x.auditor.correcoes && typeof x.auditor.correcoes === "object" ? x.auditor.correcoes : {};
        const ja = x.estado === "corrigida_pelo_auditor";
        aud.set(x.id, {
          // a correção já está no professor_final (corrigida); na divergente ela não foi aplicada: aplica aqui, se o dono decidir
          a: { ...x.auditor, correcoes: ja ? null : x.estado === "divergente" ? correcoes : null },
          arquivo: `final/${slug}.json`, antiga: false,
          aplicadas: ja ? Object.entries(correcoes).flatMap(([k, v]) => (k === "explicacao" && v && typeof v === "object" ? Object.keys(v).map((l) => `explicacao.${l}`) : [k])) : [],
        });
      }
    }
    return { slug, nome: NOME[slug] ?? slug, questoes, prof, aud, avisos, final: true };
  }
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((x) => /^prof-(\d+|anuladas)\.json$/.test(x)).sort()) {
      const sufixo = f.slice(5, -5);
      const lista = lerJson(path.join(dir, f), null);
      if (!Array.isArray(lista)) {
        avisos.push(`${slug}/${f}: arquivo ilegível ou ainda sendo gravado (pulado)`);
        continue;
      }
      const audArq = path.join(dir, `aud-${sufixo}.json`);
      const audLista = fs.existsSync(audArq) ? lerJson(audArq, null) : null;
      if (fs.existsSync(audArq) && !Array.isArray(audLista)) avisos.push(`${slug}/aud-${sufixo}.json: arquivo ilegível ou ainda sendo gravado (pulado)`);
      const antiga = Array.isArray(audLista) && fs.statSync(path.join(dir, f)).mtimeMs > fs.statSync(audArq).mtimeMs + 1000;
      for (const p of lista) if (p && typeof p.id === "string") prof.set(p.id, { p, arquivo: f });
      if (Array.isArray(audLista)) for (const a of audLista) if (a && typeof a.id === "string") aud.set(a.id, { a, arquivo: `aud-${sufixo}.json`, antiga });
    }
  }
  return { slug, nome: NOME[slug] ?? slug, questoes, prof, aud, avisos };
}

/** Aplica as correções do Auditor (só as chaves que ele reescreveu). Devolve { prof, aplicadas, erro? }. */
export function aplicarCorrecoes(prof, correcoes) {
  const p = structuredClone(prof);
  const aplicadas = [];
  const alertas = [];
  if (correcoes == null) return { prof: p, aplicadas, alertas };
  if (typeof correcoes !== "object" || Array.isArray(correcoes)) return { erro: "correção do Auditor em formato inesperado" };
  for (const [k, v] of Object.entries(correcoes)) {
    if (k === "explicacao") {
      if (!v || typeof v !== "object" || Array.isArray(v)) return { erro: "correção da explicação em formato inesperado" };
      for (const [l, t] of Object.entries(v)) {
        if (!LETRAS.includes(l) || typeof t !== "string" || !t.trim()) return { erro: `correção da explicação "${l}" em formato inesperado` };
        p.explicacao = { ...(p.explicacao ?? {}), [l]: t };
        aplicadas.push(`explicacao.${l}`);
      }
    } else if (CHAVES_ALUNO.includes(k)) {
      if (v != null && typeof v !== "string") return { erro: `correção de ${k} em formato inesperado` };
      p[k] = v;
      aplicadas.push(k);
    } else if (CHAVES_INTERNAS.includes(k)) {
      p[k] = v; // interno: só muda a classificação (e o que a equipe vê), nunca o texto do aluno
      aplicadas.push(k);
    } else {
      alertas.push(`correção com chave desconhecida "${k}" (não aplicada)`);
    }
  }
  return { prof: p, aplicadas, alertas };
}

/** Problemas de estrutura e avisos internos nos textos do aluno. Devolve { fora: [...], alertas: [...] }. */
export function conferirTextos(q, p, anulada) {
  const fora = [];
  const alertas = [];
  const ex = p.explicacao ?? {};
  for (const l of LETRAS) {
    const t = limpa(ex[l]);
    if (!t) {
      fora.push(`falta a explicação da ${l}`);
      continue;
    }
    if (anulada) {
      if (!/^(Defensável|Incorreta)\.\s*\S/.test(t)) fora.push(`anulada: a explicação da ${l} não começa com "Defensável." nem "Incorreta."`);
    } else if (l === q.correct_option) {
      if (!/^Correta\.\s*\S/.test(t)) fora.push(`a explicação da ${l} (gabarito oficial) não começa com "Correta."`);
    } else if (!/^Incorreta\.\s*\S/.test(t)) {
      fora.push(`a explicação da ${l} não começa com "Incorreta."${/^Correta\./.test(t) ? " (o Professor chamou de correta outra letra que não a do gabarito)" : ""}`);
    }
  }
  for (const [campo, nome] of [["conduta_esperada", "conduta esperada"], ["o_que_a_questao_avalia", "o que a questão avalia"], ["tema", "tema"], ["subtema", "subtema"]]) {
    if (!limpa(p[campo])) fora.push(`falta ${nome}`);
  }
  const textos = [...LETRAS.map((l) => [`explicação da ${l}`, ex[l]]), ["conduta esperada", p.conduta_esperada], ["o que a questão avalia", p.o_que_a_questao_avalia],
    ["tema", p.tema], ["subtema", p.subtema], ["nota \"O que mudou\"", p.nota_atualizacao]];
  for (const [nome, t] of textos) {
    const s = limpa(t);
    if (!s) continue;
    for (const [re, motivo] of BLOQUEIA) if (re.test(s)) fora.push(`${nome}: ${motivo}`);
    for (const [re, motivo] of ALERTA) if (re.test(s)) alertas.push(`${nome}: ${motivo}`);
  }
  if (anulada && p.aviso_aluno != null && limpa(p.aviso_aluno) !== AVISO_ANULADA) alertas.push("o aviso da anulada não é o texto exato (a tela usa o texto exato)");
  return { fora, alertas };
}

const sim = (v) => v === true || v === "true";

/**
 * Classifica cada questão de uma prova. Devolve { itens (entram na carga), linhas (uma por questão, para o relatório),
 * divergencias, perfis }. decisoes = decisoes-divergencias.json do dono ({ id: { opcao: "A"|"B"|"C"|"D" } }).
 */
export function classificarProva(prova, decisoes = {}) {
  const itens = [];
  const linhas = [];
  const divergencias = [];
  const perfis = [];
  const preliminar = prova.slug === "revalida_2026_2";
  for (const q of prova.questoes) {
    const anulada = q.status === "annulled";
    const P = prova.prof.get(q.id);
    const A = prova.aud.get(q.id);
    const linha = { id: q.id, code: q.code, numero: q.number, anulada, situacao: null, veredito: A?.a?.veredito ?? null, motivos: [] };
    linhas.push(linha);
    if (!P) {
      linha.situacao = "falta_professor";
      continue;
    }
    if (P.p.perfil && typeof P.p.perfil === "object") perfis.push({ id: q.id, prova: prova.slug, tema: P.p.tema ?? null, subtema: P.p.subtema ?? null, confianca: P.p.confianca ?? null, perfil: P.p.perfil, origem: `${prova.slug}/${P.arquivo}` });
    if (!A) {
      linha.situacao = "falta_auditor";
      continue;
    }
    if (A.antiga) {
      linha.situacao = "auditoria_antiga";
      linha.motivos.push("o Professor refez o lote depois da auditoria: falta auditar o texto novo");
      continue;
    }
    const a = A.a;
    const decisao = decisoes[q.id]?.opcao ?? null;
    const veredito = ["ok", "corrigir", "divergente"].includes(a.veredito) ? a.veredito : null;
    if (!veredito) {
      linha.situacao = "fora";
      linha.motivos.push(`veredito do Auditor desconhecido ("${a.veredito}")`);
      continue;
    }
    const cor = aplicarCorrecoes(P.p, veredito === "ok" ? null : a.correcoes);
    if (!cor.erro && A.aplicadas?.length) cor.aplicadas.unshift(...A.aplicadas);
    if (cor.erro) {
      linha.situacao = "fora";
      linha.motivos.push(cor.erro);
      continue;
    }
    const p = cor.prof;
    const suspeita = sim(p.divergencia_gabarito?.suspeita);
    const diretriz = sim(p.precisa_conferir_diretriz?.sim);
    const motivosDiv = [];
    if (veredito === "divergente") motivosDiv.push(...(a.problemas ?? []).map((x) => `Auditor: ${x}`));
    if (veredito === "divergente" || (suspeita && !decisao)) {
      if (suspeita) motivosDiv.push(`Professor: ${p.divergencia_gabarito?.motivo || "gabarito discutível"}`);
    }
    // divergente sem decisão do dono (ou com a decisão D, tirar do treino): fora da carga e na lista do dono
    if (veredito === "divergente" && !["A", "B", "C"].includes(decisao)) {
      linha.situacao = "divergente";
      linha.motivos.push(decisao === "D" ? "o dono decidiu tirar do treino (D)" : "espera a decisão do dono na tela de divergências");
      divergencias.push({
        id: q.id, prova: prova.slug, code: q.code, area: q.area, gabarito: anulada ? "ANULADA" : q.correct_option, situacao: q.status,
        enunciado: limpa(q.statement).slice(0, 700), tema: p.tema ?? null, subtema: p.subtema ?? null,
        tipo: ["gabarito"], motivos: motivosDiv, veredito_auditor: veredito, severidade: a.severidade ?? null,
        precisa_revisao_medica: a.precisa_revisao_medica ?? null, correcoes_do_auditor: a.correcoes ?? null,
        texto_proposto: { explicacao: p.explicacao, conduta_esperada: p.conduta_esperada, o_que_a_questao_avalia: p.o_que_a_questao_avalia, nota_atualizacao: p.nota_atualizacao ?? null },
        professor: { confianca: p.confianca ?? null, precisa_conferir_diretriz: p.precisa_conferir_diretriz ?? null, divergencia_gabarito: p.divergencia_gabarito ?? null },
        decisao: decisoes[q.id] ?? null,
        opcoes: { A: "manter o gabarito + atualização científica (recomendado)", B: "só o gabarito", C: "o revisor médico decide", D: "tirar do treino" },
      });
      continue;
    }
    if (decisao === "D") {
      linha.situacao = "fora";
      linha.motivos.push("o dono decidiu tirar do treino (D): a carga não mexe nesta questão");
      continue;
    }
    const conf = conferirTextos(q, p, anulada);
    if (conf.fora.length) {
      linha.situacao = "fora";
      linha.motivos.push(...conf.fora);
      continue;
    }
    const alertas = [...cor.alertas, ...conf.alertas];
    const nota = decisao === "B" ? "" : limpa(p.nota_atualizacao);
    const confianca = Number(p.confianca);
    const regraB = veredito === "ok" && a.precisa_revisao_medica === false && !suspeita && !diretriz && !nota && Number.isFinite(confianca) && confianca >= CONFIANCA_MINIMA_B
      && alertas.length === 0 && !preliminar && !q.gabarito_preliminar && !decisao;
    const item = {
      id: q.id,
      situacao: anulada ? "annulled" : "valid",
      gabarito: anulada ? null : q.correct_option,
      explicacoes: Object.fromEntries(LETRAS.map((l) => [l, limpa(p.explicacao[l])])),
      conduta: limpa(p.conduta_esperada),
      avalia: limpa(p.o_que_a_questao_avalia),
      tema: limpa(p.tema),
      subtema: limpa(p.subtema),
      nota: nota || null,
      texto_lido: impressaoLida(q),
      carga: {
        veredito, severidade: a.severidade ?? null, problemas: (a.problemas ?? []).map(limpa).filter(Boolean),
        revisao_medica: a.precisa_revisao_medica === true, confianca: Number.isFinite(confianca) ? confianca : null,
        conferir_diretriz: diretriz ? limpa(p.precisa_conferir_diretriz?.motivo) || "sim" : null,
        suspeita_gabarito: suspeita ? limpa(p.divergencia_gabarito?.motivo) || "sim" : null,
        pontos_de_atencao: (Array.isArray(p.pontos_de_atencao) ? p.pontos_de_atencao : []).map(limpa).filter(Boolean),
        alertas, correcoes_aplicadas: cor.aplicadas, regra_b: regraB, decisao_dono: decisao,
        gabarito_preliminar: preliminar || Boolean(q.gabarito_preliminar), origem: `${prova.slug}/${P.arquivo} + ${A.arquivo}`,
      },
    };
    item.impressao = impressaoTextos(item);
    itens.push(item);
    linha.situacao = "entra";
    linha.destino = regraB ? "direto_b" : "revisao";
    linha.nota = Boolean(item.nota);
    if (alertas.length) linha.motivos.push(...alertas);
  }
  return { itens, linhas, divergencias, perfis };
}

// ---------------------------------------------------------------- SQL
function dolar(texto, base = "carga") {
  let tag = `$${base}$`;
  for (let i = 1; texto.includes(tag); i++) tag = `$${base}${i}$`;
  return tag;
}
const sqlTexto = (s) => `'${String(s).replace(/'/g, "''")}'`;
export const rotulo = (slug) => `Carga das explicações (Professor e Auditor) · ${NOME[slug] ?? slug}`;

export function sqlParte(slug, itens, n, de, geradoEm) {
  const json = JSON.stringify(itens);
  const tag = dolar(json);
  const revisao = itens.length;
  const notas = itens.filter((i) => i.nota).length;
  return [
    `-- StaziaMed · CARGA DAS EXPLICAÇÕES · parte ${n} de ${de} · ${NOME[slug] ?? slug} (${slug})`,
    `-- Gerado em ${geradoEm} por scripts/carga-explicacoes/gerar-sql.mjs (arquivos prof-*.json e aud-*.json dos agentes Professor e Auditor).`,
    `-- ${revisao} questões entram como "comentário em revisão": o aluno só vê depois que o revisor médico da área (ou o administrador) aprovar.`,
    `-- ${notas} trazem a nota "O que mudou desde a prova", que também espera aprovação. Gabarito, situação, enunciado e alternativas NÃO mudam.`,
    `-- Precisa de 1-Estrutura-carga-das-explicacoes.sql colado antes. Pode colar de novo: o que já está igual não muda (nem perde aprovação).`,
    `-- No fim aparece "OK: ..." (ou "ATENÇÃO: ..." com a lista das puladas na coluna "puladas": mostre ao Claude).`,
    `do $guard$`,
    `begin`,
    `  if to_regprocedure('public.question_explanations_apply(jsonb, text)') is null then`,
    `    raise exception 'Cole antes 1-Estrutura-carga-das-explicacoes.sql e depois esta parte.' using errcode = '55000';`,
    `  end if;`,
    `end`,
    `$guard$;`,
    `select r ->> 'resumo' as resultado, r -> 'puladas' as puladas, r as detalhes`,
    `from (select public.question_explanations_apply(${tag}${json}${tag}::jsonb, ${sqlTexto(rotulo(slug))}) as r) x;`,
    "",
  ].join("\n");
}

export function sqlRegraB(lista, geradoEm) {
  const json = JSON.stringify(lista.map((i) => ({ id: i.id, impressao: i.impressao })));
  const tag = dolar(json, "regrab");
  return [
    `-- StaziaMed · CARGA DAS EXPLICAÇÕES · OPCIONAL: REGRA B (liberar direto ao aluno o que o Auditor deu "ok")`,
    `-- Gerado em ${geradoEm}. SÓ cole se o dono escolher a regra B. Cole DEPOIS das partes das provas.`,
    `-- Libera ${lista.length} questões: veredito "ok" do Auditor, sem pedido de revisão médica, sem suspeita de gabarito, sem "conferir diretriz",`,
    `-- sem nota "O que mudou", confiança do Professor de ${CONFIANCA_MINIMA_B} ou mais, sem alerta e fora da prova de gabarito preliminar.`,
    `-- O banco confere de novo cada uma: só libera se o texto ainda é o da carga, sem devolução e sem decisão anterior de revisor médico.`,
    `-- O resto continua esperando o revisor médico. Fica registrado no Registro de ações (question.explanations_released).`,
    `do $guard$`,
    `begin`,
    `  if to_regprocedure('public.question_explanations_release(jsonb, text)') is null then`,
    `    raise exception 'Cole antes 1-Estrutura-carga-das-explicacoes.sql e as partes das provas.' using errcode = '55000';`,
    `  end if;`,
    `end`,
    `$guard$;`,
    `select r ->> 'resumo' as resultado, r -> 'puladas' as puladas, r as detalhes`,
    `from (select public.question_explanations_release(${tag}${json}${tag}::jsonb, 'Regra B da carga das explicações') as r) x;`,
    "",
  ].join("\n");
}

/** 0-CONFERIR.sql: só lê. Estrutura no banco e, por prova, quantas questões têm hoje exatamente o texto da carga. */
export function sqlConferir(porProva, geradoEm) {
  const linhas = [];
  for (const { slug, itens } of porProva) for (const i of itens) linhas.push(`(${sqlTexto(NOME[slug] ?? slug)}, ${sqlTexto(i.id)}, ${sqlTexto(i.impressao)})`);
  const esperado = linhas.length ? `values\n    ${linhas.join(",\n    ")}` : `select null::text, null::text, null::text where false`;
  const opt = (l) => `coalesce((select o ->> 'explanation' from jsonb_array_elements(q.options) o where o ->> 'id' = '${l}' limit 1), '')`;
  return `-- StaziaMed · CARGA DAS EXPLICAÇÕES · CONFERIR (só lê; não altera nada). Gerado em ${geradoEm}.
-- Rode depois de colar a estrutura e as partes. Resposta: uma linha. "OK: ..." = tudo entrou. "FALTA: ..." = o que não entrou (mostre ao Claude).
with esperado (prova, id, impressao) as (
  ${esperado}
),
estado as (
  select e.prova, e.id, q.id is not null as existe, q.comment_review is not null as em_revisao,
         q.id is not null and md5(concat_ws(chr(31), ${LETRAS.map(opt).join(", ")},
                 coalesce(q.expected_conduct, ''), coalesce(q.inep_intent, ''), coalesce(q.topic, ''), coalesce(q.subtopic, ''))) = e.impressao as igual
  from esperado e left join public.questions q on q.id = e.id
),
por_prova as (
  select prova, count(*) as total, count(*) filter (where igual) as iguais, count(*) filter (where igual and em_revisao) as revisao,
         count(*) filter (where igual and not em_revisao) as no_ar, count(*) filter (where not existe) as sem_questao,
         string_agg(id, ', ' order by id) filter (where not igual) as diferentes
  from estado group by prova
),
falta (ordem, item) as (
  select 1, 'a tabela da nota "O que mudou desde a prova" com RLS e fechada ao app'
   where not coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.question_update_notes'))
                      and not has_table_privilege('anon', to_regclass('public.question_update_notes'), 'select')
                      and not has_table_privilege('authenticated', to_regclass('public.question_update_notes'), 'select'), false)
  union all select 2, 'as funções da carga fechadas ao app (só o editor SQL)'
   where not coalesce((select count(*) from unnest(array['public.question_explanations_apply(jsonb,text)', 'public.question_explanations_release(jsonb,text)']) f
                       where to_regprocedure(f) is not null and not has_function_privilege('authenticated', to_regprocedure(f), 'execute')
                         and not has_function_privilege('anon', to_regprocedure(f), 'execute')) = 2, false)
  union all select 3, 'as funções da equipe (prova inteira e nota) só para quem entrou'
   where not coalesce((select count(*) from unnest(array['public.app_admin_comment_review_exams()', 'public.app_admin_comment_review_exam(text)',
                         'public.app_admin_comment_review_approve_exam(text,text,text)', 'public.app_admin_question_update_note(text)',
                         'public.app_admin_question_update_note_save(text,text)', 'public.app_admin_question_update_note_decide(text,text,text,text)']) f
                       where to_regprocedure(f) is not null and has_function_privilege('authenticated', to_regprocedure(f), 'execute')
                         and not has_function_privilege('anon', to_regprocedure(f), 'execute')) = 6, false)
  union all select 4, 'a correção do aluno com as explicações de estudo da anulada e a nota aprovada (cole a estrutura de novo)'
   where not coalesce((select position('annulled_notes' in pg_get_functiondef(to_regprocedure('public.ch_raw_practice_correction_view(text,text)'))) > 0
                          and position('question_update_note_visible' in pg_get_functiondef(to_regprocedure('public.ch_raw_practice_correction_view(text,text)'))) > 0
                          and position('question_hidden_fields' in pg_get_functiondef(to_regprocedure('public.ch_raw_practice_correction_view(text,text)'))) > 0), false)
  union all select 10 + row_number() over (order by prova), prova || ': ' || iguais || ' de ' || total || ' questões com o texto da carga'
         || case when sem_questao > 0 then ' (' || sem_questao || ' não existem no banco)' else '' end
         || coalesce(' — diferentes: ' || left(diferentes, 300), '')
    from por_prova where iguais < total
)
select case when not exists (select 1 from falta)
            then 'OK: estrutura da carga no banco; ' || coalesce((select string_agg(prova || ' ' || iguais || '/' || total || ' (' || revisao || ' esperando o revisor, ' || no_ar || ' no ar)', '; ' order by prova) from por_prova), 'nenhuma parte de prova neste pacote')
            else 'FALTA: ' || (select string_agg(item, '; ' order by ordem) from falta) end as resultado;
`;
}

// ---------------------------------------------------------------- relatório
const CAB = ["Prova", "Total", "Válidas", "Anuladas", "Professor", "Auditor", "ok", "corrigir", "divergente", "Falta Professor", "Falta Auditor", "Auditoria antiga", "Entram (revisão)", "Regra B (direto)", "Fora", "Notas"];
export function relatorio(resultados, geradoEm, extras = {}) {
  const lin = [];
  const tot = Object.fromEntries(CAB.slice(1).map((c) => [c, 0]));
  const tabela = [`| ${CAB.join(" | ")} |`, `|${CAB.map(() => "---").join("|")}|`];
  for (const r of resultados) {
    const L = r.linhas;
    const c = {
      Total: L.length, "Válidas": L.filter((x) => !x.anulada).length, Anuladas: L.filter((x) => x.anulada).length,
      Professor: L.filter((x) => x.situacao !== "falta_professor").length,
      Auditor: L.filter((x) => !["falta_professor", "falta_auditor"].includes(x.situacao)).length,
      ok: L.filter((x) => x.veredito === "ok" && !["falta_professor", "falta_auditor", "auditoria_antiga"].includes(x.situacao)).length,
      corrigir: L.filter((x) => x.veredito === "corrigir" && !["falta_professor", "falta_auditor", "auditoria_antiga"].includes(x.situacao)).length,
      divergente: L.filter((x) => x.veredito === "divergente" && !["falta_professor", "falta_auditor", "auditoria_antiga"].includes(x.situacao)).length,
      "Falta Professor": L.filter((x) => x.situacao === "falta_professor").length, "Falta Auditor": L.filter((x) => x.situacao === "falta_auditor").length,
      "Auditoria antiga": L.filter((x) => x.situacao === "auditoria_antiga").length,
      "Entram (revisão)": L.filter((x) => x.situacao === "entra").length, "Regra B (direto)": L.filter((x) => x.destino === "direto_b").length,
      Fora: L.filter((x) => x.situacao === "fora" || x.situacao === "divergente").length, Notas: L.filter((x) => x.nota).length,
    };
    for (const k of Object.keys(c)) tot[k] += c[k];
    tabela.push(`| ${r.nome} | ${CAB.slice(1).map((k) => c[k]).join(" | ")} |`);
  }
  tabela.push(`| **Total** | ${CAB.slice(1).map((k) => `**${tot[k]}**`).join(" | ")} |`);
  lin.push(`# Carga das explicações — relatório (${geradoEm})`, "",
    "Gerado por `scripts/carga-explicacoes/gerar-sql.mjs` (ramo carga-explicacoes) a partir dos arquivos dos agentes Professor e Auditor.",
    "Nada foi colado no banco. Rode o gerador de novo quando os agentes avançarem: as contas e o pacote são refeitos.", "",
    "## Como ler", "",
    "- **Entram (revisão)**: vão na parte da prova como \"comentário em revisão\" (o aluno só vê depois do revisor médico).",
    "- **Regra B (direto)**: das que entram, as que podem ir direto ao aluno se o dono escolher a regra B (arquivo opcional do pacote).",
    "- **Falta Auditor / Auditoria antiga**: o Professor escreveu, mas o Auditor ainda não conferiu este texto. Não entram.",
    "- **Fora**: divergentes (esperam a decisão do dono na tela de divergências) e textos com problema de estrutura ou aviso interno.",
    "- ok / corrigir / divergente contam só os vereditos do Auditor sobre o texto atual do Professor.", "",
    "## Contagem por prova", "", ...tabela, "");
  const foras = resultados.flatMap((r) => r.linhas.filter((x) => x.situacao === "fora" || x.situacao === "divergente" || x.situacao === "auditoria_antiga").map((x) => `- ${x.id} (${r.nome}): ${x.situacao === "divergente" ? "DIVERGENTE — " : ""}${x.motivos.join("; ")}`));
  lin.push("## Fora da carga (e por quê)", "", ...(foras.length ? foras : ["- nenhuma"]), "");
  const alertas = resultados.flatMap((r) => r.linhas.filter((x) => x.situacao === "entra" && x.motivos.length).map((x) => `- ${x.id}: ${x.motivos.join("; ")}`));
  lin.push("## Entram, mas com alerta para o revisor médico (nunca direto)", "", ...(alertas.length ? alertas : ["- nenhuma"]), "");
  const avisos = resultados.flatMap((r) => r.avisos);
  if (avisos.length) lin.push("## Avisos de leitura dos arquivos", "", ...avisos.map((a) => `- ${a}`), "");
  if (extras.texto) lin.push(extras.texto, "");
  return lin.join("\n");
}

export function leiaMe({ geradoEm, partes, totalRevisao, totalB, totalNotas, faltam }) {
  return `STAZIAMED - CARGA DAS EXPLICAÇÕES DAS QUESTÕES (gerado em ${geradoEm})
Nada disto foi colado no banco. Pode ser refeito a qualquer hora (por exemplo, depois das decisões do dono nas divergências): o Claude roda o gerador de novo.

O QUE É
  Os agentes escreveram, para cada questão: a explicação da A, B, C e D, a conduta esperada, "o que a questão avalia", o tema e o
  subtema. Nas anuladas, explicações de estudo ("Defensável." ou "Incorreta.") com o aviso "Questão anulada pela banca do Inep. As
  explicações abaixo servem para estudo; nenhuma alternativa conta como gabarito.". Nas desatualizadas, a nota "O que mudou desde a prova".
  O gabarito oficial, a situação da questão, o enunciado e as alternativas NÃO mudam. O texto antigo fica no histórico de cada questão.

ORDEM
  1. Antes: o que está na ORDEM GERAL (leva 3, leva 4, leva 5) já colado E a carga das provas (texto corrigido da revisão de
     fidelidade e a prova 2026/2). Sem ela, a parte da 2026/2 pula todas (as questões ainda não existem no banco) e as questões cujo
     enunciado ainda é o antigo entram, mas nunca vão direto pela regra B (o revisor confere).
  2. 1-Estrutura-carga-das-explicacoes.sql (pode colar de novo sem estragar nada). No fim não aparece nada de erro.
  3. Uma parte por prova (2-Prova-...sql), na ordem que quiser. Cada uma termina com "OK: ..." ou "ATENÇÃO: ..." (mostre ao Claude).
     Partes neste pacote: ${partes.length ? partes.join(", ") : "nenhuma ainda (o Auditor ainda não conferiu nenhuma questão)"}.
  4. SÓ SE ESCOLHER A REGRA B: 3-OPCIONAL-regra-B-liberar-direto.sql.
  5. 0-CONFERIR.sql (só lê): tem de responder "OK: ...". Mostre ao Claude.
  6. O site novo (ramo carga-explicacoes), publicado pelo Claude: é ele que mostra ao aluno as explicações de estudo da anulada, a nota
     "O que mudou desde a prova" e, na Administração, "Aprovar a prova inteira" e a nota para aprovar.

AS DUAS REGRAS DE PUBLICAÇÃO (o dono escolhe)
  A) RECOMENDADA. Tudo entra como "comentário em revisão" (${totalRevisao} questões neste pacote). O aluno só vê depois que o revisor médico
     da área (ou o administrador) aprovar, questão por questão ou com "Aprovar a prova inteira" (Administração > Questões > Fila de
     revisão médica, escolhendo a prova). Aprovar a prova inteira pede a nota do que foi conferido e fica no Registro de ações.
     Por quê: o texto é de agentes de IA; o dono pediu revisão médica humana antes do aluno.
     Enquanto não aprova, o aluno vê a questão sem a explicação nova (o texto antigo sai do ar, como já é a regra do "comentário em revisão").
  B) Cole também o arquivo 3-OPCIONAL: ${totalB} questões vão direto ao aluno (Auditor "ok", sem pedido de revisão médica, sem suspeita
     de gabarito, sem "conferir diretriz", sem nota de atualização, confiança alta, fora da prova de gabarito preliminar). O resto fica
     com o revisor médico.
  Nas duas, a nota "O que mudou desde a prova" (${totalNotas} neste pacote) só aparece depois de aprovada por uma pessoa, uma a uma.

O QUE FICA DE FORA (está no relatório carga-explicacoes-relatorio.md)
  ${faltam}

O QUE PRECISA DO DONO
  - Escolher a regra A (recomendada) ou B.
  - Decidir as divergências na tela de divergências (lista em divergencias-para-o-dono.json). Com a decisão A, B ou C a questão entra
    na próxima geração (sempre em revisão); com D fica de fora.
  - Ter revisores médicos cadastrados por área para aprovar (ou aprovar como administrador).
  - Os temas novos passam a aparecer nos filtros de tema do aluno (o tema antigo fica no histórico); a Taxonomia Médica vai reclassificar depois.
`;
}

// ---------------------------------------------------------------- tudo
export function gerarTudo(opts = {}) {
  const pasta = opts.pasta ?? PASTA_PADRAO;
  const geradoEm = opts.geradoEm ?? new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  // as decisões do dono só valem quando passadas (--decisoes): sem elas, toda divergente fica fora da carga
  const decisoes = opts.decisoes ?? {};
  const resultados = [];
  for (const [slug] of PROVAS) {
    if (!fs.existsSync(path.join(pasta, slug))) continue;
    const prova = lerProva(pasta, slug);
    resultados.push({ slug, nome: prova.nome, avisos: prova.avisos, ...classificarProva(prova, decisoes) });
  }
  return { resultados, geradoEm, pasta };
}

export function escreverPacote({ resultados, geradoEm, pasta }, opts = {}) {
  const saida = opts.saida ?? SAIDA_PADRAO;
  const comItens = resultados.filter((r) => r.itens.length);
  const arquivos = [];
  if (!opts.semPacote) {
    fs.mkdirSync(saida, { recursive: true });
    for (const f of fs.readdirSync(saida)) if (/^(2-Prova-.*|3-OPCIONAL-.*)\.sql$/.test(f)) fs.rmSync(path.join(saida, f));
    fs.copyFileSync(opts.estrutura ?? ESTRUTURA_PADRAO, path.join(saida, "1-Estrutura-carga-das-explicacoes.sql"));
    arquivos.push("1-Estrutura-carga-das-explicacoes.sql");
    comItens.forEach((r, i) => {
      const nome = `2-Prova-${String(i + 1).padStart(2, "0")}-${r.slug}.sql`;
      fs.writeFileSync(path.join(saida, nome), sqlParte(r.slug, r.itens, i + 1, comItens.length, geradoEm));
      arquivos.push(nome);
    });
    const listaB = comItens.flatMap((r) => r.itens.filter((i) => i.carga.regra_b));
    if (listaB.length) {
      fs.writeFileSync(path.join(saida, "3-OPCIONAL-regra-B-liberar-direto.sql"), sqlRegraB(listaB, geradoEm));
      arquivos.push("3-OPCIONAL-regra-B-liberar-direto.sql");
    }
    fs.writeFileSync(path.join(saida, "0-CONFERIR.sql"), sqlConferir(comItens.map((r) => ({ slug: r.slug, itens: r.itens })), geradoEm));
    arquivos.push("0-CONFERIR.sql");
    const fp = resultados.reduce((s, r) => s + r.linhas.filter((x) => x.situacao === "falta_professor").length, 0);
    const fa = resultados.reduce((s, r) => s + r.linhas.filter((x) => ["falta_auditor", "auditoria_antiga"].includes(x.situacao)).length, 0);
    const dv = resultados.reduce((s, r) => s + r.linhas.filter((x) => x.situacao === "divergente").length, 0);
    const fo = resultados.reduce((s, r) => s + r.linhas.filter((x) => x.situacao === "fora").length, 0);
    fs.writeFileSync(path.join(saida, "LEIA-ME.txt"), leiaMe({
      geradoEm, partes: comItens.map((r) => r.nome), totalRevisao: comItens.reduce((s, r) => s + r.itens.length, 0), totalB: listaB.length,
      totalNotas: comItens.reduce((s, r) => s + r.itens.filter((i) => i.nota).length, 0),
      faltam: `${fp} questões ainda sem o Professor; ${fa} sem o Auditor (ou com o texto refeito depois da auditoria); ${dv} divergentes esperando o dono; ${fo} com problema no texto ou decisão D.`,
    }));
    arquivos.push("LEIA-ME.txt");
  }
  fs.writeFileSync(path.join(pasta, "divergencias-para-o-dono.json"), JSON.stringify(resultados.flatMap((r) => r.divergencias), null, 1));
  fs.writeFileSync(path.join(pasta, "perfis-para-similaridade.json"), JSON.stringify(resultados.flatMap((r) => r.perfis), null, 1));
  fs.writeFileSync(path.join(pasta, "carga-explicacoes-relatorio.md"), relatorio(resultados, geradoEm, { texto: opts.textoExtra }));
  return arquivos;
}

// ---------------------------------------------------------------- linha de comando
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const pasta = val("--pasta") ?? PASTA_PADRAO;
  const decisoes = val("--decisoes") ? lerJson(val("--decisoes"), {}) : undefined;
  const r = gerarTudo({ pasta, decisoes });
  const arquivos = escreverPacote(r, { saida: val("--saida"), estrutura: val("--estrutura"), semPacote: args.includes("--sem-pacote") });
  for (const x of r.resultados) {
    const c = (s) => x.linhas.filter((l) => l.situacao === s).length;
    console.log(`${x.nome}: ${x.linhas.length} questões · entram ${c("entra")} (regra B ${x.linhas.filter((l) => l.destino === "direto_b").length}) · divergentes ${c("divergente")} · fora ${c("fora")} · falta Professor ${c("falta_professor")} · falta Auditor ${c("falta_auditor") + c("auditoria_antiga")}`);
  }
  console.log(`Pacote: ${arquivos.length ? arquivos.join(", ") : "(não gravado)"}`);
}
