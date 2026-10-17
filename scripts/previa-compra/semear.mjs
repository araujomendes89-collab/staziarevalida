// Contas da prévia da compra (precisa do servidor: npx tsx scripts/previa-compra/servidor.ts). Cria:
//   aluno-teste@previa.dev  (teste grátis, onboarding feito; amostra de questões curta para ver o cadeado)
//   aluno-assina@previa.dev (teste grátis, onboarding feito; para o dono assinar com o cartão/Pix de teste)
//   aluno-pro@previa.dev    (PRO mensal pago por Pix no Asaas SANDBOX; vencimento em 3 dias para ver o aviso de renovação)
// Senha de todas: Senha-forte-123. Pode rodar de novo: contas que já existem são só reaproveitadas.
const BASE = process.env.BASE || "http://127.0.0.1:31995";
const post = async (url, body, token) => {
  const r = await fetch(`${BASE}${url}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${url}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};
const get = async (url, token) => (await fetch(`${BASE}${url}`, { headers: { authorization: `Bearer ${token}` } })).json();
// versão vigente do Contrato/Termo (lida do banco, como o cadastro faz)
let _versao = null;
const versaoDoTermo = async () => (_versao ??= ((await (await fetch(`${BASE}/api/dev-db/rpc`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fn: "app_legal_current", args: {} }) })).json()).data?.termo_uso?.version ?? "3.0"));
const rpc = async (token, fn, args = {}) => (await post("/api/dev-db/rpc", { fn, args }, token)).data;

async function conta(email, nome) {
  try {
    return (await post("/api/dev-db/auth/signin", { email, password: "Senha-forte-123" })).token;
  } catch {
    const { token } = await post("/api/dev-db/auth/signup", {
      name: nome, email, password: "Senha-forte-123", terms_version: await versaoDoTermo(), user_agent: "previa", declares_adult: "true", declares_physician: "true",
    });
    await post("/api/planos/teste/ativar", {}, token).catch((e) => console.log("ativar:", e.message));
    await rpc(token, "app_onboarding_salvar", { p_passo: "pular", p_dados: {} }).catch((e) => console.log("onboarding:", e.message));
    return token;
  }
}

await post("/previa/amostra-curta");
await conta("aluno-teste@previa.dev", "Ana Souza");
await conta("aluno-assina@previa.dev", "Bruno Lima");
const pro = await conta("aluno-pro@previa.dev", "Carla Mendes");
const ov = await get("/api/cobranca/overview", pro);
if (!ov.contrato) {
  const p = await post("/api/cobranca/checkout", { tipo: "plano", codigo: "pro", ciclo: "mensal", metodo: "pix", aceite: true, idem: `previa-pro-${Date.now()}`, documento: "366.385.446-91", nome: "Carla Mendes Teste" }, pro);
  console.log("pedido do PRO:", p.id, p.status);
  // simula o Pix pago no sandbox e deixa a tela/servidor conferirem
  await fetch(`${BASE}/previa/pix-pago/${p.id}`, { method: "POST", redirect: "manual" });
  for (let i = 0; i < 10; i++) {
    const s = await get(`/api/cobranca/orders/${p.id}`, pro);
    if (s.status === "pago") break;
    await new Promise((r) => setTimeout(r, 1500));
  }
}
await post("/previa/vencimento", { email: "aluno-pro@previa.dev", dias: 3 });
await fetch(`${BASE}/previa/tarefa`, { method: "POST", redirect: "manual" });
console.log("ok: contas da prévia prontas");
