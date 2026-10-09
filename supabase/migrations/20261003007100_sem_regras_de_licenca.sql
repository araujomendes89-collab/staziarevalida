-- Central de Conteúdo sem regras de licença.
-- Decisão do dono em 2026-10-09: "nenhum campo de direitos em lugar nenhum"; todo PDF de estudo enviado é tratado como
-- material próprio, liberado para adaptar e publicar, sem registro de autorização.
-- Esta migração (1) marca como "own" os documentos de estudo já existentes e (2) tira da publicação a trava de licença vencida.
-- O cadastro de licenças (ch_licenses), a limpeza de referências e as demais funções ficam como estão, sem tela e sem uso.

update public.ch_documents set rights_status = 'own' where purpose = 'study_material' and rights_status <> 'own';

create or replace function public.app_ch_publish(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if public.ch_flag('shadow_mode') then
    raise exception 'Modo sombra ligado: a IA analisa e sugere, mas nada é publicado. Um administrador precisa desligá-lo.' using errcode = '55000';
  end if;
  if not public.ch_flag('publish_enabled') then
    raise exception 'Publicação desligada. Um administrador precisa ligá-la em Configuração.' using errcode = '55000';
  end if;
  return public.ch_publish_impl(p_version_id);
end
$$;
