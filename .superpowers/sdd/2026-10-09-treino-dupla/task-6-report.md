# Relatório da Tarefa 6 (Etapa 3): migração 9760, leituras das telas, perfil de estudo e chave no painel

Ramo `treino-dupla-t6`, partida `046fbe0`. Só local: nada foi empurrado, nada de Supabase, GCP, Vercel nem rede.
Um agente anterior foi interrompido depois de escrever a migração, os testes e o apoio de testes, sem commitar. Aproveitei tudo
(conferi linha por linha contra o plano e contra o pacote) e rodei os testes; nada precisou ser refeito.

## O que foi construído
Migração `supabase/migrations/20261003009760_treino_dupla_telas.sql` (plano: "6600", renumerada). Só funções novas, dois índices
parciais e permissões; não cria tabela, não grava dado e não redefine função que já existia. Pode ser colada duas vezes
(o teste cola de novo e compara funções, permissões, índices e dados: iguais).

- **Apoios internos** (o navegador nunca chama): `dupla_public_name(uuid)` (nome público ou "Conta excluída"),
  `dupla_sweep(uuid default null)` (convite pendente vencido vira "canceled" e a sala fecha com `convite_expirado`; 15 min sem
  sinal dos membros e sala parada há 15 min fecha com `sem_sinal`; fechar apaga o link e soma 1 ao `rev`),
  `dupla_room_state(checklist_rooms, uuid)` (RoomState do plano, igual para todas as funções).
- **Leituras da sala**: `app_dupla_room(uuid, integer default null)` (vazio se o `rev` não mudou), `app_dupla_marks(uuid)`
  (só o avaliador da rodada), `app_dupla_result(uuid, integer)` (só depois da avaliação e só para os dois dela).
- **Banco de estações**: `app_dupla_stations()` (aprovadas; equipe vê todas; ordem da prova; última nota própria como candidato;
  média geral com 1 casa só com 5 ou mais avaliações).
- **Perfil de estudo**: `app_dupla_profile()` e `app_dupla_save_profile(jsonb)` (junta com o salvo, valida, ordena áreas, dias e
  turnos, devolve o mesmo de `app_dupla_profile()`; chaves que não são do perfil, como `status`, `user_id` e `last_seen_at`, são ignoradas).
- **Painel**: `app_admin_save_dupla(boolean, text[])` (só administrador; planos dentro de trial/pro/elite; grava
  `app_settings.treino_dupla`; registra `dupla.save`).
- **Índices**: `checklist_rooms_open_idx` e `study_invites_pending_idx` (parciais) para o fechamento preguiçoso.
- **Permissões**: `app_*` fechadas para visitante (`revoke … from public, anon`); `dupla_public_name`, `dupla_sweep` e
  `dupla_room_state` fechadas também para `authenticated`. Todas `security definer` com `search_path` vazio.

## Arquivos
- Criados: `supabase/migrations/20261003009760_treino_dupla_telas.sql`, `src/__tests__/duplaTelasBanco.test.ts` (14 testes),
  este relatório.
- Alterados:
  - `src/__tests__/helpers/duplaDb.ts`: `addSession(db, { room, round, doctor, actor, station, correctness, finishedAt?, usedMs?, answers?, feedback? })`.
    `answers` e `feedback` são opcionais e a mais do que o plano pedia (o teste do resultado precisa de marcações e feedback).
  - `src/__tests__/duplaMigracaoDados.test.ts` (da Tarefa 4): uma linha. Ela exigia que a 9750 fosse a ÚNICA migração `treino_dupla`;
    com a 9760 a linha quebrava. Agora exige que a 9750 seja a primeira (as das etapas seguintes vêm depois). Sem isso a junção
    das etapas 3 a 6 quebra esse teste.

## Testes e resultados (pela fila, `--pool=threads --maxWorkers=1`, 11/10/2026)
- `duplaTelasBanco.test.ts`: 14 testes passando (os 10 do plano, mais: erros de cada campo do perfil, convite pendente e relógio
  gravados, "quem encerrou", e permissões com colagem dupla).
- Juntos, 11 arquivos que existem e rodaram (`duplaTelasBanco`, `supabaseSchema`, `duplaMigracaoDados`, `duplaRealtimePoliticas`,
  `duplaFundacao`, `duplaComponentesBase`, `duplaComponentesEstacao`, `duplaComponentesEstacaoA`, `duplaComponentesEstacaoB`,
  `duplaEstacoesTeste`, `supabaseAdminApi`): 158 testes. Na primeira rodada 1 falhou (a linha de `duplaMigracaoDados` acima, que
  não é erro da migração); depois do ajuste, `duplaMigracaoDados`, `duplaTelasBanco`, `supabaseSchema` e `duplaRealtimePoliticas`
  rodaram de novo juntos: 4 arquivos, 56 testes passando. Os outros 7 passaram na primeira rodada (102 testes) e não foram tocados.
- Typecheck (`tsc --noEmit`): 1831 erros, os mesmos da base; nenhuma linha nos filtros `src/novo`, `server/dupla`, `server/devDb`,
  `src/__tests__/(dupla|helpers/dupla|supabaseSchema|segundaFase)`.
- Build (`npm run build`): passou.
- Observação honesta: não vi a fase "vermelha" do TDD (os testes já estavam escritos e a migração também quando assumi). Conferi que
  os testes cobrem cada regra do plano e que passam contra a migração.

## Decisões pequenas (fora do texto do plano)
- "Última vez", "Sua última nota" e a média usam a coluna `correctness` (0 a 100) da avaliação; a nota do resultado vem de
  `score` e `max_score`.
- Pontos do resultado: o nível marcado (`checklist_answers`) lido no conteúdo ATUAL da estação; item que sumiu da estação não aparece.
- "Definido pelo match" usa o papel que cada um tem hoje no perfil de estudo (o match não guarda o papel da hora) e some quando os
  dois são "qualquer papel" (como `assign` do protótipo). Textos de `ROLE_SHORT` e a frase iguais ao `match-rules.js:5` e `Match.jsx:208`.
- Quem encerrou (`closed_by`) só vem quando o fechamento foi `saiu` ou `convite_recusado`.
- `app_dupla_room` confere se a pessoa é da sala ANTES de fechar o que venceu (quem não é da sala não mexe em sala alheia).

## Dúvidas para o dono (textos novos, não estão no plano)
- "Nome: máximo de 40 caracteres." (nome público com mais de 40) e "Dados do perfil inválidos." (tipo errado de campo). O plano só
  lista "Informe como você quer aparecer para os colegas." para nome vazio/curto.
- Chave no painel: valor `aberto` nulo fecha o módulo (lado seguro).

## O que a junção exige
- Ordem das migrações: 9750 (dados), depois 9760 (esta). Depende só da 9750 (colunas da sala, perfil de estudo, marcações,
  `dupla_assert_access`, `dupla_station_meta`, `dupla_area_code`) e de `assert_admin` e `admin_log` (1300).
- O apoio `src/__tests__/helpers/duplaDb.ts` ganha `addSession`; as Tarefas 7, 8 e 9 não devem recriar essa função.
- Nenhuma outra tarefa cria migração nesta rodada; a Tarefa 10 (painel `AdminDupla`) chama `app_admin_save_dupla`, e as telas das
  Tarefas 7, 8 e 9 chamam `app_dupla_stations`, `app_dupla_profile`/`app_dupla_save_profile` e `app_dupla_room`/`marks`/`result`
  conforme o bloco Interfaces do plano (formatos RoomState, ResultData, lista de estações e perfil seguem o plano).
- `src/__tests__/duplaMigracaoDados.test.ts` mudou uma linha (acima); se alguma outra tarefa também mexer nela, juntar a mão.
- Corr-estacoes (8000) e corr-acesso (7900): esta migração não toca nada que elas refazem. Ela só LÊ `checklist_stations` (colunas
  que a 8000 mantém) e `app_settings`; `app_dupla_stations` não usa `review_note`/`reviewed_*`.
