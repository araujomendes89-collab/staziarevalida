-- =============================================================================
-- Banco de estações (2ª fase): cartões de TODAS as edições, já separados por área, sem conteúdo (pedido do dono de 17/10:
-- "crie todos os cartões primeiro e já separe por área; depois vamos colocando os conteúdos"). Número reservado em
-- .tmp-aulas/NUMEROS-MIGRACAO.md: 013420 (a 013410 é a dificuldade das estações).
-- Pode ser colada duas vezes: "add column if not exists", "create or replace", insert com "on conflict (id) do update" que
-- só repõe os campos do catálogo (nunca o nome, a aprovação médica nem o conteúdo). NÃO rodar em produção sem ordem do dono.
--
-- O QUE FAZ
--   * checklist_stations ganha: catalog_edition (chave da edição: '2020', '2020r', '2022-1', '2013'…), catalog_number (número
--     na edição), catalog_number_label (como aparece na prova, ex.: '1 e 6'), origin_label (origem exibida no cartão: "Revalida
--     2020 · INEP"; nas edições de 2011 a 2017, que não têm PDF oficial aqui, só "Revalida 2013"), official_source, catalog_pages
--     (páginas do caderno e do PEP, uso interno) e content_status ('awaiting_content' | 'content_ready'; as estações que já
--     existiam ficam 'content_ready'). Chave única: edição + número.
--   * Invisível ao aluno: o cartão nasce com medical_review='pending' (a política de leitura e app_dupla_stations já escondem as
--     pendentes) e uma trava impede aprovar enquanto o conteúdo não chegou (content_status='awaiting_content' exige 'pending').
--     Ao gravar o conteúdo (checklist_station_contents), um gatilho muda o cartão para 'content_ready'; a aprovação continua
--     sendo a decisão da revisão médica.
--   * app_admin_station_cards(): lista dos cartões do catálogo, só para a equipe e os revisores (checklist_station_assert_staff).
--   * 2011 a 2017 (71 cartões, official_source=false): origem sem INEP; numeração provisória (ordem por área).
--   * 2022/2: um cartão só por estação; a reaplicação da 2022/1 usou a mesma prova (origem: "…(também reaplicação da 2022/1)").
--   * 2021 (reaplicação): 5 estações, impressas em pares (1 e 6, 2 e 7…).
-- Não mexe em app_dupla_stations nem em app_admin_stations (ficam como estão, na 013410). Nenhuma IA.
--
-- COMO DESFAZER: delete from public.checklist_stations where catalog_edition is not null and content_status = 'awaiting_content';
--   drop function public.app_admin_station_cards(); drop trigger/função checklist_station_content_ready; as colunas podem ficar.
-- =============================================================================

alter table public.checklist_stations
  add column if not exists catalog_edition text,
  add column if not exists catalog_number integer check (catalog_number is null or catalog_number > 0),
  add column if not exists catalog_number_label text,
  add column if not exists origin_label text,
  add column if not exists official_source boolean not null default true,
  add column if not exists catalog_pages jsonb not null default '{}'::jsonb,
  add column if not exists content_status text not null default 'content_ready';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'checklist_stations_content_status_check') then
    alter table public.checklist_stations add constraint checklist_stations_content_status_check
      check (content_status in ('awaiting_content', 'content_ready'));
  end if;
  -- cartão sem conteúdo nunca fica visível ao aluno
  if not exists (select 1 from pg_constraint where conname = 'checklist_stations_awaiting_is_pending') then
    alter table public.checklist_stations add constraint checklist_stations_awaiting_is_pending
      check (content_status <> 'awaiting_content' or medical_review = 'pending');
  end if;
end
$$;

create unique index if not exists checklist_stations_catalog_uq
  on public.checklist_stations (catalog_edition, catalog_number) where catalog_edition is not null;

-- Gravou o conteúdo de um cartão que aguardava: passa a "conteúdo pronto" (continua pendente até a revisão médica).
create or replace function public.checklist_station_content_ready() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.checklist_stations set content_status = 'content_ready'
   where id = new.station_id and content_status = 'awaiting_content';
  return new;
end
$$;
revoke execute on function public.checklist_station_content_ready() from public, anon, authenticated;

drop trigger if exists checklist_station_content_ready on public.checklist_station_contents;
create trigger checklist_station_content_ready after insert or update on public.checklist_station_contents
  for each row execute function public.checklist_station_content_ready();

-- Os 179 cartões. Só repõe os campos do catálogo se o id já existir (por exemplo, as 10 da 2025/1 já montadas).
insert into public.checklist_stations
  (id, name, topic, area, taxonomy_path, goal, institution, year, medical_review, catalog_edition, catalog_number, origin_label,
   official_source, content_status, catalog_pages, catalog_number_label)
select v.id, v.name, v.name, v.area, array[v.area], 'Revalida', v.institution, v.year, 'pending', v.edition, v.num, v.origin,
       v.official, v.status, v.pages::jsonb, v.label
from (values
  ('inep2020-e01', 'Diagnóstico de leucemia aguda e exame físico de fígado e baço', 'Clínica Médica', 'INEP', '2020', '2020', 1, 'Revalida 2020 · INEP', true, 'awaiting_content', '{"prova": [1, 2, 3], "pep": [1]}', '1'),
  ('inep2020-e02', 'Atendimento inicial ao politraumatizado com fratura exposta de tíbia', 'Cirurgia Geral', 'INEP', '2020', '2020', 2, 'Revalida 2020 · INEP', true, 'awaiting_content', '{"prova": [4, 5, 6, 7], "pep": [2, 3]}', '2'),
  ('inep2020-e03', 'Diagnóstico e conduta clínica na coqueluche em lactente', 'Pediatria', 'INEP', '2020', '2020', 3, 'Revalida 2020 · INEP', true, 'awaiting_content', '{"prova": [8, 9, 10, 11], "pep": [4, 5]}', '3'),
  ('inep2020-e04', 'Abordagem diagnóstica e terapêutica do sangramento uterino anormal agudo', 'Ginecologia e Obstetrícia', 'INEP', '2020', '2020', 4, 'Revalida 2020 · INEP', true, 'awaiting_content', '{"prova": [12, 13, 14, 15, 16], "pep": [6, 7]}', '4'),
  ('inep2020-e05', 'Tratamento diretamente observado e manejo clínico da tuberculose pulmonar', 'Medicina de Família e Comunidade', 'INEP', '2020', '2020', 5, 'Revalida 2020 · INEP', true, 'awaiting_content', '{"prova": [17, 18], "pep": [8, 9]}', '5'),
  ('inep2020-e06', 'Diagnóstico e manejo ambulatorial de pneumonia adquirida na comunidade', 'Clínica Médica', 'INEP', '2020', '2020', 6, 'Revalida 2020 · INEP', true, 'awaiting_content', '{"prova": [19], "pep": [10]}', '6'),
  ('inep2020-e07', 'Diagnóstico e indicação cirúrgica de apendicite aguda', 'Cirurgia Geral', 'INEP', '2020', '2020', 7, 'Revalida 2020 · INEP', true, 'awaiting_content', '{"prova": [20, 21, 22, 23, 24], "pep": [11, 12, 13]}', '7'),
  ('inep2020-e08', 'Manejo da crise vaso-oclusiva álgica na anemia falciforme', 'Pediatria', 'INEP', '2020', '2020', 8, 'Revalida 2020 · INEP', true, 'awaiting_content', '{"prova": [25, 26, 27], "pep": [14, 15]}', '8'),
  ('inep2020-e09', 'Avaliação clínica e conduta diante de lipotimia no puerpério imediato', 'Ginecologia e Obstetrícia', 'INEP', '2020', '2020', 9, 'Revalida 2020 · INEP', true, 'awaiting_content', '{"prova": [28, 29, 30, 31, 32], "pep": [16, 17]}', '9'),
  ('inep2020-e10', 'Acolhimento e notificação de violência física e financeira contra adolescente', 'Medicina de Família e Comunidade', 'INEP', '2020', '2020', 10, 'Revalida 2020 · INEP', true, 'awaiting_content', '{"prova": [33, 34], "pep": [18, 19]}', '10'),
  ('inep2020r-e06', 'Doença do refluxo gastroesofágico (DRGE) e dispepsia', 'Clínica Médica', 'INEP', '2020', '2020r', 6, 'Revalida 2020 (reaplicação) · INEP', true, 'awaiting_content', '{"prova": [1, 2, 3, 4, 5], "pep": [1, 2]}', '6'),
  ('inep2020r-e08', 'Cetoacidose diabética', 'Pediatria', 'INEP', '2020', '2020r', 8, 'Revalida 2020 (reaplicação) · INEP', true, 'awaiting_content', '{"prova": [6, 7, 8, 9], "pep": [3]}', '8'),
  ('inep2020r-e10', 'Consulta puerperal, manejo da amamentação e tristeza puerperal', 'Medicina de Família e Comunidade', 'INEP', '2020', '2020r', 10, 'Revalida 2020 (reaplicação) · INEP', true, 'awaiting_content', '{"prova": [10, 11, 12, 13, 14], "pep": [4, 5, 6]}', '10'),
  ('inep2021-e01', 'Hipertireoidismo por Doença de Graves', 'Clínica Médica', 'INEP', '2021', '2021', 1, 'Revalida 2021 · INEP', true, 'awaiting_content', '{"prova": [1, 2, 3, 4], "pep": [1]}', '1'),
  ('inep2021-e02', 'Obstrução intestinal mecânica por bridas', 'Cirurgia Geral', 'INEP', '2021', '2021', 2, 'Revalida 2021 · INEP', true, 'awaiting_content', '{"prova": [5, 6, 7, 8, 9, 10], "pep": [2, 3, 4]}', '2'),
  ('inep2021-e03', 'Icterícia neonatal por incompatibilidade sanguínea materno-fetal', 'Pediatria', 'INEP', '2021', '2021', 3, 'Revalida 2021 · INEP', true, 'awaiting_content', '{"prova": [11, 12, 13, 14, 15], "pep": [5, 6]}', '3'),
  ('inep2021-e04', 'Contracepção com DIU de cobre e conduta na citologia cervical alterada', 'Ginecologia e Obstetrícia', 'INEP', '2021', '2021', 4, 'Revalida 2021 · INEP', true, 'awaiting_content', '{"prova": [16, 17, 18], "pep": [7, 8]}', '4'),
  ('inep2021-e05', 'Infarto agudo do miocárdio com supradesnivelamento do segmento ST', 'Medicina de Família e Comunidade', 'INEP', '2021', '2021', 5, 'Revalida 2021 · INEP', true, 'awaiting_content', '{"prova": [19, 20, 21], "pep": [9, 10]}', '5'),
  ('inep2021-e06', 'Cirrose hepática descompensada com ascite e hipertensão portal', 'Clínica Médica', 'INEP', '2021', '2021', 6, 'Revalida 2021 · INEP', true, 'awaiting_content', '{"prova": [22, 23, 24], "pep": [11]}', '6'),
  ('inep2021-e07', 'Pneumotórax hipertensivo no politraumatizado: toracocentese por punção e drenagem pleural', 'Cirurgia Geral', 'INEP', '2021', '2021', 7, 'Revalida 2021 · INEP', true, 'awaiting_content', '{"prova": [25, 26, 27, 28], "pep": [12, 13]}', '7'),
  ('inep2021-e08', 'Puericultura do prematuro tardio com baixo ganho ponderal e atraso vacinal', 'Pediatria', 'INEP', '2021', '2021', 8, 'Revalida 2021 · INEP', true, 'awaiting_content', '{"prova": [29, 30, 31, 32, 33], "pep": [14, 15, 16, 17]}', '8'),
  ('inep2021-e09', 'Sangramento na primeira metade da gestação por ameaça de abortamento', 'Ginecologia e Obstetrícia', 'INEP', '2021', '2021', 9, 'Revalida 2021 · INEP', true, 'awaiting_content', '{"prova": [34, 35, 36, 37, 38], "pep": [18, 19]}', '9'),
  ('inep2021-e10', 'Dengue: diagnóstico clínico, classificação do grupo B e conduta ambulatorial', 'Medicina de Família e Comunidade', 'INEP', '2021', '2021', 10, 'Revalida 2021 · INEP', true, 'awaiting_content', '{"prova": [39, 40, 41, 42], "pep": [20, 21, 22]}', '10'),
  ('inep2021r-e01', 'Doença pulmonar obstrutiva crônica e suspeita de neoplasia pulmonar', 'Clínica Médica', 'INEP', '2021', '2021r', 1, 'Revalida 2021 (reaplicação) · INEP', true, 'awaiting_content', '{"prova": [1, 2, 3, 4], "pep": [1]}', '1 e 6'),
  ('inep2021r-e02', 'Litíase urinária obstrutiva complicada por infecção do trato urinário', 'Cirurgia Geral', 'INEP', '2021', '2021r', 2, 'Revalida 2021 (reaplicação) · INEP', true, 'awaiting_content', '{"prova": [5, 6, 7, 8], "pep": [2, 3]}', '2 e 7'),
  ('inep2021r-e03', 'Invaginação intestinal em lactente', 'Pediatria', 'INEP', '2021', '2021r', 3, 'Revalida 2021 (reaplicação) · INEP', true, 'awaiting_content', '{"prova": [9, 10, 11, 12], "pep": [4, 5]}', '3 e 8'),
  ('inep2021r-e04', 'Candidíase vulvovaginal', 'Ginecologia e Obstetrícia', 'INEP', '2021', '2021r', 4, 'Revalida 2021 (reaplicação) · INEP', true, 'awaiting_content', '{"prova": [13, 14], "pep": [6, 7]}', '4 e 9'),
  ('inep2021r-e05', 'Rastreamento do câncer de mama e de colo uterino', 'Medicina de Família e Comunidade', 'INEP', '2021', '2021r', 5, 'Revalida 2021 (reaplicação) · INEP', true, 'awaiting_content', '{"prova": [15, 16, 17, 18], "pep": [8, 9]}', '5 e 10'),
  ('inep2022-1-e01', 'Diagnóstico e manejo da retocolite ulcerativa', 'Clínica Médica', 'INEP', '2022/1', '2022-1', 1, 'Revalida 2022/1 · INEP', true, 'awaiting_content', '{"prova": [1, 2, 3, 4, 5], "pep": [1]}', '1'),
  ('inep2022-1-e02', 'Investigação diagnóstica de câncer colorretal e doença hemorroidária', 'Cirurgia Geral', 'INEP', '2022/1', '2022-1', 2, 'Revalida 2022/1 · INEP', true, 'awaiting_content', '{"prova": [6, 7, 8, 9, 10, 11, 12], "pep": [2, 3]}', '2'),
  ('inep2022-1-e03', 'Diagnóstico e indicação cirúrgica de apendicite aguda em pediatria', 'Pediatria', 'INEP', '2022/1', '2022-1', 3, 'Revalida 2022/1 · INEP', true, 'awaiting_content', '{"prova": [13, 14, 15, 16, 17, 18], "pep": [4, 5]}', '3'),
  ('inep2022-1-e04', 'Diagnóstico e conduta na doença inflamatória pélvica', 'Ginecologia e Obstetrícia', 'INEP', '2022/1', '2022-1', 4, 'Revalida 2022/1 · INEP', true, 'awaiting_content', '{"prova": [19, 20, 21, 22, 23, 24, 25, 26], "pep": [6, 7]}', '4'),
  ('inep2022-1-e05', 'Diagnóstico, manejo e notificação de leishmaniose tegumentar americana', 'Medicina de Família e Comunidade', 'INEP', '2022/1', '2022-1', 5, 'Revalida 2022/1 · INEP', true, 'awaiting_content', '{"prova": [27, 28, 29], "pep": [8, 9]}', '5'),
  ('inep2022-1-e06', 'Diagnóstico e manejo da artrite gotosa aguda', 'Clínica Médica', 'INEP', '2022/1', '2022-1', 6, 'Revalida 2022/1 · INEP', true, 'awaiting_content', '{"prova": [30, 31, 32, 33], "pep": [10]}', '6'),
  ('inep2022-1-e07', 'Atendimento inicial ao grande queimado e suspeita de lesão inalatória', 'Cirurgia Geral', 'INEP', '2022/1', '2022-1', 7, 'Revalida 2022/1 · INEP', true, 'awaiting_content', '{"prova": [34, 35, 36, 37, 38, 39], "pep": [11, 12]}', '7'),
  ('inep2022-1-e08', 'Puericultura, avaliação antropométrica e refluxo gastroesofágico fisiológico', 'Pediatria', 'INEP', '2022/1', '2022-1', 8, 'Revalida 2022/1 · INEP', true, 'awaiting_content', '{"prova": [40, 41, 42, 43, 44, 45], "pep": [13, 14]}', '8'),
  ('inep2022-1-e09', 'Descolamento prematuro de placenta e conduta no sofrimento fetal', 'Ginecologia e Obstetrícia', 'INEP', '2022/1', '2022-1', 9, 'Revalida 2022/1 · INEP', true, 'awaiting_content', '{"prova": [46, 47, 48, 49], "pep": [15, 16]}', '9'),
  ('inep2022-1-e10', 'Abordagem clínica da cessação do tabagismo e dependência nicotínica', 'Medicina de Família e Comunidade', 'INEP', '2022/1', '2022-1', 10, 'Revalida 2022/1 · INEP', true, 'awaiting_content', '{"prova": [50, 51, 52], "pep": [17, 18]}', '10'),
  ('inep2022-2-e01', 'Síncope por síndrome de Wolff-Parkinson-White', 'Clínica Médica', 'INEP', '2022/2', '2022-2', 1, 'Revalida 2022/2 · INEP (também reaplicação da 2022/1)', true, 'awaiting_content', '{"prova": [1, 2, 3, 4, 5], "pep": [1, 2], "prova_reaplicacao_2022_1": [2, 3, 4, 5, 6, 7], "pep_reaplicacao_2022_1": [2, 3]}', '1'),
  ('inep2022-2-e02', 'Prostatite aguda e hiperplasia prostática benigna', 'Cirurgia Geral', 'INEP', '2022/2', '2022-2', 2, 'Revalida 2022/2 · INEP (também reaplicação da 2022/1)', true, 'awaiting_content', '{"prova": [6, 7, 8, 9, 10, 11], "pep": [3, 4, 5], "prova_reaplicacao_2022_1": [8, 9, 10, 11, 12, 13, 14], "pep_reaplicacao_2022_1": [4, 5, 6]}', '2'),
  ('inep2022-2-e03', 'Febre sem sinais localizatórios no recém-nascido', 'Pediatria', 'INEP', '2022/2', '2022-2', 3, 'Revalida 2022/2 · INEP (também reaplicação da 2022/1)', true, 'awaiting_content', '{"prova": [12, 13, 14, 15, 16, 17], "pep": [6, 7], "prova_reaplicacao_2022_1": [15, 16, 17, 18, 19, 20], "pep_reaplicacao_2022_1": [7, 8]}', '3'),
  ('inep2022-2-e04', 'Gestação inicial não planejada e aspectos legais do aborto', 'Ginecologia e Obstetrícia', 'INEP', '2022/2', '2022-2', 4, 'Revalida 2022/2 · INEP (também reaplicação da 2022/1)', true, 'awaiting_content', '{"prova": [18, 19, 20], "pep": [8, 9], "prova_reaplicacao_2022_1": [21, 22, 23], "pep_reaplicacao_2022_1": [9, 10]}', '4'),
  ('inep2022-2-e05', 'Diagnóstico e manejo do herpes-zóster', 'Medicina de Família e Comunidade', 'INEP', '2022/2', '2022-2', 5, 'Revalida 2022/2 · INEP (também reaplicação da 2022/1)', true, 'awaiting_content', '{"prova": [21, 22, 23], "pep": [10, 11], "prova_reaplicacao_2022_1": [24, 25, 26], "pep_reaplicacao_2022_1": [11, 12]}', '5'),
  ('inep2022-2-e06', 'Anemia megaloblástica por deficiência de vitamina B12', 'Clínica Médica', 'INEP', '2022/2', '2022-2', 6, 'Revalida 2022/2 · INEP (também reaplicação da 2022/1)', true, 'awaiting_content', '{"prova": [24, 25, 26, 27], "pep": [12, 13], "prova_reaplicacao_2022_1": [27, 28, 29, 30, 31], "pep_reaplicacao_2022_1": [13, 14]}', '6'),
  ('inep2022-2-e07', 'Colecistite aguda litiásica', 'Cirurgia Geral', 'INEP', '2022/2', '2022-2', 7, 'Revalida 2022/2 · INEP (também reaplicação da 2022/1)', true, 'awaiting_content', '{"prova": [28, 29, 30, 31, 32], "pep": [14, 15], "prova_reaplicacao_2022_1": [32, 33, 34, 35, 36], "pep_reaplicacao_2022_1": [15, 16]}', '7'),
  ('inep2022-2-e08', 'Hidrocele comunicante no lactente', 'Pediatria', 'INEP', '2022/2', '2022-2', 8, 'Revalida 2022/2 · INEP (também reaplicação da 2022/1)', true, 'awaiting_content', '{"prova": [33, 34, 35, 36], "pep": [16, 17], "prova_reaplicacao_2022_1": [37, 38, 39, 40], "pep_reaplicacao_2022_1": [17, 18]}', '8'),
  ('inep2022-2-e09', 'Diagnóstico e tratamento da sífilis primária', 'Ginecologia e Obstetrícia', 'INEP', '2022/2', '2022-2', 9, 'Revalida 2022/2 · INEP (também reaplicação da 2022/1)', true, 'awaiting_content', '{"prova": [37, 38, 39, 40], "pep": [18, 19, 20], "prova_reaplicacao_2022_1": [41, 42, 43, 44], "pep_reaplicacao_2022_1": [19, 20]}', '9'),
  ('inep2022-2-e10', 'Abordagem integral e vacinação do adolescente', 'Medicina de Família e Comunidade', 'INEP', '2022/2', '2022-2', 10, 'Revalida 2022/2 · INEP (também reaplicação da 2022/1)', true, 'awaiting_content', '{"prova": [41, 42, 43, 44], "pep": [21, 22, 23], "prova_reaplicacao_2022_1": [45, 46, 47, 48], "pep_reaplicacao_2022_1": [21, 22, 23]}', '10'),
  ('inep2023-1-e01', 'Diagnóstico e manejo da asma brônquica ocupacional', 'Clínica Médica', 'INEP', '2023/1', '2023-1', 1, 'Revalida 2023/1 · INEP', true, 'awaiting_content', '{"prova": [1, 2, 3, 4, 5], "pep": [1, 2, 3, 4, 5]}', '1'),
  ('inep2023-1-e02', 'Febre pós-operatória: infecção de sítio cirúrgico e endocardite infecciosa subaguda', 'Cirurgia Geral', 'INEP', '2023/1', '2023-1', 2, 'Revalida 2023/1 · INEP', true, 'awaiting_content', '{"prova": [6, 7, 8, 9, 10, 11, 12, 13, 14], "pep": [6, 7, 8, 9, 10, 11]}', '2'),
  ('inep2023-1-e03', 'Puericultura do lactente, fórmula infantil e contraindicação ao aleitamento cruzado', 'Pediatria', 'INEP', '2023/1', '2023-1', 3, 'Revalida 2023/1 · INEP', true, 'awaiting_content', '{"prova": [15, 16, 17, 18, 19, 20, 21, 22], "pep": [12, 13, 14, 15]}', '3'),
  ('inep2023-1-e04', 'Rastreamento do câncer do colo do útero e citologia oncótica', 'Ginecologia e Obstetrícia', 'INEP', '2023/1', '2023-1', 4, 'Revalida 2023/1 · INEP', true, 'awaiting_content', '{"prova": [23, 24], "pep": [16, 17, 18, 19, 20, 21]}', '4'),
  ('inep2023-1-e05', 'Abordagem comunitária e determinantes sociais da desnutrição em população indígena', 'Medicina de Família e Comunidade', 'INEP', '2023/1', '2023-1', 5, 'Revalida 2023/1 · INEP', true, 'awaiting_content', '{"prova": [25, 26], "pep": [22, 23, 24, 25, 26, 27]}', '5'),
  ('inep2023-1-e06', 'Hipertensão arterial descompensada, reação adversa ao IECA e aferição pressórica', 'Clínica Médica', 'INEP', '2023/1', '2023-1', 6, 'Revalida 2023/1 · INEP', true, 'awaiting_content', '{"prova": [27, 28, 29, 30, 31, 32, 33], "pep": [28, 29, 30, 31, 32, 33]}', '6'),
  ('inep2023-1-e07', 'Escroto agudo por torção testicular e indicação de exploração cirúrgica', 'Cirurgia Geral', 'INEP', '2023/1', '2023-1', 7, 'Revalida 2023/1 · INEP', true, 'awaiting_content', '{"prova": [34, 35, 36], "pep": [34, 35, 36, 37]}', '7'),
  ('inep2023-1-e08', 'Ingestão de corpo estranho esofágico por bateria e endoscopia de urgência', 'Pediatria', 'INEP', '2023/1', '2023-1', 8, 'Revalida 2023/1 · INEP', true, 'awaiting_content', '{"prova": [37, 38, 39], "pep": [38, 39, 40, 41, 42, 43]}', '8'),
  ('inep2023-1-e09', 'Diagnóstico e propedêutica do diabetes mellitus gestacional no pré-natal', 'Ginecologia e Obstetrícia', 'INEP', '2023/1', '2023-1', 9, 'Revalida 2023/1 · INEP', true, 'awaiting_content', '{"prova": [40, 41, 42], "pep": [44, 45, 46, 47, 48]}', '9'),
  ('inep2023-1-e10', 'Diagnóstico e abordagem da Síndrome de Burnout na atenção primária', 'Medicina de Família e Comunidade', 'INEP', '2023/1', '2023-1', 10, 'Revalida 2023/1 · INEP', true, 'awaiting_content', '{"prova": [43, 44], "pep": [49, 50, 51, 52, 53, 54, 55]}', '10'),
  ('inep2023-2-e01', 'Urticária aguda desencadeada por anti-inflamatório não esteroide e analgésico', 'Clínica Médica', 'INEP', '2023/2', '2023-2', 1, 'Revalida 2023/2 · INEP', true, 'awaiting_content', '{"prova": [1, 2, 3], "pep": [1, 2, 3, 4, 5]}', '1'),
  ('inep2023-2-e02', 'Pancreatite aguda biliar', 'Cirurgia Geral', 'INEP', '2023/2', '2023-2', 2, 'Revalida 2023/2 · INEP', true, 'awaiting_content', '{"prova": [4, 5, 6, 7], "pep": [6, 7, 8, 9, 10, 11]}', '2'),
  ('inep2023-2-e03', 'Acidente escorpiônico de gravidade moderada em criança', 'Pediatria', 'INEP', '2023/2', '2023-2', 3, 'Revalida 2023/2 · INEP', true, 'awaiting_content', '{"prova": [8, 9, 10, 11, 12], "pep": [12, 13, 14, 15, 16]}', '3'),
  ('inep2023-2-e04', 'Exame clínico das mamas e propedêutica de nódulo mamário', 'Ginecologia e Obstetrícia', 'INEP', '2023/2', '2023-2', 4, 'Revalida 2023/2 · INEP', true, 'awaiting_content', '{"prova": [13], "pep": [17, 18, 19, 20, 21]}', '4'),
  ('inep2023-2-e05', 'Saúde da mulher lésbica e rastreamento do câncer do colo uterino', 'Medicina de Família e Comunidade', 'INEP', '2023/2', '2023-2', 5, 'Revalida 2023/2 · INEP', true, 'awaiting_content', '{"prova": [14], "pep": [22, 23, 24, 25, 26, 27, 28]}', '5'),
  ('inep2023-2-e06', 'Acidente vascular cerebral isquêmico agudo', 'Clínica Médica', 'INEP', '2023/2', '2023-2', 6, 'Revalida 2023/2 · INEP', true, 'awaiting_content', '{"prova": [15, 16, 17, 18, 19], "pep": [29, 30, 31, 32, 33, 34]}', '6'),
  ('inep2023-2-e07', 'Avaliação e sutura de ferimento corto-contuso em antebraço', 'Cirurgia Geral', 'INEP', '2023/2', '2023-2', 7, 'Revalida 2023/2 · INEP', true, 'awaiting_content', '{"prova": [20], "pep": [35, 36, 37, 38, 39]}', '7'),
  ('inep2023-2-e08', 'Avaliação antropométrica e acompanhamento do crescimento em lactente', 'Pediatria', 'INEP', '2023/2', '2023-2', 8, 'Revalida 2023/2 · INEP', true, 'awaiting_content', '{"prova": [21, 22, 23, 24, 25], "pep": [40, 41, 42, 43, 44]}', '8'),
  ('inep2023-2-e09', 'Exame físico obstétrico e manobras de Leopold', 'Ginecologia e Obstetrícia', 'INEP', '2023/2', '2023-2', 9, 'Revalida 2023/2 · INEP', true, 'awaiting_content', '{"prova": [26], "pep": [45, 46, 47, 48, 49]}', '9'),
  ('inep2023-2-e10', 'Abordagem clínica da obesidade e mudança do estilo de vida', 'Medicina de Família e Comunidade', 'INEP', '2023/2', '2023-2', 10, 'Revalida 2023/2 · INEP', true, 'awaiting_content', '{"prova": [27, 28], "pep": [50, 51, 52, 53, 54, 55, 56]}', '10'),
  ('inep2024-1-e01', 'Semiologia do abdome com ascite e hipótese de Síndrome de Budd-Chiari', 'Clínica Médica', 'INEP', '2024/1', '2024-1', 1, 'Revalida 2024/1 · INEP', true, 'awaiting_content', '{"prova": [1, 2, 3, 4, 5, 6], "pep": [1, 2, 3, 4, 5, 6, 7]}', '1'),
  ('inep2024-1-e02', 'Atendimento ao politrauma e manejo do pneumotórax hipertensivo', 'Cirurgia Geral', 'INEP', '2024/1', '2024-1', 2, 'Revalida 2024/1 · INEP', true, 'awaiting_content', '{"prova": [7, 8, 9, 10, 11], "pep": [8, 9, 10, 11, 12, 13]}', '2'),
  ('inep2024-1-e03', 'Diagnóstico e manejo da estenose hipertrófica do piloro no lactente', 'Pediatria', 'INEP', '2024/1', '2024-1', 3, 'Revalida 2024/1 · INEP', true, 'awaiting_content', '{"prova": [12, 13, 14, 15, 16, 17], "pep": [14, 15, 16, 17, 18]}', '3'),
  ('inep2024-1-e04', 'Manejo da pré-eclâmpsia sobreposta a hipertensão crônica com síndrome HELLP', 'Ginecologia e Obstetrícia', 'INEP', '2024/1', '2024-1', 4, 'Revalida 2024/1 · INEP', true, 'awaiting_content', '{"prova": [18, 19, 20, 21], "pep": [19, 20, 21, 22, 23]}', '4'),
  ('inep2024-1-e05', 'Comunicação de más notícias no diagnóstico de adenocarcinoma cervical', 'Medicina de Família e Comunidade', 'INEP', '2024/1', '2024-1', 5, 'Revalida 2024/1 · INEP', true, 'awaiting_content', '{"prova": [22], "pep": [24, 25, 26, 27, 28]}', '5'),
  ('inep2024-1-e06', 'Diagnóstico de exacerbação de asma e técnica inalatória', 'Clínica Médica', 'INEP', '2024/1', '2024-1', 6, 'Revalida 2024/1 · INEP', true, 'awaiting_content', '{"prova": [23, 24, 25, 26], "pep": [29, 30, 31, 32, 33]}', '6'),
  ('inep2024-1-e07', 'Atendimento à paciente grande queimada e suspeita de lesão inalatória', 'Cirurgia Geral', 'INEP', '2024/1', '2024-1', 7, 'Revalida 2024/1 · INEP', true, 'awaiting_content', '{"prova": [27, 28, 29, 30, 31, 32, 33], "pep": [34, 35, 36, 37, 38, 39]}', '7'),
  ('inep2024-1-e08', 'Diagnóstico e conduta na celulite periorbitária e orbitária infantil', 'Pediatria', 'INEP', '2024/1', '2024-1', 8, 'Revalida 2024/1 · INEP', true, 'awaiting_content', '{"prova": [34, 35, 36, 37], "pep": [40, 41, 42, 43, 44]}', '8'),
  ('inep2024-1-e09', 'Abordagem da síndrome climatérica e indicação de terapia hormonal', 'Ginecologia e Obstetrícia', 'INEP', '2024/1', '2024-1', 9, 'Revalida 2024/1 · INEP', true, 'awaiting_content', '{"prova": [38], "pep": [45, 46, 47, 48, 49, 50]}', '9'),
  ('inep2024-1-e10', 'Orientação sobre preparo, aplicação, armazenamento e rodízio de insulina', 'Medicina de Família e Comunidade', 'INEP', '2024/1', '2024-1', 10, 'Revalida 2024/1 · INEP', true, 'awaiting_content', '{"prova": [39, 40], "pep": [51, 52, 53, 54, 55, 56, 57]}', '10'),
  ('inep2024-2-e01', 'Dengue clássica sem sinais de alarme e prova do laço', 'Clínica Médica', 'INEP', '2024/2', '2024-2', 1, 'Revalida 2024/2 · INEP', true, 'awaiting_content', '{"prova": [1, 2, 3, 4, 5], "pep": [1, 2, 3, 4, 5, 6]}', '1'),
  ('inep2024-2-e02', 'Oclusão arterial aguda de membro inferior por embolia cardiogênica', 'Cirurgia Geral', 'INEP', '2024/2', '2024-2', 2, 'Revalida 2024/2 · INEP', true, 'awaiting_content', '{"prova": [6, 7, 8, 9, 10, 11], "pep": [7, 8, 9, 10, 11, 12]}', '2'),
  ('inep2024-2-e03', 'Criptorquidia e fimose fisiológica em lactente na atenção primária', 'Pediatria', 'INEP', '2024/2', '2024-2', 3, 'Revalida 2024/2 · INEP', true, 'awaiting_content', '{"prova": [12, 13, 14], "pep": [13, 14, 15, 16, 17]}', '3'),
  ('inep2024-2-e04', 'Sangramento na segunda metade da gestação por placenta prévia total', 'Ginecologia e Obstetrícia', 'INEP', '2024/2', '2024-2', 4, 'Revalida 2024/2 · INEP', true, 'awaiting_content', '{"prova": [15, 16, 17, 18, 19], "pep": [18, 19, 20, 21, 22, 23]}', '4'),
  ('inep2024-2-e05', 'Acidente por contato com lagarta (erucismo) e suspeita de lonomismo', 'Medicina de Família e Comunidade', 'INEP', '2024/2', '2024-2', 5, 'Revalida 2024/2 · INEP', true, 'awaiting_content', '{"prova": [20, 21, 22, 23], "pep": [24, 25, 26, 27, 28]}', '5'),
  ('inep2024-2-e06', 'Acidente vascular cerebral isquêmico agudo e aplicação da escala NIHSS', 'Clínica Médica', 'INEP', '2024/2', '2024-2', 6, 'Revalida 2024/2 · INEP', true, 'awaiting_content', '{"prova": [24, 25, 26, 27, 28, 29, 30, 31, 32], "pep": [29, 30, 31, 32, 33, 34]}', '6'),
  ('inep2024-2-e07', 'Trauma esplênico com ruptura em dois tempos e choque hipovolêmico', 'Cirurgia Geral', 'INEP', '2024/2', '2024-2', 7, 'Revalida 2024/2 · INEP', true, 'awaiting_content', '{"prova": [33, 34, 35, 36, 37, 38], "pep": [35, 36, 37, 38, 39, 40]}', '7'),
  ('inep2024-2-e08', 'Aferição da pressão arterial na criança e investigação de hipertensão', 'Pediatria', 'INEP', '2024/2', '2024-2', 8, 'Revalida 2024/2 · INEP', true, 'awaiting_content', '{"prova": [39, 40, 41, 42, 43, 44, 45, 46, 47], "pep": [41, 42, 43, 44, 45, 46, 47]}', '8'),
  ('inep2024-2-e09', 'Atendimento à violência sexual com contracepção de emergência e profilaxias', 'Ginecologia e Obstetrícia', 'INEP', '2024/2', '2024-2', 9, 'Revalida 2024/2 · INEP', true, 'awaiting_content', '{"prova": [48, 49, 50], "pep": [48, 49, 50, 51, 52, 53]}', '9'),
  ('inep2024-2-e10', 'Diagnóstico e manejo ambulatorial da doença inflamatória pélvica aguda', 'Medicina de Família e Comunidade', 'INEP', '2024/2', '2024-2', 10, 'Revalida 2024/2 · INEP', true, 'awaiting_content', '{"prova": [51, 52], "pep": [54, 55, 56, 57, 58, 59]}', '10'),
  ('inep2025-1-e01', 'Lombalgia inflamatória crônica: espondiloartrite axial (espondilite anquilosante)', 'Clínica Médica', 'INEP', '2025/1', '2025-1', 1, 'Revalida 2025/1 · INEP', true, 'content_ready', '{"prova": [1, 2, 3, 4, 5], "pep": [1, 2, 3, 4, 5, 6]}', '1'),
  ('inep2025-1-e02', 'Abdome agudo perfurativo: úlcera péptica perfurada associada a anti-inflamatório', 'Cirurgia Geral', 'INEP', '2025/1', '2025-1', 2, 'Revalida 2025/1 · INEP', true, 'content_ready', '{"prova": [6, 7, 8, 9, 10], "pep": [7, 8, 9, 10, 11, 12]}', '2'),
  ('inep2025-1-e03', 'Transtorno do espectro autista (TEA): suspeita a partir de carta da escola', 'Pediatria', 'INEP', '2025/1', '2025-1', 3, 'Revalida 2025/1 · INEP', true, 'content_ready', '{"prova": [11, 12, 13, 14], "pep": [13, 14, 15, 16, 17, 18]}', '3'),
  ('inep2025-1-e04', 'Dengue na gestação: classificação grupo B e conduta na UBS', 'Ginecologia e Obstetrícia', 'INEP', '2025/1', '2025-1', 4, 'Revalida 2025/1 · INEP', true, 'content_ready', '{"prova": [15, 16, 17, 18, 19], "pep": [19, 20, 21, 22, 23, 24]}', '4'),
  ('inep2025-1-e05', 'Osteoporose pós-menopausa: interpretação de densitometria e plano na UBS', 'Medicina de Família e Comunidade', 'INEP', '2025/1', '2025-1', 5, 'Revalida 2025/1 · INEP', true, 'content_ready', '{"prova": [20, 21, 22], "pep": [25, 26, 27, 28, 29, 30, 31, 32, 33]}', '5'),
  ('inep2025-1-e06', 'Paralisia facial periférica (paralisia de Bell)', 'Clínica Médica', 'INEP', '2025/1', '2025-1', 6, 'Revalida 2025/1 · INEP', true, 'content_ready', '{"prova": [23, 24, 25, 26], "pep": [34, 35, 36, 37, 38, 39, 40]}', '6'),
  ('inep2025-1-e07', 'Ureterolitíase com hidronefrose à direita (cólica nefrética)', 'Cirurgia Geral', 'INEP', '2025/1', '2025-1', 7, 'Revalida 2025/1 · INEP', true, 'content_ready', '{"prova": [27, 28, 29, 30, 31], "pep": [41, 42, 43, 44, 45, 46, 47]}', '7'),
  ('inep2025-1-e08', 'Anafilaxia por picada de abelha em criança', 'Pediatria', 'INEP', '2025/1', '2025-1', 8, 'Revalida 2025/1 · INEP', true, 'content_ready', '{"prova": [32, 33, 34, 35], "pep": [48, 49, 50, 51, 52]}', '8'),
  ('inep2025-1-e09', 'Sangramento uterino aumentado por miomatose uterina', 'Ginecologia e Obstetrícia', 'INEP', '2025/1', '2025-1', 9, 'Revalida 2025/1 · INEP', true, 'content_ready', '{"prova": [36, 37, 38, 39], "pep": [53, 54, 55, 56, 57, 58]}', '9'),
  ('inep2025-1-e10', 'Insônia inicial após aposentadoria, com uso de telas à noite', 'Medicina de Família e Comunidade', 'INEP', '2025/1', '2025-1', 10, 'Revalida 2025/1 · INEP', true, 'content_ready', '{"prova": [40, 41], "pep": [59, 60, 61, 62, 63, 64]}', '10'),
  ('inep2025-2-e01', 'Diagnóstico e manejo não farmacológico do pré-diabetes', 'Clínica Médica', 'INEP', '2025/2', '2025-2', 1, 'Revalida 2025/2 · INEP', true, 'awaiting_content', '{"prova": [1, 2, 3], "pep": [1, 2, 3, 4, 5, 6]}', '1'),
  ('inep2025-2-e02', 'Diagnóstico de colecistite aguda litiásica e indicação de colecistectomia precoce', 'Cirurgia Geral', 'INEP', '2025/2', '2025-2', 2, 'Revalida 2025/2 · INEP', true, 'awaiting_content', '{"prova": [4, 5, 6, 7], "pep": [7, 8, 9, 10, 11, 12]}', '2'),
  ('inep2025-2-e03', 'Crise convulsiva febril simples associada a otite média aguda', 'Pediatria', 'INEP', '2025/2', '2025-2', 3, 'Revalida 2025/2 · INEP', true, 'awaiting_content', '{"prova": [8, 9, 10], "pep": [13, 14, 15, 16, 17, 18, 19]}', '3'),
  ('inep2025-2-e04', 'Diagnóstico e tratamento de cistite aguda na gestação', 'Ginecologia e Obstetrícia', 'INEP', '2025/2', '2025-2', 4, 'Revalida 2025/2 · INEP', true, 'awaiting_content', '{"prova": [11, 12, 13, 14], "pep": [20, 21, 22, 23, 24, 25, 26, 27, 28]}', '4'),
  ('inep2025-2-e05', 'Ajuste terapêutico na hipertensão arterial sistêmica não controlada', 'Medicina de Família e Comunidade', 'INEP', '2025/2', '2025-2', 5, 'Revalida 2025/2 · INEP', true, 'awaiting_content', '{"prova": [15, 16, 17, 18], "pep": [29, 30, 31, 32, 33, 34]}', '5'),
  ('inep2025-2-e06', 'Interpretação de sorologia para hepatites virais e vacinação contra hepatite B', 'Clínica Médica', 'INEP', '2025/2', '2025-2', 6, 'Revalida 2025/2 · INEP', true, 'awaiting_content', '{"prova": [19, 20, 21, 22, 23], "pep": [35, 36, 37, 38, 39, 40, 41]}', '6'),
  ('inep2025-2-e07', 'Hérnia inguinal encarcerada com obstrução intestinal e conduta de emergência', 'Cirurgia Geral', 'INEP', '2025/2', '2025-2', 7, 'Revalida 2025/2 · INEP', true, 'awaiting_content', '{"prova": [24, 25, 26, 27, 28], "pep": [42, 43, 44, 45, 46, 47, 48]}', '7'),
  ('inep2025-2-e08', 'Episódio hipotônico-hiporresponsivo pós-vacinal e indicação de vacina acelular no CRIE', 'Pediatria', 'INEP', '2025/2', '2025-2', 8, 'Revalida 2025/2 · INEP', true, 'awaiting_content', '{"prova": [29, 30, 31, 32, 33], "pep": [49, 50, 51, 52, 53, 54, 55]}', '8'),
  ('inep2025-2-e09', 'Investigação diagnóstica de síndrome dos ovários policísticos e amenorreia secundária', 'Ginecologia e Obstetrícia', 'INEP', '2025/2', '2025-2', 9, 'Revalida 2025/2 · INEP', true, 'awaiting_content', '{"prova": [34, 35], "pep": [56, 57, 58, 59, 60, 61]}', '9'),
  ('inep2025-2-e10', 'Abordagem de solicitação de medicamento antiobesidade sem indicação clínica', 'Medicina de Família e Comunidade', 'INEP', '2025/2', '2025-2', 10, 'Revalida 2025/2 · INEP', true, 'awaiting_content', '{"prova": [36, 37, 38], "pep": [62, 63, 64, 65, 66, 67, 68, 69, 70]}', '10'),
  ('rev2011-e01', 'Hipertensão arterial sistêmica', 'Clínica Médica', null, '2011', '2011', 1, 'Revalida 2011', false, 'awaiting_content', '{}', '1'),
  ('rev2011-e02', 'Intubação orotraqueal', 'Clínica Médica', null, '2011', '2011', 2, 'Revalida 2011', false, 'awaiting_content', '{}', '2'),
  ('rev2011-e03', 'Sutura', 'Cirurgia Geral', null, '2011', '2011', 3, 'Revalida 2011', false, 'awaiting_content', '{}', '3'),
  ('rev2011-e04', 'Colecistite aguda', 'Cirurgia Geral', null, '2011', '2011', 4, 'Revalida 2011', false, 'awaiting_content', '{}', '4'),
  ('rev2011-e05', 'Atenção ao recém-nascido', 'Pediatria', null, '2011', '2011', 5, 'Revalida 2011', false, 'awaiting_content', '{}', '5'),
  ('rev2011-e06', 'Obesidade infantil', 'Pediatria', null, '2011', '2011', 6, 'Revalida 2011', false, 'awaiting_content', '{}', '6'),
  ('rev2011-e07', 'Assistência pré-natal', 'Ginecologia e Obstetrícia', null, '2011', '2011', 7, 'Revalida 2011', false, 'awaiting_content', '{}', '7'),
  ('rev2011-e08', 'Doença inflamatória pélvica', 'Ginecologia e Obstetrícia', null, '2011', '2011', 8, 'Revalida 2011', false, 'awaiting_content', '{}', '8'),
  ('rev2011-e09', 'Consulta de puericultura', 'Medicina de Família e Comunidade', null, '2011', '2011', 9, 'Revalida 2011', false, 'awaiting_content', '{}', '9'),
  ('rev2011-e10', 'Dengue grupo D', 'Medicina de Família e Comunidade', null, '2011', '2011', 10, 'Revalida 2011', false, 'awaiting_content', '{}', '10'),
  ('rev2012-e01', 'Infarto agudo do miocárdio', 'Clínica Médica', null, '2012', '2012', 1, 'Revalida 2012', false, 'awaiting_content', '{}', '1'),
  ('rev2012-e02', 'Intubação orotraqueal', 'Clínica Médica', null, '2012', '2012', 2, 'Revalida 2012', false, 'awaiting_content', '{}', '2'),
  ('rev2012-e03', 'Complicação pós-operatória', 'Cirurgia Geral', null, '2012', '2012', 3, 'Revalida 2012', false, 'awaiting_content', '{}', '3'),
  ('rev2012-e04', 'Câncer de próstata', 'Cirurgia Geral', null, '2012', '2012', 4, 'Revalida 2012', false, 'awaiting_content', '{}', '4'),
  ('rev2012-e05', 'Aleitamento materno', 'Pediatria', null, '2012', '2012', 5, 'Revalida 2012', false, 'awaiting_content', '{}', '5'),
  ('rev2012-e06', 'Criptorquidia', 'Pediatria', null, '2012', '2012', 6, 'Revalida 2012', false, 'awaiting_content', '{}', '6'),
  ('rev2012-e07', 'Gravidez ectópica e óbito materno', 'Ginecologia e Obstetrícia', null, '2012', '2012', 7, 'Revalida 2012', false, 'awaiting_content', '{}', '7'),
  ('rev2012-e08', 'Pré-eclâmpsia', 'Ginecologia e Obstetrícia', null, '2012', '2012', 8, 'Revalida 2012', false, 'awaiting_content', '{}', '8'),
  ('rev2012-e09', 'Atribuições do agente comunitário de saúde', 'Medicina de Família e Comunidade', null, '2012', '2012', 9, 'Revalida 2012', false, 'awaiting_content', '{}', '9'),
  ('rev2012-e10', 'Assistência pré-natal', 'Medicina de Família e Comunidade', null, '2012', '2012', 10, 'Revalida 2012', false, 'awaiting_content', '{}', '10'),
  ('rev2013-e01', 'Pneumonia adquirida na comunidade', 'Clínica Médica', null, '2013', '2013', 1, 'Revalida 2013', false, 'awaiting_content', '{}', '1'),
  ('rev2013-e02', 'Tromboembolismo pulmonar', 'Clínica Médica', null, '2013', '2013', 2, 'Revalida 2013', false, 'awaiting_content', '{}', '2'),
  ('rev2013-e03', 'Queimadura', 'Cirurgia Geral', null, '2013', '2013', 3, 'Revalida 2013', false, 'awaiting_content', '{}', '3'),
  ('rev2013-e04', 'Sutura', 'Cirurgia Geral', null, '2013', '2013', 4, 'Revalida 2013', false, 'awaiting_content', '{}', '4'),
  ('rev2013-e05', 'Meningite meningocócica', 'Pediatria', null, '2013', '2013', 5, 'Revalida 2013', false, 'awaiting_content', '{}', '5'),
  ('rev2013-e06', 'Icterícia neonatal', 'Pediatria', null, '2013', '2013', 6, 'Revalida 2013', false, 'awaiting_content', '{}', '6'),
  ('rev2013-e07', 'Infertilidade conjugal', 'Ginecologia e Obstetrícia', null, '2013', '2013', 7, 'Revalida 2013', false, 'awaiting_content', '{}', '7'),
  ('rev2013-e08', 'Parto com distocia', 'Ginecologia e Obstetrícia', null, '2013', '2013', 8, 'Revalida 2013', false, 'awaiting_content', '{}', '8'),
  ('rev2013-e09', 'Atenção domiciliar', 'Medicina de Família e Comunidade', null, '2013', '2013', 9, 'Revalida 2013', false, 'awaiting_content', '{}', '9'),
  ('rev2013-e10', 'Estratégia saúde da família', 'Medicina de Família e Comunidade', null, '2013', '2013', 10, 'Revalida 2013', false, 'awaiting_content', '{}', '10'),
  ('rev2014-e01', 'Hipotireoidismo', 'Clínica Médica', null, '2014', '2014', 1, 'Revalida 2014', false, 'awaiting_content', '{}', '1'),
  ('rev2014-e02', 'Lombalgia', 'Clínica Médica', null, '2014', '2014', 2, 'Revalida 2014', false, 'awaiting_content', '{}', '2'),
  ('rev2014-e03', 'Celulite infecciosa', 'Cirurgia Geral', null, '2014', '2014', 3, 'Revalida 2014', false, 'awaiting_content', '{}', '3'),
  ('rev2014-e04', 'Atendimento inicial ao trauma', 'Cirurgia Geral', null, '2014', '2014', 4, 'Revalida 2014', false, 'awaiting_content', '{}', '4'),
  ('rev2014-e05', 'Escarlatina', 'Pediatria', null, '2014', '2014', 5, 'Revalida 2014', false, 'awaiting_content', '{}', '5'),
  ('rev2014-e06', 'Atenção ao recém-nascido', 'Pediatria', null, '2014', '2014', 6, 'Revalida 2014', false, 'awaiting_content', '{}', '6'),
  ('rev2014-e07', 'Sífilis na gestação', 'Ginecologia e Obstetrícia', null, '2014', '2014', 7, 'Revalida 2014', false, 'awaiting_content', '{}', '7'),
  ('rev2014-e08', 'Métodos contraceptivos', 'Ginecologia e Obstetrícia', null, '2014', '2014', 8, 'Revalida 2014', false, 'awaiting_content', '{}', '8'),
  ('rev2014-e09', 'Tabagismo e enfisema pulmonar', 'Medicina de Família e Comunidade', null, '2014', '2014', 9, 'Revalida 2014', false, 'awaiting_content', '{}', '9'),
  ('rev2014-e10', 'Tuberculose', 'Medicina de Família e Comunidade', null, '2014', '2014', 10, 'Revalida 2014', false, 'awaiting_content', '{}', '10'),
  ('rev2015-e01', 'Diabetes mellitus tipo 2', 'Clínica Médica', null, '2015', '2015', 1, 'Revalida 2015', false, 'awaiting_content', '{}', '1'),
  ('rev2015-e02', 'Infecção urinária recorrente', 'Clínica Médica', null, '2015', '2015', 2, 'Revalida 2015', false, 'awaiting_content', '{}', '2'),
  ('rev2015-e03', 'Úlcera péptica perfurada', 'Cirurgia Geral', null, '2015', '2015', 3, 'Revalida 2015', false, 'awaiting_content', '{}', '3'),
  ('rev2015-e04', 'Drenagem pleural', 'Cirurgia Geral', null, '2015', '2015', 4, 'Revalida 2015', false, 'awaiting_content', '{}', '4'),
  ('rev2015-e05', 'Aleitamento materno na puericultura', 'Pediatria', null, '2015', '2015', 5, 'Revalida 2015', false, 'awaiting_content', '{}', '5'),
  ('rev2015-e06', 'Atraso constitucional do crescimento', 'Pediatria', null, '2015', '2015', 6, 'Revalida 2015', false, 'awaiting_content', '{}', '6'),
  ('rev2015-e07', 'Ameaça de abortamento', 'Ginecologia e Obstetrícia', null, '2015', '2015', 7, 'Revalida 2015', false, 'awaiting_content', '{}', '7'),
  ('rev2015-e08', 'Violência sexual', 'Ginecologia e Obstetrícia', null, '2015', '2015', 8, 'Revalida 2015', false, 'awaiting_content', '{}', '8'),
  ('rev2015-e09', 'Tabagismo em consulta de rotina', 'Medicina de Família e Comunidade', null, '2015', '2015', 9, 'Revalida 2015', false, 'awaiting_content', '{}', '9'),
  ('rev2015-e10', 'Hanseníase', 'Medicina de Família e Comunidade', null, '2015', '2015', 10, 'Revalida 2015', false, 'awaiting_content', '{}', '10'),
  ('rev2016-e01', 'Comunicação de diagnóstico de HIV', 'Clínica Médica', null, '2016', '2016', 1, 'Revalida 2016', false, 'awaiting_content', '{}', '1'),
  ('rev2016-e02', 'Enxaqueca', 'Clínica Médica', null, '2016', '2016', 2, 'Revalida 2016', false, 'awaiting_content', '{}', '2'),
  ('rev2016-e03', 'Abdome agudo perfurativo', 'Cirurgia Geral', null, '2016', '2016', 3, 'Revalida 2016', false, 'awaiting_content', '{}', '3'),
  ('rev2016-e04', 'Sutura', 'Cirurgia Geral', null, '2016', '2016', 4, 'Revalida 2016', false, 'awaiting_content', '{}', '4'),
  ('rev2016-e05', 'Comunicação de diagnóstico de síndrome de Down', 'Pediatria', null, '2016', '2016', 5, 'Revalida 2016', false, 'awaiting_content', '{}', '5'),
  ('rev2016-e06', 'Aleitamento materno', 'Pediatria', null, '2016', '2016', 6, 'Revalida 2016', false, 'awaiting_content', '{}', '6'),
  ('rev2016-e07', 'Asma', 'Pediatria', null, '2016', '2016', 7, 'Revalida 2016', false, 'awaiting_content', '{}', '7'),
  ('rev2016-e08', 'Dengue na gestação', 'Ginecologia e Obstetrícia', null, '2016', '2016', 8, 'Revalida 2016', false, 'awaiting_content', '{}', '8'),
  ('rev2016-e09', 'Violência doméstica com risco de suicídio', 'Ginecologia e Obstetrícia', null, '2016', '2016', 9, 'Revalida 2016', false, 'awaiting_content', '{}', '9'),
  ('rev2016-e10', 'Estratégia saúde da família', 'Medicina de Família e Comunidade', null, '2016', '2016', 10, 'Revalida 2016', false, 'awaiting_content', '{}', '10'),
  ('rev2016-e11', 'Tuberculose', 'Medicina de Família e Comunidade', null, '2016', '2016', 11, 'Revalida 2016', false, 'awaiting_content', '{}', '11'),
  ('rev2017-e01', 'Hipertensão arterial sistêmica em consulta de rotina', 'Clínica Médica', null, '2017', '2017', 1, 'Revalida 2017', false, 'awaiting_content', '{}', '1'),
  ('rev2017-e02', 'Doença do refluxo gastroesofágico', 'Clínica Médica', null, '2017', '2017', 2, 'Revalida 2017', false, 'awaiting_content', '{}', '2'),
  ('rev2017-e03', 'Pneumotórax espontâneo', 'Cirurgia Geral', null, '2017', '2017', 3, 'Revalida 2017', false, 'awaiting_content', '{}', '3'),
  ('rev2017-e04', 'Trauma por ferimento por arma branca', 'Cirurgia Geral', null, '2017', '2017', 4, 'Revalida 2017', false, 'awaiting_content', '{}', '4'),
  ('rev2017-e05', 'Obstrução de vias aéreas', 'Pediatria', null, '2017', '2017', 5, 'Revalida 2017', false, 'awaiting_content', '{}', '5'),
  ('rev2017-e06', 'Déficit de ganho ponderal', 'Pediatria', null, '2017', '2017', 6, 'Revalida 2017', false, 'awaiting_content', '{}', '6'),
  ('rev2017-e07', 'Eclâmpsia', 'Ginecologia e Obstetrícia', null, '2017', '2017', 7, 'Revalida 2017', false, 'awaiting_content', '{}', '7'),
  ('rev2017-e08', 'Métodos contraceptivos', 'Ginecologia e Obstetrícia', null, '2017', '2017', 8, 'Revalida 2017', false, 'awaiting_content', '{}', '8'),
  ('rev2017-e09', 'Visita domiciliar pós-infarto agudo do miocárdio', 'Medicina de Família e Comunidade', null, '2017', '2017', 9, 'Revalida 2017', false, 'awaiting_content', '{}', '9'),
  ('rev2017-e10', 'LER/DORT e transtorno de ansiedade generalizada', 'Medicina de Família e Comunidade', null, '2017', '2017', 10, 'Revalida 2017', false, 'awaiting_content', '{}', '10')
) as v (id, name, area, institution, year, edition, num, origin, official, status, pages, label)
on conflict (id) do update set
  catalog_edition = excluded.catalog_edition, catalog_number = excluded.catalog_number, catalog_number_label = excluded.catalog_number_label,
  origin_label = excluded.origin_label, official_source = excluded.official_source, catalog_pages = excluded.catalog_pages;

-- Lista dos cartões para a equipe (e a prévia): agrupada por área na tela, filtrável por edição.
create or replace function public.app_admin_station_cards() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.checklist_station_assert_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'area', s.area, 'area_code', public.dupla_area_code(s.area),
      'edition', s.catalog_edition, 'number', s.catalog_number, 'number_label', s.catalog_number_label,
      'origin_label', s.origin_label, 'official_source', s.official_source, 'content_status', s.content_status,
      'medical_review', s.medical_review, 'pages', s.catalog_pages
    ) order by array_position(array['Clínica Médica','Cirurgia Geral','Ginecologia e Obstetrícia','Pediatria','Medicina de Família e Comunidade'], s.area),
               s.official_source desc, s.catalog_edition, s.catalog_number)
    from public.checklist_stations s where s.catalog_edition is not null), '[]'::jsonb);
end
$$;
revoke execute on function public.app_admin_station_cards() from public, anon;
grant execute on function public.app_admin_station_cards() to authenticated;
