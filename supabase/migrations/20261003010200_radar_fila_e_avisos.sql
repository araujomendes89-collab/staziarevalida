-- =============================================================================
-- RADAR DE EVIDÊNCIAS, parte 2: tela "Fila do Radar" e aviso ao dono quando a mudança é GRAVE.
-- PROPOSTA: não aplicada em produção. Ensaiada só no banco de desenvolvimento (PGlite) e com rollback (scripts/radar/ensaio-fila-avisos.ts).
-- Só ACRESCENTA: duas colunas novas em radar_eventos (decisao_dono, parecer_revisores...), a tabela radar_avisos (fila de e-mails),
-- um gatilho e as funções app_admin_radar_fila_detalhada / app_admin_radar_avisos / app_admin_radar_acao / app_admin_radar_parecer.
-- Nenhuma tabela de conteúdo (questão, gabarito, aula, atualização) é tocada. Depende de 20261003010100_radar_evidencias.sql.
-- Pode ser colada mais de uma vez.
--
-- Como o dono é avisado:
--   1. NO APP (não precisa de nada além desta migração): a contagem de graves aguardando o dono (app_admin_radar_avisos) aparece
--      como número na aba "Fila do Radar", no item "Administração" do menu e numa faixa no Início do administrador;
--   2. E-MAIL: o gatilho abaixo ENFILEIRA o aviso em radar_avisos (um por administrador e por evento grave). O app NÃO tem envio de e-mail
--      transacional (o SMTP do Supabase Auth está pendente) e nenhum envio foi montado. Quando houver um canal, um processo com a chave
--      de serviço lê radar_avisos where status = 'pendente', envia e marca 'enviado' (ou 'erro' com ultimo_erro). O e-mail do dono
--      é lido de auth.users na hora do envio (não é copiado para cá).
-- =============================================================================

-- ---------------------------------------------------------------- colunas novas do evento
alter table public.radar_eventos add column if not exists decisao_dono text;
alter table public.radar_eventos add column if not exists parecer_revisores text;
alter table public.radar_eventos add column if not exists parecer_em timestamptz;
alter table public.radar_eventos add column if not exists parecer_por uuid references auth.users (id) on delete set null;
alter table public.radar_eventos drop constraint if exists radar_eventos_decisao_dono_check;
alter table public.radar_eventos add constraint radar_eventos_decisao_dono_check
  check (decisao_dono is null or decisao_dono in ('sem_impacto', 'ajustar_texto', 'refazer', 'encaminhar_revisao', 'concluida'));
alter table public.radar_eventos drop constraint if exists radar_eventos_parecer_check;
alter table public.radar_eventos add constraint radar_eventos_parecer_check
  check (parecer_revisores is null or char_length(parecer_revisores) <= 4000);
-- grave que ainda espera o dono: usada pelo número da aba e pelo aviso
create index if not exists radar_eventos_graves_dono_idx on public.radar_eventos (detectado_em desc)
  where gravidade = 'grave' and status in ('pendente', 'vista', 'em_revisao') and decisao_dono is null;

-- ---------------------------------------------------------------- fila de avisos por e-mail (envio futuro)
create table if not exists public.radar_avisos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.radar_eventos (id) on delete cascade,
  destinatario uuid not null references auth.users (id) on delete cascade,
  canal text not null default 'email' check (canal in ('email')),
  assunto text not null check (char_length(assunto) <= 200),
  corpo text not null check (char_length(corpo) <= 2000),
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'erro', 'dispensado')),
  tentativas integer not null default 0,
  ultimo_erro text check (ultimo_erro is null or char_length(ultimo_erro) <= 400),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  unique (evento_id, destinatario, canal)
);
create index if not exists radar_avisos_pendentes_idx on public.radar_avisos (criado_em) where status = 'pendente';
alter table public.radar_avisos enable row level security;
drop policy if exists "radar avisos: administrador lê" on public.radar_avisos;
create policy "radar avisos: administrador lê" on public.radar_avisos for select to authenticated using (public.is_admin());
revoke all on table public.radar_avisos from anon;
revoke insert, update, delete, truncate on table public.radar_avisos from authenticated;

-- toda mudança GRAVE nova enfileira um aviso para cada administrador (o dono). Leve não avisa ninguém.
create or replace function public.radar_enfileirar_aviso_grave() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if new.gravidade <> 'grave' then return new; end if;
  select coalesce(nullif(btrim(s.title), ''), f.library_doc_id) into v_nome
    from public.radar_fontes f left join public.ch_sources s on s.id = f.source_id where f.id = new.fonte_id;
  insert into public.radar_avisos (evento_id, destinatario, assunto, corpo)
  select new.id, r.user_id,
    left('StaziaMed: mudança GRAVE numa fonte oficial (' || coalesce(v_nome, 'fonte') || ')', 200),
    left('O Radar de Evidências registrou uma mudança grave e ela espera a sua decisão em Administração > Fila do Radar. '
      || 'Fonte: ' || coalesce(v_nome, 'sem nome') || '. Motivo: ' || coalesce(new.motivo_gravidade, 'não informado') || '. '
      || 'Prazo de pré-revisão dos 2 revisores: ' || to_char(new.prazo_revisao_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || '.', 2000)
  from public.user_roles r where r.role = 'admin'
  on conflict (evento_id, destinatario, canal) do nothing;
  return new;
end $$;
revoke all on function public.radar_enfileirar_aviso_grave() from public, anon, authenticated;
drop trigger if exists radar_aviso_grave on public.radar_eventos;
create trigger radar_aviso_grave after insert on public.radar_eventos for each row execute function public.radar_enfileirar_aviso_grave();

-- ---------------------------------------------------------------- avisos no app (só administrador)
-- graves_pendentes = graves que ainda esperam a decisão do dono; itens = as 5 mais urgentes.
create or replace function public.app_admin_radar_avisos() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then jsonb_build_object(
      'graves_pendentes', (select count(*) from public.radar_eventos e where e.gravidade = 'grave' and e.status in ('pendente', 'vista', 'em_revisao') and e.decisao_dono is null),
      'vencidas', (select count(*) from public.radar_eventos e where e.gravidade = 'grave' and e.status in ('pendente', 'vista', 'em_revisao') and e.decisao_dono is null and e.prazo_revisao_ate < now()),
      'itens', coalesce((select jsonb_agg(x) from (
          select jsonb_build_object('evento', e.id, 'fonte', coalesce(nullif(btrim(s.title), ''), f.library_doc_id), 'motivo', e.motivo_gravidade,
                 'detectado_em', e.detectado_em, 'prazo_revisao_ate', e.prazo_revisao_ate, 'vencido', e.prazo_revisao_ate < now()) as x
          from public.radar_eventos e join public.radar_fontes f on f.id = e.fonte_id left join public.ch_sources s on s.id = f.source_id
          where e.gravidade = 'grave' and e.status in ('pendente', 'vista', 'em_revisao') and e.decisao_dono is null
          order by e.prazo_revisao_ate limit 5) t), '[]'::jsonb))
    else jsonb_build_object('graves_pendentes', 0, 'vencidas', 0, 'itens', '[]'::jsonb) end;
$$;
revoke all on function public.app_admin_radar_avisos() from public, anon;
grant execute on function public.app_admin_radar_avisos() to authenticated;

-- ---------------------------------------------------------------- fila completa para a tela
-- p_filtro: todos | graves | leves | pendentes | decididos | em_andamento. Equipe lê (revisores também); aluno e anônimo recebem [].
-- afetados: lista por item (tipo, ref, nível trecho/tema, páginas, citação, estado), até 60 por evento; itens: diff curto (até 8 trechos).
create or replace function public.app_admin_radar_fila_detalhada(p_filtro text default 'pendentes') returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_staff() then coalesce(jsonb_agg(x order by ord), '[]'::jsonb) else '[]'::jsonb end
  from (
    select ((e.gravidade = 'grave')::int * -1000000000 + extract(epoch from e.prazo_revisao_ate)::bigint) as ord,
      jsonb_build_object(
        'evento', e.id,
        'fonte', jsonb_build_object('doc_id', f.library_doc_id, 'nome', coalesce(nullif(btrim(s.title), ''), f.library_doc_id), 'orgao', s.organ, 'url', coalesce(f.url, s.url),
          'referencia', f.referencia, 'esfera', f.esfera, 'norma_sus', f.norma_sus, 'uso_permitido', f.uso_permitido, 'vigencia_normativa', f.vigencia_normativa,
          'data_edicao', f.data_edicao, 'temas', f.tema_clinico),
        'origem', e.origem, 'gravidade', e.gravidade, 'motivo', e.motivo_gravidade,
        'detectado_em', e.detectado_em, 'prazo_revisao_ate', e.prazo_revisao_ate,
        'vencido', (e.prazo_revisao_ate < now() and e.status in ('pendente', 'vista', 'em_revisao')),
        'status', e.status, 'decisao_dono', e.decisao_dono, 'precisa_decisao_dono', e.precisa_decisao_dono,
        'aguarda_dono', (e.gravidade = 'grave' and e.status in ('pendente', 'vista', 'em_revisao') and e.decisao_dono is null),
        'resumo', e.resumo,
        'itens', coalesce((select jsonb_agg(jsonb_build_object('kind', i ->> 'kind', 'critical', coalesce((i ->> 'critical')::boolean, false),
              'pagina_antiga', i -> 'pagina_antiga', 'pagina_nova', i -> 'pagina_nova',
              'antes', left(coalesce(i -> 'trecho' ->> 'antes', i ->> 'texto_antigo'), 400), 'depois', left(coalesce(i -> 'trecho' ->> 'depois', i ->> 'texto_novo'), 400)))
            from (select j.i from jsonb_array_elements(e.itens) as j(i)
                  where coalesce(j.i ->> 'kind', '') not in ('UNCHANGED', 'EDITORIAL') limit 8) q(i)), '[]'::jsonb),
        'itens_total', jsonb_array_length(e.itens),
        'analise', case when e.analise_ia is null then null else jsonb_build_object(
          'o_que_mudou', e.analise_ia ->> 'o_que_mudou', 'recomendacao_alterada', e.analise_ia ->> 'recomendacao_alterada',
          'impacto_clinico_provavel', e.analise_ia ->> 'impacto_clinico_provavel', 'certeza', e.analise_ia ->> 'certeza') end,
        'afetados', coalesce((select jsonb_agg(jsonb_build_object('tipo', a.tipo, 'ref', a.ref, 'nivel', a.nivel, 'paginas', a.paginas, 'citacao', a.citacao, 'status', a.status)
              order by (a.nivel = 'trecho') desc, a.tipo, a.ref)
            from (select * from public.radar_afetados where evento_id = e.id order by (nivel = 'trecho') desc, tipo, ref limit 60) a), '[]'::jsonb),
        'afetados_total', (select count(*) from public.radar_afetados a where a.evento_id = e.id),
        'afetados_pendentes', (select count(*) from public.radar_afetados a where a.evento_id = e.id and a.status in ('pendente', 'em_revisao')),
        'nota', e.nota, 'decidido_em', e.decidido_em,
        'parecer', e.parecer_revisores, 'parecer_em', e.parecer_em) as x
    from public.radar_eventos e
    join public.radar_fontes f on f.id = e.fonte_id
    left join public.ch_sources s on s.id = f.source_id
    where case coalesce(p_filtro, 'pendentes')
        when 'graves' then e.gravidade = 'grave'
        when 'leves' then e.gravidade = 'leve'
        when 'pendentes' then e.status in ('pendente', 'vista') and e.decisao_dono is null
        when 'em_andamento' then e.status = 'em_revisao'
        when 'decididos' then e.status in ('resolvida', 'descartada')
        else true end
    order by (e.gravidade = 'grave') desc, e.prazo_revisao_ate
    limit 200
  ) t;
$$;
revoke all on function public.app_admin_radar_fila_detalhada(text) from public, anon;
grant execute on function public.app_admin_radar_fila_detalhada(text) to authenticated;

-- ---------------------------------------------------------------- parecer dos 2 revisores (colado/registrado)
create or replace function public.app_admin_radar_parecer(p_evento uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Só a equipe registra parecer.' using errcode = '42501'; end if;
  if p_texto is null or char_length(btrim(p_texto)) < 3 then raise exception 'Escreva o parecer dos revisores.' using errcode = '22023'; end if;
  if char_length(p_texto) > 4000 then raise exception 'O parecer passou de 4.000 caracteres.' using errcode = '22023'; end if;
  update public.radar_eventos set parecer_revisores = btrim(p_texto), parecer_em = now(), parecer_por = auth.uid() where id = p_evento;
  if not found then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.app_admin_radar_parecer(uuid, text) from public, anon;
grant execute on function public.app_admin_radar_parecer(uuid, text) to authenticated;

-- ---------------------------------------------------------------- decisão do dono, com ação e nota obrigatória
-- sem_impacto -> descartada | ajustar_texto, refazer, encaminhar_revisao -> em_revisao (continua aberta, mas já não espera o dono) | concluida -> resolvida.
-- Usa app_admin_radar_decidir (mesmas regras: grave só o administrador encerra). Não toca em questão, gabarito, aula ou atualização.
create or replace function public.app_admin_radar_acao(p_evento uuid, p_acao text, p_nota text) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text; v_grav text;
begin
  if not public.is_staff() then raise exception 'Só a equipe decide.' using errcode = '42501'; end if;
  if p_acao not in ('sem_impacto', 'ajustar_texto', 'refazer', 'encaminhar_revisao', 'concluida') then raise exception 'Ação inválida.' using errcode = '22023'; end if;
  if p_nota is null or char_length(btrim(p_nota)) < 5 then raise exception 'A nota é obrigatória: explique em uma frase a sua decisão.' using errcode = '22023'; end if;
  select gravidade into v_grav from public.radar_eventos where id = p_evento;
  if v_grav is null then raise exception 'Evento não encontrado.' using errcode = 'P0002'; end if;
  -- decisão sobre grave é do dono; o revisor só pode encaminhar à revisão (parecer)
  if v_grav = 'grave' and p_acao <> 'encaminhar_revisao' and not public.is_admin() then
    raise exception 'Mudança grave: quem decide é o dono (administrador).' using errcode = '42501';
  end if;
  v_status := case p_acao when 'sem_impacto' then 'descartada' when 'concluida' then 'resolvida' else 'em_revisao' end;
  perform public.app_admin_radar_decidir(p_evento, v_status, btrim(p_nota));
  -- só a decisão do administrador tira a grave da lista de espera do dono; o encaminhamento de um revisor não
  if public.is_admin() then update public.radar_eventos set decisao_dono = p_acao where id = p_evento; end if;
end $$;
revoke all on function public.app_admin_radar_acao(uuid, text, text) from public, anon;
grant execute on function public.app_admin_radar_acao(uuid, text, text) to authenticated;
-- Para desfazer: drop trigger radar_aviso_grave on radar_eventos; drop function radar_enfileirar_aviso_grave(), app_admin_radar_avisos(),
--   app_admin_radar_fila_detalhada(text), app_admin_radar_parecer(uuid,text), app_admin_radar_acao(uuid,text,text); drop table radar_avisos;
--   alter table radar_eventos drop column decisao_dono, drop column parecer_revisores, drop column parecer_em, drop column parecer_por;
