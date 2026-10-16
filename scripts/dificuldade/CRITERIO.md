# Critério de dificuldade das questões (nível Revalida / ENAMED)

Pedido do dono (16/10/2026): "Quero uma classificacao geral do nivel de dificuldade de todas as questoes".
Quem classifica: Gemini (Vertex) em lote; o agente Claude confere por amostra e por divergência.
Esta classificação NÃO é validação humana. Origem gravada: "classificada por agentes (Gemini + Claude)".

## Pergunta que se responde
"Quão difícil é ACERTAR esta questão para um médico formado no exterior que estuda para o Revalida?"
Avalie a questão como está escrita (enunciado + alternativas + gabarito), sem olhar quem a fez nem de qual prova veio.

## Escala 1 a 5 e faixas
| Nota | Faixa | O que é |
|---|---|---|
| 1 | fácil | Conceito ou conduta clássica de primeira linha, resposta quase direta do enunciado, distratores claramente errados. |
| 2 | fácil | Conduta/conceito clássico, mas exige reconhecer o quadro ou escolher entre 2 opções razoáveis. |
| 3 | média | Raciocínio clínico em 2 passos (diagnóstico e depois conduta) ou diferencial comum; um distrator plausível. |
| 4 | difícil | Exceção à regra, detalhe de diretriz recente, cálculo, integração de várias informações, ou 2 distratores muito plausíveis. |
| 5 | difícil | Muito difícil: tema raro/ponto fino, várias etapas de raciocínio, conduta que depende de um dado fácil de ignorar, ou o distrator errado parece "mais certo" que o gabarito. |

Faixas: fácil = 1 ou 2; média = 3; difícil = 4 ou 5.

## Sinais de dificuldade (some o que se aplica)
- Número de passos: reconhecer o quadro; classificar/estadiar; escolher a conduta; escolher o exame ou fármaco; ajustar dose.
- Cálculo (dose, idade gestacional, escore, índice, volume, tabela de risco).
- Detalhe de diretriz recente, ponto de corte, exceção, contraindicação, situação especial (gestante, idoso, criança pequena, insuficiência renal).
- Qualidade dos distratores: quanto mais plausíveis (condutas que também seriam aceitáveis em outro cenário), mais difícil.
- Informação-chave escondida ou ruído clínico no enunciado; necessidade de interpretar imagem/exame descrito.
- Tema raro ou de baixa prevalência na prática de atenção primária.

## Sinais de facilidade
- Pergunta direta ("qual o tratamento de escolha...") de doença muito prevalente, com quadro típico e uma alternativa claramente correta.
- Conceito de saúde pública ou de ética que se resolve por regra conhecida.
- Alternativas absurdas ou claramente fora do cenário.

## Regras
- Não use a prova de origem, o ano ou a numeração da questão como critério.
- Não deixe todas em 3: se há dúvida entre 2 notas, escolha pela que mais se parece com o conjunto de sinais acima, mas use a escala toda quando o caso pedir.
- Questão que depende de imagem que não está disponível: classifique pelo texto e marque `baixa_confianca`.
- Dê o motivo em UMA frase curta em português, apontando o sinal que decidiu (ex.: "dois passos: diagnóstico de pré-eclâmpsia grave e escolha do anti-hipertensivo; distrator plausível").
- Confiança: alta / media / baixa.
- Não invente dados; avalie só o que está escrito. Não corrija o gabarito (se achar que o gabarito parece errado, marque `suspeita_gabarito: true`, sem mudar a nota por isso).
