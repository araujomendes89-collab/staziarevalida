# Rubrica médica explícita de dificuldade (pontuação cega, sem saber o acerto real)

Você pontua CARACTERÍSTICAS da questão, não "o quanto acha difícil". Não sabe de qual prova ela veio e não deve tentar adivinhar.
Pense num médico generalista que estuda para o Revalida/Enamed. Leia enunciado, alternativas e gabarito.

Para cada questão, dê os 8 números abaixo (inteiros):

1. cog — nível cognitivo exigido (Bloom revisado):
   1 = lembrar (fato, definição, número, nome); 2 = compreender (explicar/reconhecer conceito);
   3 = aplicar (usar conduta/protocolo a um caso); 4 = analisar/avaliar (integrar vários dados, comparar opções próximas, julgar).
2. passos — passos de raciocínio clínico necessários para chegar à resposta (1 a 4). Ex.: reconhecer o quadro (1),
   classificar/estadiar (2), escolher conduta/exame/fármaco (3), ajustar detalhe (dose, via, momento, exceção) (4).
3. raridade — 0 = tema muito prevalente / clássico (APS, PS, pré-natal, puericultura); 1 = intermediário;
   2 = raro, de especialista ou pouco ensinado na graduação.
4. normativo — 0 = conhecimento clínico consolidado; 1 = depende de detalhe de protocolo/diretriz/portaria/caderno do MS,
   lei, número de sessões, fluxo, calendário vacinal; 2 = depende de norma muito recente (últimos ~2 anos) ou mudança de regra.
5. distratores — quantas alternativas ERRADAS são plausíveis para um generalista (0 a 3).
6. numerico — 0 = não; 1 = exige lembrar número/dose/ponto de corte/prazo exato; 2 = exige fazer conta.
7. imagem — 1 se a resposta depende de figura/tabela/ECG/gráfico que NÃO está transcrito no texto; senão 0.
8. contra — 1 se a resposta certa contraria a conduta intuitiva/"de senso comum" ou um distrator parece mais certo que o
   gabarito; senão 0.

Regras: não invente dado; avalie só o que está escrito. Não corrija o gabarito. Seja consistente entre lotes.
Saída: CSV com cabeçalho exato `idx,cog,passos,raridade,normativo,distratores,numerico,imagem,contra`
uma linha por questão, na ordem do lote, sem texto extra.
