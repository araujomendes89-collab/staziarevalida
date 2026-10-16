# Novas telas, onda 2: Início (Visão Geral), Plano de Hoje e Mais/Preferências

Data: 15/10/2026. Ramo `nt-onda2` (parte do ramo `novas-telas`, 6da5dd72). Sem push, sem publicação, sem migração, sem .env, sem IA paga.
Prévia: `npx vite --config scripts/previa-novas-telas-onda2/vite.config.mjs` (porta 31971; dados de TESTE, sem login e sem banco).
Capturas: `/Volumes/StaziaMed/.tmp-aulas/novas-telas/onda2/` (`modelo/` = pacote renderizado, `app/` = app, `lado-a-lado/` = modelo e app juntos; claro e escuro em `app/`).

## 1. Telas do pacote -> arquivos do app

| Tela do pacote | Arquivo do app | Situação |
|---|---|---|
| `Home.html` (Visão Geral, web) | `src/novo/app/home/HomeScreen.jsx` (`HomeActive`) + `inicio.css` + `parts.jsx` | feita |
| `TabletHome.html` | mesmo arquivo (mesmos componentes; a grade se adapta a 834 px) | feita |
| `HomeMobileCompact.html` | mesmo arquivo, ramo "celular" (`useLayout() === "mobile"`) | feita |
| `PlanoWeb`, `PlanoTablet`, `PlanoMobile` | `src/novo/app/home/TodayPlan.jsx` | feitas |
| `PlanoWebAberto`, `PlanoTabletAberto`, `PlanoMobileAberto` (Personalizar) | `TodayPlan.jsx` (`PersonalizeDialog`; abre por `?ajustar=1`, igual a antes) | feitas (no celular vira folha de baixo) |
| `HomeMais`, `TabletMais` (Mais) | `src/novo/app/shell/MaisPage.jsx` + `mais.css` + `maisSections` em `navModel.js` | feitas, sem a caixa "Buscar no app" |
| `HomePrefs`, `TabletPrefs` (Preferências) | `MaisPage.jsx` (`PrefsView`) | feitas |
| `MobileMais`, `MobileMenu` ("Mobile · Início" e "Mais aberto") | nenhuma tela nova | ver item 4 (versão anterior do mesmo desenho) |
| Cabeçalhos do Início e do Plano (web, tablet, celular) | `src/novo/app/Shell.jsx` (`PageHeader`, `MobileTopBar`) + `shell.css`; `App.jsx` passa `headerKind` | feitos |

`HomeMais` e `HomePrefs` (e `TabletMais`/`TabletPrefs`, e os pares Plano/PlanoAberto) são o MESMO arquivo HTML com outro estado inicial: confirmei com `diff` (só muda o `<title>`).

## 2. O que mudou (com os dados reais de sempre)

Início (aluno com 10 ou mais respostas; o estado "aluno novo" não tem modelo no pacote e ficou como era):
- Cartão azul "Continue de onde parou": anel com respondidas/total da sessão aberta (`app_home.open_session`), título e texto de antes, botão Continuar. Sem sessão aberta vira "Próximo passo" (primeira tarefa pendente) e, com tudo feito, "Tudo certo por hoje" (Montar treino).
- Faixa "Meta de hoje" (10 tracinhos) no pé do cartão: do resumo do Stazia Play (`streak.today`: questões feitas / meta e minutos). Sem o Play ligado, a faixa some.
- Cartão "Plano de hoje" (tarefas de `app_today`) com ícone por tipo, "Praticar · 40 min" e pílula Começar/Continuar/Concluída.
- Faixa de 4 números: para revisar (`wrong_pending`), Stazia Score (resumo do Play; abre "Como meu score é calculado"), acurácia, itens na semana.
- Cartão "Sua trilha" (`app_trail`, mesma escolha de etapa de antes) com as bolinhas da etapa e "Continuar".
- Cartão "Próximo tema prioritário" (primeiro de `priority_topics`, com letra e cor da área) e "Ver os N temas prioritários".
- Celular: topo com logo, fase e conta; faixa de 4 quadradinhos; plano em lista; "Para você" em carrossel (trilha, missões de hoje e Arena, só com dados reais; pontinhos indicam o cartão) e tema prioritário.

Plano de Hoje: título + botão Personalizar plano (Ajustar no celular); cartão azul "Foco de hoje" com anel de etapas, % concluído e minutos totais (soma dos minutos das tarefas); linha do tempo de etapas com a atual destacada ("Agora"), barra de progresso e botão; extra "Questões Inéditas" (contador e botão do cartão de antes, variante `plano` de `IneditasCard`); no celular, barra fixa "Etapa 1 de 2 · Começar".
Personalizar: janela com Data da prova, "Ainda não sei a data" (celular) e Tempo por dia em 4 botões (30 min leve, 1 h equilibrado, 2 h intenso, 3 h+ reta final), Esc/fundo/Cancelar fecham, o foco volta ao botão que abriu, aviso verde "Plano atualizado: ..." ao salvar. Grava no perfil e refaz o plano como antes.

Mais e Preferências (celular e tablet): página com o cartão da conta (nome, "Stazia Score N · nível" do banco, engrenagem, fase), seções Estudar, Aprender, Stazia Arena e Minha evolução em quadradinhos com o selo 0/2 (plano) e 0/3 (missões) vindos do banco, mais "Praticar e revisar" (Banco de Questões, Flashcards com a contagem, Caderno de Erros) para nada ficar sem caminho. Preferências: Sua conta (Conta, Meu Plano, Administração só para equipe, Revisão médica só para revisor), Fase, Aparência (Claro, Escuro, Do sistema) e Sair da conta. No tablet o botão do trilho "Ajustes" virou "Preferências" e abre esta página; "Mais" abre a página de Mais (antes era uma lista flutuante).

Arquivos compartilhados tocados (mudança pequena e aditiva): `Shell.jsx` (cabeçalhos novos, páginas Mais, quadradinhos do botão Mais, `useLayout` movido para `shell/useLayout.js` e reexportado), `shell.css`, `navModel.js` (`maisSections`), `App.jsx` (`headerKind`, `themeChoice`, subtítulo do Plano), `session.jsx` (`useOptionalSession`), `AppIcons.jsx` (ícones novos), `components.css` (avatar com o degradê do pacote), `IneditasCard.jsx` (variante `plano`), `plan.js` (uma frase), dois testes antigos.

## 3. Ícones (cada ícone das telas desta onda)

Comparei os 21 SVG do pacote usados nestas telas com o que o app desenha (geometria e cores, por programa) e conferi as marcas de linha à mão.

| Ícone (pacote) | Onde aparece | Antes no app | Situação |
|---|---|---|---|
| casa (`ri-house`) | Visão Geral, aba Início | igual | igual |
| prancheta com tarefas (`ri-hoje`) | Plano de Hoje (menu, Mais, janela Personalizar) | marcas azuis | TROCADO: marcas verde-azuladas (#12A79B) |
| trilha (`ri-trilha`) | Sua trilha, Minha Trilha | caminho com 3 pontos | TROCADO: estrada com pino e bandeira (novo desenho) |
| cronômetro (`ri-timer`) | Simulados | igual | igual |
| livro (`ri-book`) | Temas Essenciais, Aprender | igual | igual |
| jornal/atualização (`ri-x-newspaper`) | Diretrizes e Atualizações | igual | igual |
| mapa mental (`ri-mm`) | Mapas Mentais | rede com 5 nós | TROCADO: núcleo e 3 ramos coloridos (novo desenho) |
| alvo (`ri-x-target`) | Missões | penas azuis | TROCADO: penas verde-azuladas |
| troféu (`ri-x-trophy`) | Ranking, cartão da Arena | igual | igual |
| medalha (`ri-x-award`) | Conquistas | igual | igual |
| gráfico de barras (`ri-chart`) | Desempenho | igual | igual |
| pizza (`ri-x-chart-pie`) | Análise Inteligente | fatia azul-clara | TROCADO: fatia verde-azulada |
| calendário (`ri-calendar`) | Planejamento | igual | igual |
| pergunta (`ri-question`) | Tarefa Praticar, Banco de Questões | igual | igual |
| caderno (`ri-notebook`) | Tarefa Revisar, Revisar (celular), Caderno de Erros | igual | igual |
| camadas (`ri-layers`) | Flashcards, aba Revisar | igual | igual |
| brilhos (`ri-sparkles`) | Questões Inéditas (extra do Plano), Tutor | igual | igual |
| engrenagem (`ri-settings`) | Preferências | igual | igual |
| porta de saída (`ri-logout`) | Sair da conta | igual | igual |
| pessoas (`ri-users`) | Administração | igual | igual |
| coroa (`ri-crown`) | Meu Plano | ícone de linha (Lucide) | NOVO: coroa dourada ilustrada |

Os cinco desenhos que mudaram e a coroa nova estão em `src/novo/app/AppIconsNovasTelas.jsx`, gerados dos arquivos do pacote sem edição à mão (`AppIcons.jsx` os usa antes dos antigos). Como o menu usa o mesmo ícone, o menu da onda 1 também passa a mostrar os desenhos novos de Plano de Hoje, Minha Trilha, Mapas Mentais, Missões e Análise, e a coroa de Meu Plano.
Marcas de linha: seta para a direita, check, setas para os lados, X, engrenagem de ajustes ("sliders"), flame (agora cheia e laranja, como no pacote), bandeira da etapa (cheia, como no pacote), círculo com check do aviso "Plano atualizado". Todas são Lucide (ou o mesmo caminho do pacote desenhado no código). O ícone de busca do pacote não foi usado (sem "Buscar no app").
Logos do pacote (`21dbb425` horizontal e `f2cc5f75` símbolo): são as logos novas, tratadas pelo ramo `novas-logos`; não mexi.
Avatar: o pacote usa degradê azul com as iniciais em todos os lugares; o token `--brand-avatar-gradient` já existia desde a onda 0 e agora o avatar o usa (vale para o app todo).

## 4. Diferenças deliberadas e o que não foi possível

- **Texto "Faltam 19 · cerca de 38 min"**: o pacote estima 2 min por questão. Não existe esse dado no banco; mantive o texto de antes ("Você parou na questão N. Faltam M.", com o tempo restante só no simulado pausado). Também no pacote o anel mostra 2/20 e o texto 19: números do exemplo.
- **Dados do exemplo** (João Paulo, 383, 55%, "Coloproctologia", 74 inéditas, "+40 XP", "Cirurgia geral e trauma"): nenhum entra no app; tudo vem das funções de sempre (`app_home`, `app_today`, `app_trail`, `app_gamification_summary`, `app_my_ineditas`). Na prévia os números de teste foram escolhidos iguais aos do pacote só para comparar captura com captura.
- **Menos blocos no Início** (ver a proposta do item 6, que trouxe de volta inéditas, missões e ranking): o desenho não tem a lista de missões, o ranking semanal, as conquistas recentes nem o atalho "Questões Inéditas" que o Início tinha. Seguindo o desenho, saíram do Início (continuam em Missões, Ranking, Conquistas, Plano de Hoje e Banco de Questões; no celular a trilha, as missões e a Arena ficam no carrossel "Para você"). O dono deve confirmar.
- **Marcar tarefa como feita**: o pacote não tem a caixinha. Mantive a função no Plano de Hoje: o círculo numerado de cada etapa é o botão (marca/desmarca). No Início o toque na linha abre a tarefa.
- **Fase no celular**: o pacote usa uma pílula "1ª fase" que alterna. Mantive o seletor de duas opções (mesmo componente de antes) porque a regra atual diz "2ª Fase · Em breve" para o aluno, e a pílula esconderia isso. O logo vira só o símbolo abaixo de 370 px para caber.
- **Botão de tema no cabeçalho** (lua/sol): o pacote não tem, mas o app tinha; mantive no Início de computador e tablet. No Plano e no celular a escolha de tema fica em Preferências (Claro, Escuro, Do sistema).
- **Textos do pacote adotados**: "Você ainda não respondeu questões desta área." (antes "Você respondeu nenhuma questão desta área até agora."), "Resolver inéditas", "Ciclo diário · aprender, praticar, revisar" e as descrições leve/equilibrado/intenso/reta final. "3 h ou mais" aparece como "3 h+" nos botões e "3 h ou mais" no aviso, como no pacote.
- **Contraste**: os textos pequenos sobre o cartão azul foram clareados (pacote usa #9fd7ff e #c4dcf5, que dão cerca de 3:1; usei #e3f2ff e #e6f1fc, acima de 4,5:1). O texto cinza claro (#94a0af) do pacote segue o token terciário da onda 0 (5,3:1).
- **Alvos de toque**: a chip da sequência parece ter 32 px como no pacote, mas o toque tem 44 px (área extra invisível); linhas do plano são botões inteiros de 64 px.
- **"Mobile · Início" e "Mobile · Mais aberto" (`MobileMenu`, `MobileMais`)**: são uma versão mais simples do mesmo Início do celular (cartão "Próximo passo", Score e Meta de hoje) e uma folha "Mais" que sobe de baixo com "Trocar fase". O índice do pacote já traz a versão "Mobile compacta" e a página "Mais" completa, que são as que implementei; não construí as duas telas antigas. Se o dono preferir a folha, é só trocar a apresentação em `MaisPage.jsx` (os dados são os mesmos).
- **Barra de baixo do celular** (onda 1): o pacote põe o Tutor em botão redondo roxo no meio e a ordem Início, Questões, Tutor, Revisar, Mais; o app segue com Início, Questões, Revisar, Tutor, Mais. Também no pacote o selo de Revisar é "5" (erros a revisar) e o app mostra a contagem de flashcards. Não alterei (é da onda 1); avisar o orquestrador.
- **"Buscar no app"**: omitida, como combinado.
- Mapa do que ficou sem desenho no pacote: estado "aluno novo" do Início, estado de tarefa concluída no Plano (criei: círculo verde com check, título riscado e pílula "Concluída"), Plano sem tarefas e erros de carregamento (mantidos como eram).

## 5. Conferência

Capturas lado a lado (claro) de cada tela em `/Volumes/StaziaMed/.tmp-aulas/novas-telas/onda2/lado-a-lado/` e do app em claro e escuro em `.../onda2/app/`. Medidas conferidas contra o pacote: altura do cartão azul (271 x 273 px), faixa de números (68 x 68), cartões de trilha e tema (154 x 154), título 30 px (Início) e 32 px (Plano), 26 px no Plano do celular, janela de 600 px com raio de 28 px.
Testes: `src/__tests__/novasTelasOnda2.test.tsx` (novo, 8 testes) e ajustes em `menuCelularMais.test.tsx` e `ineditasCartaoTela.test.tsx` (texto e marcação mudaram de propósito). Falhas que já existiam no ramo `novas-telas` e não são desta onda: `ineditasPorPlanoTelas` (2), `equipeAcessoTelas` (1, data do teste grátis), `radarFilaTela` (1, procura `info.radarGraves` dentro do `Shell.jsx`).

## 6. Proposta do Início (pedido de 15/10/2026, para o dono ver na prévia)

- **Questões Inéditas** voltou ao Início como terceiro cartão da linha de baixo, ao lado de "Sua trilha" e "Próximo tema prioritário", no mesmo formato. Texto com a contagem real (`app_my_ineditas`): "74 liberadas", "20 de 74 no teste grátis" (ou "no seu plano" quando o limite é do plano pago) e, sem acesso, "74 no banco · abrem com plano ou teste grátis em dia" com o botão "Ver planos". "Resolver" abre o Banco de Questões filtrado nas inéditas (as não respondidas primeiro; "Rever" quando todas as liberadas já foram feitas). No celular o cartão entra no carrossel "Para você", ao lado da trilha.
- **Missões** viraram um número na faixa ("0/3 missões", de `app_gamification_summary.missions`); clique abre Missões. Sem missões no dia, o número não aparece.
- **Ranking semanal** virou um número na faixa: "12º · Liga Bronze" quando a liga está ligada e o aluno está nela; senão a posição no ranking semanal; fora dos dois, "Entre na liga". Clique abre o Ranking.
- Missões e ranking (e também o Stazia Score e a trilha) só aparecem com a **Stazia Arena ligada**: o mesmo interruptor que as telas da Arena usam (`boot.play.enabled`, que vem de `flags.gamification_enabled`). Observação: o menu Stazia Arena hoje aparece sempre; quem decide é esse interruptor dentro de cada tela. Com a Arena desligada, a faixa fica com **3** números (para revisar, acurácia, itens na semana), porque o Stazia Score também é da Arena e não vem do banco nesse caso.
- **Conquistas recentes** continuam fora do Início.
- Faixa: até 6 itens. Computador numa linha; tablet em 3 colunas e 2 linhas; celular em quadradinhos que rolam de lado. Todos os itens clicáveis são botões com foco visível e área de toque de 44 px ou mais; claro e escuro conferidos.
- Prévia: `?rota=home` mais `&arena=0` (Arena desligada), `&semliga=1` (fora do ranking e da liga), `&teste=1` (teste grátis com 20 de 74 inéditas). Capturas em `/Volumes/StaziaMed/.tmp-aulas/novas-telas/onda2/proposta-inicio/`.
- Testes: 3 testes novos em `novasTelasOnda2.test.tsx` (cliques, "Entre na liga", teste grátis, sem acesso, Arena desligada).
