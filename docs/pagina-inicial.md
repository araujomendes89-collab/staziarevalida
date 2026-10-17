# Página inicial pública (app.staziamed.com.br/)

Ramo `pagina-inicial`. Nada disto está no ar. Publicar só com ordem do dono (push na `main`).

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página inicial (texto todo escrito no HTML; o Google lê sem JavaScript). |
| `src/inicio/inicio.css` | Estilo da página (tokens do app copiados; não importa o design system, que puxa fonte do Google). |
| `src/inicio/inicio.js` | Abas (fases, ciclo, franquia, ranking), menu do celular, volta dos links de e-mail para `/novo`. 2,7 kB. |
| `src/inicio/fonts/` | Plus Jakarta Sans (OFL). A Barlow Condensed vem de `src/novo/app/auth/fonts/`. |
| `src/inicio/img/` | Lontra (Stazi) em WebP e AVIF, 2 tamanhos cada, tirada dos sprites aprovados do ramo `tutor-personagens`. |
| `404.html` | Página "não encontrada" (a Vercel usa sozinha, com código 404). |
| `public/robots.txt`, `public/sitemap.xml` | Google: só `/`, `/novo/termos` e `/novo/privacidade`. |
| `public/inicio-sem-js.css` | Sem JavaScript, mostra o conteúdo de todas as abas. |
| `app-antigo.html` | Entrada do app antigo (`src/main.tsx`). Fora do build; serve só para abrir o app antigo no servidor local. |

## Textos que dependem do que está ligado no app

`<html data-liberado="">` no `index.html`. Cada palavra libera o texto final e esconde o texto de hoje:

| Palavra | Ligar quando | O que muda |
|---|---|---|
| `cobranca` | a cobrança pelo Asaas estiver no ar | "Assinatura em breve" vira o botão "Assinar o PRO" (`/novo/planos` — conferir o endereço da tela de assinatura) |
| `carteira` | a carteira de créditos e minutos estiver ligada para o aluno | aparecem os botões por plano e os números (5/dia e 2 min no teste; 8/dia, 180/mês e 10 min no PRO) e a nota "a voz usa minutos e não gasta créditos" |
| `tutor` | o Tutor com Stazi e Stazia estiver publicado | "Escolha quem te acompanha: o Stazi ou a Stazia" e o cartão "2 personagens · 4 personalidades" |
| `amostra` | a amostra diária do teste estiver ligada | a chamada final cita "5 créditos por dia e 2 minutos de voz no teste" |

Exemplo: `<html lang="pt-BR" data-liberado="cobranca carteira">`.
Para ver tudo ligado no computador local: `http://127.0.0.1:PORTA/?liberar=tudo` (no site de verdade o parâmetro não faz nada).

## Roteamento (vercel.json) — o que muda ao publicar

1. Sai o redirecionamento `/` → `/novo`: a raiz mostra a página inicial (`dist/index.html`).
2. Sai a reescrita final `/:path*` → `/index.html`, que entregava o app ANTIGO em endereços inexistentes
   (achado da auditoria de segurança). Agora `/assets/nao-existe.js`, `/brand/nada.png` etc. respondem 404.
3. Continua o redirecionamento geral dos endereços velhos (`/questoes`, `/admin`…) para `/novo`;
   `robots.txt`, `sitemap.xml` e `inicio-sem-js.css` entram nas exceções.
4. Cabeçalhos: a raiz ganha Content-Security-Policy rígida (nada de fora), `nosniff`, `Referrer-Policy`,
   `Permissions-Policy` e `X-Frame-Options`. `/assets/*` (nomes carimbados) ganha cache de 1 ano.
   O `/novo` NÃO recebe essa CSP (ele usa Supabase, Google e IA; precisa de regra própria, testada à parte).
5. `server.ts` (só fora da Vercel): endereço inexistente responde `404.html` com 404.

Os botões "Teste grátis" levam a `/novo/criar-conta`, que agora abre direto o Criar conta (`AuthFlow`).
Os links dos e-mails (confirmar cadastro, nova senha) continuam indo para `/novo`; se algum cair na raiz,
o `inicio.js` manda para `/novo` com o mesmo resto do endereço.

## Antes de publicar (conferir)

- Ordem do dono e respostas às decisões [DONO DECIDE] do PLANO-E-TEXTOS.md.
- Plano da Vercel permite uso comercial (o Hobby não permite).
- Supabase: Site URL = `https://app.staziamed.com.br/novo` e Redirect URLs com `/novo?confirmacao=1`.
- No banco: todas as questões oficiais têm comentário (cartão 01); anos das provas (2020 a 2026/1, ENAMED 2025).
- Prévia da Vercel do ramo: `/` 200 com a página nova; `/assets/nao-existe.js` 404; `/questoes` → `/novo`;
  `/novo/login`, `/novo/criar-conta`, `/novo/termos`, `/novo/privacidade` 200; `/robots.txt` e `/sitemap.xml` 200.
