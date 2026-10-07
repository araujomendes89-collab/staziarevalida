# Stazia Content Lab — diagnóstico (Fase 0) e plano incremental

> Escrito para: o dono do produto (decisões) e quem for programar (mapa técnico).
> Origem: especificação "Stazia Content Lab" (2026-10-04). Cumpre o item 54: ler o projeto antes de mexer, reutilizar o que existe, não criar estrutura paralela.
> Complementa `STAZIA_KNOWLEDGE_ENGINE.md` (a Central de Conteúdo) e `STAZIA_QUESTION_INTELLIGENCE_ENGINE.md` (questões).

## 0. Conclusão em um parágrafo

**O Content Lab que a especificação descreve já existe, em boa parte, com outro nome**: a "Central de Conteúdo" (prefixo `ch_` no banco, `server/contentHub`,
painel em `src/novo/app/admin/content`) mais o SQIE (`question_*`). Criar um schema `content_lab` com projetos, fontes, claims e rascunhos próprios geraria
**exatamente o que a regra 55 proíbe: duas estruturas paralelas para a mesma coisa** (duas tabelas de fontes, duas de claims, duas filas). Decisão:
**o Content Lab é a Central de Conteúdo ampliada**. O que a especificação pede e ainda não existe entra como migrações incrementais com o mesmo prefixo.

## 1. Arquitetura encontrada

| Camada | O que existe | Onde |
|---|---|---|
| App do aluno e painel | React 19 + Vite, rota `/novo`, Design System próprio (`src/novo/ds`) | `src/novo` |
| Servidor | Express (`server.ts`), rotas `/api/content-hub` (upload, arquivos, retry, conferir fontes, comparar versões), worker em processo | `server/contentHub` |
| Banco | Supabase (Postgres 17, São Paulo). Aluno e painel falam por funções `app_*` com RLS; processamento usa funções `ch_worker_*` só com chave de serviço. Banco de testes e dev: PGlite | `supabase/migrations` (28) |
| Autenticação e papéis | Supabase Auth; `user_roles` (admin/editor/aluno); `ch_reviewer_areas` (revisor médico por área); `assert_admin()`, `is_staff()`, `ch_is_reviewer()` | migrações `…1300_admin`, `…1400_content_hub` |
| Storage | bucket privado `content-hub` (PDFs, renderizações) | `…2000_storage` |
| IA | Provedores Anthropic, Gemini e simulação (só dev) atrás de uma interface com JSON Schema validado; criador ≠ conferente por família de modelo; cada chamada em `ch_ai_runs` (modelo, prompt, versão, hash, tokens, custo) | `server/contentHub/ai` |
| Fila | `ch_jobs`: idempotência, checkpoint, tentativas, recuperação de trabalho parado, pendência de configuração | `…1400`, `server/contentHub/worker.ts` |
| Auditoria | `ch_audit` (ações do painel) e `admin_audit_log` (admin geral) | |
| Legado | `content-engine/`, `revalida-reverse-engine/` (motor Python offline que gerou o pacote de provas), Firebase (app antigo, produção) | não mexer |

Não existem: pgvector/embeddings, tabela de aulas própria (a aula é um `ch_materials.kind='lesson'` dentro de uma unidade), Edge Functions, Server Actions (não é Next.js).

## 2. Mapa de entidades canônicas (nomes reais)

| Entidade da especificação | Tabela existente | Observação |
|---|---|---|
| grande área / especialidade / tema / subtema | `ch_taxonomy_nodes` (níveis `area`, `subarea`, `theme`, `subtheme`; versionada em `ch_taxonomy_versions`; 96 nós) + `questions.area` (enum `med_area`) | **sem aliases** (HAS = hipertensão) |
| projeto editorial | `ch_units` (um tema) + `ch_unit_versions` | "projeto" como agrupador de fontes não existe |
| fonte | `ch_sources` (+ passagens, vigilância, diffs, registro) | tipo da fonte é de *situação* (`final`, consulta pública…), não de *natureza* (diretriz, PCDT, lei…) |
| documento carregado | `ch_documents` (SHA-256 único, direitos, proveniência) → `ch_pages` → `ch_blocks` | só PDF |
| claim | `ch_claims` + `ch_evidence` (trecho, página, versão, parecer) | plana: sem tipo; confiança só calculada nas fontes |
| rascunho | `ch_unit_versions` (`draft`…`published`) + `ch_materials` (aula, resumo, cartões, flashcards, tabela, questões, estação) | |
| questão publicada / inédita | `questions` (1.200 oficiais) · `draft_questions` (200 inéditas) | |
| flashcard | `flashcards` | sem `claim_id` |
| aprovação | `ch_approvals` (médica e editorial) | |
| publicação | `ch_publications` + `app_ch_publish` | **publica sem trava de configuração** |
| fila | `ch_jobs` | |
| prompts | `server/contentHub/ai/prompts.ts` (versão no código; versão registrada em cada execução) | **o texto do prompt não fica guardado no banco** |
| conflito | — (só `verdict='conflicting'` na evidência) | **sem registro de decisão** |
| dependências | `ch_unit_claims`, `ch_materials.claim_ids`, `question_claims`, `ch_flag_dependents` | |
| versões | `ch_unit_versions`, `question_comments`, `question_update_cards`, `ch_claim_history` | |

## 3. Cobertura da especificação (itens 1–56)

| Itens | Situação |
|---|---|
| 1, 4, 5, 40 isolamento, nada de DROP, IA não escreve em tabela oficial | ✅ já é assim: tudo o que a IA gera cai em `ch_*`/`draft_*`; a publicação é função separada; migrações incrementais |
| 2–3 mapa e entidades canônicas | ✅ este documento; ⚠️ falta **alias de tema** |
| 6–7 projetos e fontes | ⚠️ fonte existe; falta o **tipo de natureza** (diretriz, PCDT, lei, manual…), autores, idioma, "fonte primária". Projeto como agrupador: não criar agora (a unidade por tema cumpre) |
| 8, 35 proveniência e citações | ✅ trecho + página + versão por evidência; citação literal conferida por software |
| 9 ingestão | ⚠️ PDF (e fonte por endereço). **Falta** DOCX/PPTX/XLSX/TXT/MD/URL/YouTube/áudio/vídeo |
| 10 jobs | ✅ (vocabulário de estados diferente, equivalente) |
| 11–12 AI Gateway e fallback | ⚠️ interface única com validação de schema; **faltam o provedor OpenAI e o fallback automático** (principal → nova tentativa → secundário) |
| 13 prompts versionados | ⚠️ versão por execução; **falta guardar o texto do prompt** (reprodutibilidade) |
| 14–15 rascunhos e tipos | ✅ rascunho nunca nasce publicado; aula, resumo, flashcard, questão, estação, tabela; faltam caso clínico, algoritmo, checklist, mapa mental, áudio |
| 16, 47 análise e "extrair tudo" | ⚠️ claims, classificação e inventário existem; falta a tela única "Extrair conhecimento" com escolha de produtos |
| 17 comparação de fontes | ✅ comparação de conteúdo entre versões (Fase 3 do SQIE), com tipos de mudança |
| 18 conflitos | ⚠️ detecção parcial; **falta o registro do conflito e da decisão** |
| 19 hierarquia de fontes | ⚠️ níveis A–E fixos; **falta ser configurável por área** |
| 20–21 questões antigas | ✅ SQIE inteiro (gabarito histórico imutável, atual separado, cartão de atualização) |
| 22–23 desatualizado e dependências | ✅ mudança de fonte → só o que depende; nada se altera sozinho |
| 24–25 versionamento e diff | ✅ versões imutáveis e diff de fonte; diff **editorial** (texto atual × proposto) ⚠️ parcial |
| 26 revisão humana | ✅ tela de unidades e revisão, fila de atualizações |
| 27–28 publicação não destrutiva | ✅ publica versão nova, retira a anterior, histórico preservado; ⚠️ **sem validação de transação em várias tabelas** (publica uma unidade por vez) |
| 29–30 shadow mode e feature flags | ❌ **não existem** |
| 31, 32 NotebookLM e áudio | ❌ fase 9 |
| 33–34 RAG e chunking | ⚠️ passagens por seção/página com busca por palavras (tsvector); **sem embeddings** (pgvector não instalado) |
| 36 saída estruturada | ✅ JSON Schema; resposta inválida é recusada, nunca "consertada" |
| 37 duplicidade | ⚠️ documento por hash, afirmação por texto normalizado; tema e flashcard sem checagem |
| 38 score de confiança | ⚠️ **falta o score composto e explicável** |
| 39 auditoria | ✅ `ch_audit`/`ch_log` |
| 41 segurança | ✅ RLS, chaves só no servidor, limite de tamanho, SHA-256; ⚠️ sem *rate limit* e só PDF validado |
| 42 injeção de prompt | ✅ conteúdo entre `<documento>`, instrução fixa de tratar como dado |
| 43 direitos autorais | ✅ 5 estados de direitos, cópia de 6 palavras barrada, apostila nível E não vale como evidência |
| 44–46 interface | ✅ painel no Design System; ⚠️ "chat com as fontes" não existe |
| 49–50 performance e observabilidade | ✅ paginação, fila; custo por chamada em `ch_ai_runs`, tela "Configuração e custos" |
| 51 testes | ✅ 136 arquivos, 1.262 testes, incluindo acesso negado a não administrador |

## 4. Riscos de divergência (e como evitar)

1. **Criar `content_lab.*` em paralelo** → duas verdades para fonte, claim e rascunho. Evitado: ampliar `ch_*`.
2. **Tema duplicado criado pela IA** (HAS × Hipertensão). Hoje a taxonomia só impede nome idêntico. Mitigação: aliases + busca antes de criar.
3. **Publicar sem querer.** `app_ch_publish` funciona assim que há versão aprovada. Mitigação: sinalizadores `publish_enabled=false` e `shadow_mode=true` por padrão, **no banco**, não só no front.
4. **Prompt mudou e ninguém sabe o que rodou.** Mitigação: guardar o texto do prompt por versão e hash.
5. **Conflito escolhido em silêncio.** Mitigação: registro de conflito com decisão e autor.
6. **Dependência de um provedor.** Hoje Anthropic é o padrão. Mitigação: provedor OpenAI e fallback por papel, respeitando a independência criador × conferente.
7. **Quebrar o app do aluno.** O aluno só lê por `app_*`; nenhuma função existente muda de assinatura.

## 5. Estruturas reaproveitadas × novas

**Reaproveitar sem alterar:** `ch_documents/pages/blocks`, `ch_sources/passages/watch/changes/diffs`, `ch_claims/evidence`, `ch_units/unit_versions/materials/approvals/publications`, `ch_jobs`, `ch_ai_runs`, `ch_audit`, taxonomia, `question_*`.

**Novas, realmente necessárias** (migração `…2900_content_lab_foundation`):

| Estrutura | Para quê |
|---|---|
| `ch_flags` + `app_ch_flags` / `app_ch_set_flag` / `ch_flag()` | os 6 sinalizadores (itens 29–30), com trava no banco; `enabled=false` desliga o módulo |
| `ch_taxonomy_aliases` + `app_ch_taxonomy_find` / `_add_alias` / `_remove_alias` | aliases e busca de equivalentes antes de criar tema (item 3, 37) |
| colunas em `ch_sources`: `source_type`, `authors`, `language`, `is_primary_source` | natureza da fonte (item 7) |
| `ch_prompt_versions` + `ch_worker_register_prompt` | texto, schema e hash de cada versão de prompt (item 13) |
| `ch_conflicts` + `app_ch_conflicts_detect` / `_list` / `_decide` | conflito com os dois lados e a decisão registrada (item 18) |
| `ch_claim_confidence()` | confiança composta e explicável (item 38) |

**Código novo:** provedor OpenAI e `withFallback` (item 11–12); registro de prompt na execução; trava de IA por sinalizador.

## 6. Migrações previstas

| # | Conteúdo | Estado |
|---|---|---|
| 2900 | fundação: sinalizadores, aliases, tipo de fonte, versões de prompt, conflitos, confiança | **feita e aplicada no Supabase** |
| 3000 | adaptação licenciada: registro da licença e retirada das referências do licenciante | **feita e aplicada no Supabase** |
| 3050 | tipos de arquivo (DOCX/PPTX/XLSX/TXT/MD) como adaptadores do extrator; validação de MIME | próxima |
| 3100 | pgvector, `ch_chunks`, embeddings | depende de decidir o modelo de embeddings |
| 3200 | claim tipado (`claim_type`, campos estruturados de dose) | |
| 3300 | caso clínico, algoritmo, checklist, roteiro de áudio em `ch_materials.kind` | |

## 7. Componentes, APIs e rotas

- **Painel:** continua em `?aba=conteudo&secao=…` (não criar `/admin/content-lab`: seria uma segunda porta para a mesma tela). Novos: aba "Conflitos", alias na taxonomia, sinalizadores em "Configuração e custos", selo de confiança na afirmação.
- **API:** funções `app_ch_*` novas (lista acima) com o token do usuário; nenhuma Server Action (o projeto não usa Next.js). Rotas Express só para o que precisa de arquivo ou chave.
- **Servidor:** `ai/openai.ts` (sem biblioteca nova: `fetch`), `ai/fallback.ts`, `ai/registry.ts`.

## 8. Plano de integração em fases

| Fase (da especificação) | Situação |
|---|---|
| 0 Diagnóstico | **este documento** |
| 1 Fundação (permissões, fontes, jobs, flags, auditoria) | ✅ quase tudo existe; **entra agora: flags, tipo de fonte** |
| 2 Ingestão (formatos, chunks, embeddings) | PDF ok; formatos e embeddings pendentes (3000, 3100) |
| 3 IA (gateway, OpenAI, structured output, prompts) | **entra agora: OpenAI, fallback, prompts guardados** |
| 4 Extração de conhecimento (claims, aliases, canônico) | claims ok; **entra agora: aliases** |
| 5 Produção (rascunhos, geradores) | ok para aula/resumo/flashcards/questões; faltam os outros tipos |
| 6 Verificação (comparação, conflitos, desatualizado) | comparação e desatualizado ok; **entra agora: conflitos e confiança** |
| 7 Revisão (diff, aprovar, rejeitar, editar) | ok; diff editorial parcial |
| 8 Publicação (transação, versão, rollback) | ok por unidade; **entra agora: trava `publish_enabled`/`shadow_mode`** |
| 9 Google / NotebookLM / áudio | só depois da fundação |

Regras mantidas: IA não aprova nem publica; fonte nível E (apostila) não vale como evidência; gabarito histórico nunca muda; nada substitui conteúdo publicado sem revisão.

## 9. O que foi implementado depois do diagnóstico (migração 2900)

- **Sinalizadores no banco** (`ch_flags`): `enabled`, `ai_enabled`, `publish_enabled`, `notebook_provider_enabled`, `auto_analysis_enabled`, `shadow_mode`.
  Padrão: módulo e IA ligados, **publicação desligada, modo sombra ligado**. Só administrador muda, com motivo, e a mudança vai para `ch_audit`.
  `enabled=false` faz toda função da equipe recusar (o aluno não é afetado). `app_ch_publish` recusa sem `publish_enabled` e com `shadow_mode`.
  No servidor, `CONTENT_LAB_ENABLED=false` ou `CONTENT_LAB_AI_ENABLED=false` valem mais que o painel; a IA recusa antes de chamar qualquer provedor.
- **Provedor OpenAI** (`ai/openai.ts`, só `fetch`, modelo obrigatório) e **fallback** (`ai/fallback.ts`): principal → nova tentativa → secundário, com o
  resultado dizendo quem produziu. O secundário de um conferente só entra se for de outra família que a do criador.
- **Prompts guardados** (`ch_prompt_versions`): texto, schema e hash de cada versão que rodou.
- **Aliases de tema** (`ch_taxonomy_aliases`, chave por caminho: sobrevive a nova versão da taxonomia) e busca de equivalentes antes de criar tema.
- **Natureza da fonte** (`source_type`, autores, idioma, fonte primária).
- **Conflitos** (`ch_conflicts`): os dois lados, decisão de administrador com motivo, auditoria; conflito decidido a favor da outra fonte deixa de bloquear.
- **Confiança composta** (`ch_claim_confidence`): HIGH / MODERATE / REVIEW_REQUIRED, com os componentes (nunca uma porcentagem).
- Painel: aba **Conflitos**, **Sinalizadores** e **Prompts em uso** em Configuração, aliases na Taxonomia, selo de confiança na afirmação, natureza no registro da fonte.

**Ligar a publicação** (quando você decidir): Configuração → Sinalizadores → desligar "Modo sombra" e ligar "Publicação", cada um com motivo.

## 10. Adaptação licenciada (migração 3000)

Para material de terceiros usado **com licença** (ex.: apostila licenciada), o caminho é:

1. **Registrar a licença** no documento (`app_ch_register_license`, só administrador): quem concedeu, obra, datas, onde está o documento assinado,
   **o texto da licença** e o que ela autoriza: adaptar, nova roupagem visual, uso comercial e **retirar as referências do licenciante**.
   O sistema não interpreta contrato: confia no que foi registrado e audita tudo.
2. **Retirar as referências** (`POST /api/content-hub/documents/:id/clean-references`, ações `preview`, `apply`, `undo`): só funciona se a licença
   ativa e dentro do prazo autorizar. Remove **somente** o que a licença lista como identificação do licenciante (nome, marca, @, site, autores),
   mais avisos de direitos e contatos de rede social. Links oficiais e fontes clínicas ficam. Números, doses e negações não são tocados.
3. **O original nunca muda.** A retirada grava em `revised_text` (ou exclui o bloco que só tinha a referência); cada remoção fica em
   `ch_reference_cleanups`, com desfazer (que preserva o que uma pessoa revisou depois).
4. **Nova roupagem.** O texto das unidades é reescrito a partir das afirmações conferidas e renderizado na identidade StaziaMed (já existia).
   O rascunho de adaptação que voltar a citar o licenciante é barrado por software.
5. **Licença vencida ou revogada:** o documento volta ao modo de criação independente e a publicação de adaptações é bloqueada.

A licença **não** dispensa a conferência médica: afirmação continua precisando de evidência em fonte oficial (apostila é nível E) e a publicação continua sendo de pessoa.

## 11. Central de IAs (migração 5200)

A escolha de IA e de modelo da Central saiu das variáveis de ambiente e foi para **Administração › Central de IAs**
(veja `CENTRAL_DE_IAS.md`). Lá o administrador liga Claude, OpenAI, Gemini e Ollama, define o modo de cada função
(sozinha, linha de produção ou comitê), os tetos de gasto e os preços. Todas as chamadas passam pelo maestro
(`server/ai/maestro.ts`) e ficam em `ai_calls`, além de `ch_ai_runs`, que segue igual. Sem configuração salva, uma função
usa as variáveis de hoje, desde que a IA esteja ligada na Central. Os sinalizadores desta seção (`ai_enabled`, modo sombra,
publicação) continuam valendo por cima.
