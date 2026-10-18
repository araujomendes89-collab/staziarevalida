// @vitest-environment node
/**
 * Vozes do Nexus no servidor (spec §11 e §16 "Aprovação"): o painel de audição e aprovação roda sobre o mesmo servidor do
 * Tutor. Aprovar exige que o servidor tenha registrado as audições de todos os cenários daquela versão da voz nas últimas
 * 24 h, só quem está em TUTOR_VOICE_APPROVERS aprova ou revoga, cada voz vale sozinha, a aprovação cai quando a versão muda e
 * a "Apresentação" aprovada fica guardada para o "Ouvir" do aluno. Audições ficam fora dos limites e dos tetos. Sem rede.
 * A voz é a do personagem no Gemini TTS (Stazi = Zubenelgenubi +3 semitons, Stazia = Kore); a ElevenLabs só de reserva.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb } from "../../server/contentHub/infra";
import { buildEngineStatements } from "../../scripts/supabase/engine-seed";
import { createTutorRouter } from "../../server/tutor/router";
import { createVoicePreviewRouter, samplePath, voiceApprovers, SAMPLE_BUCKET } from "../../server/tutor/voicePreview";
import { voiceFingerprint } from "../../server/tutor/officialVoices";
import { OFFICIAL_VOICES, VOICE_SCENARIOS, scenariosFor } from "../shared/tutor/officialVoices";
import { aceitarTermos } from "./helpers/aceites";
import { GEMINI_VOZ_ENV, custoDe, pedidoGemini, respostaGemini } from "./helpers/vozGemini";

const ENV = GEMINI_VOZ_ENV;
const ELEVEN = { ELEVENLABS_API_KEY: "chave-falsa-de-teste-" + "x".repeat(40), ELEVENLABS_VOICE_STAZI: "vozStaziTeste000001", ELEVENLABS_VOICE_STAZIA: "vozStaziaTeste00001" };
const SERVER_ENV = { TUTOR_VOICE_APPROVERS: " Dono@T.dev, socia@t.dev " };
const DONO = "00000000-0000-4000-8000-0000000000b1";
const SOCIA = "00000000-0000-4000-8000-0000000000b2";
const ADMIN2 = "00000000-0000-4000-8000-0000000000b3";
const ALUNO = "00000000-0000-4000-8000-0000000000b4";
const NOVO = "00000000-0000-4000-8000-0000000000b5";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tutor-vozes-"));
let dev: DevDatabase;
let db: ContentDb;
let server: Server | null = null;
let base: string;
const tokens: Record<string, string> = {};
let generated: { url: string; text: string; voice: string }[] = [];
const fakeFetch = (async (url: string, init: RequestInit) => {
  const pedido = pedidoGemini(init);
  generated.push({ url, text: pedido.text, voice: pedido.voice });
  // o som depende só do texto: o mesmo texto dá sempre o mesmo MP3
  return respostaGemini(pedido.text);
}) as typeof fetch;
const deps: any = { mockRespond: () => ({}), fetch: fakeFetch, elevenEnv: ENV };

const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
const call = async (uid: string | null, method: "GET" | "POST", url: string, body?: unknown) => {
  const r = await fetch(`${base}${url}`, {
    method, headers: { ...(uid ? { Authorization: `Bearer ${tokens[uid]}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, type, json: type.includes("json") ? await r.json() : null, bytes: type.includes("audio") ? Buffer.from(await r.arrayBuffer()) : null, cache: r.headers.get("cache-control") };
};
const preview = (uid: string, personality: string, scenario: string) => call(uid, "POST", "/tutor/voices/preview", { personality, scenario });
const panel = (uid: string) => call(uid, "GET", "/tutor/voices");
const rowOf = (p: any, id: string) => p.rows.find((r: any) => r.id === id);
/** Audições já registradas (sem passar pelo gerador): para os testes que não medem a audição em si. */
const heardAll = async (uid: string, voice: "stazi" | "stazia", env = ENV) => {
  for (const sc of scenariosFor(voice)) await sql(`select public.ch_worker_tutor_voice_listened($1, $2, $3, $4)`, [uid, voice, voiceFingerprint(voice, env), sc]);
};

/** Um servidor novo por teste: o limite de 12 audições por minuto e o cache de áudio começam do zero. */
async function mount() {
  if (server) await new Promise((r) => server!.close(r));
  const app = express();
  app.use(express.json());
  app.use("/tutor/voices", createVoicePreviewRouter(deps, SERVER_ENV));
  app.use("/tutor", createTutorRouter(deps));
  server = await new Promise<Server>((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
}

beforeAll(async () => {
  process.env.TUTOR_SETTINGS_TTL_MS = "0";
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  deps.db = db;
  deps.storage = localStorageDir(path.join(tmp, "amostras"));
  for (const st of buildEngineStatements()) await dev.db.exec(st);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'dono@t.dev'), ($2, 'socia@t.dev'), ($3, 'outro.admin@t.dev'), ($4, 'aluno@t.dev'), ($5, 'novo@t.dev')`, [DONO, SOCIA, ADMIN2, ALUNO, NOVO]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id in ($1, $2, $3)`, [DONO, SOCIA, ADMIN2]);
  await dev.db.query(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '30 days' where user_id = $1`, [ALUNO]);
  for (const uid of [DONO, SOCIA, ADMIN2, ALUNO]) await aceitarTermos(dev.db, uid);
  for (const uid of [DONO, SOCIA, ADMIN2, ALUNO, NOVO]) tokens[uid] = await dev.createSession(uid);
  await sql(`update public.tutor_config set enabled = true, voice_enabled = true, tts_team_only = false, tts_price_per_1k_chars_usd = 0.3`);
}, 300_000);
afterAll(async () => {
  delete process.env.TUTOR_SETTINGS_TTL_MS;
  if (server) await new Promise((r) => server!.close(r));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(async () => {
  generated = [];
  deps.elevenEnv = ENV;
  await sql(`delete from public.tutor_voice_approvals`);
  await sql(`delete from public.tutor_voice_listen_log`);
  await sql(`delete from public.tutor_tts_usage`);
  await mount();
});

describe("Vozes do Stazi e da Stazia: audição e aprovação no servidor", () => {
  it("aprovar só depois de o servidor registrar todos os cenários daquela versão nas últimas 24 h; o navegador não manda a versão", async () => {
    expect(voiceApprovers(SERVER_ENV)).toEqual(["dono@t.dev", "socia@t.dev"]);
    expect(await call(DONO, "POST", "/tutor/voices/approve", { personality: "stazia" })).toMatchObject({ status: 409, json: { error: "Ouça todos os cenários desta voz antes de aprovar." } });
    const fp = voiceFingerprint("stazia", ENV);
    expect((await call(DONO, "POST", "/tutor/voices/approve", { personality: "stazia", fingerprint: fp })).status).toBe(400);
    for (const sc of scenariosFor("stazia")) expect((await preview(DONO, "stazia", sc)).status, sc).toBe(200);
    let p = (await panel(DONO)).json;
    expect(rowOf(p, "stazia").scenarios.map((s: any) => [s.id, s.heard])).toEqual(scenariosFor("stazia").map((id) => [id, true]));
    expect(rowOf(p, "stazia").can_approve).toBe(true);
    // uma audição com mais de 24 h não vale: a aprovação recusa até ouvir de novo
    await sql(`update public.tutor_voice_listen_log set heard_at = now() - interval '25 hours' where scenario = 'alivio'`);
    expect(rowOf((await panel(DONO)).json, "stazia").can_approve).toBe(false);
    expect((await call(DONO, "POST", "/tutor/voices/approve", { personality: "stazia" })).status).toBe(409);
    expect((await preview(DONO, "stazia", "alivio")).status).toBe(200);
    const ok = await call(DONO, "POST", "/tutor/voices/approve", { personality: "stazia" });
    expect(ok.status).toBe(200);
    expect(rowOf(ok.json, "stazia")).toMatchObject({ approved: true, fingerprint: fp, can_approve: false });
    expect(rowOf(ok.json, "stazia").approved_at).toEqual(expect.any(String));
    expect((await sql(`select voice, fingerprint, approved_by from public.tutor_voice_approvals`))).toEqual([{ voice: "stazia", fingerprint: fp, approved_by: DONO }]);
  });

  it("só quem está em TUTOR_VOICE_APPROVERS aprova ou revoga; outro administrador ouve mas não aprova; aluno nem ouve", async () => {
    expect((await preview(ADMIN2, "stazi", "apresentacao")).status).toBe(200);
    await heardAll(ADMIN2, "stazi");
    const p = (await panel(ADMIN2)).json;
    expect(p.approver).toBe(false);
    expect(rowOf(p, "stazi").can_approve).toBe(false);
    for (const action of ["approve", "revoke"]) {
      expect(await call(ADMIN2, "POST", `/tutor/voices/${action}`, { personality: "stazi" })).toMatchObject({ status: 403, json: { error: "Só quem está na lista de aprovação pode aprovar ou revogar." } });
    }
    expect((await sql(`select count(*)::int n from public.tutor_voice_approvals`))[0].n).toBe(0);
    expect((await panel(DONO)).json.approver).toBe(true);
    expect((await panel(ALUNO)).status).toBe(403);
    expect((await preview(ALUNO, "stazi", "apresentacao")).status).toBe(403);
    expect((await call(null, "GET", "/tutor/voices")).status).toBe(401);
    expect(generated).toHaveLength(1);
  });

  it("cada voz vale sozinha e na hora; revogar uma não mexe nas outras", async () => {
    await heardAll(DONO, "stazia");
    await heardAll(SOCIA, "stazi");
    expect((await call(DONO, "POST", "/tutor/voices/approve", { personality: "stazia" })).status).toBe(200);
    // aprovada a voz da Stazia, a Durona já fala com o aluno; o Durão (voz do Stazi) ainda não
    const fala = (personality: string, letter: string) => call(ALUNO, "POST", "/tutor/speech", { kind: "phrase", phrase: "marked", letter, personality_id: personality });
    expect((await fala("durona", "A")).status).toBe(200);
    expect(await fala("durao", "A")).toMatchObject({ status: 409, json: { code: "voice_unavailable" } });
    expect((await call(SOCIA, "POST", "/tutor/voices/approve", { personality: "stazi" })).status).toBe(200);
    expect((await fala("durao", "A")).status).toBe(200);
    const revoked = await call(DONO, "POST", "/tutor/voices/revoke", { personality: "stazia" });
    expect(revoked.status).toBe(200);
    expect(Object.fromEntries(revoked.json.rows.map((r: any) => [r.id, r.approved]))).toEqual({ stazi: true, stazia: false });
    expect(await fala("durona", "B")).toMatchObject({ status: 409, json: { code: "voice_unavailable" } });
    expect((await fala("durao", "B")).status).toBe(200);
  });

  it("a aprovação cai sozinha quando a versão muda (outro serviço, voz ou modelo); a reserva ElevenLabs não usa as vozes antigas", async () => {
    await heardAll(DONO, "stazia");
    expect((await call(DONO, "POST", "/tutor/voices/approve", { personality: "stazia" })).status).toBe(200);
    expect(rowOf((await panel(DONO)).json, "stazia").approved).toBe(true);
    expect((await panel(DONO)).json).toMatchObject({ engine: "gemini", model: "gemini-3.8-flash-tts" });
    // a reserva ElevenLabs ligada de propósito é outra versão: pede audição e aprovação novas; e cada troca nela também
    for (const change of [{}, { ELEVENLABS_VOICE_STAZIA: "outraVozDurona0001" }, { ELEVENLABS_MODEL_ID: "eleven_multilingual_v2" }]) {
      deps.elevenEnv = { ...ENV, TUTOR_VOICE_ENGINE: "elevenlabs", ...ELEVEN, ...change };
      const p = (await panel(DONO)).json;
      expect(p.engine).toBe("elevenlabs");
      const row = rowOf(p, "stazia");
      expect(row, JSON.stringify(change)).toMatchObject({ ready: true, approved: false, approved_at: null, can_approve: false });
      expect(row.scenarios.every((s: any) => !s.heard)).toBe(true); // a versão nova pede audição nova
    }
    // reserva ligada só com as variáveis ANTIGAS (Tranquilo, Durona): nenhuma voz fica pronta, nada toca
    deps.elevenEnv = { ...ENV, TUTOR_VOICE_ENGINE: "elevenlabs", ELEVENLABS_API_KEY: ELEVEN.ELEVENLABS_API_KEY, ELEVENLABS_VOICE_TRANQUILO: "vozAntigaTranquilo1", ELEVENLABS_VOICE_DURONA: "vozAntigaDurona0001" };
    expect((await panel(DONO)).json.rows.map((r: any) => [r.id, r.ready, r.configured])).toEqual([["stazi", false, false], ["stazia", false, false]]);
    expect((await preview(DONO, "stazia", "apresentacao")).status).toBe(503);
    expect(generated).toHaveLength(1); // só a Apresentação guardada ao aprovar, no começo do teste
    // sem TUTOR_VOICE_ENGINE, as variáveis da ElevenLabs não mudam nada: a voz e a versão seguem as do Gemini
    deps.elevenEnv = { ...ENV, ...ELEVEN, ELEVENLABS_VOICE_TRANQUILO: "vozAntigaTranquilo1" };
    expect(rowOf((await panel(DONO)).json, "stazia")).toMatchObject({ approved: true, fingerprint: voiceFingerprint("stazia", ENV) });
    expect(generated).toHaveLength(1);
    // o cenário entra na versão (conferido com a versão gravada pelo painel)
    deps.elevenEnv = ENV;
    expect(rowOf((await panel(DONO)).json, "stazia").fingerprint).toBe(voiceFingerprint("stazia", ENV));
  });

  it("ao aprovar, a Apresentação vai para tutor-voice-samples/<voz>/<versão>.mp3 e é ela que toca no Ouvir do aluno, sem gerar voz", async () => {
    expect(SAMPLE_BUCKET).toBe("tutor-voice-samples");
    const fp = voiceFingerprint("stazia", ENV);
    expect(samplePath("stazia", fp)).toBe(`stazia/${fp}.mp3`);
    await heardAll(DONO, "stazia");
    const heard = (await preview(DONO, "stazia", "apresentacao")).bytes!;
    const before = generated.length;
    expect((await call(DONO, "POST", "/tutor/voices/approve", { personality: "stazia" })).status).toBe(200);
    expect(generated.length).toBe(before); // a Apresentação ouvida estava no cache
    expect((await sql(`select sample_path from public.tutor_voice_approvals where voice = 'stazia'`))[0].sample_path).toBe(samplePath("stazia", fp));
    const stored = await deps.storage.get(samplePath("stazia", fp));
    // guardada a mesma Apresentação ouvida (o texto do catálogo, na voz da Stazia), já em MP3
    expect(stored.equals(heard)).toBe(true);
    expect(generated.map((g) => [g.text, g.voice])).toEqual([[OFFICIAL_VOICES.stazia.sample, "Kore"]]);
    expect(OFFICIAL_VOICES.stazia.sample).toMatch(/^Eu sou a Stazia\./);
    expect(stored[0] === 0xff && (stored[1] & 0xe0) === 0xe0).toBe(true); // começa num quadro MP3
    // o "Ouvir" do aluno toca o arquivo guardado, sem gerar voz
    const n = generated.length;
    const ouvir = await call(ALUNO, "GET", "/tutor/voice/sample/durona");
    expect(ouvir).toMatchObject({ status: 200, type: "audio/mpeg", cache: "private, max-age=3600" });
    expect(ouvir.bytes!.equals(stored)).toBe(true);
    expect(generated.length).toBe(n);
    // sem aprovação, com outra versão no ar ou sem o aceite: nada toca
    expect(await call(ALUNO, "GET", "/tutor/voice/sample/stazi")).toMatchObject({ status: 404, json: { error: "Amostra indisponível." } });
    expect((await call(NOVO, "GET", "/tutor/voice/sample/durona")).json).toMatchObject({ code: "tutor_consent" });
    deps.elevenEnv = { ...ENV, TUTOR_VOICE_ENGINE: "elevenlabs", ...ELEVEN };
    expect((await call(ALUNO, "GET", "/tutor/voice/sample/durona")).status).toBe(404);
    // sem a Apresentação no cache, aprovar gera de novo (como audição)
    deps.elevenEnv = ENV;
    await mount();
    await heardAll(SOCIA, "stazi");
    const m = generated.length;
    expect((await call(SOCIA, "POST", "/tutor/voices/approve", { personality: "stazi" })).status).toBe(200);
    expect(generated.length).toBe(m + 1);
    expect(generated.at(-1)).toMatchObject({ text: OFFICIAL_VOICES.stazi.sample, voice: "Zubenelgenubi" });
    expect(OFFICIAL_VOICES.stazi.sample).toContain("Eu sou o Stazi.");
    expect((await deps.storage.get(samplePath("stazi", voiceFingerprint("stazi", ENV)))).length).toBeGreaterThan(500);
  });

  it("VZ02: o Ouvir do aluno também confere só equipe e a voz ligada; pedido direto não toca a amostra; a equipe continua ouvindo", async () => {
    expect((await preview(DONO, "stazia", "apresentacao")).status).toBe(200);
    await heardAll(DONO, "stazia");
    expect((await call(DONO, "POST", "/tutor/voices/approve", { personality: "stazia" })).status).toBe(200);
    const nego = { status: 404, json: { error: "Amostra indisponível." } };
    try {
      expect((await call(ALUNO, "GET", "/tutor/voice/sample/durona")).status).toBe(200);
      // "só equipe" ligado: o aluno não ouve, nem pelo pedido direto; a equipe (administrador) ouve
      await sql(`update public.tutor_config set tts_team_only = true`);
      expect(await call(ALUNO, "GET", "/tutor/voice/sample/durona")).toMatchObject(nego);
      expect((await call(SOCIA, "GET", "/tutor/voice/sample/durona")).status).toBe(200);
      // voz do Tutor desligada no painel: o aluno não ouve; a equipe também não (a tela some com o botão)
      await sql(`update public.tutor_config set tts_team_only = false, voice_enabled = false`);
      expect(await call(ALUNO, "GET", "/tutor/voice/sample/durona")).toMatchObject(nego);
    } finally {
      await sql(`update public.tutor_config set tts_team_only = false, voice_enabled = true`);
    }
    // tudo ligado de novo: volta a tocar
    expect((await call(ALUNO, "GET", "/tutor/voice/sample/durona")).status).toBe(200);
  });

  it("audições entram como tutor_tts_audicao e não contam no limite de quem ouviu nem nos tetos", async () => {
    const ledger = async () => sql(`select feature, characters, estimated_cost_usd::float c, meta from public.ai_usage_ledger where user_id = $1 and feature = 'tutor_tts_audicao' order by id`, [DONO]);
    const before = (await ledger()).length;
    expect((await preview(DONO, "stazi", "repeticao")).status).toBe(200);
    expect((await preview(DONO, "stazi", "repeticao")).status).toBe(200); // do cache: registra a audição, não gera nem cobra
    const rows = (await ledger()).slice(before);
    const text = VOICE_SCENARIOS.repeticao.text;
    // o custo é o que o Google informou (tokens do Gemini), não o preço por mil caracteres do painel
    expect(rows).toEqual([{ feature: "tutor_tts_audicao", characters: text.length, c: custoDe(text), meta: expect.objectContaining({ voice: "stazi", scenario: "repeticao", seconds: expect.any(Number) }) }]);
    expect(custoDe(text)).not.toBe(Math.round((text.length / 1000) * 0.3 * 1e6) / 1e6);
    expect((await sql(`select count(*)::int n from public.tutor_voice_listen_log where user_id = $1 and scenario = 'repeticao'`, [DONO]))[0].n).toBe(2);
    expect((await sql(`select count(*)::int n from public.tutor_tts_usage`))[0].n).toBe(0);
    const q = (await sql(`select public.ch_worker_tutor_tts_quota($1) q`, [DONO]))[0].q;
    expect(q).toMatchObject({ used_today: 0, account_day_left: 4500, account_month_left: 30000 });
  });

  it("o painel não escolhe a voz: só personalidade e cenário; nenhuma chave nas respostas", async () => {
    for (const body of [
      { personality: "stazi", scenario: "apresentacao", text: "Fale outra coisa" },
      { personality: "stazi", scenario: "apresentacao", voice_id: "qualquerVoz000001" },
      { personality: "stazi", scenario: "__proto__" },
      { personality: "__proto__", scenario: "apresentacao" },
    ]) expect((await call(DONO, "POST", "/tutor/voices/preview", body)).status, JSON.stringify(body)).toBe(400);
    // voz ou cenário que não existem: o Direto saiu e a comemoração dele também
    expect(await preview(DONO, "direto", "alivio")).toMatchObject({ status: 400, json: { error: "Voz ou cenário de teste inválido." } });
    expect(await preview(DONO, "stazia", "comemoracao")).toMatchObject({ status: 400 });
    expect(generated).toHaveLength(0);
    expect((await preview(DONO, "stazia", "apresentacao")).status).toBe(200);
    expect(generated[0]).toMatchObject({ voice: "Kore", text: OFFICIAL_VOICES.stazia.sample });
    expect(generated[0].url).toContain("gemini-3.8-flash-tts");
    expect(generated[0].url).not.toContain(ENV.VERTEX_API_KEY);
    const raw = JSON.stringify((await panel(DONO)).json);
    for (const secret of [ENV.VERTEX_API_KEY, "Kore", "Zubenelgenubi"]) expect(raw).not.toContain(secret);
  });
});
