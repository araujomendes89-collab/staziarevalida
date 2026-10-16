# Leva 4: Questões StaziaMed (ineditas) + Análise pela tela (analise-ia) + Atualidade das fontes (buscar-fontes-ia)

Ramo `leva4`, criado de `5d659d1` (main de produção: inclui a leva 3 e a tela de recuperar senha). Merges na ordem `ineditas` (1c9c1ca), `analise-ia` (a341472), `buscar-fontes-ia` (5465a2d). Nada empurrado, nada colado em produção, nenhum serviço real.
As cópias NÃO rastreadas das migrações 9700–9732 que existiam na pasta do ramo ineditas não foram levadas (a leva 3 vem do main).

## 1. Conflitos de merge e como foram resolvidos (nada perdido)
| Arquivo | Conflito | Resolução |
|---|---|---|
| `practice/PracticeSession.jsx`, `SessionResult.jsx` | `QuestionFigures` (leva 3, com `questionId`) x `SupportTable` (ineditas) | os dois: `<QuestionFigures images questionId />` + `<SupportTable support />` |
| `practice/QuestionBuilder.jsx` | `disabled` do botão: trava de plano (leva 3) x trava da inédita | `Boolean(lock) \|\| lockedIneditas` |
| `contentHub/draftChecks.ts` | `RunDeps`: `mockProvider` (dos dois), `onSpend` e `crossCompany` (analise) | união dos campos |
| `contentHub/pipeline.ts` | importações, tipo `Step` e tabela `STEPS` | união: `question_generate`, `question_check`, `question_source` (ineditas) + `question_analysis`, `draft_check` (analise); `source_search` já existia |
| `admin/auditLog.js` | conjunto `CENTRAL_PART` | união (`staziamed`, `draft_check`, `ai_request`, `question_analysis` ...); os rótulos de ação dos três ramos entraram sem conflito |
| `admin/content/DraftQuestions.jsx` | ineditas APAGOU (substituída por `questoes/*`), analise modificou | arquivo apagado como na ineditas; as funções da analise foram PORTADAS para `questoes/DraftList.jsx` e `DraftDetail.jsx`: selo de triagem em cada rascunho, contagem por selo, filtro e ordem por selo, aviso "A IA não aprova", aviso de selo indisponível quando o banco não tem a função, e o painel "Conferir com IA" (`CheckDrafts`). Teste `analiseIaTelas` passou a renderizar `DraftList` |
| `admin/content/QuestionAnalyses.jsx` | imports (`GenerateAnalyses` x `SearchSourcesButton`) | os dois |
`AssistantPanel`, `TabAssistant`, `ui.jsx`, `AdminUpdates.jsx`, `types.ts`: mesclaram sem conflito (testes dos assistentes passam).

## 2. PONTO CRÍTICO DE SQL: inventário função a função
Método: extraí todas as `create function` de 9800, 9801, 9810, 9820 e comparei com todas as migrações anteriores (inclusive 9700–9732).

**Funções redefinidas por mais de uma frente (colisão):**
| Função | 9800 | 9810 | Como ficou (corpo final) |
|---|---|---|---|
| `app_draft_question_decide` | 5 parâmetros (id, decisão, nota, hash, conferi_fontes): revisor da área, texto visto, bloqueios, "conferi as fontes", observação se reprovou na revisão adversarial | 3 parâmetros: linha travada (`for update`), evidência positiva de fonte oficial | **9830**: uma versão só, de 5 parâmetros, com TUDO: `for update` + hash + `draft_approval_blockers` + `ch_draft_official_evidence` + conferi fontes + observação. A de 3 parâmetros (da 1800/9810) é apagada. Se evidência falha, a mensagem diz "Aprovação bloqueada: ... fonte oficial" e acrescenta "Não aprova: <pendências>" |
| `app_draft_questions` | 9 parâmetros (origem, tema, bloqueada, semelhança; situação publicada/recolhida; gabarito publicado; acervo; pendências de aprovação) | 7 parâmetros (triagem, ordem, escopo do revisor) | **9830**: 11 parâmetros, só uma versão; filtros e contagens da 9800 + selo de triagem, `triage_counts`, filtro/ordem por selo e escopo por área do revisor da 9810 (inclusive nas contagens, lotes e conferências). `content_hash`, `can_edit`, `approval_blockers` continuam no item (a tela da 9800 precisa) |
| `ch_jobs_step_check` | lista fixa de 17 etapas | união dinâmica + 19 etapas | **9830**: a união dinâmica (lê a restrição que existe, soma as 19 etapas conhecidas): colar 9800 de novo depois não perde `question_analysis`/`draft_check` |
| `ch_draft_official_evidence` | (usa `draft_has_official_sources`) | positiva: conferência "Fontes" = passou, ou sem conferência e cita documento oficial vigente | **9830**: as duas regras juntas (E): precisa da regra da 9810 e de citação nova de trecho oficial (9800). Os 200 antigos (citam apostila) ficam bloqueados; a triagem `sem_fonte` e a aprovação usam a mesma regra |
| `app_draft_question_detail` | sem escopo | (não mexia) | **9830**: 9800 + o revisor médico só abre rascunho das áreas dele (a 9810 só escopava a lista) |
| `ch_qa_pick`, `ch_worker_questions_for_analysis_ids` | (não existiam) | pedidos de análise sem filtro de origem | **9830**: só questões OFICIAIS (regra da 9801: Questão StaziaMed nunca entra em análise de prova oficial). Teste de catálogo `questoesStaziaMedSoOficiais` ganhou as duas funções |
| Políticas de leitura de `draft_questions`, `draft_checks`, `draft_question_events`, `draft_source_proposals` | "equipe ou qualquer revisor" | só a lista era por área | **9830**: revisor lê só a área dele também pela API do banco (lacuna achada no quadro pessoa x função) |

**Funções da 9801 que a leva 3 também mexeu (7):** `app_start_session` (9730), `ch_raw_practice_correction_view` e `ch_raw_tutor_truth` (9701), `app_admin_questions`, `app_admin_question` (9701), `admin_import_merge_question` (9700), `app_question_figure` (9700). Fiz merge de 3 vias (base 8bd82fb, produção, 9801): a 9801 já parte das versões da leva 3 e só acrescenta (filtro `origin = 'official'`, `ineditas_gate`, campos de apoio/fontes). Conferido por diff: nenhuma linha da leva 3 foi removida (as únicas linhas removidas em todas as funções que mudam são trocas de filtro de origem ou de 9820; lista completa na seção 5).
**9820 x 9610/9620:** 3 funções (`ch_worker_source_candidate_create`, `app_ch_source_candidates`, `app_ch_source_candidate_approve`) partem da 9610; a 9620/9621 não as toca. Sem colisão.
**Outras 36 funções da 9801:** só da 9801 (nenhuma outra frente as redefine).

**ch_ai_requests (9810) x trilha das Inéditas (9800):** a conferência pedida pela tela (`draft_check`) agora (a) manda o hash do texto lido ao `ch_worker_save_draft_check` (9800), então resultado de texto editado no meio é descartado, e (b) grava a linha `conferida` na trilha do rascunho (`draft_question_events`), como a conferência por botão já fazia. Teste: `analiseIaWorker`.

## 3. Migração nova: `20261003009830_fechamento_leva4.sql`
Não editei nenhuma das migrações dos ramos (continuam idênticas; assim novos commits das revisões externas entram sem conflito). Guardas: recusa com aviso se faltar a 9800, a 9801 ou a 9810. Idempotente (colada 3 vezes, igual).
Ordem de colagem: 9800, 9801, 9810, 9820, 9830. No pacote: 9810 e 9830 vão juntas (parte 3), para nunca existirem duas versões da mesma função entre uma parte e outra. Regra de recolagem (no LEIA-ME): "cole DESTA parte até a última".

## 4. Outros ajustes de código
- `draftChecks.ts`: o salvar da camada manda `content_hash` (descarta resultado de texto editado) e só conta como salvo se o banco aceitou.
- `aiRequests.ts`: trilha `conferida` (ver acima).
- Testes antigos ajustados às regras unidas (nenhuma regra afrouxada): `analiseIaBanco` (aprovação com fonte nova, decide com hash; 9830 colada junto da 9810), `analiseIaWorker`, `analiseIaTelas`, `fontesComplementaresOrdem` (deixa 9800–9839 de fora, como já fazia com 9700–9739), `questoesStaziaMedRascunhos` (leitura por área; recolar 9800 exige colar 9810 e 9830 depois), `questoesStaziaMedSoOficiais` (catálogo), `supabaseSeed` (a prova "Questões Inéditas" nasce vazia: contagem de provas oficiais), `contentHubDraftChecks` (tempo maior: a conferência dos 200 leva minutos no PGlite por causa da semelhança contra as 1.200; é característica do ramo ineditas, igual no ramo dele).
- Novo `leva4FechamentoBanco.test.ts` (10 casos; 5 falham sem a 9830).

## 5. Simulação de produção (PGlite)
Base 23d53c1 + partes 1 a 7 de 11/10 + Arena + DESLIGAR tetos + 9610 + 9620/9621 + **leva 3 completa (9700–9732)**; depois 9800, 9801, 9810, 9820, 9830. Scripts em `.superpowers/sdd/leva4/`.
| Verificação | Resultado |
|---|---|
| 5 migrações coladas 3 vezes (`ordem-e-recolagem.mjs`) | 15 colagens sem erro; 1ª x 2ª e 2ª x 3ª: nenhuma diferença em funções, gatilhos, políticas, permissões, colunas, restrições, índices e dados |
| Funções antes x depois (`comparar.py`) | 640 -> 724: 86 novas, 2 removidas (as versões antigas `app_draft_question_decide(uuid,text,text)` e `app_draft_questions` de 5 parâmetros), 37 existentes mudam. Única mudança de ACL: `practice_result` (agora definer, com a posse da sessão conferida, e sem acesso de visitante: decisão da 9801). Todas as novas: `security definer` com `search_path` vazio, exceto 7 auxiliares puras. Visitante só executa `has_ineditas`, `ineditas_gate`, `ineditas_option`, `questions_sources_public` (acesso do aluno, de propósito) |
| Linhas REMOVIDAS nas funções que mudam | só trocas de filtro de origem (`origin = 'official'`), reescritas da 9820 e das etapas; nenhuma linha da leva 3 (porta do simulado, campos escondidos do comentário em revisão, figuras, trava de plano) foi removida |
| RLS / políticas | 5 novas (pedidos de IA, pedidos StaziaMed, propostas, trilha, `questions`), 1 trocada (`questions: leitura para logados` -> acesso por origem), 2 apertadas pela 9830 (rascunhos e conferências por área); 6 tabelas novas, todas com RLS |
| Quadro pessoa x função (`matriz-permissoes.md`) | visitante nunca passa; aluno não chama função de equipe; aluno com teste vencido fica barrado na sessão da inédita; revisor só vê/abre a área dele; só o administrador publica/aprova candidato de fonte; `ch_worker_*` e internas fechadas a todos; tabelas: aluno vê 0 linhas |
| 24 ordens das 4 partes (`permutar-partes.mjs`) | as ordens com a parte 3 depois das partes 1 e 2 dão a mesma estrutura; as demais recusam com "Cole antes a migração ..." |
| Recolar arquivos antigos (`recolar-e-recolar-leva4.mjs`) | colar de novo as partes 1, 5 e 6 de 11/10 volta funções antigas que nem recolar as levas conserta (documentado: NÃO colar); 9610, 9620/9621, parte 4 de 11/10 e partes 1/4 da leva 3 voltam funções, mas recolar a leva 3 e a leva 4 conserta tudo |
| Pacote do dono colado 2x (`verificar-pacote.mjs`) | 8 colagens com `OK: ... colada` e todas as conferências true; conferência 0 antes e depois; pacote = migrações coladas direto; só muda o número de linhas de `exams` (+1, a prova "Questões Inéditas") |
| Leva 3 intacta | conferência final da parte 2 (`leva3_continua_valendo`) true; as funções da leva 3 só ganham o filtro/porta da 9801 |

## 6. Testes, build e typecheck
- Pela fila (`../vaga-de-teste.sh`, `--pool=threads --maxWorkers=2`, lotes de 8): **209 arquivos, 3.418 testes, nenhum falha** (99 "expected fail" que já existiam). A lista: todos os arquivos novos/tocados dos três ramos, todos os que carregam o banco/migrações (111), ordem de migrações, Registro, Central de IAs, fontes oficiais/complementares, leva 3 (aulas/podcasts/questões/planos), Tutor, simulado, `supabase*Api`, e o novo `leva4FechamentoBanco`.
- Antes dos ajustes da seção 4, 7 arquivos falhavam (analiseIaBanco 7 casos, analiseIaWorker, fontesComplementaresOrdem 3, questoesStaziaMedRascunhos 3 casos, questoesStaziaMedSoOficiais, supabaseSeed 2, contentHubDraftChecks por tempo): todos eram efeito das regras unidas ou de dado de teste; nenhuma regra foi afrouxada. `aulasXpAteOFimRodada2Tela` falhou uma vez por carga da máquina e passou isolado e na rodada final.
- **As suítes antigas que o ramo ineditas "diz" falharem sem as migrações dele**: rodei as versões modificadas pelos ramos (`engineSeed`, `novoPracticeFormat`, `registroAdministracao`, `supabasePracticeApi`, `fontesOficiais*` x5) no main 5d659d1 (sem as migrações novas): 9 de 10 arquivos falham lá (esperado: testam o comportamento novo); `contentHubDraftChecks` e `supabaseAdminApi` passam nos dois. No sentido que importa (regressão): **nenhuma suíte antiga NÃO modificada falha em leva4**; e `contentHubDraftChecks` leva ~230 s no PGlite no ramo ineditas também (igual lá), por isso ganhou tempo maior.
- `npm run build`: ok. `npx tsc --noEmit`: 1831 erros no main 5d659d1 e 1831 em leva4 (mesmos erros; só o texto de um tipo mudou).

## 7. Pacote do dono: `/Users/joaopaulomendes/Downloads/publicacao-staziamed-2026-10-12-leva4/`
Quatro partes (1 = 9800, 2 = 9801, 3 = 9810+9830, 4 = 9820) + conferência 0 (só lê) + LEIA-ME. Cada parte termina em `select 'OK: <parte> colada'` com conferências true. SHA-256:
```
4c1336777e787dff68b711af49769435fab57c0a8cf06c4f5ca918088f79ab0d  0-CONFERIR-primeiro-nao-altera-nada.sql
b6be57732e48c171493d099ab427dfe43a86d8cfa37dc350d7d6937b68b86328  0-LEIA-ME.txt
3d267ee5ca1522d35ddfdacc2d74ede85cd77c8263e05a4f324bd25208e749e7  1-colar-ANTES-do-site-parte-1-Questoes-StaziaMed-rascunhos.sql
deac65734a0b339a8e8e05ebffc901d6334844a5ecca283d88cd411f1ce4bb3b  2-colar-ANTES-do-site-parte-2-Questoes-StaziaMed-aluno.sql
00f84a9e7037533aa2bd8c3a8c71c9f002d23d69dbe5f660819260cc6ce6bba7  3-colar-ANTES-do-site-parte-3-Analise-e-conferencia-pela-tela.sql
c73c99dbb17e06f9c864d45e2a3b7815ccdc694623c4375826cad8fbd86ac18c  4-colar-ANTES-do-site-parte-4-Atualidade-das-fontes.sql
```

## 8. Decisões do dono / avisos
1. **Dois jeitos de conferir rascunhos** ("Conferir pendentes" da seção Questões StaziaMed e "Conferir com IA" por pedido, com limites 20/60): ficam os dois; decidir se esconde um.
2. **Rascunhos já aprovados** (a 9800 recalcula o selo do texto de todos): a aprovação antiga fica "texto mudou depois da revisão" e precisa de nova aprovação para publicar.
3. **Os 200 antigos** não aprovam até haver fonte oficial (pelo desenho das duas frentes somadas). Sem nenhuma fonte oficial cadastrada com trechos, Gerar e Buscar fonte não produzem nada.
4. A conferência pedida pela tela dos rascunhos antigos pode reprovar na camada "regras" (nova regra: citar só apostila = crítico; semelhança alta com outra Questão StaziaMed): o selo mostra "reprovada" antes de "sem fonte". Não é erro.
5. Imagem do Cloud Run obrigatória (etapas novas da fila).
6. Limites técnicos: PGlite é uma conexão (corridas provadas por ordem); IA real nunca foi chamada; o primeiro teste de verdade só com ordem do dono.
7. Os revisores externos ainda olham Análise (rodada 2) e Inéditas: novos commits desses ramos entram por merge (as migrações dos ramos não foram editadas aqui; só a 9830 é nova).
