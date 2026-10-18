/**
 * Teste do envio de e-mail dos avisos pelo SMTP do Google Workspace (lê ~/.config/staziamed/smtp.env; nunca imprime a senha).
 * Manda UM e-mail de exemplo (aviso de renovação, marcado [TESTE]) para o endereço informado.
 * Uso: npx tsx scripts/previa-compra/email-teste.ts destinatario@exemplo.com
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createSmtpMailer, smtpConfigFromEnv } from "../../server/avisos/smtp";
import { renderAviso } from "../../server/avisos/avisos";

const para = process.argv[2];
if (!para) throw new Error("Informe o destinatário.");
const txt = fs.readFileSync(path.join(os.homedir(), ".config/staziamed/smtp.env"), "utf8");
const e = Object.fromEntries(txt.split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
// nomes do arquivo do dono → nomes que o servidor usa (os mesmos a criar na Vercel)
const cfg = smtpConfigFromEnv({ SMTP_HOST: e.SMTP_HOST, SMTP_PORT: e.SMTP_PORTA, SMTP_USER: e.SMTP_USUARIO, SMTP_PASSWORD: e.SMTP_SENHA_APP, SMTP_FROM: e.SMTP_REMETENTE, SMTP_FROM_NAME: e.SMTP_NOME } as NodeJS.ProcessEnv);
if (!cfg) throw new Error("smtp.env incompleto.");
const r = renderAviso({ titulo: "[TESTE] Seu PRO renova em 3 dias", texto: "Este é um e-mail de teste dos avisos de renovação do StaziaMed (nada foi cobrado). Em 20/10/2026, R$ 99,90 serão cobrados à vista no seu cartão de crédito. Você não precisa fazer nada. Para trocar para Pix ou cancelar (sem multa), vá em Minha conta > Assinatura.", rota: "planos", nome: "João Paulo" }, "https://app.staziamed.com.br");
createSmtpMailer(cfg)
  .send({ to: para, subject: r.subject, text: r.text, html: r.html })
  .then(() => console.log(`ok: e-mail de teste enviado para ${para} (host ${cfg.host}, porta ${cfg.port}, remetente ${cfg.from})`))
  .catch((err) => {
    console.error("falhou:", (err as Error).message);
    process.exit(1);
  });
