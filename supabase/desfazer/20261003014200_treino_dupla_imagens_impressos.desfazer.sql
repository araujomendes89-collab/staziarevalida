-- Desfazer da 20261003014200_treino_dupla_imagens_impressos.sql (imagens dos impressos da 2ª fase, 18/10/2026).
-- Tira do conteúdo das estações as chaves de pressing_assets que apontam para linhas desta tabela (a sala volta a mostrar o
-- impresso em texto), apaga a função e a tabela. NÃO mexe na folha do candidato (pressing_assets.candidate_sheet com
-- { "folha": … }, da 013390) nem nos arquivos do depósito content-hub (ficam lá, sem uso). Pode ser colado duas vezes.
do $$
begin
  if to_regclass('public.station_assets') is not null then
    update public.checklist_station_contents k
       set content = jsonb_set(k.content, '{pressing_assets}',
                               (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                                  from jsonb_each(k.content -> 'pressing_assets') e
                                 where not (jsonb_typeof(e.value) = 'string'
                                            and exists (select 1 from public.station_assets a where a.id::text = e.value #>> '{}'))))
     where jsonb_typeof(k.content -> 'pressing_assets') = 'object';
  end if;
end
$$;
drop function if exists public.ch_worker_dupla_impresso_ligar(text, text, text, text, integer, integer, integer, boolean);
drop table if exists public.station_assets;
