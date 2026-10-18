// @vitest-environment node
/**
 * E-mails do Contrato 3.0 (ramo termo-funcoes):
 *   - server/email/smtp.ts contra um servidor SMTP FALSO local (sem rede): login, mensagem com acento, anexo, senha recusada sem vazar,
 *     queda depois de mandar a mensagem = "talvez entregue" (não repete), desligado sem as variáveis;
 *   - server/legal/emails.ts: aviso de conta inativa, no visual dos modelos com a logo nova. NÃO existe e-mail com a cópia do
 *     contrato (decisão do dono, 18/10/2026: o contrato fica só em Minha Conta → Documentos);
 *   - server/legal/router.ts: fila (enviado / nova tentativa / incerto / cancelado), desligado sem SMTP, tarefa só com CRON_SECRET.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import net from "node:net";
import http from "node:http";
import express from "express";
import { buildMessage, createSmtpMailer, smtpConfigFromEnv, SmtpError, type Mailer, type MailMessage } from "../../server/email/smtp";
import * as emailsLegais from "../../server/legal/emails";
import { LOGO, renderAvisoInatividade, renderItem, type ItemFila } from "../../server/legal/emails";
import { createLegalRouter, enviarFila, rotinaDiaria } from "../../server/legal/router";
import type { ContentDb } from "../../server/contentHub/infra";

const SENHA = "abcd efgh ijkl mnop";
type Sessao = { linhas: string[]; data: string };
const sessoes: Sessao[] = [];
/** como o servidor falso responde ao fim da mensagem: ok, recusa (554) ou cai sem responder */
let fimDaMensagem: "ok" | "recusa" | "cai" = "ok";
let port = 0;
let server: net.Server;

beforeAll(async () => {
  server = net.createServer((sock) => {
    const s: Sessao = { linhas: [], data: "" };
    sessoes.push(s);
    let buf = "";
    let emData = false;
    let passo = "";
    sock.write("220 falso ESMTP\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let i;
      while ((i = buf.indexOf("\r\n")) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (emData) {
          if (line === ".") {
            emData = false;
            if (fimDaMensagem === "cai") sock.destroy();
            else sock.write(fimDaMensagem === "ok" ? "250 2.0.0 OK\r\n" : "554 5.7.1 Message rejected\r\n");
          } else s.data += `${line}\r\n`;
          continue;
        }
        s.linhas.push(line);
        if (passo === "user") {
          passo = "pass";
          sock.write("334 UGFzc3dvcmQ6\r\n");
        } else if (passo === "pass") {
          passo = "";
          const ok = Buffer.from(line, "base64").toString() === SENHA.replace(/\s+/g, "");
          sock.write(ok ? "235 2.7.0 Accepted\r\n" : "535 5.7.8 Username and Password not accepted\r\n");
        } else if (/^EHLO/.test(line)) sock.write("250-falso\r\n250-AUTH LOGIN PLAIN\r\n250 8BITMIME\r\n");
        else if (line === "AUTH LOGIN") {
          passo = "user";
          sock.write("334 VXNlcm5hbWU6\r\n");
        } else if (/^MAIL FROM/.test(line) || /^RCPT TO/.test(line)) sock.write("250 OK\r\n");
        else if (line === "DATA") {
          emData = true;
          sock.write("354 Go ahead\r\n");
        } else if (line === "QUIT") {
          sock.write("221 bye\r\n");
          sock.end();
        }
      }
    });
    sock.on("error", () => undefined);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as net.AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
afterEach(() => {
  fimDaMensagem = "ok";
});

const cfg = (password = SENHA) => ({
  host: "127.0.0.1", port, user: "nao-responda@staziamed.com.br", password: password.replace(/\s+/g, ""),
  from: "nao-responda@staziamed.com.br", fromName: "StaziaMed", security: "none" as const, timeoutMs: 3000,
});
/** partes base64 da mensagem, decodificadas, na ordem */
const partes = (data: string) =>
  [...data.matchAll(/Content-Transfer-Encoding: base64\r\n(?:Content-Disposition:[^\r]*\r\n)?\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)].map((x) =>
    Buffer.from(x[1].replace(/\r\n/g, ""), "base64").toString("utf8"),
  );

describe("SMTP (server/email/smtp.ts)", () => {
  it("entra, manda texto, HTML e anexo com acento, e sai", async () => {
    await createSmtpMailer(cfg()).send({
      to: "aluno@teste.dev", subject: "Sua conta StaziaMed será apagada", text: "Olá!\n.linha com ponto", html: "<p>Olá!</p>",
      attachments: [{ filename: "anexo-teste.txt", content: "Anotação com acento", contentType: "text/plain; charset=UTF-8" }],
    });
    const s = sessoes.at(-1)!;
    expect(s.linhas).toEqual(expect.arrayContaining(["AUTH LOGIN", "MAIL FROM:<nao-responda@staziamed.com.br>", "RCPT TO:<aluno@teste.dev>"]));
    expect(s.data).toMatch(/^From: StaziaMed <nao-responda@staziamed\.com\.br>/m);
    expect(s.data).toMatch(/^Subject: =\?UTF-8\?B\?/m);
    expect(s.data).toMatch(/multipart\/mixed/);
    expect(s.data).toMatch(/Content-Disposition: attachment; filename="anexo-teste\.txt"/);
    expect(partes(s.data)).toEqual(["Olá!\n.linha com ponto", "<p>Olá!</p>", "Anotação com acento"]);
  });

  it("senha recusada: erro com o código, sem a senha; não conta como entregue", async () => {
    const err = await createSmtpMailer(cfg("senha errada")).send({ to: "aluno@teste.dev", subject: "x", text: "x", html: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(SmtpError);
    expect(err.code).toBe(535);
    expect(err.talvezEntregue).toBe(false);
    expect(String(err.message)).not.toContain(SENHA.replace(/\s+/g, ""));
  });

  it("mensagem recusada pelo servidor: não entregue (pode tentar de novo); queda depois de mandar: talvez entregue (não repete)", async () => {
    fimDaMensagem = "recusa";
    const recusa = await createSmtpMailer(cfg()).send({ to: "aluno@teste.dev", subject: "x", text: "x", html: "x" }).catch((e) => e);
    expect(recusa).toMatchObject({ code: 554, talvezEntregue: false });
    fimDaMensagem = "cai";
    const cai = await createSmtpMailer(cfg()).send({ to: "aluno@teste.dev", subject: "x", text: "x", html: "x" }).catch((e) => e);
    expect(cai).toBeInstanceOf(SmtpError);
    expect(cai.talvezEntregue).toBe(true);
  });

  it("destinatário inválido não conecta; sem TLS só em 127.0.0.1; sem as variáveis, desligado", async () => {
    const antes = sessoes.length;
    await expect(createSmtpMailer(cfg()).send({ to: "a@b", subject: "x", text: "x", html: "x" })).rejects.toThrow(/Destinatário/);
    expect(sessoes.length).toBe(antes);
    expect(() => createSmtpMailer({ ...cfg(), host: "smtp.gmail.com" })).toThrow(/127\.0\.0\.1/);
    expect(smtpConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(smtpConfigFromEnv({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@b.com", SMTP_PASSWORD: "x" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    const c = smtpConfigFromEnv({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@b.com", SMTP_PASSWORD: "ab cd", SMTP_FROM: "nao-responda@staziamed.com.br" } as unknown as NodeJS.ProcessEnv)!;
    expect(c).toMatchObject({ port: 465, security: "implicit", password: "abcd", fromName: "StaziaMed" });
    expect(smtpConfigFromEnv({ SMTP_HOST: "h", SMTP_PORT: "587", SMTP_USER: "a@b.com", SMTP_PASSWORD: "x", SMTP_FROM: "a@b.com" } as unknown as NodeJS.ProcessEnv)!.security).toBe("starttls");
  });

  it("linha que começa com ponto é dobrada; nome de arquivo sem quebra de linha", () => {
    const raw = buildMessage({ from: "a@b.com", fromName: "Á" }, { to: "c@d.com", subject: "s", text: ".t", html: "h", attachments: [{ filename: 'a"\r\nb.txt', content: "x", contentType: "text/plain" }] });
    expect(raw.split("\r\n").some((l) => /^\.[^.]/.test(l))).toBe(false);
    expect(raw).toContain('filename="a___b.txt"');
  });
});

const item = (extra: Partial<ItemFila> = {}): ItemFila => ({
  id: 7, kind: "aviso_inatividade", tentativas: 1, email: "aluno@teste.dev", nome: "Maria Souza",
  payload: { acao: "apagar_conta", ultimo_acesso: "2025-11-01T15:00:00Z", prazo: "2026-11-20" },
  ...extra,
});

describe("Sem cópia do contrato por e-mail (decisão do dono, 18/10/2026)", () => {
  it("o módulo de e-mails não tem mais o modelo da cópia do contrato", () => {
    const nomes = Object.keys(emailsLegais);
    expect(nomes).not.toContain("renderCopiaContrato");
    expect(nomes).not.toContain("arquivoDoContrato");
    expect(nomes).not.toContain("textoDaCopia");
  });

  it("nenhum e-mail da fila fala em cópia do contrato nem leva anexo", () => {
    for (const acao of ["apagar_conta", "zerar_coins"] as const) {
      const e = renderItem(item({ payload: { ...item().payload, acao } }), null) as emailsLegais.EmailPronto & { attachments?: unknown };
      expect(`${e.subject}\n${e.text}\n${e.html}`).not.toMatch(/c[óo]pia do contrato/i);
      expect(e.attachments).toBeUndefined();
    }
  });
});

describe("Aviso de conta inativa", () => {
  const aviso = (acao: "apagar_conta" | "zerar_coins") =>
    renderAvisoInatividade({ ...item(), payload: { acao, ultimo_acesso: "2025-11-01T15:00:00Z", prazo: "2026-11-20" } }, null);

  it("conta gratuita: diz desde quando, a regra da Política, a data e como manter", () => {
    const e = aviso("apagar_conta");
    expect(e.subject).toBe("Sua conta StaziaMed será apagada por falta de acesso");
    expect(e.text).toContain("sem acesso desde 01/11/2025");
    expect(e.text).toContain("Se você não entrar no app até 20/11/2026, a sua conta e os seus dados de estudo serão apagados");
    expect(e.text).toContain("Se quiser uma cópia dos seus dados antes, peça pelo e-mail privacidade@staziamed.com.br.");
    expect(e.text).not.toContain("Baixar meus dados");
    expect(e.html).toContain("https://app.staziamed.com.br/novo/login");
    expect(e.html).toContain(LOGO);
    expect(e.html).toContain("background-color:#0B6F68");
    expect(e.html).toContain("Equipe StaziaMed<br>Tecnologia que transforma.");
  });

  it("nome com código HTML é escapado; sem nome, só 'Olá!'", () => {
    expect(renderAvisoInatividade(item({ nome: "<b>Zé</b>" }), null).html).toContain("Olá, &lt;b&gt;Zé&lt;/b&gt;!");
    expect(renderAvisoInatividade(item({ nome: null }), null).text).toMatch(/^Olá!\n/);
  });

  it("quem já pagou: só os Coins, com o item 4.3 do Regulamento", () => {
    const e = aviso("zerar_coins");
    expect(e.subject).toBe("Seus Stazia Coins serão zerados por falta de acesso");
    expect(e.text).toContain("Regulamento de Coins e Ligas (item 4.3)");
    expect(e.text).toContain("A sua conta e o seu progresso continuam.");
  });

  it("sem prazo, recusa (nunca manda aviso sem data)", () => {
    expect(() => renderAvisoInatividade({ ...item(), payload: { acao: "apagar_conta", ultimo_acesso: "2025-11-01" } }, null)).toThrow();
  });
});

/** banco falso: guarda a fila em memória e o que foi marcado */
function bancoFalso(lotes: ItemFila[][]) {
  const marcados: { p_id: number; p_resultado: string; p_erro: string | null }[] = [];
  const chamadas: string[] = [];
  const db = {
    mode: "dev",
    async service(fn: string, args: any = {}) {
      chamadas.push(fn);
      if (fn === "ch_worker_email_pegar") return lotes.shift() ?? [];
      if (fn === "ch_worker_email_marcar") return marcados.push(args), args.p_resultado;
      if (fn === "ch_worker_contas_inativas") return { modo: "ensaio", para_avisar: 2, contas: [{ conta: "x" }] };
      if (fn === "ch_worker_expurgo_aceites") throw new Error("falhou de propósito");
      throw new Error(fn);
    },
    async asUser() {
      throw new Error("não usado");
    },
    async authenticate() {
      return null;
    },
  } as unknown as ContentDb;
  return { db, marcados, chamadas };
}
const carteiro = (comportamento: (m: MailMessage) => void): Mailer & { enviados: MailMessage[] } => {
  const enviados: MailMessage[] = [];
  return { from: "nao-responda@staziamed.com.br", enviados, async send(m) {
    comportamento(m);
    enviados.push(m);
  } };
};

describe("Fila de e-mail (server/legal/router.ts)", () => {
  it("sem SMTP: desligado, não pega nada da fila", async () => {
    const { db, chamadas } = bancoFalso([[item()]]);
    expect(await enviarFila({ db, mailer: null, baseUrl: null })).toMatchObject({ desligado: true, enviados: 0 });
    expect(chamadas).toEqual([]);
  });

  it("enviado, nova tentativa (falha antes), incerto (caiu depois) e cancelado (sem e-mail)", async () => {
    const lote = [item({ id: 1 }), item({ id: 2, email: "falha@teste.dev" }), item({ id: 3, email: "cai@teste.dev" }), item({ id: 4, email: null })];
    const { db, marcados } = bancoFalso([lote]);
    const mailer = carteiro((m) => {
      if (m.to === "falha@teste.dev") throw new SmtpError("Servidor de e-mail recusou a senha (código 535).", 535);
      if (m.to === "cai@teste.dev") {
        const e = new SmtpError("O servidor de e-mail fechou a conexão.");
        e.talvezEntregue = true;
        throw e;
      }
    });
    const logs: string[] = [];
    const r = await enviarFila({ db, mailer, baseUrl: null, log: (m) => logs.push(m) });
    expect(r).toEqual({ enviados: 1, novas_tentativas: 1, incertos: 1, cancelados: 1 });
    expect(marcados.map((m) => [m.p_id, m.p_resultado])).toEqual([[1, "enviado"], [2, "tentar_de_novo"], [3, "incerto"], [4, "cancelado"]]);
    expect(mailer.enviados[0].subject).toBe("Sua conta StaziaMed será apagada por falta de acesso");
    expect(mailer.enviados[0].attachments).toBeUndefined();
    // o registro não leva o endereço de ninguém
    expect(logs.join("\n")).not.toMatch(/@teste\.dev/);
  });

  it("rotina diária: uma falha não impede a outra", async () => {
    const { db } = bancoFalso([]);
    const r = await rotinaDiaria({ db, mailer: null, baseUrl: null });
    expect(r.contas_inativas).toMatchObject({ modo: "ensaio", para_avisar: 2 });
    expect(r.expurgo_aceites).toEqual({ erro: "falhou de propósito" });
  });

  it("as tarefas só abrem com CRON_SECRET", async () => {
    const { db } = bancoFalso([]);
    const app = express();
    app.use("/api/legal", createLegalRouter({ db, mailer: null, baseUrl: null }));
    const srv = await new Promise<http.Server>((r) => {
      const s = app.listen(0, "127.0.0.1", () => r(s));
    });
    const url = `http://127.0.0.1:${(srv.address() as net.AddressInfo).port}/api/legal`;
    const antigo = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      expect((await fetch(`${url}/email`, { headers: { authorization: "Bearer " } })).status).toBe(401);
      process.env.CRON_SECRET = "segredo-de-teste";
      expect((await fetch(`${url}/email`)).status).toBe(401);
      expect((await fetch(`${url}/diaria`, { headers: { authorization: "Bearer errado" } })).status).toBe(401);
      const ok = await fetch(`${url}/email`, { headers: { authorization: "Bearer segredo-de-teste" } });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ desligado: true });
      const d = await fetch(`${url}/diaria`, { headers: { authorization: "Bearer segredo-de-teste" } });
      expect((await d.json()).contas_inativas.modo).toBe("ensaio");
    } finally {
      if (antigo === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = antigo;
      await new Promise((r) => srv.close(() => r(null)));
    }
  });
});
