| função / tabela | visitante | aluno (teste valendo) | aluno (teste vencido) | revisor PEDIATRIA (sem equipe) | revisor CIRURGIA (sem equipe) | editor | editor + revisor PEDIATRIA | administrador |
|---|---|---|---|---|---|---|---|---|
| app_draft_questions({limit 1}) | NEGA | NEGA | NEGA | libera | libera | libera | libera | libera |
| app_draft_question_detail(rascunho) | NEGA | NEGA | NEGA | libera | libera (erro: Questão não encontrada.) | libera | libera | libera |
| app_draft_question_decide(pedir ajustes) | NEGA | libera (erro: A revisão médica desta questão é de um revisor cad) | libera (erro: A revisão médica desta questão é de um revisor cad) | libera | libera (erro: A revisão médica desta questão é de um revisor cad) | libera (erro: A revisão médica desta questão é de um revisor cad) | libera | libera (erro: A revisão médica desta questão é de um revisor cad) |
| app_draft_question_save(rascunho) | NEGA | NEGA | NEGA | NEGA | NEGA | libera (erro: Outra pessoa salvou este rascunho depois que você ) | libera (erro: Outra pessoa salvou este rascunho depois que você ) | libera (erro: Outra pessoa salvou este rascunho depois que você ) |
| app_draft_balance_answer(rascunho) | NEGA | NEGA | NEGA | NEGA | NEGA | libera (erro: Outra pessoa salvou este rascunho depois que você ) | libera (erro: Outra pessoa salvou este rascunho depois que você ) | libera (erro: Outra pessoa salvou este rascunho depois que você ) |
| app_staziamed_topics() | NEGA | NEGA | NEGA | libera | libera | libera | libera | libera |
| app_staziamed_requests() | NEGA | NEGA | NEGA | libera | libera | libera | libera | libera |
| app_staziamed_request_create(...) | NEGA | libera (erro: Gerar questões StaziaMed é da equipe (administrado) | libera (erro: Gerar questões StaziaMed é da equipe (administrado) | libera (erro: Gerar questões StaziaMed é da equipe (administrado) | libera (erro: Gerar questões StaziaMed é da equipe (administrado) | libera (erro: Modo inválido.) | libera (erro: Modo inválido.) | libera (erro: Modo inválido.) |
| app_staziamed_check_enqueue([rascunho]) | NEGA | libera (erro: Conferir é da equipe (administrador ou editor).) | libera (erro: Conferir é da equipe (administrador ou editor).) | libera (erro: Conferir é da equipe (administrador ou editor).) | libera (erro: Conferir é da equipe (administrador ou editor).) | libera | libera | libera |
| app_staziamed_pending_checks() | NEGA | libera (erro: Conferir é da equipe (administrador ou editor).) | libera (erro: Conferir é da equipe (administrador ou editor).) | libera (erro: Conferir é da equipe (administrador ou editor).) | libera (erro: Conferir é da equipe (administrador ou editor).) | libera | libera | libera |
| app_staziamed_source_enqueue(rascunho) | NEGA | libera (erro: Buscar fonte oficial é da equipe (administrador ou) | libera (erro: Buscar fonte oficial é da equipe (administrador ou) | libera (erro: Buscar fonte oficial é da equipe (administrador ou) | libera (erro: Buscar fonte oficial é da equipe (administrador ou) | libera (erro: Cadastre fontes oficiais na Central de Conteúdo) | libera (erro: Cadastre fontes oficiais na Central de Conteúdo) | libera (erro: Cadastre fontes oficiais na Central de Conteúdo) |
| app_staziamed_preview(rascunho) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera |
| app_staziamed_publish(rascunho) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera (erro: Publique só a versão aprovada pelo revisor médico.) |
| app_staziamed_retire(questão) | NEGA | libera (erro: Recolher é do administrador.) | libera (erro: Recolher é do administrador.) | libera (erro: Recolher é do administrador.) | libera (erro: Recolher é do administrador.) | libera (erro: Recolher é do administrador.) | libera (erro: Recolher é do administrador.) | libera (erro: Questão não encontrada.) |
| app_draft_source_accept(proposta) | NEGA | libera (erro: Usar fontes é da equipe (administrador ou editor).) | libera (erro: Usar fontes é da equipe (administrador ou editor).) | libera (erro: Usar fontes é da equipe (administrador ou editor).) | libera (erro: Usar fontes é da equipe (administrador ou editor).) | libera (erro: Proposta não encontrada.) | libera (erro: Proposta não encontrada.) | libera (erro: Proposta não encontrada.) |
| app_ch_question_analysis_preview() | NEGA | NEGA | NEGA | libera | libera | NEGA | libera | libera |
| app_ch_question_analysis_request() | NEGA | NEGA | NEGA | libera (erro: Nenhuma IA está ligada na Central de IAs: ligue um) | libera (erro: Nenhuma IA está ligada na Central de IAs: ligue um) | NEGA | libera (erro: Nenhuma IA está ligada na Central de IAs: ligue um) | libera (erro: Nenhuma IA está ligada na Central de IAs: ligue um) |
| app_ch_draft_check_preview() | NEGA | NEGA | NEGA | libera | libera | NEGA | libera | libera |
| app_ch_draft_check_request() | NEGA | NEGA | NEGA | libera | libera (erro: Nenhum rascunho para conferir com estes filtros: t) | NEGA | libera | libera |
| app_ch_ai_requests() | NEGA | NEGA | NEGA | libera | libera | libera | libera | libera |
| app_ch_ai_request_cancel(pedido) | NEGA | NEGA | NEGA | libera (erro: Só quem fez o pedido ou um administrador pode canc) | libera (erro: Só quem fez o pedido ou um administrador pode canc) | libera (erro: Só quem fez o pedido ou um administrador pode canc) | libera (erro: Só quem fez o pedido ou um administrador pode canc) | libera |
| app_ch_source_candidates() | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera |
| app_ch_source_candidate_approve(candidato) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera (erro: Candidato não encontrado.) |
| app_ch_source_search_check(área, tema) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera |
| has_ineditas() | libera | libera | libera | libera | libera | libera | libera | libera |
| ineditas_gate() | libera | libera | libera | libera | libera | libera | libera | libera |
| app_start_session(Questões StaziaMed) | NEGA | libera (erro: Nenhuma questão encontrada com esses filtros.) | NEGA | libera (erro: Nenhuma questão encontrada com esses filtros.) | libera (erro: Nenhuma questão encontrada com esses filtros.) | libera (erro: Nenhuma questão encontrada com esses filtros.) | libera (erro: Nenhuma questão encontrada com esses filtros.) | libera (erro: Nenhuma questão encontrada com esses filtros.) |
| ch_worker_staziamed_acervo (servico) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| ch_worker_ai_request_get (servico) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| ch_worker_source_currency_pending (servico) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| ch_draft_triage (interna) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| ch_draft_official_evidence (interna) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| tabela draft_questions (linhas visíveis) | vê 0 | vê 0 | vê 0 | vê 1 | vê 1 | vê 1 | vê 1 | vê 1 |
| tabela draft_question_events (linhas visíveis) | vê 0 | vê 0 | vê 0 | vê 2 | vê 2 | vê 2 | vê 2 | vê 2 |
| tabela ch_ai_requests (linhas visíveis) | vê 0 | vê 0 | vê 0 | vê 0 | vê 0 | vê 0 | vê 0 | vê 1 |
| tabela staziamed_requests (linhas visíveis) | vê 0 | vê 0 | vê 0 | vê 0 | vê 0 | vê 0 | vê 0 | vê 0 |
