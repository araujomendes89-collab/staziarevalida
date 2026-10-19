-- Posição da figura no enunciado (19/10/2026, defeito da Revalida 2024/2 Q73): cada figura de questions.images pode ter
--   "apos": trecho exato do enunciado que aparece UMA vez e termina no fim de uma palavra; a tela desenha a figura logo depois dele. Sem "apos" (ou se o texto mudou e o
--            trecho sumiu ou se repete), a figura fica no lugar de sempre: depois do caso, antes da pergunta.
--   "tipo": "tabela" (recorte de tabela: a tela usa a largura toda) ou "figura".
-- O aluno já recebe questions.images inteiro (practice_question_view e as demais): nada muda para ele além da posição.
-- Nenhum marcador vai para o texto do enunciado (busca, Tutor, voz e conferências continuam lendo o texto oficial).
-- Aqui: (1) função só da equipe para gravar a posição e o tipo, sem mexer em caminho, endereço ou texto alternativo;
--       (2) trocar o arquivo da figura (app_admin_set_question_image) mantém a posição e o tipo da figura anterior.

create or replace function public.app_admin_set_question_figure_layout(p_question_id text, p_layout jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.questions;
  v_images jsonb;
  item jsonb;
  v_index integer;
  v_apos text;
  v_tipo text;
  v_fig jsonb;
  v_vezes integer;
begin
  perform public.assert_staff();
  if jsonb_typeof(p_layout) is distinct from 'array' or jsonb_array_length(p_layout) = 0 then
    raise exception 'Envie a posição de pelo menos uma figura.' using errcode = '22023';
  end if;
  select * into v from public.questions q where q.id = p_question_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  v_images := v.images;
  for item in select value from jsonb_array_elements(p_layout) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item -> 'index') is distinct from 'number' then
      raise exception 'Cada posição precisa do número da figura (index).' using errcode = '22023';
    end if;
    v_index := (item ->> 'index')::integer;
    if v_index < 0 or v_index >= jsonb_array_length(v_images) then
      raise exception 'A figura % não existe nesta questão.', v_index + 1 using errcode = '22023';
    end if;
    v_fig := v_images -> v_index;
    if item ? 'apos' then
      v_apos := btrim(coalesce(item ->> 'apos', ''));
      if v_apos = '' then
        v_fig := v_fig - 'apos';
      else
        if char_length(v_apos) > 300 then
          raise exception 'O trecho da posição pode ter no máximo 300 letras.' using errcode = '22023';
        end if;
        v_vezes := (char_length(v.statement) - char_length(replace(v.statement, v_apos, ''))) / char_length(v_apos);
        if v_vezes <> 1 then
          raise exception 'O trecho "%" precisa aparecer uma vez só no enunciado (aparece % vezes). Copie um trecho maior, exatamente como está no texto.', left(v_apos, 80), v_vezes using errcode = '22023';
        end if;
        -- e terminar onde termina uma palavra: senão a figura partiria a palavra ("dismenor" | figura | "reia"). Mesma regra da tela (format.js)
        if right(v_apos, 1) ~ '[0-9A-Za-zÀ-ÖØ-öø-ÿ]'
           and substr(v.statement, strpos(v.statement, v_apos) + char_length(v_apos), 1) ~ '[0-9A-Za-zÀ-ÖØ-öø-ÿ]' then
          raise exception 'O trecho "%" termina no meio de uma palavra. Copie até o fim da palavra.', left(v_apos, 80) using errcode = '22023';
        end if;
        v_fig := v_fig || jsonb_build_object('apos', v_apos);
      end if;
    end if;
    if item ? 'tipo' then
      v_tipo := nullif(btrim(coalesce(item ->> 'tipo', '')), '');
      if v_tipo is null then
        v_fig := v_fig - 'tipo';
      elsif v_tipo not in ('tabela', 'figura') then
        raise exception 'O tipo da figura é "tabela" ou "figura".' using errcode = '22023';
      else
        v_fig := v_fig || jsonb_build_object('tipo', v_tipo);
      end if;
    end if;
    v_images := jsonb_set(v_images, array[v_index::text], v_fig);
  end loop;
  if v_images is distinct from v.images then
    update public.questions set images = v_images where id = v.id;
    perform public.admin_log('question.figure_layout', v.id, jsonb_build_object('code', v.code,
      'layout', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('index', n - 1, 'apos', i -> 'apos', 'tipo', i -> 'tipo'))) from jsonb_array_elements(v_images) with ordinality x(i, n))));
  end if;
  return public.app_admin_question(v.id);
end
$$;
revoke execute on function public.app_admin_set_question_figure_layout(text, jsonb) from public, anon;

-- ---------------------------------------------------------------- trocar o arquivo mantém a posição (cópia de 20261003009700 com 1 mudança)
create or replace function public.app_admin_set_question_image(p_question_id text, p_image jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.questions;
  f public.question_figure_files;
  v_path text;
  v_alt text;
  v_old text;
  v_replaced boolean;
begin
  perform public.assert_staff();
  if jsonb_typeof(p_image) is distinct from 'object' then
    raise exception 'Envie a figura da questão.' using errcode = '22023';
  end if;
  v_path := btrim(coalesce(p_image ->> 'path', ''));
  v_alt := btrim(coalesce(p_image ->> 'alt', ''));
  if char_length(v_alt) < 10 or char_length(v_alt) > 300 then
    raise exception 'Escreva o texto alternativo da figura (de 10 a 300 letras): ele descreve a imagem para quem não a vê.' using errcode = '22023';
  end if;
  if v_path !~ '^questoes/[0-9a-f]{32}\.(png|jpg)$' then
    raise exception 'Caminho de figura inválido.' using errcode = '22023';
  end if;

  select * into v from public.questions q where q.id = p_question_id for update;
  if not found then raise exception 'Questão não encontrada.' using errcode = 'P0002'; end if;
  if jsonb_array_length(v.images) > 1 then
    raise exception 'Esta questão tem mais de uma figura vinda do caderno oficial: o envio trabalha com uma figura por questão e não troca nem tira essas.' using errcode = '22023';
  end if;

  -- o arquivo precisa ter sido conferido pelo servidor; a linha dele fica travada até o fim, então duas vinculações ao mesmo tempo
  -- do mesmo arquivo se enfileiram e a segunda enxerga a reserva da primeira
  select * into f from public.question_figure_files x where x.path = v_path for update;
  if not found or f.state <> 'confirmed' then
    raise exception 'O servidor ainda não conferiu o arquivo desta figura. Envie a figura de novo.' using errcode = '22023';
  end if;
  if f.question_id is not null and f.question_id <> v.id then
    raise exception 'Este arquivo já é a figura de outra questão.' using errcode = '22023';
  end if;

  v_old := v.images -> 0 ->> 'path';
  v_replaced := jsonb_array_length(v.images) = 1;
  update public.question_figure_files set question_id = v.id where path = v_path;
  -- a posição no enunciado (apos) e o tipo (tabela) da figura anterior continuam valendo para a figura nova (20261003014300)
  update public.questions
     set images = jsonb_build_array(jsonb_build_object('path', v_path, 'alt', v_alt)
                  || jsonb_strip_nulls(jsonb_build_object('apos', v.images -> 0 -> 'apos', 'tipo', v.images -> 0 -> 'tipo')))
   where id = v.id;
  if v_old is not null and v_old <> v_path then
    update public.question_figure_files set state = 'releasing', question_id = null where path = v_old and question_id = v.id;
  else
    v_old := null;
  end if;
  perform public.admin_log('question.figure_set', v.id, jsonb_build_object('code', v.code, 'replaced', v_replaced, 'alt', v_alt));
  return public.app_admin_question(v.id) || jsonb_build_object('released_path', to_jsonb(v_old));
end
$$;
revoke execute on function public.app_admin_set_question_image(text, jsonb) from public, anon;
