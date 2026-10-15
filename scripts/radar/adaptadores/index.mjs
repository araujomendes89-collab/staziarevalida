// Registro dos adaptadores do Radar, na ordem decidida pelo dono: Conitec, DOU, calendário de vacinação, Febrasgo.
import * as conitec from "./conitec.mjs";
import * as dou from "./dou.mjs";
import * as vacinacao from "./vacinacao.mjs";
import * as febrasgo from "./febrasgo.mjs";

export const ADAPTADORES = { conitec, dou, vacinacao, febrasgo };
export const ORDEM = ["conitec", "dou", "vacinacao", "febrasgo"];   // todos os que existem no código
// ATIVOS = o que roda por padrão. O DOU está DESLIGADO por decisão do dono (15/10/2026); o código fica. Para religar: acrescentar "dou" aqui
// (ver docs/radar-evidencias.md, seção "Diário Oficial desligado") e mudar --tasks do deploy para o novo número de adaptadores.
export const ATIVOS = ["conitec", "vacinacao", "febrasgo"];

/** Roda os adaptadores pedidos. Uma falha de site NUNCA derruba o vigia: vira erro no resultado daquele adaptador. */
export async function coletarTodos(cliente, { quais = ATIVOS, opcoes = {} } = {}) {
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
