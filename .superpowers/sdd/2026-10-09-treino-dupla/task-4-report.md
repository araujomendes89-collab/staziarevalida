# Tarefa 4 (Etapa 2) — migração de dados do Treino em Dupla

Ramo `treino-dupla-t4`, partida `ed3759b`. Migração: `supabase/migrations/20261003009750_treino_dupla_dados.sql` (no plano: "6500").
Nada foi empurrado, nada tocou em Supabase, Google Cloud, Vercel, rede nem nas chaves do `.env`. Tudo foi testado num Postgres de
memória (PGlite).

## 1. O que a migração faz, em palavras simples

- **Chave do módulo.** `app_settings` passa a aceitar a chave `treino_dupla`. A linha nasce **desligada**:
  `{"aberto": false, "planos": ["pro", "elite"]}`. Colar não abre o módulo para ninguém.
- **Quem pode usar (regra única no banco, `dupla_allowed`).** Equipe (administrador e editor) e revisor médico entram sempre.
  Aluno só com a chave ligada **e** um plano marcado: Pro/Elite pagos de verdade (a regra nova da 9550: ativo com data de fim no
  futuro, ou pagamento pendente até 3 dias depois do fim) ou teste grátis dentro do prazo (só se "Teste grátis" estiver marcado).
- **Tabelas novas** (todas com acesso por linha ligado, só leitura para o aluno, ninguém grava direto): `study_profiles`
  (perfil de estudo), `study_swipes` (escolhas), `study_matches` (matches), `checklist_room_marks` (marcações do PEP).
- **Tabelas ampliadas:** `checklist_rooms` (a sala ganha fase, papéis, cronômetro, link da chamada, impressos liberados etc.) e
  `checklist_study_sessions` (a avaliação de uma rodada ganha rodada, feedback, tempo usado, pedido de revisão da nota).
- **Conteúdo das estações:** o aluno **deixa de ler direto** o roteiro do ator, os impressos e o PEP (só a equipe lê). Ele recebe
  só o que o papel dele na sala permite, por `app_dupla_room_content`.
- **Tempo real (Presença):** duas políticas em `realtime.messages` (ler e enviar presença), só se esse esquema existir.
- **Conta:** `app_export_my_data` ganha perfil de estudo, escolhas, matches e salas; excluir a conta apaga perfil, escolhas e
  matches e deixa a avaliação para o parceiro, sem o vínculo com quem saiu.

## 2. Quem vê o quê (para o dono conferir)

Com a chave ligada e planos Pro/Elite marcados (padrão). "Sala" = o aluno é um dos dois da sala.

| Pessoa | Entra no módulo? | Lê direto o conteúdo completo da estação? | Recebe o conteúdo por papel na sala? | Grava direto em perfil, escolhas, matches, sala, marcações, avaliações, convites? |
|---|---|---|---|---|
| Visitante (sem login) | Não (as funções recusam) | Não | Não | Não |
| Aluno sem plano marcado (inclui teste grátis quando "Teste grátis" não está marcado) | Não ("Sem acesso ao Treinamento em Dupla.") | Não | Não | Não |
| Aluno Pro ou Elite (pago, dentro do prazo) | Sim | Não | Sim, só como candidato ou avaliador da própria sala | Não |
| Aluno em teste grátis válido | Só se "Teste grátis" estiver marcado | Não | Idem, quando entra | Não |
| Aluno em teste vencido / plano cancelado / expirado / Pro com data de fim vencida | Não | Não | Não | Não |
| Editor | Sim, sempre (mesmo com a chave desligada) | Sim | Só nas salas de que ele é um dos dois | Não |
| Revisor médico (aluno com área de revisão) | Sim, sempre (acesso completo igual ao da equipe, decisão do dono na 9550) | **Não** direto; lê pela função da aba Estações (`app_admin_station_content`, que não mudou) | Só nas salas de que ele é um dos dois | Não |
| Administrador | Sim, sempre | Sim | Só nas salas de que ele é um dos dois | Não |

Dentro da sala, por papel e fase:

| Quem | O que recebe de `app_dupla_room_content` |
|---|---|
| Candidato (fases conexão a resultado) | Nome, área, número, duração, cenário, tarefas, versão e **só os impressos liberados**, sem a linha "Liberação: …". Nunca roteiro do ator nem PEP. |
| Avaliador (mesmas fases) | Tudo do candidato mais roteiro do ator, **todos** os impressos (texto inteiro, com "Liberação: …") e o PEP com pontos e critérios. |
| Qualquer um na fase "papéis" ou "encerrada", ou sem papel gravado | Só nome, área, número e duração da estação, e quantos impressos existem. |
| Quem não é da sala | "Sala não encontrada." (equipe e revisor também) |

Perfil de estudo: só o próprio. Escolhas: só as próprias. Matches, sala e convites: os envolvidos. Marcações do PEP: o avaliador da
rodada; o candidato só depois que a avaliação daquela rodada existe. Avaliação da rodada: o candidato e o avaliador (como já era).

## 3. Funções redefinidas e a base de cada uma

Conferido com `git grep` contra a ordem de produção (arquivos até a 9630; a 9620/9621 não está na base).

| Objeto | Base usada |
|---|---|
| `app_export_my_data()` (única função que já existia e foi refeita) | `…5300_termo_aceite.sql:318-357` (a mais nova; nenhuma migração depois a refaz). Igual, mais 4 chaves antes de `acceptances`. Continua `language sql stable`, invoker, `search_path = ''`. |
| `app_settings_key_check` | `…1300_admin.sql:57` (`trial_days`, `announcement`). Nenhuma migração até a 9630 mexeu; a união é as duas + `treino_dupla`. A 9600 só leu `announcement`; o Tutor só lê `trial_days`. |
| Política `"estações: conteúdo (aprovada e acesso Pro quando exigido)"` | `…0400_checklist_bank.sql:37`. Trocada por `"estações: conteúdo só da equipe"` (`is_staff()`). |
| Funções que a migração **usa e não refaz**: `user_has_full_access`, `subscription_is_paid` (`…9550`), `user_is_staff` (`…4600`), `is_staff`, `touch_updated_at` (`…0100`) | Conferido por teste: continuam idênticas depois da migração, junto com `has_pro`, `tutor_is_pro`, `app_announcement`, `app_admin_settings`, `app_admin_save_settings`, as de Estações da 8000 etc. |
| Removida de propósito | `guard_checklist_room()` + gatilho `checklist_rooms_guard`, coluna `checklist_rooms.state`, políticas "salas: membro cria", "salas: membros atualizam", "convites: enviar", "convites: responder ou cancelar" (todas de `…0400`). |
| `checklist_station_area_code` (`…8000`) | Não tocada. `dupla_area_code` (CM, CR, GO, PED, MFC) é outra função, ao lado. |

Funções novas: `dupla_allowed(uuid)`, `dupla_me_allowed()`, `dupla_assert_access()`, `app_dupla_access()`, `dupla_station_meta(text)`,
`dupla_area_code(text)`, `app_dupla_room_content(uuid)`, `dupla_room_member(text)`. Todas `search_path = ''`; as `app_dupla_*`
fechadas para visitante; as `dupla_*` fechadas para o navegador, exceto `dupla_me_allowed` e `dupla_room_member` (usadas pelas
políticas do Realtime).

## 4. Testes e resultados

TDD: os testes foram escritos junto, e conferi o vermelho tirando a migração do lugar (11 testes novos falharam, 8 passaram por
não dependerem dela); depois verde. Tudo pela fila, `--pool=threads --maxWorkers=1 --testTimeout=120000`.

- `supabaseSchema.test.ts`: 22 testes passando (o bloco antigo de "sala em dupla" saiu; entrou "Treinamento em Dupla (dados)" com os 13 testes do plano; o teste do conteúdo das estações agora espera `[]` para aluno).
- `duplaRealtimePoliticas.test.ts`: 4 passando (sala, dupla:online, banco sem Realtime, nomes e papéis das políticas).
- `duplaMigracaoDados.test.ts` (novo): 16 passando — a ordem de produção (arquivos até a 9630), colar 2x = mesmo banco (funções, políticas,
  regras, colunas, gatilhos, índices, permissões e dados), nenhuma função de produção desfeita (só `app_export_my_data` muda e só
  `guard_checklist_room()` sai), permissões das funções antigas inalteradas, salas/avaliações antigas preservadas, matriz de papéis
  (visitante, sem acesso, Pro, Elite, teste válido, teste vencido, cancelado, editor, revisor médico, administrador), chave
  estragada não abre, `dupla_station_meta` e `dupla_area_code`.
- Ligados que já existiam: `supabaseAccountApi`, `termoAceiteBanco`, `supabaseAdminApi`, `equipeAcessoCompleto`, `supabaseSeed`,
  `duplaFundacao`, `checklistBankApi`, `checklistBankCore`, `correcoesAcessoBanco`, `estacoesRevisaoMedica`, `admConfigEstacoesBanco`.
- Lote maior: todos os 80 testes já commitados que montam o banco com as migrações, em 3 lotes (27 + 27 + 26 arquivos): **80 arquivos, 1.296 testes, todos passando**. Depois da última mudança da migração, reexecutei os 6 arquivos centrais (supabaseSchema, duplaRealtimePoliticas, duplaMigracaoDados, duplaFundacao, estacoesRevisaoMedica, admConfigEstacoesBanco): 81 testes passando. A suíte inteira não foi rodada (regra da fila).
- Fora do repositório (scratchpad), sobre a ordem **real** de produção: base `23d53c1` + partes 1 a 7 do pacote + 9630 + 9610, e uma
  segunda vez também com 9620/9621 (do ramo `adm-fontes-apoio-b`) aplicadas antes: a 9750 colou duas vezes sem erro, deu o mesmo
  banco e as chamadas básicas funcionam (aluno barrado, administrador entra, aluno não lê conteúdo, exportação, aba Estações, 9600).
- Typecheck (`tsc --noEmit`): **1831** erros, o mesmo número da base; nenhum arquivo meu ou dos testes alterados aparece.
- Build (`npm run build:vercel`): concluído sem erro (14 s).

## 5. Desvios do plano e por quê

1. **Número da migração:** 9750 (o plano diz 6500), por ordem do dono/orquestração.
2. **`dupla_allowed` usa a regra de plano pago atual (9550):** `subscription_is_paid` (data de fim obrigatória; pendente tem 3 dias de
   tolerância), em vez de "pro/elite com active|past_due" do plano. Pedido na tarefa.
3. **Revisor médico entra sempre**, como a equipe (`user_has_full_access`, 9550), embora o plano só falasse em equipe. O campo `equipe`
   de `app_dupla_access` continua sendo só administrador/editor.
4. **Conteúdo para o revisor:** a política nova é "só a equipe", como no plano; o revisor médico (sem papel de equipe) lê `[]` direto,
   mas segue lendo pela função `app_admin_station_content` da 8000, que não foi tocada.
5. **Nome da política das marcações encurtado** para `"marcações: avaliador, e candidato após a avaliação"` (a versão longa passava de 63 caracteres e o Postgres a cortaria).
6. **Realtime à prova de falta de permissão:** se o painel não deixar criar política em `realtime.messages`, a colagem avisa
   (`NOTICE`) e segue, em vez de desfazer tudo. Sem política, nenhum canal privado abre (falha para o lado seguro) e o app usa as consultas de reserva.
7. **Salas e avaliações antigas:** as salas viram `closed`/`sem_sinal` só na primeira colagem (enquanto a coluna `state` existe); se
   houver avaliações antigas repetidas da mesma sala, ganham rodadas 1, 2… para a regra "uma por sala e rodada" entrar.
8. **`feedback_pos/neg/gen`** são `text not null default ''` (o plano só dizia "até 1000").
9. **Testes de outros arquivos ajustados** porque o plano muda o comportamento: `estacoesRevisaoMedica.test.ts` (aluno lê `[]` do conteúdo) e `admConfigEstacoesBanco.test.ts` (a equipe agora vê 3 chaves). `supabase/README.md`: uma frase sobre o que o aluno lê.
10. Os helpers: `asUser` ganhou um 4º parâmetro opcional (`settings`) para fixar `realtime.topic`; `openDuplaDb` aceita também `semTreino` (monta a produção sem a migração do Treino, para comparar antes/depois).

## 6. Riscos e pontos a decidir

- **Aluno deixa de ler o conteúdo das estações direto.** Verifiquei que nenhum código do app lê `checklist_station_contents` como aluno
  (só a aba Estações da Administração, via função). Se algum dia a tela de Estações do aluno precisar do conteúdo, tem de ser por função.
- **Futura migração 9730** (outro ramo, teste vencido): ela define "teste valendo" como `trialing` com data de fim futura **ou sem data**.
  A minha regra do teste grátis exige a data de fim no futuro (como no plano). Se a 9730 for publicada, vale alinhar as duas.
- **Futura 9621** (Fontes complementares) cria gatilho em `app_settings`: testado que a 9750 cola normalmente com ela aplicada antes.
- **`rev` da sala** deixou de ser cobrado pelo banco no cliente: quem faz +1 a cada mudança agora são as funções `app_dupla_*` (próximas migrações).
- **Exportação de dados** inclui as salas e matches da pessoa; esses registros trazem o identificador (uuid) do parceiro, sem nome nem contato.
- **Escrita direta:** ninguém grava nas tabelas novas porque não há política de escrita (RLS). Não revoguei as permissões de tabela do
  Supabase (padrão do projeto); se quiser uma segunda trava, é uma migração à parte.
- **`has_image` do impresso** depende da chave de `content.pressing_assets` (`<id>` ou `p<ordem>`): continua `TODO(dono)`, a confirmar com a Montagem de estações.
- Nenhuma estação do pacote entra por seed nesta migração (só a Tarefa 5, em teste/banco local).

## 7. Passo de colagem (só com ordem do dono)

1. Ordem: depois de tudo que já está em produção (até a 9630). Se a 9620/9621 for colada antes, tudo bem; a 9750 não depende delas.
2. Colar o arquivo inteiro `20261003009750_treino_dupla_dados.sql` no SQL Editor. Pode colar duas vezes. O painel pode avisar de
   "operação destrutiva" por causa de `drop column state` e `drop function guard_checklist_room`: é esperado (a sala antiga some do modelo).
3. Antes: ver se há salas ativas hoje (`select count(*) from public.checklist_rooms;`). Pelo que conferi no código, o app nunca gravou
   nelas no Supabase; se houver, serão fechadas.
4. Depois de colar, **não abre nada**: a chave `treino_dupla` fica desligada. O módulo só abre quando o dono ligar na Administração
   (tela da Tarefa 10).
5. Como desfazer: ver o comentário no topo do arquivo.
