# Auditoria completa — StaziaMed Revalida (02/10/2026)

Escopo: as 34 telas do app abertas no navegador (como aluno convidado e como plano Elite), código do frontend e do backend, regras do Firestore e do Storage, dados das questões, dependências e o site publicado em `staziamed-revalida-prod.web.app`.

Ferramentas reutilizáveis: `scripts/audit/crawl-screens.cjs` (abre todas as telas, mede e fotografa) e `scripts/audit/find-duplicate-code.mjs` (blocos de código repetidos).

---

## 1. Resumo

| Frente | Situação | O mais grave |
|---|---|---|
| Segurança | **Crítica** | Rotas de IA aceitam qualquer usuário e plano informados no cabeçalho; 8 rotas `/api/gemini/*` não exigem login; webhook de pagamento pode liberar plano sem pagamento se o segredo não estiver configurado em produção |
| Dados | **Misto** | As 1.200 questões oficiais são reais, mas **nenhuma** das 1.117 válidas tem as alternativas erradas comentadas, e as 71 que citam imagem estão sem imagem. Várias telas mostram números e pessoas inventados |
| Duplicação | Alta | Três "planos de hoje" diferentes, quatro lugares de "atualizações", três tutores, dois motores de revisão espaçada, lógica copiada entre cliente e servidor |
| Desempenho | Ruim no celular | Todo o app (6,6 MB de JS, inclusive as 1.200 questões) é baixado já na tela de login: 8 s até aparecer o login num celular em 4G |
| Experiência | Boa base visual | O que mais ajudaria o aluno é trocar números fictícios por dados reais dele e comentar os distratores |

---

## 2. Tela por tela

Todas as 34 telas abriram sem erro de JavaScript, exceto **Exportador** (erros de console). Com o plano trocado para "elite" direto no navegador (ver §4.2), as telas Pro abriram normalmente.

| Área | Tela | O que mostra | Origem dos dados | Observação |
|---|---|---|---|---|
| Início | Dashboard | Cronograma, plano, atividade semanal, ofensiva | **Fictício** em parte | Gráfico "Atividade de Estudo" é fixo no código (SEG 25 questões…); "7 dias seguidos" é valor padrão (`studyStreakDays \|\| 7`) enquanto o topo mostra "Sequência 0 dias"; "Recorde: 14d" fixo |
| Estudar | Plano de hoje | "Diagnóstico Clínico Inicial — Matriz INEP" | Regra fixa | Título de seção "Etapas do Ciclo de Hoje" ilegível no tema escuro |
| Estudar | Aulas | 8+ aulas com professor e instituição | **Fictício** | Professores inventados ligados a instituições reais (USP/FEBRASGO, InCor/SBC, HC-FMUSP, INCA, AMIB, SBP); não há vídeos ("Módulo em estruturação") |
| Estudar | Grandes Temas | 75 temas por área | Real (taxonomia própria) | OK |
| Estudar | Materiais oficiais | Busca + 4 destaques + bases | Seed + busca por IA | Busca depende da IA |
| Praticar | Questões | Banco de 1.300 questões | Real (1.200, ver §3) | Contagem "1.300" não bate com as 1.200 existentes |
| Praticar | Simulados | Configuração de simulado | Real | Cartões brancos no tema escuro |
| Praticar | Provas completas | "13 edições oficiais" | Real (12 conjuntos) | Contagem errada; título "Edições disponíveis" com baixo contraste |
| Praticar | Questões por IA | Central de geração e auditoria | Real (requer IA) | Exibe "Claude Sonnet 5 / Opus 5 / Gemini 3.7" — o servidor usa outros modelos em vários pontos (§5) |
| Praticar | Banco de Checklist | Duplas, radar, colegas online | **Fictício** | "11 colegas online" são 15 perfis inventados com fotos de banco de imagens; módulo novo em construção (Etapa 1 pronta) |
| Revisar | Flashcards | FSRS | Real (do aluno) | OK |
| Revisar | Caderno de erros | Erros do aluno | Real | OK |
| Revisar | Atualizações & Diretrizes | 11 mil caracteres de diretrizes | Seed | Fontes não verificáveis |
| Revisar | Radar | "Acesso restrito à administração" | — | Rota de aluno que leva a tela de admin |
| Revisar | Áudio | Resumos de 2–3 min | Seed (texto) | Cita "Ministério da Saúde / FEBRASGO 2026" sem link para a fonte |
| Planejamento | Calendário | Plano de hoje com 5 blocos | **Fictício** | Data fixa 31/08/2026, "0 dias para a prova", 2 itens já marcados como feitos |
| Planejamento | Plano semanal | 7 dias, 157 questões | Gerado por regra | Coerente, mas não usa o desempenho real |
| Planejamento | Até a prova | Jornada | Gerado por regra | — |
| Planejamento | Disponibilidade / Replanejamento | Formulário | Real (perfil) | Data em formato americano (10/18/2026) |
| Desempenho | Visão geral / Evolução / Áreas | Estado vazio honesto | Real | OK |
| Desempenho | Matriz | 10 microcompetências, "+0,0 pts" | Real | OK |
| Desempenho | Tendências (INEP Pattern Engine) | "1.100 questões, 1.240 pares de questões irmãs, precisão 92,5%", "Seu domínio 54%", "PPS 92/100" | **Fictício** | Números fixos em `inepPatternEngineData.ts`, apresentados como análise pessoal |
| Tutor IA | Conversar / Trânsito / Histórico | Tutor por voz | Real (requer IA) | Histórico vazio |
| Outros | Memória do estudante | Domínio por área + "simulador do tutor" | Real + demo | Fora do menu (só por URL) |
| Outros | Agente autônomo | Console de ferramentas | Real (requer IA) | Fora do menu |
| Outros | Exportador | 5,2 milhões de caracteres na página | Real + estatísticas inventadas | Estatísticas fixas: "1.300 questões, 368 imagens, 27 anuladas, 16 retificações, 100% de cobertura" — o real é 1.200 questões, 0 imagens vinculadas, 83 anuladas |
| Outros | Perfil, Planos, Admin | — | Real | Admin corretamente bloqueado pelo servidor |
| Topo | Alertas (3) | Notificações | Fixas no código | — |

---

## 3. Dados reais × fictícios

### 3.1 Banco de questões (o principal ativo)

| Item | Resultado |
|---|---|
| Total | **1.200** questões: 1.100 Revalida INEP (2020 a 2026/1, 11 provas) + 100 ENAMED 2025 |
| Enunciados | Reais, mediana de 612 caracteres; 3 curtos |
| Gabarito e 4 alternativas | 100% preenchidos |
| Anuladas | 83 marcadas |
| Comentário da alternativa correta | 1.116 de 1.117 válidas |
| **Comentário das alternativas erradas** | **0 de 1.117** — as 3.351 alternativas erradas dizem apenas "Alternativa incorreta." |
| **Imagens** | **0 questões com imagem vinculada**; 71 enunciados citam imagem, figura ou "a seguir" (ficam sem resposta possível). Há 36 imagens em `public/images/` sem vínculo |
| Rótulos fabricados | `extractionConfidence: HIGH` e `difficultySource: INEP` em todas (o INEP não publica dificuldade) |
| Estatísticas por questão | Idênticas nas 1.200 (120 tentativas, 65% de acerto, distribuição A/B/C/D fixa). Não encontrei uso na tela hoje — não usar enquanto forem fixas |
| `brazilContextNote` | Vazio em todas |

### 3.2 Conteúdo inventado que aparece como real

| Onde | O quê | Risco |
|---|---|---|
| Banco de Checklist | 15 colegas "online" com nome, faculdade e foto | Usuário convida alguém que não existe |
| Aulas | Professores fictícios com USP, InCor, HC-FMUSP, INCA, sociedades | Uso de nomes de instituições reais |
| Tendências INEP | Precisão 92,5%, 1.240 pares, domínio e prioridade "pessoais" | Promessa estatística sem base |
| Exportador | Cobertura, imagens, anuladas, retificações | Números não batem com a base |
| Dashboard | Atividade semanal, ofensiva de 7 dias, recorde de 14 | Contradiz o "0 dias" do topo |
| Calendário | Plano de 31/08/2026 com itens já concluídos | Data passada, progresso falso |
| Provas completas / Questões | "13 edições", "1.300 questões" | São 12 e 1.200 |
| Topo | 3 alertas fixos | — |
| Diretrizes | Aprovações por médicos com CRM inventado | **Já removido** (commit `46c07fc`) |

---

## 4. Segurança

### 4.1 Crítico

1. **IA sem autenticação real.** `requireAiQuotaMiddleware` (`server/ai/quotaMiddleware.ts`) identifica o usuário pelos cabeçalhos `x-user-id` e `x-user-tier`, que o próprio cliente envia. Testado: com um id inventado e `x-user-tier: PRO_PLUS`, a cota liberada é de US$ 25/dia — e cada id inventado ganha uma cota nova. Qualquer pessoa pode usar as rotas `/api/ai/*` à custa do projeto.
2. **Oito rotas de IA sem login nenhum**: `/api/gemini/tutor`, `copilot`, `generate-question`, `generate-theme-batch`, `generate-flashcards`, `osce-patient`, `osce-evaluate`, `grounded-guideline-audit`. Testado: a chamada chega até o Gemini.
3. **Webhook de pagamento** (`server/routes/paymentWebhooks.ts`): a assinatura só é conferida se `NODE_ENV=production` **e** `PAYMENT_WEBHOOK_SECRET` estiverem definidos, e a conferência é igualdade simples do cabeçalho com o segredo (não é HMAC). Se o segredo não estiver em produção, um `POST` com `{"type":"payment_succeeded","email":"…","plan":"elite"}` libera o plano para qualquer e-mail. **Verificar a configuração de produção.**

### 4.2 Alto

4. **Paywall só no navegador.** Trocar `plan` para `"elite"` no `localStorage` liberou Calendário, Plano semanal, Até a prova, Tutor e Desempenho por área. Hoje o conteúdo dessas telas é gerado no próprio navegador, então não há o que proteger no servidor — mas qualquer recurso Pro futuro precisa ser validado no backend.
5. **Regra `radar_pool`**: qualquer usuário logado cria, altera e apaga o registro de qualquer outro (não confere o dono).
6. **Dependências**: `npm audit` aponta 14 vulnerabilidades em produção (5 altas: `firebase`, `@grpc/grpc-js`, `brace-expansion`; 9 moderadas: `express`, `body-parser`, `qs`, `firebase-admin`…).
7. **Corpo de requisição de 50 MB** aceito em todas as rotas (`express.json({ limit: "50mb" })`): facilita derrubar o servidor.

### 4.3 Médio

8. Site sem cabeçalhos de segurança (CSP, `X-Frame-Options`, `X-Content-Type-Options`); só HSTS.
9. E-mail e UID do administrador principal no JavaScript público (usados para liberar tudo no cliente).
10. Chave do Gemini no `.env` local é inválida (o Gemini responde "API key not valid"); o Claude não está configurado. **A IA não funciona localmente.** Em produção, não foi possível conferir — o backend não está no Hosting.

### 4.4 O que está bem

- Rotas de admin, planos, pagamento e conteúdo publicado exigem token do Firebase e papel no servidor.
- Área administrativa bloqueada mesmo com `role: "ADMIN"` forjado no navegador.
- Regras de `users` impedem o aluno de mudar papel, plano e datas de assinatura.
- Storage: só admin escreve; o resto é negado por padrão.
- Nenhuma chave secreta (Gemini/Anthropic) no JavaScript público; o código do servidor não foi publicado.

---

## 5. Duplicação

### 5.1 Funcionalidades repetidas

| Tema | Onde aparece | Problema |
|---|---|---|
| "Plano de hoje" | Estudar → Plano de hoje · Planejamento → Calendário · Dashboard | Três planos diferentes no mesmo dia |
| Atualizações de diretrizes | Materiais oficiais · Revisar → Atualizações · Radar (admin) · ProtocolUpdatesHub | Quatro fontes de dados |
| Tutor | Tutor IA · Memória do estudante · Agente autônomo | Três portas para a mesma IA |
| Desempenho | 5 abas de Desempenho · Memória do estudante · Dashboard | Métricas calculadas em lugares diferentes |
| Revisão espaçada | `spacedRepetitionEngine` (1 uso) · `spacedRepetitionService` (8 usos) | Dois algoritmos |
| Estações práticas | Protótipo de dupla · Paciente virtual IA · Banco de Checklists novo | Três fluxos |
| Rotas | 91 endereços para 59 telas | Difícil saber o caminho certo |
| Modelos de IA | Tela mostra Claude 5 / Gemini 3.7; o servidor também usa `claude-3-opus-20240229`, `claude-3-7-sonnet-20250219`, `gemini-2.0-flash`, `gemini-2.5-flash` | Configuração espalhada |

### 5.2 Código copiado (blocos de 14 linhas iguais)

| Blocos | Arquivos |
|---|---|
| 59 | `server/services/serverContentPublicationService.ts` ↔ `src/services/contentPublicationService.ts` |
| 47 | `PrivacyPolicyView.tsx` ↔ `TermsOfUseView.tsx` |
| 35 | `AdminEditorialView.tsx` ↔ `GuidelineWatchView.tsx` |
| 35 | `server/ai/functionCalling.ts` ↔ `src/services/functionCallingService.ts` |
| 21 | `EditorialBlockRenderer.tsx` ↔ `StudentPublishedTopicRenderer.tsx` |
| 15 | `server/ai/questionAuditPipeline.ts` ↔ `src/services/questionAuditService.ts` |
| 12 | scripts de importação por edição |

Lógica copiada entre cliente e servidor tende a divergir; o padrão adotado no Banco de Checklists (`src/shared/`, usado pelos dois lados) resolve isso.

---

## 6. Desempenho

Medido no site publicado.

| Medida | Valor | Meta sugerida |
|---|---|---|
| JavaScript da tela de login | 6,6 MB (1,08 MB comprimido), **um único arquivo** | < 250 KB comprimido |
| Login visível — desktop | 1,1 s | < 1 s |
| Login visível — celular médio, 4G lento | **8,0 s** | < 3 s |
| Cache dos arquivos com hash | 1 hora | 1 ano (`immutable`) |
| Logos PNG | ~740 KB cada (1024×1024, exibidas com ~100 px) | < 30 KB (SVG/WebP) |
| Imagens com carregamento tardio | 0 de 15 | todas abaixo da dobra |
| Exportador | 5,2 milhões de caracteres na página | paginar / gerar sob demanda |
| Contexto global (`AppContext`) | 89 valores, sem memorização | dividir por domínio |

Causas: só 2 `import()` dinâmicos no app inteiro; as 1.200 questões e os seeds (`src/data`, ~97 mil linhas) entram no pacote principal; sem `manualChunks`.

---

## 7. Plano de melhoria (por prioridade)

**P0 — esta semana (segurança)**
1. Autenticar `/api/ai/*` e `/api/gemini/*` com `authenticateFirebaseRequest` e tirar plano/cota dos cabeçalhos (ler do perfil no servidor).
2. Webhook: HMAC com o segredo do provedor + recusar sempre que o segredo não estiver configurado.
3. Regra `radar_pool` restrita ao dono; limite de corpo de 1 MB (exceto upload de PDF).
4. Atualizar `firebase`, `firebase-admin` e `express`.

**P1 — honestidade dos dados**
5. Remover ou rotular como "exemplo" tudo da tabela §3.2 (colegas, professores, tendências, estatísticas, calendário fixo, alertas).
6. Corrigir contagens (1.200 questões, 12 provas).
7. Vincular as imagens às 71 questões que as citam (ou marcá-las como indisponíveis).

**P2 — desempenho**
8. Carregar telas sob demanda (`React.lazy`) e tirar as questões do pacote inicial (buscar do Firestore ou de JSON paginado).
9. Cache de 1 ano para `/assets/**`; logos em SVG/WebP; `loading="lazy"` nas imagens.

**P3 — consolidação**
10. Um único "Plano de hoje"; uma fonte de diretrizes; um tutor com modos; um motor de revisão espaçada.
11. Lógica compartilhada em `src/shared/` (publicação, function calling, auditoria de questões).

**P4 — conteúdo**
12. Comentar as 3.351 alternativas erradas: gerar rascunho com IA no pipeline de auditoria que já existe e publicar só após revisão médica.

---

## 8. Experiência inovadora para o aluno (sobre o que já é real)

1. **"Por que errei"**: com os distratores comentados (P4), cada erro vira uma explicação do raciocínio que levou à alternativa errada, alimentando o Caderno de Erros e a revisão espaçada (FSRS já existe).
2. **Prontidão honesta**: um único painel com cobertura real das 1.200 questões por área, acerto por tema e projeção para a prova — sem números de vitrine.
3. **Prova prática completa**: Banco de Checklists em dupla (em construção) + paciente virtual por IA na mesma jornada, com nota calculada no servidor.
4. **Modo Trânsito** com os próprios erros do aluno transformados em perguntas de áudio.
5. **Comunidade real**: presença e convites de colegas de verdade (sem perfis inventados).
