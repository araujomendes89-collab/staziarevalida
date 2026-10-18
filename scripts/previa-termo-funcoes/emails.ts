// Gera o HTML dos e-mails do ramo termo-funcoes (avisos de conta inativa) com dados de exemplo, para conferir o visual.
// Nada é enviado. O contrato NÃO vai por e-mail (decisão do dono, 18/10/2026): fica só em Minha Conta → Documentos.
// Uso (da raiz): npx tsx scripts/previa-termo-funcoes/emails.ts <pasta>
import fs from "node:fs";
import path from "node:path";
import { renderAvisoInatividade, type ItemFila } from "../../server/legal/emails";

const out = process.argv[2] || "/Volumes/StaziaMed/.tmp-aulas/termo-funcoes/emails";
fs.mkdirSync(out, { recursive: true });

const base: ItemFila = { id: 1, kind: "aviso_inatividade", tentativas: 1, email: "ana.lima@exemplo.com", nome: "Ana Lima", payload: {} };
for (const acao of ["apagar_conta", "zerar_coins"] as const) {
  const e = renderAvisoInatividade({ ...base, payload: { acao, ultimo_acesso: "2025-11-14T15:00:00Z", prazo: "2026-11-15" } }, null);
  fs.writeFileSync(path.join(out, `email-aviso-${acao === "apagar_conta" ? "apagar-conta" : "zerar-coins"}.html`), e.html);
  fs.writeFileSync(path.join(out, `email-aviso-${acao === "apagar_conta" ? "apagar-conta" : "zerar-coins"}.txt`), `Assunto: ${e.subject}\n\n${e.text}`);
}
console.log(`e-mails em ${out}`);
