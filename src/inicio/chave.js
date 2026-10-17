// Chaves da página inicial, lidas na hora do build (vite.config.ts). Na Vercel: Settings → Environment Variables, depois "Redeploy".
//
//   PAGINA_INICIAL         "ligada" → app.staziamed.com.br/ mostra a página inicial.
//                          Qualquer outro valor (ou sem a variável) → "/" leva direto para /novo, como hoje.
//   PAGINA_INICIAL_TEXTOS  "hoje"   → só o que existe hoje (padrão).
//                          "pronto" → os textos do dia da abertura da Fase 1 (cobrança, carteira, Tutor novo e amostra do teste).
//                          Ou palavras soltas: "cobranca carteira tutor amostra" (só as que estiverem ligadas no app).
//
// O resto do site (/novo, /api, termos, 404, cache, segurança) não depende destas chaves.

export const LIBERACOES = ["cobranca", "carteira", "tutor", "amostra"];

const sim = (v) => /^(ligada|ligado|sim|1|true)$/i.test(String(v ?? "").trim());

/** A página inicial aparece em "/"? */
export function paginaInicialLigada(env = {}) {
  return sim(env.PAGINA_INICIAL);
}

/** Palavras do data-liberado: "hoje" = nenhuma; "pronto" = todas; ou a lista (palavras desconhecidas são ignoradas). */
export function palavrasLiberadas(env = {}) {
  const v = String(env.PAGINA_INICIAL_TEXTOS ?? "").trim().toLowerCase();
  if (!v || v === "hoje") return [];
  if (v === "pronto" || v === "tudo") return [...LIBERACOES];
  const pedidas = v.split(/[\s,]+/);
  return LIBERACOES.filter((p) => pedidas.includes(p));
}

/** Escreve as palavras no <html data-liberado=""> da página. */
export function aplicarTextos(html, env = {}) {
  if (!html.includes('data-liberado=""')) throw new Error('index.html sem data-liberado="" (a chave dos textos não acharia onde escrever)');
  return html.replace('data-liberado=""', `data-liberado="${palavrasLiberadas(env).join(" ")}"`);
}

/**
 * Página que entra no lugar da inicial quando ela está desligada: manda para /novo na hora, levando o resto do endereço
 * (links de e-mail com #access_token, ?code= etc. continuam funcionando). Sem nada inline (a raiz tem CSP rígida).
 */
export const HTML_DESLIGADA = `<!doctype html>
<!-- Página inicial DESLIGADA (variável PAGINA_INICIAL diferente de "ligada"): "/" leva para o app (/novo). -->
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>StaziaMed Revalida</title>
    <meta name="robots" content="noindex" />
    <link rel="icon" href="/brand/favicon.ico" sizes="48x48" />
    <noscript><meta http-equiv="refresh" content="0; url=/novo" /></noscript>
    <script type="module" src="/src/inicio/ir-para-o-app.js"></script>
  </head>
  <body>
    <p><a href="/novo">Abrir o StaziaMed Revalida</a></p>
  </body>
</html>
`;

/** Plugin do Vite: aplica as duas chaves só no index.html (o app /novo e a 404 não mudam). */
export function chavePaginaInicial(env = {}) {
  return {
    name: "staziamed-chave-pagina-inicial",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const arquivo = String(ctx?.filename ?? ctx?.path ?? "").replace(/\\/g, "/");
        if (!/(^|\/)index\.html$/.test(arquivo)) return html;
        return paginaInicialLigada(env) ? aplicarTextos(html, env) : HTML_DESLIGADA;
      },
    },
  };
}
