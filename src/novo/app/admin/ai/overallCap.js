// Teto GERAL do mês para todo o gasto de IA (IA02, estrutura): a Central, o Tutor, as vozes, a transcrição, os Podcasts e a busca por
// significado juntos. Nasce desligado e sem valor (decisão do dono: os números são dele). Por ora SÓ AVISA, a 80% e ao passar: nada
// para por causa dele. Aqui só a conta; a tela e o banco ficam em AdminAI.jsx e em …9892_teto_geral_ia_mes.sql.

export const OVERALL_WARN_AT = 0.8;

/**
 * Situação do teto geral a partir da resposta de /api/ai-central/overview.
 *   supported: o banco já tem o teto geral (a migração 9892 foi colada);
 *   cap/enabled: o valor e a chave, como o dono deixou;
 *   spend: gasto do mês do que tem registro (Central + os outros lugares); partial: os outros lugares ainda não estão disponíveis;
 *   level: null (desligado ou sem valor), "ok", "perto" (a partir de 80%) ou "passou".
 */
export function overallCapState(data) {
  const s = data?.settings ?? {};
  const supported = Object.prototype.hasOwnProperty.call(s, "overall_cap_enabled");
  const cap = s.overall_monthly_cap_usd == null ? null : Number(s.overall_monthly_cap_usd);
  const enabled = s.overall_cap_enabled === true;
  const available = data?.all_spend?.available === true;
  const groups = available ? data.all_spend.groups ?? [] : [];
  const spend = Number(data?.month_spend ?? 0) + groups.reduce((t, g) => t + Number(g.cost_usd ?? 0), 0);
  let level = null;
  if (supported && enabled && cap !== null) level = spend >= cap ? "passou" : cap > 0 && spend >= cap * OVERALL_WARN_AT ? "perto" : "ok";
  return { supported, cap, enabled, spend, partial: !available, level, percent: cap ? Math.round((spend / cap) * 100) : null };
}
