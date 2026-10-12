-- =============================================================================
-- PL06 (decisão do dono de 2026-10-11): a chave "Oferecer teste grátis no cadastro" (Administração > Planos > Teste grátis) passa a valer
-- DE VERDADE. Pode ser colada de novo no Supabase sem estragar nada ("create or replace"). Depende da 9730 já aplicada.
--
-- Antes: todo cadastro novo ganhava o teste (dias em Configurações), com a chave ligada ou desligada.
-- Agora: chave LIGADA = como hoje (teste pelos dias das Configurações); chave DESLIGADA = o cadastro novo nasce SEM teste: assinatura
--        "Teste grátis · Expirado" sem data de fim (na Conta aparece "Acesso gratuito"). Esse aluno tem questões e flashcards abertos
--        e NÃO tem Tutor, simulados completos nem estações Pro (mesma regra do teste vencido, 9730) até a equipe dar um plano ou um
--        teste em Administração > Usuários.
-- Quem já está em teste (ou com qualquer plano) NÃO muda: a regra vale só para contas criadas depois.
-- A chave nasce LIGADA (linha do plano Teste grátis criada ativa pela …1300). Cadastro por e-mail e por Google passam pelo mesmo gatilho.
-- Igual ao handle_new_user de …5300_termo_aceite (a mais nova); muda só a parte da assinatura.
-- =============================================================================

create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_days integer := coalesce((select (s.value #>> '{}')::integer from public.app_settings s where s.key = 'trial_days'), 7);
  -- a chave "Oferecer teste grátis no cadastro" (aba Planos, plano Teste grátis); sem a linha do plano, vale como hoje (oferece)
  v_offer boolean := coalesce((select p.active from public.plans p where p.code = 'trial'), true);
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''), 120));
  insert into public.user_roles (user_id) values (new.id);
  if v_offer then
    insert into public.subscriptions (user_id, plan, status, trial_ends_at)
    values (new.id, 'trial', 'trialing', now() + make_interval(days => v_days));
  else
    -- sem teste grátis no cadastro (PL06): nasce no acesso gratuito (sem plano pago e sem teste), situação "Expirado" e sem data de fim
    insert into public.subscriptions (user_id, plan, status, trial_ends_at)
    values (new.id, 'trial', 'expired', null);
  end if;

  begin
    if (new.raw_user_meta_data ->> 'phone') ~ '^\+[1-9][0-9]{7,14}$' then
      update public.profiles set phone = new.raw_user_meta_data ->> 'phone' where id = new.id;
    end if;
  exception when others then
    raise warning 'handle_new_user: WhatsApp não gravado (%): %', sqlstate, sqlerrm;
  end;

  begin
    if (new.raw_user_meta_data ->> 'terms_version') = (select v.version from public.legal_versions v where v.document = 'termo_uso') then
      perform public.legal_record(new.id, 'termo_uso', new.raw_user_meta_data ->> 'terms_version', 'cadastro', new.raw_user_meta_data ->> 'user_agent');
    end if;
  exception when others then
    raise warning 'handle_new_user: aceite do termo não gravado (%): %', sqlstate, sqlerrm;
  end;

  return new;
end
$$;

-- Para desfazer: recriar handle_new_user de …5300_termo_aceite.
