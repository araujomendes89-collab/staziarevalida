# Página inicial pública (app.staziamed.com.br/)

Ramo `pagina-inicial`. Nada disto está no ar. Publicar só com ordem do dono (push na `main`).

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página inicial (texto todo escrito no HTML; o Google lê sem JavaScript). |
| `src/inicio/inicio.css` | Estilo da página (visual do desenho do dono; tokens do app copiados; não importa o design system, que puxa fonte do Google). Do site do grupo (stazia.com.br) vieram só comportamentos (decisão do dono, 17/10): topo que gruda e ganha sombra ao rolar com barra de progresso, título com cursor digitando, passos do ciclo que acendem. |
| `src/inicio/inicio.js` | Abas (fases, franquia, ranking), passos do ciclo que acendem ao rolar ou tocar (teclado e leitor de tela), título letra a letra, topo e barra de rolagem, menu do celular, volta dos links de e-mail para `/novo`. Com "menos movimento" nada anima. |
| `src/inicio/fonts/` | Plus Jakarta Sans (OFL). A Barlow Condensed vem de `src/novo/app/auth/fonts/`. |
| `src/inicio/img/` | Lontra em WebP e AVIF (de braços cruzados: 320, 480 e 640 px; acenando: 220 e 440 px), tirada dos sprites aprovados do ramo `tutor-personagens`, e a logo do topo em WebP (336 e 504 px; a PNG fica de reserva). |
| `src/inicio/chave.js` | As duas chaves (`PAGINA_INICIAL` e `PAGINA_INICIAL_TEXTOS`), lidas no build pelo `vite.config.ts`. |
| `src/inicio/ir-para-o-app.js` | Com a página desligada, `/` leva para `/novo` com o resto do endereço. |
| `public/brand/compartilhar-inicio.jpg` | Imagem de compartilhamento (WhatsApp, redes, Google), 1200×630, com a logo e a lontra. Refazer: `node scripts/inicio/imagem-compartilhar.cjs`. |
| `404.html` | Página "não encontrada" (a Vercel usa sozinha, com código 404). |
| `public/robots.txt`, `public/sitemap.xml` | Google: só `/`, `/novo/termos`, `/novo/privacidade` e `/novo/regulamento`. |
| `public/inicio-sem-js.css` | Sem JavaScript, mostra o conteúdo de todas as abas. |
| `app-antigo.html` | Entrada do app antigo (`src/main.tsx`). Fora do build; serve só para abrir o app antigo no servidor local. |

## Textos que dependem do que está ligado no app

`<html data-liberado="">` no `index.html`. Cada palavra libera o texto final e esconde o texto de hoje:

| Palavra | Ligar quando | O que muda |
|---|---|---|
| `cobranca` | a cobrança estiver no ar **e** o Contrato de Assinatura 3.0 estiver publicado | "Assinatura em breve" vira o botão "Assinar o PRO" (`/novo/planos` — conferir o endereço da tela de assinatura) e aparecem as regras: pagamento à vista (Pix ou cartão), devolução em 7 dias e renovação (cartão automática; Pix com cobrança 7 dias antes). Se o provedor for a Stripe (Pix = compra de um mês, sem renovação), reescrever a frase da renovação antes de ligar. O link "Termos de Uso e Contrato" já abre `/novo/termos`, que mostra o Contrato 3.0 depois do SQL do Termo 3.0. |
| `carteira` | a carteira de créditos e minutos estiver ligada para o aluno | aparecem os botões por plano e os números (5/dia e 2 min no teste; 8/dia, 180/mês e 10 min no PRO) e a nota "a voz usa minutos e não gasta créditos" |
| `tutor` | o Tutor com Stazi e Stazia estiver publicado | "Escolha quem te acompanha: o Stazi ou a Stazia" e o cartão "2 personagens · 4 personalidades" |
| `amostra` | a amostra diária do teste estiver ligada (ramo planos-acesso, migração 013640) | a chamada final passa a dar os números da amostra: 20 questões, 1 simulado curto, 3 Temas ou aulas, os flashcards do dia, 5 créditos por dia e 2 minutos de voz no teste inteiro (conferir com `direitos_recursos` no dia) |

Não se edita o `index.html` para isso: as palavras vêm da variável **`PAGINA_INICIAL_TEXTOS`** na hora do build.

## As duas chaves (variáveis de ambiente da Vercel)

| Variável | Valor | O que acontece |
|---|---|---|
| `PAGINA_INICIAL` | `ligada` | `app.staziamed.com.br/` mostra a página inicial. |
| `PAGINA_INICIAL` | sem a variável, ou `desligada` | `/` leva direto para `/novo` (como hoje). O resto das mudanças (404 de verdade, `/novo/criar-conta`, `/novo/entrar`, cache e cabeçalhos) vale igual. |
| `PAGINA_INICIAL_TEXTOS` | `hoje` (ou sem a variável) | Só o que existe hoje (nenhuma palavra liberada). |
| `PAGINA_INICIAL_TEXTOS` | `pronto` | Textos do dia da abertura da Fase 1: libera `cobranca carteira tutor amostra`. |
| `PAGINA_INICIAL_TEXTOS` | palavras soltas, ex.: `tutor carteira` | Libera só essas (para quando uma parte abrir antes da outra). |

As duas são lidas **no build**: depois de mudar o valor na Vercel é preciso **Redeploy** (alguns minutos). Na Vercel não existe
variável que valha sem um deploy novo; o jeito de voltar em 1 minuto, sem build, é o **Instant Rollback** (abaixo).
Para testar antes do dia, a variável pode ser posta só no ambiente **Preview** (o endereço de prévia do ramo mostra a página e a
produção continua igual).

No computador: `PAGINA_INICIAL=ligada npm run dev` (ou no `.env`). Sem ela, `/` leva para `/novo` também no servidor local.
Prévia dos textos sem novo build: `http://127.0.0.1:PORTA/?liberar=tudo` (só no computador; no site o parâmetro não faz nada).

## Dia da publicação (abertura da Fase 1)

1. **Antes do dia (qualquer hora):** o dono aprova a prévia da Vercel do ramo (com `PAGINA_INICIAL=ligada` só em Preview).
2. **Vercel → Settings → Environment Variables → Production:** `PAGINA_INICIAL` = `ligada` e `PAGINA_INICIAL_TEXTOS` = `pronto`.
   `pronto` só se no dia estiverem no ar: cobrança (com o Contrato 3.0), carteira de créditos e minutos, Tutor com Stazi e Stazia e
   amostra diária do teste. Se faltar alguma, usar só as palavras do que estiver no ar (ex.: `tutor carteira`).
3. **Publicar:** push do ramo na `main` (se o código já estiver na `main`, basta Deployments → último → **Redeploy**).
4. **Conferir no ar (5 min):** `/` mostra a página; "Teste grátis" abre o Criar conta (`/novo/criar-conta`); "Entrar" abre o login
   (`/novo/entrar`); `/novo/termos`, `/novo/privacidade`, `/novo/regulamento` abrem; `/robots.txt` e `/sitemap.xml` abrem;
   `/assets/nao-existe.js` dá "Página não encontrada"; `/questoes` vai para `/novo`; mandar o link no WhatsApp e ver a imagem da lontra.
   Quem já está logado e abre `/novo/criar-conta` ou `/novo/entrar` cai no app.
5. **Supabase (conferir, não mudar se já estiver assim):** Site URL = `https://app.staziamed.com.br/novo`; Redirect URLs com `/novo?confirmacao=1`.

### Desfazer
- **Em 1 minuto, sem build:** Vercel → Deployments → o deploy de produção anterior → **Instant Rollback**. Volta o site inteiro
  como estava antes deste deploy. Atenção: depois de um rollback a Vercel para de pôr em produção sozinha os próximos pushes,
  até alguém clicar em **Promote** (ou desfazer o rollback).
- **Só a página (mantém o resto):** `PAGINA_INICIAL` = `desligada` (ou apagar a variável) e **Redeploy** (alguns minutos). `/` volta a levar para `/novo`.
- **Só os textos:** `PAGINA_INICIAL_TEXTOS` = `hoje` (ou a lista do que continua ligado) e **Redeploy**.

## Roteamento (vercel.json) — o que muda ao publicar

1. Sai o redirecionamento `/` → `/novo` do `vercel.json`: a raiz entrega `dist/index.html`, que é a página inicial (chave ligada)
   ou a página que leva para `/novo` (chave desligada).
2. Sai a reescrita final `/:path*` → `/index.html`, que entregava o app ANTIGO em endereços inexistentes
   (achado da auditoria de segurança). Agora `/assets/nao-existe.js`, `/brand/nada.png` etc. respondem 404.
3. Continua o redirecionamento geral dos endereços velhos (`/questoes`, `/admin`…) para `/novo`;
   `robots.txt`, `sitemap.xml` e `inicio-sem-js.css` entram nas exceções.
4. Cabeçalhos: a raiz ganha Content-Security-Policy rígida (nada de fora), `nosniff`, `Referrer-Policy`,
   `Permissions-Policy` e `X-Frame-Options`. `/assets/*` (nomes carimbados) ganha cache de 1 ano.
   O `/novo` NÃO recebe essa CSP (ele usa Supabase, Google e IA; precisa de regra própria, testada à parte).
5. `server.ts` (só fora da Vercel): endereço inexistente responde `404.html` com 404.

Os botões "Teste grátis" levam a `/novo/criar-conta`, que abre direto a tela Criar conta que já existia (`AuthFlow`); "Entrar" leva a
`/novo/entrar`, que é o mesmo login de `/novo/login`. A tela, a lógica e o visual do app não mudaram. Com sessão aberta, os dois vão para o app.
Os links dos e-mails (confirmar cadastro, nova senha) continuam indo para `/novo`; se algum cair na raiz,
o `inicio.js` manda para `/novo` com o mesmo resto do endereço.

## Antes de publicar (conferir)

- Ordem do dono e respostas às decisões [DONO DECIDE] do PLANO-E-TEXTOS.md.
- Plano da Vercel permite uso comercial (o Hobby não permite).
- Supabase: Site URL = `https://app.staziamed.com.br/novo` e Redirect URLs com `/novo?confirmacao=1`.
- No banco (contado em 17/10, só leitura): 13 provas oficiais (Revalida 2020 a 2026/2 e ENAMED 2025, 1.300 questões);
  6 questões da 2026/2 sem comentário (gabarito definitivo previsto para 04/12) e 33 com comentário em só parte das
  alternativas; 408 Questões Inéditas ativas; 51 Atualizações publicadas e aprovadas. Recontar no dia de publicar.
- Contrato de Assinatura 3.0 no ar (site do main eb5adc55 + SQL do Termo 3.0, ver `docs/termo-v3/PUBLICAR.md`) antes de ligar `cobranca`
  (os Termos 2.0 não trazem as regras de teste, devolução e renovação). Os links da página já apontam para `/novo/termos`,
  `/novo/privacidade` e `/novo/regulamento`, com os mesmos nomes do menu das páginas legais.
- Razão social: a consulta pública da Receita (BrasilAPI, 17/10) já mostra "STAZIA TECNOLOGIA E EDUCACAO LTDA", ativa,
  CEP 80420-210; outra base (cnpj.ws, atualizada em 12/09) ainda mostra o nome antigo. Conferir no cartão CNPJ.
- Prévia da Vercel do ramo: `/` 200 com a página nova; `/assets/nao-existe.js` 404; `/questoes` → `/novo`;
  `/novo/login`, `/novo/criar-conta`, `/novo/termos`, `/novo/privacidade` 200; `/robots.txt` e `/sitemap.xml` 200.
