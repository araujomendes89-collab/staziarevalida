/**
 * Envio de e-mail por SMTP, sem biblioteca nova (o projeto não tem nodemailer e a instalação na Vercel é `npm ci`).
 * Feito para o Google Workspace (smtp.gmail.com, porta 465 com TLS desde o início, ou 587 com STARTTLS) e senha de app.
 *
 * Variáveis (só no servidor; NUNCA no código nem no navegador):
 *   SMTP_HOST, SMTP_PORT (465 ou 587), SMTP_USER (conta que envia), SMTP_PASSWORD (senha de app), SMTP_FROM (remetente),
 *   SMTP_FROM_NAME (nome que aparece; padrão "StaziaMed"). Sem HOST, USER, PASSWORD e FROM: e-mail desligado (null).
 * A senha nunca vai para o registro (log): os erros guardam só o código da resposta do servidor de e-mail.
 */
import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  fromName: string;
  /** implicit = TLS desde o início (465); starttls = sobe para TLS (587); none = só para testes em 127.0.0.1. */
  security: "implicit" | "starttls" | "none";
  timeoutMs?: number;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type Mailer = { send(msg: MailMessage): Promise<void>; from: string };

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

/** Configuração a partir das variáveis do servidor (null = e-mail desligado). */
export function smtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = (env.SMTP_HOST ?? "").trim();
  const user = (env.SMTP_USER ?? "").trim();
  const password = (env.SMTP_PASSWORD ?? "").replace(/\s+/g, ""); // a senha de app do Google pode vir com espaços
  const from = (env.SMTP_FROM ?? "").trim();
  if (!host || !user || !password || !EMAIL.test(from)) return null;
  const port = Number(env.SMTP_PORT ?? 465) || 465;
  return { host, port, user, password, from, fromName: (env.SMTP_FROM_NAME ?? "StaziaMed").trim() || "StaziaMed", security: port === 465 ? "implicit" : "starttls" };
}

/** Assunto/nome com acento: codificação MIME (RFC 2047). */
const mimeWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const b64Lines = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n");

/** A mensagem completa (cabeçalhos + texto e HTML), com as linhas que começam com ponto dobradas (regra do SMTP). */
export function buildMessage(cfg: Pick<SmtpConfig, "from" | "fromName">, msg: MailMessage, now = new Date()): string {
  const boundary = `smd-${crypto.randomBytes(12).toString("hex")}`;
  const domain = cfg.from.split("@")[1] ?? "staziamed.com.br";
  const lines = [
    `From: ${mimeWord(cfg.fromName)} <${cfg.from}>`,
    `To: <${msg.to}>`,
    `Subject: ${mimeWord(msg.subject)}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Auto-Submitted: auto-generated",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(msg.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(msg.html),
    `--${boundary}--`,
    "",
  ];
  return lines.join("\r\n").replace(/\r\n\./g, "\r\n..");
}

/** Lê respostas do servidor (linhas "250-..." continuam; "250 ..." encerra). */
function reader(socket: net.Socket) {
  let buf = "";
  let waiting: { resolve: (v: { code: number; text: string }) => void; reject: (e: Error) => void } | null = null;
  const lines: string[] = [];
  const tryResolve = () => {
    if (!waiting) return;
    const end = lines.findIndex((l) => /^\d{3} /.test(l) || /^\d{3}$/.test(l));
    if (end === -1) return;
    const block = lines.splice(0, end + 1);
    const w = waiting;
    waiting = null;
    w.resolve({ code: Number(block[end].slice(0, 3)), text: block.map((l) => l.slice(4)).join(" ") });
  };
  const onData = (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let i;
    while ((i = buf.indexOf("\r\n")) !== -1) {
      lines.push(buf.slice(0, i));
      buf = buf.slice(i + 2);
    }
    tryResolve();
  };
  socket.on("data", onData);
  return {
    next: () =>
      new Promise<{ code: number; text: string }>((resolve, reject) => {
        waiting = { resolve, reject };
        tryResolve();
      }),
    fail: (e: Error) => waiting?.reject(e),
    detach: () => socket.off("data", onData),
  };
}

export class SmtpError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
    this.name = "SmtpError";
  }
}

export function createSmtpMailer(cfg: SmtpConfig): Mailer {
  if (cfg.security === "none" && !["127.0.0.1", "localhost", "::1"].includes(cfg.host)) throw new SmtpError("SMTP sem TLS só é aceito em 127.0.0.1.");
  const timeout = cfg.timeoutMs ?? 20_000;

  async function send(msg: MailMessage) {
    if (!EMAIL.test(msg.to)) throw new SmtpError("Destinatário inválido.");
    let socket: net.Socket =
      cfg.security === "implicit" ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }) : net.connect({ host: cfg.host, port: cfg.port });
    socket.setTimeout(timeout);
    let r = reader(socket);
    const onErr = (e: Error) => r.fail(new SmtpError(`Conexão com o servidor de e-mail falhou (${(e as NodeJS.ErrnoException).code ?? "erro"}).`));
    const onTimeout = () => {
      r.fail(new SmtpError("O servidor de e-mail demorou demais."));
      socket.destroy();
    };
    socket.on("error", onErr);
    socket.on("timeout", onTimeout);
    socket.on("close", () => r.fail(new SmtpError("O servidor de e-mail fechou a conexão.")));
    const write = (line: string) => socket.write(`${line}\r\n`);
    const expect = async (ok: number[], what: string) => {
      const res = await r.next();
      if (!ok.includes(res.code)) throw new SmtpError(`Servidor de e-mail recusou ${what} (código ${res.code}).`, res.code);
      return res;
    };
    try {
      await expect([220], "a conexão");
      write(`EHLO ${cfg.from.split("@")[1] ?? "localhost"}`);
      let ehlo = await expect([250], "o EHLO");
      if (cfg.security === "starttls") {
        if (!/STARTTLS/i.test(ehlo.text)) throw new SmtpError("O servidor de e-mail não oferece TLS.");
        write("STARTTLS");
        await expect([220], "o STARTTLS");
        r.detach();
        socket.off("error", onErr);
        socket.off("timeout", onTimeout);
        socket = tls.connect({ socket, servername: cfg.host });
        socket.setTimeout(timeout);
        r = reader(socket);
        socket.on("error", onErr);
        socket.on("timeout", onTimeout);
        await new Promise<void>((resolve, reject) => {
          socket.once("secureConnect", () => resolve());
          socket.once("error", reject);
        });
        write(`EHLO ${cfg.from.split("@")[1] ?? "localhost"}`);
        ehlo = await expect([250], "o EHLO");
      }
      write("AUTH LOGIN");
      await expect([334], "o login");
      write(Buffer.from(cfg.user, "utf8").toString("base64"));
      await expect([334], "o usuário");
      write(Buffer.from(cfg.password, "utf8").toString("base64"));
      await expect([235], "a senha");
      write(`MAIL FROM:<${cfg.from}>`);
      await expect([250], "o remetente");
      write(`RCPT TO:<${msg.to}>`);
      await expect([250, 251], "o destinatário");
      write("DATA");
      await expect([354], "o envio");
      socket.write(`${buildMessage(cfg, msg)}\r\n.\r\n`);
      await expect([250], "a mensagem");
      write("QUIT");
      await Promise.race([r.next().catch(() => undefined), new Promise((res) => setTimeout(res, 2000).unref?.())]);
    } finally {
      socket.end();
      socket.destroy();
    }
  }

  return { send, from: cfg.from };
}
