#!/usr/bin/env node
// Aula pronta → Central de Conteúdo (pedido do dono de 13/10/2026). Lê a pasta de uma aula (aulas-piloto/<tema>/final-v2/, senão
// final/, senão aulas-piloto/<tema>/), monta o PACOTE no formato "staziamed.aula-pronta.v1" (README.md desta pasta), confere e gera o
// pacote de SQL que o dono cola no editor SQL do Supabase:
//   1-Importar-aula.sql  migração 9950 (função app_ch_import_lesson_package) + a aula, numa parte só; termina com "OK: ..."
//   0-CONFERIR.sql       só lê: "OK: ..." ou "FALTA: ..."
//   LEIA-ME.txt          o passo a passo curto
//   pacote-<código>.json o mesmo pacote, para o botão "Importar aula pronta" da Central
// Não conecta em banco nenhum, não usa rede e não usa chave de IA. Conferência que falha = nada é gerado (lista do que falta).
//
// Uso: node scripts/aulas/gerar-sql-importacao.mjs --pasta <aulas-piloto/GR-001> [--saida <pasta>] [--catalogo <catalogo-v2.json>]
//                                                  [--migracao <9950.sql>] [--admin <e-mail>] [--so-pacote]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const FORMATO = "staziamed.aula-pronta.v1";
export const MIGRACAO_PADRAO = path.resolve(AQUI, "../../supabase/migrations/20261003009950_importar_aula_pronta.sql");
export const ADMIN_PADRAO = "araujomendes@staziamed.com.br";
/** Tema da taxonomia da Central para cada aula do roteiro (decisão editorial; o tema precisa existir na taxonomia publicada). */
export const TEMAS = JSON.parse(fs.readFileSync(path.join(AQUI, "temas-central.json"), "utf8"));
const AREA = { "Clínica Médica": "CLINICA_MEDICA", "Ginecologia e Obstetrícia": "GINECOLOGIA_OBSTETRICIA", Pediatria: "PEDIATRIA", Cirurgia: "CIRURGIA", "Medicina de Família e Comunidade": "MFC", "Saúde Mental": "SAUDE_MENTAL", "Saúde Coletiva": "SAUDE_COLETIVA" };

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const lerJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const limpa = (v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());
const lista = (v) => (Array.isArray(v) ? v.map(String) : []);
/** O mesmo link normalizado do banco (ch_url_norm, migração 9610): esquema e host minúsculos, sem "#…", sem utm_, sem :443. */
export function normalizaLink(url) {
  const v = String(url ?? "").trim().split("#")[0];
  if (!v) return null;
  const m = v.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?]*)([^?]*)(\?(.*))?$/);
  if (!m) return v;
  let host = m[2].includes("@") ? m[2].replace(/@([^@]*)$/, (_, h) => "@" + h.toLowerCase()) : m[2].toLowerCase();
  host = host.replace(/:443$/, "");
  const q = (m[5] ?? "").split("&").filter((x) => x !== "" && !/^utm_/i.test(x)).join("&");
  return `${m[1].toLowerCase()}://${host}${m[3]}${q ? "?" + q : ""}`;
}

/** Os mesmos números com unidade do banco (ch_numbers, migração 1400): vírgula vira ponto, sem espaços, minúsculas. */
const UNIDADES = "mg/kg/dia|mg/kg/dose|mg/kg/h|mcg/kg/min|µg/kg/min|mg/kg|mcg/kg|µg/kg|ui/kg|mg/dl|mg/ml|mg/h|g/h|ml/h|ui/h|gotas/min|g/dl|mg|mcg|µg|g|ml/kg|ml|ui|%|mmhg|bpm|kg|cm|mm|dias?|horas?|h|semanas?|meses|mês|anos?|min|vezes";
const RE_NUM = new RegExp(`((?:[<>≤≥]=?\\s*)?\\d+(?:[.,]\\d+)?\\s*(?:${UNIDADES})(?!\\p{L}))`, "giu");
export const numeros = (t) => [...new Set([...String(t ?? "").matchAll(RE_NUM)].map((m) => m[1].replace(/,/g, ".").replace(/\s+/g, "").toLowerCase()))].sort();
/** As mesmas negações e limites do banco (ch_negations). */
const RE_NEG = /(?<![\p{L}\p{N}_])(não|nunca|exceto|contraindicad[oa]s?|proibid[oa]s?|evitar|somente|apenas|sem)(?![\p{L}\p{N}_])/giu;
export const negacoes = (t) => [...new Set([...String(t ?? "").matchAll(RE_NEG)].map((m) => m[1].toLowerCase()))].sort();

/** A pasta usada: final-v2/ (preferida), final/ (versão final, com o manifesto dos arquivos) ou a da aula. */
export function pastaDaAula(pasta) {
  for (const sub of ["final-v3", "final-v2", "final"]) if (fs.existsSync(path.join(pasta, sub, "aula.json"))) return path.join(pasta, sub);
  return pasta;
}
/** Material só da equipe (fontes internas, conferências, prévias): nunca vai como arquivo da aula. */
const INTERNO = /(^|\/)(fontes-internas|fontes|interno|internas?)\//i;
/** Marca de citação que não pode estar no texto do aluno (a mesma regra da migração 9950). */
export const marcaDeCitacao = (t) => /\[\s*[A-Za-z]{0,4}\s*\d+[^\]]{0,40}\]/.test(t ?? "") || /trechos citados/i.test(String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
const TITULO_DE_FONTES = /^(referencias|referencias bibliograficas|fontes|bibliografia)$/i;

/** Tipo do arquivo pelo manifesto ("imagem PNG", "PDF", "image/png"...) ou pela extensão. */
const MIME = { "imagem PNG": "image/png", "imagem JPEG": "image/jpeg", "imagem WEBP": "image/webp", PDF: "application/pdf" };
export const tipoDoArquivo = (it, rel) =>
  MIME[it.tipo] ?? (/^(image|application)\//.test(it.tipo ?? "") ? it.tipo : null) ?? it.content_type ?? it.mime ??
  (/\.pdf$/i.test(rel) ? "application/pdf" : /\.png$/i.test(rel) ? "image/png" : /\.jpe?g$/i.test(rel) ? "image/jpeg" : /\.webp$/i.test(rel) ? "image/webp" : null);
/** De qual material é o arquivo: flashcards (GR-001-F01...), PDF do aluno (pasta pdf/) ou peças visuais (card, story, A4). */
export const materialDoArquivo = (rel) => (/(^|\/)[A-Za-z0-9-]+-F\d{2}-/.test(rel) ? "flashcards" : /^pdf\//.test(rel) || /aluno\.pdf$/i.test(rel) ? "lesson" : "visual_cards");

/**
 * Arquivos entregáveis do manifesto (só imagens e PDF; JSON, comandos, fontes tipográficas e prévias ficam de fora) com o caminho no
 * depósito "content-hub" (aulas-prontas/<código>/<caminho no manifesto>). Confere tamanho e sha256 de cada arquivo na pasta.
 */
export function arquivosDoManifesto(dir, codigo) {
  const p = path.join(dir, "manifesto.json");
  if (!fs.existsSync(p)) return { arquivos: [], problemas: [], existe: false };
  const m = lerJson(p);
  const itens = Array.isArray(m) ? m : m.arquivos ?? m.files ?? [];
  const problemas = [];
  const arquivos = [];
  for (const it of itens) {
    const rel = String(it.caminho ?? it.arquivo ?? it.path ?? "");
    const tipo = tipoDoArquivo(it, rel);
    if (!rel || !tipo || !/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(tipo) || INTERNO.test(rel)) continue;
    if (rel.startsWith("/") || rel.includes("..") || !/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(rel)) { problemas.push(`Manifesto: nome de arquivo inválido: ${rel}.`); continue; }
    const local = path.join(dir, rel);
    const alt = limpa(it.texto_alternativo ?? it.alt ?? "");
    if (!fs.existsSync(local)) problemas.push(`Manifesto: o arquivo ${rel} não está na pasta.`);
    else {
      const b = fs.readFileSync(local);
      if (!/^[0-9a-f]{64}$/.test(it.sha256 ?? "")) problemas.push(`Manifesto: ${rel} sem sha256.`);
      else if (sha(b) !== it.sha256) problemas.push(`Manifesto: o sha256 de ${rel} não confere com o arquivo.`);
      if (it.bytes != null && Number(it.bytes) !== b.length) problemas.push(`Manifesto: o tamanho de ${rel} não confere com o arquivo.`);
    }
    if (tipo.startsWith("image/") && !alt) problemas.push(`Manifesto: a imagem ${rel} não tem texto alternativo.`);
    arquivos.push({
      local: rel,
      caminho: `aulas-prontas/${codigo}/${rel}`,
      sha256: it.sha256 ?? null,
      bytes: fs.existsSync(local) ? fs.statSync(local).size : it.bytes ?? null,
      tipo,
      texto_alternativo: alt || null,
      descricao: limpa(it.descricao ?? "") || (tipo === "application/pdf" ? `PDF${it.paginas ? ` de ${it.paginas} página(s)` : ""}` : null),
      material: it.material ?? materialDoArquivo(rel),
    });
  }
  return { arquivos, problemas, existe: true };
}

/** Monta o pacote a partir da pasta da aula. Devolve { pacote, problemas, avisos, dir }. */
export function montarPacote(pastaAula, opcoes = {}) {
  const dir = pastaDaAula(pastaAula);
  const problemas = [];
  const avisos = [];
  const ler = (nome, obrigatorio = true) => {
    // a v3 guarda as fontes em fontes-internas/; o que não está na pasta final pode estar na pasta da aula
    const p = [path.join(dir, nome), path.join(dir, "fontes-internas", nome), path.join(dir, "..", nome)].find((x) => fs.existsSync(x)) ?? path.join(dir, nome);
    if (!fs.existsSync(p)) {
      if (obrigatorio) problemas.push(`Falta o arquivo ${nome} em ${dir}.`);
      return null;
    }
    return lerJson(p);
  };
  const aula = ler("aula.json");
  const fontes = ler("fontes.json");
  const campos = ler("lessons_campos.json", false);
  const flash = ler("flashcards.json", false);
  const fix = ler("fixacao.json", false);
  const card = ler("card_resumo.json", false);
  const visual = ler("visual_briefing.json", false);
  if (!aula || !fontes) return { pacote: null, problemas, avisos, dir };

  const codigo = limpa(aula.codigo_roteiro);
  const tema = opcoes.tema ?? TEMAS[codigo] ?? null;
  if (!tema) problemas.push(`A aula ${codigo || "?"} não tem tema da Central em scripts/aulas/temas-central.json (área, subárea e tema que já existem na taxonomia).`);
  const area = tema?.area ?? AREA[limpa(aula.area)] ?? null;

  const afirmacoes = (fontes.afirmacoes ?? []).map((a) => ({
    id: limpa(a.id),
    texto: limpa(a.texto),
    tipo: limpa(a.tipo) || null,
    fonte: limpa(a.doc_id),
    pagina: Number(a.pagina_pdf),
    pagina_impressa: a.pagina_impressa == null ? null : String(a.pagina_impressa),
    citacao: limpa(a.citacao_literal),
    leitura: a.ocr ? "ocr" : "texto_digital",
    conferencia: { ok: a.validacao_ok === true, por: "validar_trecho.py", em: a.validado_em ?? fontes.gerado_em ?? null },
    tipos_criticos: lista(a.tipos_criticos),
  }));
  const ids = new Set(afirmacoes.map((a) => a.id));
  for (const a of afirmacoes) {
    if (!a.citacao) problemas.push(`Afirmação ${a.id}: sem citação literal.`);
    if (!a.conferencia.ok) problemas.push(`Afirmação ${a.id}: a citação não passou na conferência literal (validacao_ok diferente de true).`);
    if (!Number.isInteger(a.pagina) || a.pagina < 1) problemas.push(`Afirmação ${a.id}: sem página do PDF.`);
    if (a.leitura === "ocr") avisos.push(`Afirmação ${a.id}: trecho lido por OCR (o revisor confere no PDF).`);
    // a conferência do sistema (app_ch_link_evidence): número fora do trecho = recusa; negação fora do trecho = evidência "insuficiente"
    const fora = numeros(a.texto).filter((n) => !numeros(a.citacao).includes(n));
    if (fora.length) problemas.push(`Afirmação ${a.id}: valores que não constam do trecho citado: ${fora.join(", ")}.`);
    const neg = negacoes(a.texto).filter((n) => !negacoes(a.citacao).includes(n));
    if (neg.length)
      avisos.push(`Afirmação ${a.id}: tem "${neg.join('", "')}" e o trecho citado não; pela regra da Central a evidência entra "insuficiente" e trava a publicação até o texto ser corrigido (ex.: usar a forma do documento) ou ligar um trecho com a condição.`);
  }
  const refs = (fontes.fontes ?? []).map((f) => ({ ref: limpa(f.doc_id), url: limpa(f.url_oficial ?? f.url), titulo: limpa(f.titulo), versao: limpa(f.versao) || null }));
  for (const a of afirmacoes) if (!refs.some((f) => f.ref === a.fonte)) problemas.push(`Afirmação ${a.id}: a fonte ${a.fonte} não está na lista de fontes.`);
  for (const f of refs) if (!f.url) problemas.push(`Fonte ${f.ref}: sem endereço oficial.`);

  const confere = (onde, lst) => {
    const fora = lista(lst).filter((x) => !ids.has(x));
    if (fora.length) problemas.push(`${onde}: cita afirmação que não existe no fontes.json: ${fora.join(", ")}.`);
    return lista(lst);
  };
  const sections = (aula.sections ?? []).map((s, i) => ({
    heading: limpa(s.heading),
    paragraphs: (s.paragraphs ?? []).map((p, j) => ({ text: limpa(p.text), clinical: Boolean(p.clinical), claim_ids: confere(`Aula, seção ${i + 1}, parágrafo ${j + 1}`, p.claim_ids ?? p.claims) })),
  }));
  // o que o aluno lê não leva referência (decisão do dono, 13/10): as fontes ficam só nas afirmações (para o revisor e a equipe)
  const semReferencia = (onde, t, titulo = false) => {
    const sem = String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (marcaDeCitacao(t) || (titulo && TITULO_DE_FONTES.test(sem)))
      problemas.push(`${onde}: o texto do aluno não pode trazer referência (marca de citação, "Referências" ou "Trechos citados").`);
  };
  sections.forEach((sec, i) => {
    semReferencia(`Aula, seção ${i + 1}`, sec.heading, true);
    sec.paragraphs.forEach((p, j) => semReferencia(`Aula, seção ${i + 1}, parágrafo ${j + 1}`, p.text));
  });
  // ajustes de ligação (scripts/aulas/ajustes/<código>.json): só ligam afirmação a parágrafo; nenhuma palavra do texto muda e o aviso fica no relatório
  const ajustesArq = opcoes.ajustes ?? path.join(AQUI, "ajustes", `${codigo}.json`);
  if (fs.existsSync(ajustesArq)) {
    for (const l of lerJson(ajustesArq).ligar ?? []) {
      const par = sections[l.secao - 1]?.paragraphs?.[l.paragrafo - 1];
      if (!par) problemas.push(`Ajuste de ligação ${l.afirmacao}: seção ${l.secao}, parágrafo ${l.paragrafo} não existe.`);
      else if (!ids.has(l.afirmacao)) problemas.push(`Ajuste de ligação: a afirmação ${l.afirmacao} não existe.`);
      else if (!par.claim_ids.includes(l.afirmacao)) {
        par.claim_ids.push(l.afirmacao);
        avisos.push(`Ajuste de ligação: ${l.afirmacao} ligada à seção ${l.secao}, parágrafo ${l.paragrafo} da aula (${l.motivo}). Nenhuma palavra do texto mudou; o agente de conteúdo deve confirmar.`);
      }
    }
  }
  const resumo = campos
    ? (campos.key_points ?? []).map((t, i) => ({ text: limpa(t), claim_ids: confere(`Ponto-chave ${i + 1}`, (campos.key_points_claims ?? [])[i]) }))
    : [];
  // flashcards: o texto que vai ao baralho da Central (material_central) + o código do cartão do roteiro
  const cartoes = flash?.cartoes ?? [];
  const flashcards = (flash?.material_central?.cards ?? []).map((c, i) => {
    const par = cartoes.find((x) => limpa(x.frente) === limpa(c.front)) ?? cartoes[i];
    return { front: limpa(c.front), back: limpa(c.back), card_id: par?.id ?? null, claim_ids: confere(`Flashcard ${i + 1}`, c.claim_ids ?? par?.afirmacoes) };
  });
  const questoes = (fix?.items ?? []).map((q, i) => ({
    number: q.numero ?? i + 1,
    dimension: limpa(q.dimensao) || null,
    stem: limpa(q.stem),
    options: (q.options ?? []).map((o) => ({ id: o.id, text: limpa(o.text) })),
    correct: q.correct,
    comments: (q.comments ?? []).map((o) => ({ id: o.id, text: limpa(o.text) })),
    claim_ids: confere(`Questão ${i + 1}`, q.claim_ids),
  }));
  resumo.forEach((r, i) => semReferencia(`Ponto-chave ${i + 1}`, r.text));
  flashcards.forEach((c, i) => semReferencia(`Flashcard ${i + 1}`, `${c.front} ${c.back}`));
  questoes.forEach((q, i) => semReferencia(`Questão ${i + 1}`, [q.stem, ...q.options.map((o) => o.text), ...q.comments.map((o) => o.text)].join(" ")));
  const comandos = [];
  for (const modelo of ["feed", "story"]) if (card?.[modelo]?.comando) comandos.push({ modelo, comando: card[modelo].comando, claim_ids: confere(`Card ${modelo}`, card[modelo].afirmacoes) });
  if (visual?.comando) {
    const daPeca = [...new Set(Object.values(visual.fontes_por_item ?? {}).flat().map((x) => x.id))];
    comandos.push({ modelo: visual.modelo_recomendado ?? "a4", titulo: limpa(visual.briefing_do_roteiro) || null, comando: visual.comando, claim_ids: confere("Peça A4", daPeca) });
  }
  const man = arquivosDoManifesto(dir, codigo);
  problemas.push(...man.problemas);
  if (!man.existe) avisos.push(`Sem manifesto.json em ${dir}: a aula entra sem as imagens e o PDF (dá para importar de novo quando o manifesto existir).`);

  const pacote = {
    formato: FORMATO,
    codigo,
    titulo: limpa(aula.titulo),
    tema: { area, subarea: tema?.subarea ?? limpa(aula.subarea), tema: tema?.tema ?? null },
    escopo: limpa(aula.escopo) || null,
    fontes: refs,
    afirmacoes,
    aula: { label: limpa(aula.label) || "Material StaziaMed", sections },
    resumo: { items: resumo },
    flashcards: { cards: flashcards },
    questoes: { items: questoes },
    visuais: { comandos },
    arquivos: man.arquivos.map(({ local, ...a }) => a),
  };

  // fontes conferidas contra a biblioteca exportada (opcional): fonte fora dela = recusa
  if (opcoes.catalogo) {
    const cat = lerJson(opcoes.catalogo);
    const linhas = Array.isArray(cat) ? cat : cat.fontes ?? [];
    const links = new Set(linhas.map((x) => normalizaLink(x.url)).filter(Boolean));
    const faltam = refs.filter((f) => !links.has(normalizaLink(f.url)));
    for (const f of faltam) problemas.push(`Fonte fora da biblioteca (${path.basename(opcoes.catalogo)}): "${f.titulo}" (${f.url}).`);
  }
  return { pacote, problemas, avisos, dir, arquivosLocais: man.arquivos };
}

const tag = (txt, base) => {
  let t = base;
  while (txt.includes(`$${t}$`)) t += "x";
  return `$${t}$`;
};

/** A parte de SQL que importa a aula (entra como o administrador indicado). */
export function sqlDaAula(pacote, admin = ADMIN_PADRAO) {
  const json = JSON.stringify(pacote);
  const q = tag(json, "pacote");
  return `-- ---------------------------------------------------------------- a aula ${pacote.codigo}: ${pacote.titulo}
-- Entra como o administrador ${admin} (precisa existir e ser administrador). Só a função oficial app_ch_import_lesson_package:
-- a aula termina "aguardando revisão" (nunca aprovada nem publicada). Colar de novo não muda nada.
create temp table if not exists _aula_importada (codigo text primary key, resultado jsonb);
delete from _aula_importada where codigo = '${pacote.codigo}';
do $aula_do$
declare
  v_admin uuid;
  r jsonb;
begin
  select u.id into v_admin from auth.users u where lower(u.email) = lower('${admin}') limit 1;
  if v_admin is null then raise exception 'Não achei o usuário % em auth.users.', '${admin}'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  if not public.is_admin() then raise exception 'O usuário % não é administrador.', '${admin}'; end if;
  r := public.app_ch_import_lesson_package(${q}${json}${q}::jsonb);
  insert into _aula_importada (codigo, resultado) values ('${pacote.codigo}', r);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end
$aula_do$;
select case when x.resultado ->> 'status' in ('awaiting_review', 'approved', 'published', 'needs_update', 'draft') then
         'OK: aula ' || x.codigo || ' ' ||
         case x.resultado ->> 'resultado' when 'sem_mudanca' then 'já estava importada (nada mudou)'
                                          when 'criada' then 'importada'
                                          when 'atualizada' then 'atualizada (as aprovações desta versão deixaram de valer)'
                                          else 'importada como versão nova (a versão aprovada ou publicada continua como está)' end ||
         ': versão ' || (x.resultado ->> 'version') || ', ' ||
         case x.resultado ->> 'status' when 'awaiting_review' then 'aguardando revisão médica e editorial' when 'approved' then 'aprovada (pelas pessoas)'
                                       when 'published' then 'publicada (pelas pessoas)' else x.resultado ->> 'status' end ||
         '; ' || (x.resultado ->> 'afirmacoes') || ' afirmações com evidência' ||
         coalesce(' (' || nullif(x.resultado ->> 'afirmacoes_novas', '0') || ' novas)', '') ||
         '; materiais: ' || coalesce((select string_agg(k, ', ') from jsonb_array_elements_text(x.resultado -> 'materiais') k), '-') ||
         coalesce('; ' || nullif(x.resultado ->> 'arquivos', '0') || ' arquivos referenciados', '') ||
         case when jsonb_array_length(coalesce(x.resultado -> 'avisos', '[]'::jsonb)) > 0 then '; avisos para o revisor: ' || jsonb_array_length(x.resultado -> 'avisos') else '' end
       else 'ERRO: situação inesperada: ' || coalesce(x.resultado::text, 'sem resposta') end as resultado
  from _aula_importada x where x.codigo = '${pacote.codigo}';
`;
}

/** 0-CONFERIR.sql: só lê. Uma linha "OK: ..." ou "FALTA: ...". */
export function sqlConferir(pacote) {
  const json = JSON.stringify(pacote);
  const q = tag(json, "pacote");
  const fontes = pacote.fontes.map((f) => `(${lit(f.ref)}, ${lit(f.titulo)}, ${lit(f.url)})`).join(",\n    ");
  return `-- StaziaMed · AULA PRONTA ${pacote.codigo} · CONFERIR (só lê; não altera nada). Rode antes (diz o que falta) e DEPOIS de colar 1-Importar-aula.sql.
-- Resposta: uma linha. "OK: ..." = a aula está na fila de revisão médica. "FALTA: ..." = o que não entrou (mostre ao Claude).
with pk as (select ${q}${json}${q}::jsonb as j),
fontes (ref, titulo, url) as (values
    ${fontes}),
tema as (
  select n.id from public.ch_taxonomy_nodes n join public.ch_taxonomy_versions tv on tv.id = n.version_id and tv.status = 'published'
   where n.level in ('theme', 'subtheme') and n.status = 'active'
     and public.fold_text(btrim(n.name)) = public.fold_text(${lit(pacote.tema.tema)}) limit 1),
unidade as (
  select u.id from public.ch_units u, tema where u.theme_node_id = tema.id and lower(btrim(u.title)) = lower(${lit(pacote.titulo)}) order by u.created_at limit 1),
versao as (
  select v.* from public.ch_unit_versions v, unidade, pk
   where v.unit_id = unidade.id and v.base_hash = 'aula-pronta:' || public.ch_hash(pk.j) order by v.version desc limit 1),
falta (ordem, item) as (
  select 1, 'a função de importação (cole 1-Importar-aula.sql)'
   where to_regprocedure('public.app_ch_import_lesson_package(jsonb)') is null
  union all select 2, 'a função de importação só para quem entrou e com caminho fixo (visitante não executa)'
   where to_regprocedure('public.app_ch_import_lesson_package(jsonb)') is not null
     and not coalesce((select p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=%' from pg_proc p where p.oid = to_regprocedure('public.app_ch_import_lesson_package(jsonb)'))
                      and not coalesce(has_function_privilege('anon', to_regprocedure('public.app_ch_import_lesson_package(jsonb)'), 'execute'), true)
                      and coalesce(has_function_privilege('authenticated', to_regprocedure('public.app_ch_import_lesson_package(jsonb)'), 'execute'), false), false)
  union all select 3, 'as colunas do trecho (tipo de leitura e conferência literal)'
   where (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'ch_source_passages' and column_name in ('reading_kind', 'literal_check')) <> 2
  union all select 4, 'fonte na biblioteca: ' || f.titulo
    from fontes f where not exists (select 1 from public.ch_sources s where public.ch_url_norm(s.url) = public.ch_url_norm(f.url) and s.status = 'current')
  union all select 5, 'o tema "' || ${lit(pacote.tema.tema)} || '" na taxonomia publicada da Central' where not exists (select 1 from tema)
  union all select 6, 'a aula ${pacote.codigo} na Central (cole 1-Importar-aula.sql)' where not exists (select 1 from versao)
  union all select 7, 'as ${pacote.afirmacoes.length} afirmações da aula, cada uma com evidência e o trecho citado (página e conferência literal)'
   where exists (select 1 from versao) and (select count(*) from public.ch_unit_claims uc join versao on versao.id = uc.unit_version_id
                  where exists (select 1 from public.ch_evidence e join public.ch_source_passages sp on sp.id = e.passage_id
                                 where e.claim_id = uc.claim_id and e.verdict in ('compatible', 'insufficient') and e.discarded_at is null
                                   and to_jsonb(sp) ->> 'literal_check' is not null and to_jsonb(sp) ->> 'reading_kind' is not null)) <> ${pacote.afirmacoes.length}
  union all select 8, 'os materiais da aula (aula, pontos-chave, cards, flashcards e questões)'
   where exists (select 1 from versao) and (select count(*) from public.ch_materials m join versao on versao.id = m.unit_version_id) < ${materiaisEsperados(pacote).length}
)
select case when not exists (select 1 from falta) then
  'OK: aula ${pacote.codigo} na Central: versão ' || v.version || ', ' ||
  case v.status when 'awaiting_review' then 'aguardando revisão médica e editorial (na fila "Aguardando revisão" de Central > Unidades)'
                when 'approved' then 'aprovada pelas pessoas (falta o administrador publicar)'
                when 'published' then 'publicada pelas pessoas' else v.status end ||
  '; ' || (select count(*) from public.ch_unit_claims uc where uc.unit_version_id = v.id) || ' afirmações com o trecho citado (' ||
  (select count(*) from public.ch_unit_claims uc join public.ch_claims c on c.id = uc.claim_id where uc.unit_version_id = v.id and c.status = 'compatible') ||
  ' compatíveis' || coalesce(', ' || nullif((select count(*) from public.ch_unit_claims uc join public.ch_claims c on c.id = uc.claim_id
                                            where uc.unit_version_id = v.id and c.status <> 'compatible'), 0) || ' para o revisor corrigir', '') ||
  '); materiais: ' ||
  (select string_agg(m.kind, ', ' order by m.kind) from public.ch_materials m where m.unit_version_id = v.id) ||
  '; arquivo final da aula: ' || case when exists (select 1 from public.ch_materials m join public.ch_renders x on x.material_id = m.id and x.material_hash = m.content_hash and coalesce((x.check_result ->> 'ok')::boolean, false)
                                                  where m.unit_version_id = v.id and m.kind = 'lesson') then 'gerado e conferido'
                                      else 'ainda não gerado (o processamento gera sozinho, sem IA)' end
  else 'FALTA: ' || (select string_agg(item, '; ' order by ordem, item) from falta) || '.' end as conferencia
from (select 1) um left join versao v on true;
`;
}
/** Materiais que a função grava para este pacote (a mesma regra da migração 9950). */
export const materiaisEsperados = (p) => ["lesson", p.resumo.items.length && "summary", (p.resumo.items.length || p.visuais.cards?.length) && "visual_cards", p.flashcards.cards.length && "flashcards", p.questoes.items.length && "questions"].filter(Boolean);
const lit = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);

export function leiaMe(pacote, avisos, arquivos) {
  return `AULA PRONTA ${pacote.codigo} NA CENTRAL DE CONTEÚDO (${new Date().toISOString().slice(0, 10).split("-").reverse().join("/")})
=====================================================================

O que é: coloca a aula "${pacote.titulo}" na Central de Conteúdo,
na fila "Aguardando revisão" de Unidades e revisão. NÃO publica nada para o aluno.
Não usa IA. Cada afirmação clínica entra com o trecho literal e a página da fonte oficial.

ANTES: cole o pacote da rodada 2 inteiro (pasta publicacao-staziamed-2026-10-13-rodada2,
na ordem do 0-ORDEM-DE-COLAGEM.txt).

ORDEM (editor SQL do Supabase, papel "postgres"; cole o arquivo INTEIRO > Run)
  1. 0-CONFERIR.sql        -> antes, mostra "FALTA: ..." (normal).
  2. 1-Importar-aula.sql   -> grava. Entra como ${ADMIN_PADRAO}.
                              Termina com "OK: aula ${pacote.codigo} importada: versão 1, aguardando revisão ...".
  3. 0-CONFERIR.sql        -> tem que começar com "OK:".
  Pode colar o 1 de novo: responde "já estava importada (nada mudou)".
  Se aparecer ERRO, PARE e mostre ao Claude (a mensagem lista o que falta).

O QUE ENTRA
  - ${pacote.afirmacoes.length} afirmações clínicas, cada uma com o trecho literal e a página do PDF de ${pacote.fontes.length} fontes oficiais
    que já estão na biblioteca (catálogo de fontes oficiais colado em 13/10).
  - Texto da aula (${pacote.aula.sections.length} seções), ${pacote.resumo.items.length} pontos-chave, ${pacote.flashcards.cards.length} flashcards, ${pacote.questoes.items.length} questões de fixação
    (marcadas "Questão StaziaMed, não é questão oficial do Inep") e ${pacote.visuais.comandos.length} comandos de peças visuais.
  - ${arquivos.length ? `${arquivos.length} arquivos (imagens e PDF) só como referência; os arquivos sobem pelo script scripts/aulas/subir-arquivos.mjs, só com a sua autorização.` : "Sem imagens nem PDF nesta importação (o manifesto ainda não existia)."}
  - Tema da Central: ${pacote.tema.area} > ${pacote.tema.subarea} > ${pacote.tema.tema}.
  - O aluno não vê nenhuma referência (sem lista de fontes, páginas ou trechos): as fontes ficam na Central, para o revisor e a equipe.

DEPOIS (pessoas, na tela Central > Unidades e revisão)
  1. O processamento gera sozinho o PDF conferido da aula (sem IA). Precisa do site/Cloud Run deste ramo.
  2. Revisor médico de Clínica Médica: confere as afirmações com dose, tempo ou via ("Conferir") e aprova a revisão médica.
  3. Editor ou você: aprovação editorial.
  4. Você (administrador): Publicar. A aula aparece em Estudar > Aulas e os flashcards no baralho StaziaMed.
     (A publicação continua desligada e em modo sombra até você mudar em Configuração.)
${avisos.length ? `\nAVISOS PARA A REVISÃO\n${avisos.map((a) => `  - ${a}`).join("\n")}\n` : ""}`;
}

async function principal() {
  const args = process.argv.slice(2);
  const valor = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  const pasta = valor("--pasta");
  if (!pasta) throw new Error("Informe a pasta da aula: --pasta aulas-piloto/GR-001");
  const { pacote, problemas, avisos, dir, arquivosLocais } = montarPacote(pasta, { catalogo: valor("--catalogo") });
  console.log(`Pasta lida: ${dir}`);
  if (problemas.length) {
    console.log(`RECUSADO: ${problemas.length} problema(s). Nada foi gerado.`);
    for (const p of problemas) console.log(`  - ${p}`);
    process.exitCode = 1;
    return;
  }
  const codigo = pacote.codigo;
  const saida = valor("--saida") ?? path.join(process.env.HOME ?? ".", "Downloads", `publicacao-staziamed-2026-10-13-aula-${codigo.toLowerCase().replace(/[^a-z0-9]/g, "")}`);
  fs.mkdirSync(saida, { recursive: true });
  fs.writeFileSync(path.join(saida, `pacote-${codigo}.json`), JSON.stringify(pacote, null, 1) + "\n");
  if (!args.includes("--so-pacote")) {
    const migracao = fs.readFileSync(valor("--migracao") ?? MIGRACAO_PADRAO, "utf8");
    const cab = `-- =============================================================================\n-- STAZIAMED · AULA PRONTA ${codigo} NA CENTRAL DE CONTEÚDO · parte única (função de importação + a aula)\n-- Gerado por scripts/aulas/gerar-sql-importacao.mjs. Pode colar de novo: não duplica nada.\n-- =============================================================================\n\n`;
    fs.writeFileSync(path.join(saida, "1-Importar-aula.sql"), cab + migracao + "\n" + sqlDaAula(pacote, valor("--admin") ?? ADMIN_PADRAO));
    fs.writeFileSync(path.join(saida, "0-CONFERIR.sql"), sqlConferir(pacote));
    fs.writeFileSync(path.join(saida, "LEIA-ME.txt"), leiaMe(pacote, avisos, arquivosLocais));
  }
  console.log(`OK: ${pacote.afirmacoes.length} afirmações, ${pacote.aula.sections.length} seções, ${pacote.flashcards.cards.length} flashcards, ${pacote.questoes.items.length} questões, ${pacote.arquivos.length} arquivos. Saída: ${saida}`);
  for (const a of avisos) console.log(`  aviso: ${a}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
