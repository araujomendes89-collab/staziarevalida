# Grau de dificuldade das estações (2ª fase)

Pedido do dono em 17/10: o cartão do Banco de estações mostra o grau **Fácil**, **Médio** ou **Difícil**.

## Quem define

- Na montagem, o **revisor médico da área** da estação (ou um **administrador**), em Administração › Estações › Conferir.
- Ele marca os itens da rubrica abaixo, escolhe o grau e registra o que conferiu (10 caracteres ou mais). Fica gravado quem definiu e quando.
- Editor da equipe, revisor de outra área, aluno e visitante não gravam.
- Mudar o grau **não** derruba a aprovação médica da estação.
- Sem grau gravado, o aluno não vê selo nenhum.
- Depois, com as notas dos alunos, o grau poderá ser **recalibrado**. Os campos já existem no banco (migração 013410), mas a recalibração ainda não foi feita.

## Rubrica fixa

Cada item vale **sim** ou **não**. Confira no roteiro, nos impressos e no checklist (PEP) da estação.

| # | Item | Marque "sim" quando |
|---|------|---------------------|
| 1 | Quatro tarefas ou mais | O enunciado pede 4 tarefas ou mais ao candidato. |
| 2 | Raciocínio em etapas | O diagnóstico ou a conduta só sai juntando anamnese, exame e impressos; não vem pronto no enunciado. |
| 3 | Procedimento ou manobra | A estação pede demonstrar um procedimento ou uma manobra de exame físico específica. |
| 4 | Conduta com dose | A estação pede prescrever com dose, via e intervalo, ou fazer um cálculo (por peso, hidratação, gotejamento). |
| 5 | Comunicação difícil | Má notícia, recusa, conflito, suspeita de violência, sigilo ou paciente resistente. |
| 6 | Tempo apertado | O checklist tem 12 itens ou mais para os 10 minutos da estação. |

## Do número de itens ao grau

| Itens marcados | Grau |
|---|---|
| 0 ou 1 | Fácil |
| 2 ou 3 | Médio |
| 4, 5 ou 6 | Difícil |

A tela mostra o grau que a rubrica indica ao lado da escolha. Se o revisor escolher outro grau, explica o motivo na nota.

## Onde está no sistema

- Banco: tabela `checklist_station_difficulty` e função `app_admin_set_station_difficulty`, na migração `20261003013410_treino_dupla_dificuldade_estacoes.sql`. `app_dupla_stations()` devolve só o grau (`difficulty`).
- Tela: os itens e a regra estão em `src/novo/app/dupla/dificuldade.js`. Os códigos (`facil`, `medio`, `dificil`, `tarefas`, `raciocinio`, `procedimento`, `conduta_dose`, `comunicacao`, `tempo`) são os mesmos no banco e na tela.
- Nenhuma estação real foi classificada. A classificação é feita pelos revisores médicos.
