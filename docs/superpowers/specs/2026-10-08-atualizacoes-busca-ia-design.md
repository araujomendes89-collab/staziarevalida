# Atualizações com busca por IA e questões desatualizadas — especificação

Data: 2026-10-08. Estado: desenho aprovado pelo dono em conversa (partes 1 a 4, "sim"); aguarda a revisão deste documento.
Projeto 1 de 3 do pedido de 2026-10-08 (os outros: IA em Editar questão; Banco de Inéditas com o revalida-reverse-engine).

## 1. O pedido
- "Atualizações: assistente de IA para buscas automáticas."
- "Questões antigas podem estar desatualizadas: quero que mostre a questão com o gabarito atual, porém a nova atualização
  com uma explicação."

Resultado esperado: sem o dono procurar nada, a Administração recebe propostas do tipo "a diretriz X mudou (fonte
oficial, trecho), estas questões são afetadas, esta é a Atualização e este é o cartão de cada questão". O dono confere a
fonte e aprova; a Atualização aparece na página Atualizações e as questões afetadas ganham o cartão "Atualizada".

## 2. Decisões do dono (2026-10-08)
| Assunto | Decisão |
|---|---|
| Como buscar | **As duas:** botão "Buscar atualizações" (por área ou tema, na hora) **e** busca automática semanal nos temas mais cobrados. |
| Fontes oficiais | **Governo + sociedades:** Ministério da Saúde (protocolos, PCDT/CONITEC, Atenção Básica, INCA, ANVISA), OMS/OPAS e sociedades médicas brasileiras (FEBRASGO, SBP, SBC etc.). Lista editável no painel; SUS/Ministério com prioridade. |
| Nota do aluno | **Vale o gabarito oficial da prova.** Depois de responder, o aluno vê o cartão "Atualizada" com como caiu na prova, como é hoje e por quê. |
| Caminho | **C:** a busca (A) acha documentos novos e os põe na lista vigiada; a vigia semanal (B) pega mudanças dos já cadastrados. |
| Revisão | A IA só faz rascunho; uma pessoa confere a fonte oficial e publica (hoje o dono, revisor das 5 áreas). Nada é publicado sozinho. |

## 3. Fora desta etapa
- IA em Editar questão (explicação, comentário, conduta, o que avalia) e o Banco de Inéditas: projetos próprios.
- Trocar o gabarito oficial: nunca pela IA. A ferramenta de administrador que já existe (`app_admin_set_official_answer`)
  segue sem tela nesta etapa.
- Notificações ao aluno sobre atualizações novas.

## 4. A lista oficial e as fontes
- **Sites oficiais (lista de domínios)**, editável em Central de Conteúdo › Fontes, só administrador. Valores iniciais
  (sugestão, o dono confere e ajusta): `gov.br/saude`, `bvsms.saude.gov.br`, `gov.br/conitec`, `gov.br/inca`,
  `gov.br/anvisa`, `who.int`, `paho.org`, `iris.paho.org`, `febrasgo.org.br`, `sbp.com.br`, `portal.cardiol.br`.
  Cada domínio tem a instituição e o tipo (governo / internacional / sociedade). Documento do governo brasileiro tem
  prioridade quando duas fontes tratam do mesmo tema.
- **Nível de autoridade:** os documentos encontrados entram em `ch_sources` com nível de A a D (oficiais), como o banco já
  exige para evidência. Nível E (apostila, curso) nunca entra pela busca.
- **Documentos vigiados:** cada documento oficial (página ou PDF) fica cadastrado com instituição, título, área, data e
  "vigiado". A tela Fontes e a vigia já existem; a lista começa vazia.

## 5. A busca (botão + semanal)
- **Função nova na Central de IAs:** "Busca de atualizações". O dono escolhe a IA entre as que buscam na internet (Claude,
  OpenAI, Gemini) e o teto de gasto, como nas outras funções. Começa **desligada**.
- **Botão "Buscar atualizações"** na tela Atualizações: escolher área ou tema (ou "temas mais cobrados"); a busca roda em
  segundo plano e o resultado cai na fila (§8).
- **Busca semanal automática:** uma vez por semana (segunda-feira, de madrugada, horário de Brasília), nos temas mais
  cobrados (incidência que já está no banco), **alguns temas por semana em rodízio** (quantidade ajustável no painel;
  valor inicial 5).
- **A IA só busca nos domínios da lista.** Para cada achado devolve: título do documento, instituição, link, data de
  publicação, o que mudou e o **trecho exato** que sustenta a mudança.
- **Conferência do servidor (não confia na IA):** abre cada link e confere que (1) o domínio está na lista, (2) a página
  ou o PDF existe e (3) o trecho citado está no texto. Falhou qualquer um: o achado é descartado e o motivo fica
  registrado. "Não achei nada" é resultado válido.
- **Documento novo** encontrado entra sozinho na lista vigiada, marcado "encontrado pela busca em dd/mm/aaaa".

## 6. A vigia semanal
- Uma vez por semana, cada documento vigiado é aberto e comparado:
  - página de site: texto comparado com a leitura anterior (já existe);
  - PDF: se o arquivo mudou, a versão nova é lida inteira e o texto é comparado com o da anterior (hoje o PDF só tem
    impressão digital; a comparação de texto é nova).
- Sem mudança, nada acontece. Com mudança, o trecho que mudou segue para o §7.

## 7. Da mudança à proposta
A IA trabalha **só com o texto da fonte**:
1. **Resumo da mudança:** o que era antes, o que é agora e desde quando, com o trecho.
2. **Questões afetadas**, em dois passos: (a) o banco separa as candidatas pelo tema e pela classificação de cada questão
   (área, subárea, tema, decisão clínica); (b) a IA lê cada candidata e responde "afeta" ou "não afeta", com o motivo.
3. **Rascunho da Atualização** com os campos da tela Atualizações: o que era, conduta atual, linha do tempo, como pode cair
   no Revalida, pegadinha, impacto clínico, fonte e termos de busca.
4. **Rascunho do cartão de cada questão afetada:** "Na prova de [ano] o gabarito foi [letra] ([conduta da época]); hoje a
   conduta é [conduta], porque [mudança], conforme [fonte, trecho]".

**Regras fixas:** a IA **nunca muda o gabarito oficial**; não inventa nada fora do trecho; quando não afeta, diz "sem
mudança"; tudo nasce como rascunho.

**Caminho manual:** em Administração › Questões › Editar questão entra o botão **"Abrir atualização desta questão"**: o
dono cola o link de uma fonte oficial (domínio da lista) e a IA prepara a proposta só daquela questão, pelo mesmo
caminho (conferência do link e do trecho incluída).

## 8. A fila de revisão
**Administração › Atualizações › "Propostas da IA"**, um item por mudança encontrada:
- a fonte: link, instituição, data e o trecho destacado, com botão para abrir o documento;
- o rascunho da Atualização (editável);
- as questões afetadas, cada uma com o gabarito oficial e a proposta do cartão lado a lado (editável); as candidatas
  "não afeta" ficam num bloco recolhido para conferência;
- botões **Aprovar e publicar**, **Sem mudança** e **Recusar**, com nota de pelo menos 10 caracteres (regra que já existe);
- para aprovar, a caixa **"Conferi a fonte oficial"** (o banco só publica com evidência conferida por uma pessoa);
- dá para aprovar a Atualização e só parte das questões.
Quem decide: revisor da área (o dono é revisor das 5). A publicação de uma Atualização vinda da IA exige a aprovação antes
(diferente da criação manual de hoje, que permite publicar sem revisão com aviso ao aluno).

## 9. O que o aluno vê
- **Questão desatualizada:** responde normalmente; **a nota segue o gabarito oficial**. Na correção: selo "Atualizada" e o
  cartão com "Como caiu na prova", "Como é hoje", o que mudou, a fonte e a linha do tempo (tela que já existe).
  **Mudança:** o cartão aparece **sozinho**, mesmo sem a análise completa da questão publicada (hoje depende dela).
- **Página Atualizações:** a atualização publicada, com "Treinar questões deste tema" levando às questões afetadas.

## 10. Custos e controle
- Busca e leitura das questões gastam dentro dos tetos da Central (por função e por mês); toda chamada fica registrada.
- Teto atingido: a busca para e mostra o aviso; a vigia continua (quase sem custo).
- A busca semanal começa com 5 temas por semana (ajustável).

## 11. Erros
- Link que não abre, domínio fora da lista ou trecho que não confere: achado descartado, com o motivo registrado.
- IA fora do ar: a reserva da Central; sem reserva, fica para a próxima rodada.
- Nenhum caminho publica sozinho.

## 12. Testes
- Fonte inventada, de domínio fora da lista ou com trecho ausente: sempre descartada.
- Gabarito oficial intocado em qualquer caminho; nota pelo gabarito oficial.
- Cartão aparecendo sem a análise completa publicada.
- Fila: aprovar só com "Conferi a fonte" e nota; aprovação parcial das questões; "Sem mudança"; recusa.
- Tetos de gasto da função; função desligada não roda; busca semanal escolhendo temas em rodízio.
- Vigia de página e de PDF (com e sem mudança).
- Caminho manual a partir de Editar questão.
- Conferência no navegador (computador e celular) com servidor temporário isolado.

## 13. Publicação (só com ordem do dono)
1. SQL das migrações novas no Supabase (o dono cola), depois o código (GitHub → Vercel) e a imagem nova do serviço do
   Google Cloud (Cloud Run), que roda a busca semanal e a vigia.
2. Na Central: escolher a IA da "Busca de atualizações", o teto e ligar.
3. Conferir a lista de domínios; rodar uma busca pelo botão num tema; revisar a primeira proposta.
4. Ligar a busca semanal.

## 14. Riscos
- Custo da busca na internet (por chamada); começa pequeno e com teto.
- Sites oficiais fora do ar ou com bloqueio a robôs: achado descartado; o dono pode cadastrar o documento à mão.
- PDFs escaneados (sem texto): o trecho não confere e o achado cai; o documento ainda pode ser vigiado por impressão
  digital.
- Créditos do Gemini esgotados hoje: escolher outra IA na Central.

## 15. Notas técnicas para o plano
- **Fontes:** `ch_sources` (com `authority_level` A–E, `ch_source_passages`, `ch_source_watch`, `ch_source_changes`);
  `app_ch_register_source`, `app_ch_watch_source`, `app_ch_set_source_registry`; tela `src/novo/app/admin/content/Sources.jsx`.
  Lista de domínios: tabela nova só por funções de administrador.
- **Vigia:** `server/contentHub/worker.ts` (~80-110), `server/contentHub/sourceDiff.ts`, `POST /api/content-hub/sources/check`
  (`server/contentHub/router.ts` ~195-205); comparação de texto de PDF é nova (o worker do Cloud Run tem PyMuPDF).
- **Agenda:** o job `stazia-pdf-worker` (Cloud Run, a cada 10 min, fila `ch_jobs`) dispara a busca semanal e a vigia quando
  o último disparo tiver mais de 7 dias; o botão enfileira um job.
- **Central:** função nova (chave nova em `server/ai/config.ts` e na checagem do banco da migração `…5200_central_de_ias.sql`);
  `maestroProvider`/`runFunction` (`server/ai/maestro.ts`) com tetos e registro em `ai_calls`; `aiChoices` hoje fixo em
  `criacao` precisa receber a função. Provedores com busca na internet e filtro de domínios: definir no plano por provedor.
- **Conferência de link:** `fetchLink` com proteção de endereço interno (`server/podcasts/extract.ts` ~78-100); extração de
  texto de PDF no servidor.
- **Questões afetadas:** `question_dna` (área, subárea, tema, decisão clínica), `ch_claims`/`question_claims`,
  `ch_flag_dependents` (`…2400_sqie_knowledge.sql` ~20-38); prompt de reanálise `qreanalysis` (`server/ai/config.ts`
  ~114-127; `server/contentHub/questionReanalysis.ts` ~187) e `ch_worker_save_reanalysis` (`…2600_sqie_updates.sql` ~119-129),
  hoje só por linha de comando (`scripts/content-hub/run-question-reanalysis.ts`).
- **Atualizações:** `guideline_updates` (`…4100_atualizacoes_diretrizes.sql`), `app_admin_save_guideline_update`,
  `app_admin_review_guideline_update` (~264), `app_admin_publish_guideline_update` (~292-306); tela
  `src/novo/app/admin/AdminUpdates.jsx`. Ligar `guideline_updates` a `ch_sources` (hoje sem ligação).
- **Cartões:** `question_updates`, `question_update_cards`, `app_question_update_decide` (`…2600` ~159-244: revisor da área,
  nota ≥ 10, `question_evidence_ready`); componentes `UpdateQueue.jsx` e `QuestionAnalyses.jsx` (Central de Conteúdo).
- **Aluno:** `src/novo/app/practice/QuestionCommentary.jsx` (montado em `Correction.jsx`); `app_question_commentary`
  (`…2800` ~185-216) só devolve com `question_analysis` publicada — mudar para o cartão aparecer sozinho.
- **Caminho manual:** `src/novo/app/admin/AdminQuestions.jsx` (editor) + função nova para abrir a atualização de uma
  questão com um link.
- **Migrações:** numeração definida no plano, sem colidir com o Tutor Nexus (que usa `20261003005500` em diante).
