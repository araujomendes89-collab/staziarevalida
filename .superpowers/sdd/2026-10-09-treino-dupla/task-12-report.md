# Tarefa 12 — Tempo real do Praticar (canal dupla:online, convites e sinal)

Ramo `treino-dupla-t12`, base 1876715. Sem push; nada de Supabase, GCP, Vercel nem rede.

## O que foi construído
- **Tipos novos** em `src/novo/data/backend.ts`: `PresenceMember`, `RealtimeStatus`, `RealtimeHandle` e o método opcional `subscribeInvites` no `Backend` (igual ao `subscribeStats`: só o Supabase tem; o banco local não tem).
- **Canal do Supabase** (`supabaseBackend.ts`, `subscribeInvites`): canal privado `dupla:online`, com a Presença por usuário (chave = id da pessoa) e o aviso de convite novo (INSERT em `study_invites` filtrado por `to_user=eq.{eu}`).
  - Pede o token da sessão (`setAuth()` sem argumento) antes de assinar.
  - `track()` pedido antes da conexão fica guardado e vai quando o canal liga; ao reconectar, vai de novo. `untrack()` limpa. `close()` remove o canal e silencia qualquer aviso atrasado.
  - Se o pedido do token falhar, avisa `CHANNEL_ERROR` (a tela cai na consulta periódica).
  - Os membros da Presença chegam sem repetição (um por pessoa).
- **Ganchos** em `src/novo/app/dupla/live.js`:
  - `useHeartbeat(status, roomId?, intervalMs = 45000)`: sinal na entrada, a cada 45 s e ao voltar a aba; "fora" ao sair da tela e no `pagehide`. Trocar a situação (Praticar para sala) manda o novo sinal sem passar por "fora". Erro de rede é ignorado.
  - `useDuplaChannel({ radar })`: com radar anuncia `{ user_id, status: "livre" }`; sem radar sai da Presença. Devolve `onlineIds` (sem a própria pessoa; `null` enquanto não há Presença ou quando o canal cai), `inviteTick` (sobe a cada convite) e `live`. Sem `subscribeInvites` devolve `{ onlineIds: null, inviteTick: 0, live: false }`. Ligar e desligar o radar não abre outro canal.
  - `useInvites(inviteTick, live)`: lê `app_dupla_invites` na entrada, a cada aviso, ao voltar a aba e a rede, e por relógio (5 s no banco local ou com o canal fora do ar; 30 s com o canal ligado). Erro mantém a lista anterior; resposta atrasada nunca vence a mais nova. `refresh()` consulta na hora.

## Arquivos
Alterados: `src/novo/data/backend.ts`, `src/novo/data/supabaseBackend.ts`. Criados: `src/novo/app/dupla/live.js`, `src/__tests__/duplaTempoReal.test.tsx` (20 testes). Nenhum arquivo da Tarefa 11 foi tocado (migração 9770, `duplaMatchBanco.test.ts`, `duplaDb.ts`).

## Testes (pela fila, `--pool=threads --maxWorkers=1 --testTimeout=120000`)
- Escrevi o teste primeiro: falhou (o `live.js` não existia). Depois do código: `duplaTempoReal.test.tsx` 20/20.
- Ligados e base, 11 arquivos: `duplaTempoReal`, `playScreens`, `novoLocalBackend`, `duplaFundacao`, `duplaComponentesBase`, `duplaComponentesEstacao`, `...EstacaoA`, `...EstacaoB`, `duplaPraticarTela`, `duplaPerfilTela`, `duplaRotas`: 11 arquivos (iguais aos que existem), 184 testes, todos passando.
- `npm run build`: passou.
- `tsc --noEmit`: 1831 erros, o mesmo número da base; nenhum nos meus arquivos.
- Os testes usam o Supabase e a sessão simulados pelo contrato da Tarefa 11 (`app_dupla_heartbeat`, `app_dupla_invites`); o Realtime de verdade só se confere à mão, em dois aparelhos, depois de publicar (spec).

## Desvios do plano
- O plano e a spec falam em `joinPresence`; seguiu-se a decisão do plano (um método só por canal), e o `track()/untrack()` do canal devolvido faz esse papel.
- Quando o canal cai (erro, tempo esgotado, fechado), `onlineIds` volta a `null` em vez de manter uma lista velha de quem estava online. A tela (Tarefa 13) usa então o número `online` do baralho. Não está no plano; é uma escolha para não mostrar gente que pode já ter saído.
- `useDuplaChannel` não faz o sinal (heartbeat); quem monta a tela chama os dois ganchos (Tarefa 13).
- Pacote de design: esta tarefa não tem texto nem visual (só dados), então não houve divergência entre o plano e o pacote para registrar. Nenhuma busca no pacote achou algo sobre sinal ou Presença.

## Dúvidas para o dono
Nenhuma nova.

## O que a junção exige
- A migração 9770 (Tarefa 11) precisa ter `app_dupla_heartbeat(p_status, p_room_id)` devolvendo `{ server_now }` e `app_dupla_invites()` devolvendo `{ invites: [{ id, room_id, from: { user_id, public_name }, expires_at }], server_now }`, como no bloco Interfaces. Os nomes dos argumentos usados aqui são `p_status`, `p_room_id`.
- Tarefa 13: usar `useHeartbeat("livre")`, `useDuplaChannel({ radar })` e `useInvites(inviteTick, live)` no Praticar e no Perfil (dentro do `InviteWatcher`). Tarefa 15 (sala): reaproveitar `PresenceMember`, `RealtimeHandle`, `RealtimeStatus`.
- Políticas do Realtime para `dupla:online` já existem na migração 9750 (Tarefa 4).
