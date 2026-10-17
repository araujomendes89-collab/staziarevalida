// @vitest-environment node
/**
 * Onboarding inteligente no banco: supabase/migrations/20261003013720_onboarding.sql (depois da 13640, direitos por fase).
 * Confere: quem vê o onboarding sozinho (conta nova) × convite (conta antiga) × ninguém (equipe e revisor); a pergunta da fase
 * conforme o acesso decidido NO SERVIDOR (teste, PRO, ELITE, vencido); 2ª fase fechada recusada; a escolha do teste só pela
 * função oficial e só uma vez; cada passo validado e salvo; passo atual só anda para a frente (dois aparelhos); interromper e
 * retomar; concluir e pular; o tour e as dicas de primeiro uso; Primeiros passos por ação real; preferência nunca libera
 * recurso (assinatura, fases e direitos iguais antes e depois); RLS (só a própria linha, nada de gravar direto, visitante
 * barrado, funções internas fechadas); colar de novo (idempotente) e desfazer.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const NOME = "20261003013720_onboarding.sql";
const MIGRACAO = fs.readFileSync(path.join(MIGRATIONS, NOME), "utf8");
const DESFAZER = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013720_onboarding.desfazer.sql"), "utf8");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1);
const REVISOR = id(2);
const NOVO = id(3); // conta nova em teste, sem nada feito
const NOVO2 = id(4); // outra conta nova (RLS, 2ª fase aberta)
const ANTIGO = id(5); // conta em teste que já respondeu questões
const PRO = id(6);
const ELITE = id(7);
const VENCIDO = id(8);
const DOIS = id(9); // dois aparelhos
const PULA = id(10); // pula tudo
const PRATICA = id(11); // só 2ª fase (dada pela equipe)
const TODOS = [ADMIN, REVISOR, NOVO, NOVO2, ANTIGO, PRO, ELITE, VENCIDO, DOIS, PULA, PRATICA];

let db: PGlite;

async function como<T = any>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    return (await tx.query<T>(sql, params)).rows;
  });
}
async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  const rows = await como<{ r: T }>(
    uid,
    `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`,
    keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]))
  );
  return rows[0].r;
}
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const estado = (uid: string) => rpc(uid, "app_onboarding_estado");
const salvar = (uid: string, passo: string, dados: Record<string, unknown> = {}) => rpc(uid, "app_onboarding_salvar", { p_passo: passo, p_dados: dados });
const sub = (uid: string, plan: string, status: string, trialEnd: string | null, periodEnd: string | null = null) =>
  db.query(`update public.subscriptions set plan = $2, status = $3, trial_ends_at = ${trialEnd ?? "null"}, current_period_end = ${periodEnd ?? "null"} where user_id = $1`, [uid, plan, status]);
const abrirFase2 = (aberta: boolean) => db.query(`update public.direitos_config set fase2_aberta_alunos = $1`, [aberta]);
const amanha = () => {
  const d = new Date(Date.now() + 40 * 86400000);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f !== NOME).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  for (const uid of TODOS) await db.query(`insert into auth.users (id, email, raw_user_meta_data, created_at) values ($1, $2, '{}', now() - interval '1 day')`, [uid, `u${parseInt(uid.slice(-4))}@teste.dev`]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'clinica_medica')`, [REVISOR]);
  for (const u of [NOVO, NOVO2, ANTIGO, DOIS, PULA]) await sub(u, "trial", "trialing", "now() + interval '5 days'");
  await sub(PRO, "pro", "active", null, "now() + interval '20 days'");
  await sub(ELITE, "elite", "active", null, "now() + interval '20 days'");
  await sub(VENCIDO, "trial", "trialing", "now() - interval '1 day'");
  await sub(PRATICA, "trial", "trialing", "now() - interval '10 days'");
  await db.query(`insert into public.aluno_fases (user_id, fase, situacao, plano, inicio, fim, origem) values ($1, 'pratica', 'paga', 'pratica', now() - interval '1 day', now() + interval '20 days', 'equipe')`, [PRATICA]);
  // conta antiga: já respondeu uma questão
  await db.query(`insert into public.exams (id, kind, year, semester, title) values ('revalida-2023-1', 'REVALIDA', 2023, 1, 'Revalida INEP 2023/1')`);
  await db.query(
    `insert into public.questions (id, code, exam_id, number, area, topic, statement, options, correct_option, status)
     select 'q_onb_' || n, 'ONB-' || n, 'revalida-2023-1', n, 'PEDIATRIA', 'Tema ' || n, 'Enunciado da questão ' || n || ' com texto suficiente.',
            '[{"id":"A","text":"a"},{"id":"B","text":"b"},{"id":"C","text":"c"},{"id":"D","text":"d"}]'::jsonb, 'B', 'valid'
     from generate_series(1, 3) n`
  );
  await db.query(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, 'q_onb_1', 'A')`, [ANTIGO]);
  await db.exec(MIGRACAO);
}, 300_000);

describe("quem vê o onboarding", () => {
  it("conta nova em teste: abre sozinho, sem convite; pergunta a fase do teste (2ª fase fechada)", async () => {
    const e = await estado(NOVO);
    expect(e).toMatchObject({ aplicavel: true, mostrar: true, convite: false, conta_antiga: false, status: "not_started", origem: "cadastro", passo_atual: "apresentacao" });
    expect(e.acesso).toMatchObject({ perfil: "teste", modo_fase: "escolher_teste", fase2_aberta: false, teoria: "teste" });
    expect(e.nivelamento).toMatchObject({ situacao: "novo", concluido: false, cabe: true });
    expect(e.primeiros_passos.map((p: any) => p.feito)).toEqual([false, false, false, false, false]);
    expect(e).not.toHaveProperty("preco");
  });
  it("conta antiga (já estudou): NÃO abre sozinho, vira convite no Início; 'Agora não' tira o convite", async () => {
    expect(await estado(ANTIGO)).toMatchObject({ aplicavel: true, mostrar: false, convite: true, conta_antiga: true, origem: "conta_antiga" });
    // pedir o tour pela Ajuda não obriga o onboarding
    expect(await rpc(ANTIGO, "app_onboarding_tour", { p_status: "em_andamento", p_passo: 0 })).toMatchObject({ mostrar: false, convite: true, tour: { status: "em_andamento", passo: 0 } });
    expect(await rpc(ANTIGO, "app_onboarding_dica_vista", { p_dica: "convite_onboarding" })).toMatchObject({ mostrar: false, convite: false });
  });
  it("conta antiga que começa pelo convite e para no meio: continua sem ser obrigada (só convite)", async () => {
    await salvar(ANTIGO, "apresentacao");
    const e = await estado(ANTIGO);
    expect(e).toMatchObject({ status: "in_progress", origem: "conta_antiga", mostrar: false });
  });
  it("equipe e revisor médico não passam pelo onboarding (mas podem abrir pela Ajuda e salvar sem mexer em teste)", async () => {
    for (const u of [ADMIN, REVISOR]) {
      const e = await estado(u);
      expect(e).toMatchObject({ aplicavel: false, mostrar: false, convite: false, acesso: { modo_fase: "equipe" }, nivelamento: { cabe: false } });
      await expect(salvar(u, "fase", { escolha: "as_duas" })).resolves.toMatchObject({ aplicavel: false });
    }
    expect(await q(`select count(*)::int n from public.aluno_testes where user_id in ($1, $2) and escolhido_em is not null`, [ADMIN, REVISOR])).toEqual([{ n: 0 }]);
  });
});

describe("a pergunta da fase vem do acesso decidido no servidor", () => {
  it("PRO = 1ª fase já sabida; ELITE pergunta a prioridade (2ª fase fechada recusada); vencido = convite; PRÁTICA não faz o nivelamento", async () => {
    expect((await estado(PRO)).acesso).toMatchObject({ perfil: "pro", modo_fase: "pro" });
    expect((await salvar(PRO, "fase", { escolha: "as_duas" })).preferencias).toMatchObject({ fase_escolhida: "teoria" }); // escolha ignorada
    expect((await estado(ELITE)).acesso).toMatchObject({ perfil: "elite", modo_fase: "elite" });
    await expect(salvar(ELITE, "fase", { prioridade: "pratica" })).rejects.toThrow(/2ª fase ainda não está aberta/);
    expect((await salvar(ELITE, "fase", { prioridade: "teoria" })).preferencias).toMatchObject({ fase_escolhida: "as_duas", prioridade_fase: "teoria" });
    expect((await estado(VENCIDO)).acesso).toMatchObject({ perfil: "vencido", modo_fase: "convite" });
    expect((await estado(PRATICA)).acesso).toMatchObject({ perfil: "pratica", modo_fase: "pratica" });
    expect((await estado(PRATICA)).nivelamento).toMatchObject({ cabe: false });
    expect((await salvar(PRATICA, "nivelamento")).etapas).toMatchObject({ nivelamento: "nao_se_aplica" });
  });
  it("com o nivelamento desligado como primeira tela pela equipe, o onboarding não o oferece", async () => {
    await db.query(`update public.nivelamento_config set primeira_tela = false`);
    try {
      expect((await estado(NOVO)).nivelamento.cabe).toBe(false);
    } finally {
      await db.query(`update public.nivelamento_config set primeira_tela = true`);
    }
    expect((await estado(NOVO)).nivelamento.cabe).toBe(true);
  });
  it("teste com a 2ª fase fechada: 2ª fase e 'as duas' recusadas; 1ª fase guardada SEM travar a escolha do teste", async () => {
    await expect(salvar(NOVO, "fase", { escolha: "pratica" })).rejects.toThrow(/2ª fase ainda não está aberta/);
    await expect(salvar(NOVO, "fase", { escolha: "as_duas" })).rejects.toThrow(/2ª fase ainda não está aberta/);
    await expect(salvar(NOVO, "fase", { escolha: "qualquer" })).rejects.toThrow(/1ª fase, 2ª fase ou as duas/);
    const e = await salvar(NOVO, "fase", { escolha: "teoria" });
    expect(e.preferencias.fase_escolhida).toBe("teoria");
    expect(await q(`select escolha, escolhido_em from public.aluno_testes where user_id = $1`, [NOVO])).toEqual([{ escolha: "teoria", escolhido_em: null }]);
    expect(e.acesso.modo_fase).toBe("escolher_teste");
  });
  it("teste com a 2ª fase aberta: 'as duas' vira o teste da conta pela função oficial, uma vez só", async () => {
    await abrirFase2(true);
    try {
      await salvar(NOVO2, "fase", { escolha: "as_duas" });
      expect(await q(`select escolha, fases, escolhido_em is not null escolhido from public.aluno_testes where user_id = $1`, [NOVO2])).toEqual([{ escolha: "as_duas", fases: ["teoria", "pratica"], escolhido: true }]);
      expect(await q(`select fase, situacao from public.aluno_fases where user_id = $1 order by fase`, [NOVO2])).toEqual([
        { fase: "pratica", situacao: "teste" },
        { fase: "teoria", situacao: "teste" },
      ]);
      // tentar trocar depois: vale o que foi escolhido (só um teste por conta)
      const e = await salvar(NOVO2, "fase", { escolha: "teoria" });
      expect(e.preferencias.fase_escolhida).toBe("as_duas");
      expect(e.acesso).toMatchObject({ modo_fase: "teste_definido", teste_escolha: "as_duas", teste_escolhido: true });
      expect(await q(`select phase from public.profiles where id = $1`, [NOVO2])).toEqual([{ phase: 1 }]);
    } finally {
      await abrirFase2(false);
    }
  });
});

describe("cada passo é validado e salvo no Supabase", () => {
  it("data da prova: passada e formato errado recusados; válida vai para o perfil; 'ainda não sei' limpa", async () => {
    await expect(salvar(NOVO, "prova", { exam_date: "2020-01-01" })).rejects.toThrow(/hoje ou depois/);
    await expect(salvar(NOVO, "prova", { exam_date: "31/12/2026" })).rejects.toThrow(/Data da prova inválida/);
    await expect(salvar(NOVO, "prova", { exam_date: "2026-02-30" })).rejects.toThrow(/Data da prova inválida/);
    expect((await salvar(NOVO, "prova", { exam_date: amanha() })).preferencias.exam_date).toBe(amanha());
    expect((await salvar(NOVO, "prova", { exam_date: null })).preferencias.exam_date).toBeNull();
    await salvar(NOVO, "prova", { exam_date: amanha() });
  });
  it("rotina: só as 9 opções de tempo; dias de 0 a 6 (sem repetir); perfil e preferências gravados juntos", async () => {
    await expect(salvar(NOVO, "rotina", { daily_minutes: 50, dias_semana: [1] })).rejects.toThrow(/tempo de estudo/);
    await expect(salvar(NOVO, "rotina", { dias_semana: [1] })).rejects.toThrow(/tempo de estudo/);
    await expect(salvar(NOVO, "rotina", { daily_minutes: "60", dias_semana: [1] })).rejects.toThrow(/tempo de estudo/);
    await expect(salvar(NOVO, "rotina", { daily_minutes: 60 })).rejects.toThrow(/dia da semana/);
    await expect(salvar(NOVO, "rotina", { daily_minutes: 60, dias_semana: [] })).rejects.toThrow(/dia da semana/);
    await expect(salvar(NOVO, "rotina", { daily_minutes: 60, dias_semana: [7] })).rejects.toThrow(/dia da semana/);
    const e = await salvar(NOVO, "rotina", { daily_minutes: 90, dias_semana: [5, 1, 3, 1] });
    expect(e.preferencias).toMatchObject({ daily_minutes: 90, dias_semana: [1, 3, 5], study_days_per_week: 3 });
    expect(e.primeiros_passos.find((p: any) => p.id === "plano").feito).toBe(true);
  });
  it("dificuldades: só áreas da lista; vazio = nenhuma em especial", async () => {
    await expect(salvar(NOVO, "dificuldades", { areas: ["MEDICINA_PREVENTIVA"] })).rejects.toThrow(/áreas da lista/);
    await expect(salvar(NOVO, "dificuldades", { areas: "PEDIATRIA" })).rejects.toThrow(/áreas da lista/);
    expect((await salvar(NOVO, "dificuldades", { areas: [] })).preferencias.areas_dificeis).toEqual([]);
    expect((await salvar(NOVO, "dificuldades", { areas: ["PEDIATRIA", "CLINICA_MEDICA", "PEDIATRIA"] })).preferencias.areas_dificeis.sort()).toEqual(["CLINICA_MEDICA", "PEDIATRIA"]);
  });
  it("jeito de estudar e Tutor (personalidade tem de ser do personagem)", async () => {
    await expect(salvar(NOVO, "jeito", { jeito: "videos" })).rejects.toThrow(/jeito de estudar/);
    expect((await salvar(NOVO, "jeito", { jeito: "misto" })).preferencias.jeito_estudar).toBe("misto");
    await expect(salvar(NOVO, "tutor", { personagem: "stazi", personalidade: "durona" })).rejects.toThrow(/personagem escolhido/);
    await expect(salvar(NOVO, "tutor", { personagem: "outro", personalidade: "durona" })).rejects.toThrow(/Stazi ou a Stazia/);
    const e = await salvar(NOVO, "tutor", { personagem: "stazia", personalidade: "durona" });
    expect(e.preferencias).toMatchObject({ tutor_personagem: "stazia", tutor_personalidade: "durona" });
    // sem a função do personagem no banco (ramo tutor-personagens), a escolha fica só guardada aqui
    expect(e.tutor_aplicado).toBe(false);
  });
  it("Tutor: com app_tutor_set_character no banco, o personagem é aplicado; se ela recusar, a escolha continua salva", async () => {
    await db.exec(`create table public.teste_set_character (user_id uuid, personagem text);
      create function public.app_tutor_set_character(p_character text) returns jsonb language plpgsql security definer set search_path = '' as $$
      begin insert into public.teste_set_character values ((select auth.uid()), p_character); return '{}'::jsonb; end $$;`);
    try {
      expect((await salvar(NOVO, "tutor", { personagem: "stazi", personalidade: "acolhedor" })).tutor_aplicado).toBe(true);
      expect(await q(`select user_id, personagem from public.teste_set_character`)).toEqual([{ user_id: NOVO, personagem: "stazi" }]);
      await db.exec(`create or replace function public.app_tutor_set_character(p_character text) returns jsonb language plpgsql security definer set search_path = '' as $$
        begin raise exception 'Professor não encontrado.'; end $$;`);
      const e = await salvar(NOVO, "tutor", { personagem: "stazia", personalidade: "tranquila" });
      expect(e.tutor_aplicado).toBe(false);
      expect(e.preferencias).toMatchObject({ tutor_personagem: "stazia", tutor_personalidade: "tranquila" });
    } finally {
      await db.exec(`drop function public.app_tutor_set_character(text); drop table public.teste_set_character;`);
    }
  });
  it("lembretes: só a preferência (horário válido); fecha a configuração e marca o primeiro passo 'perfil'", async () => {
    await expect(salvar(NOVO, "lembretes", { horario: "08:00" })).rejects.toThrow(/quer lembretes/);
    await expect(salvar(NOVO, "lembretes", { quer: true, horario: "25:00" })).rejects.toThrow(/Horário inválido/);
    const e = await salvar(NOVO, "lembretes", { quer: true, horario: "07:30" });
    expect(e.preferencias).toMatchObject({ lembretes_quer: true, lembretes_horario: "07:30" });
    expect(e.etapas.configuracao).toBe(true);
    expect(e.primeiros_passos.find((p: any) => p.id === "perfil").feito).toBe(true);
    expect((await salvar(NOVO, "lembretes", { quer: false, horario: "07:30" })).preferencias).toMatchObject({ lembretes_quer: false, lembretes_horario: null });
  });
  it("passo desconhecido, dados que não são objeto e visitante: recusados", async () => {
    await expect(salvar(NOVO, "pagamento")).rejects.toThrow(/Passo do onboarding desconhecido/);
    await expect(rpc(NOVO, "app_onboarding_salvar", { p_passo: "jeito", p_dados: [1] })).rejects.toThrow(/Dados do passo inválidos/);
    await expect(rpc(null, "app_onboarding_salvar", { p_passo: "jeito", p_dados: { jeito: "misto" } })).rejects.toThrow(/permission denied/);
    await expect(rpc(null, "app_onboarding_estado")).rejects.toThrow(/permission denied/);
  });
});

describe("interromper, retomar, dois aparelhos, concluir e pular", () => {
  it("o passo atual guarda onde parou (retomar) e só anda para a frente (aparelho atrasado não volta o passo)", async () => {
    await salvar(DOIS, "apresentacao");
    await salvar(DOIS, "fase", { escolha: "teoria" });
    expect((await estado(DOIS)).passo_atual).toBe("prova"); // fechou o app aqui: volta neste passo
    // aparelho A avança até o Tutor
    await salvar(DOIS, "prova", { exam_date: null });
    await salvar(DOIS, "rotina", { daily_minutes: 30, dias_semana: [1, 2] });
    await salvar(DOIS, "dificuldades", { areas: [] });
    await salvar(DOIS, "jeito", { jeito: "questoes" });
    await salvar(DOIS, "tutor", { personagem: "stazi", personalidade: "durao" });
    // aparelho B, atrasado, grava um passo antigo: a resposta vale, o passo não volta
    const e = await salvar(DOIS, "prova", { exam_date: amanha() });
    expect(e).toMatchObject({ passo_atual: "lembretes", status: "in_progress", mostrar: true });
    expect(e.preferencias.exam_date).toBe(amanha());
  });
  it("nivelamento pulado fica 'adiado' (sem tela cheia depois; convite no Início); concluir liga o tour; gravação atrasada não desfaz", async () => {
    await salvar(DOIS, "lembretes", { quer: false });
    const n = await salvar(DOIS, "nivelamento");
    expect(n.etapas.nivelamento).toBe("pulado");
    const niv = await rpc(DOIS, "app_nivelamento_estado");
    expect(niv).toMatchObject({ primeira_tela: false, adiado: true });
    await salvar(DOIS, "trilha");
    const c = await salvar(DOIS, "concluir");
    expect(c).toMatchObject({ status: "completed", mostrar: false, convite: false, passo_atual: "fim", tour: { status: "em_andamento", passo: 0 } });
    expect(await q(`select onboarding_completed_at is not null feito from public.profiles where id = $1`, [DOIS])).toEqual([{ feito: true }]);
    // o outro aparelho grava uma resposta antiga depois de concluir: não volta a "em andamento"
    expect(await salvar(DOIS, "rotina", { daily_minutes: 45, dias_semana: [1] })).toMatchObject({ status: "completed", passo_atual: "fim", mostrar: false });
  });
  it("tour: avança, pausa (retoma do mesmo passo), termina; situação e passo inválidos recusados", async () => {
    await expect(rpc(DOIS, "app_onboarding_tour", { p_status: "pendente", p_passo: 0 })).rejects.toThrow(/Situação do tour/);
    await expect(rpc(DOIS, "app_onboarding_tour", { p_status: "pausado", p_passo: 99 })).rejects.toThrow(/Passo do tour/);
    expect((await rpc(DOIS, "app_onboarding_tour", { p_status: "pausado", p_passo: 2 })).tour).toEqual({ status: "pausado", passo: 2 });
    expect((await estado(DOIS)).tour).toEqual({ status: "pausado", passo: 2 });
    expect((await rpc(DOIS, "app_onboarding_tour", { p_status: "concluido", p_passo: 4 })).tour).toEqual({ status: "concluido", passo: 4 });
  });
  it("dicas de primeiro uso: guardadas uma vez; nome inválido recusado", async () => {
    await rpc(DOIS, "app_onboarding_dica_vista", { p_dica: "arena" });
    const e = await rpc(DOIS, "app_onboarding_dica_vista", { p_dica: "arena" });
    expect(e.dicas_vistas).toEqual(["arena"]);
    await expect(rpc(DOIS, "app_onboarding_dica_vista", { p_dica: "Arena; drop table x" })).rejects.toThrow(/Dica inválida/);
  });
  it("pular tudo: entra no app (sem onboarding e sem o nivelamento em tela cheia); o que foi salvo continua", async () => {
    await salvar(PULA, "apresentacao");
    await salvar(PULA, "jeito", { jeito: "flashcards" });
    expect((await rpc(PULA, "app_nivelamento_estado")).primeira_tela).toBe(true);
    const e = await salvar(PULA, "pular");
    expect(e).toMatchObject({ status: "skipped", mostrar: false, convite: false, tour: { status: "pendente" } });
    expect(e.preferencias.jeito_estudar).toBe("flashcards");
    expect((await rpc(PULA, "app_nivelamento_estado")).primeira_tela).toBe(false);
    // refazer pela Ajuda e concluir: passa a concluído
    expect((await salvar(PULA, "concluir")).status).toBe("completed");
  });
});

describe("Primeiros passos confirmados por ação real", () => {
  it("questões, Tutor e revisão só contam quando acontecem de verdade no banco", async () => {
    const passo = async (pid: string) => (await estado(NOVO)).primeiros_passos.find((p: any) => p.id === pid).feito;
    expect(await passo("questoes")).toBe(false);
    await db.query(`insert into public.question_attempts (user_id, question_id, selected_option) values ($1, 'q_onb_2', 'B')`, [NOVO]);
    expect(await passo("questoes")).toBe(true);
    expect(await passo("tutor")).toBe(false);
    await db.query(`insert into public.tutor_sessions (user_id, mode, title, personality_id, intensity) values ($1, 'livre', 'Conversa', 'amigavel', 2)`, [NOVO]);
    expect(await passo("tutor")).toBe(true);
    expect(await passo("revisao")).toBe(false);
    const s = (await q<{ id: string }>(`insert into public.practice_sessions (user_id, kind, config, question_ids) values ($1, 'questoes', '{"filters":{"status":"wrong"}}', array['q_onb_1']) returning id`, [NOVO]))[0].id;
    await db.query(`insert into public.question_attempts (user_id, question_id, session_id, selected_option) values ($1, 'q_onb_1', $2, 'B')`, [NOVO, s]);
    expect(await passo("revisao")).toBe(true);
    // e quem está no meio do onboarding (origem cadastro) continua vendo o onboarding mesmo depois de estudar
    expect((await estado(NOVO)).mostrar).toBe(true);
  });
});

describe("preferência nunca libera recurso", () => {
  it("o onboarding inteiro de um aluno em teste não muda assinatura, fases, teste nem os direitos", async () => {
    const retrato = async (u: string) => ({
      sub: await q(`select plan, status, trial_ends_at, current_period_end from public.subscriptions where user_id = $1`, [u]),
      fases: await q(`select fase, situacao, plano, fim from public.aluno_fases where user_id = $1 order by fase`, [u]),
      teste: await q(`select escolha, fases, fim, escolhido_em from public.aluno_testes where user_id = $1`, [u]),
      direitos: (await q(`select public.direitos_do_aluno($1) - 'calculado_em' - 'saldo' - 'creditos' - 'voz' d`, [u]))[0].d,
    });
    const antes = await retrato(NOVO);
    for (const [p, d] of [["fase", { escolha: "teoria" }], ["jeito", { jeito: "aulas" }], ["tutor", { personagem: "stazi", personalidade: "durao" }], ["trilha", {}], ["concluir", {}]] as const) {
      await salvar(NOVO, p, d as any);
    }
    expect(await retrato(NOVO)).toEqual(antes);
  });
});

describe("RLS e permissões", () => {
  it("o aluno lê só a própria linha; não grava direto nas tabelas; não chama as funções internas", async () => {
    expect(await como(NOVO2, `select user_id from public.aluno_onboarding order by user_id`)).toEqual([{ user_id: NOVO2 }]);
    expect(await como(NOVO2, `select user_id from public.aluno_preferencias_estudo`)).toEqual([{ user_id: NOVO2 }]);
    expect(await como(null, `select count(*)::int n from public.aluno_onboarding`).catch((e) => String(e))).toMatch(/permission denied/);
    await expect(como(NOVO2, `update public.aluno_onboarding set status = 'completed' where user_id = $1`, [NOVO2])).rejects.toThrow(/permission denied/);
    await expect(como(NOVO2, `insert into public.aluno_preferencias_estudo (user_id) values ($1)`, [NOVO])).rejects.toThrow(/permission denied/);
    await expect(como(NOVO2, `delete from public.aluno_onboarding where user_id = $1`, [NOVO2])).rejects.toThrow(/permission denied/);
    await expect(como(NOVO2, `select public.onboarding_estado_de($1)`, [NOVO])).rejects.toThrow(/permission denied/);
    await expect(como(NOVO2, `select public.onboarding_garantir($1)`, [NOVO])).rejects.toThrow(/permission denied/);
    await expect(como(NOVO2, `select public.onboarding_adiar_diagnostico($1)`, [NOVO])).rejects.toThrow(/permission denied/);
    // o administrador lê as linhas (suporte), como nas tabelas da 13640
    expect((await como(ADMIN, `select count(*)::int n from public.aluno_onboarding`))[0].n).toBeGreaterThan(3);
  });
  it("todas as funções novas: security definer com search_path vazio", async () => {
    const f = await q(`select proname, prosecdef, proconfig from pg_proc where pronamespace = 'public'::regnamespace and proname in
      ('app_onboarding_estado', 'app_onboarding_salvar', 'app_onboarding_tour', 'app_onboarding_dica_vista', 'onboarding_estado_de',
       'onboarding_garantir', 'onboarding_adiar_diagnostico', 'onboarding_conta_antiga') order by 1`);
    expect(f).toHaveLength(8);
    for (const x of f) expect(x).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'] });
  });
});

describe("colar de novo e desfazer", () => {
  it("colar a migração de novo não estraga nada (estado igual)", async () => {
    const antes = await q(`select * from public.aluno_onboarding order by user_id`);
    const prefs = await q(`select * from public.aluno_preferencias_estudo order by user_id`);
    await db.exec(MIGRACAO);
    expect(await q(`select * from public.aluno_onboarding order by user_id`)).toEqual(antes);
    expect(await q(`select * from public.aluno_preferencias_estudo order by user_id`)).toEqual(prefs);
  });
  it("desfazer apaga só o que a 13720 criou; dá para colar de novo depois", async () => {
    const perfil = await q(`select daily_minutes, exam_date from public.profiles where id = $1`, [NOVO]);
    await db.exec(DESFAZER);
    await db.exec(DESFAZER); // de novo, sem erro
    expect(await q(`select to_regclass('public.aluno_onboarding') t, to_regprocedure('public.app_onboarding_estado()') f`)).toEqual([{ t: null, f: null }]);
    expect(await q(`select daily_minutes, exam_date from public.profiles where id = $1`, [NOVO])).toEqual(perfil);
    await db.exec(MIGRACAO);
    expect(await estado(NOVO2)).toMatchObject({ status: "not_started" });
  });
});
