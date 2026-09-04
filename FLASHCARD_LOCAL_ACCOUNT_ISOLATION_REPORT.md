# Relatório Técnico: Isolamento Local de Flashcards por Conta de Usuário (Etapa 1.22B)

## 1. Contexto e Diagnóstico Inicial

Na auditoria arquitetural realizada na Etapa 1.22A, identificou-se que os Flashcards e os parâmetros do algoritmo FSRS eram armazenados sob a chave global de `localStorage` denominada `praxis_flashcards_v2`. 

Isso gerava uma vulnerabilidade crítica de privacidade e integridade pedagógica em dispositivos compartilhados:
- Se o **Usuário A** realizava revisões e deslogava, e subsequentemente o **Usuário B** fazia login no mesmo navegador, o Usuário B herdava imediatamente os flashcards, o histórico de repetições e a estabilidade FSRS do Usuário A.
- Sessões em Modo Visitante (Guest) mesclavam-se com sessões autenticadas sem barreira de isolamento.

---

## 2. Solução Implementada

### 2.1 Namespacing Local Seguro (`praxis_flashcards_v3`)
Foi implementada uma camada de isolamento estrito no `StorageService` e no `AppContext`:

- **Usuários Autenticados:**
  - Chave: `praxis_flashcards_v3:user:${firebaseUser.uid}`
- **Sessões Visitante (Guest Mode):**
  - Chave: `praxis_flashcards_v3:guest:${guestId}`
  - Gerador de `guestId` estável mantido em `praxis_guest_id_v1`.

### 2.2 Política Fail-Closed contra "Memory Flash"
- Durante a resolução inicial de autenticação (`isAuthLoading === true`), o estado em memória dos flashcards é imediatamente inicializado como vazio (`[]`).
- Ao executar `logout()`, a memória ativa de flashcards é purgada sincronicamente (`setFlashcards([])`), garantindo que nenhum cartão do usuário anterior permaneça visível antes de carregar o novo escopo.

### 2.3 Quarentena de Dados Legados (`praxis_flashcards_v2`)
- A chave legada `praxis_flashcards_v2` foi colocada em **quarentena estrita**.
- Ela **nunca** é vinculada ou migrada automaticamente para nenhuma conta ao fazer login.
- Caso existam cartões legados, uma notificação não intrusiva é exibida em `SpacedReviewView` permitindo que o usuário, mediante **consentimento explícito**, importe os cartões para a conta ativa (`importLegacyFlashcards`) ou descarte a notificação (`dismissLegacyFlashcards`).
- Um backup técnico `praxis_flashcards_v2_migrated_backup` é preservado no momento da importação.

### 2.4 Invariantes Arquiteturais Preservados
- **Zero alterações no Firestore Schema:** Nenhuma collection ou subcollection foi criada.
- **Cross-device sync não implementado:** `FLASHCARD_CARD_CROSS_DEVICE_SYNC = NO`.
- **FSRS Intacto:** O algoritmo FSRS v5.4.2 e seus cálculos de estabilidade, dificuldade e agendamento permanecem 100% inalterados.

---

## 3. Matriz de Testes e Validação

Foram criados testes automatizados cobrindo:
1. Geração correta e determinística de chaves com escopo (`getFlashcardStorageKey`).
2. Isolamento cruzado entre Usuário A e Usuário B (Cartões de A não são visíveis para B e vice-versa).
3. Isolamento entre Visitante e Usuário Autenticado.
4. Preservação de parâmetros FSRS após login, logout e relogin da mesma conta.
5. Quarentena de dados legados e fluxo de importação com consentimento explícito.
6. Integração segura com o Plano de Hoje, Calendário e Sessões de Repetição Espaçada.

**Resultado da suíte:** 283/283 testes PASS (0 falhas, 0 erros no console).

---

## 4. Classificação de Estado

```
ETAPA 1.22B — RESULTADO:
FLASHCARD_LOCAL_ACCOUNT_ISOLATION_SECURED
```
