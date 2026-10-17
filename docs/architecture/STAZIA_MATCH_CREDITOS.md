# Stazia Match: livro de créditos, reservas por pessoa e par canônico

Mapa do que foi construído no ramo `stazia-match` (17/10/2026). Spec: `docs/superpowers/specs/2026-10-12-stazia-match-engenharia.md`.
Plano: `docs/superpowers/plans/2026-10-12-stazia-match-engenharia.md`. **A cota nasce DESLIGADA** (`app_settings.creditos.ativa = false`):
com ela desligada nada debita, nada limita e nenhum aluno é cobrado. **Pagamento (Stripe) está parado:** não há pedido, pacote, preço, rota
nem webhook; o livro só tem o tipo `purchase` e o balde `purchased` prontos para quando a compra voltar.

## Migrações (faixa 013490 a 013540, reservada em `.tmp-aulas/NUMEROS-MIGRACAO.md`)
| Número | Arquivo | O que faz | Etapa do plano |
|---|---|---|---|
| 013490 | `treino_dupla_creditos_tabelas` | `credit_wallets`, `credit_daily`, `credit_ledger` (só acrescenta), `study_room_charges`, `checklist_rooms.charged_at`, chave `creditos` | M1a |
| 013500 | `treino_dupla_creditos_funcoes` | funções `credit_*` internas, `app_credit_state`, exportação (`study_credits`) | M1b, M1c |
| 013510 | `treino_dupla_integridade` | `study_room_claims` (uma pessoa, uma sala aberta), índice do par canônico, `app_dupla_swipe` reusa a conexão | M2c, M2e |
| 013520 | `treino_dupla_creditos_inicio` | débito dos dois em `app_dupla_start` (com a cota ligada exige o convite aceito; cobra também cada estação nova), pré-checagem em `app_dupla_next_station`, pré-checagem em `app_dupla_swipe` e `app_dupla_answer_invite` | M2a, M2b |
| 013530 | `treino_dupla_creditos_admin` | configuração, concessão, estorno, extrato, uso de hoje e conciliação (só administrador) | M4a |
| 013540 | `treino_dupla_creditos_ia` | PREPARAÇÃO da M3: moeda `ia` com janelas de dia, semana e mês (`credit_avail`, `credit_state`) e `credit_refund_ref`. NÃO liga o treino sozinho: a ligação (`ch_worker_solo_prepare` e `_fail`) está descrita no cabeçalho e espera juntar o ramo `dupla-sozinho-ia` e os números do dono | M3 (parte) |

## Quem pode o quê
- **Aluno:** `app_credit_state('match')` (o próprio estado). Lê as próprias linhas de `credit_daily`, `study_room_charges` e `credit_ledger`
  (neste, só as colunas liberadas: sem `idem_key` e sem `created_by`). Não toca em `credit_wallets` nem em `study_room_claims`.
- **Funções `credit_*`:** internas. `revoke … from public, anon, authenticated`; só rodam dentro de funções `security definer`.
- **Administrador:** `app_admin_credit_*` e `app_admin_save_credit_config` (`assert_admin` + `admin_log`). Editor, revisor médico e aluno são barrados.
- **Equipe** (administrador, editor, revisor médico) não gasta nem é limitada: balde `unlimited`, sem lançamento no livro.

## Regras do débito
- Quando: no início confirmado da estação (`app_dupla_start`), **de cada um dos dois, na mesma transação**: os dois pagam ou nenhum paga.
- Chave por aluno: `sala:<sala>:<aluno>` (rodada 1). **"Treinar outra estação" (rodada 2 em diante) COBRA** (decisão do dono de 17/10: cada
  estação nova na mesma sala é uma sessão nova): 1 crédito de cada um, os dois ou nenhum, a chave é `sala:<sala>:r<n>:<aluno>`. A chave
  `creditos.match.cobra_rodada_extra` vale verdadeiro por padrão (ausente = cobra); só um `false` explícito deixa de cobrar. Antes de abrir a
  estação nova (`app_dupla_next_station`) os dois são pré-checados, sem debitar. Recarregar ou repetir o início nunca cobra de novo.
- **Treino sozinho com IA:** cada sessão com avaliação por IA gasta crédito de IA (decisão do dono de 17/10). A ligação fica para quando o
  ramo `dupla-sozinho-ia` for juntado (ver cabeçalho da 013540).
- Ordem: diária, bônus, comprados (`creditos.match.ordem` pode trocar). Dia = `America/Sao_Paulo`.
- Plano com a cota ligada e sem número = zero. Abandono depois de iniciar mantém o débito; estorno só manual pela Administração.
- Pré-checagem (sem debitar): sem crédito meu, "Estudar junto" devolve `{ matched: false, reason: 'quota' }` e a escolha não é gravada;
  sem crédito do outro, a resposta é idêntica a "o outro não escolheu".

## Travas (ordem fixa)
par (`dupla-par:`) → reservas de sala (chave primária de `study_room_claims`, inseridas em ordem de UUID) → sala (`for update`) →
carteiras (`credito:<moeda>:<uuid>`, em ordem crescente de UUID). Nenhuma função pega carteira e depois sala.

## Testes
Banco (PGlite): `duplaCreditosBanco`, `duplaCreditosRls`, `duplaCreditosInicio`, `duplaCreditosPreChecagem`, `duplaCreditosAdmin`,
`duplaCreditosSeguranca` (inclui a jornada completa), `duplaUmaSala`, `duplaParCanonico`. Telas: `duplaCreditosTela`, `duplaCreditosAdminTela`.
**Concorrência real** (várias conexões): `scripts/dupla/concorrencia-creditos.mjs` (precisa de um Postgres de teste e do pacote `pg`, que NÃO
foi instalado; a lógica dos 7 cenários é conferida em série no PGlite por `duplaCreditosConcorrenciaRoteiro`). O PGlite tem uma conexão só e
serializa as chamadas: ele prova o resultado, não a corrida.

## O que ficou de fora (decisão do dono pendente)
Etapa R (limites de taxa, números do dono), Etapa N (fila "Buscar agora"), Etapa G (agenda), Etapa M3 (a LIGAÇÃO dos créditos de IA ao treino sozinho; espera juntar o ramo `dupla-sozinho-ia` e os números do dono),
Stripe, Tutor no livro, bloqueio de pessoas, moderação. Ver o relatório `RELATORIO-stazia-match.md`.
