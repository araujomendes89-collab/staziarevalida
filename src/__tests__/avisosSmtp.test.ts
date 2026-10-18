// @vitest-environment node
/**
 * Envio de e-mail dos avisos (server/avisos/smtp.ts) contra um servidor SMTP FALSO local (sem rede, sem TLS): login, remetente,
 * destinatário, mensagem com acento, recusa da senha sem vazar a senha, e a configuração desligada sem as variáveis.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import net from "node:net";
import { buildMessage, createSmtpMailer, smtpConfigFromEnv, SmtpError } from "../../server/avisos/smtp";

const SENHA = "abcd efgh ijkl mnop";
let port = 0;
const sessoes: { linhas: string[]; data: string }[] = [];
let server: net.Server;

beforeAll(async () => {
  server = net.createServer((sock) => {
    const s = { linhas: [] as string[], data: "" };
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
            sock.write("250 2.0.0 OK\r\n");
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
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as net.AddressInfo).port;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const cfg = (password = SENHA) => ({ host: "127.0.0.1", port, user: "nao-responda@staziamed.com.br", password: password.replace(/\s+/g, ""), from: "nao-responda@staziamed.com.br", fromName: "StaziaMed", security: "none" as const, timeoutMs: 5000 });

describe("SMTP dos avisos", () => {
  it("entra, manda a mensagem com acento (texto e HTML) e sai", async () => {
    const m = createSmtpMailer(cfg());
    await m.send({ to: "aluno@teste.dev", subject: "Seu PRO renova em 3 dias · StaziaMed", text: "Olá!\n.linha com ponto", html: "<p>Olá!</p>" });
    const s = sessoes.at(-1)!;
    expect(s.linhas).toContain("AUTH LOGIN");
    expect(s.linhas).toContain("MAIL FROM:<nao-responda@staziamed.com.br>");
    expect(s.linhas).toContain("RCPT TO:<aluno@teste.dev>");
    expect(s.data).toMatch(/^From: StaziaMed <nao-responda@staziamed\.com\.br>/m);
    expect(s.data).toMatch(/^Subject: =\?UTF-8\?B\?/m);
    const corpos = [...s.data.matchAll(/base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)].map((x) => Buffer.from(x[1].replace(/\r\n/g, ""), "base64").toString("utf8"));
    expect(corpos[0]).toBe("Olá!\n.linha com ponto");
    expect(corpos[1]).toBe("<p>Olá!</p>");
  });

  it("senha recusada: erro com o código, sem a senha na mensagem", async () => {
    const m = createSmtpMailer(cfg("senha errada"));
    const err = await m.send({ to: "aluno@teste.dev", subject: "x", text: "x", html: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(SmtpError);
    expect(err.code).toBe(535);
    expect(String(err.message)).not.toContain(SENHA.replace(/\s+/g, ""));
  });

  it("destinatário inválido não chega a conectar", async () => {
    const antes = sessoes.length;
    await expect(createSmtpMailer(cfg()).send({ to: "a@b", subject: "x", text: "x", html: "x" })).rejects.toThrow(/Destinatário/);
    expect(sessoes.length).toBe(antes);
  });

  it("sem TLS só em 127.0.0.1; sem as variáveis o e-mail fica desligado; porta 465 = TLS desde o início", () => {
    expect(() => createSmtpMailer({ ...cfg(), host: "smtp.gmail.com" })).toThrow(/127\.0\.0\.1/);
    expect(smtpConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(smtpConfigFromEnv({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@b.com", SMTP_PASSWORD: "x" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    const c = smtpConfigFromEnv({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@b.com", SMTP_PASSWORD: "ab cd", SMTP_FROM: "nao-responda@staziamed.com.br" } as unknown as NodeJS.ProcessEnv)!;
    expect(c).toMatchObject({ port: 465, security: "implicit", password: "abcd", fromName: "StaziaMed" });
    expect(smtpConfigFromEnv({ SMTP_HOST: "h", SMTP_PORT: "587", SMTP_USER: "a@b.com", SMTP_PASSWORD: "x", SMTP_FROM: "a@b.com" } as unknown as NodeJS.ProcessEnv)!.security).toBe("starttls");
  });

  it("linha da mensagem que começa com ponto é dobrada (regra do SMTP)", () => {
    const raw = buildMessage({ from: "a@b.com", fromName: "Á" }, { to: "c@d.com", subject: "s", text: "t", html: "h" });
    expect(raw).toMatch(/^From: =\?UTF-8\?B\?/);
    expect(raw.split("\r\n").some((l) => /^\.[^.]/.test(l))).toBe(false);
  });
});
