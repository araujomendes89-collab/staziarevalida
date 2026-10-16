# Novas telas, onda 5: Desempenho, Análise Inteligente, Planejamento, Conta, Meu plano e Login

Ramo `nt-onda5` (a partir do `novas-telas` 6da5dd72). Sem push, sem publicação, sem migração, sem chaves, sem IA paga.
Prévia (dados de TESTE, sem banco): `npx vite --config scripts/previa-onda5/vite.config.mjs`, porta 31974.
Parâmetros: `?rota=desempenho|analise|plano|perfil|planos|login  &tema=escuro  &papel=aluno|equipe`.
Capturas: `/Volumes/StaziaMed/.tmp-aulas/novas-telas/onda5/` (`modelo/` pacote, `antes/` app antigo, `app/` app novo claro, `escuro/`, `lado-a-lado/` modelo à esquerda e app à direita).

## Telas (pacote -> arquivo do app)
| Tela do pacote (Web, Tablet, Mobile) | Arquivo do app | Situação |
|---|---|---|
| Desempenho | `review/PerformanceScreen.jsx`, `review/ErrorProfile.jsx`, `review/desempenho.css` | feita (3 larguras, claro e escuro) |
| Análise Inteligente | `tutor/ReportScreen.jsx`, `tutor/analise.css` | feita |
| Planejamento | `home/PlanningScreen.jsx`, `home/planejamento.css` | feita |
| Minha conta | `account/AccountScreen.jsx`, `account/account.css` | feita |
| Meu plano | `plan/PlansScreen.jsx`, `plan/planos.css` | feita |
| Login | `auth/LoginScreen.jsx` | **só o logotipo do Google** (ver "Decisão pendente") |

Peças novas: `evolucao/ui.jsx` (azulejo pastel, arte das áreas, `useBreakpoint`), `evolucao/evolucao.css`, `ds/area-art/*.svg` (arte das 5 áreas, do pacote), `ds/ilustracoes/*.svg` (coroa, cadeado, privacidade, do pacote).
Larguras: celular até 719 px, tablet/computador desenho largo; na Conta o computador (lista ao lado) começa em 1180 px.

## O que mudou
- Desempenho: 4 azulejos com ícone ilustrado; gráfico com área, rótulo do meio e eixo 12 px; "Por grande área" com arte da área, "67% · 3q" e barra; botão roxo "Me teste nos pontos fracos" (variante nova `roxo` do `TutorButton`; a IA já existia); "Por que você erra" e "Pontos para reforçar" em dois quadros (todo o conteúdo de antes continua: tipos de erro, motivos declarados, armadilhas, botão Reforçar). Celular: anel de acurácia, linhas de resumo e abas Evolução / Por área / Erros.
- Análise: "Meu relatório" em 3 azulejos; domínio por área (áreas sem resposta por último, nível em selo); aviso de maior risco com o NOME da área ("Gineco & Obstetrícia", antes saía minúsculo e sem acento); Evolução, Revisões e "Com o Tutor"; "Feita pelo Tutor". "O Tutor percebeu", erros que se repetem e temas críticos continuam (só aparecem se o banco devolver). Celular: cartão roxo + abas Por área / Evolução / Tutor.
- Planejamento: cartão azul "Até a prova", calendário de segunda a domingo, sete cartões da semana com barra e "Hoje · Plano n/m"; celular: fita de dias tocável com o resumo do dia. Tudo de `app_planning` e `app_today`.
- Conta: cartão do perfil com avatar em degradê e selos, faixa azul-marinho da administração (só equipe), lista de seções com ícones (computador), pílulas (tablet), sanfona (celular, abre o formulário dentro da lista). "Seu plano", aviso de bloqueio e benefícios Elite mantidos. Títulos "Minha conta" e "Meu plano" (como no pacote).
- Meu plano: continua só informativo (sem preço, sem assinar); cartão "Sua situação", planos em cartões (computador/tablet) ou lista (celular), itens com ícone (microfone para voz do Tutor).
- Login: o logotipo do Google passou de um "G" de texto para o logotipo colorido.

## Ícones (tabela)
| Onde | Antes (app) | Agora | Estado |
|---|---|---|---|
| Desempenho, Acurácia | Lucide target | alvo ilustrado (AppIcons `target`) | trocado |
| Desempenho, Questões | sem ícone | questão ilustrada (`file-question`) | novo |
| Desempenho, Simulados | Lucide timer | prancheta ilustrada (`clipboard-list`) | trocado |
| Desempenho, Tempo por questão | Lucide clock | cronômetro ilustrado (`timer`) | trocado |
| Desempenho, áreas | só a barra | estetoscópio, bisturi, símbolo feminino, mamadeira, escudo (`ds/area-art`) | novo (SVG do pacote) |
| Desempenho, Por que você erra / Pontos para reforçar | sem ícone | caderno (`notebook-pen`) / alvo | novo |
| Desempenho, Me teste | Lucide sparkles | Lucide sparkles, botão roxo | igual |
| Análise, Sessões / De estudo / Questões discutidas | sem ícone | brilho / cronômetro / questão ilustrados | novo |
| Análise, Revisões / Com o Tutor / Feita pelo Tutor | sem ícone | camadas ilustradas / Lucide sparkles em azulejo roxo / brilho ilustrado | novo |
| Análise, aviso de risco | texto | Lucide triangle-alert | novo |
| Análise, rodapé | sem ícone | Lucide info | novo |
| Planejamento, cartão azul | sem ícone | calendário ilustrado (`calendar-days`) | novo |
| Planejamento, botão | Lucide sliders-horizontal | Lucide arrow-right | trocado |
| Planejamento, calendário | Lucide calendar + chevrons | só chevrons (Lucide) | trocado |
| Conta, seções | Lucide user, trophy, graduation-cap, shield-check, file-lock, life-buoy | usuários, troféu, calendário, cadeado, privacidade, pergunta (ilustrados; cadeado e privacidade são SVG do pacote) | trocados |
| Conta, Sair / Ver os planos / Administração | Lucide log-out, crown, shield-check | saída, coroa (SVG do pacote), engrenagem ilustradas | trocados |
| Conta, aparência | sem ícone | Lucide sun, moon, monitor | novo |
| Meu plano, planos | sem ícone | lista de tarefas, brilho, coroa (ilustrados) | novo |
| Meu plano, itens | marcador de lista | Lucide mic, clipboard-check, check | trocado |
| Meu plano, voltar | Lucide arrow-left | Lucide chevron-left | trocado |
| Login, Google | letra "G" | `public/novo-assets/google.svg` colorido | trocado |
Ícones do menu lateral nas capturas são da onda 1 (não mexi).

## Diferenças deliberadas em relação ao modelo
- Contraste: kicker e textos pequenos dos cartões azuis em branco ou azul bem claro, e roxo inicial #7A58EE (no pacote #8B6CF6), para chegar a 4,5:1.
- Alvos de toque de 44 px (controle segmentado, campos da Conta de 48 px, botões de mês).
- Planejamento: setas de mês mantidas (o banco só marca o mês atual; outros meses aparecem sem pontos).
- Desempenho: "Tempo por questão" sem a legenda "média respondendo" (o pacote não tem); texto de "Por que você erra" no formato curto do pacote.
- Conta: o texto de apoio das seções é o do app (o do pacote é só a primeira seção de exemplo); e-mail aparece como campo somente leitura (não cinza).
- Claro e escuro derivados dos tokens (o pacote não tem escuro).
- Dados de exemplo do pacote (nome, e-mail, 383 pontos, contagens) não entram: tudo vem das funções que o app já chama.

## Decisão pendente do dono (Login)
O Login do pacote NÃO é igual ao que está no ar. No ar: fundo escuro verde-água/roxo, título "Acesso seguro REVALIDA", escudo animado, botão em degradê verde-água. No pacote: fundo azul-marinho, frase "Foco no que cai. Memória no que fica. Confiança na prova." à esquerda, cartão branco à direita com selo "ACESSO SEGURO · REVALIDA", botão azul, etapas 1-2-3 ao lado (computador) ou no topo (celular), placeholder "Sua senha". Seguindo a instrução (manter a arte aprovada), NÃO troquei a arte; vejam `lado-a-lado/Login-*`. Se o dono quiser o login novo, é um trabalho à parte (CSS e marcação do `LoginScreen`, mantendo a lógica e os testes).

## O que o app já tem e o que falta
- Planejamento e Desempenho usam `app_planning`, `app_today`, `app_performance`, `app_error_profile`, `app_error_reasons`: nenhuma função nova.
- Análise usa `app_tutor_report` com o portão do Tutor de sempre (aceite, Tutor ligado, plano); nada de IA nova, nada de administração ao aluno (faixa de administração só para equipe).
- Faltaria função nova apenas para: marcar dias de estudo em outros meses no calendário, e "dificuldade" (decisão 8, fora desta onda).

## Testes
`src/__tests__/novasTelasOnda5.test.tsx` (9 testes, computador e celular); ajustado `nexusOutrasTelas.test.tsx` (resumo agora em azulejos). Rodados também: planos*, equipeAcesso, contaTermo, correcoesAcesso, suporte, loginScreen, segundaFaseEmBreve, menuCelularMais. Falha que já existia antes da onda: `equipeAcessoTelas > aluno: continua vendo até quando vai o teste grátis` (data fixa 13/10/2026 já passou). Build `vite build`: ok.
Verificações automáticas nas 5 rotas, 3 larguras, claro e escuro: sem rolagem horizontal, sem erro no console, alvos >= 44 px.
