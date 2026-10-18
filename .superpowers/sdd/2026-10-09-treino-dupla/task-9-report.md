# Relatório da Tarefa 9 (Etapa 3): Sala com todas as fases desenhadas a partir da fase gravada

Ramo `treino-dupla-t9`, pasta `.claude/worktrees/treino-t9`. Só local: nada foi empurrado, nada de Supabase, GCP, Vercel nem rede.
O agente anterior foi interrompido; aproveitei o que ele deixou (conteúdo, `useRoom`, papéis, conexão, preparação, estação, seletor
de estação e os dois arquivos de teste), conferi contra o protótipo e o plano, e fiz o que faltava.

## O que foi construído
- `src/novo/app/dupla/content.js`: `ACTOR_LABELS`, `splitActorScript`, `splitBlocks`, `splitTasks`, `toPepItems` (como no plano) e dois
  apoios: `isTaskNote` (a linha "Observação: …" das tarefas não ganha número) e `maxScoreOf` (soma do nível "Adequado" dos itens).
- `src/novo/app/dupla/room/useRoom.js`: lê `app_dupla_room(p_room_id, null)`, `app_dupla_room_content` (fora de `closed`),
  `app_dupla_marks` (só avaliador em running/review) e `app_dupla_result(room.id, room.round)` (em result). Todas as ações
  resolvem sem fazer nada (contrato das Tarefas 16, 17 e 18). `remainingOf(room)` = `paused_left_ms`, ou `ends_at − server_now`
  (parado), ou a duração da rodada.
- `room/RoomScreen.jsx`: escolhe a fase por `room.phase` e entrega `({ room, content, marks, result, actions, go, remainingMs })`.
  Carregando = `aria-busy="true"`; erro = `LoadError` com "Tentar de novo" e a frase do servidor; sala encerrada por mim →
  `go("dupla")` direto.
- Fases: `RolesPhase`, `ConnectingPhase` (5 etapas "a fazer"; a Tarefa 16 liga os eventos), `SetupPhase` (link, prontidão,
  cronômetro, leitura prévia só do avaliador, rodapé), `RunningPhase` (cabeçalho com `Timer`, minimizar/esconder em
  `sz-timer-min`/`sz-timer-hidden`, avaliador com acordeões e `PepTable`, candidato com enunciado/tarefas/impressos, barra de baixo),
  `ReviewPhase` (conferência do avaliador; candidato "Aguardando avaliação" e "Sair da sala"), `ResultPhase` (resultado da rodada),
  `ClosedPhase` (três motivos), `StationPicker` (Dialog com busca e lista por área).
- `room/parts.jsx` (a mais que a lista do plano): peças que as fases dividem (cabeçalho da dupla, faixa dos papéis, selo da área,
  roteiro do ator, impresso com imagem, cores dos papéis).
- Testes: `src/__tests__/duplaConteudo.test.ts` (2) e `src/__tests__/duplaSalaFases.test.tsx` (14).

## Testes e resultados (pela fila, `--pool=threads --maxWorkers=1 --testTimeout=120000`)
- `duplaSalaFases` + `duplaConteudo` + `duplaFundacao` + `duplaComponentesBase` + `duplaComponentesEstacao` +
  `duplaComponentesEstacaoA` + `duplaComponentesEstacaoB`: 7 arquivos, 93 testes, todos passam (7 arquivos existem = 7 no relatório).
- `npm run build`: sem erro (as telas novas ainda não são importadas por nenhuma rota; a Tarefa 10 as liga).
- `tsc --noEmit`: 1831 erros, os mesmos da base; nenhum em `src/novo/app/dupla` nem em `src/__tests__/dupla*`.
- Testes que conferem: sem cor escrita (hexadecimal, rgb, hsl), sem `lucide-react`, sem IA, e toda `var(--…)` existe nos tokens.

## Desvios do plano e por quê
1. **Dois testes do agente anterior tinham conta errada** e foram corrigidos (não a tela): a "nota provisória" do exemplo é
   2,50 (adequado) + 0 (inadequado) + 2,50 (parcial do item 3) = **5,00 / 10,00 · 50%**, não 3,75; e os itens do resultado de teste
   somavam 11,25 em vez de 10,00 (o "pt perdidos" 6,25 só fecha com a soma igual à nota máxima), então os quatro itens passaram a
   valer 2,50 cada. O texto do plano ("3,75", "/ 10,00", "38%", "+6 p.p. … (32%)", "7 min 32 s") continua exatamente como está.
2. **Mock de `useSession` com `backend` estável** (antes devolvia um objeto novo a cada render e o efeito rodava sem parar).
3. **Montar de novo = mesma fase:** a comparação do HTML ignora os identificadores do `useId` do React (mudam a cada montagem).
4. **Cores dos papéis** por um mapa `ROLE_COLORS` com os nomes por extenso (a conferência de tokens do teste não lê `var(--role-${x})`).
5. **"Confirmar papéis e conectar"** fica desligado até haver estação e papel (o servidor da Tarefa 14 também exigirá os dois); o
   protótipo deixava sempre ligado.
6. **Conferência:** o feedback digitado fica só no estado da tela; guardar rascunho no aparelho e "pendente enviado antes de
   finalizar" são da Tarefa 17 (ela mexe em `ReviewPhase.jsx` e `RunningPhase.jsx`). A conferência usa as cores `--score-*` com texto
   `--pep-sheet` (branco) e, no "Parcial", `--navy-950`, como o plano decidiu.
7. **"Solicitar revisão da nota"** chama `actions.requestReview()` sem motivo; o campo "Motivo" e o diálogo são da Tarefa 18.
   Também não mostrei "revisão pedida" (texto novo, não aprovado).
8. **"Encerrar treino" e "Sair da sala"** chamam `actions.leave()` (nada acontece nesta etapa); os diálogos "Sair da sala?"/"Encerrar
   treino?" entram nas Tarefas 16 a 18, como o plano diz.

## Dúvidas para o dono
- Nenhuma nova. Os textos são os do protótipo (`Setup.jsx`, `Room.jsx`, `Result.jsx`, `Loading.jsx`) e os da Tarefa 9 do plano.
  Único acréscimo de aparência (sem texto novo): o ícone de ampulheta em "Aguardando avaliação" e o de porta em "Treino encerrado…".

## O que a junção exige (Tarefa 10 e seguintes)
- **Rota:** `/dupla/sala/:roomId` → `<RoomScreen roomId={…} go={go} />` (`go("dupla")` volta ao Praticar). A sala já traz a própria
  altura (`min-height: 100vh`) e fundo; o Shell deve esconder cabeçalho e atalhos (`NO_DOCK`).
- **Contrato com a Tarefa 6:** a sala lê `app_dupla_room`, `app_dupla_room_content`, `app_dupla_marks`, `app_dupla_result` e
  `app_dupla_stations` com os argumentos do plano (`p_room_id`, `p_since_rev`, `p_round`); marcações como `[{ item_id, grade, subitems }]`.
- **Tarefas 15 a 17** trocam `useRoom` para usar `useRoomState` (o `RoomScreen` só depende de `{ room, content, marks, result,
  error, loading, reload, actions }`) e trocam `remainingOf` por `remainingMs(room, Date.now(), offsetMs)`.
- **Arquivos que a Tarefa 16 e 17 vão editar** (e eu não toco mais): `useRoom.js`, `RoomScreen.jsx`, `RolesPhase.jsx`,
  `ConnectingPhase.jsx`, `SetupPhase.jsx`, `ClosedPhase.jsx`, `StationPicker.jsx`, `RunningPhase.jsx`, `ReviewPhase.jsx`;
  `ResultPhase.jsx` é da Tarefa 18.
- **Não commitados de propósito:** `constraints.md`, `progress.md`, `rulings.md` e `task-9-brief.md` da pasta `.superpowers` (cópias
  de trabalho do orquestrador).
