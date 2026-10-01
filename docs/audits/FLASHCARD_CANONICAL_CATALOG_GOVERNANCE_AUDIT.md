# Relatório de Design e Auditoria: Catálogo Canônico de Flashcards & Governança Editorial (Etapa 1.22G)

## 1. Visão Geral e Contexto Arquitetural

Com o sucesso da separação local V4 entre `FlashcardContent` e `UserFlashcardState`, a plataforma StaziaMed Revalida alcançou o desacoplamento fundamental de armazenamento e ciclo de vida. Contudo, para transformar a biblioteca de flashcards em um ativo educacional escalável, auditável e compartilhável globalmente, é indispensável definir a governança do **Catálogo Canônico StaziaMed** e o contrato de transição entre cartões privados do estudante e conteúdo institucional homologado.

Esta auditoria estabelece as diretrizes conceituais e arquiteturais para publicação, versionamento, integridade clínica e governança editorial.

---

## 2. Conteúdo Canônico vs. Conteúdo Pessoal do Usuário

A arquitetura futura divide o ecossistema em duas classes estritas:

1. **`STAZIAMED_CANONICAL_CONTENT`**:
   - Conteúdo de referência, produzido, revisado clinicamente e publicado pela curadoria da StaziaMed.
   - Perene, compartilhado entre todos os alunos, indexado na taxonomia canônica (75 Grandes Temas) e amparado por diretrizes médicas vigentes (PCDT, Manuais MS, Consensos).
2. **`USER_PRIVATE_CONTENT`**:
   - Conteúdo gerado individualmente pelo aluno (cartões de autópsia de erro derivados de resolução de questões ou anotações pessoais).
   - Vive exclusivamente no escopo local do usuário (`praxis_flashcards_v4`) e não é visível para outros estudantes nem publicado automaticamente no catálogo global.

---

## 3. Escopo dos Cartões Derivados de Questões (Question-Derived Cards)

- **Classificação Atual:** `CURRENT_QUESTION_DERIVED_CARD_SCOPE = USER_LOCAL`.
- **Justificativa:** Quando um estudante erra uma questão no simulado e gera um flashcard na autópsia de erro, esse cartão atende à necessidade imediata de remediação ativa daquele usuário. Ele **NÃO** deve ser promovido automaticamente a item de catálogo global, pois pode conter idiossincrasias do prompt, redundantemente cobrir tópicos já mapeados ou carecer de refinamento atômico de *Active Recall*.

---

## 4. Pipeline de Governança: Candidate vs. Published

Nenhum conteúdo gerado por inteligência artificial ou extração automatizada pode ingressar diretamente no catálogo publicado. O fluxo editorial obrigatório é:

```
[ Geração / Extração / Autópsia ]
               │
               ▼
       [ UNREVIEWED ]
               │ (Validação técnica/schema automatizada)
               ▼
      [ AUTO_VALIDATED ] ─── (NÃO É VALIDAÇÃO MÉDICA)
               │
               ▼ (Revisão médica humana por especialista)
     [ MEDICAL_REVIEWED ]
               │
               ▼ (Revisão pedagógica/editorial de formato e taxonomia)
    [ READY_FOR_PUBLICATION ]
               │ (Aprovação de publicação por Admin/Publisher)
               ▼
         [ PUBLISHED ]
          │         │
(Diretriz alterada) (Tópico descontinuado)
          │         │
          ▼         ▼
    [ SUPERSEDED ] [ ARCHIVED ]
```

---

## 5. Fonte de Autoridade (Source of Truth)

- **Futura Fonte Canônica:** `FUTURE_CANONICAL_CONTENT_SOURCE_OF_TRUTH = STAZIAMED_CURATED_CATALOG` (Repositório global gerenciado pelo backend/Firestore, ex: `/flashcardContents/{contentId}`).
- **Armazenamento do Estudante:** O cliente local ou a subcoleção do usuário (`/users/{uid}/flashcardStates/{contentId}`) armazena **apenas** o progresso individual FSRS (`UserFlashcardState`), consumindo o conteúdo canônico de forma referencial.

---

## 6. Estratégia de Identidade de Conteúdo (`contentId`)

Comparativo de modelos:
1. **Server-Assigned Immutable ID (UUID v4 / KSUID):**
   - *Vantagens:* Imutabilidade garantida, ausência de colisões, desacoplamento total da semântica do texto.
   - *Riscos:* Dificuldade de lookup determinístico sem índice secundário.
2. **Deterministic Source-Derived ID (`sourceQuestionId`):**
   - *Vantagens:* Fácil mapeamento $1:1$ com questões.
   - *Riscos:* Inviável quando uma questão gera múltiplos cartões ou quando o cartão provém de diretriz sem questão associada.
3. **Hybrid Strategy (Recomendada):**
   - **Chave Primária:** `contentId` imutável atribuído pelo servidor (ex: `c_fc_9a8b7c6d...`).
   - **Índice Determinístico Secundário:** `sourceIdentityKey = hash(sourceDocumentId + cardPurpose + canonicalTopicId)`.

**Recomendação:** `CANONICAL_CONTENT_ID_STRATEGY = HYBRID`.

---

## 7. Desacoplamento entre Fonte e Cartão (`SOURCE_ID_ALONE_SUFFICIENT = NO`)

Uma única questão clínica oficial (ex: Revalida INEP 2024/1 Q15 — Pré-eclâmpsia grave) pode e deve gerar múltiplos cartões atômicos focados em objetivos cognitivos distintos:
- Cartão 1: Critérios diagnósticos de gravidade.
- Cartão 2: Esquema de sulfatação de Pritchard/Zuspan (dose de ataque e manutenção).
- Cartão 3: Anti-hipertensivo de escolha na crise hipertensiva aguda (Hidralazina / Nifedipino).
- Cartão 4: Via e momento do parto.

Portanto, `sourceQuestionId` sozinho **nunca** é suficiente como identificador de cartão.

---

## 8. Conceito de Objetivo / Propósito do Cartão (`cardPurpose`)

Recomenda-se formalizar o conceito de `cardPurpose` / `learningObjective`:
- `DIAGNOSIS`
- `CLINICAL_CONDUCT`
- `DIAGNOSTIC_WORKUP`
- `TREATMENT`
- `CONTRAINDICATION`
- `RED_FLAG`
- `EPIDEMIOLOGY_PREVENTION`
- `MNEMONIC`

---

## 9. Papel do Content Fingerprint

O `contentFingerprint` (`fc_fp_v1_<hash>`):
- **Permanece como:** Mecanismo de busca de duplicatas potenciais (*candidate duplicate detection*) e auxílio de migração/relink local.
- **NÃO é:** Chave primária canônica nem identificador autoritativo global.

---

## 10. Proveniência Mínima Obrigatória para Publicação Canônica

Todo flashcard publicado no catálogo canônico deve conter obrigatoriamente:
1. `origin`: (`OFFICIAL_EXAM`, `PCDT_GUIDELINE`, `SOCIETY_CONSENSUS`, `EDITORIAL_CURATED`).
2. `canonicalTopicId`: Código de 1 a 75 da taxonomia StaziaMed.
3. `area`: Uma das 5 grandes áreas médicas do Revalida.
4. `assessmentSource` (se derivado de exame): Ano, banca, edição, código do item, número original.
5. `medicalSource`: Documento clínico primário que sustenta a conduta (PCDT, Diretriz SBC/Febrasgo/SBP, Manual MS, ano de publicação).
6. `contentVersion`: Versão semântica do cartão.
7. `primarySourceUrl` / `guidelineReference`: Localização do documento de suporte.

---

## 11. Distinção entre Proveniência do Exame e Evidência Médica

- **`assessmentSource` (De onde veio o estímulo):** Identifica a questão da prova em que o tema foi cobrado (ex: INEP 2024/2 Q42).
- **`medicalSource` (O que sustenta a conduta científica):** O protocolo oficial que valida a resposta (ex: PCDT Dengue MS 2024).

**Decisão:** `ASSESSMENT_AND_MEDICAL_PROVENANCE_SPLIT = YES`.

---

## 12. Vínculo Obrigatório com a Taxonomia Canônica

- **Requisito:** `CANONICAL_TOPIC_REQUIRED_FOR_PUBLICATION = YES`.
- Para publicação oficial StaziaMed, o cartão deve obrigatoriamente pertencer a um dos 75 Grandes Temas canônicos.
- Cartões privados do aluno podem conter tópicos customizados ou preliminares, mas nunca são promovidos ao catálogo sem homologação taxonômica.

---

## 13. Auditoria Semântica dos Status de Revisão e Publicação

### Problema do Enum Atual
Hoje existe uma sobreposição de conceitos em `contentReviewStatus` (`UNREVIEWED | AUTO_VALIDATED | MEDICAL_REVIEWED | APPROVED`).
- `APPROVED` gera ambiguidade: foi aprovado clinicamente pelo médico ou aprovado para publicação pelo editor-chefe?

### Arquitetura Futura Recomendada
Desacoplar em dois enums ortogonais:

```typescript
// 1. Rigor e validação do conteúdo clínico
export type ContentReviewStatus = 
  | 'UNREVIEWED'          // Conteúdo bruto recém-extraído
  | 'AUTO_VALIDATED'      // Validado por linters/schemas sintáticos (NÃO médico)
  | 'MEDICAL_REVIEWED';   // Homologado por médico especialista

// 2. Ciclo de vida editorial de publicação
export type ContentPublicationStatus = 
  | 'DRAFT'               // Rascunho interno
  | 'READY'               // Homologado, aguardando publicação
  | 'PUBLISHED'           // Ativo no catálogo global
  | 'SUPERSEDED'          // Substituído por nova versão clínica
  | 'ARCHIVED';           // Descontinuado
```

- **Política para `APPROVED` Legado:** Depreciar gradualmente, mapeando-o internamente para `reviewStatus: MEDICAL_REVIEWED` + `publicationStatus: PUBLISHED`.

---

## 14. Versionamento de Conteúdo e Impacto na Memória do Estudante (FSRS)

### Classificação de Mudanças
1. **`NON_SEMANTIC` (Correção de digitação, pontuação, formatação):**
   - Não altera a verdade médica.
   - Não altera `contentVersion`. Não altera FSRS do usuário.
2. **`MINOR_SEMANTIC` (Esclarecimento de redação, adição de mnemônico):**
   - Incremento menor de versão. Não reseta FSRS.
3. **`MAJOR_SEMANTIC` (Mudança de conduta médica, nova droga de escolha, alteração de diretriz):**
   - Incremento de `contentVersion` (ex: $v1 \to v2$).
   - **Impacto no Aluno:** O estudante não pode continuar com estabilidade de 8 meses para uma conduta que se tornou errada.

### Estratégia de Rerevisão Obrigatória (`contentVersionSeen`)
- No `UserFlashcardState`, adiciona-se o campo `contentVersionSeen: number`.
- Quando `canonicalContent.contentVersion > userState.contentVersionSeen`:
  - O sistema sinaliza **`requiresUserRereview = true`**.
  - O cartão é reagendado com prioridade para revisão ativa imediata no Plano de Hoje, exibindo alerta visual de atualização de conduta ("Antes $\times$ Agora").
  - A estabilidade ($S$) sofre ajuste adaptativo para consolidação da nova diretriz.

---

## 15. Tratamento de Conteúdo Desatualizado (`SUPERSEDED`)

- Quando um protocolo clínico é reformulado, o cartão antigo é marcado como `publicationStatus: 'SUPERSEDED'` e aponta para `replacementContentId`.
- Alunos novos nunca recebem cartões `SUPERSEDED`.
- Alunos que já estudaram o cartão histórico recebem o card substituto com o contexto da transição clínica.

---

## 16. Portões de Qualidade (Quality Gates) para Publicação Canônica

Critérios mínimos para aprovação:
1. **Atomicidade:** 1 única pergunta e 1 única conduta/conceito por cartão.
2. **Active Recall Estrito:** Pergunta no *front* sem dar pistas óbvias da resposta (*no answer leakage*).
3. **Acurácia Clínica e Atualidade:** Em conformidade com as diretrizes mais recentes.
4. **Fonte Verificável:** Link ou citação de documento oficial primário.
5. **Taxonomia Padronizada:** `canonicalTopicId` (1 a 75) e `area` preenchidos.
6. **Zero Auto-Publishing de IA:** Conteúdo gerado por IA **exige 100% de revisão humana**.

---

## 17. Deduplicação e Fusão de Conteúdo

- `DUPLICATE_AUTO_MERGE_ALLOWED = NO`.
- O `contentFingerprint` sinaliza suspeita de duplicata no painel editorial.
- A decisão de unificar ou manter cartões distintos com propósitos educacionais diferentes cabe exclusivamente à curadoria humana.

---

## 18. Modelo Conceitual do Firestore Futuro

```
/flashcardContents/{contentId} (Global Canonical Catalog - Read by All, Written by Curators)
   ├── contentId: string (PK)
   ├── front: string
   ├── back: string
   ├── keyMnemonic: string
   ├── area: ClinicalArea
   ├── canonicalTopicId: number (1-75)
   ├── cardPurpose: CardPurpose
   ├── contentFingerprint: string
   ├── contentVersion: number
   ├── reviewStatus: ContentReviewStatus
   ├── publicationStatus: ContentPublicationStatus
   ├── provenance: FlashcardProvenance
   ├── medicalSource: MedicalSourceReference
   ├── assessmentSource?: AssessmentSourceReference
   ├── createdAt: Timestamp
   ├── updatedAt: Timestamp
   └── publishedAt?: Timestamp

/users/{uid}/flashcardStates/{contentId} (Per-User FSRS State)
   ├── contentId: string (FK -> /flashcardContents/{contentId})
   ├── contentVersionSeen: number
   ├── stability: number
   ├── difficulty: number
   ├── elapsedDays: number
   ├── scheduledDays: number
   ├── reps: number
   ├── lapses: number
   ├── state: State
   ├── lastReviewed: string
   ├── dueDate: string
   ├── requiresUserRereview: boolean
   └── updatedAt: Timestamp
```

---

## 19. Ordem Recomendada de Implementação Futura

1. **Etapa Atual (1.22G):** Auditoria e contrato de design (Concluída - Read Only).
2. **Etapa Futura A:** Criação da coleção canônica `/flashcardContents` e painel de curadoria médica.
3. **Etapa Futura B:** Migração do `UserFlashcardState` local para subcoleção remota vinculada a `contentId`.
4. **Etapa Futura C:** Sincronização Cross-Device do estado individual do estudante.

---

## 20. Conclusão da Auditoria

O modelo de catálogo canônico e governança editorial aqui desenhado estabelece a base conceitual sólida para a evolução do produto, garantindo que o StaziaMed Revalida ofereça cartões de máxima fidelidade clínica sem comprometer a autonomia e a segurança dos dados do estudante.

**Classificação:** `FLASHCARD_CANONICAL_CATALOG_GOVERNANCE_READY`.
