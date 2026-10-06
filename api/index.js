// Função da Vercel: todas as rotas /api do servidor (Tutor, Central de Conteúdo, admin…).
// O código do servidor é empacotado no build (npm run build:vercel → server-dist/vercel.cjs), como no `npm run build`
// de sempre; aqui só se monta o app uma vez por instância e se repassa cada pedido. O site sai do CDN (vercel.json).
let ready = null;

export default async function handler(req, res) {
  ready ??= import("../server-dist/vercel.cjs").then((m) => (m.createApp ?? m.default.createApp)({ serverless: true })).then(({ app }) => app);
  const app = await ready;
  return app(req, res);
}
