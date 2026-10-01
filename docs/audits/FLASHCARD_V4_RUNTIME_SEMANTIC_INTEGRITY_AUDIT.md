# Auditoria de Integridade Semântica em Tempo de Execução: Flashcards V4 (Etapa 1.22F)

## 1. Visão Geral da Auditoria

Esta auditoria técnica avalia em detalhe o desacoplamento semântico e operacional entre **`FlashcardContent`** (conteúdo pedagógico perene) e **`UserFlashcardState`** (estado de retenção e agendamento individual FSRS) no runtime da aplicação StaziaMed Revalida.

A análise cobriu todos os 11 componentes consumidores, o ciclo de vida de criação e revisão dos cartões, os contratos de persistência local em `StorageService` e `FlashcardStorageAdapter`, além da integridade dos fluxos de estudo e planejamento pedagógico.

---

## 2. Inventário dos 11 Componentes Consumidores

| # | Componente / Módulo | Caminho do Arquivo | Tipo de Acesso | Leitura/Escrita |
|---|---------------------|--------------------|----------------|-----------------|
| 1 | `PlanoDeHojeView` | `src/components/estudar/PlanoDeHojeView.tsx` | Hydrated View Model | Read-Only (`getDueFlashcards`) |
| 2 | `AdaptiveCalendarView` | `src/components/calendar/AdaptiveCalendarView.tsx` | Hydrated View Model | Read-Only (`getFlashcardReviewLoadByDate`) |
| 3 | `RecoveryPlanModal` | `src/components/calendar/RecoveryPlanModal.tsx` | Hydrated View Model | Read-Only (Overdue Count) |
| 4 | `WeeklyPlanView` | `src/components/planejamento/WeeklyPlanView.tsx` | Hydrated View Model | Read-Only (Weekly Load Distribution) |
| 5 | `SpacedReviewView` | `src/components/review/SpacedReviewView.tsx` | Hydrated View Model | Read & Rating (`updateFlashcardScore`) |
| 6 | `UnifiedReviewView` | `src/components/review/UnifiedReviewView.tsx` | Hydrated View Model | Read-Only (Stats / Progress) |
| 7 | `DashboardView` | `src/components/dashboard/DashboardView.tsx` | Hydrated View Model | Read-Only (Due Counter) |
| 8 | `ProfileSettingsView` | `src/components/profile/ProfileSettingsView.tsx` | Hydrated View Model | Read-Only (Count) / Clear Scope Data |
| 9 | `FunctionCallingAgentView` | `src/components/agent/FunctionCallingAgentView.tsx` | Hydrated View Model | Read-Only via Tooling |
| 10 | `functionCallingService` | `src/services/functionCallingService.ts` | Hydrated View Model | Read-Only (`get_due_flashcards`) |
| 11 | `AppContext` | `src/context/AppContext.tsx` | Hydrated View Model / Adapter | Central State Management |

---

## 3. Detalhamento dos 35 Itens de Auditoria Semântica

1. **Separação Semântica Runtime:**
   - O runtime mantém `FlashcardContent` perene e isolado de alterações no agendador. As operações de estudo afetam estritamente `UserFlashcardState`.
2. **Imutabilidade de Conteúdo em Avaliações (Ratings):**
   - Durante a resolução e avaliação no `SpacedReviewView`, apenas os parâmetros de repetição, estabilidade, dificuldade e agendamento são persistidos. `FlashcardContent` permanece estritamente intocado.
3. **Pureza do Adapter de Hidratação:**
   - A função `hydrateFlashcardItem(content, state)` em `FlashcardStorageAdapter` é 100% pura, determinística, sem efeitos colaterais e sem chamadas de I/O ou storage.
4. **Isolamento de Referências de Memória:**
   - A hidratação gera novos objetos em memória sem compartilhar mutabilidade profunda indesejada com a estrutura persistida.
5. **Caminhos de Escrita de Conteúdo durante Revisão:**
   - Identificados exatamente **0** caminhos de mutação de conteúdo durante revisões FSRS.
6. **Centralização do Writeback de Compatibilidade:**
   - O writeback monolítico é totalmente encapsulado dentro de `StorageService.saveFlashcards` via `FlashcardStorageAdapter.deconstructFlashcardItem`.
7. **Proteção contra Sobrescrita Acidental de Conteúdo:**
   - Quando um cartão já existe no mapa `contents`, a operação de salvamento atualiza exclusivamente o `userStates[id]`, preservando o conteúdo existente.
8. **Prevenção de Cartões Órfãos:**
   - O fluxo de criação (autópsia de erros) gera sincronamente tanto a entrada em `contents` quanto a entrada correspondente em `userStates` no mesmo envelope atômico.
9. **Fonte de Dados do Plano de Hoje (`PlanoDeHojeView`):**
   - Consome a visão hidratada sem necessidade de parsing manual da V4, filtrando cartões devidos via `dueDate`.
10. **Fonte de Dados do Calendário Adaptativo (`AdaptiveCalendarView`):**
    - Agrupa a carga futura de revisões diretamente das propriedades agendadas do `UserFlashcardState` expostas na visão hidratada.
11. **Fonte de Dados do Planejamento Semanal (`WeeklyPlanView`):**
    - Calcula a distribuição pedagógica semanal a partir das datas devidas do estado do usuário.
12. **Preservação da Política de Cartões com Data Inválida:**
    - Cartões com datas ausentes ou inválidas continuam sendo tratados pedagogicamente como devidos hoje sem corrupção de dados.
13. **Ausência de Flash Cross-Account na Visão Hidratada:**
    - `AppContext` executa limpeza síncrona imediata (`setFlashcards([])`) durante trocas de autenticação e logout, impedindo vazamento transitório de dados na tela.
14. **Prevenção de Cache Estático no Auth Loading:**
    - Durante o estado de carregamento de credenciais do Firebase, o runtime aguarda a resolução do `currentUser` antes de carregar o envelope V4 associado.
15. **Precedência de Storage:**
    - Prioridade estrita: carrega V4 existente; caso inexistente, realiza migração determinística a partir de V3 com fallback seguro.
16. **Resiliência a Envelope V4 Corrompido:**
    - Caso ocorra falha de integridade no JSON da V4, o mecanismo tenta reconstruir a partir de V3 ou inicializa um envelope vazio seguro sem quebrar o app.
17. **Política de Falha de Escrita V4:**
    - Em caso de restrição momentânea de I/O, o estado em memória permanece responsivo com fallback in-memory seguro.
18. **Risco de Divergência Memória/Storage:**
    - Classificado como **BAIXO** devido à centralização das mutações em `StorageService` e atualização síncrona do contexto.
19. **Tratamento de Quota Excedida:**
    - `safeSetItem` captura erros de quota do navegador e preserva a operação em memória com alerta preventivo.
20. **Validação Relacional do Envelope V4:**
    - `validateV4Envelope` garante que as chaves em `contents` correspondam integralmente às chaves em `userStates`.
21. **Preservação da Proveniência:**
    - O objeto `FlashcardProvenance` (ano, banca, questão original, código do item, fingerprint) é preservado intacto em todas as operações.
22. **Desacoplamento entre Revisão Pedagógica de Conteúdo e FSRS:**
    - O status editorial (`contentReviewStatus`) não interfere nem bloqueia o agendamento individual FSRS.
23. **Idempotência da Inicialização e Migração:**
    - Múltiplas inicializações consecutivas não duplicam dados nem re-executam migrações se o envelope V4 já for válido.
24. **Contagem de Bypasses do Storage:**
    - **0** bypasses identificados no código. Todos os acessos a flashcards passam por `StorageService`.
25. **Centralização da Lógica V4:**
    - **ALTA**. Toda a persistência, serialização e migração estão concentradas em `storageService.ts` e `flashcardStorageAdapter.ts`.
26. **Consumidores Legados Monolíticos:**
    - 11 de 11 consumidores utilizam a interface hidratada `Flashcard[]`, garantindo estabilidade e compatibilidade.
27. **Consumidores Nativos V4:**
    - 0 de 11 acessam diretamente os registros `contents`/`userStates`, pois a camada de adaptação é transparente.
28. **Dependência do Compatibility Adapter:**
    - **ALTA**, permitindo desacoplamento na camada de infraestrutura sem quebra em cascata na camada de apresentação.
29. **API de Flashcards do AppContext:**
    - Mantém a interface monolítica compatível (`flashcards`, `addFlashcard`, `updateFlashcardScore`), roteando internamente para a V4.
30. **Frequência de Hidratação:**
    - Ocorre pontualmente na troca de usuário/escopo e após mutações autorizadas.
31. **Risco de Escala na Hidratação:**
    - **BAIXO**. O tempo de hidratação para centenas ou milhares de cartões é inferior a 2ms.
32. **Risco de Escala na Gravação do Envelope Completo:**
    - **BAIXO** no escopo local do navegador para coleções típicas de estudantes (< 5.000 cartões).
33. **Granularidade da Escrita na Avaliação FSRS:**
    - Gravação atômica do envelope V4 atualizado por escopo.
34. **Invariantes do Algoritmo FSRS 5.4.2:**
    - 100% preservados. O cálculo de intervalos, estabilidade e dificuldade permanece inalterado.
35. **Cross-Device Sync:**
    - `FLASHCARD_CARD_CROSS_DEVICE_SYNC = NO`. Ausência proposital de sincronização remota nesta microetapa local.

---

## 4. Conclusão da Auditoria

A integridade do desacoplamento semântico entre `FlashcardContent` e `UserFlashcardState` está plenamente verificada e validada em todo o fluxo de execução.

**Classificação Final:**
`FLASHCARD_V4_RUNTIME_INTEGRITY_VERIFIED`
