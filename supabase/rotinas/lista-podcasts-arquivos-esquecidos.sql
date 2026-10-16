-- =============================================================================
-- LISTA (só leitura) dos arquivos esquecidos no depósito "podcasts" do Supabase.
-- Não apaga, não muda e não cria nada: é um SELECT. Cole no editor SQL do Supabase e rode.
--
-- Mostra o arquivo do depósito que NENHUMA linha do banco usa:
--   * nenhum episódio o tem como áudio (podcasts.audio_path);
--   * nenhuma fonte de podcast o tem como arquivo (podcast_sources.storage_path);
--   * nenhum material de aula o usa (lesson_materials.storage_path);
--   * ele não está retido pela Fonte complementar (ch_file_holds).
-- As partes temporárias de um áudio (pasta tmp) só entram quando têm mais de 1 dia: geração em andamento não é esquecida.
--
-- A primeira linha (tipo RESUMO) dá a conta: quantos arquivos e quantos MB. As outras trazem o nome completo do arquivo
-- (episódio/arquivo), o tamanho em MB e a data em que o arquivo foi enviado. O dono olha a lista e decide; apagar é sem volta
-- e NENHUMA rotina automática apaga estes arquivos antigos.
-- Criada em 2026-10-11 (P08, leva3-p). Pode ser rodada quantas vezes quiser.
-- =============================================================================
with objetos as (
  select o.name, o.created_at, coalesce((o.metadata ->> 'size')::bigint, 0) as bytes
  from storage.objects o
  where o.bucket_id = 'podcasts'
    and o.name !~ '(^|/)\.emptyFolderPlaceholder$'
),
esquecidos as (
  select o.*,
         case
           when o.name ~ '/tmp/' then 'Partes temporárias de um áudio que não terminou'
           when o.name ~ '/audio-[^/]*$' then 'Áudio que nenhum episódio usa'
           when o.name ~ '/src-[^/]*$' then 'Arquivo de fonte que nenhuma fonte usa'
           else 'Outro arquivo que nenhuma linha do banco usa'
         end as tipo
  from objetos o
  where not exists (select 1 from public.podcasts p where p.audio_path = o.name)
    and not exists (select 1 from public.podcast_sources s where s.storage_path = o.name)
    and not exists (select 1 from public.lesson_materials m where m.storage_path = o.name)
    and not exists (select 1 from public.ch_file_holds h where h.storage_path = o.name)
    and (o.name !~ '/tmp/' or o.created_at < now() - interval '1 day')
)
select 0::bigint as ordem,
       'RESUMO'::text as tipo,
       (count(*) || case when count(*) = 1 then ' arquivo esquecido' else ' arquivos esquecidos' end
        || ' (' || coalesce(round(sum(bytes) / 1048576.0, 1), 0)::text || ' MB no total): '
        || count(*) filter (where tipo like 'Áudio%') || ' de áudio, '
        || count(*) filter (where tipo like 'Arquivo de fonte%') || ' de fonte, '
        || count(*) filter (where tipo like 'Partes temporárias%') || ' temporários, '
        || count(*) filter (where tipo like 'Outro%') || ' outros. Nada foi apagado.')::text as arquivo,
       coalesce(round(sum(bytes) / 1048576.0, 1), 0)::text as tamanho_mb,
       null::text as enviado_em
from esquecidos
union all
select row_number() over (order by tipo, created_at, name),
       tipo,
       name::text,
       round(bytes / 1048576.0, 2)::text,
       to_char(created_at, 'DD/MM/YYYY HH24:MI')
from esquecidos
order by ordem;
