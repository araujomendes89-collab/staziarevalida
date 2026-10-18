// Teste grátis (planos etapa 4): o onboarding "ativa" o teste pelo NOSSO servidor (POST /api/planos/teste/ativar, etapa 3), que vê
// o IP e guarda só o código dele (HMAC, 90 dias) para o alerta de testes repetidos (nunca bloqueia). O teste em si já nasce no
// cadastro (7 dias, um por conta); aqui só se registra a ativação e, quando houver, a escolha 1ª fase / 2ª fase / as duas.
const ROTA = "/api/planos/teste/ativar";

/** Ativa (escolha = null) ou escolhe a fase do teste. Recusa do banco (já escolheu, teste acabou…) vem com status 400. */
export async function ativarTeste(backend, escolha = null) {
  const token = backend?.accessToken ? await backend.accessToken() : null;
  if (!token) throw Object.assign(new Error("Entre de novo na sua conta."), { status: 401 });
  const res = await fetch(ROTA, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(escolha ? { escolha } : {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // sem corpo
  }
  if (!res.ok) throw Object.assign(new Error(data?.error ?? "Não foi possível ativar o teste agora."), { status: res.status });
  return data;
}
