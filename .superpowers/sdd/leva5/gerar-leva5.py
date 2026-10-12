#!/usr/bin/env python3
# Gera o pacote de SQL da LEVA 5 para colar no Supabase, a partir do ramo leva5. Uso: gerar-leva5.py <worktree> <pasta-de-saida>
# Formato do pacote da leva 3: cabecalho em portugues simples, migracoes em ordem, "select 'OK: ...' as resultado" no fim com conferencias
# de leitura (true) que foram PROVADAS no estado de producao simulado (verificar-pacote.mjs).
import os, sys, shutil
W, OUT = sys.argv[1], sys.argv[2]
M = os.path.join(W, "supabase", "migrations")
AQUI = os.path.dirname(os.path.abspath(__file__))
def arq(num):
    achados = [f for f in os.listdir(M) if f.startswith(f"20261003{num}_")]
    if len(achados) != 1: raise SystemExit(f"migracao {num}: esperava 1 arquivo, achei {achados}")
    return achados[0]
def lista(nomes): return ", ".join(f"'{n}'" for n in nomes)
def cont_funcs(nomes): return "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (" + lista(nomes) + "))"
def cont_gat(nomes): return "(select count(*) from pg_trigger t where not t.tgisinternal and t.tgname in (" + lista(nomes) + "))"
def col(tab, c): return f"exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = '{tab}' and column_name = '{c}')"
def usa(func, trecho): return f"position('{trecho}' in pg_get_functiondef('public.{func}'::regprocedure)) > 0"
def fechado_visitante(nomes): return "not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (" + lista(nomes) + ") and has_function_privilege('anon', p.oid, 'execute'))"
def fechado_logado(nomes): return "not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (" + lista(nomes) + ") and has_function_privilege('authenticated', p.oid, 'execute'))"
def tabela_fechada(t): return f"(select c.relrowsecurity and not has_table_privilege('anon', c.oid, 'select') and not has_table_privilege('authenticated', c.oid, 'select') from pg_class c where c.oid = 'public.{t}'::regclass)"
def rls_sem_visitante(t): return f"(select c.relrowsecurity and not has_table_privilege('anon', c.oid, 'select') from pg_class c where c.oid = 'public.{t}'::regclass)"
def rls_so_logado(t): return f"(select c.relrowsecurity and not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = '{t}' and (pp.roles @> array['anon']::name[] or pp.roles @> array['public']::name[])) from pg_class c where c.oid = 'public.{t}'::regclass)"
def politica(tab, nome): return f"exists (select 1 from pg_policies where schemaname = 'public' and tablename = '{tab}' and policyname = '{nome}')"
def sem_coluna_aberta(tab, cols): return "not (" + " or ".join(f"has_column_privilege('{r}', 'public.{tab}', '{c}', 'select')" for c in cols for r in ("anon", "authenticated")) + ")"

P1_TELAS = ["app_report_problem", "app_admin_reports", "app_admin_report_resolve", "app_admin_save_support_contact"]
P1_INT = ["student_reports_guard"]
P2_TELAS = ["app_ch_processing_settings", "app_ch_set_processing_settings"]
P2_INT = ["ch_worker_processing_settings", "ch_worker_document_spend", "ch_worker_note_credit_pause", "ch_worker_apply_reference_cleanup_free"]
P3_TELAS = ["app_ch_publish", "app_ch_publish_preview", "app_ch_retire", "app_ch_new_version", "app_ch_claim_can_confirm", "app_ch_claim_evidence", "app_ch_discard_evidence",
            "app_ch_confirm_critical", "app_ch_link_evidence", "app_ch_conflict_decide", "app_ch_visual_review", "app_ch_visual_list", "app_ch_visual_file", "app_ch_visual_material"]
P3_INT = ["ch_publish_problems", "ch_publish_problems_base", "ch_publish_problems_cards", "ch_publish_problems_student", "ch_cards_plan", "ch_claim_area_codes", "ch_claim_effective_status",
          "ch_claim_recompute_status", "ch_distribute", "ch_distribute_cards", "ch_distribution_plan", "ch_evidence_counts", "ch_evidence_settled", "ch_hide_card_rows", "ch_hide_cards",
          "ch_is_official_source", "ch_node_area_code", "ch_student_area", "ch_student_lesson", "ch_undistribute", "ch_version_cards", "ch_visual_area_code", "ch_visual_can_review",
          "ch_visual_is_clinical", "ch_visual_review_pending", "ch_visual_text", "lessons_central_guard", "ch_worker_visual_files"]
P4_TELAS = ["app_ch_reanalysis_status", "app_ch_reanalysis_request", "app_ch_request_sources_check", "app_ch_taxonomy_draft", "app_ch_taxonomy_publish", "app_ch_taxonomy_add_alias", "app_ch_taxonomy_remove_alias"]
P4_INT = ["ch_student_released", "question_analysis_fits", "ch_card_shows", "ch_raw_app_question_timeline", "ch_reanalysis_waiting", "ch_taxonomy_carry_forward", "ch_taxonomy_map",
          "ch_worker_reanalysis_claim", "ch_worker_reanalysis_done", "ch_worker_document_extraction"]
P5_TELAS = ["app_plans_info", "app_admin_tutor_save_config"]
P5_INT = ["ch_worker_tutor_settings", "ch_worker_tutor_stt_today", "ch_worker_ai_save_settings"]

PARTES = [
 dict(nome="1-colar-ANTES-do-site-parte-1-Suporte-e-relatos", rotulo="1-Suporte", nums=["009835"],
      desc="Suporte: e-mail de contato único, 'Relatar um problema' do aluno e a lista de relatos para a equipe",
      equipe=["Administração > Configurações ganha \"Contato de suporte\" (o administrador troca o e-mail; nasce suporte@staziamed.com.br) e \"Relatos dos alunos\" (data, aluno, tela, texto; marcar como resolvido e reabrir; o Registro anota quem fez, sem copiar o texto do aluno).",
              "Apagar a conta de um aluno apaga também os relatos dele."],
      aluno=["Conta > Ajuda e suporte: o aluno escolhe a tela e escreve de 10 a 1000 letras (no máximo 5 relatos em 24 horas). O e-mail de suporte aparece no login, no cadastro, na recuperação de senha e nos avisos de acesso bloqueado.",
             "O visitante (sem login) só consegue ler o e-mail de suporte; mais nada."],
      telas=P1_TELAS, internas=P1_INT, tabelas=[]),
 dict(nome="2-colar-ANTES-do-site-parte-2-Documentos-e-processamento", rotulo="2-Documentos", nums=["009840", "009841", "009842", "009843", "009844"],
      desc="Central de Conteúdo, Documentos: a equipe vê os documentos de todos, 'Sem rascunhos', pausa sem crédito de IA, teto por documento (desligado) e 'Tirar marcas de terceiros'",
      equipe=["Editor e administrador passam a ver os documentos enviados por qualquer pessoa da equipe (lista, páginas e texto lido). Aluno e revisor que não é da equipe continuam sem ver os dos outros.",
              "Documento que termina sem nenhum rascunho passa a ter a situação \"Sem rascunhos para revisar\" (com o motivo). Os documentos antigos que já estão \"Aguardando revisão\" sem rascunho NÃO mudam sozinhos. Isto só vale com a IMAGEM NOVA do Cloud Run.",
              "Falta de crédito ou cota da IA vira pausa com aviso (volta sozinha a cada 10 minutos) em vez de falha. Isto só vale com a IMAGEM NOVA do Cloud Run.",
              "Teto de gasto por documento: a estrutura nasce DESLIGADA e sem valor (nada muda até o dono ligar).",
              "\"Tirar marcas de terceiros\" (só administrador): prévia, aplicar e desfazer. Nenhum campo de licença volta."],
      aluno=["Nada que apareça."],
      telas=P2_TELAS, internas=P2_INT, tabelas=["ch_processing_settings"]),
 dict(nome="3-colar-ANTES-do-site-parte-3-Publicar-ao-aluno-e-conferencias", rotulo="3-Publicar", nums=["009860", "009861", "009862", "009863", "009864"],
      desc="Central de Conteúdo, Unidades: publicar uma unidade cria a aula e os flashcards do aluno (prévia, retirar, nova versão); dose só conferida pelo revisor da área; conflitos decididos destravam; revisão médica dos materiais visuais",
      equipe=["Publicar uma unidade aprovada passa a mostrar uma PRÉVIA e, confirmado, cria a aula em Estudar > Aulas e põe os flashcards no baralho de todos os alunos. Retirar tira do ar sem apagar o progresso. \"Criar versão para corrigir\" fecha o ciclo. A PUBLICAÇÃO CONTINUA DESLIGADA e em modo sombra (as chaves não mudam).",
              "A aula que veio da Central fica trancada na tela Aulas (texto, pontos-chave, área, publicação e vínculo só mudam pela Central).",
              "Só o revisor médico cadastrado na área da afirmação confirma dose, via, frequência e contraindicação. Conflito decidido a favor da fonte que sustenta e evidência corrigida (descartada com motivo) deixam de travar a publicação.",
              "Material visual com dose ou contraindicação fica com o download travado até um revisor médico da área registrar a revisão.",
              "Funções internas da publicação (ch_publish_problems e outras) deixam de ser chamáveis por quem está logado: o aplicativo não usa essas chamadas direto."],
      aluno=["Nada aparece enquanto a publicação estiver desligada. Quando o dono ligar, o aluno recebe título, texto revisado, pontos-chave e as fontes oficiais (nunca afirmações, trechos das fontes, nome de arquivo nem de IA)."],
      telas=P3_TELAS, internas=P3_INT, tabelas=[]),
 dict(nome="4-colar-ANTES-do-site-parte-4-Modo-sombra-reanalise-e-taxonomia", rotulo="4-Sombra", nums=["009870", "009871", "009872", "009873"],
      desc="Central de Conteúdo: modo sombra de verdade (análise de questão e cartão de atualização), reanálise por IA pedida pela tela, conferência das fontes monitoradas, PDF de fonte já enviado, versão nova da taxonomia",
      equipe=["Análise de questão e cartão de atualização APROVADOS ficam guardados enquanto o modo sombra estiver ligado ou a publicação desligada. Equipe e revisores continuam vendo. Nada é apagado.",
              "Botão \"Reanalisar agora\" e chave \"Análise automática\" (a IA só propõe; quem decide é o revisor médico). Botão \"Conferir fontes monitoradas\" passa a deixar o pedido para a próxima rodada (até 10 minutos). PDF de fonte já enviado em Documentos passa a virar trechos. Isto só vale com a IMAGEM NOVA do Cloud Run.",
              "Versão nova da taxonomia: unidades, afirmações e apelidos seguem para o tema da versão nova. \"Aliases\" vira \"Apelidos\"."],
      aluno=["ATENÇÃO (leia o LEIA-ME): análises de questão e cartões de atualização que HOJE aparecem ao aluno SOMEM se o modo sombra estiver ligado ou a publicação desligada. A conferência 0 (bloco 2) mostra quantos são."],
      telas=P4_TELAS, internas=P4_INT, tabelas=["ch_reanalysis_control"]),
 dict(nome="5-colar-ANTES-do-site-parte-5-Planos-microfone-e-teto-de-IA", rotulo="5-Planos", nums=["009890", "009891", "009892"],
      desc="Planos: tela informativa para o aluno (sem preço); microfone da Nexus só da equipe até haver tetos; teto geral de IA do mês (desligado, só avisa)",
      equipe=["Administração > Configurações > Nexus: chave \"Microfone só para a equipe\" (nasce LIGADA) e três tetos diários da transcrição (vazios). O banco só deixa abrir o microfone aos alunos com os três tetos e o preço da transcrição preenchidos; a voz do professor só abre aos alunos com preço maior que zero.",
              "Administração > Central de IAs: bloco \"Teto geral do mês (só avisa)\", desligado e vazio. Não para nenhuma IA.",
              "Administração > Planos: o aviso agora explica o que o aluno vê."],
      aluno=["Nova tela \"Planos\" (menu): situação da pessoa e um cartão por plano com o que a equipe escreveu. SEM preço e SEM botão de assinar.",
             "Microfone da Nexus: o aluno deixa de ver o microfone (escreve pelo Chat) se a transcrição estiver ligada no servidor, até o dono abrir."],
      telas=P5_TELAS, internas=P5_INT, tabelas=[]),
]

def conferencias(p):
    r = p["rotulo"]; c = []
    if r == "1-Suporte":
        c = [("contato_de_suporte_criado", "to_regclass('public.support_config') is not null and (select count(*) from public.support_config) = 1"),
             ("tabela_dos_relatos", "to_regclass('public.student_reports') is not null"),
             ("cinco_funcoes_do_suporte", cont_funcs(["app_support_contact", "app_report_problem", "app_admin_reports", "app_admin_report_resolve", "app_admin_save_support_contact"]) + " = 5"),
             ("gatilho_do_limite_de_relatos", cont_gat(["student_reports_guard"]) + " = 1"),
             ("visitante_so_le_o_contato", "has_function_privilege('anon', 'public.app_support_contact()', 'execute')"),
             ("relatos_so_do_proprio_aluno_e_da_equipe", politica("student_reports", "relatos: o aluno grava o próprio") + " and " + politica("student_reports", "relatos: só a equipe lê") + " and " + rls_sem_visitante("student_reports")),
             ("contato_fechado_ao_app", tabela_fechada("support_config"))]
    elif r == "2-Documentos":
        c = [("equipe_ve_os_documentos_de_todos", politica("ch_documents", "documentos: dono ou equipe") + " and " + politica("ch_pages", "páginas: dono ou equipe") + " and " + politica("ch_blocks", "blocos: dono ou equipe")),
             ("politicas_antigas_trocadas", "not " + politica("ch_documents", "documentos: dono ou admin")),
             ("situacao_sem_rascunhos_aceita", "pg_get_constraintdef((select oid from pg_constraint where conrelid = 'public.ch_documents'::regclass and conname = 'ch_documents_status_check')) like '%no_drafts%'"),
             ("tabela_do_teto_por_documento", "to_regclass('public.ch_processing_settings') is not null and (select count(*) from public.ch_processing_settings) = 1"),
             ("seis_funcoes_do_processamento", cont_funcs(["app_ch_processing_settings", "app_ch_set_processing_settings", "ch_worker_processing_settings", "ch_worker_document_spend", "ch_worker_note_credit_pause", "ch_worker_apply_reference_cleanup_free"]) + " = 6"),
             ("tirar_marcas_sem_licenca", "to_regprocedure('public.ch_worker_apply_reference_cleanup_free(uuid, uuid, text[], jsonb)') is not null"),
             ("tabela_do_teto_leitura_so_administrador", politica("ch_processing_settings", "ajustes do processamento: administrador lê") + " and " + rls_so_logado("ch_processing_settings"))]
    elif r == "3-Publicar":
        c = [("aula_ligada_a_unidade", col("lessons", "ch_unit_id") + " and " + col("lessons", "origin") + " and " + col("lessons", "ch_version_id")),
             ("aula_da_central_trancada", cont_gat(["lessons_central_guard_trg"]) + " = 1"),
             ("publicacao_guarda_a_aula", col("ch_publications", "lesson_id") + " and " + col("ch_publications", "distribution")),
             ("cartao_da_central_no_baralho", col("flashcards", "ch_unit_id") + " and " + col("flashcards", "ch_card_key") + " and " + col("flashcard_states", "hidden_due")),
             ("evidencia_descartavel", col("ch_evidence", "discarded_at") + " and " + col("ch_evidence", "discard_reason")),
             ("revisao_medica_do_material_visual", col("ch_visual_versions", "medical_review_at") + " and " + col("ch_visual_versions", "medical_review_by")),
             ("previa_e_publicar_com_opcoes", "to_regprocedure('public.app_ch_publish_preview(uuid, jsonb)') is not null and to_regprocedure('public.app_ch_publish(uuid, jsonb)') is not null and to_regprocedure('public.app_ch_new_version(uuid)') is not null"),
             ("so_revisor_da_area_confirma_dose", "to_regprocedure('public.app_ch_claim_can_confirm(uuid)') is not null"),
             ("colunas_internas_da_aula_fechadas_ao_aluno", sem_coluna_aberta("lessons", ["origin", "ch_unit_id", "ch_version_id", "central_updated_at"]))]
    elif r == "4-Sombra":
        c = [("aluno_so_recebe_com_as_chaves_liberadas", "to_regprocedure('public.ch_student_released()') is not null"),
             ("analise_da_questao_obedece_as_chaves", usa("question_analysis_fits(text, character)", "ch_student_released")),
             ("cartao_de_atualizacao_obedece_as_chaves", usa("ch_card_shows(jsonb)", "ch_student_released")),
             ("linha_do_tempo_obedece_as_chaves", usa("ch_raw_app_question_timeline(text)", "ch_student_released")),
             ("tabela_da_reanalise", "to_regclass('public.ch_reanalysis_control') is not null and (select count(*) from public.ch_reanalysis_control) = 1"),
             ("funcoes_da_reanalise_e_das_fontes", cont_funcs(["app_ch_reanalysis_status", "app_ch_reanalysis_request", "app_ch_request_sources_check", "ch_worker_reanalysis_claim", "ch_worker_reanalysis_done", "ch_reanalysis_waiting"]) + " = 6"),
             ("taxonomia_guarda_o_tema_de_origem", col("ch_taxonomy_nodes", "origin_node_id")),
             ("pdf_de_fonte_ja_enviado", "to_regprocedure('public.ch_worker_document_extraction(uuid)') is not null")]
    else:
        c = [("tela_de_planos_do_aluno", "to_regprocedure('public.app_plans_info()') is not null"),
             ("microfone_so_da_equipe_existe", col("tutor_config", "stt_team_only") + " and " + col("tutor_config", "stt_trial_daily_seconds") + " and " + col("tutor_config", "stt_paid_daily_seconds") + " and " + col("tutor_config", "stt_account_daily_seconds")),
             ("salvar_o_tutor_confere_microfone_e_voz", usa("app_admin_tutor_save_config(jsonb, text)", "stt_team_only")),
             ("servidor_le_os_tetos_do_microfone", usa("ch_worker_tutor_settings()", "stt_team_only")),
             ("transcricao_de_hoje", "to_regprocedure('public.ch_worker_tutor_stt_today(uuid)') is not null"),
             ("teto_geral_do_mes_existe", col("ai_settings", "overall_cap_enabled") + " and " + col("ai_settings", "overall_monthly_cap_usd")),
             ("salvar_a_central_confere_o_teto_geral", usa("ch_worker_ai_save_settings(uuid, jsonb)", "overall_cap_enabled"))]
    c += [("visitante_nao_chama_nenhuma_funcao_nova", fechado_visitante(p["telas"] + p["internas"])),
          ("so_a_tela_e_chamavel_por_quem_loga", fechado_logado(p["internas"]))]
    if p["tabelas"]: c.append(("tabelas_novas_fechadas_ao_app", " and ".join(tabela_fechada(t) if t != "ch_processing_settings" else rls_so_logado(t) for t in p["tabelas"])))
    return c

os.makedirs(OUT, exist_ok=True)
resumo = []
for p in PARTES:
    blocos = []
    for n in p["nums"]:
        f = arq(n)
        blocos.append(f"-- ======================================================================\n-- {f}\n-- ======================================================================\n" + open(os.path.join(M, f), encoding="utf-8").read().rstrip() + "\n")
    cab = (f"-- StaziaMed, LEVA 5 (finalização do gerenciamento da Fase 1), parte {p['rotulo']}: {p['desc']}\n"
           f"-- Cole este arquivo INTEIRO no editor SQL do Supabase (sem selecionar nada) e clique em Run. Para colar de novo, cole DESTA parte até a última, na ordem.\n"
           f"-- ORDEM DE PUBLICAÇÃO: as 5 partes SQL (1 a 5) PRIMEIRO; depois a imagem do Cloud Run; por último o site.\n"
           f"-- Antes da primeira parte, rode o arquivo 0-CONFERIR-primeiro-nao-altera-nada.sql e mostre o resultado ao Claude.\n"
           f"-- O que muda para a equipe:\n" + "".join(f"--   * {t}\n" for t in p["equipe"]) +
           f"-- O que muda para o aluno:\n" + "".join(f"--   * {t}\n" for t in p["aluno"]) +
           f"-- Arquivos incluídos, em ordem: {', '.join(arq(n) for n in p['nums'])}\n\n")
    conf = ",\n".join(f"  {expr} as {nome}" for nome, expr in conferencias(p))
    rod = f"\n-- conferência final (só leitura): todas as colunas abaixo devem dar \"true\"\nselect 'OK: {p['rotulo']} colada' as resultado,\n{conf};\n"
    texto = cab + "\n".join(blocos) + rod
    open(os.path.join(OUT, p["nome"] + ".sql"), "w", encoding="utf-8").write(texto)
    resumo.append((p["nome"], len(texto.encode("utf-8")), p["nums"]))
shutil.copyfile(os.path.join(AQUI, "pacote", "0-CONFERIR.sql"), os.path.join(OUT, "0-CONFERIR-primeiro-nao-altera-nada.sql"))
if os.path.exists(os.path.join(AQUI, "pacote", "0-LEIA-ME.txt")): shutil.copyfile(os.path.join(AQUI, "pacote", "0-LEIA-ME.txt"), os.path.join(OUT, "0-LEIA-ME.txt"))
print("\n".join(f"{n:78s} {t/1024:6.1f} KB  {','.join(x)}" for n, t, x in resumo))
