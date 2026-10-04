# Stazia Knowledge Engine — desenho e plano de fases

> Escrito para: o dono do produto (decisões) e quem for programar (mapa técnico).
> Origem: "Prompt mestre — Stazia Knowledge Engine" (2026-10-04). Este documento cumpre o item 92 do prompt
> (entregáveis antes de programar) e os itens 86–88 (analisar o que existe, não criar sistema paralelo,
> não refatorar sem necessidade). **Nada aqui foi implementado além do que já está marcado como "existe".**

## 0. Resumo em uma página

O prompt descreve um sistema em 6 fases. **Boa parte das fases 1 a 3 já existe** no módulo "Central de Conteúdo"
(prefixo `ch_` no banco, `server/contentHub`, painel em `src/novo/app/admin/content`). O plano é **ampliar esse
módulo**, não criar outro. O que falta de maior valor:

1. **Conferência independente** (criador ≠ conferente de fontes ≠ conferente de atualizações), com provedores
   de IA diferentes e a regra "o conferente nunca é da mesma família do criador".
2. **Grafo de conhecimento** (conceitos e relações), **tipos de afirmação**, **campos estruturados para doses**
   e **versão por afirmação** — hoje a afirmação é plana.
3. **Busca por significado** (pgvector) e **deduplicação** de afirmações.
4. **Cascata completa**: hoje uma mudança de fonte marca a *unidade*; falta alcançar flashcards, questões e estações.
5. **Aluno**: ligar erros às afirmações, revisão espaçada por afirmação e tutor.

Pontos em que o prompt conflita com regras já combinadas: ver seção 10 (precisam da sua decisão).

---

## 1. Architecture Map

```
 Navegador (React, /novo)                Servidor (Express, server.ts)             Banco (Supabase/Postgres)
 ┌───────────────────────┐   rpc app_*   ┌───────────────────────────┐  ch_worker_* ┌──────────────────────┐
 │ Painel Central        │──────────────▶│ /api/content-hub          │─────────────▶│ ch_* (documentos,    │
 │ Aluno (estudo)        │  (token do    │  upload, arquivos, retry  │ (chave de    │ blocos, fontes,      │
 └───────────────────────┘   usuário,    │ Worker (fila durável)     │  serviço)    │ afirmações, unidades)│
                             RLS vale)   │  etapas → pipeline.ts     │              │ ch_jobs, ch_ai_runs  │
                                         │ Provedores de IA (schema) │              └──────────────────────┘
                                         │ Renderizador PDF          │              Storage privado: content-hub
                                         └───────────────────────────┘
 Motor Python (revalida-reverse-engine): provas oficiais → classificação → pacote v1 → carga no banco (offline)
```

Regras que valem em tudo (já implementadas): leitura/escrita do aluno só por funções `app_*` com RLS; funções
`ch_worker_*` só com a chave de serviço; chaves de IA só no servidor; conteúdo de PDF é dado não confiável.

## 2. Database Schema — existente × prompt (item 45)

| Prompt | Existe hoje | Situação |
|---|---|---|
| documents | `ch_documents` (hash, direitos, proveniência, status) | ✅ falta `provenance_class` (4 classes do item 4) |
| document_pages | `ch_pages` (tipo da página, OCR, nº impresso) | ✅ falta `image_heavy`/`table_heavy` |
| document_blocks | `ch_blocks` (original imutável × revisado, bbox, flags) | ✅ |
| document_tables / figures | dentro de `ch_blocks.data` | ⚠️ tabela ainda não vira JSON de células |
| sources / source_versions | `ch_sources` (+ substituição por versão), `ch_source_passages` | ✅ falta nível de autoridade A–E |
| taxonomy_nodes | `ch_taxonomy_nodes` (versionada, 96 nós) | ✅ prompt pede 8 níveis; temos 4 |
| knowledge_claims | `ch_claims` | ⚠️ plana: sem tipo, sem números estruturados |
| claim_sources | `ch_evidence` (trecho, página, versão, parecer) | ✅ |
| claim_versions | `ch_claim_history` (eventos) | ⚠️ histórico, não versões completas |
| claim_conflicts | — | ❌ |
| claim_reviews | `ch_approvals` (por unidade) | ⚠️ falta por afirmação |
| knowledge_concepts / relationships | — | ❌ |
| content_assets / versions | `ch_units`, `ch_unit_versions`, `ch_materials`, `ch_renders` | ✅ |
| flashcards / questions | `flashcards` (app); questões do banco; `draft_questions` (inéditas) | ⚠️ ainda sem `claim_id` |
| processing_jobs/steps/errors | `ch_jobs` (checkpoint, tentativas, erro) | ✅ falta tabela de passos detalhados |
| audit_logs | `ch_audit`, `ch_ai_runs` (modelo, prompt, hash, tokens, custo) | ✅ |
| (extra) | `question_dna`, `question_equivalents`, `app_incidence` | ✅ incidência real |

Convenção: **continuar no prefixo `ch_`** e acrescentar tabelas em migrações novas. Não renomear nada.

## 3. Document Pipeline (itens 6–12, 47–48)

Existe: original preservado + SHA-256 + proveniência; classificação página a página (texto/digitalizada/vazia);
OCR só onde precisa (Tesseract por+spa+eng), texto original separado do revisado, inventário
extraído/pendente/ilegível/excluído; fila durável com checkpoint, tentativas, idempotência e retomada por faixa de 20 páginas.

Falta: DOCX, PPTX, EPUB, HTML, TXT/Markdown e imagens (adaptadores) · tabela → JSON de células · análise de figura ·
retry por bloco/afirmação · estados da fila no vocabulário do prompt (hoje: `queued/running/succeeded/blocked/dead`
+ status do documento).

Decisão técnica já medida: **PyMuPDF como parser principal**; Docling só como reforço por página (≈31 s/página contra ≈0,4 s).

## 4. AI Pipeline (itens 49–53, 80–83)

Existe: 7 prompts versionados com schema validado (classificar, afirmações, evidência, rascunho, resumo,
flashcards, questões, revisão); resposta fora do formato é recusada; cache por hash de entrada; cada chamada
registrada; conferência por software (trecho literal, números/unidades, negações, cópia de 6-gramas);
simulação de IA só em desenvolvimento e bloqueada para publicação.

Falta: provedor OpenAI e escolha de provedor **por papel**; regra de independência; etapas de conflito,
auditoria de citação, red team e originalidade como chamadas separadas; roteamento por custo (item 50).

## 5. Knowledge Model (itens 15–18, 24–27)

Proposta de migração `2100_knowledge_core`:

- `ch_claims` ganha: `claim_type` (lista dos 28 tipos do item 16), `structured` jsonb (fármaco, dose, unidade, via,
  frequência, duração, faixa etária…), `authority_level` herdado da melhor evidência, `confidence_score` (ver item 10.3).
- `ch_concepts` (id, nome, tipo: doença, sintoma, exame, fármaco, conduta, critério) e `ch_concept_relations`
  (origem, relação, destino, `claim_id` que sustenta). A relação **sempre aponta para uma afirmação**: não há aresta sem prova.
- `ch_claim_versions` (cópia imutável a cada mudança: texto, motivo, fonte anterior/nova, autor, data, conteúdos afetados).
- `ch_claim_conflicts` (fontes A e B, diferença, resolução recomendada, revisão humana obrigatória).
- `ch_claim_reviews` (revisor, parecer, hash do que foi visto).
- Validação determinística (item 54): o número/unidade do texto gerado **precisa** existir nos campos estruturados da
  afirmação; senão bloqueia (hoje já fazemos por regex; passa a ser por campo).

## 6. Agent Architecture (itens 51–53)

| Agente do prompt | Onde entra | Provedor (regra) |
|---|---|---|
| 1 Parser, 2 Classificador, 3 Extrator de afirmações | etapas `extract`, `classify`, `claims` (existem) | rápido/barato |
| 4 Pesquisador de evidências | busca por palavras + significado nas fontes | sem IA para recuperar; IA só para escolher trecho |
| **5 Verificador médico** | etapa `evidence` (existe) → vira papel próprio | **família ≠ criador** |
| 6 Resolvedor de conflitos | nova etapa `conflicts` | independente |
| **(novo) Conferente de atualizações** | nova etapa `currency`: documento mais novo? substituído? conduta mudou? | independente, **só com o documento completo** |
| 7 Arquiteto, 8 Redator, 9 Gerador de questões | `draft`, `materials`, `questions` (existem) | criador |
| 10 Revisor clínico / red team | `review_check` (existe) → perguntas do item 53 | independente |
| 11 Auditor de citações | nova etapa `citations`: a fonte sustenta *esta* frase? | independente |
| 12 Auditor de originalidade | `copyRatio` (existe) + rewrite obrigatório | software |

Regras: (a) **bloqueio, não maioria** — qualquer "não" mantém o item em revisão; (b) o conferente recebe a afirmação e o
trecho, **sem a justificativa** do criador; (c) nenhum agente aprova ou publica — só pessoa; (d) sem documento
completo da fonte, o parecer é "não foi possível conferir", nunca "atualizado".

## 7. Job Architecture (itens 47–48, 90)

Fila `ch_jobs` já tem: chave de idempotência (documento+etapa+escopo+versões), tentativas limitadas, checkpoint,
recuperação de trabalho parado, pendência de configuração (`blocked`) e escopo por versão (`version:<id>`).
Acrescentar: etapas `conflicts`, `currency`, `citations`, `embed`; escopo por afirmação; progresso em % por etapa.

## 8. API Design

Já existe `/api/content-hub`: `POST /documents`, `POST /sources/:id/document`, `GET /documents/:id/file`,
`GET /renders/:id`, `POST /jobs/:id/retry`, `POST /sources/check`, `GET /status`. Leituras e decisões do painel
são funções `app_ch_*`. Acrescentar por fase: `app_ch_claims_search`, `app_ch_conflicts`, `app_ch_claim_diff`,
`app_ch_generate(theme, tipos[])`, `app_ch_gap_analysis(area)`.

## 9. UI Flow (itens 58–64, 76–77)

Existe: importar PDF, andamento por etapa, original × extração, inventário, afirmações com original × referência ×
proposta, unidades com editor/materiais/aprovações, fontes, taxonomia, configuração e custos, rascunhos inéditos.
Falta: **Knowledge Inspector** (tela por conceito), **Knowledge Diff**, **Content Factory** (marcar tipos e gerar),
**modo curso completo**, **análise de lacunas** e o resumo de importação do item 77.

## 10. Pontos em que o prompt conflita com regras já combinadas (precisam da sua decisão)

1. **Publicação automática (item 75).** O prompt permite publicar sozinho quando todas as checagens passam. As regras
   anteriores dizem: *o processamento de IA não pode aprovar nem publicar*, e publicação exige revisor médico da área.
   **Proposta: manter a regra anterior.** As checagens só decidem quem vai para a fila e com que prioridade.
2. **Atualização automática "quando seguro" (item 27).** **Proposta:** nunca substituir o publicado; gerar versão
   candidata e mandar para revisão (já é o comportamento atual).
3. **Score de confiança 0–100 (item 22).** Anteriormente: não apresentar confiança de IA como prova de acerto.
   **Proposta:** score **calculado por regras** (qualidade da extração, autoridade da fonte, concordância, atualidade,
   conflito, criticidade), usado só para ordenar a fila e nunca como aprovação; a tela mostra a composição, não só o número.
4. **Docling como parser principal (item 8).** Medimos 31 s/página. **Proposta:** PyMuPDF principal, Docling por página sob demanda.
5. **Fontes de nível E (apostilas) como evidência.** O prompt já diz que não têm prioridade. **Proposta:** apostila
   (inclusive "Sangue nos Olhos") entra como `THIRD_PARTY_REFERENCE`/`LICENSED` para *descobrir* afirmações; **só fonte
   de nível A–D vale como evidência `compatible`**. Isso é o que faz os 200 rascunhos atuais caírem em "evidência insuficiente" até existir acervo oficial.
6. **Provenância em 4 classes** (`OWNED`, `LICENSED`, `PUBLIC_OFFICIAL`, `THIRD_PARTY_REFERENCE`) × os 5 estados de direitos
   atuais. **Proposta:** mapear (`own`→OWNED, `licensed_adaptation`→LICENSED, `reference_only`→THIRD_PARTY_REFERENCE) e
   acrescentar PUBLIC_OFFICIAL; transformação visual completa só para OWNED/LICENSED com autorização escrita registrada.

## 11. Implementation Phases (itens 86, 92)

| Fase | Entrega | Já existe | Falta construir |
|---|---|---|---|
| **1 Foundation** | Upload, storage, blocos, OCR, visualizador, fila | quase tudo | adaptadores DOCX/PPTX/EPUB/HTML/imagem; tabela→JSON; classe de proveniência |
| **2 Knowledge** | Taxonomia, afirmações tipadas, grafo, embeddings, dedupe | taxonomia, afirmações planas | migração `2100`; conceitos/relações; pgvector; dedupe |
| **3 Validation** *(começar por aqui)* | Conferências independentes, conflitos, red team, fila médica | evidência, revisão, trava de publicação | provedor OpenAI; papéis; `currency`, `citations`, `conflicts`; teste com erros plantados |
| **4 Content Factory** | Aula, mini-aulas, resumos, flashcards (6 modelos), questões, estações, cards, roteiro | aula, resumo, flashcards, questões, cards | mini-aulas por duração, modelos de flashcard, estações, roteiro, 4 níveis, tela de geração, lacunas |
| **5 Educational Intelligence** | Incidência, perfil, revisão espaçada, tutor | incidência real; FSRS | erro→afirmação; domínio por afirmação; relevância; tutor ancorado nas unidades publicadas |
| **6 Auto-update** | Monitorar, Diff, grafo de dependência, cascata | monitoramento por hash; unidade→afirmação | `claim_id` em flashcards/questões/estações; Knowledge Diff; cascata completa |

**Primeira fatia combinada:** Fase 3 aplicada aos **200 rascunhos do motor**: criador = OpenAI (já gerou);
conferentes = Claude (independência); resultado por rascunho na tela "Questões inéditas".
Dependências externas: chave da Anthropic; acervo de fontes oficiais (nível A); texto do registro de licença do material usado.

## 12. Métricas de sucesso da Fase 3

Corpus com **erros plantados** (dose trocada, unidade, negação perdida, diretriz substituída, citação que não sustenta,
trecho copiado). Para cada camada: quantos erros pega, quantos acertos legítimos barra (falso alarme), com o denominador
e a gravidade. Sem esse número, não se diz que a conferência "funciona".
