#!/usr/bin/env python3
# Gera o pacote de SQL da LEVA 4 para colar no Supabase, a partir do ramo leva4. Uso: gerar-leva4.py <worktree> <pasta-de-saida>
# Mesmo molde da leva 3: cabecalho em portugues simples, migracoes em ordem, "select 'OK: ...' as resultado" no fim com conferencias de leitura (true),
# provadas no estado de producao simulado (verificar-pacote.mjs). Partes: 1 = 9800, 2 = 9801, 3 = 9810+9830 (fechamento junto, para nunca ficar
# duas versoes da mesma funcao entre uma parte e outra), 4 = 9820.
import os, sys, shutil, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fn import defs
W, OUT = sys.argv[1], sys.argv[2]
M = os.path.join(W, "supabase", "migrations")
def arq(num):
    achados = [f for f in os.listdir(M) if f.startswith(f"20261003{num}_")]
    if len(achados) != 1: raise SystemExit(f"migracao {num}: esperava 1 arquivo, achei {achados}")
    return achados[0]

def lista_nomes(f): return {k[0] for k in defs(open(os.path.join(M, f), encoding="utf-8").read())}
antigas = set()
for f in sorted(os.listdir(M)):
    if f.endswith(".sql") and f[:14] < "20261003009800": antigas |= lista_nomes(f)
def novas(nums):
    n = set()
    for x in nums: n |= lista_nomes(arq(x))
    return sorted(n - antigas)

def q(nomes): return ", ".join(f"'{n}'" for n in nomes)
def cont_funcs(nomes): return f"(select count(distinct p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ({q(nomes)}))"
def cont_gat(nomes): return f"(select count(*) from pg_trigger t where not t.tgisinternal and t.tgname in ({q(nomes)}))"
def col(tab, c): return f"exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = '{tab}' and column_name = '{c}')"
def usa(func, trecho): return f"position('{trecho}' in pg_get_functiondef('public.{func}'::regprocedure)) > 0"
def fechado_visitante(nomes): return f"not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ({q(nomes)}) and has_function_privilege('anon', p.oid, 'execute'))"
def fechado_logado(nomes): return f"not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ({q(nomes)}) and has_function_privilege('authenticated', p.oid, 'execute'))"
def rls(t): return f"(select c.relrowsecurity from pg_class c where c.oid = 'public.{t}'::regclass)"

# funcoes de acesso do aluno que ficam abertas de proposito (visitante ou logado)
ABERTAS = {"has_ineditas", "ineditas_gate", "ineditas_option", "questions_sources_public"}
def telas(nums): return [n for n in novas(nums) if n.startswith("app_")]
def internas(nums): return [n for n in novas(nums) if not n.startswith("app_") and n not in ABERTAS]

PARTES = [
 dict(nome="1-colar-ANTES-do-site-parte-1-Questoes-StaziaMed-rascunhos", rotulo="1-Questoes-StaziaMed-rascunhos", nums=["009800"],
      desc="Questões StaziaMed (as \"Questões Inéditas\" do aluno), lado da Administração: rascunhos com hash, pedidos, conferências, busca de fonte oficial, aprovação travada, publicação",
      equipe=["Nova seção \"Questões StaziaMed\" na Central de Conteúdo: o administrador/editor pede questões (custo à vista), confere, busca fonte oficial, edita e equilibra o gabarito; o revisor médico da área aprova; só o administrador publica e recolhe. Nada é publicado sozinho; tudo fica numa trilha (quem, quando, antes e depois).",
              "Aprovar um rascunho passa a exigir: tema, citações de trechos de fonte OFICIAL vigente (nível A a D), as 4 conferências sem problema no texto atual, o texto que o revisor viu e \"Conferi as fontes citadas\". Os 200 rascunhos antigos (que citam apostila) FICAM SEM PODER APROVAR até ter fonte oficial; os que já estão aprovados não mudam."],
      aluno=["Nada que apareça."],
      telas="app", tabelas=["staziamed_requests", "draft_source_proposals", "draft_question_events"]),
 dict(nome="2-colar-ANTES-do-site-parte-2-Questoes-StaziaMed-aluno", rotulo="2-Questoes-StaziaMed-aluno", nums=["009801"],
      desc="Questões StaziaMed, lado do aluno: prova \"Questões Inéditas\", acesso (teste valendo treina; vencido vê fechado), e todas as outras telas passam a contar só as questões oficiais",
      equipe=["Questão StaziaMed nunca vira questão oficial do Inep: fica fora de incidência, Temas, trilhas, Tutor, análise (SQIE) e banco de questões da Administração.",
              "Exige a LEVA 3 já colada: sem ela a parte recusa com aviso e não altera nada."],
      aluno=["Nada aparece até haver questão publicada. Depois, a opção \"Questões Inéditas\" aparece na lista de provas (com aviso \"não é questão oficial do Inep\"): treinam equipe, revisor, plano pago válido e teste grátis valendo; teste vencido, plano vencido e conta sem assinatura veem fechado, com convite em português.",
             "O gabarito e a explicação continuam só depois de responder; as fontes oficiais citadas aparecem na correção."],
      telas="app", tabelas=[]),
 dict(nome="3-colar-ANTES-do-site-parte-3-Analise-e-conferencia-pela-tela", rotulo="3-Analise-e-conferencia", nums=["009810", "009830"],
      desc="Análise de questões e conferência de rascunhos pedidas pela tela (com limites e custo à vista), triagem por selos, e o FECHAMENTO que junta as regras de todas as frentes",
      equipe=["Administração > Central de Conteúdo > Análise de questões: \"Gerar análises com IA\" (no máximo 50 questões por pedido e 100 por dia por pessoa) e, na seção de rascunhos, \"Conferir com IA\" (no máximo 20 por pedido e 60 por dia). A tela mostra antes quantas entram e o custo estimado. Só administrador e revisor médico (nas áreas dele) pedem; análise só de questões OFICIAIS.",
              "Cada rascunho ganha um selo de triagem (reprovada, sem fonte, com apontamentos, só regras, não conferida, sem apontamentos) e dá para filtrar e ordenar por ele. A IA não aprova: quem decide é o revisor médico.",
              "O revisor médico passa a ler só os rascunhos, as conferências e a trilha das áreas dele (também pela API do banco).",
              "Fechamento (9830): uma versão só de \"decidir rascunho\" e da lista de rascunhos, juntando a trava de aprovação sem fonte oficial, a evidência positiva de fonte, a linha travada na decisão e a triagem. A fila de tarefas aceita as etapas de todas as frentes. Exige as partes 1 e 2."],
      aluno=["Nada que apareça: as ferramentas de IA são só da Administração."],
      telas="app", tabelas=["ch_ai_requests"]),
 dict(nome="4-colar-ANTES-do-site-parte-4-Atualidade-das-fontes", rotulo="4-Atualidade-das-fontes", nums=["009820"],
      desc="Busca de fontes oficiais com IA: atualidade da fonte achada (a mais nova primeiro), aprovar versão mais antiga só com confirmação própria, e verificação antes de pedir busca pelas abas",
      equipe=["Candidatos a fonte oficial passam a mostrar se a versão achada é a mais nova, a mesma ou mais antiga que a da biblioteca, e vêm com os mais atuais primeiro. Aprovar uma versão mais antiga exige confirmação própria e diz que substitui a mais nova.",
              "Antes de pedir uma busca a partir de uma aba (Questões, Atualizações...), o administrador vê se já há busca do mesmo tema nos últimos 7 dias. Nada vira fonte sozinho."],
      aluno=["Nada que apareça."],
      telas="app", tabelas=[]),
]

def conferencias(p):
    r = p["rotulo"]; c = []
    if r == "1-Questoes-StaziaMed-rascunhos":
        c = [("tabelas_dos_pedidos_propostas_e_trilha", "to_regclass('public.staziamed_requests') is not null and to_regclass('public.draft_source_proposals') is not null and to_regclass('public.draft_question_events') is not null"),
             ("hash_do_rascunho_no_banco", cont_gat(["draft_questions_hash"]) + " = 1"),
             ("os_antigos_na_trilha", "(select count(*) from public.draft_question_events where kind = 'importada') = (select count(*) from public.draft_questions where generated_by = 'gerador_antigo')"),
             ("funcoes_dos_rascunhos", cont_funcs(["app_draft_questions", "app_draft_question_detail", "app_draft_question_decide", "app_draft_question_save", "app_draft_balance_answer", "draft_approval_blockers", "app_staziamed_publish", "app_staziamed_retire", "app_staziamed_request_create"]) + " = 9"),
             ("aprovar_exige_fonte_oficial_e_texto_visto", usa("app_draft_question_decide(uuid, text, text, text, boolean)", "draft_approval_blockers")),
             ("tabelas_novas_com_acesso_protegido", " and ".join(rls(t) for t in p["tabelas"]))]
        tl, it = telas(p["nums"]), internas(p["nums"])
    elif r == "2-Questoes-StaziaMed-aluno":
        c = [("coluna_origem_nas_questoes", col("questions", "origin")),
             ("prova_questoes_ineditas_existe", "exists (select 1 from public.exams where id = 'staziamed')"),
             ("funcoes_de_acesso_do_aluno", cont_funcs(["has_ineditas", "ineditas_gate", "ineditas_option"]) + " = 3"),
             ("leva3_continua_valendo", " and ".join([usa("app_start_session(text, jsonb, integer, integer)", "simulado_gate"), usa("ch_raw_practice_correction_view(text, text)", "question_hidden_fields"),
                                                       usa("ch_raw_tutor_truth(text, text)", "question_hidden_fields"), usa("app_admin_questions(jsonb, integer, integer)", "comment_review_ready"),
                                                       usa("app_admin_question(text)", "comment_review_ready"), "to_regprocedure('public.app_question_figure(text, integer)') is not null"])),
             ("treino_da_inedita_tem_porta_de_acesso", usa("app_start_session(text, jsonb, integer, integer)", "ineditas_gate")),
             ("so_oficiais_nas_outras_telas", " and ".join(usa(f, "origin = ''official''") for f in ["ch_raw_practice_correction_view(text, text)", "ch_raw_tutor_truth(text, text)", "app_admin_questions(jsonb, integer, integer)", "app_admin_question(text)", "admin_import_merge_question(text, jsonb)"]))]
        tl, it = telas(p["nums"]), internas(p["nums"])
    elif r == "3-Analise-e-conferencia":
        c = [("tabela_dos_pedidos_de_ia", "to_regclass('public.ch_ai_requests') is not null and " + rls("ch_ai_requests")),
             ("fila_aceita_as_etapas_de_todas_as_frentes", " and ".join(f"position('''{s}''' in (select pg_get_constraintdef(k.oid) from pg_constraint k where k.conrelid = 'public.ch_jobs'::regclass and k.conname = 'ch_jobs_step_check')) > 0" for s in ["question_analysis", "draft_check", "question_generate", "question_check", "question_source", "source_search", "visual_render", "station_draft"])),
             ("uma_versao_so_de_decidir_rascunho", "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'app_draft_question_decide') = 1"),
             ("uma_versao_so_da_lista_de_rascunhos", "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'app_draft_questions') = 1"),
             ("decisao_trava_a_linha_e_exige_fonte_oficial", usa("app_draft_question_decide(uuid, text, text, text, boolean)", "for update") + " and " + usa("app_draft_question_decide(uuid, text, text, text, boolean)", "ch_draft_official_evidence") + " and " + usa("app_draft_question_decide(uuid, text, text, text, boolean)", "draft_approval_blockers")),
             ("triagem_por_selos", "to_regprocedure('public.ch_draft_triage(uuid)') is not null and " + usa("app_draft_questions(text, text, text, integer, integer, text, text, boolean, numeric, text, text)", "triage_counts")),
             ("analise_so_de_questoes_oficiais", usa("ch_qa_pick(text, text, text[], boolean, integer)", "origin = ''official''") + " and " + usa("ch_worker_questions_for_analysis_ids(text[], boolean)", "origin = ''official''")),
             ("revisor_le_so_a_area_dele", "exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'draft_questions' and qual like '%ch_is_reviewer(area)%')"),
             ("conferencias_do_revisor_so_da_area", "exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'draft_checks' and qual like '%ch_is_reviewer(d.area)%')"),
             ("pedidos_de_ia_ficam_com_o_servidor", cont_funcs(["ch_worker_ai_request_get", "ch_worker_ai_request_update", "ch_worker_questions_for_analysis_ids", "ch_worker_drafts_for_check_ids"]) + " = 4")]
        tl, it = telas(p["nums"]), internas(p["nums"])
    else:
        c = [("colunas_de_atualidade_do_candidato", " and ".join(col("ch_source_candidates", x) for x in ["ai_valid_until", "currency", "currency_date", "currency_info"])),
             ("funcoes_da_atualidade", cont_funcs(["ch_source_date_cmp", "ch_worker_source_library_for_theme", "ch_worker_source_currency_context", "ch_worker_source_currency_pending", "ch_worker_source_currency_set", "app_ch_source_search_check"]) + " = 6"),
             ("aprovar_versao_mais_antiga_pede_confirmacao", usa("app_ch_source_candidate_approve(uuid, jsonb)", "confirm_older")),
             ("lista_dos_mais_atuais_primeiro", usa("app_ch_source_candidates(text)", "currency"))]
        tl, it = telas(p["nums"]), internas(p["nums"])
    c += [("visitante_nao_chama_nenhuma_funcao_nova", fechado_visitante(tl + it)),
          ("so_a_tela_e_chamavel_por_quem_loga", fechado_logado(it))]
    return c

os.makedirs(OUT, exist_ok=True)
resumo = []
for p in PARTES:
    blocos = []
    for n in p["nums"]:
        f = arq(n)
        blocos.append(f"-- ======================================================================\n-- {f}\n-- ======================================================================\n" + open(os.path.join(M, f), encoding="utf-8").read().rstrip() + "\n")
    cab = (f"-- StaziaMed, LEVA 4, parte {p['rotulo']}: {p['desc']}\n"
           f"-- Cole este arquivo INTEIRO no editor SQL do Supabase (sem selecionar nada) e clique em Run. Para colar de novo, cole DESTA parte até a última, na ordem (colar uma parte sozinha pode desfazer a seguinte).\n"
           f"-- ORDEM DE PUBLICAÇÃO: as 4 partes SQL (1 a 4) PRIMEIRO; depois a imagem do Cloud Run; por último o site.\n"
           f"-- Antes da primeira parte, rode o arquivo 0-CONFERIR-primeiro-nao-altera-nada.sql e mostre o resultado ao Claude. A leva 3 (9700 a 9732) já tem de estar colada.\n"
           f"-- O que muda para a equipe:\n" + "".join(f"--   * {t}\n" for t in p["equipe"]) +
           f"-- O que muda para o aluno:\n" + "".join(f"--   * {t}\n" for t in p["aluno"]) +
           f"-- Arquivos incluídos, em ordem: {', '.join(arq(n) for n in p['nums'])}\n\n")
    conf = ",\n".join(f"  {expr} as {nome}" for nome, expr in conferencias(p))
    rod = f"\n-- conferência final (só leitura): todas as colunas abaixo devem dar \"true\"\nselect 'OK: {p['rotulo']} colada' as resultado,\n{conf};\n"
    texto = cab + "\n".join(blocos) + rod
    open(os.path.join(OUT, p["nome"] + ".sql"), "w", encoding="utf-8").write(texto)
    resumo.append((p["nome"], len(texto.encode("utf-8")), p["nums"]))
here = os.path.dirname(os.path.abspath(__file__))
shutil.copyfile(os.path.join(here, "pacote", "0-CONFERIR.sql"), os.path.join(OUT, "0-CONFERIR-primeiro-nao-altera-nada.sql"))
shutil.copyfile(os.path.join(here, "pacote", "0-LEIA-ME.txt"), os.path.join(OUT, "0-LEIA-ME.txt"))
print("\n".join(f"{n:70s} {t/1024:6.1f} KB  {','.join(x)}" for n, t, x in resumo))
