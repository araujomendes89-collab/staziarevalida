/**
 * Envio de e-mail por SMTP sem biblioteca nova (o projeto não tem nodemailer e a Vercel instala com `npm ci`). Feito para o Google
 * Workspace: smtp.gmail.com, porta 465 (TLS desde o início) ou 587 (STARTTLS), com senha de app.
 *
 * MESMA IDEIA E MESMAS VARIÁVEIS do módulo do ramo fase1-compra (server/avisos/smtp.ts), mas sem depender dele. Diferenças:
 *   - anexos (a cópia do contrato vai como arquivo .txt);
 *   - o erro diz se a mensagem PODE ter sido entregue (`talvezEntregue`): a falha depois de a mensagem ter sido mandada não é
 *     repetida, para não chegar duas vezes.
 * Ao juntar os ramos: ficar com UM módulo só (este cobre o daquele: mesma configuração, `send` aceita a mesma mensagem sem anexos).
 *
 * Variáveis (só no servidor; NUNCA no código nem no navegador):
 *   SMTP_HOST, SMTP_PORT (465 ou 587; padrão 465), SMTP_USER (conta que entra), SMTP_PASSWORD (senha de app), SMTP_FROM (remetente),
 *   SMTP_FROM_NAME (nome que aparece; padrão "StaziaMed"). Faltando HOST, USER, PASSWORD ou FROM: e-mail desligado (null).
 * A senha nunca vai para o registro (log) nem para as mensagens de erro: os erros guardam só o código da resposta do servidor.
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

export interface MailAttachment {
  filename: string;
  content: string | Buffer;
  contentType: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
}

export type Mailer = { send(msg: MailMessage): Promise<void>; from: string };

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

/** Configuração a partir das variáveis do servidor (null = e-mail desligado). */
export function smtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = (env.SMTP_HOST ?? "").trim();
  const user = (env.SMTP_USER ?? "").trim();
  const password = (env.SMTP_PASSWORD ?? "").replace(/\s+/g, ""); // a senha de app do Google vem em grupos com espaço
  const from = (env.SMTP_FROM ?? "").trim();
  if (!host || !user || !password || !EMAIL.test(from)) return null;
  const port = Number(env.SMTP_PORT ?? 465) || 465;
  return { host, port, user, password, from, fromName: (env.SMTP_FROM_NAME ?? "StaziaMed").trim() || "StaziaMed", security: port === 465 ? "implicit" : "starttls" };
}

/** Assunto, nome e arquivo com acento: codificação MIME (RFC 2047). */
const mimeWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const b64Lines = (b: string | Buffer) => (typeof b === "string" ? Buffer.from(b, "utf8") : b).toString("base64").replace(/.{1,76}/g, "$&\r\n");
const safeName = (s: string) => s.replace(/[\r\n"\\]/g, "_");

/** A mensagem completa (cabeçalhos + texto, HTML e anexos), com as linhas que começam com ponto dobradas (regra do SMTP). */
export function buildMessage(cfg: Pick<SmtpConfig, "from" | "fromName">, msg: MailMessage, now = new Date()): string {
  const domain = cfg.from.split("@")[1] ?? "staziamed.com.br";
  const alt = `alt-${crypto.randomBytes(12).toString("hex")}`;
  const parteAlt = [
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(msg.text),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(msg.html),
    `--${alt}--`,
  ];
  const head = [
    `From: ${mimeWord(cfg.fromName)} <${cfg.from}>`,
    `To: <${msg.to}>`,
    `Subject: ${mimeWord(msg.subject)}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Auto-Submitted: auto-generated",
  ];
  let body: string[];
  if (msg.attachments?.length) {
    const mix = `mix-${crypto.randomBytes(12).toString("hex")}`;
    body = [`Content-Type: multipart/mixed; boundary="${mix}"`, "", `--${mix}`, ...parteAlt];
    for (const a of msg.attachments) {
      const nome = safeName(a.filename);
      body.push(
        `--${mix}`,
        `Content-Type: ${a.contentType}; name="${mimeWord(nome)}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${mimeWord(nome)}"`,
        "",
        b64Lines(a.content),
      );
    }
    body.push(`--${mix}--`);
  } else body = parteAlt;
  return [...head, ...body, ""].join("\r\n").replace(/\r\n\./g, "\r\n..");
}

/** Lê respostas do servidor (linhas "250-..." continuam; "250 ..." encerra). */
function reader(socket: net.Socket) {
  let buf = "";
  let waiting: { resolve: (v: { code: number; text: string }) => void; reject: (e: Error) => void } | null = null;
  let failed: Error | null = null;
  const lines: string[] = [];
  const tryResolve = () => {
    if (!waiting) return;
    const end = lines.findIndex((l) => /^\d{3}( |$)/.test(l));
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
        if (failed) return reject(failed);
        waiting = { resolve, reject };
        tryResolve();
      }),
    fail: (e: Error) => {
      failed ??= e;
      const w = waiting;
      waiting = null;
      w?.reject(e);
    },
    detach: () => socket.off("data", onData),
  };
}

export class SmtpError extends Error {
  /** true = a falha veio DEPOIS de a mensagem ter sido mandada: pode ter chegado (não repetir). */
  talvezEntregue = false;
  constructor(message: string, public code?: number) {
    super(message);
    this.name = "SmtpError";
  }
}

export function createSmtpMailer(cfg: SmtpConfig): Mailer {
  if (cfg.security === "none" && !["127.0.0.1", "localhost", "::1"].includes(cfg.host)) throw new SmtpError("SMTP sem TLS só é aceito em 127.0.0.1.");
  const timeout = cfg.timeoutMs ?? 20_000;
  const ehloName = cfg.from.split("@")[1] ?? "localhost";

  async function send(msg: MailMessage) {
    if (!EMAIL.test(msg.to)) throw new SmtpError("Destinatário inválido.");
    let socket: net.Socket =
      cfg.security === "implicit" ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }) : net.connect({ host: cfg.host, port: cfg.port });
    socket.setTimeout(timeout);
    let r = reader(socket);
    let mandou = false; // a mensagem inteira já foi escrita
    const onErr = (e: Error) => r.fail(new SmtpError(`Conexão com o servidor de e-mail falhou (${(e as NodeJS.ErrnoException).code ?? "erro"}).`));
    const onTimeout = () => {
      r.fail(new SmtpError("O servidor de e-mail demorou demais."));
      socket.destroy();
    };
    const onClose = () => r.fail(new SmtpError("O servidor de e-mail fechou a conexão."));
    const ligar = (s: net.Socket) => {
      s.on("error", onErr);
      s.on("timeout", onTimeout);
      s.on("close", onClose);
    };
    ligar(socket);
    const write = (line: string) => socket.write(`${line}\r\n`);
    const expect = async (ok: number[], what: string) => {
      const res = await r.next();
      if (!ok.includes(res.code)) throw new SmtpError(`Servidor de e-mail recusou ${what} (código ${res.code}).`, res.code);
      return res;
    };
    try {
      await expect([220], "a conexão");
      write(`EHLO ${ehloName}`);
      let ehlo = await expect([250], "o EHLO");
      if (cfg.security === "starttls") {
        if (!/STARTTLS/i.test(ehlo.text)) throw new SmtpError("O servidor de e-mail não oferece TLS.");
        write("STARTTLS");
        await expect([220], "o STARTTLS");
        r.detach();
        socket.off("error", onErr);
        socket.off("timeout", onTimeout);
        socket.off("close", onClose);
        socket = tls.connect({ socket, servername: cfg.host });
        socket.setTimeout(timeout);
        r = reader(socket);
        ligar(socket);
        await new Promise<void>((resolve, reject) => {
          socket.once("secureConnect", () => resolve());
          socket.once("error", reject);
        });
        write(`EHLO ${ehloName}`);
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
      mandou = true;
      await expect([250], "a mensagem");
      mandou = false; // aceita: o que vier depois (QUIT) não importa
      write("QUIT");
      await Promise.race([r.next().catch(() => undefined), new Promise((res) => setTimeout(res, 2000).unref?.())]);
    } catch (e) {
      const err = e instanceof SmtpError ? e : new SmtpError("Falha no envio do e-mail.");
      // recusa explícita da mensagem (código 5xx/4xx depois do DATA) = não entregue; queda ou demora depois de mandar = talvez
      if (mandou && err.code === undefined) err.talvezEntregue = true;
      throw err;
    } finally {
      socket.end();
      socket.destroy();
    }
  }

  return { send, from: cfg.from };
}
