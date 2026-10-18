// Gera o HTML dos e-mails do ramo termo-funcoes (cópia do contrato e avisos de conta inativa) com dados de exemplo, para conferir o
// visual. Nada é enviado. Uso (da raiz): npx tsx scripts/previa-termo-funcoes/emails.ts <pasta>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderAvisoInatividade, renderCopiaContrato, type ItemFila } from "../../server/legal/emails";

const out = process.argv[2] || "/Volumes/StaziaMed/.tmp-aulas/termo-funcoes/emails";
fs.mkdirSync(out, { recursive: true });
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const body = fs.readFileSync(path.join(raiz, "src/novo/app/legal/textos/contrato-v3.0.md"), "utf8");

const base: ItemFila = {
  id: 1, kind: "contrato_copia", tentativas: 1, email: "ana.lima@exemplo.com", nome: "Ana Lima", payload: {},
  contrato: {
    document: "termo_uso", version: "3.0", accepted_at: "2026-10-17T17:05:00Z", origin: "cadastro",
    text_sha256: "0a9b58cff598fa27225043e476139521cb1b47a2355b937c02797006c39a1230", title: "Contrato de Assinatura e Termos de Uso", body,
    companions: { politica_privacidade: { version: "3.0" }, regulamento: { version: "1.0" } },
  },
};
const copia = renderCopiaContrato(base, "https://app.staziamed.com.br");
fs.writeFileSync(path.join(out, "email-copia-contrato.html"), copia.html);
fs.writeFileSync(path.join(out, "email-copia-contrato.txt"), `Assunto: ${copia.subject}\n\n${copia.text}`);
fs.writeFileSync(path.join(out, copia.attachments![0].filename), copia.attachments![0].content);
for (const acao of ["apagar_conta", "zerar_coins"] as const) {
  const e = renderAvisoInatividade({ ...base, kind: "aviso_inatividade", contrato: null, payload: { acao, ultimo_acesso: "2025-11-14T15:00:00Z", prazo: "2026-11-15" } }, null);
  fs.writeFileSync(path.join(out, `email-aviso-${acao === "apagar_conta" ? "apagar-conta" : "zerar-coins"}.html`), e.html);
  fs.writeFileSync(path.join(out, `email-aviso-${acao === "apagar_conta" ? "apagar-conta" : "zerar-coins"}.txt`), `Assunto: ${e.subject}\n\n${e.text}`);
}
console.log(`e-mails em ${out}`);
