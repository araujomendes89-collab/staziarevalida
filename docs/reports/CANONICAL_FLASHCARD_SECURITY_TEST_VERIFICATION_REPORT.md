# Relatório Técnico: Verificação de Segurança e Contabilidade de Testes do Catálogo Canônico (Etapa 1.22J)

## 1. Visão Geral da Verificação

Nesta etapa, realizamos uma auditoria minuciosa, factual e matemática sobre a suíte de testes do projeto e as regras de segurança do **Catálogo Canônico de Flashcards StaziaMed** no Cloud Firestore.

---

## 2. Contabilidade Factual da Suíte de Testes da Aplicação

### 2.1 Reconciliação Matemática
- **Arquivos de Teste Anteriores (antes da 1.22I):** `39` arquivos.
- **Casos de Teste Anteriores (antes da 1.22I):** `300` casos de teste.
- **Arquivo de Teste Adicionado na 1.22I:** `src/__tests__/canonicalFlashcardCatalog.test.ts` (`1` novo arquivo).
- **Casos de Teste Adicionados em 1.22I:**
  - Bloco 1 (`Canonical Flashcard Validator & Parser`): **8** testes.
  - Bloco 2 (`CanonicalFlashcardCatalogService (Firestore Reader)`): **7** testes.
  - **Total de novos casos de teste:** **15** casos de teste.
- **Casos de Teste Removidos:** **0** (nenhum teste removido, skipado ou comentado).
- **Arquivos de Teste Atuais:** **40** arquivos.
- **Total de Casos de Teste Atuais:** **315** casos de teste ($300 + 15 = 315$).

### 2.2 Auditoria de Diff Git
- `TESTS_SILENTLY_REMOVED = NO`
- `TESTS_SKIPPED = 0`
- `TESTS_DISABLED = 0`

---

## 3. Auditoria de Segurança das Regras do Firestore (`firestore.rules`)

### 3.1 Regras Aplicadas
```firestore
// -------------------------------------------------------------
// CATÁLOGO CANÔNICO DE FLASHCARDS (Leitura PUBLISHED / Escrita Restrita a Servidor Confiável)
// -------------------------------------------------------------
match /flashcardContents/{contentId} {
  allow read: if resource.data.publicationStatus == 'PUBLISHED';
  allow write: if false; // Escrita direta pelo cliente é estritamente proibida (publicação futura via trusted backend / Admin SDK)

  match /versions/{versionId} {
    allow read, write: if false; // Histórico de versões é interno/backoffice
  }

  match /audit/{auditId} {
    allow read, write: if false; // Trilha de auditoria é interna
  }
}
```

### 3.2 Matriz de Comportamento de Leitura e Queries
1. **`STUDENT_GET_PUBLISHED = ALLOW`:** O documento individual com `publicationStatus == 'PUBLISHED'` é liberado para leitura.
2. **`STUDENT_GET_DRAFT = DENY`:** Documentos em `DRAFT` falham na cláusula `resource.data.publicationStatus == 'PUBLISHED'` e são bloqueados.
3. **`STUDENT_GET_READY = DENY`:** Bloqueado (status pré-publicação).
4. **`STUDENT_GET_SUPERSEDED = DENY`:** Bloqueado para o catálogo ativo.
5. **`STUDENT_GET_ARCHIVED = DENY`:** Bloqueado (conteúdo descontinuado).
6. **`UNFILTERED_CATALOG_QUERY = DENY`:** Como o Firestore avalia a query em sua totalidade antes de executá-la, uma query sem o filtro `where("publicationStatus", "==", "PUBLISHED")` tentaria ler potenciais drafts e é rejeitada pelo motor com `PERMISSION_DENIED`.
7. **`PUBLISHED_STATUS_FILTERED_QUERY = ALLOW`:** Query contendo `where("publicationStatus", "==", "PUBLISHED")` satisfaz a regra e é autorizada.
8. **`TOPIC_QUERY_WITH_PUBLISHED_FILTER = ALLOW`:** Consulta combinando `publicationStatus == 'PUBLISHED'` e `canonicalTopicId == validTopic` é autorizada.
9. **`TOPIC_QUERY_WITHOUT_PUBLISHED_FILTER = DENY`:** Consulta apenas por tópico sem o filtro explícito de `PUBLISHED` é rejeitada por segurança.

### 3.3 Matriz de Comportamento de Escrita e Proteção do Cliente Admin
- **`STUDENT_GLOBAL_CREATE = DENY`:** Bloqueado por `allow write: if false;`.
- **`STUDENT_GLOBAL_UPDATE = DENY`:** Bloqueado por `allow write: if false;`.
- **`STUDENT_GLOBAL_DELETE = DENY`:** Bloqueado por `allow write: if false;`.
- **`ADMIN_CLIENT_CREATE = DENY` / `UPDATE = DENY` / `DELETE = DENY`:** Bloqueado para qualquer cliente frontend, inclusive usuários com papel `ADMIN` local. Todas as operações de publicação em produção devem ocorrer exclusivamente via Cloud Functions ou Admin SDK em ambiente de backend confiável.

### 3.4 Subcoleções e Acesso Anônimo/Guest
- **`STUDENT_READ_VERSION_HISTORY = DENY` / `WRITE = DENY`:** Bloqueado explicitamente em `/versions/{versionId}`.
- **`UNKNOWN_SUBCOLLECTION_STUDENT_ACCESS = DENY`:** O Firestore não propaga regras para subcoleções sem declaração expressa, aplicando negação padrão (*default deny*).
- **`UNAUTHENTICATED_READ_PUBLISHED = ALLOW`:** Compatível com as demais coleções de conteúdo público médico da plataforma (`questions`, `guidelines`, `editions`).
- **`GUEST_AUTH_SECURITY_MODEL`:** No modo visitante do aplicativo, o estudante consome o catálogo público sem permissão de escrita e gerencia seu progresso local em `praxis_flashcards_v4:guest:${guestId}`.

---

## 4. Proteção da Camada de Serviço e Validação da Aplicação

- **`CATALOG_LIST_QUERY_STATUS_GUARD = CENTRALIZED`:** O `CanonicalFlashcardCatalogService` anexa obrigatoriamente a cláusula `where("publicationStatus", "==", "PUBLISHED")` em todas as suas consultas de listagem (`getPublishedFlashcardsByTopic`, `getPublishedFlashcardsByArea`, `getPublishedFlashcards`).
- **`getPublishedFlashcardById`:** Além da proteção do Firestore, valida explicitamente `data.publicationStatus === "PUBLISHED"` antes de repassar o objeto ao parser da aplicação.
- **`DIRECT_FIRESTORE_ACCESS_IN_COMPONENTS = NO`:** Nenhum componente da UI acessa coleções do Firestore diretamente.

---

## 5. Limite de Imutabilidade das Versões

- **`PUBLISHED_VERSION_IMMUTABILITY_ENFORCEMENT_NOW = CLIENT_RULES_DENY_WRITES`:** No momento atual, a imutabilidade é garantida na camada de rede/cliente pelo bloqueio total de escritas (`allow write: if false;`).
- **`PUBLISHED_VERSION_IMMUTABILITY_FUTURE_BACKEND_INVARIANT_REQUIRED = YES`:** Como o Admin SDK e Cloud Functions operam com privilégios que ignoram as Security Rules, a imutabilidade das versões publicadas exigirá validações transacionais estritas no código do backend durante as etapas de publicação.

---

## 6. Não-Regressão e Integridade Local

- **`LOCAL_V4_CHANGED = NO`:** O envelope `praxis_flashcards_v4` permanece 100% isolado e inalterado.
- **`FSRS_CHANGED = NO`:** O algoritmo de agendamento FSRS v5.4.2 não sofreu nenhuma modificação.
- **`CONSOLE_ERRORS = 0`:** Zero erros detectados no console da aplicação.

---

## 7. Conclusão da Verificação

A auditoria de contabilidade de testes e a análise de segurança das regras do Firestore confirmam a conformidade e solidez de toda a infraestrutura implementada.

**Classificação:** `CANONICAL_CATALOG_SECURITY_VERIFICATION_READY`.
