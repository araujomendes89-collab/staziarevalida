#!/usr/bin/env node
// Pacote do dono: Central de Conteúdo › Unidades (migrações 9980 e 9981) + atualização da aula GR-001 para a v3 e a ficha do revisor.
// Gera em ~/Downloads/publicacao-staziamed-2026-10-13-central-unidades/:
//   0-CONFERIR.sql              só lê: "OK: ..." ou "FALTA: ..." (antes e depois)
//   1-Central-Unidades.sql      as duas migrações (tabelas, funções, permissões). Pode colar de novo: não muda nada.
//   2-Atualizar-GR-001-v3.sql   OPCIONAL, depois do 1: cadastra a fonte que falta (Nota Informativa 2/2026), importa a aula v3 pela função
//                               oficial (sempre "aguardando revisão") e a ficha do revisor. Não aprova nem publica nada.
//   LEIA-ME.txt
// Não conecta em banco, não usa rede e não usa chave de IA.
// Uso: node scripts/aulas/gerar-pacote-unidades.mjs --pasta <aulas-piloto/GR-001> [--saida <pasta>] [--admin <e-mail>]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_PADRAO, montarPacote, sqlDaAula } from "./gerar-sql-importacao.mjs";
import { lerFichaDoArquivo } from "./ficha-revisor.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGRACOES = ["20261003009980_central_unidades.sql", "20261003009981_anotacoes_da_aula.sql"].map((f) => path.resolve(AQUI, "../../supabase/migrations", f));
const lit = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const tag = (txt, base) => {
  let t = base;
  while (txt.includes(`$${t}$`)) t += "x";
  return `$${t}$`;
};

/** O que 0-CONFERIR e o fim do 1-… conferem (só leitura). Devolve uma linha "OK: ..." ou "FALTA: ...". */
export function sqlConferir(codigo) {
  return `-- StaziaMed · CENTRAL DE CONTEÚDO › UNIDADES · CONFERIR (só lê; só cria uma tabela temporária da sessão). Rode antes (diz o que falta) e DEPOIS de colar 1-Central-Unidades.sql.
-- Resposta: uma linha. "OK: ..." ou "FALTA: ...".
create temp table if not exists _unidades_conferir (conferencia text);
delete from _unidades_conferir;
do $conf$
declare
  v_falta text[] := '{}';
  f record;
  v_extra text := '';
  v_sig text;
  v_ver record;
begin
  for f in select * from (values
    ('app_ch_unit_overview_list', ''), ('app_ch_unit_overview', 'uuid'), ('app_ch_unit_materials', 'uuid'), ('app_ch_unit_material_insert', 'uuid, jsonb'),
    ('app_ch_unit_material_retire', 'uuid, text'), ('app_ch_unit_material_restore', 'uuid'), ('app_ch_unit_material_file', 'uuid, integer'),
    ('app_ch_unit_student_preview', 'uuid'), ('app_ch_review_sheet_import', 'uuid, jsonb, text'), ('app_ch_review_sheet', 'uuid'),
    ('app_ch_review_decide', 'uuid, integer, text, text'), ('app_ch_approval_summary', 'uuid'), ('app_ch_unit_history', 'uuid'), ('app_ch_unit_publish', 'uuid, jsonb'),
    ('app_lesson_notes', 'uuid'), ('app_lesson_notes_save', 'uuid, text, jsonb')) as t (nome, args) loop
    v_sig := 'public.' || f.nome || '(' || f.args || ')';
    if to_regprocedure(v_sig) is null then v_falta := v_falta || ('a função ' || f.nome);
    elsif has_function_privilege('anon', to_regprocedure(v_sig), 'execute') or not has_function_privilege('authenticated', to_regprocedure(v_sig), 'execute') then
      v_falta := v_falta || ('a função ' || f.nome || ' só para quem entrou (visitante não executa)');
    end if;
  end loop;
  for f in select * from (values ('ch_unit_materials'), ('ch_review_sheets'), ('ch_review_decisions'), ('lesson_notes')) as t (nome) loop
    if to_regclass('public.' || f.nome) is null then v_falta := v_falta || ('a tabela ' || f.nome);
    elsif not (select relrowsecurity from pg_class where oid = to_regclass('public.' || f.nome))
       or has_table_privilege('anon', to_regclass('public.' || f.nome), 'select') or has_table_privilege('authenticated', to_regclass('public.' || f.nome), 'insert')
       or has_table_privilege('authenticated', to_regclass('public.' || f.nome), 'update') or has_table_privilege('authenticated', to_regclass('public.' || f.nome), 'delete') then
      v_falta := v_falta || ('a tabela ' || f.nome || ' fechada (segurança por linha ligada e sem leitura direta para aluno ou visitante)');
    end if;
  end loop;
  if to_regclass('public.ch_unit_materials') is not null and not exists (select 1 from pg_constraint where conname = 'ch_unit_materials_so_equipe') then
    v_falta := v_falta || 'a regra "PDF, card, story e A6 só da equipe" no banco'::text;
  end if;
  if to_regprocedure('public.app_ch_approve(uuid, text, text)') is null or position('ch_can_approve_medical' in (select prosrc from pg_proc where oid = to_regprocedure('public.app_ch_approve(uuid, text, text)'))) = 0 then
    v_falta := v_falta || 'a aprovação médica do administrador ou revisor (função app_ch_approve nova)'::text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ch_approvals' and column_name = 'sheet') then v_falta := v_falta || 'a coluna sheet em ch_approvals'::text; end if;
  if to_regprocedure('public.app_ch_import_lesson_package(jsonb)') is null or to_regprocedure('public.ch_topic_freshness(uuid)') is null then
    v_falta := v_falta || 'a função de importação de aula pronta e o portão da vigilância (cole antes os pacotes aula-gr001 e vigilancia-tema)'::text;
  end if;
  if cardinality(v_falta) = 0 then
    select v.version, v.status, v.id into v_ver from public.ch_unit_versions v join public.ch_units u on u.id = v.unit_id
     where exists (select 1 from public.ch_audit a where a.action = 'unit.import' and a.target = v.id::text and a.details ->> 'codigo' = '${codigo}') order by v.created_at desc, v.version desc limit 1;
    if v_ver.id is not null then
      v_extra := '; ${codigo} na Central: versão ' || v_ver.version || ', ' || v_ver.status || ', ficha do revisor ' ||
        case when exists (select 1 from public.ch_review_sheets s where s.unit_version_id = v_ver.id) then 'importada' else 'ainda não importada (opcional: 2-Atualizar-GR-001-v3.sql)' end ||
        ', ' || (select count(*) from public.ch_approvals a where a.unit_version_id = v_ver.id and a.invalidated_at is null) || ' aprovações válidas';
    else v_extra := '; ${codigo} ainda não está na Central'; end if;
    insert into _unidades_conferir values ('OK: Central › Unidades no banco (16 funções, 4 tabelas fechadas, aprovação médica do administrador ou revisor, PDFs só da equipe)' || v_extra);
  else
    insert into _unidades_conferir values ('FALTA: ' || array_to_string(v_falta, '; ') || '.');
  end if;
end
$conf$;
select conferencia from _unidades_conferir;
`;
}

function comoAdmin(admin, nome, corpo) {
  return `do $${nome}$
declare
  v_admin uuid;
  r jsonb;
  f record;
  v_version uuid;
begin
  select u.id into v_admin from auth.users u where lower(u.email) = lower(${lit(admin)}) limit 1;
  if v_admin is null then raise exception 'Não achei o usuário % em auth.users.', ${lit(admin)}; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  if not public.is_admin() then raise exception 'O usuário % não é administrador.', ${lit(admin)}; end if;
${corpo}
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end
$${nome}$;
`;
}

export function sqlAtualizarAula(pacote, fontesInfo, ficha, admin) {
  const linhas = pacote.fontes.map((f) => {
    const i = fontesInfo.find((x) => x.doc_id === f.ref) ?? {};
    return `(${lit(f.titulo)}, ${lit(i.instituicao ?? "Ministério da Saúde")}, 'final', ${lit(f.url)}, ${lit(f.versao)}, 'A')`;
  });
  const fichaJson = JSON.stringify(ficha);
  const q = tag(fichaJson, "ficha");
  return `-- =============================================================================
-- STAZIAMED · ${pacote.codigo} v3 NA CENTRAL + FICHA DO REVISOR MÉDICO · OPCIONAL, só depois de 1-Central-Unidades.sql
-- Entra como o administrador ${admin}. Só funções oficiais; a aula termina "aguardando revisão" (nunca aprovada nem publicada).
-- Pode colar de novo: não muda nada. Aprovações e decisões de uma versão já aprovada NÃO são tocadas: pacote diferente vira versão candidata.
-- =============================================================================
do $conf$
begin
  if to_regprocedure('public.app_ch_review_sheet_import(uuid, jsonb, text)') is null then raise exception 'Cole antes o 1-Central-Unidades.sql.'; end if;
  if to_regprocedure('public.app_ch_import_lesson_package(jsonb)') is null then raise exception 'Cole antes o pacote aula-gr001 (função de importação de aula pronta).'; end if;
end
$conf$;

-- 1) fontes oficiais da aula que ainda não estão na biblioteca (a v3 acrescenta a Nota Informativa 2/2026, BPaLM), nível A, sem arquivo PDF
${comoAdmin(admin, "fontes_do", `  for f in select * from (values
    ${linhas.join(",\n    ")}
  ) as t (title, organ, kind, url, version, level) loop
    if not exists (select 1 from public.ch_sources s where public.ch_url_norm(s.url) = public.ch_url_norm(f.url) and s.status = 'current') then
      r := public.app_ch_register_source(jsonb_build_object('title', f.title, 'organ', f.organ, 'kind', f.kind, 'url', f.url, 'version', f.version));
      perform public.app_ch_set_source_authority((r ->> 'id')::uuid, f.level);
      raise notice 'fonte cadastrada: %', f.title;
    end if;
  end loop;`)}
-- 2) a aula (função oficial; ajustes de ligação documentados em scripts/aulas/ajustes/${pacote.codigo}.json)
${sqlDaAula(pacote, admin)}
-- 3) a ficha do revisor médico na versão importada
${comoAdmin(admin, "ficha_do", `  select (x.resultado ->> 'version_id')::uuid into v_version from _aula_importada x where x.codigo = ${lit(pacote.codigo)};
  if v_version is null then raise exception 'A aula ${pacote.codigo} não está na Central: a importação acima não gravou.'; end if;
  r := public.app_ch_review_sheet_import(v_version, ${q}${fichaJson}${q}::jsonb, 'para-o-revisor-medico.md (v3)');
  create temp table if not exists _ficha_importada (resultado jsonb);
  delete from _ficha_importada;
  insert into _ficha_importada values (r);`)}
select 'OK: ${pacote.codigo} v3 na Central, aguardando revisão; ficha do revisor ' || (select resultado ->> 'resultado' from _ficha_importada) || ' (' || (select resultado ->> 'decisoes' from _ficha_importada) || ' decisões). Nada aprovado, nada publicado.' as resultado;
`;
}

export function leiaMe(pacote, avisos, ficha) {
  return `STAZIAMED · CENTRAL DE CONTEÚDO › UNIDADES (13/10/2026)
=====================================================================
NADA DISTO FOI COLADO NO BANCO DE VERDADE. Foi ensaiado numa cópia simulada do banco do ramo (PGlite), colado 2 vezes sem mudar nada.
Ramo: central-unidades. Sem IA e sem chave nenhuma.

O QUE É
  A ferramenta de administração "Central de Conteúdo > Unidades" para aulas como a ${pacote.codigo}: lista de unidades, página da unidade com
  "Caminho até publicar", materiais (inserir, retirar, pré-visualizar), ficha do revisor médico, histórico e resumo antes de aprovar.
  Também: anotações do aluno por aula (só o lado do banco; a tela do aluno é outra tarefa).

REGRAS QUE O BANCO GARANTE (não só a tela)
  - Aprovação médica: só ADMINISTRADOR ou REVISOR MÉDICO da área. Editor, aluno, visitante, processamento e IA nunca. Grava quem, quando,
    a identificação exata da versão, a ficha das decisões e o resumo. Qualquer mudança depois derruba a aprovação.
  - A conferência de dose, via, tempo e frequência (CC12) também é do administrador ou do revisor da área (antes só do revisor).
  - Aprovação médica, aprovação editorial e publicação são separadas. Publicar pela tela exige aprovação médica + editorial + portão de
    atualidade da vigilância EM ORDEM, mesmo com o portão geral "desligado".
  - PDF interativo, PDF da A4, card de feed, story e flashcards A6 são SÓ DA EQUIPE (regra no banco). O aluno nunca baixa PDF.
  - Áudio e vídeo só por link de player (YouTube ou Vimeo) dentro do sistema. Envio de arquivo de áudio/vídeo: ETAPA FUTURA (exige
    armazenamento protegido com leitura em pedaços e sem link direto para o arquivo).
  - Retirar material não apaga: fica na lista como "retirado", no histórico, com quem, quando e por quê.
  - Nenhuma referência no texto que o aluno lê.

ORDEM DE COLAGEM (editor SQL do Supabase, papel "postgres"; cole o arquivo INTEIRO > Run; se perguntar sobre "operação destrutiva", pode confirmar)
  ANTES, nesta ordem: pacotes rodada2, aula-gr001 e vigilancia-tema (já ensaiados).
  1. 0-CONFERIR.sql                 -> antes: "FALTA: ..." (normal)
  2. 1-Central-Unidades.sql         -> "OK: Central > Unidades colada ..."
  3. 0-CONFERIR.sql                 -> tem que começar com "OK:"
  4. (opcional) 2-Atualizar-GR-001-v3.sql -> cadastra a Nota Informativa 2/2026 na biblioteca (nível A), importa a aula v3 e a ficha do revisor.
     A aula entra "aguardando revisão". NÃO aprova nem publica. Só rode se quiser que a v3 seja a versão em revisão.
  Pode colar qualquer arquivo de novo: não duplica nada. Se aparecer ERRO, PARE e mostre ao Claude.
  ATENÇÃO: depois do arquivo 2, o 0-CONFERIR do pacote aula-gr001 passa a dizer "FALTA", porque ele confere o texto da v2 e a versão agora é a v3.
  É esperado. O 0-CONFERIR deste pacote já mostra a situação da GR-001 (versão, ficha, aprovações).

SOBRE A AULA v3 (${pacote.codigo})
  - ${pacote.afirmacoes.length} afirmações, ${pacote.aula.sections.length} seções, ${pacote.flashcards.cards.length} flashcards, ${pacote.questoes.items.length} questões de fixação, ${pacote.arquivos.length} arquivos (imagens e PDFs, só referências; o envio dos arquivos é o script subir-arquivos.mjs, só com a sua autorização).
  - Ficha do revisor: ${ficha.decisoes.length} decisões, ${ficha.pontos.length} pontos a conferir, ${ficha.fixacao.length} notas das questões, ${ficha.fora.length} itens fora da aula.
${avisos.length ? "  - AVISOS PARA CONFERIR (do pacote da aula):\n" + avisos.map((a) => `      * ${a}`).join("\n") + "\n" : ""}  - A v3 cita a Nota Informativa 2/2026 (BPaLM), que NÃO estava na biblioteca: o arquivo 2 a cadastra (nível A) pelo endereço oficial.
    Se você prefere cadastrar pela tela Fontes oficiais, faça antes de colar o 2.

DEPOIS (pessoas, na tela Central > Unidades)
  1. Abrir a unidade ${pacote.codigo}; o administrador marca as 6 decisões da ficha ("de acordo" ou "pede mudança") e confere as afirmações com dose, tempo ou via.
  2. Aprovação médica (administrador ou revisor) e editorial; marcar o dossiê da Tuberculose como conferido em Vigilância científica.
  3. Só então "Publicar ao aluno".
`;
}

async function principal() {
  const args = process.argv.slice(2);
  const valor = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  const pasta = valor("--pasta");
  if (!pasta) throw new Error("Informe a pasta da aula: --pasta aulas-piloto/GR-001");
  const admin = valor("--admin") ?? ADMIN_PADRAO;
  const { pacote, problemas, avisos, dir } = montarPacote(pasta);
  if (problemas.length) {
    console.log(`RECUSADO: ${problemas.length} problema(s). Nada foi gerado.`);
    for (const p of problemas) console.log(`  - ${p}`);
    process.exitCode = 1;
    return;
  }
  const fichaArq = path.join(dir, "para-o-revisor-medico.md");
  if (!fs.existsSync(fichaArq)) throw new Error(`Falta ${fichaArq}.`);
  const ficha = lerFichaDoArquivo(fichaArq);
  const fontesArq = [path.join(dir, "fontes-internas", "fontes.json"), path.join(dir, "fontes.json"), path.join(dir, "..", "fontes.json")].find((p) => fs.existsSync(p));
  const fontesInfo = JSON.parse(fs.readFileSync(fontesArq, "utf8")).fontes ?? [];
  const saida = valor("--saida") ?? path.join(process.env.HOME ?? ".", "Downloads", "publicacao-staziamed-2026-10-13-central-unidades");
  fs.mkdirSync(saida, { recursive: true });
  const cab = (t) => `-- =============================================================================\n-- STAZIAMED · ${t}\n-- Gerado por scripts/aulas/gerar-pacote-unidades.mjs. Pode colar de novo: não muda nada.\n-- =============================================================================\n\n`;
  const migracoes = MIGRACOES.map((f) => `-- ---------------------------------------------------------------- ${path.basename(f)}\n${fs.readFileSync(f, "utf8")}`).join("\n");
  const fim = `\n-- ---------------------------------------------------------------- resposta\n${sqlConferir(pacote.codigo).split("\n").filter((l) => !l.startsWith("-- ")).join("\n").replace("'OK: Central › Unidades no banco", "'OK: Central › Unidades colada")}`;
  fs.writeFileSync(path.join(saida, "1-Central-Unidades.sql"), cab("CENTRAL DE CONTEÚDO › UNIDADES (migrações 9980 e 9981)") + migracoes + fim);
  fs.writeFileSync(path.join(saida, "2-Atualizar-GR-001-v3.sql"), sqlAtualizarAula(pacote, fontesInfo, ficha, admin));
  fs.writeFileSync(path.join(saida, "0-CONFERIR.sql"), sqlConferir(pacote.codigo));
  fs.writeFileSync(path.join(saida, "LEIA-ME.txt"), leiaMe(pacote, avisos, ficha));
  console.log(`OK: pacote em ${saida}`);
  for (const a of avisos) console.log(`  aviso: ${a}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
