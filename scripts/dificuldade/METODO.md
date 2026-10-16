# Dificuldade das questões na escala do Inep (16/10/2026)

Pedido do dono: "temos que recalibrar essas questoes, usar um padrao matematico, medico, os mesmos que o inep utiliza".

## O que o Inep usa (fontes conferidas)
- Índice de facilidade = proporção de acerto do item. Faixas: >= 0,86 muito fácil; 0,61 a 0,85 fácil; 0,41 a 0,60 médio;
  0,16 a 0,40 difícil; <= 0,15 muito difícil. Fonte: Enade 2019, Relatório Síntese de Área (Nutrição), seção 1.5.1,
  Tabela 1.2 (MEC/Inep/Daes). Cópia em /Volumes/Samsung/dados-inep-dificuldade-2026-10-16/documentos/.
- Discriminação: correlação ponto-bisserial (mesmo relatório, 1.5.2, Tabela 1.3: >= 0,40 muito bom; 0,30 a 0,39 bom;
  0,20 a 0,29 médio; <= 0,19 fraco, eliminado). No Enamed o Inep usa a correlação bisserial e exclui itens com CB <= 0
  antes da calibração (Nota Técnica Inep 42/2025, item 5.2.4).
- TRI: Enamed usa o modelo de Rasch (só o parâmetro b), pacote mirt do R (Nota Técnica Inep 42/2025, itens 5.2.1 e
  5.2.2; Nota Técnica 19/2025, item 7.5). Não é o modelo de 3 parâmetros do Enem. Revalida e Enamed usam a mesma Matriz
  de Referência Comum (Portaria Inep 478/2025, citada na NT 42/2025) e o Revalida 2025/2 repetiu itens do Enamed 2025.
- Revalida: o Inep não publica microdados públicos (só via Sedap, acesso restrito; vetores de resposta de 2020 em diante).

## Como a escala foi aplicada
1. Medida: microdados do Enamed 2025 (download.inep.gov.br/microdados/microdados_enamed_2025.zip, sha256 000d2c8d...),
   concluintes com presença válida (TP_PRES = 555, n = 39.256): p por item (cadernos 1 e 2 alinhados pelo arquivo de
   parâmetros; gabaritos conferem). b (Rasch) e bisserial copiados do arquivo do Inep. 90 questões do Enamed 2025 + 43 do
   Revalida 2025/2 que são o mesmo item = 133 medidas. Script: enamed_p_itens.py.
2. Estimada: rubrica médica explícita (RUBRICA.md, 8 itens, pontuação cega por 2 avaliadores) + área + nota prévia dos
   agentes (1 a 5), regressão ridge em logit(p) calibrada nas 90 medidas, validação cruzada deixa-um-fora aninhada.
   Previsão -> p estimado com intervalo de 80% -> mesma faixa do Inep. Script: recalibrar.py.
3. Carga: gerar-sql-dados.mjs -> migração 20261003012601 (idempotente).

Cuidado: p medido é da população do Enamed (concluintes brasileiros); a população do Revalida tende a acertar menos.
