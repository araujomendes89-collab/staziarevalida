// Empacota o servidor para a função da Vercel (server-dist/vercel.cjs), como o `npm run build` de sempre (CommonJS, pacotes
// de fora), com uma exceção: firebase-admin, jwks-rsa e jose entram no pacote. O `jose` só existe como módulo ES e o carregador
// de funções da Vercel não aceita require() de módulo ES; empacotado, ele vira CommonJS e o problema some.
import { build } from "esbuild";

const inline = /^(firebase-admin|jwks-rsa|jose)(\/|$)/;

await build({
  entryPoints: ["server.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: "server-dist/vercel.cjs",
  logLevel: "warning",
  plugins: [
    {
      name: "pacotes-de-fora",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) => {
          if (args.kind === "entry-point" || args.path.startsWith(".") || args.path.startsWith("/")) return null;
          if (inline.test(args.path)) return null; // entra no pacote
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
