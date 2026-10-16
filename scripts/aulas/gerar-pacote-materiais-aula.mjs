#!/usr/bin/env node
// Pacote do dono: atualiza SÓ os materiais visuais de uma aula que já está na Central (comandos das peças e o manifesto das imagens e
// PDFs), sem mudar o texto da aula. Usado na GR-001 v5 (14/10/2026: paleta v2, logo nova, sem linha de fonte nas peças).
// Gera em <saida>/:
//   0-CONFERIR.sql                     só lê: "OK: ..." (materiais já na versão nova) ou "FALTA: ..."; nunca dá erro
//   1-Atualizar-materiais-<código>-<versão>.sql
//                                      reimporta a aula pela função oficial app_ch_import_lesson_package com o MESMO texto e os
//                                      materiais novos. Trava: se o texto da aula, as afirmações, os flashcards, as questões ou o resumo
//                                      mudassem, ou se a versão na Central já estiver aprovada/publicada, nada é gravado (erro e volta).
//   LEIA-ME.txt
//   pacote-<código>-<versão>.json      o mesmo pacote (para o script de envio dos arquivos e o botão "Importar aula pronta")
// Os arquivos vão para uma pasta própria da versão no depósito (aulas-prontas/<código>/<versão>/...), para não colidir com os da versão
// anterior (o envio nunca sobrescreve arquivo diferente). Não conecta em banco, não usa rede e não usa chave de IA.
//
// Uso: node scripts/aulas/gerar-pacote-materiais-aula.mjs --pasta <aulas-piloto/GR-001/final-v5> --versao v5
//        [--saida <pasta>] [--admin <e-mail>] [--anterior <pasta da versão já importada, para conferir que o texto é igual>]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_PADRAO, montarPacote } from "./gerar-sql-importacao.mjs";

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const tag = (txt, base) => {
  let t = base;
  while (txt.includes(`$${t}$`)) t += "x";
  return `$${t}$`;
};
/** Partes do pacote que são TEXTO (não podem mudar numa atualização só de materiais). */
export const PARTES_DE_TEXTO = ["codigo", "titulo", "tema", "escopo", "fontes", "afirmacoes", "aula", "resumo", "flashcards", "questoes"];

/** Monta o pacote da pasta e põe os arquivos na pasta da versão no depósito. */
export function pacoteDeMateriais(pasta, versao) {
  const r = montarPacote(pasta);
  if (r.problemas.length) return r;
  const prefixo = `aulas-prontas/${r.pacote.codigo}/`;
  r.pacote.arquivos = r.pacote.arquivos.map((a) => ({ ...a, caminho: a.caminho.startsWith(prefixo) ? `${prefixo}${versao}/${a.caminho.slice(prefixo.length)}` : a.caminho }));
  return r;
}

/** Diferenças de texto entre dois pacotes (vazio = só materiais mudaram). */
export const diferencasDeTexto = (a, b) => PARTES_DE_TEXTO.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

/** Condição SQL: o material visual da versão já tem estes comandos e estes arquivos. */
function sqlMateriaisIguais(pacote, alias = "v_ver") {
  const shas = pacote.arquivos.map((a) => a.sha256).sort();
  const comandos = pacote.visuais.comandos.map((c) => c.comando);
  return `(select coalesce(jsonb_agg(c ->> 'comando' order by o), '[]'::jsonb) from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'comandos', '[]'::jsonb)) with ordinality t (c, o)
     where m.unit_version_id = ${alias} and m.kind = 'visual_cards') = ${lit(JSON.stringify(comandos))}::jsonb
   and (select coalesce(jsonb_agg(f ->> 'sha256' order by f ->> 'sha256'), '[]'::jsonb) from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'arquivos', '[]'::jsonb)) f
     where m.unit_version_id = ${alias}) = ${lit(JSON.stringify(shas))}::jsonb`;
}

/** A versão da aula na Central que veio da importação de aula pronta (a mais recente). */
const sqlVersao = (codigo) => `select v.id, v.version, v.status, v.content_hash from public.ch_unit_versions v
     where exists (select 1 from public.ch_audit a where a.action = 'unit.import' and a.target = v.id::text and a.details ->> 'codigo' = ${lit(codigo)})
     order by v.created_at desc, v.version desc limit 1`;

export function sqlConferir(pacote, versao) {
  const c = pacote.codigo;
  return `-- StaziaMed · ${c}: MATERIAIS ${versao.toUpperCase()} NA CENTRAL · CONFERIR (só lê; só cria uma tabela temporária da sessão). Rode antes e depois do arquivo 1.
-- Resposta: uma linha. "OK: ..." (materiais já na ${versao}) ou "FALTA: ...". Nunca dá erro, mesmo com o banco incompleto.
create temp table if not exists _materiais_conferir (conferencia text);
delete from _materiais_conferir;
do $conf$
declare
  v_ver record;
  v_ok boolean;
begin
  if to_regprocedure('public.app_ch_import_lesson_package(jsonb)') is null or to_regclass('public.ch_unit_versions') is null or to_regclass('public.ch_audit') is null or to_regclass('public.ch_materials') is null then
    insert into _materiais_conferir values ('FALTA: a função de importação de aula pronta (cole antes os pacotes aula-gr001 e central-unidades).');
    return;
  end if;
  ${sqlVersao(c).replace(/^select/, "select").replace(/limit 1$/, "limit 1")} into v_ver;
  if v_ver.id is null then
    insert into _materiais_conferir values ('FALTA: a ${c} ainda não está na Central (cole antes o 2-Atualizar-GR-001-v3.sql do pacote de 13/10).');
    return;
  end if;
  select ${sqlMateriaisIguais(pacote, "v_ver.id")} into v_ok;
  insert into _materiais_conferir values (
    case when v_ok then 'OK: ${c} versão ' || v_ver.version || ' (' || v_ver.status || ') com os materiais ${versao}: ${pacote.visuais.comandos.length} comandos das peças e ${pacote.arquivos.length} arquivos (imagens e PDFs). Texto da aula sem mudança.'
         else 'FALTA: a ${c} versão ' || v_ver.version || ' (' || v_ver.status || ') ainda está com os materiais anteriores (cole o arquivo 1).' end);
end
$conf$;
select conferencia from _materiais_conferir;
`;
}

export function sqlAtualizar(pacote, versao, admin = ADMIN_PADRAO) {
  const json = JSON.stringify(pacote);
  const q = tag(json, "pacote");
  const c = pacote.codigo;
  return `-- =============================================================================
-- STAZIAMED · ${c}: MATERIAIS ${versao.toUpperCase()} NA CENTRAL (comandos das peças e ${pacote.arquivos.length} imagens e PDFs). NÃO muda o texto da aula.
-- Entra como o administrador ${admin}. Só a função oficial app_ch_import_lesson_package. A aula continua "aguardando revisão": nada é
-- aprovado nem publicado. TRAVAS (se qualquer uma falhar, NADA é gravado): a ${c} precisa já estar na Central, a versão não pode estar
-- aprovada nem publicada, e o texto da aula, as afirmações, o resumo, os flashcards e as questões têm que continuar iguais.
-- Pode colar de novo: não muda nada.
-- =============================================================================
do $pre$
begin
  if to_regprocedure('public.app_ch_import_lesson_package(jsonb)') is null then raise exception 'Cole antes o pacote aula-gr001 (função de importação de aula pronta).'; end if;
end
$pre$;
create temp table if not exists _materiais_resultado (linha text);
delete from _materiais_resultado;
do $mat_do$
declare
  v_admin uuid;
  v_ver record;
  v_depois record;
  v_textos_antes jsonb;
  v_textos_depois jsonb;
  r jsonb;
begin
  select u.id into v_admin from auth.users u where lower(u.email) = lower(${lit(admin)}) limit 1;
  if v_admin is null then raise exception 'Não achei o usuário % em auth.users.', ${lit(admin)}; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  if not public.is_admin() then raise exception 'O usuário % não é administrador.', ${lit(admin)}; end if;

  ${sqlVersao(c)} into v_ver;
  if v_ver.id is null then raise exception 'A ${c} ainda não está na Central: cole antes o 2-Atualizar-GR-001-v3.sql do pacote de 13/10.'; end if;
  if v_ver.status not in ('draft', 'awaiting_review') then
    raise exception 'A ${c} versão % está "%": não mexo em versão aprovada ou publicada (a importação criaria outra versão). Fale com o Claude.', v_ver.version, v_ver.status;
  end if;

  -- o que é TEXTO (texto da aula sem os arquivos, resumo, flashcards sem os arquivos, questões) antes da atualização
  select jsonb_build_object('unidade', v.content_hash,
           'materiais', (select coalesce(jsonb_object_agg(m.kind, m.content - 'arquivos' - 'comandos'), '{}'::jsonb) from public.ch_materials m where m.unit_version_id = v.id and m.kind <> 'visual_cards'),
           'afirmacoes', (select coalesce(jsonb_agg(uc.claim_id order by uc.claim_id), '[]'::jsonb) from public.ch_unit_claims uc where uc.unit_version_id = v.id))
    into v_textos_antes from public.ch_unit_versions v where v.id = v_ver.id;

  r := public.app_ch_import_lesson_package(${q}${json}${q}::jsonb);

  if (r ->> 'version_id')::uuid is distinct from v_ver.id then
    raise exception 'A importação iria para outra versão (%), não para a versão % da ${c}: nada foi gravado.', r ->> 'version', v_ver.version;
  end if;
  select jsonb_build_object('unidade', v.content_hash,
           'materiais', (select coalesce(jsonb_object_agg(m.kind, m.content - 'arquivos' - 'comandos'), '{}'::jsonb) from public.ch_materials m where m.unit_version_id = v.id and m.kind <> 'visual_cards'),
           'afirmacoes', (select coalesce(jsonb_agg(uc.claim_id order by uc.claim_id), '[]'::jsonb) from public.ch_unit_claims uc where uc.unit_version_id = v.id))
    into v_textos_depois from public.ch_unit_versions v where v.id = v_ver.id;
  if v_textos_depois is distinct from v_textos_antes then
    raise exception 'O texto da ${c} mudaria (texto da aula, afirmações, resumo, flashcards ou questões): nada foi gravado. Fale com o Claude.';
  end if;

  select v.version, v.status into v_depois from public.ch_unit_versions v where v.id = v_ver.id;
  insert into _materiais_resultado values ('OK: ${c} versão ' || v_depois.version || ', ' ||
    case v_depois.status when 'awaiting_review' then 'aguardando revisão médica e editorial' else v_depois.status end || ': ' ||
    case r ->> 'resultado' when 'sem_mudanca' then 'já estava com os materiais ${versao} (nada mudou)' else 'materiais ${versao} gravados' end ||
    ' (${pacote.visuais.comandos.length} comandos das peças, ${pacote.arquivos.length} arquivos); texto da aula sem mudança.');
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end
$mat_do$;
select linha from _materiais_resultado;
`;
}

export function leiaMe(pacote, versao, nome1, admin, pastaLocal) {
  const mb = (pacote.arquivos.reduce((s, a) => s + Number(a.bytes ?? 0), 0) / 1024 / 1024).toFixed(1);
  return `STAZIAMED · ${pacote.codigo}: MATERIAIS ${versao.toUpperCase()} NA CENTRAL (${new Date().toISOString().slice(0, 10)})
=====================================================================
NADA DISTO FOI COLADO NO BANCO DE VERDADE. Foi ensaiado numa cópia simulada do banco (PGlite), colado 2 vezes sem mudar nada.
Ramo: visual-criativo. Sem IA e sem chave nenhuma.

O QUE MUDA
  Só os materiais visuais da ${pacote.codigo} que já está na Central:
  - os ${pacote.visuais.comandos.length} comandos das peças (feed, story e página A4) com a cor do tema (tema_cor: ${pacote.codigo}, paleta v2 aprovada) e sem a linha "Ministério da Saúde";
  - a lista dos ${pacote.arquivos.length} arquivos (imagens e PDFs, ${mb} MB) da pasta ${versao}: logo nova, paleta v2, sem linha de fonte.
  O texto da aula, as afirmações, o resumo, os flashcards e as questões NÃO mudam (o arquivo confere isso e, se mudasse, não grava nada).
  A aula continua "aguardando revisão". Nada é aprovado nem publicado. A ficha do revisor e as decisões já marcadas continuam.

ORDEM DE COLAGEM (editor SQL do Supabase, papel "postgres"; cole o arquivo INTEIRO > Run)
  ANTES: os pacotes de 13/10 (aula-gr001 e central-unidades, incluindo o 2-Atualizar-GR-001-v3.sql) já precisam estar colados.
  1. 0-CONFERIR.sql                       -> antes: "FALTA: ... ainda está com os materiais anteriores" (normal)
  2. ${nome1}  -> "OK: ${pacote.codigo} versão N, aguardando revisão ...: materiais ${versao} gravados ..."
  3. 0-CONFERIR.sql                       -> tem que começar com "OK:"
  Pode colar de novo: não muda nada. Se aparecer ERRO, PARE e mostre ao Claude (nada foi gravado).

ARQUIVOS (imagens e PDFs) — NÃO FORAM ENVIADOS
  O banco passa a apontar para aulas-prontas/${pacote.codigo}/${versao}/... no depósito "content-hub". Enquanto os arquivos não subirem,
  a tela mostra que o arquivo ainda não está no depósito. Para subir (só com a sua autorização):
    simular:  npx tsx scripts/aulas/subir-arquivos.mjs --pacote "${path.join("<esta pasta>", `pacote-${pacote.codigo}-${versao}.json`)}" --pasta "${pastaLocal}"
    enviar:   o mesmo comando com --enviar (usa SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env; nunca mostra as chaves)
  Os arquivos da versão anterior continuam no depósito (nada é apagado nem sobrescrito).
`;
}

function principal() {
  const args = process.argv.slice(2);
  const valor = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  const pasta = valor("--pasta");
  const versao = valor("--versao");
  if (!pasta || !versao || !/^v\d+$/.test(versao)) throw new Error("Use --pasta <aulas-piloto/GR-001/final-v5> --versao v5");
  const admin = valor("--admin") ?? ADMIN_PADRAO;
  const { pacote, problemas, avisos } = pacoteDeMateriais(pasta, versao);
  if (problemas.length) {
    console.error("Pacote com problemas (nada foi gerado):\n  " + problemas.join("\n  "));
    process.exitCode = 1;
    return;
  }
  if (valor("--anterior")) {
    const ant = montarPacote(valor("--anterior")).pacote;
    const dif = diferencasDeTexto(ant, pacote);
    if (dif.length) {
      console.error(`O texto mudou em relação a ${valor("--anterior")}: ${dif.join(", ")}. Este pacote é só de materiais: nada foi gerado.`);
      process.exitCode = 1;
      return;
    }
  }
  const saida = valor("--saida") ?? path.join(process.env.HOME ?? ".", "Downloads", `publicacao-staziamed-${new Date().toISOString().slice(0, 10)}-aula-${pacote.codigo.toLowerCase().replace(/[^a-z0-9]/g, "")}-${versao}`);
  fs.mkdirSync(saida, { recursive: true });
  const nome1 = `1-Atualizar-materiais-${pacote.codigo}-${versao}.sql`;
  fs.writeFileSync(path.join(saida, "0-CONFERIR.sql"), sqlConferir(pacote, versao));
  fs.writeFileSync(path.join(saida, nome1), sqlAtualizar(pacote, versao, admin));
  fs.writeFileSync(path.join(saida, `pacote-${pacote.codigo}-${versao}.json`), JSON.stringify(pacote, null, 1) + "\n");
  fs.writeFileSync(path.join(saida, "LEIA-ME.txt"), leiaMe(pacote, versao, nome1, admin, path.resolve(pasta)));
  console.log(`Pacote em ${saida}: ${pacote.visuais.comandos.length} comandos, ${pacote.arquivos.length} arquivos.${avisos.length ? ` Avisos: ${avisos.join(" | ")}` : ""}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    principal();
  } catch (e) {
    console.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
