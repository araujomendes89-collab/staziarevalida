# Relatório de Reorganização e Desduplicação Estrutural do Módulo REVISAR (Etapa 1.20B)

**Data da Implementação:** 03 de Setembro de 2026  
**Status da Suíte:** 252/252 Testes PASS (34 arquivos de teste) • 0 Erros de Console  
**Classificação Final:** `REVIEW_NAVIGATION_REORGANIZED`

---

## 1. Navegação Anterior (Auditoria 1.20A)
- A Sidebar continha 3 itens canônicos: *Caderno de erros*, *Flashcards* e *Atualizações & Diretrizes*.
- O componente [`RevisarView.tsx`](src/components/revisar/RevisarView.tsx) renderizava um cabeçalho fixo e uma barra horizontal secundária com 5 botões de navegação (*Flashcards*, *Caderno de Erros*, *Atualizações*, *Radar de Diretrizes*, *Flash-Audio*), duplicando a navegação da Sidebar e introduzindo submódulos de backoffice e recursos complementares como itens primários.

---

## 2. Navegação Final (Desduplicada)
- A **Sidebar** é a única e exclusiva navegação primária do menu **REVISAR**:
  ```
  REVISAR (Layers) [Badge: dueFlashcards]
  ├── Caderno de erros (BookMarked) ────────→ /revisar/erros
  ├── Flashcards (Layers) [Badge] ──────────→ /revisar/flashcards
  └── Atualizações & Diretrizes (Flame) ────→ /revisar/atualizacoes
  ```
- **`REVIEW_INTERNAL_NAVIGATION`**: 5 abas internas duplicadas $\to$ **0** (Eliminada a barra horizontal redundante).

---

## 3. RevisarView como Container / Router Limpo
- [`RevisarView.tsx`](src/components/revisar/RevisarView.tsx) foi refatorado para atuar como container/router direto, renderizando unicamente a sub-view solicitada pela URL / Sidebar, sem camadas de navegação intermediárias.

---

## 4. Radar de Diretrizes (`GuidelineWatchView.tsx`)
- Desacoplado da navegação estudantil primária (`GUIDELINE_WATCH_PRIMARY_STUDENT_NAV = NO`).
- Rota canônica `/revisar/radar` (e aliases `/guidelines`, `/radar`) preservada para acesso direto/administrativo sem quebra de links ou funcionalidades.

---

## 5. Auditoria de Guarda de Autorização (Admin Guard)
- **`GUIDELINE_WATCH_ADMIN_AUTH_GUARD = NO`** (A rota é mantida como rota oculta no client-side; a remoção visual da navegação do aluno não altera as regras de segurança do Firestore nem introduz guardas RBAC no cliente, devendo ser futuramente integrada ao painel administrativo `/admin`).

---

## 6. Flash-Audio (`FlashAudioPlayerView.tsx`)
- Removido da navegação horizontal primária (`FLASH_AUDIO_PRIMARY_STUDENT_NAV = NO`).
- **`FLASH_AUDIO_FUNCTIONALITY_PRESERVED = YES`**: Mantido acessível contextualmente através do botão *"Modo Áudio"* em [`SpacedReviewView.tsx`](src/components/review/SpacedReviewView.tsx) e via rota direta `/revisar/audio`.

---

## 7. Atualizações & Diretrizes (`ProtocolUpdatesHubView.tsx`)
- Focado na sua responsabilidade primária: "O que mudou em 2025/2026 e impacta a conduta na prova do Revalida INEP".

---

## 8. Auditoria de Flashcards Embutidos
- **`FLASHCARD_EMBED_TYPE = PREVIEW`**: O bloco de flashcards dentro de `ProtocolUpdatesHubView` opera estritamente como um visualizador de fixação contextual dos protocolos alterados (sem sistema de scheduling paralelo ou concorrência com o motor FSRS central).

---

## 9. Auditoria de Questões Inéditas Embutidas
- **`UPDATE_QUESTION_EMBED_TYPE = PREVIEW`**: O bloco de questões inéditas em `ProtocolUpdatesHubView` atua como visualizador de casos clínicos comentados específicos das novas diretrizes, preservando o dataset integral sem alterar gabaritos.

---

## 10. Centralização dos Motores de Estudo
- **`FLASHCARD_REVIEW_ENGINE_COUNT = 1`** (Centralizado em [`SpacedRepetitionService.ts`](src/services/spacedRepetitionService.ts) e [`SpacedReviewView.tsx`](src/components/review/SpacedReviewView.tsx)).
- **`QUESTION_RESOLUTION_ENGINE_COUNT = 1`** (Centralizado em [`SessionBuilderService.ts`](src/services/sessionBuilderService.ts) e `praticar-questoes`).

---

## 11. Caderno de Erros (`ErrorNotebookView.tsx`)
- Preservado integralmente: consome `attempts.filter(!isCorrect)`, suporta reflexão cognitiva pessoal do aluno e despacha retreinos de erros através do motor central de sessões (`SessionBuilderService.saveActiveSession` $\to$ `praticar-questoes`).

---

## 12. Integridade de Rotas
- **`ROUTES_REMOVED = 0`**: Todas as rotas canônicas e aliases legados (`/revisar`, `/revisar/flashcards`, `/revisar/erros`, `/revisar/atualizacoes`, `/revisar/radar`, `/revisar/audio`, `review`, `errors`, `guidelines`, `radar`, `flash-audio`) continuam 100% funcionais.

---

## 13. Experiência Mobile & Responsividade
- A eliminação do menu horizontal redundante em `RevisarView.tsx` removeu o scroll horizontal duplicado em telas mobile (390px), garantindo foco visual imediato no conteúdo da sub-aba ativa.

---

## 14. Arquivos Modificados e Criados
1. [`src/components/revisar/RevisarView.tsx`](src/components/revisar/RevisarView.tsx) — Remoção da barra de 5 abas redundantes e transformação em router limpo.
2. [`src/__tests__/reviewNavigationReorganization.test.tsx`](src/__tests__/reviewNavigationReorganization.test.tsx) — [NEW] Teste automatizado cobrindo a ausência de abas duplicadas, os 3 itens canônicos da Sidebar e a integridade das rotas.

---

## 15. Funcionalidades Removidas
- **Funcionalidades Removidas:** 0
- **Rotas Removidas:** 0
- **Impacto em Firestore / PPS / FSRS:** 0 alterações

---

## 16. Sanity Check ts-fsrs (Confirmação Direta no Código)
- **`TS_FSRS_INSTALLED_VERSION` = `5.4.2`** (Confirmado em `package.json` line 31 `"ts-fsrs": "^5.4.2"` e `package-lock.json` node_modules version `5.4.2`).
- **`FSRS_ALGORITHM_CHANGED` = `NO`** (Algoritmo e parâmetros `request_retention = 0.9` preservados sem nenhuma alteração).

---

## 17. Sanity Check de Persistência dos Flashcards
- **`FLASHCARD_LOCAL_STORAGE`** = `praxis_flashcards_v2` (com backup de segurança `praxis_flashcards_v1_backup`).
- **`FLASHCARD_FIRESTORE_SYNC`** = Estatísticas de flashcards sincronizadas em `/progress/progress_{userId}` e autopsias em `/errors`.
- **`FLASHCARD_SYNC_DIRECTION`** = Local-first reativo com estado em `AppContext`, gravação síncrona em `localStorage` e sincronização de progresso no Firestore em eventos de treino.
- **`FLASHCARD_AUTHORITATIVE_SOURCE`** = `localStorage (praxis_flashcards_v2)` como store local primário com fallback em memória.

---

## 18. Validação da Suíte de Testes (npm test)
- **Testes Antes:** 247/247 PASS (33 arquivos)
- **Testes Depois:** 252/252 PASS (34 arquivos de teste)

---

## 19. Erros de Console
- **Erros no Console:** 0

---

## Resumo Obrigatório

```
============================================================
RESUMO DA REORGANIZAÇÃO DO MÓDULO REVISAR (ETAPA 1.20B):
============================================================
REVISAR_SIDEBAR_ITEMS                        = 3
REVIEW_INTERNAL_NAVIGATION                   = 5 → 0

GUIDELINE_WATCH_PRIMARY_STUDENT_NAV          = NO
GUIDELINE_WATCH_ADMIN_AUTH_GUARD             = NO (Client-only route)

FLASH_AUDIO_PRIMARY_STUDENT_NAV              = NO
FLASH_AUDIO_FUNCTIONALITY_PRESERVED          = YES

FLASHCARD_EMBED_TYPE                         = PREVIEW
UPDATE_QUESTION_EMBED_TYPE                   = PREVIEW

FLASHCARD_REVIEW_ENGINE_COUNT                = 1
QUESTION_RESOLUTION_ENGINE_COUNT             = 1

TS_FSRS_INSTALLED_VERSION                    = 5.4.2

FLASHCARD_LOCAL_STORAGE                      = praxis_flashcards_v2
FLASHCARD_FIRESTORE_SYNC                     = /users/{userId}/progress + /errors
FLASHCARD_SYNC_DIRECTION                     = Local-first with optimistic React state & Firestore progress sync
FLASHCARD_AUTHORITATIVE_SOURCE               = LocalStorage (praxis_flashcards_v2) / AppContext memory store

FSRS_ALGORITHM_CHANGED                       = NO

ROUTES_REMOVED                               = 0
FUNCTIONALITY_REMOVED                        = 0

FIRESTORE_SCHEMA_CHANGES                     = 0
PPS_CHANGES                                  = 0

NPM_TEST_SUITE                               = 252/252 PASS (34 arquivos de teste)
CONSOLE_ERRORS                               = 0
============================================================
CLASSIFICAÇÃO FINAL:
REVIEW_NAVIGATION_REORGANIZED
============================================================
```
