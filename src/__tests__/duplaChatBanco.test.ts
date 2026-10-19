// @vitest-environment node
/**
 * Treinamento em Dupla · Etapa C · Tarefa C1: a migração 013370 (supabase/migrations/…013370_treino_dupla_chat.sql).
 * Chat entre os dois do match: quem lê e escreve (pela função e direto na tabela), filtro e limites no servidor (os testes do
 * pacote, study-social.test.cjs, reescritos em SQL), mensagens que somem em 24 h, bloqueio, denúncia lida só pela equipe,
 * "Abrir sala" sem novo match, exportação e conta excluída. Postgres em memória (PGlite) com todas as migrações, em ordem.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, U, addProfile, makeRoom, openDuplaDb, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const MIGRACAO = "20261003013370_treino_dupla_chat.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8");
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const ABERTO = { aberto: true, planos: ["trial", "pro", "elite"] };
const PADRAO = {
  palavras: ["idiota", "imbecil", "babaca", "otario", "porra", "caralho", "merda", "puta", "puto"],
  max: 600, rajada: 5, janela_s: 30, guarda_denuncia_dias: null,
};
const SEM_MATCH = /Faça um match antes de iniciar a conversa\./;
const PALAVRA = "Essa mensagem contém uma palavra não permitida. Reformule com respeito e mantenha o foco no treino.";
const CONTATO = "Combine o treino por aqui, sem links ou contatos externos.";
const DIVULGACAO = "Este chat é exclusivo para estudo. Não envie divulgação ou convites fora desse objetivo.";
const RAJADA = /Você enviou várias mensagens seguidas\. Aguarde alguns segundos para continuar\./;
const FECHADA = /Esta conversa não aceita novas mensagens\./;

describe("Migração 013370 — chat entre os dois do match", () => {
  let d: DuplaDb;
  let chat = ""; // Ana e Bruno
  const editor = U.fabio;
  const revisor = U.gil;

  const send = (uid: string, text: string, id = chat) => d.rpc(uid, "app_dupla_chat_send", { p_chat_id: id, p_text: text });
  const msgs = (uid: string, id = chat) => d.rpc(uid, "app_dupla_chat_messages", { p_chat_id: id });
  const check = async (text: string) => (await d.sql<{ r: string | null }>(`select public.dupla_chat_check($1) as r`, [text]))[0].r;
  const setChat = (v: unknown) =>
    d.sql(`update public.app_settings set value = $1::jsonb where key = 'treino_dupla_chat'`, [JSON.stringify(v)]);
  const match = async (a: string, b: string) => {
    await d.sql(`insert into public.study_matches (user_a, user_b) values ($1, $2)`, [a, b]);
    const [c] = await d.sql<{ id: string }>(`select id from public.study_chats where user_a = least($1::uuid, $2::uuid) and user_b = greatest($1::uuid, $2::uuid)`, [a, b]);
    return c.id;
  };

  beforeAll(async () => {
    d = await openDuplaDb();
    const nomes: Record<string, string> = { ana: "Ana Souza", bruno: "Bruno Lima", carla: "Carla Dias", diego: "Diego Melo", eva: "Eva Rocha" };
    for (const [k, nome] of Object.entries(nomes)) await addProfile(d.db, (U as any)[k], { public_name: nome });
    for (const uid of Object.values(U)) await setPlan(d.db, uid, "trial", "trialing", daqui(7));
    await d.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [editor]);
    await d.db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [revisor]);
    await setDupla(d.db, ABERTO);
    chat = await match(U.ana, U.bruno);
  }, 120_000);
  beforeEach(async () => {
    await d.sql(`delete from public.study_messages`);
    await d.sql(`delete from public.study_chat_blocks`);
    await d.sql(`delete from public.study_chat_reports`);
    await d.sql(`update public.checklist_rooms set phase = 'closed' where phase <> 'closed'`);
    await setChat(PADRAO);
    await setDupla(d.db, ABERTO);
  });
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ quem lê e escreve (Review Focus 10)
  it("só os dois do match leem e escrevem; terceiro, equipe de fora, revisor e visitante não, pela função e direto na tabela", async () => {
    const enviada = await send(U.ana, "Vamos treinar às 20h?");
    expect(enviada).toMatchObject({ body: "Vamos treinar às 20h?", mine: true, author: "Ana Souza" });
    const doBruno = await msgs(U.bruno);
    expect(doBruno.messages).toEqual([expect.objectContaining({ id: enviada.id, body: "Vamos treinar às 20h?", mine: false, author: "Ana Souza" })]);
    expect(doBruno.max).toBe(600);
    expect(doBruno.chat).toMatchObject({ chat_id: chat, partner: { user_id: U.ana, public_name: "Ana Souza" }, can_send: true, blocked_by_me: false });
    expect((await send(U.bruno, "Combinado!")).mine).toBe(true);

    for (const uid of [U.carla, U.admin, editor, revisor]) {
      await expect(msgs(uid), uid).rejects.toThrow(SEM_MATCH);
      await expect(send(uid, "Oi"), uid).rejects.toThrow(SEM_MATCH);
      await expect(d.rpc(uid, "app_dupla_chat_report", { p_chat_id: chat }), uid).rejects.toThrow(SEM_MATCH);
      await expect(d.rpc(uid, "app_dupla_chat_room", { p_chat_id: chat }), uid).rejects.toThrow(SEM_MATCH);
      expect((await d.rpc(uid, "app_dupla_chats")).chats, uid).toEqual([]);
      // Direto na tabela: nada aparece e nada se grava.
      expect(await d.asUser(uid, `select id from public.study_messages`), uid).toEqual([]);
      expect(await d.asUser(uid, `select id from public.study_chats`), uid).toEqual([]);
      await expect(d.asUser(uid, `insert into public.study_messages (chat_id, sender_id, body) values ($1, $2, 'oi')`, [chat, uid]), uid).rejects.toThrow(/row-level security/);
    }
    for (const fn of ["app_dupla_chats", "app_dupla_chat_messages", "app_dupla_chat_send"]) {
      await expect(d.rpc(null, fn, fn === "app_dupla_chats" ? {} : { p_chat_id: chat, ...(fn.endsWith("send") ? { p_text: "oi" } : {}) }), fn).rejects.toThrow(/permission denied/);
    }
    // Visitante direto na tabela: sem permissão ou sem linhas.
    const visitante = await d.db.transaction(async (tx) => {
      await tx.exec(`set local role anon`);
      try {
        return (await tx.query(`select id from public.study_messages`)).rows;
      } catch {
        return [];
      }
    });
    expect(visitante).toEqual([]);

    // Os dois leem direto, mas também não gravam, nem mudam nem apagam.
    expect((await d.asUser(U.ana, `select body from public.study_messages order by created_at`)).map((r) => r.body)).toEqual(["Vamos treinar às 20h?", "Combinado!"]);
    await expect(d.asUser(U.ana, `insert into public.study_messages (chat_id, sender_id, body) values ($1, $2, 'direto')`, [chat, U.ana])).rejects.toThrow(/row-level security/);
    expect((await d.asUser(U.ana, `update public.study_messages set body = 'mudou'`)).affectedRows).toBe(0);
    expect((await d.asUser(U.bruno, `delete from public.study_messages`)).affectedRows).toBe(0);
    await expect(d.asUser(U.ana, `insert into public.study_chats (user_a, user_b) values ($1, $2)`, [U.carla, U.diego])).rejects.toThrow(/row-level security/);

    // Quem perdeu o acesso ao Treino não lê nem pela tabela.
    await setPlan(d.db, U.bruno, "trial", "trialing", daqui(-1));
    expect(await d.asUser(U.bruno, `select id from public.study_messages`)).toEqual([]);
    await expect(msgs(U.bruno)).rejects.toThrow(/Sem acesso ao Treinamento em Dupla\./);
    await setPlan(d.db, U.bruno, "trial", "trialing", daqui(7));
  });

  it("sem match não há conversa: 'Faça um match antes de iniciar a conversa.'; um par = uma conversa", async () => {
    await expect(d.rpc(U.carla, "app_dupla_chat_open", { p_partner: U.ana })).rejects.toThrow(SEM_MATCH);
    await expect(d.rpc(U.ana, "app_dupla_chat_open", { p_partner: U.ana })).rejects.toThrow(SEM_MATCH);
    await expect(msgs(U.ana, "00000000-0000-4000-8000-000000000999")).rejects.toThrow(SEM_MATCH);
    expect((await d.rpc(U.bruno, "app_dupla_chat_open", { p_partner: U.ana })).chat_id).toBe(chat);
    // O mesmo par deu match de novo: continua uma conversa só.
    // (Desde a 013510 o banco nem aceita o mesmo par duas vezes em study_matches: uma conexão por par.)
    await expect(d.sql(`insert into public.study_matches (user_a, user_b) values ($1, $2)`, [U.bruno, U.ana])).rejects.toThrow(/study_matches_par_uniq/);
    expect(await d.sql(`select count(*)::int as n from public.study_chats where $1 in (user_a, user_b)`, [U.ana])).toEqual([{ n: 1 }]);
    expect((await d.rpc(U.ana, "app_dupla_chat_open", { p_partner: U.bruno })).chat_id).toBe(chat);
    await send(U.ana, "Oi, Bruno");
    const lista = await d.rpc(U.ana, "app_dupla_chats");
    expect(lista.chats).toEqual([expect.objectContaining({ chat_id: chat, partner: { user_id: U.bruno, public_name: "Bruno Lima" }, last: expect.objectContaining({ body: "Oi, Bruno", mine: true }), room_id: null })]);
  });

  // ------------------------------------------------------------------ filtro (study-social.test.cjs)
  it("filtro: acentos, caixa, pontuação no meio e troca por números são pegos; termos clínicos e horários não são bloqueados por trecho de palavra", async () => {
    for (const text of ["IDIOTA!", "Seu imbecíl", "i.d.i.o.t.a", "i d i o t a", "1d10t4", "idi​ota", "babacas", "Que M3RD4", "p.u.t.o"]) {
      expect(await check(text), text).toBe(PALAVRA);
    }
    for (const text of [
      "Vamos treinar às 20h?", "Palpação de fígado e baço.", "Púrpura trombocitopênica idiopática.", "Revisar exame genital e sexualidade.",
      "Estação de amputação: revisar o PEP.", "Computador ligado às 14:30, estação 5.", "Disputa de vaga no Revalida 2026/2.",
    ]) {
      expect(await check(text), text).toBeNull();
    }
  });

  it("bloqueia link, e-mail, telefone, divulgação, vazio e acima de 600", async () => {
    for (const text of ["https://exemplo.com", "www.exemplo.com.br", "meu@email.com", "+55 (11) 99999-9999", "41 99999 8888"]) expect(await check(text), text).toBe(CONTATO);
    for (const text of ["Compre agora", "Renda extra em casa", "Quer namorar?"]) expect(await check(text), text).toBe(DIVULGACAO);
    expect(await check("   ")).toBe("Escreva uma mensagem para combinar o treino.");
    expect(await check("")).toBe("Escreva uma mensagem para combinar o treino.");
    expect(await check("a".repeat(601))).toBe("Use até 600 caracteres por mensagem.");
    expect(await check("a".repeat(600))).toBeNull();
  });

  it("mensagem bloqueada não é gravada; 6ª mensagem em 30 s é recusada", async () => {
    await expect(send(U.ana, "idiota")).rejects.toThrow(PALAVRA);
    await expect(send(U.ana, "me chama em https://exemplo.com")).rejects.toThrow(CONTATO);
    await expect(send(U.ana, "  ")).rejects.toThrow(/Escreva uma mensagem para combinar o treino\./);
    expect(await d.sql(`select count(*)::int as n from public.study_messages`)).toEqual([{ n: 0 }]);
    for (let i = 0; i < 5; i++) expect((await send(U.ana, `Treinar ${i}`)).body).toBe(`Treinar ${i}`);
    await expect(send(U.ana, "Mais uma")).rejects.toThrow(RAJADA);
    // O limite é por pessoa: o parceiro continua enviando.
    expect((await send(U.bruno, "Pode ser!")).mine).toBe(true);
    expect(await d.sql(`select count(*)::int as n from public.study_messages`)).toEqual([{ n: 6 }]);
    // Passados os 30 s, volta a enviar. Espaços nas pontas não são gravados.
    await d.sql(`update public.study_messages set created_at = created_at - interval '31 seconds', expires_at = expires_at - interval '31 seconds'`);
    expect((await send(U.ana, "  De novo  ")).body).toBe("De novo");
  });

  it("lista e limites vêm de app_settings; só administrador edita; a união das chaves vale", async () => {
    expect(await d.sql(`select key from public.app_settings order by key`)).toEqual(
      ["announcement", "creditos", "simulado_ineditas_pct", "treino_dupla", "treino_dupla_chat", "trial_days"].map((key) => ({ key })),
    );
    await expect(d.sql(`insert into public.app_settings (key, value) values ('outra', '1')`)).rejects.toThrow(/check constraint/);

    const salvo = await d.rpc(U.admin, "app_admin_save_dupla_chat", { p_settings: { palavras: ["Tomate", "tomate", "pepino"], max: 10, rajada: 2, janela_s: 60, guarda_denuncia_dias: 30 } });
    expect(salvo).toEqual({ palavras: ["pepino", "tomate"], max: 10, rajada: 2, janela_s: 60, guarda_denuncia_dias: 30 });
    expect((await d.rpc(U.admin, "app_admin_settings")).treino_dupla_chat).toEqual(salvo);
    expect(await check("t0m@te")).toBe(PALAVRA);
    expect(await check("idiota")).toBeNull();
    expect(await check("a".repeat(11))).toBe("Use até 10 caracteres por mensagem.");
    await send(U.ana, "Oi");
    await send(U.ana, "Tudo bem?");
    await expect(send(U.ana, "Treino?")).rejects.toThrow(RAJADA);
    expect(await d.sql(`select action from public.admin_audit_log where action = 'dupla.chat.save'`)).toHaveLength(1);

    for (const uid of [editor, revisor, U.ana]) {
      await expect(d.rpc(uid, "app_admin_save_dupla_chat", { p_settings: PADRAO }), uid).rejects.toThrow(/Acesso restrito a administradores\./);
    }
    for (const errado of [
      { ...PADRAO, max: 0 }, { ...PADRAO, max: 2001 }, { ...PADRAO, max: "600" }, { ...PADRAO, rajada: 0 }, { ...PADRAO, janela_s: 1.5 },
      { ...PADRAO, palavras: "idiota" }, { ...PADRAO, palavras: [""] }, { ...PADRAO, guarda_denuncia_dias: 0 }, { ...PADRAO, guarda_denuncia_dias: "30" },
    ]) {
      await expect(d.rpc(U.admin, "app_admin_save_dupla_chat", { p_settings: errado }), JSON.stringify(errado)).rejects.toThrow();
    }
    // Chave estragada: o chat recusa (falha para o lado seguro).
    await setChat({ palavras: [] });
    await expect(send(U.bruno, "Oi")).rejects.toThrow(/O chat está indisponível no momento\./);
  });

  // ------------------------------------------------------------------ 24 horas
  it("mensagens somem em 24 h: a vencida não é devolvida nem lida direto, mesmo antes da limpeza, e a limpeza a apaga", async () => {
    await d.sql(
      `insert into public.study_messages (chat_id, sender_id, body, created_at, expires_at)
       values ($1, $2, 'Mensagem de ontem', now() - interval '25 hours', now() - interval '1 hour')`,
      [chat, U.ana],
    );
    const [nova] = await d.sql<{ expires_at: string; created_at: string }>(
      `insert into public.study_messages (chat_id, sender_id, body) values ($1, $2, 'Mensagem de hoje') returning created_at, expires_at`,
      [chat, U.bruno],
    );
    expect(Date.parse(nova.expires_at) - Date.parse(nova.created_at)).toBe(24 * 3600 * 1000);
    await expect(d.sql(`insert into public.study_messages (chat_id, sender_id, body, expires_at) values ($1, $2, 'Para sempre', now() + interval '2 days')`, [chat, U.ana])).rejects.toThrow(/check constraint/);
    // Antes da limpeza: a tabela ainda tem as duas, mas ninguém lê a vencida.
    expect(await d.sql(`select count(*)::int as n from public.study_messages`)).toEqual([{ n: 2 }]);
    expect((await d.asUser(U.ana, `select body from public.study_messages`)).map((r) => r.body)).toEqual(["Mensagem de hoje"]);
    expect((await msgs(U.ana)).messages.map((m: any) => m.body)).toEqual(["Mensagem de hoje"]);
    // A chamada do chat limpou.
    expect((await d.sql<{ body: string }>(`select body from public.study_messages`)).map((r) => r.body)).toEqual(["Mensagem de hoje"]);
  });

  // ------------------------------------------------------------------ bloqueio
  it("bloquear: ninguém envia nem abre sala pela conversa; quem foi bloqueado não fica sabendo; desbloquear volta ao normal", async () => {
    const b = await d.rpc(U.ana, "app_dupla_chat_block", { p_chat_id: chat, p_block: true });
    expect(b).toMatchObject({ blocked_by_me: true, can_send: false });
    await expect(send(U.ana, "Oi")).rejects.toThrow(/Você bloqueou esta pessoa\. Desbloqueie para enviar mensagens\./);
    await expect(send(U.bruno, "Oi")).rejects.toThrow(FECHADA);
    expect((await msgs(U.bruno)).chat).toMatchObject({ blocked_by_me: false, can_send: false });
    for (const uid of [U.ana, U.bruno]) await expect(d.rpc(uid, "app_dupla_chat_room", { p_chat_id: chat }), uid).rejects.toThrow(/Não é possível abrir a sala por esta conversa\./);
    expect(await d.asUser(U.bruno, `select * from public.study_chat_blocks`)).toEqual([]);
    expect(await d.asUser(U.ana, `select blocked_id from public.study_chat_blocks`)).toEqual([{ blocked_id: U.bruno }]);
    await expect(d.asUser(U.bruno, `insert into public.study_chat_blocks (blocker_id, blocked_id) values ($1, $2)`, [U.bruno, U.ana])).rejects.toThrow(/row-level security/);
    expect(await d.rpc(U.ana, "app_dupla_chat_block", { p_chat_id: chat, p_block: false })).toMatchObject({ blocked_by_me: false, can_send: true });
    expect((await send(U.bruno, "Oi de novo")).body).toBe("Oi de novo");
  });

  // ------------------------------------------------------------------ denúncia
  it("denúncia guarda a cópia; a equipe lê só pela denúncia (com registro); aluno e revisor não leem; encerrar e guarda", async () => {
    await send(U.ana, "Vamos treinar?");
    await send(U.bruno, "Agora não");
    const r = await d.rpc(U.bruno, "app_dupla_chat_report", { p_chat_id: chat, p_reason: "  Fui desrespeitado  " });
    expect(r.messages).toBe(2);
    await expect(d.rpc(U.bruno, "app_dupla_chat_report", { p_chat_id: chat })).rejects.toThrow(/Você já denunciou esta conversa\. A equipe vai analisar\./);
    await expect(d.rpc(U.ana, "app_dupla_chat_report", { p_chat_id: chat, p_reason: "x".repeat(501) })).rejects.toThrow(/até 500 caracteres/);

    const lista = await d.rpc(U.admin, "app_admin_dupla_chat_reports", {});
    expect(lista.open).toBe(1);
    expect(lista.items).toEqual([expect.objectContaining({ id: r.report_id, status: "aberta", reporter_name: "Bruno Lima", reported_name: "Ana Souza", reason: "Fui desrespeitado", message_count: 2 })]);
    expect(JSON.stringify(lista)).not.toContain("Vamos treinar?");
    const lida = await d.rpc(editor, "app_admin_dupla_chat_report", { p_id: r.report_id });
    expect(lida.messages).toEqual([
      expect.objectContaining({ autor: "denunciado", nome: "Ana Souza", texto: "Vamos treinar?" }),
      expect.objectContaining({ autor: "denunciante", nome: "Bruno Lima", texto: "Agora não" }),
    ]);
    expect(await d.sql(`select actor_id, target from public.admin_audit_log where action = 'dupla.chat.denuncia.ler'`)).toEqual([{ actor_id: editor, target: r.report_id }]);
    // A cópia fica mesmo depois de a conversa sumir; a equipe segue sem ler a conversa em si.
    await d.sql(`delete from public.study_messages`);
    expect((await d.rpc(U.admin, "app_admin_dupla_chat_report", { p_id: r.report_id })).messages).toHaveLength(2);
    await expect(msgs(U.admin)).rejects.toThrow(SEM_MATCH);
    for (const uid of [U.ana, U.bruno, revisor]) {
      await expect(d.rpc(uid, "app_admin_dupla_chat_reports", {}), uid).rejects.toThrow(/Acesso restrito à equipe\./);
      await expect(d.rpc(uid, "app_admin_dupla_chat_report", { p_id: r.report_id }), uid).rejects.toThrow(/Acesso restrito à equipe\./);
    }
    for (const uid of [U.admin, editor, U.bruno, U.ana]) expect(await d.asUser(uid, `select id from public.study_chat_reports`), uid).toEqual([]);

    expect(await d.rpc(U.admin, "app_admin_dupla_chat_report_close", { p_id: r.report_id, p_note: "Conversa conferida" })).toEqual({ id: r.report_id, status: "encerrada" });
    await expect(d.rpc(U.admin, "app_admin_dupla_chat_report_close", { p_id: r.report_id })).rejects.toThrow(/já encerrada/);
    expect((await d.rpc(U.admin, "app_admin_dupla_chat_reports", { p_status: "encerrada" })).items).toHaveLength(1);
    expect((await d.rpc(U.admin, "app_admin_dupla_chat_reports", {})).open).toBe(0);
    // Encerrada, a pessoa pode denunciar de novo.
    const outra = await d.rpc(U.bruno, "app_dupla_chat_report", { p_chat_id: chat });
    expect(outra.messages).toBe(0);

    // Guarda: sem prazo, nada se apaga; com prazo, só as encerradas há mais que ele.
    await d.sql(`update public.study_chat_reports set closed_at = now() - interval '40 days' where id = $1`, [r.report_id]);
    await d.rpc(U.admin, "app_admin_dupla_chat_reports", {});
    expect(await d.sql(`select count(*)::int as n from public.study_chat_reports`)).toEqual([{ n: 2 }]);
    await setChat({ ...PADRAO, guarda_denuncia_dias: 30 });
    await d.rpc(U.admin, "app_admin_dupla_chat_reports", {});
    expect(await d.sql(`select id from public.study_chat_reports`)).toEqual([{ id: outra.report_id }]);
  });

  // ------------------------------------------------------------------ "Abrir sala"
  it("'Abrir sala' no chat: abre a sala do par sem novo match; o outro entra na mesma sala e o convite vira aceito", async () => {
    const matchesAntes = await d.sql(`select count(*)::int as n from public.study_matches`);
    const { room_id } = await d.rpc(U.ana, "app_dupla_chat_room", { p_chat_id: chat });
    expect(room_id).toBeTruthy();
    expect(await d.sql(`select count(*)::int as n from public.study_matches`)).toEqual(matchesAntes);
    expect(await d.sql(`select phase, station_id, member_ids from public.checklist_rooms where id = $1`, [room_id])).toEqual([{ phase: "roles", station_id: null, member_ids: [U.ana, U.bruno] }]);
    expect(await d.sql(`select from_user, to_user, status from public.study_invites where room_id = $1`, [room_id])).toEqual([{ from_user: U.ana, to_user: U.bruno, status: "pending" }]);
    expect((await d.rpc(U.ana, "app_dupla_chat_room", { p_chat_id: chat })).room_id).toBe(room_id);
    expect((await d.rpc(U.bruno, "app_dupla_chat_room", { p_chat_id: chat })).room_id).toBe(room_id);
    expect(await d.sql(`select status from public.study_invites where room_id = $1`, [room_id])).toEqual([{ status: "accepted" }]);
    expect((await msgs(U.bruno)).chat.room_id).toBe(room_id);

    // Com outra sala aberta, não abre uma segunda.
    await d.sql(`update public.checklist_rooms set phase = 'closed' where id = $1`, [room_id]);
    const outra = await makeRoom(d.db, { members: [U.ana, U.carla], phase: "roles", station: null });
    await expect(d.rpc(U.ana, "app_dupla_chat_room", { p_chat_id: chat })).rejects.toThrow(/Você já está em uma sala aberta\./);
    await expect(d.rpc(U.bruno, "app_dupla_chat_room", { p_chat_id: chat })).rejects.toThrow(/Não foi possível abrir a sala agora\./);
    await d.sql(`update public.checklist_rooms set phase = 'closed' where id = $1`, [outra]);
  });

  // ------------------------------------------------------------------ conta
  it("exportação de dados traz as minhas mensagens; excluir a conta deixa as do parceiro como 'Conta excluída'", async () => {
    const de = await match(U.diego, U.eva);
    await send(U.diego, "Oi, Eva", de);
    await send(U.eva, "Oi, Diego", de);
    await d.rpc(U.eva, "app_dupla_chat_block", { p_chat_id: de, p_block: true });
    await d.rpc(U.eva, "app_dupla_chat_report", { p_chat_id: de, p_reason: "Teste" });
    const exp = await d.rpc(U.eva, "app_export_my_data");
    expect(exp.study_chat.messages.map((m: any) => m.body)).toEqual(["Oi, Diego"]);
    expect(exp.study_chat.blocks).toEqual([expect.objectContaining({ blocked_id: U.diego })]);
    expect(exp.study_chat.reports).toEqual([expect.objectContaining({ reason: "Teste", status: "aberta" })]);
    expect(JSON.stringify(exp.study_chat)).not.toContain("Oi, Eva");
    expect(exp).toHaveProperty("declarations");
    expect(await d.rpc(null, "dupla_export_chat")).toBeNull();

    await d.rpc(U.eva, "app_delete_my_account", { p_confirm: "EXCLUIR" });
    const visto = await msgs(U.diego, de);
    expect(visto.messages.map((m: any) => [m.body, m.author, m.mine])).toEqual([["Oi, Eva", "Diego Melo", true], ["Oi, Diego", "Conta excluída", false]]);
    expect(visto.chat).toMatchObject({ partner: { user_id: null, public_name: "Conta excluída" }, can_send: false });
    await expect(send(U.diego, "Ainda aí?", de)).rejects.toThrow(FECHADA);
    expect(await d.sql(`select reporter_id, reporter_name from public.study_chat_reports where chat_id = $1`, [de])).toEqual([{ reporter_id: null, reporter_name: "Eva Rocha" }]);
  });

  // ------------------------------------------------------------------ colagem
  it("colar duas vezes dá o mesmo banco; permissões iguais às das outras app_dupla_*", async () => {
    const retrato = async () => ({
      funcoes: await d.sql(`select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`),
      politicas: await d.sql(`select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' order by 1, 2`),
      regras: await d.sql(`select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as def from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
      indices: await d.sql(`select indexname, indexdef from pg_indexes where schemaname = 'public' order by 1`),
      gatilhos: await d.sql(`select tgname from pg_trigger where not tgisinternal order by 1`),
      dados: await d.sql(`select key, value from public.app_settings order by key`),
      conversas: await d.sql(`select id, user_a, user_b from public.study_chats order by id`),
    });
    const antes = await retrato();
    // A lista de chaves desta migração não tem 'creditos' (013490): a linha sai antes e a 013490, colada em seguida, a devolve.
    await d.sql(`delete from public.app_settings where key = 'creditos'`);
    await d.db.exec(SQL);
    // A 013406 refaz app_export_my_data (base: esta): colada de novo, a cadeia segue na ordem, depois desta (a dos créditos devolve a linha 'creditos').
    for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.includes("treino_dupla") && x > MIGRACAO).sort()) {
      await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    }
    expect(await retrato()).toEqual(antes);

    const acl = Object.fromEntries((antes.funcoes as any[]).map((f) => [f.id, f.acl]));
    for (const f of [
      "app_dupla_chats()", "app_dupla_chat_open(uuid)", "app_dupla_chat_messages(uuid,timestamp with time zone)", "app_dupla_chat_send(uuid,text)",
      "app_dupla_chat_block(uuid,boolean)", "app_dupla_chat_report(uuid,text)", "app_dupla_chat_room(uuid)",
    ]) expect(acl[f], f).toBe(acl["app_dupla_room(uuid,integer)"]);
    for (const f of [
      "dupla_chat_normalize(text)", "dupla_chat_settings()", "dupla_chat_check(text)", "dupla_chat_sweep()", "dupla_chat_get(uuid,uuid)",
      "dupla_chat_summary(study_chats,uuid)", "dupla_chat_message(study_messages,uuid)",
    ]) {
      expect(acl[f], f).not.toContain("authenticated");
      expect(acl[f], f).not.toContain("anon");
    }
    await expect(d.asUser(U.ana, `select public.dupla_chat_check('oi')`)).rejects.toThrow(/permission denied/);
  });
});
