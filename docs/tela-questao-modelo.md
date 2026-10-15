# Tela de questão no modelo do dono (verificação e implementação)

Data: 15/10/2026. Ramo `tela-questoes-modelo` (a partir de origin/main 5877871). Sem push.
Modelo: `/Volumes/StaziaMed/Tela para questoes/StaziaMed — Tela de Questão.html` (+ PDF de 2 páginas).

## Veredito

**Conseguimos trocar: SIM, com ressalvas pontuais.** A tela do modelo cabe sobre a tela de resolução que já existe (treino, simulado, correção, revisão do resultado e caderno de erros) sem mexer em banco, rotas ou regras. O que o modelo traz e o app não tem dado para sustentar ficou de fora (dificuldade em 5 barras, dica do Tutor antes de responder, fontes das Questões Inéditas).

## 1. O que o modelo contém (extraído do HTML)

O HTML é um pacote em dois níveis (cada página do PDF é um sub-pacote); desempacotado só com Python, sem rodar nada (`/Volumes/StaziaMed/.tmp-aulas/tela-questao/unpacked/`).

- Fontes: Plus Jakarta Sans e JetBrains Mono (as mesmas do design system do app).
- Cores: fundo `#f4f6f9`, cartão `#fff`, linhas `#dce1e8`/`#eceff3`, texto `#252c36`, títulos azul-marinho `#052a5a`, ação azul `#0a6fd8` (foco `#009dfe`, fundo `#ebf5ff`, borda `#b3dcff`), verde `#16803c`/`#eaf7ef`, vermelho `#c62828`/`#fdeeee`, âmbar `#e59a0b`/`#fef5e3`, violeta `#6236d6` (Tutor, área Preventiva `#6a47e0`). Neutros, verde, vermelho, âmbar e violeta são os mesmos valores dos tokens do app; **o azul de ação e o azul-marinho do texto são diferentes do teal do app** (decisão 1 abaixo).
- Raios: cartão 20, caixa Pergunta 16, alternativa 16, botões 12-14, pílulas 999. Sombra do cartão `0 1px 2px rgba(13,28,66,.06)` (= `--shadow-xs`).
- Tipografia: caso 18/1.7, pergunta 21/1.45 bold, alternativas 16/1.5, rótulos 11-12 caixa-alta com espaçamento .08em, números em mono.
- Estrutura: cabeçalho (logo, rótulo, contagem, barra segmentada, cronômetro com anel, "Nesta questão", pausa, Encerrar); cartão (chips, CASO CLÍNICO, caixa PERGUNTA, alternativas com riscar, bloco de correção, rodapé, "Encontrou algum erro?"); painel lateral (Área e tema, selo de gabarito, dificuldade, Fontes, Tutor, flashcard). Largura 1280, cartão até 920 antes de responder e duas colunas depois.

## 2. Inventário das telas de questão do app novo (`src/novo`)

| Tela | Arquivos | Dados (banco) | Estados |
|---|---|---|---|
| Resolução (treino e simulado) | `practice/PracticeSession.jsx` (Runner) | `app_get_session`, `app_answer_question`, `app_pause_session`, `app_resume_session`, `app_finish_session`, `app_set_bookmark` | respondendo, corrigido (só treino), pausado, confirmar finalizar, anulada, com imagem/tabela, inédita, sem acesso (cartão de bloqueio), preliminar |
| Correção | `practice/Correction.jsx` (+ `QuestionCommentary`, `LinkedSources`, `RelatedQuestions`) | `app_attempt_diagnosis`, `app_question_commentary`, `app_question_source_links`, `app_related_questions` | certo, errado, em branco, anulada (com notas de estudo), preliminar, em revisão, inédita, oficial |
| Resultado e revisão | `practice/SessionResult.jsx`, `TriResult.jsx` | `app_finish_session`, TRI | lista com filtro; questão expandida |
| Caderno de erros | `review/ErrorNotebook.jsx` | `app_error_notebook`, `app_error_detail` | questão expandida + anotação |
| Inéditas (cartão e selo) | `practice/IneditasCard.jsx`, `IneditasQuota.jsx` | `app_my_ineditas` | oculto, sem acesso, limitado, todas. **São cartões de entrada, não de questão: não mudam.** |
| Montagem | `practice/QuestionBuilder.jsx` | `app_start_session`, `app_start_simulado_tri` | não é tela de questão |
| Cartão da Nexus (voz) | `tutor/nexus/QuestionCard.jsx` | sessão do Tutor | layout próprio de conversa por voz |
| Atualizações (mini-questão) | `study/UpdatesScreen.jsx` | atualizações | mini-quiz do conteúdo, outro formato |
| Administrador | `admin/content/questoes/*`, `AdminQuestions.jsx` | dados de rascunho | telas de trabalho da equipe, não prévia do aluno |

Celular: o Runner usava `useMQ`; o modelo é responsivo por CSS (quebra em 720 px).

## 3. Matriz modelo × app (decisão item a item, sem inventar dado)

| Item | Modelo | App | Decisão |
|---|---|---|---|
| Cabeçalho do simulado, rótulo, progresso segmentado, "1/20" | sim | sim (barra e contagem) | **Trocado.** Treino usa o mesmo cabeçalho com rótulo "Treino · área" |
| Cronômetro com anel, "Restante" | sim | sim (prazo no banco) | **Trocado**; anel só com prazo; sem prazo mostra "Tempo de prova" |
| "Nesta questão" | sim | tempo ativo por questão já existe | **Trocado** |
| Pausa e Encerrar | sim | sim (simulado) | **Trocado**; cartão "Simulado pausado" do modelo, questão continua escondida |
| Chips área, tema, nº, "não é oficial" | sim | sim | **Trocado**; tema só depois de responder (vem da correção) |
| Caso clínico / Pergunta | sim | `splitStatement` já separa | **Trocado**; sem pergunta separável, rótulo "Enunciado" |
| Imagens e tabela de apoio | não (sem exemplo) | sim | **Mantido** dentro do caso, antes das alternativas |
| Alternativas com riscar por linha | sim | riscar era um modo na barra | **Trocado** (ícone por alternativa; tocar numa riscada tira o risco e escolhe) |
| Marcar para revisão | sim | sim (`app_set_bookmark`) | **Trocado** |
| Pular | sim | não havia | **Adicionado** como "ir para a próxima sem responder" (já existiam brancos); sem nova regra |
| Anterior | não | sim (simulado) | **Mantido** no rodapé |
| Confirmar resposta | sim | treino sim; simulado grava ao marcar | Treino: "Confirmar resposta". Simulado: grava ao marcar e o botão avança (não corrige: é prova) |
| Dica do Tutor antes de responder ("Travou?") | sim | **não existe** (o código dizia que entra com o Tutor) | **Fora.** Dar dica antes de responder exige função nova e cuidado com vazar gabarito |
| Veredito, "Gabarito: C", explicação, letras A/B/D | sim | sim | **Trocado** |
| Anulada, em branco, preliminar, em revisão | não | sim | **Mantido** com o visual novo |
| Análise Stazia, conduta, fontes vinculadas, "o que mudou" | não | sim | **Mantido** dentro do bloco de correção |
| Área e tema, subtema | sim | área, tema e subtema vêm na correção | **Trocado** |
| Dificuldade em 5 barras | sim | **sem dado** | **Fora** |
| "Gabarito StaziaMed · autoral, não oficial" | sim | sim (inédita) | **Trocado** |
| Fontes | sim | oficiais: 1 fonte do gabarito; inéditas: tabela interna | Ver decisão 2 |
| Discutir com o Tutor | sim | sim (só oficial, não anulada, após responder) | **Trocado** (botão roxo); mesmas regras |
| Criar flashcard | sim | sim | **Trocado** (botão + formulário embaixo) |
| Questões relacionadas | não | sim | **Mantido** no painel |
| Relatar erro "Nos avise" | sim | só "Relatar um problema" geral | **Trocado/ligado** ao `app_report_problem` já existente (sem função nova), com a referência da questão (sem código) |
| Tema claro e escuro | só claro | os dois | Escuro derivado dos tokens (`[data-theme=dark]`) |
| Teclado A-D/1-4/Enter | não | sim | **Mantido** |
| TRI, anotações do caderno de erros, comentário do professor | não | TRI e anotação sim; comentário do professor não existe | **Mantidos** onde existiam |

## 4. Regras de visibilidade

- Antes de responder, a tela não renderiza gabarito, explicação, tema, fontes nem código (a correção só entra com `revealed`; o banco só a devolve depois da resposta, no treino). Testado: `telaQuestaoModelo.test.tsx`.
- **Fontes das Questões Inéditas: não aparecem.** Achado importante: o app **já mostrava** "Fontes oficiais citadas" (de `official_sources`) para as inéditas depois de responder, ao contrário do que o pedido supunha. Pela regra do dono, removi a exibição (`MOSTRAR_FONTES_DAS_INEDITAS = false` em `Correction.jsx`; ligar de volta exige decisão do dono). O banco continua mandando `official_sources` na correção; vale o dono decidir se o servidor deve parar de enviar.
- Oficiais: só a fonte do gabarito que o app já mostrava (`Gabarito: título · órgão`), agora como cartão em "Fontes".
- IA administrativa nunca aparece; Tutor segue só em oficiais, após responder.

## 5. Risco e esforço por tela, ordem

1. Resolução (treino/simulado): risco médio, feito. 2. Correção: risco médio (muitos blocos), feito. 3. Resultado e caderno de erros: baixo, feito (agora também mostram imagem da questão no caderno). 4. Nexus e mini-quiz de Atualizações: **não trocados** (formato próprio; trocar seria redesenho, risco alto, baixo ganho). 5. Admin: não se aplica.

## 6. Decisões do dono

1. **Azul do modelo x teal do app.** O modelo usa azul `#0a6fd8`; o design system do app usa teal. Segui o modelo só dentro da tela de questão (tokens escopados `.tq`); o resto do app segue teal. Se quiser uma cor só, é decisão do dono (trocar o primário do app ou ajustar o modelo).
2. **Fontes das inéditas**: removidas da tela (ver acima). Confirmar e decidir se o servidor para de enviar.
3. **Dica do Tutor antes de responder** e **dificuldade**: ficaram fora por falta de dado/função. Querem criar?
4. **"Pular" no treino** deixa a questão em branco sem volta (já era possível finalizar com brancos). Aceitável?
5. **"Questão Inédita · nº N"** mantido (selo padronizado do app) no lugar de "Questão StaziaMed nº N" do modelo.
6. No simulado o botão avança em vez de "Confirmar resposta" (prova não corrige na hora).

## 7. Arquivos

- Novos: `src/novo/app/practice/tela/` (`tela-questao.css`, `QuestionHeader.jsx`, `QuestionSheet.jsx`, `QuestionReview.jsx`), `src/__tests__/telaQuestaoModelo.test.tsx`, `scripts/previa-questoes/` (prévia com dados simulados, porta 31942).
- Alterados: `PracticeSession.jsx`, `Correction.jsx` (agora `CorrectionBody`, `CorrectionSide`, `useCorrectionData`; `Correction` segue exportada), `SessionResult.jsx`, `ErrorNotebook.jsx`, `TutorDrawer.jsx` (variante visual do botão), e 5 testes ajustados só por texto/marcação.
- Prévia: `npx vite --config scripts/previa-questoes/vite.config.mjs` e abrir `http://127.0.0.1:31942/?modo=treino|simulado&q=inedita|oficial|tabela|anulada&estado=respondendo|certo|errado&tema=escuro`.
- Capturas e folha: `/Volumes/StaziaMed/.tmp-aulas/tela-questao/capturas/` (44 capturas + `FOLHA-modelo-x-implementado.png`).
