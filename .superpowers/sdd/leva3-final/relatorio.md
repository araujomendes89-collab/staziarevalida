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
