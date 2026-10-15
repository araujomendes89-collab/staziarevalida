// Registro dos adaptadores do Radar, na ordem decidida pelo dono: Conitec, DOU, calendário de vacinação, Febrasgo.
import * as conitec from "./conitec.mjs";
import * as dou from "./dou.mjs";
import * as vacinacao from "./vacinacao.mjs";
import * as febrasgo from "./febrasgo.mjs";

export const ADAPTADORES = { conitec, dou, vacinacao, febrasgo };
export const ORDEM = ["conitec", "dou", "vacinacao", "febrasgo"];

/** Roda os adaptadores pedidos. Uma falha de site NUNCA derruba o vigia: vira erro no resultado daquele adaptador. */
export async function coletarTodos(cliente, { quais = ORDEM, opcoes = {} } = {}) {
  const saida = [];
  for (const nome of quais) {
    const ad = ADAPTADORES[nome];
    if (!ad) continue;
    const t0 = Date.now();
    try { saida.push({ ...(await ad.coletar(cliente, opcoes[nome])), ms: Date.now() - t0 }); }
    catch (e) { saida.push({ adaptador: nome, itens: [], erros: [`falha inesperada: ${String(e?.message ?? e).slice(0, 160)}`], bloqueado: false, ms: Date.now() - t0 }); }
  }
  return saida;
}
