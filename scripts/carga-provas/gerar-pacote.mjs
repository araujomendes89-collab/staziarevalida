// Gera todas as partes da carga das provas corrigidas em scripts/carga-provas/saida e o manifesto das imagens.
//   node scripts/carga-provas/gerar-pacote.mjs              → só saida/ e manifesto-imagens.json
//   node scripts/carga-provas/gerar-pacote.mjs --pacote DIR → também copia as partes, as imagens e o manifesto para DIR
// Partes: 1 aviso do gabarito preliminar (migração 9930) · 2-NN texto fiel, uma por prova · 3 prova nova 2026/2 ·
//         4 ligar as imagens (DEPOIS do envio) · 5 OPCIONAL liberar a Q1 de 2023/1 · 0-CONFERIR (só lê).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AQUI, BUCKET, DATA_REVISAO, IMAGENS, SAIDA, correcoesDaProva, imagemDoBanco, jsonbLiteral, lerJson, manifestoImagens, md5, provas, questoesAntes, sqlTexto } from "./comum.mjs";
import { gerarTodas } from "./gerar-correcoes.mjs";

const RAIZ = path.resolve(AQUI, "../..");
export const MIGRACAO_AVISO = "20261003009930_gabarito_preliminar_aviso.sql";
const AREAS = ["CLINICA_MEDICA", "CIRURGIA_GERAL", "GINECOLOGIA_OBSTETRICIA", "PEDIATRIA", "MEDICINA_FAMILIA_COMUNIDADE"];
export const MOTIVO_IMAGEM = `Carga das provas corrigidas (revisão de ${DATA_REVISAO}): tabela como imagem e figuras que faltavam, recortadas do caderno oficial do Inep`;
export const OBS_2026_2 = "Gabarito preliminar: questão do Revalida 2026/2, ainda sem gabarito definitivo do Inep";
export const FONTE_2026_2 = "Gabarito preliminar do Inep — Revalida 2026/2, caderno 1 (2026_2_gabarito_preliminar_caderno1.pdf)";

// ------------------------------------------------------------------ parte 1: a migração do aviso
export const sqlAviso = () =>
  `-- StaziaMed, CARGA DAS PROVAS CORRIGIDAS, parte 1: aviso "gabarito preliminar" na correção do aluno (migração ${MIGRACAO_AVISO.slice(0, 18)}).
-- Cole INTEIRO no editor SQL do Supabase e clique em Run. Pode colar de novo. No fim: "OK: 1-aviso colada" e uma coluna "true".
` +
  fs.readFileSync(path.join(RAIZ, "supabase/migrations", MIGRACAO_AVISO), "utf8") +
  `
select 'OK: 1-aviso colada' as resultado,
  pg_get_functiondef('public.practice_correction_view(text, text)'::regprocedure) like '%answer_preliminary%' as correcao_traz_o_selo,
  pg_get_functiondef('public.practice_question_view(text)'::regprocedure) like '%question_preliminary_info%' as questao_traz_o_selo,
  pg_get_functiondef('public.app_error_notebook()'::regprocedure) like '%preliminary%' as caderno_de_erros_traz_o_selo,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'exams' and column_name = 'final_answer_expected_on') as data_do_definitivo_na_prova,
  not has_function_privilege('authenticated', 'public.question_preliminary_info(text)', 'execute') as funcao_interna_fechada_ao_aluno,
  pg_get_functiondef('public.practice_correction_view(text, text)'::regprocedure) like '%ch_raw_practice_correction_view%' as continua_com_as_regras_de_quem_ve;
`;

// ------------------------------------------------------------------ parte 3: a prova nova 2026/2
export function dados2026_2() {
  const dec = lerJson("revalida_2026_2-decisoes.json");
  const todas = lerJson("revalida_2026_2.json");
  const entram = [];
  const fora = [];
  for (const q of todas) {
    const area = q.area ?? dec.areas?.[String(q.number)] ?? null;
    if (!area) {
      fora.push({ id: q.id, numero: q.number, motivo: "sem grande área (decisão do dono)" });
      continue;
    }
    if (!AREAS.includes(area)) throw new Error(`${q.id}: área inválida ${area}`);
    if (!/^[ABCD]$/.test(q.correct_option)) throw new Error(`${q.id}: gabarito inválido`);
    if (q.options.map((o) => o.id).join("") !== "ABCD" || q.options.some((o) => !o.text?.trim())) throw new Error(`${q.id}: alternativas`);
    entram.push({
      id: q.id,
      code: q.code,
      number: q.number,
      area,
      topic: dec.tema_provisorio.replace("{n}", String(q.number).padStart(2, "0")),
      statement: q.statement,
      options: q.options.map((o) => ({ id: o.id, text: o.text, explanation: "" })),
      correct_option: q.correct_option,
      needs_image: Boolean(q.figura || q.tabela),
    });
  }
  return { entram, fora };
}

export function sql2026_2() {
  const { entram, fora } = dados2026_2();
  const dec = lerJson("revalida_2026_2-decisoes.json");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dec.gabarito_definitivo_em ?? "")) throw new Error("data do gabarito definitivo da 2026/2 ausente");
  const [ano, mes, dia] = dec.gabarito_definitivo_em.split("-");
  const fontes = [{ year: 2026, title: "Gabarito oficial do Inep — Revalida INEP 2026/2 — 2ª Edição Semestral", reliability: "OFICIAL_INEP", organization: "INEP / MEC" }];
  const motivo = `Prova nova: Revalida 2026/2 (texto do caderno 1 do Inep). ${OBS_2026_2}.`;
  return `-- =============================================================================
-- StaziaMed, CARGA DAS PROVAS CORRIGIDAS, parte 3: a prova nova Revalida 2026/2 com o GABARITO PRELIMINAR do Inep.
-- Gerado por scripts/carga-provas/gerar-pacote.mjs (ramo carga-provas). Não edite à mão.
-- O que faz:
--   * cria a prova "Revalida INEP 2026/2 — 2ª Edição Semestral" (revalida-2026-2) e ${entram.length} questões (texto do caderno 1, conferido com o PDF);
--   * registra para cada uma o gabarito oficial PRELIMINAR (fonte: gabarito preliminar do Inep), com a observação
--     "${OBS_2026_2}" no histórico da questão;
--   * o aluno vê em TODAS elas (treino, correção, resultado da sessão, caderno de erros) o selo "GABARITO PRELIMINAR" e a frase
--     "O gabarito definitivo só será divulgado pelo Inep em ${dia}/${mes}/${ano}." (precisa da parte 1). A data fica gravada na prova
--     (exams.final_answer_expected_on), é DADO: para trocar, um update nessa coluna, sem publicar o site. Data informada pelo dono;
--     confirmar no cronograma do Inep. O definitivo entra depois pela função oficial de registro de gabarito (situação FINAL) e o selo some.
--   * as ${entram.filter((q) => q.needs_image).length} questões com figura ou tabela entram com a marca "cita figura": ficam FORA dos treinos até a parte 4 ligar as imagens.
--   * tema provisório "Revalida 2026/2 · Qnn · tema a classificar" (o tema de verdade vem na carga das explicações).
${fora.length ? `--   * FICAM DE FORA (sem grande área; decisão do dono em scripts/carga-provas/dados/revalida_2026_2-decisoes.json): ${fora.map((f) => "Q" + f.numero).join(", ")}.\n` : ""}-- Pode colar de novo: questão que já existe não é mexida; gabarito já registrado não é trocado (nunca rebaixa um definitivo).
-- Como colar: editor SQL do Supabase, arquivo INTEIRO, Run. Primeira linha: "OK: ...".
-- =============================================================================
create temp table if not exists _carga_2026_2_resultado (questao text, situacao text);
delete from _carga_2026_2_resultado;

do $carga_2026_2$
declare
  v_dados constant jsonb := ${jsonbLiteral(entram)};
  v_fontes constant jsonb := ${jsonbLiteral(fontes, "carga_fontes")};
  r jsonb;
  v_id text;
  v_novas integer := 0;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'exams' and column_name = 'final_answer_expected_on') then
    raise exception 'Cole antes a parte 1 (1-aviso-gabarito-preliminar.sql). Nada foi mudado.';
  end if;
  insert into public.exams (id, kind, year, semester, title)
  values ('revalida-2026-2', 'REVALIDA', 2026, 2, 'Revalida INEP 2026/2 — 2ª Edição Semestral')
  on conflict (id) do nothing;
  -- a data do definitivo: só grava se ainda está vazia (quem trocou depois não é desfeito por uma nova colagem)
  update public.exams set final_answer_expected_on = ${sqlTexto(dec.gabarito_definitivo_em)}::date where id = 'revalida-2026-2' and final_answer_expected_on is null;
  for r in select value from jsonb_array_elements(v_dados) loop
    v_id := null;
    insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option, status, needs_image, images, sources)
    values (r ->> 'id', r ->> 'code', 'revalida-2026-2', (r ->> 'number')::int, (r ->> 'area')::public.med_area, r ->> 'topic', r ->> 'statement',
            r -> 'options', r ->> 'correct_option', 'valid', (r ->> 'needs_image')::boolean, '[]'::jsonb, v_fontes)
    on conflict do nothing
    returning id into v_id;
    if v_id is not null then
      v_novas := v_novas + 1;
      insert into public.question_change_log (question_id, changed_by, reason, changes)
      values (v_id, null, ${sqlTexto(motivo)}, jsonb_build_object('criacao', jsonb_build_object('de', null, 'para', 'revalida-2026-2#' || (r ->> 'number'))));
      insert into _carga_2026_2_resultado values (r ->> 'code', 'criada agora');
    else
      insert into _carga_2026_2_resultado values (r ->> 'code', 'já existia (não mexi)');
    end if;
    -- gabarito oficial: só quando a questão ainda não tem nenhum registrado
    if exists (select 1 from public.questions q where q.id = r ->> 'id' and q.exam_id = 'revalida-2026-2')
       and not exists (select 1 from public.question_official_answers o where o.question_id = r ->> 'id') then
      insert into public.question_official_answers (question_id, answer, answer_status, published_at, source, source_url)
      values (r ->> 'id', r ->> 'correct_option', 'PRELIMINARY', null, ${sqlTexto(FONTE_2026_2 + ". " + OBS_2026_2 + ".")}, null);
      insert into _carga_2026_2_resultado values (r ->> 'code', 'gabarito preliminar registrado');
    end if;
  end loop;
  perform public.admin_refresh_exam_counts();
  if v_novas > 0 then
    perform public.admin_log('questions.import', null, jsonb_build_object('inserted', v_novas, 'updated', 0, 'skipped', jsonb_array_length(v_dados) - v_novas,
      'prova', 'revalida-2026-2', 'reason', ${sqlTexto(OBS_2026_2)}));
  end if;
end
$carga_2026_2$;

select resultado, detalhe from (
  select 0 as ordem,
         case when (select count(*) from public.questions where exam_id = 'revalida-2026-2') >= ${entram.length}
                   and (select count(*) from public.question_official_answers o join public.questions q on q.id = o.question_id
                        where q.exam_id = 'revalida-2026-2' and o.is_current) >= ${entram.length}
              then 'OK: ' else 'ATENÇÃO: ' end
         || 'Revalida 2026/2: ' || (select count(*) from public.questions where exam_id = 'revalida-2026-2') || ' questões no banco ('
         || (select count(*) from _carga_2026_2_resultado where situacao = 'criada agora') || ' criadas agora); gabarito atual: '
         || coalesce((select string_agg(s || ' ' || n, ', ') from (select o.answer_status s, count(*) n from public.question_official_answers o
                      join public.questions q on q.id = o.question_id where q.exam_id = 'revalida-2026-2' and o.is_current group by 1) z), 'nenhum') as resultado,
         'gabarito definitivo previsto (selo do aluno): ' || coalesce(to_char((select final_answer_expected_on from public.exams where id = 'revalida-2026-2'), 'DD/MM/YYYY'), 'sem data')
         ${fora.length ? `|| ${sqlTexto(`; fora da carga (sem grande área): ${fora.map((f) => "Q" + f.numero).join(", ")}`)}` : ""} as detalhe
) x order by ordem;
`;
}

// ------------------------------------------------------------------ parte 4: ligar as imagens (depois do envio ao depósito)
export function sqlImagens(manifesto = manifestoImagens()) {
  const marca = lerJson("marca-cita-figura.json");
  const dados = manifesto.map((q) => ({
    id: q.id,
    code: q.code,
    imagens: q.imagens.map(imagemDoBanco),
    imagens_antes: q.imagens_antes,
    enunciado_antes_md5: q.enunciado_antes == null ? null : md5(q.enunciado_antes),
    enunciado_depois: q.enunciado_depois,
    tamanhos: Object.fromEntries(q.imagens.map((i) => [i.path, i.tamanho])),
  }));
  const arquivos = manifesto.flatMap((q) => q.imagens.map((i) => ({ path: i.path, tamanho: i.tamanho })));
  const ligar = marca.ligar.map((m) => m.id).filter((id) => !manifesto.some((q) => q.id === id));
  const nTab = manifesto.filter((q) => q.enunciado_depois).length;
  return `-- =============================================================================
-- StaziaMed, CARGA DAS PROVAS CORRIGIDAS, parte 4: ligar as imagens às questões. SÓ DEPOIS do envio das imagens ao depósito
-- "${BUCKET}" (o Claude roda scripts/carga-provas/subir-imagens.mjs --enviar quando você autorizar) e DEPOIS das partes 2 e 3.
-- Gerado por scripts/carga-provas/gerar-pacote.mjs (ramo carga-provas). Não edite à mão.
-- O que faz:
--   * confere que os ${arquivos.length} arquivos estão no depósito com o tamanho certo; se faltar algum, PARA sem mudar nada;
--   * registra cada arquivo como conferido (ch_worker_question_figure_confirm, a mesma função do servidor) e o reserva à questão;
--   * liga ${manifesto.length} questões: ${nTab} tabelas viram imagem (o trecho achatado da tabela sai do enunciado), 5 figuras que faltavam
--     (2024/2 Q46 e Q60: a imagem nova SUBSTITUI a antiga) e as figuras e tabelas da 2026/2;
--   * liga a marca "cita figura" nessas questões e em ${ligar.length} questões que já têm figura e estavam com a marca desligada (apontadas pelos relatórios);
--   * só mexe na questão cujas figuras e enunciado ainda são os esperados; senão PULA e lista. O antes fica no histórico.
-- Como colar: editor SQL do Supabase, arquivo INTEIRO, Run. Primeira linha: "OK: ..." (ou "ATENÇÃO:"; mostre ao Claude).
-- Pode colar de novo: a segunda vez não muda nada.
-- =============================================================================
create temp table if not exists _carga_imagens_resultado (questao text, situacao text, detalhe text);
delete from _carga_imagens_resultado;

do $carga_imagens$
declare
  v_dados constant jsonb := ${jsonbLiteral(dados)};
  v_arquivos constant jsonb := ${jsonbLiteral(arquivos, "carga_arquivos")};
  v_marca constant text[] := array[${ligar.map(sqlTexto).join(", ")}];
  r jsonb;
  a jsonb;
  q public.questions;
  v_faltam text;
  v_n integer;
  v_paths text[];
  v_id text;
  v_ok text;
begin
  -- 1. os arquivos precisam estar no depósito (no banco de teste, sem o esquema storage, esta conferência não existe)
  if to_regclass('storage.objects') is not null then
    select count(*), string_agg(x ->> 'path', ', ') into v_n, v_faltam
    from jsonb_array_elements(v_arquivos) x
    where not exists (select 1 from storage.objects o where o.bucket_id = '${BUCKET}' and o.name = x ->> 'path'
                        and coalesce((o.metadata ->> 'size')::bigint, -1) = (x ->> 'tamanho')::bigint);
    if v_n > 0 then
      raise exception 'Faltam % de % imagens no depósito ${BUCKET} (ou com tamanho diferente). Rode antes o envio das imagens. Nada foi mudado. Primeiras: %',
        v_n, jsonb_array_length(v_arquivos), left(v_faltam, 400);
    end if;
  end if;
  -- 2. cada arquivo conferido (como o servidor faz depois de olhar o arquivo)
  for a in select value from jsonb_array_elements(v_arquivos) loop
    perform public.ch_worker_question_figure_confirm(a ->> 'path', 'image/png', (a ->> 'tamanho')::numeric);
  end loop;
  -- 3. cada questão
  perform set_config('sqie.reason', ${sqlTexto(MOTIVO_IMAGEM)}, true);
  for r in select value from jsonb_array_elements(v_dados) loop
    select * into q from public.questions x where x.id = r ->> 'id' for update;
    if not found then
      insert into _carga_imagens_resultado values (r ->> 'code', 'pulada', 'questão não encontrada no banco (a 2026/2 entra na parte 3)');
      continue;
    end if;
    v_paths := array(select i ->> 'path' from jsonb_array_elements(r -> 'imagens') i);
    if q.images = r -> 'imagens' and (r ->> 'enunciado_depois' is null or q.statement = r ->> 'enunciado_depois') then
      if not q.needs_image then update public.questions set needs_image = true where id = q.id; end if;
      insert into _carga_imagens_resultado values (q.code, 'já estava ligada', null);
      continue;
    end if;
    if q.images is distinct from r -> 'imagens_antes' then
      insert into _carga_imagens_resultado values (q.code, 'pulada', 'as figuras da questão mudaram depois de ${DATA_REVISAO}');
      continue;
    end if;
    if r ->> 'enunciado_depois' is not null and md5(q.statement) is distinct from r ->> 'enunciado_antes_md5' then
      insert into _carga_imagens_resultado values (q.code, 'pulada', 'o enunciado não é o esperado (cole antes a parte 2 desta prova; ou alguém mudou o texto)');
      continue;
    end if;
    if exists (select 1 from public.question_figure_files f where f.path = any (v_paths) and (f.state <> 'confirmed' or (f.question_id is not null and f.question_id <> q.id))) then
      insert into _carga_imagens_resultado values (q.code, 'pulada', 'arquivo já liberado ou reservado a outra questão');
      continue;
    end if;
    update public.question_figure_files set question_id = q.id where path = any (v_paths);
    update public.questions set
      images = r -> 'imagens',
      statement = coalesce(r ->> 'enunciado_depois', statement),
      needs_image = true
    where id = q.id;
    perform public.admin_log('question.figure_set', q.id, jsonb_build_object('code', q.code, 'replaced', jsonb_array_length(q.images) > 0,
      'alt', (select string_agg(i ->> 'alt', ' | ') from jsonb_array_elements(r -> 'imagens') i), 'reason', ${sqlTexto(MOTIVO_IMAGEM)}));
    insert into _carga_imagens_resultado values (q.code, 'ligada agora',
      jsonb_array_length(r -> 'imagens') || ' imagem(ns)' || case when r ->> 'enunciado_depois' is not null then '; trecho da tabela tirado do enunciado' else '' end
      || case when jsonb_array_length(q.images) > 0 then '; substituiu a imagem antiga' else '' end);
  end loop;
  -- 4. marca "cita figura" nas que já têm figura e estavam com a marca desligada
  foreach v_id in array v_marca loop
    update public.questions set needs_image = true where id = v_id and not needs_image returning code into v_ok;
    if found then insert into _carga_imagens_resultado values (v_ok, 'marca "cita figura" ligada', null); end if;
  end loop;
  perform set_config('sqie.reason', '', true);
end
$carga_imagens$;

select resultado, detalhe from (
  select 0 as ordem,
         case when count(*) filter (where situacao = 'pulada') = 0 then 'OK: ' else 'ATENÇÃO: ' end
         || count(*) filter (where situacao = 'ligada agora') || ' questões ligadas agora, '
         || count(*) filter (where situacao = 'já estava ligada') || ' já estavam, '
         || count(*) filter (where situacao = 'pulada') || ' puladas (de ${manifesto.length}); marcas "cita figura" ligadas: '
         || count(*) filter (where situacao like 'marca%') as resultado,
         null::text as detalhe
  from _carga_imagens_resultado
  union all
  select 1, 'PULADA: ' || questao, detalhe from _carga_imagens_resultado where situacao = 'pulada'
) x order by ordem, resultado;
`;
}

// ------------------------------------------------------------------ parte 5 (opcional): 2023/1 Q1 marcada "cita figura" sem figura na prova
export function sqlOpcional2023Q1() {
  const m = lerJson("marca-cita-figura.json").sem_figura_no_pdf[0];
  return `-- =============================================================================
-- StaziaMed, CARGA DAS PROVAS CORRIGIDAS, parte 5 — OPCIONAL (só se você decidir): liberar a questão REV-2023.1-Q001.
-- Ela está marcada "cita figura" e sem figura, por isso fica FORA dos treinos. A revisão conferiu a página 2 do caderno oficial:
-- a prova NÃO tem figura nessa questão (o eletrocardiograma vem descrito em texto). Fonte: ${m.motivo}
-- O banco não deixa tirar a marca sem figura (regra de segurança da migração 9700). Este arquivo desliga essa regra SÓ durante
-- esta mudança, numa transação, e liga de novo. A mudança fica no histórico da questão.
-- Como colar: editor SQL do Supabase, arquivo INTEIRO, Run. Primeira linha: "OK: ...". Pode colar de novo.
-- =============================================================================
begin;
select set_config('sqie.reason', 'A prova não tem figura nesta questão (conferido no caderno oficial, revisão de ${DATA_REVISAO}): a marca "cita figura" sai', true);
alter table public.questions disable trigger questions_keep_figure_flag;
update public.questions set needs_image = false where id = 'revalida_2023_1_q001' and needs_image and jsonb_array_length(images) = 0;
alter table public.questions enable trigger questions_keep_figure_flag;
select set_config('sqie.reason', '', true);
commit;
select case when not needs_image then 'OK: REV-2023.1-Q001 sem a marca "cita figura" (volta aos treinos)' else 'ATENÇÃO: a marca continua' end as resultado,
       (select tgenabled <> 'D' from pg_trigger where tgname = 'questions_keep_figure_flag' and tgrelid = 'public.questions'::regclass) as regra_de_seguranca_ligada_de_novo
from public.questions where id = 'revalida_2023_1_q001';
`;
}

// ------------------------------------------------------------------ 0-CONFERIR (só lê)
export function sqlConferir(manifesto = manifestoImagens()) {
  const antes = questoesAntes();
  const finalDe = new Map(manifesto.filter((q) => q.enunciado_depois).map((q) => [q.id, md5(q.enunciado_depois)]));
  const campos = [];
  for (const p of provas()) {
    for (const it of correcoesDaProva(p.pasta, antes).itens) {
      for (const [k, c] of Object.entries(it.campos)) campos.push([p.exam_id, it.id, k, md5(c.antes), md5(c.depois), (k === "statement" && finalDe.get(it.id)) || md5(c.depois)]);
    }
  }
  const imgs = manifesto.map((q) => ({ id: q.id, prova: q.id.startsWith("revalida_2026_2") ? "revalida-2026-2" : null, paths: q.imagens.map((i) => i.path), tamanhos: q.imagens.map((i) => i.tamanho) }));
  const { entram } = dados2026_2();
  return `-- StaziaMed, CARGA DAS PROVAS CORRIGIDAS: CONFERÊNCIA (só lê; não altera nada). Rode antes, entre as partes e no fim.
-- Cole o arquivo INTEIRO no editor SQL do Supabase e clique em Run. A primeira linha começa com "OK:" (ou "FALTA:"/"ATENÇÃO:").
-- Gerado por scripts/carga-provas/gerar-pacote.mjs (ramo carga-provas).
with
campos (prova, id, campo, antes_md5, depois_md5, final_md5) as (
  select x ->> 0, x ->> 1, x ->> 2, x ->> 3, x ->> 4, x ->> 5 from jsonb_array_elements(${jsonbLiteral(campos, "conf_campos")}) x
),
estado as (
  select c.prova, c.id, c.campo,
         case when q.id is null then 'sem questão'
              when md5(case when c.campo = 'statement' then q.statement else (select o ->> 'text' from jsonb_array_elements(q.options) o where o ->> 'id' = c.campo limit 1) end) in (c.depois_md5, c.final_md5) then 'fiel'
              when md5(case when c.campo = 'statement' then q.statement else (select o ->> 'text' from jsonb_array_elements(q.options) o where o ->> 'id' = c.campo limit 1) end) = c.antes_md5 then 'antigo'
              else 'outro' end as e
  from campos c left join public.questions q on q.id = c.id
),
imgs as (
  select x ->> 'id' as id, array(select jsonb_array_elements_text(x -> 'paths')) as paths, x -> 'tamanhos' as tamanhos
  from jsonb_array_elements(${jsonbLiteral(imgs, "conf_imagens")}) x
),
img_estado as (
  select i.id, coalesce(array(select e ->> 'path' from jsonb_array_elements(q.images) e) = i.paths, false) as ligada,
         case when to_regclass('storage.objects') is null then null else
           -- consulta montada na hora: no banco sem o esquema storage o texto nem é lido
           (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from storage.objects where bucket_id = %L and name = any (%L::text[])', '${BUCKET}', i.paths), false, true, '')))[1]::text::int end as no_deposito,
         cardinality(i.paths) as n
  from imgs i left join public.questions q on q.id = i.id
),
pre as (
  select to_regclass('public.question_figure_files') is not null and to_regprocedure('public.ch_worker_question_figure_confirm(text, text, numeric)') is not null
         and to_regprocedure('public.app_admin_question_history(text, integer, integer)') is not null
         and exists (select 1 from pg_trigger where tgname = 'questions_images_guard') and exists (select 1 from pg_trigger where tgname = 'questions_change_trail') as ok
),
linhas as (
  select 10 as ordem, 'Texto fiel: campos já corrigidos / ainda antigos / com outro texto (de ' || count(*) || ')' as conferencia,
         count(*) filter (where e = 'fiel') || ' / ' || count(*) filter (where e = 'antigo') || ' / ' || count(*) filter (where e in ('outro', 'sem questão')) as resultado
  from estado
  union all
  select 11, '  ' || prova, count(*) filter (where e = 'fiel') || ' fiéis, ' || count(*) filter (where e = 'antigo') || ' antigos, ' || count(*) filter (where e in ('outro', 'sem questão')) || ' outro texto'
  from estado group by prova
  union all
  select 12, '  campo com OUTRO texto (alguém mudou: a parte 2 pula)', string_agg(id || ' ' || campo, ', ') from estado where e in ('outro', 'sem questão') having count(*) > 0
  union all
  select 20, 'Imagens: questões já ligadas (de ${manifesto.length}) / arquivos no depósito (de ${imgs.reduce((s, i) => s + i.paths.length, 0)})',
         count(*) filter (where ligada) || ' / ' || coalesce(sum(no_deposito)::text, 'sem esquema storage (banco de teste)') from img_estado
  union all
  select 30, 'Prova 2026/2: questões no banco (de ${entram.length}) / com gabarito PRELIMINAR atual',
         (select count(*) from public.questions where exam_id = 'revalida-2026-2') || ' / ' ||
         (select count(*) from public.question_official_answers o join public.questions q on q.id = o.question_id where q.exam_id = 'revalida-2026-2' and o.is_current and o.answer_status = 'PRELIMINARY')
  union all
  select 40, 'Selo "GABARITO PRELIMINAR" (parte 1) colado / data do definitivo da 2026/2',
         case when pg_get_functiondef('public.practice_question_view(text)'::regprocedure) like '%question_preliminary_info%' then 'sim' else 'não' end || ' / ' ||
         coalesce((select to_char((to_jsonb(e) ->> 'final_answer_expected_on')::date, 'DD/MM/YYYY') from public.exams e where e.id = 'revalida-2026-2'), 'sem data')
  union all
  select 50, 'Análises Stazia publicadas nas questões com texto ainda antigo (saem do ar na parte 2)',
         (select count(*)::text from public.question_analysis a where a.is_current and a.status = 'published' and a.question_id in (select id from estado where e = 'antigo'))
  union all
  select 60, 'Gabarito oficial atual por prova (situação: quantidade) — só registro',
         string_agg(z.exam_id || ' ' || z.s || ': ' || z.n, '; ' order by z.exam_id, z.s)
  from (select q.exam_id, o.answer_status s, count(*) n from public.question_official_answers o join public.questions q on q.id = o.question_id
        where o.is_current group by 1, 2) z
  union all
  select 61, 'Revalida 2020: título da fonte gravada nas questões (o PDF do gabarito diz PRELIMINAR) — só registro',
         (select string_agg(distinct s ->> 'title', ' | ') from public.questions q, jsonb_array_elements(q.sources) s where q.exam_id = 'revalida-2020')
)
select case when not (select ok from pre) then 'FALTA: as migrações 9700/9702 (figuras e histórico das questões) não estão no banco; pare e avise o Claude'
            when exists (select 1 from estado where e in ('outro', 'sem questão')) then 'ATENÇÃO: há campo com texto diferente do esperado (veja a linha 12); o resto pode seguir'
            else 'OK: conferência da carga das provas (' || (select count(*) filter (where e = 'fiel') from estado) || ' de ' || (select count(*) from estado) || ' campos já fiéis; '
                 || (select count(*) filter (where ligada) from img_estado) || ' de ${manifesto.length} questões com imagem ligada; 2026/2 com '
                 || (select count(*) from public.questions where exam_id = 'revalida-2026-2') || ' questões)' end as conferencia,
       null::text as resultado, -1 as ordem
union all
select conferencia, resultado, ordem from linhas
order by ordem;
`;
}

// ------------------------------------------------------------------ manifesto (para o envio e para a prévia)
export function manifestoParaEnvio(manifesto = manifestoImagens()) {
  return {
    gerado_em: "2026-10-12",
    bucket: BUCKET,
    regra: "PNG conferido (estrutura completa), até 5 MB, nome sorteado de forma determinística; nunca sobrescreve um arquivo diferente.",
    total: manifesto.reduce((s, q) => s + q.imagens.length, 0),
    imagens: manifesto.flatMap((q) =>
      q.imagens.map((i, n) => ({ questao: q.id, codigo: q.code, ordem: n + 1, tipo: i.tipo, arquivo: i.arquivo, destino: i.path, sha256: i.sha256, tamanho: i.tamanho, content_type: i.content_type, alt: i.alt, source_page: i.source_page, substitui_imagem_antiga: q.substitui }))
    ),
  };
}

export function gerarTudo(destino = SAIDA) {
  fs.mkdirSync(destino, { recursive: true });
  const manifesto = manifestoImagens();
  const partes = { "1-aviso-gabarito-preliminar.sql": sqlAviso(), "3-prova-nova-revalida-2026-2.sql": sql2026_2(), "4-ligar-imagens-DEPOIS-do-envio.sql": sqlImagens(manifesto),
    "5-OPCIONAL-liberar-revalida-2023-1-Q001.sql": sqlOpcional2023Q1(), "0-CONFERIR.sql": sqlConferir(manifesto) };
  for (const [nome, sql] of Object.entries(partes)) fs.writeFileSync(path.join(destino, nome), sql);
  const correcoes = gerarTodas(destino);
  fs.writeFileSync(path.join(AQUI, "manifesto-imagens.json"), JSON.stringify(manifestoParaEnvio(manifesto), null, 1) + "\n");
  return [...Object.keys(partes), ...correcoes].sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const nomes = gerarTudo();
  const i = process.argv.indexOf("--pacote");
  if (i > 0) {
    const dir = process.argv[i + 1];
    fs.mkdirSync(path.join(dir, "imagens"), { recursive: true });
    for (const n of nomes) fs.copyFileSync(path.join(SAIDA, n), path.join(dir, n));
    for (const f of fs.readdirSync(IMAGENS)) fs.copyFileSync(path.join(IMAGENS, f), path.join(dir, "imagens", f));
    fs.copyFileSync(path.join(AQUI, "manifesto-imagens.json"), path.join(dir, "imagens", "manifesto-imagens.json"));
    console.log(`pacote: ${dir}`);
  }
  for (const n of nomes) console.log(`gravado: saida/${n}`);
}
