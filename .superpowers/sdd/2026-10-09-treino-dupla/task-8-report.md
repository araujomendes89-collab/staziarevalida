# Tarefa 8 — Meu perfil de estudo e Praticar (sem baralho)

Ramo `treino-dupla-t8`, partida 046fbe0. Commits: 733c75b (telas e testes) e o commit seguinte (teste extra da prova salva fora das três próximas edições e este relatório).

Retomada (agente 2): revisei o commit 733c75b linha a linha contra a Tarefa 8 do plano, contra `Profile.jsx`, `Match.jsx` e `match-rules.js` do pacote, e contra os componentes do app (todos os ícones, tokens e props existem). Nada precisou mudar no código; acrescentei um teste.

## O que foi construído
- **Meu perfil de estudo** (`StudyProfileScreen.jsx`): formulário e prévia do cartão, como `Profile.jsx:23-70`, com os componentes e as cores do app.
  - Nome e prova vêm da Conta na primeira vez. A prova só aparece entre as três próximas edições.
  - Chips de área (marcado: fundo da área e texto `--surface-card`), papel, ritmo, dias, turnos, os três interruptores e a bio com contador "n/160".
  - Salvar, Descartar, "Alterações não salvas", aviso "Perfil de estudo salvo" e a mensagem do servidor se der erro.
  - Prévia no formato do servidor: sem a instituição quando o interruptor está desligado, "Oculto" ou "N feitas · PEP x,xx" nas estações, e o aviso do radar desligado.
- **Praticar** (`PracticeScreen.jsx`): frase de apoio e botão "Meu perfil de estudo" na primeira linha.
  - Sem perfil: `EmptyState` que leva ao perfil.
  - Com perfil: painel "Encontrar dupla" com o seletor "Papel desejado" (grava só `role_pref`), aviso do radar desligado, faixa da estação escolhida (`?estacao=`) com "Remover estação escolhida", vazio "Nenhum colega compatível agora" (com "Aceitar qualquer papel") e "Como a compatibilidade é calculada" com os pesos 40/25/20/10/5.
- **Módulos**: `card.js` (`availabilityLabel`, `statsLabel`, `toCard`, `COMPAT_WEIGHTS`) e `profile.js` (`nextEditions`, `profileDraft`, `draftErrors`, mais `toggleInOrder` e `draftPayload`).

## Arquivos
Criados: `src/novo/app/dupla/{StudyProfileScreen,PracticeScreen}.jsx`, `src/novo/app/dupla/{card,profile}.js`, `src/__tests__/duplaPerfilTela.test.tsx` (19 testes), `src/__tests__/duplaPraticarTela.test.tsx` (14 testes). Nenhum arquivo existente foi alterado.

## Testes (pela fila, `--pool=threads --maxWorkers=1`)
- Primeiro vermelho (as telas não existiam), depois verde.
- Os 2 arquivos da tarefa: 33 testes passando.
- Junto com `duplaFundacao`, `duplaComponentesBase`, `duplaComponentesEstacao`, `...EstacaoA` e `...EstacaoB`: 7 arquivos (igual aos 7 que existem), 110 testes, todos passando.
- `npm run build`: passou. As telas ainda não são importadas por nada (a rota é da Tarefa 10), então o build não as exercita.
- `tsc --noEmit`: 1831 erros, o mesmo número da base. Nenhum erro nos meus arquivos.
- Um teste confere que as telas e módulos não têm cor hexadecimal, `lucide-react`, pessoa do pacote nem "14 feitas".

## Desvios do plano e por quê
1. **Chip de área marcado usa `areaVars(code).solid`** no lugar da base. É o tom escuro só nos selos de Cirurgia e Pediatria (ruling R3, contraste 4,5:1). Nas outras áreas é igual à base.
2. **Prova salva fora das três próximas edições** (ex.: perfil salvo com 2026/1 em outubro): a edição salva entra na frente da lista, para a tela não mostrar nada marcado. Na primeira vez vale o plano (edição da Conta se estiver entre as três, senão a primeira).
3. **Primeira vez**: "Salvar perfil" já vale sem alteração (ainda não há nada salvo). "Descartar" e "Alterações não salvas" só com alteração. No plano, "só com alteração" valeria para os dois e a pessoa não conseguiria salvar o que veio da Conta.
4. **Descartar** fica ativo mesmo com o erro do nome (como o protótipo); só "Salvar" fica bloqueado.
5. **Prévia**: `online` = radar ligado (como `Profile.jsx:17`) e nome "Seu nome" enquanto o campo está vazio (texto do protótipo). A fórmula do plano não citava os dois.
6. **Limites nos campos** (sem texto novo): nome 40 caracteres, instituição, cidade e objetivo 80, iguais aos da tabela.
7. **Sem título (h1) nas duas telas**: o título fica no cabeçalho do app (`TITLES` da Tarefa 10). Meu perfil mantém "Voltar para Praticar", a frase de apoio e os botões.
8. **Sem perfil**, o Praticar também mostra "Como a compatibilidade é calculada" e a faixa da estação. O plano não dizia se aparecem nesse estado.
9. **"0 compatíveis"** é fixo até a Tarefa 13 (não há baralho). O parágrafo "Arraste para a direita..." (`Match.jsx:152`) foi mantido igual ao protótipo, mesmo sem o baralho.
10. **Faixa sem número**: se a estação não tiver número, mostra só o nome.

## Dúvidas para o dono
- O parágrafo "Arraste para a direita para estudar junto..." aparece no Praticar desta etapa, onde ainda não há cartão para arrastar. Mantive o texto do protótipo; ele só passa a fazer sentido com o baralho (Etapa 4). Prefere esconder até lá?
- O interruptor "Aparecer no radar de duplas" ainda diz "...e convidar você" (texto do protótipo). A frase sobre convites saiu só do aviso. Mantenho?

## O que a junção exige
- **Rotas (Tarefa 10)**: `go("dupla-perfil")` e `go("dupla")`. A tela do Praticar lê e remove `?estacao=` com `useSearchParams`, então precisa estar dentro do `BrowserRouter`. O título "Meu perfil de estudo" vem do `TITLES`.
- **Funções da Tarefa 6**, usadas pelo contrato do plano:
  - `app_dupla_profile()` devolve `{ profile, defaults, stats }`.
  - `app_dupla_save_profile({ p_profile })` devolve o mesmo formato. O perfil completo vai com `exam` só quando preenchido, e o seletor do Praticar manda só `{ role_pref }`.
  - `app_dupla_stations()` devolve a lista e é lida só quando há `?estacao=`.
- A tela usa `useSession().backend.rpc` e `useLoad`, `LoadError`, `Loading` e `messageOf` de `admin/common.jsx`. Se a Tarefa 7 mudar algum deles, é preciso conferir.
- A Tarefa 13 acrescenta o baralho no `PracticeScreen`, no lugar do bloco "Nenhum colega compatível agora", e troca o `count={0}` do `Compatibility` pelo tamanho do baralho.
- O Praticar e o Perfil ainda não enviam sinal de presença nem recebem convites (Tarefas 12 e 13).
