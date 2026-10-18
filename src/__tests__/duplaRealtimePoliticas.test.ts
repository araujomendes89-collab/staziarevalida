// @vitest-environment node
/**
 * Treinamento em Dupla · Tempo real (Presença): quem pode ler e enviar nos canais privados, conferido nas políticas de
 * realtime.messages que a migração 9750 cria. O esquema `realtime` aqui é falso, igual ao do Supabase no que as políticas usam
 * (tabela com acesso por linha ligado e realtime.topic() vindo de uma variável da transação). Sem esse esquema (banco local),
 * a migração não cria política nenhuma e também não dá erro.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { U, addStation, makeRoom, openDuplaDb, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

describe("Treinamento em Dupla — políticas do Realtime", () => {
  let d: DuplaDb;
  let sala = "";
  const topico = (t: string) => ({ "realtime.topic": t });

  /** Mensagens que a pessoa enxerga no canal `t` (a política de leitura só olha o tópico da conexão). */
  const veLinhas = async (uid: string, t: string) => (await d.asUser(uid, `select topic from realtime.messages`, [], topico(t))).length;
  /** Tenta enviar uma presença (ou outro tipo) no canal `t`: true se o banco aceitou. */
  const envia = async (uid: string, t: string, extension = "presence") => {
    try {
      const r = await d.asUser(uid, `insert into realtime.messages (topic, extension) values ($1, $2)`, [t, extension], topico(t));
      return r.affectedRows === 1;
    } catch (e) {
      expect(String((e as Error).message)).toMatch(/row-level security/);
      return false;
    }
  };

  beforeAll(async () => {
    d = await openDuplaDb({ realtime: true });
    await addStation(d.db);
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    for (const uid of [U.ana, U.bruno, U.carla]) await setPlan(d.db, uid, "pro", "active");
    sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "setup", candidate: U.ana, evaluator: U.bruno });
    // Linhas já existentes no canal, para a leitura ter o que mostrar.
    await d.sql(`insert into realtime.messages (topic, extension) values ('dupla:online', 'presence'), ($1, 'presence')`, ["room:" + sala]);
  }, 60_000);
  afterAll(async () => {
    await d?.db.close();
  });

  it("room:{id}: membro com acesso lê e envia presença; quem não é membro não; tópico inválido não dá erro", async () => {
    const t = `room:${sala}`;
    for (const uid of [U.ana, U.bruno]) {
      expect(await veLinhas(uid, t), "lê").toBeGreaterThan(0);
      expect(await envia(uid, t), "envia presença").toBe(true);
      expect(await envia(uid, t, "broadcast"), "só presença").toBe(false);
    }
    // Não membro, mesmo com plano; e quem entra no canal de outra sala.
    expect(await veLinhas(U.carla, t)).toBe(0);
    expect(await envia(U.carla, t)).toBe(false);
    // Membro que perdeu o acesso ao módulo (plano cancelado) sai do canal.
    await setPlan(d.db, U.bruno, "pro", "canceled");
    expect(await veLinhas(U.bruno, t)).toBe(0);
    expect(await envia(U.bruno, t)).toBe(false);
    await setPlan(d.db, U.bruno, "pro", "active");
    expect(await veLinhas(U.bruno, t)).toBeGreaterThan(0);
    // Tópicos fora do formato ou de sala que não existe: sem linhas e sem erro.
    for (const ruim of ["room:", "room:abc", "room:00000000-0000-4000-8000-0000000000ff", "room:' or 1=1 --", "sala:" + sala, "room:" + sala + "x", "room:%"]) {
      expect(await veLinhas(U.ana, ruim), ruim).toBe(0);
      expect(await envia(U.ana, ruim), ruim).toBe(false);
    }
    // A função usada pela política: tópico inválido ou vazio dá falso, sem erro.
    for (const ruim of [null, "", "room:abc", "dupla:online"]) {
      expect((await d.asUser(U.ana, `select public.dupla_room_member($1) as ok`, [ruim]))[0].ok, String(ruim)).toBe(false);
    }
    expect((await d.asUser(U.ana, `select public.dupla_room_member($1) as ok`, [t]))[0].ok).toBe(true);
    expect((await d.asUser(U.ana, `select public.dupla_room_member($1) as ok`, [t.toUpperCase().replace("ROOM:", "room:")]))[0].ok).toBe(true);
    // Sem tópico definido na conexão, nada passa.
    expect((await d.asUser(U.ana, `select topic from realtime.messages`)).length).toBe(0);
  });

  it("dupla:online: aluno com acesso lê e envia presença; sem plano não; equipe sim", async () => {
    expect(await veLinhas(U.ana, "dupla:online")).toBeGreaterThan(0);
    expect(await envia(U.ana, "dupla:online")).toBe(true);
    expect(await envia(U.ana, "dupla:online", "broadcast")).toBe(false);
    expect(await envia(U.ana, "dupla:outro")).toBe(false);
    // Sem plano marcado (teste grátis com a chave só para Pro/Elite) e com a conta cancelada: fora.
    expect(await veLinhas(U.diego, "dupla:online")).toBe(0);
    expect(await envia(U.diego, "dupla:online")).toBe(false);
    await setPlan(d.db, U.eva, "pro", "canceled");
    expect(await veLinhas(U.eva, "dupla:online")).toBe(0);
    // Equipe (administrador) entra.
    expect(await veLinhas(U.admin, "dupla:online")).toBeGreaterThan(0);
    expect(await envia(U.admin, "dupla:online")).toBe(true);
    // Chave desligada: o aluno sai, a equipe fica.
    await setDupla(d.db, { aberto: false, planos: ["pro", "elite"] });
    expect(await veLinhas(U.ana, "dupla:online")).toBe(0);
    expect(await envia(U.ana, "dupla:online")).toBe(false);
    expect(await veLinhas(U.admin, "dupla:online")).toBeGreaterThan(0);
    // A sala também depende da chave: o aluno membro não entra enquanto o módulo está fechado.
    expect(await veLinhas(U.ana, `room:${sala}`)).toBe(0);
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
  });

  it("sem o esquema realtime (banco local) a migração cola sem erro e não cria política", async () => {
    const local = await openDuplaDb(); // sem realtime
    try {
      expect(await local.sql(`select to_regclass('realtime.messages') as r`)).toEqual([{ r: null }]);
      expect(await local.sql(`select 1 from pg_policies where policyname like 'treino em dupla:%'`)).toEqual([]);
      expect((await local.sql(`select policyname from pg_policies where schemaname = 'realtime'`)).length).toBe(0);
    } finally {
      await local.db.close();
    }
  }, 60_000);

  it("as duas políticas existem só no esquema realtime, para o papel authenticated, e só a de envio limita a presença", async () => {
    const pol = await d.sql<{ policyname: string; cmd: string; roles: string; with_check: string | null }>(
      `select policyname, cmd, roles::text, with_check from pg_policies where schemaname = 'realtime' and tablename = 'messages' order by policyname`
    );
    expect(pol.map((p) => [p.policyname, p.cmd, p.roles])).toEqual([
      ["treino em dupla: enviar presença", "INSERT", "{authenticated}"],
      ["treino em dupla: ler canais", "SELECT", "{authenticated}"],
    ]);
    expect(pol[0].with_check).toMatch(/presence/);
  });
});
