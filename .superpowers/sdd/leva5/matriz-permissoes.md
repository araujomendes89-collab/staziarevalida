| função / tabela | visitante | aluno | revisor da área (sem equipe) | revisor de OUTRA área (sem equipe) | editor | editor + revisor da área | administrador |
|---|---|---|---|---|---|---|---|
| app_support_contact() | libera | libera | libera | libera | libera | libera | libera |
| app_admin_save_support_contact(e-mail) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera |
| app_report_problem(tela, texto) | NEGA | libera | libera | libera | libera | libera | libera |
| app_admin_reports() | NEGA | NEGA | NEGA | NEGA | libera | libera | libera |
| app_admin_report_resolve(1) | NEGA | NEGA | NEGA | NEGA | libera | libera | libera |
| app_ch_documents() | NEGA | NEGA | libera | libera | libera | libera | libera |
| app_ch_processing_settings() | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera |
| app_ch_set_processing_settings(teto) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera |
| ch_worker_processing_settings() (serviço) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| ch_worker_note_credit_pause() (serviço) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| app_ch_publish_preview(unidade) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera (erro: Versão não encontrada.) |
| app_ch_publish(unidade, opções) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| app_ch_retire(unidade, motivo) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera (erro: Não há publicação ativa dessa versão.) |
| app_ch_new_version(unidade) | NEGA | NEGA | libera (erro: Versão não encontrada.) | libera (erro: Versão não encontrada.) | libera (erro: Versão não encontrada.) | libera (erro: Versão não encontrada.) | libera (erro: Versão não encontrada.) |
| app_ch_claim_can_confirm(afirmação) | NEGA | NEGA | libera | libera | libera | libera | libera |
| app_ch_discard_evidence(evidência) | NEGA | NEGA | libera (erro: Evidência não encontrada.) | libera (erro: Evidência não encontrada.) | libera (erro: Evidência não encontrada.) | libera (erro: Evidência não encontrada.) | libera (erro: Evidência não encontrada.) |
| app_ch_confirm_critical(afirmação) | NEGA | NEGA | libera (erro: Afirmação não encontrada.) | libera (erro: Afirmação não encontrada.) | libera (erro: Afirmação não encontrada.) | libera (erro: Afirmação não encontrada.) | libera (erro: Afirmação não encontrada.) |
| app_ch_visual_review(material) | NEGA | NEGA | NEGA | NEGA | libera (erro: Versão não encontrada.) | libera (erro: Versão não encontrada.) | libera (erro: Versão não encontrada.) |
| app_ch_visual_list() | NEGA | NEGA | NEGA | NEGA | libera | libera | libera |
| ch_publish_problems(unidade) (interna) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| app_ch_reanalysis_status() | NEGA | NEGA | libera | libera | libera | libera | libera |
| app_ch_reanalysis_request() | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera (erro: Nenhuma questão está esperando reanálise) |
| app_ch_request_sources_check() | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera |
| app_ch_taxonomy_draft() | NEGA | NEGA | NEGA | NEGA | libera | libera | libera |
| app_ch_taxonomy_publish() | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera (erro: Não há rascunho para publicar.) |
| ch_worker_reanalysis_claim() (serviço) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| ch_worker_document_extraction() (serviço) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| app_plans_info() | NEGA | libera | libera | libera | libera | libera | libera |
| app_admin_tutor_save_config() | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | libera |
| ch_worker_tutor_settings() (serviço) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| ch_worker_tutor_stt_today() (serviço) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| ch_worker_ai_save_settings() (serviço) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| tabela student_reports (select) | NEGA | libera (0 linhas) | libera (0 linhas) | libera (0 linhas) | libera (1 linha) | libera (1 linha) | libera (1 linha) |
| tabela support_config (select) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| tabela ch_processing_settings (select) | libera (0 linhas) | libera (0 linhas) | libera (0 linhas) | libera (0 linhas) | libera (0 linhas) | libera (0 linhas) | libera (1 linha) |
| tabela ch_reanalysis_control (select) | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA | NEGA |
| tabela ch_documents (select, documento do editor) | libera (0 linhas) | libera (0 linhas) | libera (0 linhas) | libera (0 linhas) | libera (1 linha) | libera (1 linha) | libera (1 linha) |
| tabela ch_blocks/pages (select) | libera (0 linhas) | libera (0 linhas) | libera (0 linhas) | libera (0 linhas) | libera (0 linhas) | libera (0 linhas) | libera (0 linhas) |
