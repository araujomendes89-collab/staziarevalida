// Gera a migração dos 100 Grandes Temas (tabelas, dados, treino por tema e a contagem) a partir dos dois arquivos versionados
// desta pasta: temas.json (os 100 temas) e ligacao-questoes.json (questão -> tema, com método e dúvidas).
// Uso: node scripts/grandes-temas/gerar-migracao.mjs [--pacote <pasta>]   (reescreve supabase/migrations/20261003009970_grandes_temas_100.sql;
// com --pacote, grava também 1-Grandes-temas.sql (a migração + a linha "OK"), 0-CONFERIR.sql e a pasta auditoria/ na pasta indicada)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, "../../supabase/migrations/20261003009970_grandes_temas_100.sql");
const METODO = "taxonomia-7-areas-2026-10-13";
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const temas = JSON.parse(fs.readFileSync(path.join(AQUI, "temas.json"), "utf8")).temas;
const lig = JSON.parse(fs.readFileSync(path.join(AQUI, "ligacao-questoes.json"), "utf8"));
const links = lig.questoes.filter((x) => x.tema_id && x.status !== "annulled");
if (temas.length !== 100) throw new Error(`Esperava 100 temas, achei ${temas.length}`);
const ids = new Set(temas.map((t) => t.id));
for (const l of links) if (!ids.has(l.tema_id)) throw new Error(`Tema desconhecido: ${l.tema_id}`);

const temaRows = temas.map((t) => `  (${q(t.id)}, ${t.ordem}, ${q(t.titulo)}, ${q(t.area)}, ${q(t.area_nome)}, ${q(t.subarea)}, ${q(t.status)})`).join(",\n");
const linkRows = links.map((l) => `  (${q(l.tema_id)}, ${q(l.question_id)}, ${q(l.no_principal)}, ${q(l.confianca ?? "")})`).join(",\n");

const sql = `-- =============================================================================
-- 100 Grandes Temas Prioritários (13/10/2026): troca a tela "Grandes Temas do Revalida" (Estudar) pelos 100 temas escolhidos pelo
-- StaziaMed, agrupados nas 7 áreas, COM a contagem verdadeira de questões oficiais por tema.
--
--   * grande_temas: os 100 temas (GR-001 a GR-100), com área (cm, cir, ped, go, mfc, sm, sc), subárea e situação do conteúdo
--     (GR-001 = aula pronta aguardando revisão médica; os outros 99 = roteiro em validação). Seleção pedagógica, NÃO é ranking do Inep.
--   * grande_tema_questoes: a ligação tema <-> questão oficial (${links.length} ligações; anuladas ficam de fora). Vem do nó principal da taxonomia
--     de 7 áreas de cada questão; o arquivo auditável (com método, confiança e dúvidas) é scripts/grandes-temas/ligacao-questoes.json.
--     Sem chave para questions de propósito: a prova 2026/2 pode ser carregada antes ou depois; a contagem só olha questões que existem.
--   * app_grandes_temas(): a tela. Devolve por tema: total de questões, por prova e a situação; mais quantas questões oficiais
--     estão sem tema e quantas anuladas ficam fora. Só contagem real, nada estimado.
--   * practice_pool ganha o filtro "grande_tema" (corpo da …9801): o botão "Treinar este tema" abre um treino só com as questões do tema.
--
-- Pode ser colada duas vezes (refaz as ligações deste método sem duplicar). Para desfazer: recriar practice_pool como na …9801 e
-- apagar app_grandes_temas e as duas tabelas. Se a …9801 for colada de novo, cole esta de novo (ela redefine practice_pool).
-- Gerada por scripts/grandes-temas/gerar-migracao.mjs a partir de temas.json e ligacao-questoes.json.
-- =============================================================================

create table if not exists public.grande_temas (
  id text primary key check (id ~ '^GR-[0-9]{3}$'),
  ordem integer not null unique check (ordem between 1 and 100),
  titulo text not null,
  area text not null check (area in ('cm', 'cir', 'ped', 'go', 'mfc', 'sm', 'sc')),
  area_nome text not null,
  subarea text,
  status text not null check (status in ('aula_pronta_aguardando_revisao', 'roteiro_em_validacao')),
  updated_at timestamptz not null default now()
);

create table if not exists public.grande_tema_questoes (
  tema_id text not null references public.grande_temas (id) on delete cascade,
  question_id text not null,
  no_taxonomia text not null,
  confianca text,
  metodo text not null default '${METODO}',
  primary key (tema_id, question_id)
);
create index if not exists grande_tema_questoes_question_idx on public.grande_tema_questoes (question_id);

alter table public.grande_temas enable row level security;
alter table public.grande_tema_questoes enable row level security;
revoke all on table public.grande_temas from public, anon, authenticated;
revoke all on table public.grande_tema_questoes from public, anon, authenticated;
grant select on table public.grande_temas to authenticated;
grant select on table public.grande_tema_questoes to authenticated;   -- o treino por tema (practice_pool) precisa ler a ligação
drop policy if exists "grandes temas: quem entrou lê" on public.grande_temas;
create policy "grandes temas: quem entrou lê" on public.grande_temas for select to authenticated using (true);
drop policy if exists "grandes temas: ligação lida por quem entrou" on public.grande_tema_questoes;
create policy "grandes temas: ligação lida por quem entrou" on public.grande_tema_questoes for select to authenticated using (true);

-- ---------------------------------------------------------------- os 100 temas
insert into public.grande_temas (id, ordem, titulo, area, area_nome, subarea, status) values
${temaRows}
on conflict (id) do update set ordem = excluded.ordem, titulo = excluded.titulo, area = excluded.area, area_nome = excluded.area_nome,
  subarea = excluded.subarea, status = excluded.status, updated_at = now();

-- ---------------------------------------------------------------- a ligação tema <-> questão (refeita a cada colagem)
delete from public.grande_tema_questoes where metodo = '${METODO}';
insert into public.grande_tema_questoes (tema_id, question_id, no_taxonomia, confianca) values
${linkRows}
on conflict (tema_id, question_id) do nothing;

-- ---------------------------------------------------------------- sorteio (corpo da …9801) + filtro "grande_tema"
create or replace function public.practice_pool(p_filters jsonb)
  returns table (question_id text, area public.med_area, exam_id text, topic text)
  language sql stable set search_path = ''
as $$
  select q.id, q.area, q.exam_id, q.topic
  from public.questions q
  where q.status <> 'annulled'
    and not (q.needs_image and jsonb_array_length(q.images) = 0)
    -- Questões Inéditas só quando a prova pedida é a \`staziamed\` (e só com acesso); em todo o resto, só as oficiais
    and case when p_filters ->> 'exam_id' = 'staziamed'
             then q.origin = 'staziamed' and q.retired_at is null and (select public.has_ineditas())
             else q.origin = 'official' end
    and (nullif(p_filters ->> 'area', '') is null or q.area = (p_filters ->> 'area')::public.med_area)
    and (nullif(p_filters ->> 'exam_id', '') is null or q.exam_id = p_filters ->> 'exam_id')
    and (nullif(p_filters ->> 'topic', '') is null or q.topic = p_filters ->> 'topic')
    -- Grandes Temas: só as questões ligadas ao tema pedido (GR-001 a GR-100)
    and (nullif(p_filters ->> 'grande_tema', '') is null
         or exists (select 1 from public.grande_tema_questoes g
                    where g.tema_id = p_filters ->> 'grande_tema' and g.question_id = q.id))
    and ((nullif(p_filters ->> 'subarea', '') is null and nullif(p_filters ->> 'competency', '') is null)
         or public.question_matches_dna(q.id, p_filters ->> 'subarea', p_filters ->> 'competency'))
    and (
      nullif(btrim(coalesce(p_filters ->> 'search', '')), '') is null
      or q.search @@ websearch_to_tsquery('portuguese', p_filters ->> 'search')
      or public.fold_text(q.topic || ' ' || coalesce(q.subtopic, ''))
           like '%' || public.fold_text(btrim(p_filters ->> 'search')) || '%'
    )
    and case coalesce(nullif(p_filters ->> 'status', ''), 'all')
      when 'unanswered' then not exists (
        select 1 from public.question_attempts a
        where a.user_id = (select auth.uid()) and a.question_id = q.id)
      when 'wrong' then exists (
        select 1 from public.my_error_notebook e
        where e.question_id = q.id and e.status = 'para_revisar')
      when 'bookmarked' then exists (
        select 1 from public.question_bookmarks b
        where b.user_id = (select auth.uid()) and b.question_id = q.id)
      else true
    end
$$;

-- ---------------------------------------------------------------- a tela: contagem verdadeira por tema
create or replace function public.app_grandes_temas() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  with oficiais as (
    select q.id, q.exam_id, q.status from public.questions q where q.origin = 'official'
  ), validas as (
    select * from oficiais where status <> 'annulled'
  ), ligadas as (
    select distinct g.tema_id, v.id as question_id, v.exam_id
    from public.grande_tema_questoes g join validas v on v.id = g.question_id
  ), por_tema as (
    select t.*,
           (select count(*)::int from ligadas l where l.tema_id = t.id) as total,
           coalesce((select jsonb_object_agg(x.exam_id, x.n)
                     from (select l.exam_id, count(*)::int as n from ligadas l where l.tema_id = t.id group by l.exam_id) x), '{}'::jsonb) as by_exam
    from public.grande_temas t
  )
  select jsonb_build_object(
    'method', 'Os 100 Grandes Temas são uma seleção pedagógica do StaziaMed, não um ranking oficial do Inep nem uma previsão de prova. A contagem de cada tema é o número de questões oficiais catalogadas (Revalida e ENAMED) ligadas a ele; questões anuladas ficam de fora.',
    'official_total', (select count(*)::int from validas),
    'annulled', (select count(*)::int from oficiais where status = 'annulled'),
    'linked', (select count(distinct question_id)::int from ligadas),
    'unlinked', (select count(*)::int from validas where id not in (select question_id from ligadas)),
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.area, 'name', a.area_nome, 'themes', a.n_temas, 'questions', a.n_questoes) order by a.ord)
      from (
        select t.area, min(t.area_nome) as area_nome, count(distinct t.id)::int as n_temas, min(t.ordem) as ord,
               (select count(distinct l.question_id)::int from ligadas l join public.grande_temas t2 on t2.id = l.tema_id where t2.area = t.area) as n_questoes
        from public.grande_temas t group by t.area
      ) a
    ), '[]'::jsonb),
    'themes', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'order', p.ordem, 'title', p.titulo, 'area', p.area, 'area_name', p.area_nome,
                                          'subarea', p.subarea, 'status', p.status, 'total', p.total, 'by_exam', p.by_exam) order by p.ordem)
      from por_tema p
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end
$$;
revoke execute on function public.app_grandes_temas() from public, anon;
grant execute on function public.app_grandes_temas() to authenticated;
`;
fs.writeFileSync(SAIDA, sql);
console.log(`Migração escrita: ${path.relative(process.cwd(), SAIDA)} (${temas.length} temas, ${links.length} ligações)`);

// ---------------------------------------------------------------- pacote de colagem (só com --pacote)
const i = process.argv.indexOf("--pacote");
if (i > 0) {
  const dir = path.resolve(process.argv[i + 1]);
  fs.mkdirSync(path.join(dir, "auditoria"), { recursive: true });
  const verifica = (msgOk, msgFalta) => `
select case
  when (select count(*) from public.grande_temas) <> 100 then 'FALTA: a tabela grande_temas não tem os 100 temas'
  when (select count(*) from public.grande_tema_questoes where metodo = '${METODO}') <> ${links.length} then 'FALTA: a ligação tema-questão não tem as ${links.length} linhas (cole o 1-Grandes-temas.sql)'
  when to_regprocedure('public.app_grandes_temas()') is null then 'FALTA: a função app_grandes_temas não existe'
  when pg_get_functiondef('public.practice_pool(jsonb)'::regprocedure) not like '%grande_tema%' then 'FALTA: o sorteio de questões ainda não tem o filtro grande_tema (a 9801 foi colada depois? cole o 1-Grandes-temas.sql de novo)'
  else '${msgOk}' || ' ' || (select count(*) from public.grande_temas) || ' temas; ' ||
       (select count(distinct g.question_id) from public.grande_tema_questoes g join public.questions q on q.id = g.question_id
         where q.origin = 'official' and q.status <> 'annulled') || ' questões oficiais já ligadas a algum tema; ' ||
       (select count(*) from public.grande_tema_questoes g where not exists (select 1 from public.questions q where q.id = g.question_id)) ||
       ' ligações aguardam a prova que ainda não está no banco (normal enquanto a Revalida 2026/2 não for carregada)'
end as resultado;
`;
  fs.writeFileSync(path.join(dir, "1-Grandes-temas.sql"), sql + verifica("OK: Grandes Temas colada:"));
  fs.writeFileSync(
    path.join(dir, "0-CONFERIR.sql"),
    `-- StaziaMed · 100 GRANDES TEMAS · CONFERIR (só lê; não altera nada). Rode antes (diz "FALTA: ...") e depois de colar 1-Grandes-temas.sql ("OK: ...").\n` + verifica("OK: 100 Grandes Temas no banco:")
  );
  for (const f of ["temas.json", "ligacao-questoes.json", "nos-para-tema.json"]) fs.copyFileSync(path.join(AQUI, f), path.join(dir, "auditoria", f));
  console.log(`Pacote escrito em ${dir}`);
}
