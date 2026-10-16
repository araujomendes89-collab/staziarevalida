# Novas telas, casca final: login novo, barra de baixo, folha "Mais", Início simples, menu e faixa do Início

Data: 15/10/2026. Ramo `nt-casca-final` (a partir de `novas-telas` 7908185c). Sem push, sem publicação, sem migração, sem .env, sem IA paga.
Pedido do dono: "construa TUDO primeiro com as novas telas e abra uma pré-visualização; aí eu decido". Por isso, onde antes paramos para perguntar, segui o pacote e deixei a escolha numa configuração simples.
Capturas: `/Volumes/StaziaMed/.tmp-aulas/novas-telas/casca-final/` (`modelo/` = pacote renderizado, `app/` = app, `lado-a-lado/` = modelo à esquerda e app à direita, `faixa-*-antes.png` e `faixa-*-depois.png`).

## 1. Tela do pacote -> o que fiz -> diferenças

| Tela do pacote | Arquivos do app | O que fiz | Diferenças que ficaram (e por quê) |
|---|---|---|---|
| `LoginWeb` (1440) | `auth/LoginNovo.jsx`, `auth/login-novo.css` | Fundo azul-marinho, frase em 3 linhas ("Foco no que cai." / "Memória no que fica." em azul / "Confiança na prova."), "Acesse sua preparação para o Revalida.", etapas Identidade/Segurança/Acesso, rodapé à esquerda; cartão branco com o selo "ACESSO SEGURO · REVALIDA", "Bem-vindo de volta", E-mail, Senha (olho), Lembrar de mim, Esqueci minha senha, ENTRAR azul, "ou", Continuar com Google, "Criar conta". | Logo: uso a imagem oficial `horizontal-escuro` (o pacote monta símbolo + texto). Texto "ou" e cinzas pequenos em `#687586` (o pacote usa `#94a0af`, contraste 2,7:1). As etapas acendem conforme o formulário (como o login de antes); a 1ª já começa acesa, como no pacote. |
| `LoginTablet` (834) | idem | Tudo centralizado: logo, frase numa linha, etapas em linha, cartão de 480 px, rodapé embaixo. | — |
| `LoginMobile` (390) | idem | Logo e etapas no alto; cartão branco ocupa o resto da tela com o rodapé dentro. | — |
| Login: lógica | `auth/useLoginForm.js`, `auth/LoginScreen.jsx` | A lógica saiu para um único arquivo usado pelas duas aparências: `backend.signIn`, Google, "Lembrar de mim", aviso de conta master, recuperação de senha (`go("forgot")`), criação de conta (`go("signup")`, com o Termo de aceite como antes), estados carregando/erro/sucesso. Nada mudou em autenticação, rotas ou segurança. | — |
| Login de antes | `auth/LoginAtual.jsx` + `auth/login.css` | Guardado inteiro. Escolha em `auth/loginVisual.js`: `LOGIN_VISUAL = "novo"` (padrão neste ramo) ou `"atual"`. O endereço pode pedir a outra só para comparar: `?login=atual`. | As telas "Esqueci minha senha" e "Criar conta" continuam com o visual escuro de antes (o pacote não tem desenho para elas). |
| Barra de baixo (`HomeMobileCompact`) | `Shell.jsx` (`MobileTabs`), `shell/navModel.js` (`mobileTabs`), `shell/shell.css` | Início, Questões, **Tutor** (botão redondo roxo no meio), Revisar, Mais; aba atual com a pílula azul-clara; rótulos 12 px. | Selo do Revisar: ver item 2. No celular o rótulo do Tutor é roxo como no pacote; foco visível no botão redondo. |
| `MobileMais` ("Mobile · Mais aberto") | `shell/MaisSheet.jsx`, `shell/mais.css`, `navModel.maisSheetSections` | Folha que sobe de baixo, acima da barra: alça, "Mais", X, cartão da conta com a fase e "Trocar fase", seções Jornada e prática / Aprender / Stazia Arena / Minha evolução / Configurações em quadradinhos, "Sair da conta". Esc, X e tocar fora fecham; o foco volta ao botão Mais. "Preferências" abre dentro da folha (tema, fase, conta). Selos 0/2 (Plano de Hoje) e 0/3 (Missões) do banco. | Sem "Buscar no app" (decisão do dono). Administração só para a equipe e Revisão médica só para revisor (o pacote mostra Administração para todos). Aulas só quando abertas ao aluno. Para o aluno a 2ª fase é "Em breve": "Trocar fase" abre Preferências, onde isso aparece. Escolha: `shell/cascaConfig.js` `MAIS_CELULAR = "folha"` (padrão) ou `"pagina"` (a página da onda 2); `?mais=pagina` compara. |
| `MobileMenu` ("Mobile · Início") | `home/HomeScreen.jsx` (`HomeSimples`), `Shell.jsx` (`SimpleTopHeader`), `home/inicio.css` | Barra branca com logo, sequência e conta; data e saudação; cartão azul-marinho "Próximo passo" (título, "Você parou na questão N. Faltam M.", Continuar); "Stazia Score 383 /1000" com barra e nível; "Meta de hoje 0 /10 q." com barra e "0/3 missões"; "Trilha de aprendizado" com a etapa atual. Tudo com os dados de sempre (`app_home`, `app_today`, resumo do Play, `app_trail`). | Score, Meta, missões e trilha só com a Stazia Arena ligada (mesma regra do Início completo). Escolha: `cascaConfig.js` `INICIO_CELULAR = "completo"` (padrão, o `HomeMobileCompact` da onda 2) ou `"simples"`; `?inicio=simples` compara. Deixei o completo como padrão porque o índice do pacote o chama de versão do celular e ele tem mais coisas (plano, faixa, inéditas). |
| `Sidebar` (menu do computador) | `Shell.jsx` (`Sidebar`, `SideGroup`), `shell/shell.css` | Cartão da conta com "1ª fase · Objetiva" em azul e ícone de setas; grupos em sanfona com o selo do primeiro item quando fechado (Plano de Hoje 0/2, Revisar 5 em vermelho, Arena 0/3, Tutor "IA"); **Configurações em sanfona que abre para cima** (Administração/Revisão médica conforme permissão, Meu Plano, Preferências) e Sair; um só grupo aberto por vez; ícones 26/22 px. Recolhido: só ícones com pontinho colorido do selo; tocar num grupo **abre o menu e o grupo** (como no pacote; antes abria um submenu flutuante). | **Saiu o botão grande "Perguntar ao tutor"** (o pacote não tem; o "Tutor com IA" continua no menu com o selo IA). "Preferências" leva à Conta (onde está a aparência), como antes. Itens com 44 px de altura (o pacote usa 38). O cartão da conta abre a Conta (o ícone de setas é do pacote). |
| `TabletHome` (trilho) | `Shell.jsx` (`Rail`), `shell/shell.css` | Avatar com anel, selo vermelho só no Revisar (erros a revisar), linha separando Mais e Preferências. Painel do grupo com os selos dos itens. | — |
| Cabeçalho do Início (`Home`, `TabletHome`) | `Shell.jsx` (`PageHeader`) | Tirei o botão lua/sol do cabeçalho do Início (o pacote não tem); o tema fica em Preferências e na Conta. | Nas outras telas o cabeçalho geral continua com o botão de tema (é de outras ondas). |
| Dock flutuante | — | Conferido: não existe mais em nenhuma largura. Na prévia, os únicos elementos fixos são o menu (computador), o trilho (tablet), a barra de baixo (celular) e o link "Pular para o conteúdo". `TutorDockProvider` é só o contexto da gaveta do Tutor, sem botão flutuante. | — |
| Faixa de números do Início (pedido extra do dono) | `home/HomeScreen.jsx` (`kpiTiles`), `home/inicio.css` (`.ih-mkpis--wide`) | No computador e no tablet a faixa usa os MESMOS blocos do celular: Revisar (caderno com selo vermelho do número), Score (número + barrinha), acerto (anel com a %), na semana (número + "3 dias ativos"), missões (alvo) e liga (troféu). Computador e tablet numa linha; abaixo de 760 px vira 3 colunas. | Missões, liga/ranking e Score só com a Arena ligada (com ela desligada ficam 3 blocos). Rótulos iguais aos do celular ("Score", "acerto", "na semana"), não os longos de antes ("Stazia Score", "acurácia", "itens na semana"). Antes/depois: `faixa-web-antes.png` / `faixa-web-depois.png` (e tablet, escuro, celular, Arena desligada). |

## 2. Selo do Revisar e os outros selos (dados reais)

- `shell/useShellCounts.js` pergunta ao banco, uma vez por minuto no máximo: `app_today` (Plano de Hoje feitas/total), `app_gamification_summary` (missões, Score e nível; só com a Arena ligada) e `app_home.wrong_pending` (questões erradas com situação "para revisar" no Caderno de Erros, `my_error_notebook`). Sem resposta, sem selo. Ao abrir uma sessão de questões a contagem é esquecida, para o selo vir atualizado na volta.
- Selo do **Revisar** (barra de baixo, trilho e grupo do menu) = número de questões erradas a revisar, como no pacote. O botão Revisar continua levando a Flashcards (rota `flash`, a mesma de antes), que tem o seletor para o Caderno de Erros; no menu do computador o número aparece no item "Caderno de Erros".
- Flashcards perdeu o selo no menu (o pacote não tem); a contagem de cartões a revisar continua na própria tela de Flashcards.
- Não criei função nova no banco: `app_home` já existia. Custo: uma chamada a mais de `app_home` por minuto de navegação (o Início já a chamava).

## 3. Ícones

| Onde | Pacote | App antes | Agora |
|---|---|---|---|
| Login: e-mail, cadeado, olho, check | Lucide mail, lock, eye (desenho no HTML) | os mesmos, outro traço | iguais ao pacote (desenhados no `LoginNovo`) |
| Login: Google | logotipo colorido | logotipo colorido (`/novo-assets/google.svg`, onda 5) | igual |
| Barra de baixo: Início, Questões, Revisar, Mais | casa, questão, camadas, 4 quadradinhos (assets do pacote) | iguais (onda 1/2) | iguais |
| Barra de baixo: Tutor | brilho branco em círculo roxo | brilho colorido sem círculo | TROCADO: Lucide `sparkles` branco no botão redondo roxo |
| Folha Mais: quadradinhos e Sair | assets do pacote (prancheta, trilha, cronômetro, livro, jornal, mapa, alvo, troféu, medalha, barras, pizza, calendário, pessoas, coroa, engrenagem, porta) | os mesmos (`AppIcons`, onda 2) | iguais; X de fechar = Lucide `x` |
| Menu: cartão da conta | setas para cima e para baixo | ícone "repetir" + seta para a direita | TROCADO: Lucide `chevrons-up-down` |
| Menu: Configurações | engrenagem ilustrada | (não existia; havia Meu Plano/Preferências soltos) | NOVO grupo com a engrenagem ilustrada de sempre |
| Início simples: Continuar | seta | — | Lucide `arrow-right` |
Nenhum SVG novo foi copiado para o app.

## 4. Como ver cada tela na prévia (porta 31971, `scripts/previa-novas-telas-onda2`)

Parâmetros novos: `?rota=login` (login novo; `&login=atual` mostra o de antes; senha `errada` mostra o erro, qualquer outra mostra "Acesso autorizado"), `&inicio=simples`, `&mais=pagina`. Os de antes continuam (`&tema=escuro`, `&papel=equipe|revisor`, `&arena=0`, `&semliga=1`, `&teste=1`). A largura da janela escolhe computador (acima de 1180 px), tablet (720 a 1180) ou celular (até 719).
- Login: `?rota=login` nas três larguras.
- Barra de baixo e folha Mais: `?rota=home` em largura de celular, tocar em "Mais".
- Início simples: `?rota=home&inicio=simples` em largura de celular.
- Menu do computador: `?rota=home` (Configurações: `&papel=equipe` mostra Administração; `&papel=revisor` mostra Revisão médica); botão redondo da borda recolhe/expande.
- Trilho do tablet: `?rota=home` em 834 px.
- Faixa do Início: `?rota=home` no computador ou tablet (`&arena=0` mostra a versão com 3 blocos).
Para conferir as capturas usei a mesma prévia numa porta temporária (31984) a partir deste ramo, já encerrada.

## 5. Testes e build

- Novo: `src/__tests__/novasTelasCascaFinal.test.tsx` (6 testes: configuração, selos reais, folha da 2ª fase, Início simples com e sem Arena).
- Ajustados de propósito: `loginScreen.test.tsx` (os testes de antes rodam na aparência "atual"; +5 testes da aparência nova com a mesma lógica), `menuCelularMais.test.tsx` (barra do pacote, folha Mais, Configurações, selos, recolher abre o grupo), `novasTelasOnda2.test.tsx` (faixa em blocos).
- Rodados pela fila os 103 arquivos de teste que tocam a casca, o login, o Início ou os ícones: 1.179 passaram; 1 falhou: `leva3QRodadaRevisaoTela` ("histórico fechado"), tela de revisão da Administração que simula o `Shell.jsx` e não usa nada desta mudança.
- Verificação automática na prévia (1440, 1280, 1024, 834, 390 e 320 px; Início, Plano, Login, escuro, Início simples): sem rolagem lateral, nenhum elemento flutuante além do menu/trilho/barra, alvos de toque com 44 px ou mais (o botão redondo de recolher o menu tem 28 px de desenho e 44 px de toque).
- `vite build`: ok.

## 6. O que não foi possível ou ficou para o dono decidir

- Login: as telas "Esqueci minha senha", "Nova senha" e "Criar conta" não têm desenho no pacote e continuam escuras. Se o dono quiser, dá para levá-las ao mesmo fundo azul-marinho com cartão branco.
- Início do celular: o pacote tem duas versões (`HomeMobileCompact` e `MobileMenu`). As duas estão prontas; o padrão é a completa. Trocar em `shell/cascaConfig.js`.
- "Mais" do celular: o pacote tem a folha (`MobileMais`) e a página (`HomeMais`). Padrão: folha. Trocar em `shell/cascaConfig.js`.
- O botão "Perguntar ao tutor" do menu do computador saiu (seguindo o pacote). Se o dono quiser o atalho de volta, é uma linha no `Shell.jsx`.
- "Buscar no app" segue fora (decisão do dono).
