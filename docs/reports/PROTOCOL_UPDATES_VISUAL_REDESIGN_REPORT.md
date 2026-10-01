# PROTOCOL_UPDATES_VISUAL_REDESIGN_REPORT.md
# Relatório de Redesign Pedagógico e Visual — Atualizações & Diretrizes
**Etapa:** 1.20E — Redesign Pedagógico e Visual de Atualizações & Diretrizes  
**Componente Modificado:** `src/components/protocols/ProtocolUpdatesHubView.tsx`  
**Dataset Canônico:** `src/data/protocolUpdatesData.ts` (100% preservado)  
**Data:** 03 de Setembro de 2026  
**Status:** `PROTOCOL_UPDATES_VISUAL_REDESIGNED`  
**Testes:** 258/258 PASS (35 suítes de teste, 0 erros no console)  

---

## 1. ARQUITETURA ANTERIOR

A arquitetura anterior de `ProtocolUpdatesHubView.tsx` (1.238 linhas de código) organizava o estudo de diretrizes em 7 sub-abas horizontais:
1. `overview` (Visão Geral com dashboard de métricas e lista mista)
2. `mudou_2025` (Filtro rígido de 2025 disfarçado de aba)
3. `mudou_2026` (Filtro rígido de 2026 disfarçado de aba)
4. `tabela_comparativa` (Matriz tabular temporal 2024 × 2025 × 2026)
5. `questoes_antigas` (Banco isolado de 21 itens desatualizados)
6. `questoes_ineditas` (Simulador de casos clínicos com menu lateral)
7. `flashcards` (Player com 30 cartões 3D)

### Problemas Identificados na Auditoria 1.20D:
- **Fragmentação da Tarefa:** O aluno precisava adivinhar em qual das 7 abas estava o detalhe procurado.
- **Sobrecarga de Superfície:** Nível de aninhamento 4 (`UPDATE_NESTED_SURFACE_DEPTH = 4`), com cerca de 18 elementos interativos confusos no 1º viewport.
- **Filtros Confundidos com Navegação:** Anos (2025 e 2026) transformados em rotas e abas separadas.

---

## 2. ARQUITETURA NOVA (EXPERIÊNCIA FOCALIZADA)

A nova arquitetura unifica todo o fluxo pedagógico em torno de **uma única unidade central: A ATUALIZAÇÃO**.

```
ATUALIZAÇÕES & DIRETRIZES (Home compacta)
├── Cabeçalho limpo com contagem honesta
├── Barra de Busca instantânea + Filtros compactos (Ano, Grande Área)
└── LISTA DE CARDS ESCANEÁVEIS (Scanability HIGH)
    ↓ (Clique em "Ver atualização")
DETALHE FOCALIZADO DA ATUALIZAÇÃO
├── 1. O QUE MUDOU? (Antes × Agora protagonista)
├── 2. O QUE LEMBRAR PARA O REVALIDA (Impacto & Pegadinhas da banca)
├── 3. FONTE & ATRIBUIÇÃO PRIMÁRIA (Instituição, Documento, Link externo ↗)
├── 4. QUESTÕES HISTÓRICAS AFETADAS (Gabarito da prova preservado + Aviso de atualização)
└── 5. REVISÃO ATIVA & PRÁTICA (Questão Inédita + Flashcard em modo preview)
```

---

## 3. TABS REMOVIDAS
- **Contagem anterior:** `INTERNAL_SUBTABS_COUNT = 7`
- **Contagem atual:** `INTERNAL_SUBTABS_COUNT = 0`
- Nenhuma funcionalidade foi deletada: todas as 7 dimensões foram redistribuídas de forma contextual e intuitiva dentro do fluxo do próprio protocolo.

---

## 4. FILTROS COMPACTOS
- **Ano:** Todos os Anos, Ano 2025, Ano 2026.
- **Grande Área:** Todas as Áreas, Clínica Médica, Cirurgia Geral, Pediatria, Ginecologia e Obstetrícia, Medicina Preventiva & SUS.
- **Busca:** Input em tempo real com busca em tema, subtema, órgão emissor, conduta vigente e conduta anterior.

---

## 5. HOME (PRIMEIRO VIEWPORT)
- Cabeçalho minimalista e honesto: *"Mudanças clínicas e normativas que podem alterar sua resposta na prova do Revalida"*.
- Indicador discreto de contagem de atualizações.
- Botão secundário de alternância para o **Modo Tabela Comparativa**.
- Redução de ~18 elementos ruidosos para 4 controles essenciais (Busca, Ano, Área, Alternador de Visualização).

---

## 6. LISTA DE ATUALIZAÇÕES
- Layout vertical com scanability ultra-rápida.
- Cada card resume a conduta em 1-2 linhas, indicando se há questões históricas afetadas, flashcards ou questões inéditas vinculadas.

---

## 7. CARD DA ATUALIZAÇÃO
- **Borda lateral temática:** Cor canônica da Grande Área (`border-l-4`).
- **Badge de Área:** Pílula colorida com tema canônico.
- **Badges de Apoio:** Tag de Ano (2025 / 2026 / 2025 & 2026) e Prioridade Editorial (*Muito Alta* / *Alta*).
- **CTA:** Botão limpo *"Ver atualização"*.

---

## 8. REUSO DO DESIGN SYSTEM (`areaThemes.ts`)
- Reutilização direta do helper `getAreaVisualTheme(protocol.area)` e das constantes `CANONICAL_AREA_DISPLAY_LABELS`.
- Cores oficiais:
  - Clínica Médica: Azul (`#2563eb`)
  - Cirurgia Geral: Laranja (`#ea580c`)
  - Pediatria: Verde-azulado / Teal (`#0d9488`)
  - Ginecologia e Obstetrícia: Rosa (`#e11d48`)
  - Medicina Preventiva / SUS: Verde Esmeralda (`#059669`)

---

## 9. DETALHE DA ATUALIZAÇÃO
- Ao selecionar uma atualização, a tela exibe a visão focalizada sem sobreposição confusa de abas.
- Botão de retorno superior: *"← Voltar para todas as atualizações"*.

---

## 10. O QUE MUDOU (PROTAGONISTA)
- `CHANGE_ITSELF_VISUAL_PRIORITY = HIGH`.
- O bloco de mudança ocupa a primeira posição visual com destaque nítido.

---

## 11. ANTES (CONDUTA ANTERIOR)
- **Linguagem:** *"Conduta Anterior (Antes de 2025)"* (sem taxar historicamente de "errada").
- **Estilo:** Superfície neutra/secundária com texto nítido (`recomendacao_pre_2025`).

---

## 12. AGORA (CONDUTA VIGENTE)
- **Linguagem:** *"Conduta Vigente (Padrão Atual Oficial)"*.
- **Estilo:** Destaque em esmeralda com ícone de checkmark (`conduta_vigente`).

---

## 13. PARA O REVALIDA
- **Como o INEP cobra na prova:** Texto da análise pedagógica da banca (`impacto_revalida`).
- **Alerta de Pegadinha da Banca:** Destaque com alerta para evitar indução ao erro (`pegadinha`).
- **Impacto Clínico:** Relevância assistencial (`impacto_clinico`).

---

## 14. FONTE E ATRIBUIÇÃO PRIMÁRIA
- Nome do documento oficial (`nome_documento`).
- Órgão emissor e data formal de publicação (`instituicao`, `data_publicacao`).
- Data da última verificação documental (`ultima_verificacao`).
- Link direto `[Abrir documento oficial primário ↗]` (`url_oficial`).

---

## 15. PROVENIÊNCIA DOCUMENTAL
- Compatibilidade total com o modelo de fontes governamentais e sociedades científicas (`GOVERNMENT_HEALTH`, `INEP`, `SCIENTIFIC_SOCIETY`).

---

## 16. QUESTÕES HISTÓRICAS AFETADAS
- Accordion retrátil no detalhe da atualização: *"Questões Históricas da Prova Afetadas (X)"*.
- Cada item identifica a prova (`REV-2022.2-GO-14`, Questão #14).

---

## 17. GABARITO HISTÓRICO ORIGINAL PRESERVADO
- O gabarito oficial da prova histórica **nunca é alterado nem apagado** (`item.gabarito_original`).

---

## 18. AVISO DE ATUALIZAÇÃO
- Banner de alerta explicando que a questão foi respondida segundo as diretrizes da época e que o protocolo foi posteriormente atualizado (`item.aviso_desatualizacao`).

---

## 19. QUESTÕES INÉDITAS (MODO PREVIEW)
- Incorporadas contextualmente na seção *"Revisão Ativa & Prática"*.
- Resolução interativa com 4 alternativas, feedback instantâneo, justificativas pedagógicas por alternativa e comentário do especialista.
- `UPDATE_QUESTION_EMBED_TYPE = PREVIEW` (isoladas de estatísticas globais).

---

## 20. FLASHCARDS (MODO PREVIEW)
- Incorporados contextualmente para memorização rápida.
- Card interativo com flip frente/verso e controles anterior/próximo.
- `FLASHCARD_EMBED_TYPE = PREVIEW` (isolados do agendador FSRS global).

---

## 21. REVISÃO ATIVA INTEGRADA
- As ferramentas de fixação (Inédita + Flashcard) atuam como suporte complementar no rodapé do protocolo estudado, sem competir com a leitura da diretriz.

---

## 22. TABELA COMPARATIVA (MODO SECUNDÁRIO)
- Visualização tabular consolidada acessível pelo botão *"Modo Tabela Comparativa"*, permitindo consulta em grade matricial sem fragmentar a navegação primária.

---

## 23. RESPONSIVIDADE
- **Mobile (390px):** Disposição vertical natural sem overflow horizontal. Antes e Agora empilhados verticalmente.
- **Desktop:** Visualização de Antes × Agora em 2 colunas lado a lado com largura otimizada para leitura.

---

## 24. TEMAS CLARO E ESCURO (LIGHT / DARK)
- Suporte total via classes TailwindCSS (`dark:`), com fundos limpos (`bg-white` / `dark:bg-[#0f1322]`) e bordas suaves (`border-slate-200` / `dark:border-white/10`).

---

## 25. ARQUIVOS MODIFICADOS / CRIADOS
- `src/components/protocols/ProtocolUpdatesHubView.tsx` (Refatorado para arquitetura limpa)
- `src/__tests__/protocolUpdatesVisualRedesign.test.tsx` (Novo arquivo de testes cobrindo todas as regras)
- `PROTOCOL_UPDATES_VISUAL_REDESIGN_REPORT.md` (Este relatório)

---

## 26. FUNCIONALIDADES REMOVIDAS
- **Zero funcionalidades deletadas.** Apenas reorganizadas pedagogicamente da navegação de topo para os pontos de estudo contextualizados.

---

## 27. COMPARATIVO ANTES vs DEPOIS

| Métrica | Antes (Auditoria 1.20D) | Depois (Redesign 1.20E) |
| :--- | :---: | :---: |
| `INTERNAL_SUBTABS_COUNT` | **7** | **0** |
| `UPDATES_DENSITY` | `VERY_HIGH` | **LOW / MEDIUM** |
| `FIRST_VIEWPORT_ELEMENTS` | ~18 | **4** |
| `UPDATE_NESTED_SURFACE_DEPTH` | **4** | **2** |
| `UPDATE_LIST_SCANABILITY` | LOW/MEDIUM | **HIGH** |
| `CHANGE_ITSELF_VISUAL_PRIORITY` | MEDIUM | **HIGH** |
| `FLASHCARD_PREVIEW_VISUAL_WEIGHT` | HIGH (Aba isolada) | **LOW/MEDIUM (Contextual)** |
| `QUESTION_PREVIEW_VISUAL_WEIGHT` | HIGH (Aba isolada) | **LOW/MEDIUM (Contextual)** |
| `TESTS_PASSING` | 253 / 253 | **258 / 258 PASS** |
| `CONSOLE_ERRORS` | 0 | **0** |

---

## 28. CONCLUSÃO E CLASSIFICAÇÃO

O módulo **REVISAR → Atualizações & Diretrizes** foi completamente refinado, eliminando a fragmentação cognitiva de 7 abas e entregando uma experiência transparente e focada no Revalida INEP.

**Classificação:** `PROTOCOL_UPDATES_VISUAL_REDESIGNED`
