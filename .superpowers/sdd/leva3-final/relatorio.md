# Leva 3 final 2: ordem junta com as correções da 2ª revisão independente

Ramo `leva3-final2`, criado de `8bd82fb` (o que está em produção: site, Cloud Run e SQL 9620/9621) com merge dos quatro ramos corrigidos na mesma ordem de antes: `leva3-q` 7dd08f9, `leva3-a` 090dff1, `leva3-p` 3753473, `leva3-pl` 54dab4d. Nada empurrado, nada colado em produção, nenhuma rede. (A seção 1 em diante é do relatório da primeira versão `leva3-final`, que continua valendo no que não é contrariado por esta seção.)

## 0. O que a segunda versão trouxe
**Conflitos de merge (2) e como foram resolvidos, sem perder nada**
- `server/lessons/router.ts` (ao juntar `leva3-a`): a linha de importação. Ficou a união: `holdFile, recordFileSha, releaseFile, SHA_WARNING` (o `releaseFile` veio do main 8bd82fb; os ramos partiram de bcaf451, mais antigo) mais `sweepLessonFiles` de `./files`.
- `src/__tests__/fontesComplementaresOrdem.test.ts` (ao juntar `leva3-p`): o filtro de migrações que ficam de fora. Ficou o mesmo da primeira versão: tira 9621, 9700 a 9739 (Questões, Aulas, Podcasts e Planos entram depois da 9620 e redefinem funções dela); a ordem com cada uma é provada nos testes das próprias frentes.
- `leva3-q` e `leva3-pl` entraram sem conflito.

**Correção do gate da 9730 (`9a662ec`) ainda era necessária.** Nenhum ramo a trazia (o `leva3-pl` não tem o gatilho `practice_sessions_simulado_gate`; o aluno com teste vencido inseria `kind='simulado'` direto na tabela). Reaplicada por cherry-pick (clean) junto dos scripts de verificação e do pacote da primeira versão.

**Defeito achado na junção (testes de fora das quatro frentes).** Quatro testes antigos (`apoioT3Servidor`, `apoioVarredura`, `apoioVarreduraServidor`, `fontesComplementaresRodada2Termos`) criavam a aluna com `plan='pro', status='active'` SEM `current_period_end`. Pela regra que já existia (`subscription_is_paid`, usada por `has_pro` desde a 9550) isso não é plano pago válido, e a 9730 passou a fechar o Tutor para quem não tem plano pago válido ("Seu teste grátis do Tutor terminou"). Não é defeito do produto (plano pago de verdade sempre tem data de fim); foi ajustado o dado dos testes (`current_period_end = now() + interval '30 days'`).

**Scripts de verificação atualizados** (funções das reservas com código): `matriz-e-cenarios.mjs` (assinaturas novas de `ch_worker_lesson_files_*` e `ch_worker_podcast_files_*`, renovação, `podcast_files_blocked`; `ch_podcast_approver_check` saiu) e `gerar-leva3.py` (conferências finais das partes 2 e 3).

## 0.1 Resultado da verificação (tudo em PGlite, Postgres 18)
| Verificação | Resultado |
|---|---|
| Produção simulada (base 23d53c1 + partes 1 a 7 de 11/10 + Arena + DESLIGAR tetos + 9610 + 9620/9621) + 10 migrações novas (9700, 9701, 9702, 9710, 9711, 9720, 9721, 9730, 9731, 9732) coladas 3 vezes | 30 colagens sem erro. 1a x 2a e 2a x 3a: nenhuma diferença em funções, gatilhos, políticas, permissões, colunas, restrições, índices e dados |
| Funções antes x depois (`comparar.py`) | 588 antes, 639 depois: 51 novas, 0 removidas, 12 mudam (as mesmas 12 da primeira versão; só no que cada migração pretende), nenhuma ACL existente muda. Tabelas: 7 novas (5 com RLS fechado ao app e 2 sequências padrão); gatilhos: 16 novos e 1 alterado (`lesson_progress_play`), nenhum removido |
| Quadro pessoa x função (`matriz-permissoes.mjs`) | idêntico ao `matriz-permissoes.md` anterior: visitante nunca passa; internas e `ch_worker_*` fechadas; tabelas novas fechadas |
| Cenários e permissões (`matriz-e-cenarios.mjs`) | 99 de 99 ok (inclui renovar reserva de aula vigente, o gate de simulado pela tabela, aprovação de podcast por área) |
| 24 ordens possíveis das 4 frentes (`permutar-partes.mjs`) | ver linha abaixo |
| Recolar cada arquivo antigo DEPOIS da leva (`recolar-anteriores.mjs`) | mesmo resultado da primeira versão (ver seção 5) |
| Pacote do dono colado 2x (`verificar-pacote.mjs`) | todas as 8 colagens com `OK: ... colada` e todas as conferências true; conferência 0 igual antes/depois; nenhuma tabela existente muda dados; pacote e migrações diretas dão a mesma estrutura |

`permutar-partes.mjs`: RESULTADO: as 24 ordens colam sem erro e dao a mesma estrutura (funcoes, gatilhos, politicas, permissoes)

## 0.2 Testes pela fila (`../vaga-de-teste.sh`, `--pool=threads --maxWorkers=2`, nunca a suíte inteira)
- Lista A: 60 arquivos (todo teste que as quatro frentes e a junção mexeram, mais ordem de migrações, fonte complementar, registro da Administração, `supabase*Api`, `lesson*`): 8 lotes. Falhou só `fontesComplementaresRodada2Termos` (causa acima).
- Lista B: 30 arquivos (todos os que usam Tutor, simulado ou `app_start_session` e não estavam na A, mais os 3 ajustados e `admConfigEstacoesBanco`), depois do ajuste de dados: 4 lotes, todos passaram (`Test Files` 8, 8, 8, 6).
- Resultado final: 89 arquivos distintos (o ajustado `fontesComplementaresRodada2Termos` está nas duas listas), nenhum falha depois do ajuste.
- `npm run build`: ok. `npx tsc --noEmit`: 1831 erros, igual à base (nenhum novo).
- Não rodei a suíte inteira.

## 0.3 Pacote do dono: `/Users/joaopaulomendes/Downloads/publicacao-staziamed-2026-10-12-leva3/`
Gerado por `gerar-leva3.py` a partir deste ramo. Cada parte termina com `select 'OK: <parte> colada'` e conferências true. SHA-256:
```
ca2d66751caaa47872e89464d222ed6ae495b9b29fa7eda4be19eaffa6a94bfb  0-CONFERIR-primeiro-nao-altera-nada.sql
ab490bf209ef92320b71b9ca941f842d09aefbc719d75f9dba329767d7b67841  0-LEIA-ME.txt
b32550c9318c920b59a46a2ad9176bfed15efde27334478570410fd15538e93c  1-colar-ANTES-do-site-parte-1-Questoes.sql
add8f5947b96ddcdeb54089bbae58531d2b96f293f41f611ecaecf25bc662ce8  2-colar-ANTES-do-site-parte-2-Aulas.sql
71b7e6fa7ee80f709fad4d77327be7d01d2ef030c4e31e170f3b8859d008cc83  3-colar-ANTES-do-site-parte-3-Podcasts.sql
277d53a0ae687e433daf0637f3e9342e3e2de0be769fd55c206b6b0dc6a8ee10  4-colar-ANTES-do-site-parte-4-Planos.sql
5161ee04115452885bb2a4cbd4b6c74ca9ff7a9560eda60d1a73ed884015e26b  OPCIONAL-lista-dos-arquivos-esquecidos-de-podcast-so-leitura.sql
```
Ordem de publicação (no 0-LEIA-ME): conferência 0, partes 1 a 4, depois imagem do Cloud Run, por último o site.

## 0.4 Limites e avisos desta versão
- 9710, 9720, 9721 foram editadas no lugar (nenhuma está em produção). A 9710 só cola com a 9620 já colada (já está em produção): sem ela, para no começo com aviso e não altera nada.
- O ensaio é em PGlite com UMA conexão: as corridas (reservas de arquivo) estão provadas por ordem, não por duas conexões reais.
- Uma chamada ao depósito que demore mais de 10 minutos depois da última renovação ainda poderia coincidir com uma referência nova (limite documentado por Aulas e Podcasts; o servidor limita cada exclusão a 60 s).
- Os arquivos de storage da 9700 (`storage.buckets`) só rodam no Supabase real; vale enviar uma figura de verdade e abrir uma aula de cada tipo depois de publicar.
- Com a chave do Tutor "Planos pagos + teste grátis" desligada (estado antigo), o Tutor segue aberto a todos: decisão do dono.
- Recolar `COLAR-fonte-complementar-9620-9621.sql` ou a parte 4 do pacote de 11/10 depois desta leva desfaz parte dela (ver 0-LEIA-ME).

---

# Leva 3 final: verificação da ordem junta e pacote de SQL

Ramo `leva3-final` (partida 074598d). Nada empurrado, nada colado em produção, nenhuma rede. Tudo foi ensaiado numa cópia do banco em PGlite (Postgres 18).

## 1. O que foi verificado
Estado de produção simulado = base 23d53c1 (66 migrações) + partes 1 a 7 do pacote de 11/10 + SQL da Arena + DESLIGAR-tetos + Fontes oficiais 9610 + Fonte complementar 9620/9621. Sobre ele, as 10 migrações da leva (9700, 9701, 9702, 9710, 9711, 9720, 9721, 9730, 9731, 9732), em ordem numérica.

| Verificação | Script | Resultado |
|---|---|---|
| Colar as 10 duas vezes e uma terceira | `ordem-e-recolagem.mjs` | 30 colagens sem erro. 1a x 2a e 2a x 3a: nenhuma diferença em funções, gatilhos, políticas, permissões, colunas, restrições, índices e dados |
| Compara `pg_get_functiondef` de toda função, antes x depois | `comparar.py` | 588 funções antes, 636 depois: 48 novas, 0 removidas, 12 mudam (ver tabela abaixo). Nenhuma ACL de função existente mudou |
| Quadro pessoa x função (visitante, aluno, revisor da área, revisor de outra área, editor, editor+revisor, administrador) | `matriz-permissoes.mjs` / `matriz-permissoes.md` | Conforme o desenho. Visitante nunca passa; internas e `ch_worker_*` fechadas a todos; 5 tabelas novas fechadas ao app |
| 98 checagens de permissão e de cenários que cruzam frentes | `matriz-e-cenarios.mjs` | 98 de 98 ok |
| Colagem das 10 de novo com dados no banco | idem (bloco F) | nenhuma linha de dado muda |
| Colar de novo cada arquivo antigo DEPOIS da leva | `recolar-anteriores.mjs` | Ver seção 5 |
| 24 ordens possíveis das 4 frentes | `permutar-partes.mjs` | Todas colam e dão a mesma estrutura: as frentes são independentes |
| Pacote do dono (arquivos finais) colado 2x | `verificar-pacote.mjs` | Sem erro; todas as conferências finais deram true; pacote e migrações diretas dão a mesma estrutura; nenhuma linha de tabela existente muda |

## 2. Funções de produção que mudam (12) e se a diferença é só da migração dona
| Função | Dona | Diferença |
|---|---|---|
| admin_import_merge_question | 9700 | só a regra de "cita figura" |
| app_admin_question | 9701 | só 4 campos novos do comentário em revisão |
| app_admin_questions | 9701 | só filtro, selo e `comment_review_ready` |
| ch_raw_practice_correction_view, ch_raw_tutor_truth | 9701 | só os campos escondidos (`question_hidden_fields`) e "o que avalia" |
| questions_change_trail | 9702 | só figura e marca "Cita figura" |
| gam_process_lesson | 9711 | só a exigência do fim assistido e o "já ganhou" |
| ch_raw_app_admin_podcast_approve | 9720 | 1 linha: `ch_podcast_approver_check` |
| app_admin_delete_podcast | 9721 | só filtro da lista de caminhos |
| app_start_session | 9730 | só a trava do simulado |
| tutor_entitlement | 9730 | só `v_locked`, `plan_locked` e voz do Elite |
| handle_new_user | 9732 | só a chave do teste no cadastro (termo e telefone intactos, testado) |

Funções redefinidas por duas frentes: nenhuma (conferido pelos nomes em `create function` das 10 migrações: sem duplicata). `lesson_materials_json`, `app_lesson_material`, `app_podcast`, `podcast_admin_view`: nenhuma das 10 as redefine (continuam as da 9580/9620). As duas `ch_raw_*` da 9701 partem do corpo da 9620 e o `ch_raw_app_admin_podcast_approve` da 9720 parte do corpo da 4700 renomeado pela 9620 (o invólucro da 9620, com a recusa de fonte complementar, fica intacto: testado).

## 3. Gatilhos
15 novos, 1 alterado, 0 removidos.
- `lesson_materials`: 5 (fila de arquivo ao apagar/trocar; guarda de reserva da 9710; guarda de reserva da 9721) mais os 2 já existentes. `podcast_sources`: guardas das duas frentes + fila da 9721. `ch_file_holds`: guarda da 9710 (só insert) + guarda da 9721. Os nomes são diferentes, então um não desfaz o outro. A ordem de disparo é alfabética (Postgres), e os guardas são independentes. Testado: Aulas reserva um caminho -> material, fonte de podcast e retenção são recusados; Podcasts não reserva arquivo ainda usado por fonte/material de aula e vice-versa.
- `questions`: `questions_images_guard`, `questions_keep_figure_flag`, `questions_comment_review_mark`, mais os existentes; nomes distintos, colunas distintas.
- `lesson_progress_play`: passa a olhar também `watched_to_end_at`.

## 4. Defeito achado e consertado
**Simulado furava pela tabela (9730).** A política "sessões: criar as próprias" deixa o aluno inserir a própria linha em `practice_sessions`; quem tinha teste vencido podia criar `kind='simulado'` direto pela API do banco e burlar a trava, que só existia em `app_start_session`. Teste vermelho antes, verde depois (`planosTesteVencidoBanco`, novo caso). Conserto na 9730: gatilho `practice_sessions_simulado_gate` (BEFORE INSERT, só `kind='simulado'`, usa `simulado_gate()`; sem pessoa logada não se aplica). Commit 9a662ec.

## 5. Decisões de desenho e ressalvas
- Recolar arquivos antigos depois da leva: `COLAR-fonte-complementar-9620-9621.sql` volta as duas `ch_raw_*` à versão antiga (desfaz a regra do comentário em revisão; a conferência final da parte 1 mostra false e basta recolar a parte 1). A parte 4 do pacote de 11/10 volta o `tutor_entitlement` antigo (recolar a parte 4 da leva). As partes 1, 5 e 6 de 11/10 também mexem em funções da leva (`admin_user_row`, `app_admin_gamification`, `ch_worker_gamification_close_week`, `app_lesson_material`, `app_podcast`, `lesson_materials_json`, `lesson_view`, `app_announcement`) mas nenhuma delas é função redefinida pela leva, nem perdem nada dela. Documentado no 0-LEIA-ME.
- Revisor médico SEM papel de editor não abre a aba Podcasts, então só aprova se também for editor (desenho já registrado na 9720). Editor+revisor da área aprova (testado).
- Campo `comment_review` sem pessoa logada (SQL colado) não passa pela revisão: desenho já aceito na 9701.
- O ensaio é em PGlite, com depósito de arquivos de mentira; a conferência de `storage.buckets` na 9700 só roda no Supabase real. Vale um envio de figura real e uma aula de cada tipo depois de publicar.
- Conferência 0: aulas por tipo de vídeo são contadas pelo endereço (aproximação).

## 6. Janelas de quebra (entre colar e publicar)
Ver o 0-LEIA-ME: Questões (comentário já entra em revisão sem o aviso; sem envio de figura), Aulas (concluir não dá XP na hora no site antigo; vem depois), Podcasts (servidor antigo apaga direto como hoje; editor comum barrado pelo banco), Planos (mensagem genérica no site antigo). Ordem: SQL, imagem do Cloud Run, site.

## 7. Testes pela fila
22 arquivos, 376 testes, todos passaram: arenaRegrasConferidas, correcoesQuestoesAjustesBanco, correcoesQuestoesBanco, planosRevisaoBanco, planosCadastroSemTesteBanco, planosTesteVencidoBanco (21), supabaseAnswerKey, supabasePracticeApi, supabaseReviewApi, supabasePlayApi, planosEliteBanco, correcoesAcessoBanco; aulasArquivoApagadoBanco, aulasXpAteOFimBanco, fontesComplementaresOrdem, leva3QComentarioBanco, leva3QFiguraBanco, leva3QHistoricoBanco, leva3QRodadaRevisaoBanco, podcastsArquivos, podcastsRevisorBanco, tutor. Não rodei a suíte inteira nem build/tsc (nenhum arquivo de código mudou, só SQL e um teste).

## 8. Pacote do dono
`/Users/joaopaulomendes/Downloads/publicacao-staziamed-2026-10-12-leva3/` (gerado por `gerar-leva3.py`): 0-LEIA-ME.txt, 0-CONFERIR-primeiro-nao-altera-nada.sql, 1-colar-ANTES-do-site-parte-1-Questoes.sql, 2-...-parte-2-Aulas.sql, 3-...-parte-3-Podcasts.sql, 4-...-parte-4-Planos.sql, OPCIONAL-lista-dos-arquivos-esquecidos-de-podcast-so-leitura.sql.
