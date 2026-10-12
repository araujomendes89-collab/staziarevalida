#!/usr/bin/env python3
# Gera o pacote de SQL da LEVA 3 para colar no Supabase, a partir do ramo leva3-final. Uso: gerar-leva3.py <worktree> <pasta-de-saida>
# Formato dos pacotes anteriores (publicacao/gerar.py): cabecalho em portugues simples, migracoes em ordem, "select 'OK: ...' as resultado" no fim,
# agora com conferencias de leitura (true/contagens) que foram PROVADAS no estado de producao simulado (verificar-pacote.mjs).
import os, sys, shutil
W, OUT = sys.argv[1], sys.argv[2]
M = os.path.join(W, "supabase", "migrations")
def arq(num):
    achados = [f for f in os.listdir(M) if f.startswith(f"20261003{num}_")]
    if len(achados) != 1: raise SystemExit(f"migracao {num}: esperava 1 arquivo, achei {achados}")
    return achados[0]

def cont_funcs(nomes): return "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (" + ", ".join(f"'{n}'" for n in nomes) + "))"
def cont_gat(nomes): return "(select count(*) from pg_trigger t where not t.tgisinternal and t.tgname in (" + ", ".join(f"'{n}'" for n in nomes) + "))"
def col(tab, c): return f"exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = '{tab}' and column_name = '{c}')"
def usa(func, trecho): return f"position('{trecho}' in pg_get_functiondef('public.{func}'::regprocedure)) > 0"
def fechado_visitante(nomes): return "not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (" + ", ".join(f"'{n}'" for n in nomes) + ") and has_function_privilege('anon', p.oid, 'execute'))"
def fechado_logado(nomes): return "not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (" + ", ".join(f"'{n}'" for n in nomes) + ") and has_function_privilege('authenticated', p.oid, 'execute'))"
def tabela_fechada(t): return f"(select c.relrowsecurity and not has_table_privilege('anon', c.oid, 'select') and not has_table_privilege('authenticated', c.oid, 'select') from pg_class c where c.oid = 'public.{t}'::regclass)"

TELAS_Q = ["app_admin_set_question_image", "app_admin_remove_question_image", "app_question_figure", "app_admin_comment_review_queue", "app_admin_comment_review", "app_admin_question_comment_decide", "app_question_comment_check", "app_admin_question_history"]
INT_Q = ["ch_worker_question_figure_confirm", "ch_worker_question_figure_drop", "questions_images_guard", "questions_keep_figure_flag", "questions_comment_review_mark", "question_comment_fields", "question_hidden_fields", "question_can_review_comment", "question_comment_assert_access", "question_person_name", "question_comment_review_missing"]
TELAS_A = ["app_lesson_watch", "app_lesson_watch_state"]
INT_A = ["ch_worker_lesson_files_reserve", "ch_worker_lesson_files_renew", "ch_worker_lesson_files_done", "ch_worker_lesson_files_release", "ch_worker_lesson_files_audit", "lesson_material_file_queue", "lesson_file_in_use", "lesson_file_reference_guard"]
TELAS_P = ["app_admin_podcast_approval"]
INT_P = ["podcast_can_approve", "podcast_approve_block_text", "ch_raw_app_admin_podcast_approve", "ch_worker_podcast_files_pending", "ch_worker_podcast_files_renew", "ch_worker_podcast_files_done", "podcast_files_queue_audio", "podcast_files_queue_audio_del", "podcast_files_queue_source", "podcast_files_guard_ref", "podcast_files_blocked"]
TELAS_PL = ["simulado_gate", "app_my_access", "app_my_benefits", "station_feedback_allowed", "app_admin_plan_benefits", "app_admin_save_plan_benefits", "app_admin_signup_trial_rule"]
INT_PL = ["subscription_trial_is_valid", "user_without_paid_access", "user_plan_lock", "user_is_paid_elite", "tutor_entitlement", "practice_sessions_simulado_gate"]

PARTES = [
 dict(nome="1-colar-ANTES-do-site-parte-1-Questoes", rotulo="1-Questoes", nums=["009700", "009701", "009702"],
      desc="aba Questões: figura da questão enviada pela equipe, comentário novo em revisão pelo revisor médico, histórico de mudanças",
      equipe=["Editor e administrador enviam a figura da questão (uma por questão, PNG ou JPG de até 5 MB, com texto alternativo de 10 a 300 letras). A questão que citava figura sem imagem entra nos treinos quando a figura é enviada.",
              "Não dá para desmarcar \"Cita figura\" enquanto a questão não tem a figura.",
              "Explicação das alternativas, conduta esperada e \"o que a questão avalia\", quando alguém da equipe grava um texto novo ou alterado, ficam \"Em revisão\" até o revisor médico da área ou o administrador aprovar (com uma nota de 10 letras ou mais). O texto que já está gravado hoje NÃO é mexido.",
              "O editor da questão mostra o histórico de mudanças (quem, quando, antes e depois), inclusive da figura."],
      aluno=["Texto de comentário NOVO ou ALTERADO some da correção e do Tutor até ser aprovado (o resto da correção, o gabarito e o enunciado continuam). Comentário que já está gravado continua visível.",
             "Só aceita como figura um arquivo que o servidor conferiu: o banco recusa caminho inventado."],
      telas=TELAS_Q, internas=INT_Q, tabelas=["question_figure_files", "question_comment_reviews"]),
 dict(nome="2-colar-ANTES-do-site-parte-2-Aulas", rotulo="2-Aulas", nums=["009710", "009711"],
      desc="Aulas: remover ou trocar um material apaga também o arquivo do depósito; o XP de concluir a aula só vem de quem assistiu até o fim",
      equipe=["Ao remover um material de aula, trocar o PDF ou o áudio, ou apagar a aula, o arquivo antigo também sai do depósito \"lessons\" (sem volta), se nenhum outro material, fonte de podcast ou retenção ainda o usa (o servidor reserva o arquivo no banco antes de apagar e confere de novo antes de cada exclusão; quem cria uma referência nova nesse instante é recusado). Os arquivos que JÁ estão esquecidos hoje não são tocados. ATENÇÃO: esta parte exige que a Fonte complementar (9620) já esteja colada (está em produção); se não estiver, a parte para com um aviso e não altera nada.",
              "Nova ação no Registro: \"Arquivo de aula apagado do depósito\"."],
      aluno=["O XP de concluir a aula (20) só vem de quem assistiu a aula até o fim de verdade: conta o tempo realmente assistido, pular o vídeo para o final não vale (concluir antes e assistir depois também paga, uma vez só). Aula com link .m3u8, com outro endereço ou sem vídeo medido deixa de dar XP; concluir continua marcando a aula como feita.",
             "Nada é retroativo: ninguém perde XP que já ganhou."],
      telas=TELAS_A, internas=INT_A, tabelas=["lesson_files_pending_delete"]),
 dict(nome="3-colar-ANTES-do-site-parte-3-Podcasts", rotulo="3-Podcasts", nums=["009720", "009721"],
      desc="Podcasts: o roteiro só é aprovado por revisor médico da área ou pelo administrador; arquivos antigos deixam de ficar esquecidos no depósito",
      equipe=["Aprovar o roteiro de um episódio passa a ser só do administrador ou do revisor médico cadastrado na grande área do episódio (e que também seja editor, para abrir a aba). Editor comum não aprova mais. Episódio sem grande área: só o administrador.",
              "Quando um áudio deixa de valer, ou uma fonte ou um episódio com arquivo some, o arquivo antigo passa a ser apagado do depósito (só o que nenhuma outra linha usa). Os arquivos que já estão esquecidos hoje NÃO são apagados: a lista está no arquivo OPCIONAL da pasta."],
      aluno=["Nada que apareça."],
      telas=TELAS_P, internas=INT_P, tabelas=["podcast_files_released"]),
 dict(nome="4-colar-ANTES-do-site-parte-4-Planos", rotulo="4-Planos", nums=["009730", "009731", "009732"],
      desc="Planos: teste grátis vencido vale como sem acesso pago (simulados completos e teste novo do Tutor), estrutura dos benefícios do Elite, cadastro sem teste quando a chave está desligada",
      equipe=["ATENÇÃO: antes de colar, rode a conferência (arquivo 0): a lista por e-mail mostra quem perde os simulados completos e o teste novo do Tutor. Equipe, revisor médico, plano pago válido e teste dentro do prazo não perdem nada.",
              "Administração > Configurações ganha o bloco \"Benefícios do plano Elite\" (nasce igual ao Pro: nada muda até o dono preencher).",
              "A chave \"Oferecer teste grátis no cadastro\" (Planos) passa a valer de verdade: desligada, o cadastro novo nasce sem teste."],
      aluno=["Quem está sem acesso pago (teste vencido, plano vencido ou conta sem assinatura) não começa simulado completo e não começa o teste novo do Tutor; questões e flashcards continuam abertos. Quem já começou o teste do Tutor segue até o prazo dele.",
             "Elite pago: o benefício só aparece quando o dono preencher."],
      telas=TELAS_PL, internas=INT_PL, tabelas=["plan_benefits"]),
]

def conferencias(p):
    r = p["rotulo"]; c = []
    if r == "1-Questoes":
        c = [("tabela_das_figuras", "to_regclass('public.question_figure_files') is not null"),
             ("funcoes_da_figura", cont_funcs(["app_admin_set_question_image", "app_admin_remove_question_image", "app_question_figure", "ch_worker_question_figure_confirm", "ch_worker_question_figure_drop"]) + " = 5"),
             ("tres_gatilhos_das_questoes", cont_gat(["questions_images_guard", "questions_keep_figure_flag", "questions_comment_review_mark"]) + " = 3"),
             ("deposito_privado_das_figuras", "exists (select 1 from storage.buckets b where b.id = 'question-figures' and b.public = false)"),
             ("coluna_comentario_em_revisao", col("questions", "comment_review")),
             ("revisao_de_comentario_completa", "cardinality(public.question_comment_review_missing()) = 0"),
             ("historico_da_questao", "to_regprocedure('public.app_admin_question_history(text, integer, integer)') is not null"),
             ("historico_registra_a_figura", usa("questions_change_trail()", "figura"))]
    elif r == "2-Aulas":
        c = [("fila_de_arquivos_de_aula", "to_regclass('public.lesson_files_pending_delete') is not null"),
             ("cinco_funcoes_do_servidor", cont_funcs(["ch_worker_lesson_files_reserve", "ch_worker_lesson_files_renew", "ch_worker_lesson_files_done", "ch_worker_lesson_files_release", "ch_worker_lesson_files_audit"]) + " = 5"),
             ("cinco_gatilhos_de_arquivo", cont_gat(["lesson_materials_file_queue_del", "lesson_materials_file_queue_upd", "lesson_materials_file_reference_guard", "podcast_sources_file_reference_guard", "ch_file_holds_file_reference_guard"]) + " = 5"),
             ("coluna_assistiu_ate_o_fim", col("lesson_progress", "watched_to_end_at")),
             ("funcao_de_assistir", "to_regprocedure('public.app_lesson_watch(uuid, integer, boolean, integer)') is not null"),
             ("xp_so_com_o_fim", usa("gam_process_lesson()", "watched_to_end_at")),
             ("gatilho_do_xp_olha_o_fim", "exists (select 1 from pg_trigger t where t.tgname = 'lesson_progress_play' and pg_get_triggerdef(t.oid) like '%watched_to_end_at%')")]
    elif r == "3-Podcasts":
        c = [("fila_de_arquivos_de_podcast", "to_regclass('public.podcast_files_released') is not null"),
             ("sete_gatilhos_de_arquivo", cont_gat(["podcast_files_queue_audio", "podcast_files_queue_audio_del", "podcast_files_queue_source", "podcast_files_guard_audio", "podcast_files_guard_source", "podcast_files_guard_material", "podcast_files_guard_hold"]) + " = 7"),
             ("aprovar_so_administrador_ou_revisor_da_area", usa("ch_raw_app_admin_podcast_approve(uuid, text)", "podcast_can_approve")),
             ("tela_pergunta_quem_aprova", "to_regprocedure('public.app_admin_podcast_approval(uuid)') is not null"),
             ("tres_funcoes_do_servidor", cont_funcs(["ch_worker_podcast_files_pending", "ch_worker_podcast_files_renew", "ch_worker_podcast_files_done"]) + " = 3"),
             ("recusa_de_fonte_complementar_continua", usa("app_admin_podcast_approve(uuid, text)", "ch_podcast_script_check"))]
    else:
        c = [("beneficios_do_elite_criados", "(select count(*) from public.plan_benefits) = 1"),
             ("trava_do_simulado", "to_regprocedure('public.simulado_gate()') is not null"),
             ("simulado_confere_o_plano", usa("app_start_session(text, jsonb, integer, integer)", "simulado_gate")),
             ("simulado_nao_fura_pela_tabela", "exists (select 1 from pg_trigger t where t.tgname = 'practice_sessions_simulado_gate' and t.tgrelid = 'public.practice_sessions'::regclass)"),
             ("tutor_confere_o_plano", usa("tutor_entitlement(uuid)", "plan_locked")),
             ("aviso_da_conta", "to_regprocedure('public.app_my_access()') is not null"),
             ("quatro_funcoes_dos_beneficios", cont_funcs(["app_admin_plan_benefits", "app_admin_save_plan_benefits", "app_my_benefits", "station_feedback_allowed"]) + " = 4"),
             ("chave_do_teste_no_cadastro_vale", usa("handle_new_user()", "v_offer")),
             ("tela_sabe_que_a_chave_vale", "to_regprocedure('public.app_admin_signup_trial_rule()') is not null")]
    c += [("tabelas_novas_fechadas_ao_app", " and ".join(tabela_fechada(t) for t in p["tabelas"])),
          ("visitante_nao_chama_nenhuma_funcao_nova", fechado_visitante(p["telas"] + p["internas"])),
          ("so_a_tela_e_chamavel_por_quem_loga", fechado_logado(p["internas"]))]
    return c

os.makedirs(OUT, exist_ok=True)
resumo = []
for p in PARTES:
    blocos = []
    for n in p["nums"]:
        f = arq(n)
        blocos.append(f"-- ======================================================================\n-- {f}\n-- ======================================================================\n" + open(os.path.join(M, f), encoding="utf-8").read().rstrip() + "\n")
    ordem = " >> ".join(f"{q['rotulo']}" for q in PARTES)
    cab = (f"-- StaziaMed, LEVA 3, parte {p['rotulo']}: {p['desc']}\n"
           f"-- Cole este arquivo INTEIRO no editor SQL do Supabase (sem selecionar nada) e clique em Run. Para colar de novo, cole DESTA parte até a última, na ordem (colar uma parte sozinha pode desfazer a seguinte).\n"
           f"-- ORDEM DE PUBLICAÇÃO: as 4 partes SQL (1 a 4) PRIMEIRO; depois a imagem do Cloud Run; por último o site.\n"
           f"-- Antes da primeira parte, rode o arquivo 0-CONFERIR-primeiro-nao-altera-nada.sql e mostre o resultado ao Claude.\n"
           f"-- O que muda para a equipe:\n" + "".join(f"--   * {t}\n" for t in p["equipe"]) +
           f"-- O que muda para o aluno:\n" + "".join(f"--   * {t}\n" for t in p["aluno"]) +
           f"-- Arquivos incluídos, em ordem: {', '.join(arq(n) for n in p['nums'])}\n\n")
    conf = ",\n".join(f"  {expr} as {nome}" for nome, expr in conferencias(p))
    rod = f"\n-- conferência final (só leitura): todas as colunas abaixo devem dar \"true\"\nselect 'OK: {p['rotulo']} colada' as resultado,\n{conf};\n"
    texto = cab + "\n".join(blocos) + rod
    open(os.path.join(OUT, p["nome"] + ".sql"), "w", encoding="utf-8").write(texto)
    resumo.append((p["nome"], len(texto.encode("utf-8")), p["nums"]))
shutil.copyfile(os.path.join(os.path.dirname(os.path.abspath(__file__)), "pacote", "0-CONFERIR.sql"), os.path.join(OUT, "0-CONFERIR-primeiro-nao-altera-nada.sql"))
shutil.copyfile(os.path.join(os.path.dirname(os.path.abspath(__file__)), "pacote", "0-LEIA-ME.txt"), os.path.join(OUT, "0-LEIA-ME.txt"))
shutil.copyfile(os.path.join(W, "supabase", "rotinas", "lista-podcasts-arquivos-esquecidos.sql"), os.path.join(OUT, "OPCIONAL-lista-dos-arquivos-esquecidos-de-podcast-so-leitura.sql"))
print("\n".join(f"{n:62s} {t/1024:6.1f} KB  {','.join(x)}" for n, t, x in resumo))
