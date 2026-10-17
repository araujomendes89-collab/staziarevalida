# Relatório da Tarefa 11 (Etapa 4): migração 9770, sinal, baralho, escolha, match, convite e saída da sala

Ramo `treino-dupla-t11`, partida `1876715`. Só local: nada foi empurrado, nada de Supabase, GCP, Vercel nem rede.
A Tarefa 12 (tempo real, hooks) roda em paralelo em outra cópia; não criei nem editei nenhum arquivo dela.

## O que foi construído
Migração `supabase/migrations/20261003009770_treino_dupla_match.sql` (plano: "6700", renumerada). Só funções novas e permissões; não
cria tabela, não grava dado e não redefine função que já existia (por isso não há "função partindo da versão mais nova"; as
usadas sem mudar estão listadas no cabeçalho). Pode ser colada duas vezes (o teste cola de novo e compara funções, permissões,
índices e políticas: iguais).

- **Regras do protótipo em SQL** (porte de `match-rules.js:17-46`, sem pessoa de exemplo): `dupla_compat(perfil_eu, perfil_outro)`
  (nota em `numeric`, arredonda como `Math.round`, limita 40 a 99; razões com os textos do protótipo, primeiro nome do outro,
  rótulo `chip` das áreas e `PACE_LABEL`) e `dupla_assign(meu_papel, papel_dele)`.
- **Sinal:** `app_dupla_heartbeat(situação, sala)`: grava hora e situação do perfil (livre, em_estacao, fora); `em_estacao` só com
  sala aberta da pessoa; sem perfil não grava e não cria perfil; situação inválida: "Situação inválida."; também fecha o que venceu.
- **Baralho:** `app_dupla_deck()`: cartões na ordem (compatibilidade, depois sinal mais recente), `hidden_by_role`, `online`,
  `matches_today`, `open_room` e `server_now`. Cartão só com campos públicos (instituição só com `show_school`; estatística só com
  `show_stats`; nunca e-mail nem telefone).
- **Escolha:** `app_dupla_swipe(para, direção, estação)`: trava o par (`pg_advisory_xact_lock`), grava a escolha e o meu sinal; o
  segundo "Estudar junto" forma match + sala (fase dos papéis, rodada 1) + convite de 60 s, com a estação e os papéis sugeridos.
- **Convite:** `app_dupla_invites()` e `app_dupla_answer_invite(convite, aceitar)`.
- **Saída:** `app_dupla_leave(sala)`: fecha para os dois (motivo "saiu"), apaga o link, cancela o convite pendente, soma 1 ao `rev`
  e devolve o estado da sala.
- Permissões: `app_*` fechadas para visitante; `dupla_compat` e `dupla_assign` fechadas até para quem está logado. Todas
  `security definer` com `search_path` vazio; as `app_*` ficam `volatile`.

## Arquivos
- Criados: `supabase/migrations/20261003009770_treino_dupla_match.sql`, `src/__tests__/duplaMatchBanco.test.ts` (26 testes), este relatório.
- Alterado: `src/__tests__/helpers/duplaDb.ts` (só acrescentei `seen(db, uid, agoSeconds = 0, status = "livre")`, como o plano pede).

## Testes e resultados (pela fila, `--pool=threads --maxWorkers=1 --testTimeout=120000`, 12/10/2026)
- TDD: escrevi os testes primeiro; sem a migração, os 26 falham (conferi trocando a migração por um arquivo vazio). Com a migração:
  `duplaMatchBanco.test.ts` 26 testes passando. Os 14 do plano estão lá (compatibilidade, razões, quem fica fora, cartão público,
  matches hoje, sem reciprocidade, estação da sala, papéis, sem match, dois ao mesmo tempo, convite, sair, sinal) mais: empate na
  ordem, números e piso/teto de 40–99 da função, ocultos pelo papel, escolha inválida, sala aberta em qualquer fase, convite só do
  convidado, sala já encerrada, fechamento pelo sinal e permissões/colagem dupla.
- Juntos, 15 arquivos que existem e rodaram (`duplaMatchBanco`, `duplaTelasBanco`, `duplaMigracaoDados`, `duplaRealtimePoliticas`,
  `supabaseSchema`, `supabaseAdminApi`, `duplaEstacoesTeste`, `duplaSalaTesteLocal`, `duplaConteudo`,
  `adminUsuariosOrdemMigracoes`, `duplaFundacao`, `duplaComponentesBase`, `duplaComponentesEstacao`, `duplaComponentesEstacaoA`,
  `duplaComponentesEstacaoB`): 209 testes passando.
- Typecheck (`tsc --noEmit`): 1831 erros, os mesmos da base; nenhuma linha nos filtros `src/novo`, `server/dupla`, `server/devDb`,
  `src/__tests__/(dupla|helpers/dupla|supabaseSchema|segundaFase)`.
- Build: não rodei; esta tarefa só acrescenta SQL e testes (nenhum arquivo de `src/` fora de `__tests__`, nada que o build leia).

## Decisão do dono (pacote de design manda nos textos e no visual): onde plano e pacote divergiam
- Textos das razões (`match-rules.js:33-39`): conferi um a um; plano e pacote dizem o mesmo. Nenhum desvio. Ritmo usa os rótulos do
  seletor do perfil do pacote ("Treino livre", "Cronometrado", "Simulação de prova"), áreas pelo `chip` (Clínica Médica, Cirurgia,
  GO, Pediatria, MFC).
- Comportamento onde o pacote (`PROMPT_IA.md:84-88`) difere da spec e do plano: o pacote tira do baralho "quem já recebeu swipe"
  para sempre e aceita o gesto "rápido" (`quick`, Convite rápido); a spec (§7) e o plano valem 7 dias e não têm Convite rápido
  (decisão do dono de 09/10). Segui a spec. Não é texto nem visual; registro aqui para o dono decidir se quer o do pacote.
- O botão "Agendar sessão", "Enviar mensagem" e a busca automática do pacote não existem no banco (decisão anterior, telas da Tarefa 13).

## Decisões pequenas (fora do texto do plano; o dono pode mudar)
- "Online" (contador) também exclui quem está "fora" (saiu das telas): o plano só falava em "sinal há menos de 2 minutos", mas o
  baralho e o match já tratam "fora" como ausente; contar quem saiu daria "N colegas online" com gente que já foi embora.
- Com sala aberta minha, o baralho vem vazio (`cards: []`, `hidden_by_role: 0`) e só diz qual é a sala (`open_room`): a tela mostra
  "Sala aberta com {nome}" e ninguém escolhe de dentro de uma sala.
- "matches hoje" = matches DA PESSOA (como user_a ou user_b) desde 0 h de Brasília (spec §7), não de todo mundo.
- Estação da sala: a de quem completou; sem ela, a do outro. Se a escolhida for só dos planos Pro/Elite e um dos dois não tiver plano
  pago (`tutor_is_pro`), a sala nasce sem estação (não tenta a do outro: o texto do plano é "a minha, senão a dele").
- Convite vencido: o erro "Convite expirado (60 s)." desfaz a própria chamada (Postgres não guarda nada de uma função que erra);
  quem fecha a sala é o fechamento preguiçoso (`dupla_sweep`) na próxima leitura de qualquer um dos dois (testado).
- Razão "Prova diferente (…)" só aparece quando o colega informou a prova (sem prova, nada é inventado); a nota usa 0,5 como no protótipo.
- O sinal (`app_dupla_heartbeat`) e a escolha também chamam o fechamento preguiçoso; o sinal grava `last_seen_at = now()` também no "fora".
- Escolha para estação: só aprovada (a equipe pode usar qualquer uma), senão "Estação não encontrada.". A checagem de Pro fica para
  quando a sala nasce (o plano não pede recusar a escolha).

## Dúvidas para o dono (textos novos, não estão no plano)
- "Convite não encontrado." (convite que não é seu ou não existe) e "Esta sala já foi encerrada." (convite de sala já fechada).
- Se o gesto "rápido" e o "nunca mais aparece" do pacote devem entrar (hoje: 7 dias e sem Convite rápido, como a spec).

## O que a junção exige
- Ordem das migrações: 9750 (dados), 9760 (telas), 9770 (esta). Depende de `dupla_sweep`, `dupla_room_state`, `dupla_public_name`
  (9760), `dupla_assert_access`, `dupla_allowed` (9750) e `tutor_is_pro` (…9550).
- Contratos para a Tarefa 12 e a 13 (iguais ao bloco Interfaces do plano): `app_dupla_heartbeat({ p_status, p_room_id })` →
  `{ server_now }`; `app_dupla_invites()` → `{ invites: [{ id, room_id, from: { user_id, public_name }, expires_at }], server_now }`;
  `app_dupla_deck()` → `{ cards, hidden_by_role, online, matches_today, open_room, server_now }` (cartão: `user_id`, `public_name`,
  `school`, `city`, `exam`, `bio`, `goal`, `areas`, `role_pref`, `pace`, `days`, `shifts`, `stats`, `compat`, `reasons`, `online`);
  `app_dupla_swipe({ p_to, p_direction, p_station_id })` → `{ matched, room_id?, partner? }`; `app_dupla_answer_invite({
  p_invite_id, p_accept })` → `{ room_id }`; `app_dupla_leave({ p_room_id })` → RoomState.
- `src/__tests__/helpers/duplaDb.ts` ganhou `seen`; se a Tarefa 12 também mexer nele, juntar à mão (ela não deveria).
- Nenhuma outra migração nesta rodada; 9780 e 9790 ficam para as Etapas 5 e 6.
- Corr-estacoes (8000) e corr-acesso (7900): esta migração só LÊ `checklist_stations` (colunas que elas mantêm) e usa
  `tutor_is_pro` sem refazê-la; não toca nada que elas refazem.
