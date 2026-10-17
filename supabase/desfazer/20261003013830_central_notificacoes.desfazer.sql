-- Desfaz a 20261003013830_central_notificacoes.sql (Central de Notificações do aluno). Volta avisos_aluno ao que era na 013760.
-- ATENÇÃO: apaga as notificações de contrato novo e os comunicados já enviados (e o registro dos comunicados). Os avisos de cobrança
-- ficam como estão. Pode ser colado de novo sem erro.
drop function if exists public.app_admin_comunicados(integer);
drop function if exists public.app_admin_comunicado_enviar(text, text, text, text, text, text);
drop function if exists public.app_admin_comunicado_previa(text, text);
drop function if exists public.comunicado_validar(text, text);
drop function if exists public.app_notificacoes_lidas(bigint[]);
drop function if exists public.app_minhas_notificacoes(integer);
drop function if exists public.notificacao_contrato_sincronizar(uuid);
drop function if exists public.comunicado_alunos(text, text);
drop function if exists public.notificacao_acao(text, text, text);

delete from public.avisos_aluno where tipo in ('contrato_novo', 'comunicado') or email_status = 'so_tela' or rota in ('link', 'nenhuma');
alter table public.avisos_aluno drop constraint if exists avisos_aluno_tipo_check;
alter table public.avisos_aluno add constraint avisos_aluno_tipo_check check (tipo in ('renovacao', 'pagamento_falhou', 'acesso_bloqueado', 'acesso_liberado'));
alter table public.avisos_aluno drop constraint if exists avisos_aluno_rota_check;
alter table public.avisos_aluno add constraint avisos_aluno_rota_check check (rota in ('planos', 'perfil', 'aceite'));
alter table public.avisos_aluno drop constraint if exists avisos_aluno_email_status_check;
alter table public.avisos_aluno add constraint avisos_aluno_email_status_check
  check (email_status in ('pendente', 'enviando', 'enviado', 'falhou', 'expirado', 'sem_email'));
drop index if exists public.avisos_aluno_nao_lidas_idx;
alter table public.avisos_aluno drop column if exists comunicado_id;
alter table public.avisos_aluno drop column if exists link;
drop table if exists public.comunicados_equipe;

-- o pop-up volta à versão da 013760 (sem o filtro de tipo)
create or replace function public.app_meus_avisos() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_user constant uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  return jsonb_build_object(
    'novos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'titulo', a.titulo, 'texto', a.texto, 'rota', a.rota, 'em', a.criado_em)
                                        order by a.criado_em desc)
                       from public.avisos_aluno a where a.user_id = v_user and a.visto_em is null and a.criado_em > now() - interval '30 days'), '[]'::jsonb),
    'recentes', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'titulo', a.titulo, 'texto', a.texto, 'em', a.criado_em,
                                                              'visto', a.visto_em is not null, 'email', a.email_status = 'enviado') order by a.criado_em desc)
                          from (select * from public.avisos_aluno where user_id = v_user order by criado_em desc limit 10) a), '[]'::jsonb));
end
$$;
revoke execute on function public.app_meus_avisos() from public, anon;
grant execute on function public.app_meus_avisos() to authenticated;
