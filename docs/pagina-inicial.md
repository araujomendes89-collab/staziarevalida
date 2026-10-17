# Página inicial pública (app.staziamed.com.br/)

Ramo `pagina-inicial`. Nada disto está no ar. Publicar só com ordem do dono (push na `main`).

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página inicial (texto todo escrito no HTML; o Google lê sem JavaScript). |
| `src/inicio/inicio.css` | Estilo da página (visual do desenho do dono; tokens do app copiados; não importa o design system, que puxa fonte do Google). Do site do grupo (stazia.com.br) vieram só comportamentos (decisão do dono, 17/10): topo que gruda e ganha sombra ao rolar com barra de progresso, título com cursor digitando, passos do ciclo que acendem. |
| `src/inicio/inicio.js` | Abas (fases, franquia, ranking), passos do ciclo que acendem ao rolar ou tocar (teclado e leitor de tela), título letra a letra, topo e barra de rolagem, menu do celular, volta dos links de e-mail para `/novo`. Com "menos movimento" nada anima. |
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
| `cobranca` | a cobrança estiver no ar **e** o Contrato de Assinatura 3.0 estiver publicado | "Assinatura em breve" vira o botão "Assinar o PRO" (`/novo/planos` — conferir o endereço da tela de assinatura) e aparecem as regras: pagamento à vista (Pix ou cartão), devolução em 7 dias e renovação (cartão automática; Pix com cobrança 7 dias antes). Se o provedor for a Stripe (Pix = compra de um mês, sem renovação), reescrever a frase da renovação antes de ligar. Trocar também o link "Termos de Uso" pelo contrato com as condições comerciais. |
| `carteira` | a carteira de créditos e minutos estiver ligada para o aluno | aparecem os botões por plano e os números (5/dia e 2 min no teste; 8/dia, 180/mês e 10 min no PRO) e a nota "a voz usa minutos e não gasta créditos" |
| `tutor` | o Tutor com Stazi e Stazia estiver publicado | "Escolha quem te acompanha: o Stazi ou a Stazia" e o cartão "2 personagens · 4 personalidades" |
| `amostra` | a amostra diária do teste estiver ligada (ramo planos-acesso, migração 013640) | a chamada final passa a dar os números da amostra: 20 questões, 1 simulado curto, 3 Temas ou aulas, os flashcards do dia, 5 créditos por dia e 2 minutos de voz no teste inteiro (conferir com `direitos_recursos` no dia) |

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
- No banco (contado em 17/10, só leitura): 13 provas oficiais (Revalida 2020 a 2026/2 e ENAMED 2025, 1.300 questões);
  6 questões da 2026/2 sem comentário (gabarito definitivo previsto para 04/12) e 33 com comentário em só parte das
  alternativas; 408 Questões Inéditas ativas; 51 Atualizações publicadas e aprovadas. Recontar no dia de publicar.
- Contrato de Assinatura 3.0 no ar antes de ligar `cobranca` (os Termos 2.0 não trazem as regras de teste, devolução e renovação).
- Razão social: a consulta pública da Receita (BrasilAPI, 17/10) já mostra "STAZIA TECNOLOGIA E EDUCACAO LTDA", ativa,
  CEP 80420-210; outra base (cnpj.ws, atualizada em 12/09) ainda mostra o nome antigo. Conferir no cartão CNPJ.
- Prévia da Vercel do ramo: `/` 200 com a página nova; `/assets/nao-existe.js` 404; `/questoes` → `/novo`;
  `/novo/login`, `/novo/criar-conta`, `/novo/termos`, `/novo/privacidade` 200; `/robots.txt` e `/sitemap.xml` 200.
