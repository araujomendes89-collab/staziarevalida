# 📐 StaziaMed Revalida — Organograma e Arquitetura Completa do Sistema

Este documento descreve a arquitetura de ponta a ponta da plataforma **StaziaMed Revalida**, detalhando o fluxo de extração forense com IA, o modelo de dados no Firebase Firestore, as rotas e componentes do Frontend React/Vite.

---

## 🗺️ 1. Organograma Visual (Mermaid)

```mermaid
graph TB
    subgraph INGESTAO["1. Esteira de Extração Forense & Ingestão"]
        SSD[Portable SSD: PDFs Provas e Gabaritos] --> PyMuPDF[PyMuPDF: Extração de Texto, Gabarito e Filtro de Imagens]
        PyMuPDF --> ImgLocal[Imagens Médicas Reais: /public/images/ano_edicao/]
        PyMuPDF --> Subagentes[10 Subagentes de IA: MedicalExtractor em Paralelo]
        Subagentes --> JSONFull[JSON Consolidado: 100 Questões Estruturadas]
        JSONFull --> Uploader[Firebase Admin SDK: Batch Upload]
    end

    subgraph BACKEND["2. Núcleo de Dados (Cloud Firestore)"]
        Uploader --> FS_Q[(questions: REV-YYYY.E-QX)]
        FS_Q -.-> FS_QA[(question_attempts: Respostas & Tempo)]
        FS_Q -.-> FS_TS[(training_sessions: Simulados)]
        FS_Q -.-> FS_U[(users & profiles: Desempenho & PPS)]
    end

    subgraph FRONTEND["3. Aplicação Frontend (React + Vite)"]
        AppRoot[AppRoot / Auth Firebase] --> AppContext[AppContext: Estado Global & Sync]
        AppContext --> Sidebar[Navegação Lateral & Rotas]
        
        Sidebar --> V_Home[Início / Dashboard]
        Sidebar --> V_Estudar[Estudar: Plano de Hoje / Aulas / Grandes Temas / Materiais]
        Sidebar --> V_Praticar[Praticar]
        Sidebar --> V_Revisar[Revisar: Flashcards / Caderno de Erros / Radar / Áudio]
        Sidebar --> V_Plan[Planejamento: Calendário / Semanal / Até a Prova]
        Sidebar --> V_Desemp[Desempenho: Evolução / Matriz / Tendências]
        Sidebar --> V_Tutor[Tutor IA: Chat Clínico / Modo Trânsito]
        Sidebar --> V_OSCE[OSCE: Estações Práticas]
    end

    subgraph PRATICAR_MOD["4. Detalhamento do Módulo Praticar"]
        V_Praticar --> P_Questoes["/praticar/questoes (Caderno Avulso Personalizado)"]
        V_Praticar --> P_Simulados["/praticar/simulados (Central de Simulados 100 Qs · 5h)"]
        V_Praticar --> P_Provas["/praticar/provas-completas (Provas Oficiais & Impressão INEP)"]
        V_Praticar --> P_IA["/praticar/questoes-ia (Gerador de Questões Inéditas)"]
    end

    ImgLocal -.-> P_Provas
    ImgLocal -.-> P_Questoes
    FS_Q ==> AppContext
```

---

## 📊 2. Organograma Estrutural (Diagrama em Bloco)

```text
========================================================================================================================
                                       STAZIAMED REVALIDA — ORGANOGRAMA COMPLETO
========================================================================================================================

                                         ┌───────────────────────────────────┐
                                         │       PORTABLE SSD (ORIGEM)       │
                                         │  /Volumes/PortableSSD/Provas.../  │
                                         └─────────────────┬─────────────────┘
                                                           │
                                                           ▼
                                         ┌───────────────────────────────────┐
                                         │    ESTEIRA DE EXTRAÇÃO FORENSE    │
                                         │   (Antigravity Engine + Python)   │
                                         └─────────────────┬─────────────────┘
                                                           │
                        ┌──────────────────────────────────┴──────────────────────────────────┐
                        ▼                                                                     ▼
        ┌───────────────────────────────┐                                     ┌───────────────────────────────┐
        │        PyMuPDF (fitz)         │                                     │     10 SUBAGENTES DE IA       │
        │ ── Texto Bruto                │                                     │     (MedicalExtractor)        │
        │ ── Gabarito Decodificado      │                                     │ ── Resolução clínica e itens  │
        │ ── Filtro de Imagens Reais    │                                     │ ── Classificação por temas    │
        │    (Descarta logos/banners)   │                                     │ ── Justificativas A, B, C e D │
        └───────────────┬───────────────┘                                     └───────────────┬───────────────┘
                        │                                                                     │
                        ▼                                                                     ▼
        ┌───────────────────────────────┐                                     ┌───────────────────────────────┐
        │    IMAGENS CLÍNICAS (LOCAL)   │                                     │     JSON 100% ESTRUTURADO     │
        │   /public/images/{edicao}/    │                                     │      (merge_YYYY_E.json)      │
        └───────────────┬───────────────┘                                     └───────────────┬───────────────┘
                        │                                                                     │
                        │                       ┌─────────────────────────────────────────────┘
                        │                       ▼
                        │       ┌───────────────────────────────┐
                        │       │      FIREBASE ADMIN SDK       │
                        │       │   (Upload e Indexação Batch)  │
                        │       └───────────────┬───────────────┘
                        │                       │
                        ▼                       ▼
========================================================================================================================
                                            NÚCLEO DE BANCO DE DADOS (FIRESTORE)
========================================================================================================================
                                      ┌───────────────────────────────────┐
                                      │       staziamed-revalida-prod     │
                                      └─────────────────┬─────────────────┘
                                                        │
         ┌───────────────────────┬──────────────────────┼──────────────────────┬──────────────────────┐
         ▼                       ▼                      ▼                      ▼                      ▼
┌──────────────────┐    ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│   'questions'    │    │'question_attempts│   │'training_sessions│   │     'users'      │   │ 'flashcards' &   │
│ ── Provas INEP   │    │ ── Respostas     │   │ ── Simulados     │   │ ── Perfil        │   │ 'study_plans'    │
│ ── Qs Inéditas   │    │ ── Tempo gasto   │   │ ── Cronômetro    │   │ ── PPS Score     │   │ ── Cronogramas   │
│ ── Gabaritos/Imgs│    │ ── Acertos/Erros │   │ ── Estado atual  │   │ ── Assinatura    │   │ ── Repetição     │
└──────────────────┘    └──────────────────┘   └──────────────────┘   └──────────────────┘   └──────────────────┘
                                                        │
                                                        ▼
========================================================================================================================
                                            APLICAÇÃO FRONTEND (REACT + VITE)
========================================================================================================================
                                      ┌───────────────────────────────────┐
                                      │           AppRoot / Auth          │
                                      │   (Firebase Auth & Guest Mode)    │
                                      └─────────────────┬─────────────────┘
                                                        │
                                                        ▼
                                      ┌───────────────────────────────────┐
                                      │           AppContext.tsx          │
                                      │ (Estado Global + Sincronização)   │
                                      └─────────────────┬─────────────────┘
                                                        │
                                                        ▼
                                      ┌───────────────────────────────────┐
                                      │         Sidebar Navigation        │
                                      └─────────────────┬─────────────────┘
                                                        │
     ┌──────────────┬──────────────┬──────────────┬─────┴────────┬──────────────┬──────────────┬──────────────┐
     ▼              ▼              ▼              ▼              ▼              ▼              ▼              ▼
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  INÍCIO  │   │ ESTUDAR  │   │ PRATICAR │   │ REVISAR  │   │PLANEJAME.│   │DESEMPENHO│   │ TUTOR IA │   │   OSCE   │
└────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │              │              │              │              │              │
     │              ├─ Plano Hoje  ├─ Questões    ├─ Flashcards  ├─ Calendário  ├─ Geral       ├─ Conversar   └─ Estações
     │              ├─ Aulas       ├─ Simulados   ├─ Cad. Erros  ├─ Semanal     ├─ Evolução    ├─ Trânsito       Práticas
     │              ├─ Gdes Temas  ├─ Provas Comp.├─ Atualizações├─ Até a Prova ├─ Matriz      └─ Histórico
     │              └─ Materiais   └─ Questões IA ├─ Radar Diret.├─ Disponibil. ├─ Tendências
     │                                            └─ Flash-Áudio └─ Replanejam. └─ Áreas
     │
     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       DETALHAMENTO DO MÓDULO PRATICAR                                                │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. /praticar/questoes          ──► Caderno Avulso (Filtro por 5 Áreas, Temas, Anos e Modo Estudo com Gabarito)       │
│ 2. /praticar/simulados         ──► Central de Simulados (Simulado Geral INEP 100 Qs · 5h e Mini-Simulado Tiro Rápido)│
│ 3. /praticar/provas-completas  ──► Provas na Íntegra (Resolução Online 1 a 100 ou Impressão A4 INEP c/ Marca D'água) │
│ 4. /praticar/questoes-ia       ──► Gerador de Casos Clínicos Inéditos no Padrão de Cobrança da Banca                │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ 3. Especificação das Camadas e Componentes

### 3.1. Esteira de Extração Forense (Backoffice)
* **Motor:** Python + PyMuPDF (`fitz`) para parsing de vetores, renderização de páginas e isolamento de imagens clínicas.
* **Inteligência Artificial:** 10 subagentes paralelos por edição (`MedicalExtractor`), garantindo integridade textual, gabarito oficial e comentários item a item.
* **Filtro Anti-Poluição:** Filtra e elimina automaticamente imagens não-clínicas (logos de cabeçalho, vetores de rodapé, setas de numeração).

### 3.2. Banco de Dados (Cloud Firestore)
* **Coleção `questions`:** Documentos canônicos com chaves determinísticas (`REV-{ANO}.{EDICAO}-Q{NUMERO}`).
* **Coleção `question_attempts`:** Rastreabilidade de cada clique do usuário (tempo de resposta, opção marcada, acerto/erro, contexto da resolução).
* **Coleção `training_sessions`:** Persistência de sessões de estudo ativas, permitindo pausar e retomar simulados em qualquer dispositivo.

### 3.3. Módulos do Usuário (Frontend)
1. **Início (`/`):** Métricas diárias, sequência de estudos, Projected Pass Score (PPS) e atalhos rápidos.
2. **Estudar (`/estudar`):** Cronograma do dia, videoaulas e resumos teóricos por especialidade.
3. **Praticar (`/praticar/*`):**
   * `/praticar/questoes`: Gerador de cadernos avulsos com feedback imediato.
   * `/praticar/simulados`: Simulados cronometrados com nota de corte.
   * `/praticar/provas-completas`: Cadernos oficiais do INEP na ordem original (online ou PDF para impressão com marca d'água de segurança).
   * `/praticar/questoes-ia`: Geração de questões inéditas sob demanda.
4. **Revisar (`/revisar`):** Repetição espaçada com Flashcards, Caderno de Erros automático e Radar de Diretrizes.
5. **Planejamento (`/planejamento`):** Calendário dinâmico de metas até a data da prova oficial.
6. **Desempenho (`/desempenho`):** Gráficos de evolução, matriz de competências e análise de pontos fracos.
7. **Tutor IA (`/tutor-ia`):** Assistente clínico inteligente com suporte a comando de voz (Modo Trânsito).
8. **OSCE (`/osce`):** Simulador interativo para a 2ª etapa prática do Revalida.
