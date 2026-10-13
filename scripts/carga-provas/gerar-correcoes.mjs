// Gera, para cada prova, o SQL que troca enunciado e alternativas pelo texto fiel ao caderno oficial do Inep.
// Uso: node scripts/carga-provas/gerar-correcoes.mjs   (grava scripts/carga-provas/saida/2-NN-correcoes-<prova>.sql)
// Regras do SQL: cada campo (enunciado, A, B, C, D) só é trocado se o texto no banco ainda é EXATAMENTE o do export de 12/10/2026
// (md5 igual); se já é o texto fiel, conta como "já estava"; se é outro texto, é pulado e listado. Uma gravação por questão (uma
// linha no histórico, com o texto antigo e o motivo). Não toca gabarito, situação, explicações, conduta, "o que avalia", tema,
// figuras nem a marca "cita figura".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_REVISAO, SAIDA, correcoesDaProva, jsonbLiteral, lerJson, md5, provas, questoesAntes, sqlTexto, tirarTabela } from "./comum.mjs";

export const MOTIVO_TEXTO = `Texto fiel ao caderno oficial do Inep (carga das provas corrigidas, revisão de ${DATA_REVISAO})`;

export function nomeParteCorrecao(indice, prova) {
  return `2-${String(indice + 1).padStart(2, "0")}-correcoes-${prova.exam_id}.sql`;
}

export function sqlCorrecoes(prova, antes = questoesAntes()) {
  const { itens, n_trechos } = correcoesDaProva(prova.pasta, antes);
  const nCampos = itens.reduce((s, i) => s + Object.keys(i.campos).length, 0);
  // depois da parte 4 o trecho da tabela sai do enunciado: esse texto também conta como "já estava corrigido"
  const tabelas = new Map(lerJson(`tabelas/${prova.pasta}.json`).map((t) => [t.id, t.tabela_removida_do_texto]));
  const dados = itens.map((i) => ({
    id: i.id,
    code: i.code,
    campos: Object.fromEntries(Object.entries(i.campos).map(([k, c]) => [k, {
      antes_md5: md5(c.antes), depois: c.depois,
      ...(k === "statement" && tabelas.has(i.id) ? { sem_tabela_md5: md5(tirarTabela(c.depois, tabelas.get(i.id), i.id)) } : {}),
    }])),
  }));
  const ex = prova.exam_id;
  return `-- =============================================================================
-- StaziaMed, CARGA DAS PROVAS CORRIGIDAS, parte 2 (${prova.rotulo}, ${ex}): texto fiel ao caderno oficial do Inep.
-- Gerado por scripts/carga-provas/gerar-correcoes.mjs (ramo carga-provas). Não edite à mão.
-- O que faz: ${n_trechos} correções de texto em ${itens.length} questões (${nCampos} campos: enunciado ou alternativa).
--   * Cada campo só é trocado se o texto no banco ainda é EXATAMENTE o de ${DATA_REVISAO} (o que a revisão comparou com o PDF).
--     Se alguém mudou esse texto depois, o campo é PULADO e aparece na lista do fim. Nada é apagado.
--   * O texto antigo fica no histórico da questão (Administração > Questões > Editar > Ver histórico de mudanças), com o motivo.
--   * NÃO mexe em gabarito, situação (anulada), explicações, conduta esperada, "o que a questão avalia", tema, figuras.
--   * Regra do sistema (migração 9500): se a questão tinha Análise Stazia publicada, ela sai do ar (explicava o texto antigo);
--     a contagem aparece no fim.
-- Como colar: editor SQL do Supabase, o arquivo INTEIRO, Run. A primeira linha do resultado começa com "OK:" (ou "ATENÇÃO:" se
-- algum campo foi pulado; mostre ao Claude). Pode colar de novo: a segunda vez não muda nada.
-- =============================================================================
create temp table if not exists _carga_texto_resultado (prova text, questao text, codigo text, campo text, situacao text);
delete from _carga_texto_resultado where prova = ${sqlTexto(ex)};

do $carga_texto$
declare
  v_dados constant jsonb := ${jsonbLiteral(dados)};
  r jsonb;
  c record;
  q public.questions;
  v_statement text;
  v_options jsonb;
  v_atual text;
  v_situacao text;
  v_muda boolean;
  v_analises integer := 0;
begin
  perform set_config('sqie.reason', ${sqlTexto(MOTIVO_TEXTO)}, true);
  for r in select value from jsonb_array_elements(v_dados) loop
    select * into q from public.questions x where x.id = r ->> 'id' for update;
    if not found then
      insert into _carga_texto_resultado values (${sqlTexto(ex)}, r ->> 'id', r ->> 'code', '-', 'pulado: questão não encontrada no banco');
      continue;
    end if;
    v_statement := q.statement;
    v_options := q.options;
    v_muda := false;
    for c in select key as campo, value as v from jsonb_each(r -> 'campos') loop
      v_atual := case when c.campo = 'statement' then q.statement
                      else (select o ->> 'text' from jsonb_array_elements(q.options) o where o ->> 'id' = c.campo limit 1) end;
      if v_atual is not distinct from (c.v ->> 'depois') or md5(v_atual) is not distinct from (c.v ->> 'sem_tabela_md5') then
        v_situacao := 'já estava corrigido';
      elsif v_atual is not null and md5(v_atual) = c.v ->> 'antes_md5' then
        v_situacao := 'corrigido agora';
        v_muda := true;
        if c.campo = 'statement' then
          v_statement := c.v ->> 'depois';
        else
          v_options := (select jsonb_agg(case when o ->> 'id' = c.campo then jsonb_set(o, '{text}', to_jsonb(c.v ->> 'depois')) else o end order by n)
                        from jsonb_array_elements(v_options) with ordinality as x (o, n));
        end if;
      else
        v_situacao := 'pulado: o texto no banco mudou depois de ${DATA_REVISAO}';
      end if;
      insert into _carga_texto_resultado values (${sqlTexto(ex)}, q.id, q.code, case c.campo when 'statement' then 'enunciado' else 'alternativa ' || c.campo end, v_situacao);
    end loop;
    if v_muda then
      v_analises := v_analises + (select count(*)::int from public.question_analysis a where a.question_id = q.id and a.is_current and a.status = 'published');
      update public.questions set statement = v_statement, options = v_options where id = q.id;
      perform public.admin_log('question.updated', q.id, jsonb_build_object('status', q.status, 'reason', ${sqlTexto(MOTIVO_TEXTO)}));
    end if;
  end loop;
  insert into _carga_texto_resultado values (${sqlTexto(ex)}, '-', '-', 'análises', 'análises publicadas que saíram do ar: ' || v_analises);
  perform set_config('sqie.reason', '', true);
end
$carga_texto$;

select resultado, detalhe from (
  select 0 as ordem,
         case when count(*) filter (where situacao like 'pulado%') = 0 then 'OK: ' else 'ATENÇÃO: ' end
           || ${sqlTexto(`${prova.rotulo}: `)}
           || count(distinct questao) filter (where situacao = 'corrigido agora') || ' questões corrigidas agora ('
           || count(*) filter (where situacao = 'corrigido agora') || ' campos); '
           || count(*) filter (where situacao = 'já estava corrigido') || ' campos já estavam corrigidos; '
           || count(*) filter (where situacao like 'pulado%') || ' pulados (de ${nCampos})' as resultado,
         max(situacao) filter (where campo = 'análises') as detalhe
  from _carga_texto_resultado where prova = ${sqlTexto(ex)}
  union all
  select 1, 'PULADO: ' || codigo || ' (' || campo || ')', situacao
  from _carga_texto_resultado where prova = ${sqlTexto(ex)} and situacao like 'pulado%'
) x order by ordem, resultado;
`;
}

export function gerarTodas(destino = SAIDA) {
  fs.mkdirSync(destino, { recursive: true });
  const antes = questoesAntes();
  return provas().map((p, i) => {
    const nome = nomeParteCorrecao(i, p);
    fs.writeFileSync(path.join(destino, nome), sqlCorrecoes(p, antes));
    return nome;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const nome of gerarTodas()) console.log(`gravado: saida/${nome}`);
}
