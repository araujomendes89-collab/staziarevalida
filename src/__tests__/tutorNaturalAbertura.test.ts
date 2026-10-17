// @vitest-environment node
/**
 * Tutor natural, sem textos prontos (decisão do dono de 17/10/2026), no servidor:
 *   1. abertura e passagem criadas pela IA a partir do contexto; a fala sorteada pelo banco fica só de reserva (IA fora, barrada, lenta);
 *   2. FICHA DO PERSONAGEM para as 4 personalidades (quem é, valores, jeito, como reage em cada situação), sem frases prontas;
 *   3. nada de repetição: últimas falas do aluno por personalidade, começos e bordões da conversa;
 *   4. reagir ao que o aluno disse, pelas palavras dele (instrução no núcleo).
 * As regras inegociáveis seguem valendo na abertura: sem número sem base, sem letra da questão aberta, palavrão só no nível permitido.
 * Banco local e IA simulada (sem rede).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import type { StructuredRequest } from "../../server/contentHub/ai/provider";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { createTutorRouter } from "../../server/tutor/router";
import { FICHAS, SITUACOES, fichaDe, fichaTexto, type FichaId } from "../../server/tutor/fichas";
import { NO_REPEAT_RULE, TONE_EXAMPLES, personalityLayer, sampleExamples, type PersonalityParams } from "../../server/tutor/personality";
import { recentExpressions, usedStarts } from "../../server/tutor/emotion";
import { BASE_TUTOR_PROMPT, composeRealtimeInstructions } from "../../server/tutor/prompts";
import { naturalOpening, openingViolations, tooSimilar } from "../../server/tutor/opening";
import { openNexus } from "../../server/tutor/nexus";
import { aceitarTermos } from "./helpers/aceites";

const P: PersonalityParams = { humor: 50, sarcasm: 40, friendliness: 50, strictness: 60, profanity: 0, patience: 50, verbosity: 40, socratic_level: 60, motivation: 50, clinical_pressure: 40 };
const IDS: FichaId[] = ["durao", "acolhedor", "durona", "tranquila"];

describe("fichas do personagem (sem frases prontas)", () => {
  it("as 4 personalidades têm ficha completa: quem é, valores, jeito e as 9 situações", () => {
    expect(Object.keys(FICHAS).sort()).toEqual([...IDS].sort());
    expect(Object.keys(SITUACOES)).toEqual(["acerto", "erro", "erro_repetido", "ansioso", "brincando", "interrupcao", "discordando", "pede_repetir", "sumido"]);
    for (const id of IDS) {
      const f = FICHAS[id];
      for (const campo of [f.quem, f.valores, f.jeito, f.abrir_e_passar, f.nunca]) expect(campo.length).toBeGreaterThan(40);
      for (const s of Object.keys(SITUACOES)) expect(f.reacoes[s as keyof typeof SITUACOES].length, `${id}.${s}`).toBeGreaterThan(30);
      // descrição, não roteiro: nenhuma fala entre aspas para ser dita como está
      const descricao = [f.quem, f.valores, f.jeito, f.abrir_e_passar, f.nunca, ...Object.values(f.reacoes)].join(" ");
      expect(descricao).not.toMatch(/[«»"“”]/);
      // os 2 personagens: Stazi (Durão e Tranquilo) e Stazia (Durona e Tranquila), lontras professoras de um app de estudos
      expect(f.quem).toMatch(id === "durao" || id === "acolhedor" ? /Você é o Stazi, o lontra professor de medicina do StaziaMed/ : /Você é a Stazia, a lontra professora de medicina do StaziaMed/);
      expect(f.quem).toMatch(/aplicativo de estudos/);
      // o gabarito oficial nunca é contestado, nem quando o aluno discorda
      expect(f.reacoes.discordando).toMatch(/gabarito oficial da prova nunca é contestado/);
      const texto = fichaTexto(f);
      for (const label of Object.values(SITUACOES)) expect(texto).toContain(label);
      expect(texto).toMatch(/não roteiro: nenhuma frase daqui é para ser dita como está/);
    }
  });

  it("Tranquila = a descrição aprovada pelo dono; Tranquilo = o jeito do antigo Professor Preguiçoso, sem acusar o aluno de preguiça", () => {
    const tr = fichaTexto(FICHAS.tranquila);
    for (const trecho of ["calma, acolhedora e sem pressa", "com jeito de quem cuida", "dá tempo para o aluno pensar", "não deixa a ansiedade dele virar bloqueio",
      "Acolhe o erro sem constranger, mas não baixa a exigência", "sem discurso motivacional", "nunca com raiva", "Não usa palavrão e não grita", "nunca a dignidade da pessoa"]) {
      expect(tr).toContain(trecho);
    }
    const tq = fichaTexto(FICHAS.acolhedor);
    expect(tq).toMatch(/charme de que explicar dá trabalho/);
    expect(tq).toMatch(/Devolve a pergunta para o aluno pensar primeiro/);
    expect(tq).toMatch(/A preguiça é sua, de brincadeira, e nunca do aluno/);
    expect(FICHAS.acolhedor.nunca).toMatch(/Dizer ou insinuar que o aluno tem preguiça/);
    expect(FICHAS.acolhedor.tiques).toContain("preguiça de");
    for (const id of ["acolhedor", "tranquila"] as const) expect(fichaTexto(FICHAS[id])).toMatch(/Sem palavrão e sem grito|Não usa palavrão e não grita/);
  });

  it("Durão = Durona no masculino; os dois começam no nível 3 com gritos e palavrões e obedecem quando o aluno baixa ou desliga", () => {
    expect(FICHAS.durao.reacoes).toEqual(FICHAS.durona.reacoes);
    expect(FICHAS.durao.jeito).toBe(FICHAS.durona.jeito);
    expect(FICHAS.durao.quem).toMatch(/preceptor brasileiro escrachado.*sarcástico, engraçado e muito expressivo/);
    expect(FICHAS.durona.quem).toMatch(/preceptora brasileira escrachada.*sarcástica, engraçada e muito expressiva/);
    expect(FICHAS.durona.jeito).toMatch(/começa no nível 3, com gritos e palavrões; se o aluno baixou o nível ou desligou grito ou palavrão, você obedece/);
    // a bronca vai para a resposta, nunca para a pessoa; no erro repetido sobe a cobrança, não o insulto
    expect(FICHAS.durona.valores).toMatch(/a bronca é para a resposta/);
    expect(FICHAS.durona.reacoes.erro_repetido).toMatch(/COBRANÇA aumenta, não os insultos/);
    expect(FICHAS.durona.reacoes.sumido).toMatch(/nunca sobre a pessoa/);
  });

  it("a camada de personalidade usa a ficha (no lugar do style_notes do banco), 3 falas de tom sorteadas por conversa e a regra de não repetir", () => {
    const ex = ["Um.", "Dois.", "Três.", "Quatro.", "Cinco.", "Seis."];
    for (const id of IDS) {
      const t = personalityLayer({ id, name: id, params: P, style_notes: "TEXTO VELHO DO BANCO", examples: ex }, P, "off", 3, null, null, { seed: "conversa-1" });
      expect(t).toContain("FICHA DO PERSONAGEM");
      expect(t).not.toContain("TEXTO VELHO DO BANCO");
      expect(t).toContain(NO_REPEAT_RULE);
      expect(t).toMatch(/Nada de humilhar, de chamar o aluno de burro, idiota, preguiçoso/);
      expect((t.match(/«(Um|Dois|Três|Quatro|Cinco|Seis)\.»/g) ?? []).length).toBe(TONE_EXAMPLES);
    }
    // professor fora das 4 (conversa antiga): continua com o texto do banco
    expect(personalityLayer({ id: "direto", name: "Direto", params: P, style_notes: "Texto do Direto." }, P, "off", 3)).toContain("Texto do Direto.");
    // sorteio: a mesma conversa vê sempre as mesmas falas; conversas diferentes veem outras; a ordem original fica
    expect(sampleExamples(ex, 3, "a")).toEqual(sampleExamples(ex, 3, "a"));
    const subsets = new Set(Array.from({ length: 12 }, (_, i) => sampleExamples(ex, 3, `conversa-${i}`).join("|")));
    expect(subsets.size).toBeGreaterThan(3);
    for (const s of subsets) expect(s.split("|").map((x) => ex.indexOf(x))).toEqual([...s.split("|").map((x) => ex.indexOf(x))].sort((a, b) => a - b));
    expect(sampleExamples(["só uma"], 3, "x")).toEqual(["só uma"]);
  });

  it("não repetir: bordões e começos de fala da conversa vão para o estado do professor; o núcleo pede reação às palavras do aluno", () => {
    const falas = ["Na mosca! Agora me diz o porquê.", "Isso, cacete. Essa era difícil.", "Isso, cacete, de novo certo. Na veia."];
    expect(recentExpressions(falas)).toEqual(expect.arrayContaining(["Na mosca", "Na veia"]));
    expect(usedStarts(falas)).toEqual(["Isso cacete", "Na mosca"]);
    expect(BASE_TUTOR_PROMPT).toMatch(/nenhuma fala começa como outra desta conversa/);
    expect(BASE_TUTOR_PROMPT).toMatch(/comecos_ja_usados/);
    expect(BASE_TUTOR_PROMPT).toMatch(/ache o que é DELE na fala/);
    expect(BASE_TUTOR_PROMPT).toMatch(/Raciocínio de exemplo \(não é frase para copiar\)/);
    // na voz ao vivo não existe <estado_do_professor>: a regra fica sem a referência aos campos do texto
    const voz = composeRealtimeInstructions({ mode: "livre", persona: "P", context: "C" });
    expect(voz).toMatch(/nenhuma fala começa como outra desta conversa/);
    expect(voz).not.toMatch(/comecos_ja_usados|evite_repetir/);
  });

  it("conferência da abertura: tamanho, marcação, mesma fala ou mesmo começo do que o aluno já ouviu", () => {
    const ouviu = ["Sepse de novo? Bora ver se hoje sai redondo."];
    expect(openingViolations("Doutora, tuberculose de novo no seu caminho. Me conta por onde quer começar.", ouviu)).toEqual([]);
    // entradas batidas (a bancada achou em várias conversas) não servem de começo
    expect(openingViolations("Chegou a hora, porra. Lê a questão.", []).map((v) => v.code)).toEqual(["batida"]);
    expect(openingViolations("Bora, lê o caso.", []).map((v) => v.code)).toEqual(["batida"]);
    expect(openingViolations("Sepse de novo? Hoje vai, hein.", ouviu).map((v) => v.code)).toEqual(["repeat_start"]);
    expect(openingViolations("Ver se hoje sai redondo essa sepse de novo, hein.", ouviu).map((v) => v.code)).toEqual(["repeat"]);
    // o tema não conta como cópia: toda fala sobre ele o repete
    expect(tooSimilar("Pré-eclâmpsia pede calma: o que você já sabe dela?", "Vamos com calma em Pré-eclâmpsia.", "Pré-eclâmpsia")).toBe(false);
    expect(openingViolations("x".repeat(300), []).map((v) => v.code)).toEqual(["too_long"]);
    expect(openingViolations("[risada] Bora.", []).map((v) => v.code)).toEqual(["markup"]);
    expect(openingViolations("Isso, cacete, próxima.", [], ["Isso cacete"]).map((v) => v.code)).toEqual(["repeat_start"]);
    expect(tooSimilar("Vamos com calma em sepse.", "Sepse, com calma, vamos.")).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------ servidor + banco local
const ADMIN = "00000000-0000-4000-8000-0000000000a7";
const ANA = "00000000-0000-4000-8000-0000000000b7";
const BIA = "00000000-0000-4000-8000-0000000000c7";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-natural-"));
let dev: DevDatabase;
let db: ContentDb;
let server: Server;
let base: string;
const tokens: Record<string, string> = {};
const calls: StructuredRequest[] = [];
let respond: (req: StructuredRequest) => unknown = () => ({ fala: "Começando: me diz o que quer estudar." });
const deps: any = { mockRespond: (req: StructuredRequest) => { calls.push(req); return respond(req); }, log: () => undefined };
const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const rpc = async (uid: string, fn: string, ...args: unknown[]) =>
  (await dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))).rows;
  }))[0].r;
const start = async (uid: string, mode: "livre" | "questao", personality: string, topic: string | null = null) => (await rpc(uid, "app_tutor_start", mode, topic, null, null, personality)).id as string;
const firstMessage = async (sid: string) => (await sql(`select id, content, meta from public.tutor_messages where session_id = $1 order by id limit 1`, [sid]))[0];

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  deps.db = db;
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'ana@t.dev'), ($3, 'bia@t.dev')`, [ADMIN, ANA, BIA]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id in ($1, $2)`, [ANA, BIA]);
  for (const uid of [ADMIN, ANA, BIA]) await aceitarTermos(dev.db, uid);
  for (const uid of [ANA, BIA]) tokens[uid] = await dev.createSession(uid);
  await sql(`update public.ch_flags set value = true where key in ('enabled', 'ai_enabled')`);
  await rpc(ADMIN, "app_admin_tutor_save_config", { enabled: true, requires_pro: true, max_profanity: "moderate" }, "Testes da abertura natural do Tutor.");
  await sql(`update public.profiles set full_name = 'Ana Souza' where id = $1`, [ANA]).catch(() => undefined);
  process.env.TUTOR_AI_PROVIDER = "mock";
  process.env.TUTOR_SETTINGS_TTL_MS = "0";
  delete process.env.DETERMINISTIC_TUTOR;
  const app = express();
  app.use(express.json());
  app.use("/api/tutor", createTutorRouter(deps));
  server = await new Promise<Server>((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}/api/tutor`;
}, 300_000);
afterAll(async () => {
  delete process.env.TUTOR_SETTINGS_TTL_MS;
  delete process.env.TUTOR_ABERTURA_IA;
  await new Promise((r) => server?.close(r));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => {
  calls.length = 0;
  respond = () => ({ fala: "Começando: me diz o que quer estudar." });
  delete process.env.DETERMINISTIC_TUTOR;
  delete process.env.TUTOR_ABERTURA_IA;
});

describe("abertura e passagem criadas pela IA (servidor e banco local)", () => {
  it("abertura com tema: a IA recebe a ficha e o contexto (sem enunciado nem gabarito) e a fala dela troca a reserva", async () => {
    const sid = await start(ANA, "livre", "tranquila", "Sepse");
    const reserva = (await firstMessage(sid)).content;
    respond = () => ({ fala: "Que bom que você veio. Sepse hoje: me conta o que já tem firme na cabeça." });
    const o = await naturalOpening(deps, ANA, sid);
    expect(o?.content).toBe("Que bom que você veio. Sepse hoje: me conta o que já tem firme na cabeça.");
    const m = await firstMessage(sid);
    expect(m).toMatchObject({ id: o!.id, content: o!.content, meta: { opening: true, generated: true, reserve: reserva } });
    expect(calls).toHaveLength(1);
    const req = calls[0];
    expect(req.schemaName).toBe("staziamed_tutor_abertura");
    expect(req.system).toContain("FICHA DO PERSONAGEM");
    expect(req.system).toContain("Você é a Stazia, a lontra professora de medicina do StaziaMed");
    expect(req.system).toContain("Sem palavrão.");
    expect(req.system).toMatch(/Sem conteúdo médico nenhum/);
    expect(req.input).toMatch(/"tema":"Sepse"/);
    expect(req.input).toMatch(/"jeito_de_comecar":"comece [^"]+"/);
    expect(req.system).toMatch(/entradas batidas: «chegou»/);
    expect(req.input).toMatch(/"periodo_do_dia":"(madrugada|manhã|tarde|noite)"/);
    expect(req.input).toContain(JSON.stringify(reserva).slice(1, -1)); // a reserva entra em <ja_ouviu>: a IA não copia
    // a próxima conversa dela com a Tranquila já leva essa fala em <ja_ouviu>
    const sid2 = await start(ANA, "livre", "tranquila", "Sepse");
    respond = () => ({ fala: "Olha você de volta. Vamos de sepse: por onde quer entrar?" });
    expect((await naturalOpening(deps, ANA, sid2))?.content).toMatch(/Olha você de volta/);
    expect(calls[1].input).toContain("Que bom que você veio. Sepse hoje");
  });

  it("questão aberta: sem enunciado, alternativas e gabarito no pedido; fala que entrega a letra é barrada e a reserva fica", async () => {
    const sid = await start(BIA, "questao", "durona");
    const q = (await sql(`select q.correct_option o, q.statement s from public.tutor_sessions t join public.questions q on q.id = t.question_id where t.id = $1`, [sid]))[0];
    const reserva = (await firstMessage(sid)).content;
    respond = () => ({ fala: `Pode marcar a ${q.o} sem medo, bora.` });
    expect(await naturalOpening(deps, BIA, sid)).toBeNull();
    expect(calls).toHaveLength(2); // tentou de novo com a correção
    expect(calls[1].input).toMatch(/<correcao_obrigatoria>/);
    for (const c of calls) {
      expect(c.input).not.toContain(String(q.s).slice(0, 40));
      expect(c.input).not.toMatch(/gabarito|official_answer|correct_option/i);
    }
    const m = await firstMessage(sid);
    expect(m.content).toBe(reserva);
    expect(m.meta).toMatchObject({ opening: true, natural_tried: true });
    // não tenta de novo para a mesma fala
    calls.length = 0;
    expect(await naturalOpening(deps, BIA, sid)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("número sem base e palavrão acima do nível são barrados (a Tranquila nunca xinga); a reserva fica", async () => {
    const a = await start(BIA, "livre", "tranquila", "Anafilaxia");
    respond = () => ({ fala: "Anafilaxia hoje. Lembra: adrenalina 0,5 mg e pronto. Me conta o que sabe." });
    expect(await naturalOpening(deps, BIA, a)).toBeNull();
    const b = await start(BIA, "livre", "tranquila", "Anafilaxia");
    respond = () => ({ fala: "Porra, anafilaxia de novo. Me conta o que sabe." });
    expect(await naturalOpening(deps, BIA, b)).toBeNull();
    for (const sid of [a, b]) expect((await firstMessage(sid)).meta).toMatchObject({ natural_tried: true });
  });

  it("repetição: a mesma fala de antes é barrada; na segunda tentativa a IA cria outra e ela entra", async () => {
    const a = await start(BIA, "livre", "acolhedor", "Dengue");
    respond = () => ({ fala: "Dengue, é? Joga aí o que você já sacou do assunto." });
    expect(await naturalOpening(deps, BIA, a)).not.toBeNull();
    const b = await start(BIA, "livre", "acolhedor", "Dengue");
    calls.length = 0;
    let n = 0;
    respond = () => (++n === 1 ? { fala: "Dengue, é? Joga aí o que você já sacou do assunto." } : { fala: "Voltou pra dengue. Começa pelo que te confunde mais." });
    expect((await naturalOpening(deps, BIA, b))?.content).toBe("Voltou pra dengue. Começa pelo que te confunde mais.");
    expect(calls[1].input).toMatch(/Começa igual a uma fala que o aluno já ouviu|Parecida demais/);
  });

  it("IA fora do ar, lenta ou desligada: a reserva fica, sem erro; modo determinístico e TUTOR_ABERTURA_IA=0 não chamam a IA", async () => {
    const a = await start(ANA, "livre", "durao", "IAM");
    const reserva = (await firstMessage(a)).content;
    respond = () => { throw new Error("provedor caiu"); };
    expect(await naturalOpening(deps, ANA, a)).toBeNull();
    expect((await firstMessage(a)).content).toBe(reserva);
    const b = await start(ANA, "livre", "durao", "IAM");
    respond = () => ({ fala: "Pronto." });
    expect(await naturalOpening(deps, ANA, b, 100)).toBeNull(); // tempo curto demais: nem chama
    calls.length = 0;
    process.env.DETERMINISTIC_TUTOR = "true";
    expect(await naturalOpening(deps, ANA, await start(ANA, "livre", "durao", "IAM"))).toBeNull();
    delete process.env.DETERMINISTIC_TUTOR;
    process.env.TUTOR_ABERTURA_IA = "0";
    expect(await naturalOpening(deps, ANA, await start(ANA, "livre", "durao", "IAM"))).toBeNull();
    expect(calls).toHaveLength(0);
    // IA desligada no painel
    delete process.env.TUTOR_ABERTURA_IA;
    await sql(`update public.ch_flags set value = false where key = 'ai_enabled'`);
    expect(await naturalOpening(deps, ANA, await start(ANA, "livre", "durao", "IAM"))).toBeNull();
    await sql(`update public.ch_flags set value = true where key = 'ai_enabled'`);
    expect(calls).toHaveLength(0);
  });

  it("passagem para a próxima questão: criada pela IA com o resultado da anterior; começo repetido da conversa é barrado", async () => {
    const sid = await start(ANA, "questao", "durona");
    respond = () => ({ fala: "Questão na tela, e hoje eu quero raciocínio. Lê inteiro e me fala." });
    await naturalOpening(deps, ANA, sid);
    const correct = (await sql(`select q.correct_option o from public.tutor_sessions t join public.questions q on q.id = t.question_id where t.id = $1`, [sid]))[0].o;
    await rpc(ANA, "app_tutor_answer", sid, correct, 4, 30_000, null);
    await rpc(ANA, "app_tutor_next_question", sid);
    calls.length = 0;
    let n = 0;
    respond = () => (++n === 1 ? { fala: "Questão na mesa de novo, lê com calma." } : { fala: "Acertou a outra, então sobe a régua: essa aqui é mais chata." });
    const o = await naturalOpening(deps, ANA, sid);
    expect(o?.content).toBe("Acertou a outra, então sobe a régua: essa aqui é mais chata.");
    expect(calls[0].input).toMatch(/passagem para a próxima questão/);
    expect(calls[0].input).toMatch(/"questao_anterior":"acertou"/);
    expect(calls[1].input).toMatch(/Já houve fala nesta conversa começando com «questao na»/);
    const last = (await sql(`select content, meta from public.tutor_messages where session_id = $1 order by id desc limit 1`, [sid]))[0];
    expect(last).toMatchObject({ content: o!.content, meta: { opening: true, generated: true } });
    expect((await sql(`select kind from public.tutor_recent_openings where session_id = $1 order by id`, [sid])).map((r: any) => r.kind)).toEqual(["abertura", "passagem"]);
  });

  it("a Nexus devolve a abertura nova junto com o jeito; no meio da conversa (skip) nada é pedido; a rota /opening só troca a conversa do próprio aluno", async () => {
    const sid = await start(ANA, "livre", "tranquila", "Pré-eclâmpsia");
    respond = () => ({ fala: "Oi. Pré-eclâmpsia é um tema que pede calma: o que você já sabe dele?" });
    const r = await openNexus(deps, ANA, sid, false);
    expect(r.opening).toEqual({ id: (await firstMessage(sid)).id, content: "Oi. Pré-eclâmpsia é um tema que pede calma: o que você já sabe dele?" });
    calls.length = 0;
    const s2 = await start(ANA, "livre", "tranquila", "Pré-eclâmpsia");
    const r2 = await openNexus(deps, ANA, s2, true, "eleven");
    expect(r2.opening).toBeUndefined();
    expect(calls).toHaveLength(0);
    // rota: outro aluno não troca; o dono da conversa troca; id inválido é recusado
    const post = async (uid: string, body: unknown) => {
      const res = await fetch(`${base}/opening`, { method: "POST", headers: { Authorization: `Bearer ${tokens[uid]}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: res.status, json: await res.json() };
    };
    expect(await post(BIA, { session_id: s2 })).toEqual({ status: 200, json: { opening: null } });
    respond = () => ({ fala: "Tô aqui, sem pressa. Me conta o que te trouxe pra pré-eclâmpsia hoje." });
    expect((await post(ANA, { session_id: s2 })).json.opening.content).toMatch(/Tô aqui, sem pressa/);
    expect((await post(ANA, { session_id: "nao-e-uuid" })).status).toBe(400);
  });
});
