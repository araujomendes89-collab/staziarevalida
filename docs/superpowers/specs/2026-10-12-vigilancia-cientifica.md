# Vigilância científica e validação de fontes — por tema

Pedido do dono (12/10/2026, seção 2 da proposta guardada em `Documents/Prompts guardados/2026-10-12-motor-vinculacao-e-vigilancia-de-fontes.md`) e orientação de 13/10/2026: "um motor de busca de atualizações sobre cada tema, para não montarmos questões, aulas, nem corrigirmos questões com informações erradas". Ramo `vigilancia-tema` (sobre `aula-importacao`, com o painel do ramo `vigilancia-painel`). Sem IA no caminho automático; nenhuma chave usada.

## 1. O que já existia (auditado antes)

| Peça | Onde | Como ficou |
|---|---|---|
| Vigia de links | `ch_source_watch` + `ch_worker_watch_due`/`ch_worker_watch_result` (2800); `worker.checkSources` no Cloud Run (tarefa a cada minuto) | **Estendido**, não duplicado |
| Mudanças | `ch_source_changes` (`candidate_versions` = nº de versões candidatas de aula) | + `version_candidates` (jsonb) e `details` |
| Comparação de texto | `sourceDiff.ts` / `ch_source_diffs` | reaproveitada (snapshot sem a data da página) |
| O que depende da fonte | `ch_flag_dependents` | reaproveitado em mudança, retratação e bloqueio |
| Sites oficiais | `ch_official_domains` (9610) | + `watch_interval_days`; +10 sites que as fontes vigiadas já usavam |
| Fila, IA, Central de IAs | `ch_jobs`, `ai_functions` (lista dinâmica da 9910) | etapa `source_change_analysis`; função `analise_mudancas` desligada |

## 2. O que foi feito

Migrações: `20261003009940_vigilancia_cientifica.sql`, `20261003009941_vigilancia_painel.sql`, `20261003009960_vigilancia_por_tema.sql` (9960 roda depois da 9950, a importação de aula).

- **Vigia**: frequência pelo site (MS, Conitec, Anvisa, INCA, Inep: 1 dia; DOU, Planalto, MEC, CFM, sociedades, OMS/OPAS: 7 dias; nulo = governo 1, outros 7; `app_admin_vigilance_set_interval`). Só sites da lista oficial ativa (cada redirecionamento conferido). Lote de 40 com reserva de 20 min. Pedido condicional (ETag/Last-Modified, 304). HTML: impressão do conteúdo principal **sem** "Publicado em/Atualizado em". PDF: bytes + texto (bytes diferentes e texto igual = só metadados). Troca de método = base nova, sem mudança falsa; a tarefa antiga do Cloud Run continua funcionando. Fora do ar 2 vezes = item; voltou = item fecha.
- **Detector de versões** (sem IA): links de documento novos, atos (portaria, resolução, nota técnica…), datas, "anexo alterado/retificação/republicação/revoga" → `ch_source_changes.version_candidates` `[{url, titulo, data, ato}]` (URL só se estiver na lista oficial). Conteúdo baixado é sempre dado (cortado, sem caracteres invisíveis; nada é seguido).
- **Retratação**: `doi`/`pmid` em `ch_sources` (41 preenchidos a partir do catálogo importado, campo "versão"); Crossref semanal (`updated-by`: retraction/withdrawal/removal = retratada; expression of concern = alerta). Retratada: `retracted_at`, nota, status `withdrawn`, evidências desatualizadas e dependentes em revisão.
- **Confiabilidade**: 5 dimensões em PONTOS (0 até o peso; total = soma; correspondência clínica nula no nível da fonte). Pesos são configuração (`ch_vigilance_config`), não escala validada. Quarentena pela regra (sem origem conferível ou % abaixo de 50) **só avisa**; trava quando a equipe confirma. Bloqueio obrigatório: retratada ou bloqueada pela equipe (evidência nova vira "insuficiente"; pessoa recebe recusa).
- **Publicação automática (tabela 7) no banco**: `ch_auto_change_policy` (clínico/gabarito nunca automáticos — restrição) + gatilhos: a vigilância nunca muda questão, alternativa, justificativa, análise, comentário, cartão, afirmação, aula, material, publicação; o gabarito oficial não muda por nenhuma automação (chave de serviço).
- **Fila / painel (contrato V2)**: `app_admin_vigilance_summary`, `_queue`, `_mark` (bloquear = bloqueia a FONTE), `_set_interval`, `app_admin_source_quality`, `_override`, `app_admin_vigilance_request_analysis` (só mudança/versão nova; desligada = "A função 'Análise do que mudou' está desligada na Central de IAs."). Todas para administrador e editor; aluno e visitante barrados. Vocabulário: `fonte.nivel` = A–E da biblioteca; `fonte.status` = current/superseded/withdrawn (e `descoberto` para documento achado numa página-índice, ainda fora da biblioteca).
- **Por tema**: `ch_topic_dossiers` + `ch_topic_sources` (principal/complementar/histórica), palavras-chave editáveis, prazo de conferência. Semente: Tuberculose (3 fontes da GR-001) e Rotina do pré-natal de risco habitual (fontes da aula de pré-natal). `ch_index_pages` (notas informativas 2025/2026 do gov.br/aids, notas técnicas, publicações de TB, guias e manuais 2026, PCDT da Conitec, provas do Inep): item novo que casa com palavra-chave do tema = `fonte_nova` do tema. `ch_topic_freshness` → ok | vencido | mudanca_pendente | sem_dossie, com motivos. **Portão** (`ch_vigilance_config.topic_gate`): desligado (padrão) / aviso / bloqueia, só o administrador muda; ligado na importação de aula e na publicação por uma casca (`*_antes_tema`). Tela: cartões por tema e situação do tema no detalhe da unidade.

Casos reais de teste: Nota Informativa nº 2/2026-CGTM (BPaLM, 30/09/2026) e nº 25/2025 (TPT com rifampicina) nas páginas oficiais; nº 1/2026 (hepatite C em gestantes) casa com o pré-natal. WebFetch não mostra a lista dessas páginas (montada no navegador); o HTML cru (curl, uma vez) tem os itens.

## 3. Motor de impacto (etapa 3 — só o desenho)

1. Entrada: item aberto da fila (mudança, versão nova, retratada, documento novo do tema).
2. Alcance: fontes do dossiê do tema → `question_source_links` (9900) e `question_claims`/`ch_evidence` → questões; `ch_units` do tema → aulas, flashcards, cards; `guideline_updates` do tema.
3. Classificação por trecho (sem IA, `sourceDiff`): número/negação/critério mudou = alta; só forma = baixa. IA só por pedido ("Análise do que mudou").
4. Saída: `content_impact_queue` (um item por conteúdo afetado, com o trecho antes/depois e a fonte), para o revisor médico da área; nada muda sozinho (tabela 7).
5. Fechamento: resolver o item do conteúdo marca a evidência reconferida; o tema volta a "ok" quando todos fecham e o dossiê é conferido.
6. Depois: PubMed (E-utilities) semanal para PMID; Diário Oficial por assunto quando houver feed oficial; busca aberta só como descoberta, sempre confirmada no órgão emissor.

## 4. Pacote e testes

Pacote: `~/Downloads/publicacao-staziamed-2026-10-13-vigilancia-tema/` (1-Vigilancia.sql, 0-CONFERIR.sql, LEIA-ME.txt), colar DEPOIS da rodada 2 e da aula GR-001. Simulação: `.superpowers/sdd/vigilancia-tema/simular.mjs` (log em `logs/simulacao.txt`). Testes: `vigilanciaLeitura`, `vigilanciaBanco`, `vigilanciaTemasTela` + os antigos afetados.
