# Novas telas, onda 6: Stazia Arena (Minha Trilha, Missões, Ranking e Liga)

Ramo `nt-onda6` (a partir do `novas-telas` 7908185c). Sem push, sem publicação, sem migração, sem .env, sem IA paga. Nenhuma função nova no banco.
Prévia: a mesma da onda 2, `npx vite --config scripts/previa-novas-telas-onda2/vite.config.mjs` (porta 31971; dados de TESTE, sem login e sem banco).
Rotas: `?rota=trilha`, `?rota=missoes`, `?rota=classificacao`. Estados: `&trilhaandamento=1` (etapas feitas, dominada, em andamento), `&missoesfeitas=1` (missões do dia e bônus concluídos), `&rankcheio=1` (ranking com linhas de TESTE "Aluno de teste A..."), `&liga=1` (aluno num grupo da liga), `&arena=0` (Arena desligada), `&tema=escuro`.
Capturas: `/Volumes/StaziaMed/.tmp-aulas/novas-telas/onda6/` (`modelo/` pacote, `app/` claro, `escuro/`, `estados/` estados extras, `lado-a-lado/` modelo à esquerda e app à direita).

## Telas (pacote -> arquivo do app)
| Tela do pacote (Web, Tablet, Mobile) | Arquivo do app | Situação |
|---|---|---|
| Minha Trilha (`Trilha*.html`, PDF p. 7) | `play/TrailScreen.jsx` + `play/arena.css` | feita (3 larguras, claro e escuro) |
| Missões (`Missoes*.html`, PDF p. 15) | `play/MissionsScreen.jsx` + `play/arena.css` | feita |
| Ranking e Liga (`Ranking*.html`, PDF p. 19) | `play/LeaderboardScreen.jsx` + `play/arena.css` | feita, sem a arte 3D das ligas (onda 7) |

Peças reaproveitadas da onda 5: `evolucao/ui.jsx` (azulejo pastel, ícone ilustrado, arte das áreas, `useBreakpoint`). Larguras: celular até 719 px; tablet até 1179 px (uma coluna, abas); computador a partir de 1180 px (duas colunas).
O zip antigo "Minha Trilha · Web" é a versão anterior da mesma tela (mesmo desenho, sem as pílulas de contagem); segui o pacote novo.

## O que mudou (dados de sempre)
- **Trilha** (`app_trail`, `app_start_trail_node`): pílulas de área com bolinha da cor da área e "feitas/total"; quadro "TRILHA · área" com "N de M etapas" e barra; etapas em zigue-zague (0, 64, 128, 64 px) com círculo por estado; a etapa atual (disponível ou em andamento) é o círculo azul grande com play; simulado da área no fim, com troféu em círculo tracejado enquanto bloqueado. Coluna: cartão azul "Próxima etapa · N de M", "Como funciona a trilha" (sanfona, aberta) com a legenda dos 5 estados e "Ver Grandes Temas por incidência". Tablet: uma coluna. Celular: áreas em azulejos com a arte da área, cartão azul primeiro, "Etapas da trilha" com 4 etapas + simulado e "Ver as N etapas + simulado", "Como funciona" fechado. Os textos de regra usam `goal` e `mastery_accuracy` do banco.
- **Missões** (`app_gamification_missions`): quadros "Missões de hoje" e "Missões da semana" com azulejo ilustrado, contagem "0 de 3", linhas com ícone pelo tipo da missão, barra, "+XP · moeda N"; precisão mostrada como "0% / 75%"; caixa dourada "Complete todas · +50 XP · +25 moedas" (vira "Bônus do dia garantido"); botão "Estudar agora" (abre o Banco de Questões). Celular: resumo dourado com anel, abas "Hoje 0/3 | Semana 0/5", lista compacta e "Estudar agora" preso acima da barra de abas. Missão concluída: linha verde, check e "Concluída".
- **Ranking e Liga** (`app_leaderboard`, `app_leaderboard_near_me`, `app_public_profile`, `app_league_current`): computador com Ranking e Liga da semana lado a lado; tablet e celular com abas Ranking | Liga da semana. Ranking: 7 tipos em pílulas, linha "Você ainda não aparece neste ranking." (ou sua posição, TOP, movimento e quanto falta), "RANKING · GERAL · N alunos", estado vazio com troféu, "Ninguém neste ranking ainda." e "Responder questões". Com linhas: posição (1º a 3º em círculo ouro, prata, bronze), avatar com iniciais, nome que o banco devolve, nível, acertos, sequência. "Ver perto de mim", páginas de 50 e o perfil público seguem iguais. Liga: cartão azul "ENTRE NA LIGA · Você entra na liga com o primeiro XP da semana" (no celular com os 3 números: alunos por grupo, sobem, descem) e "As N ligas" da mais alta à inicial (nomes, ícone e cor do banco: Bronze, Prata, Ouro, Platina, Diamante, Elite, Revalida Master). Dentro da liga: "Liga X · Grupo N · termina em ...", grupo com Promoção e Rebaixamento, "Sua liga" na lista e semanas anteriores.
- **Interruptor da Arena**: a mesma condição de antes (`boot.play.enabled === false` mostra o aviso) nas 3 telas; trilha e ligas também respeitam `enabled` da função e `flags.leagues`.

## Ícones (tabela)
| Onde | Pacote | Antes (app) | Agora | Estado |
|---|---|---|---|---|
| Trilha, etapa atual | play preenchido (inline-51) | Lucide play em anel | play preenchido (mesmo desenho do Lucide, com preenchimento, desenhado no código) | trocado |
| Trilha, etapa bloqueada | lock (inline-52) | Lucide lock | Lucide lock | igual |
| Trilha, em andamento / concluída / dominada | sem desenho no pacote (só legenda) | Lucide flag / check / star | os mesmos Lucide, no círculo com a cor da legenda | igual |
| Trilha, simulado da área | troféu ilustrado (`assets/8c7059de…`) | Lucide timer / lock | troféu ilustrado (AppIcons `trophy`) | trocado |
| Trilha, botão Continuar estudando | arrow-right | Lucide arrow-right | Lucide arrow-right | igual |
| Trilha, Como funciona | chevron-down (gira) | sem sanfona (selos com ícone) | Lucide chevron-down | novo |
| Trilha, Ver Grandes Temas | chevron-right | Lucide chevron-right | Lucide chevron-right | igual |
| Trilha, áreas no celular | arte das áreas (mamadeira, estetoscópio, bisturi, símbolo feminino) | bolinha colorida | arte das áreas (`ds/area-art`, onda 5) | trocado |
| Cabeçalho, sequência | flame | Lucide flame | Lucide flame (casca, não mexi) | igual |
| Missões de hoje (título) | alvo ilustrado | sem ícone | alvo ilustrado (AppIcons `target`) | novo |
| Missões da semana (título) | calendário ilustrado | sem ícone | calendário ilustrado (`calendar-days`) | novo |
| Missão "Acerte/Responda N questões" | questão ilustrada | Lucide target / file-question (do banco) | questão ilustrada (`file-question`) | trocado |
| Missão "Estude N áreas" | livro ilustrado | Lucide layers (do banco) | livro ilustrado (`book-open`) | trocado |
| Missão "Revise N erros" | caderno ilustrado | Lucide notebook-pen | caderno ilustrado (`notebook-pen`) | trocado |
| Missão "Mantenha N% de precisão" | alvo ilustrado | Lucide target | alvo ilustrado | trocado |
| Missão "Complete N simulado" | cronômetro ilustrado | Lucide timer | cronômetro ilustrado (`timer`) | trocado |
| Missão "Faça N flashcards" (não está no pacote) | — | Lucide layers | camadas ilustradas (`layers`) | trocado |
| Missão concluída | — | Lucide check | Lucide check verde | igual |
| Moedas | moeda 3D (`assets/fe45fe00…`) | texto "· 5" | moeda (`ds/icons-stazia/moeda-stazia-3d.svg`, copiada pela onda de ícones) | novo |
| Complete todas | troféu ilustrado | texto | troféu ilustrado | novo |
| Missões no celular, anel | troféu no anel | — | troféu ilustrado no anel | novo |
| Estudar agora | arrow-right | Lucide arrow-right | Lucide arrow-right | igual |
| Ranking vazio | troféu ilustrado em azulejo dourado | só texto | troféu ilustrado | novo |
| Responder questões | arrow-right | — | Lucide arrow-right | novo |
| Ranking, 1º a 3º | — | emoji 🥇🥈🥉 | número em círculo ouro/prata/bronze (cores das ligas) | trocado |
| Ranking, sequência do aluno | — | emoji 🔥 | Lucide flame | trocado |
| Ver perto de mim / páginas | — | Lucide locate, chevron-left/right | os mesmos | igual |
| Abas Ranking / Liga | sem ícone | Lucide trophy / medal | sem ícone (controle segmentado do pacote) | trocado |
| Liga, cartão azul e "As 7 ligas" | escudos 3D das ligas (`assets/09e507…` etc.) | Lucide do banco (medal, gem, crown, trophy) | Lucide do banco, em azulejo com a cor da liga | igual (arte 3D fica para a onda 7) |
| Promoção / Rebaixamento | — | caracteres ▲ ▼ | Lucide chevrons-up / chevrons-down | trocado |
Ícones do menu lateral nas capturas são da onda 1 (não mexi). Nenhum ícone de outra onda foi alterado.

## Diferenças deliberadas em relação ao modelo
- **Arte 3D das ligas** (escudos Bronze a Revalida Master): não usada (decisão 7, onda 7). No lugar, o ícone e a cor que o banco já guarda para cada liga.
- **Cabeçalho**: é o da casca (fase, título, "0 dias", tema). No celular o pacote usa "< Mais  Missões" centrado; o app segue com o cabeçalho de sempre (igual às ondas 4 e 5). "Estudar agora" fica logo abaixo do cabeçalho, à direita (o pacote o põe na linha do título, que é da casca).
- **Liga fora do grupo**: acrescentei o rótulo "ENTRE NA LIGA" acima do título (pedido do orquestrador). Os números 30 / 5 / 5 vêm da função quando ela os devolve; fora da liga a função não manda, então usa os mesmos valores padrão que o app já escrevia.
- **Estados sem desenho no pacote** (o pacote só mostra tudo bloqueado e tudo zerado): em andamento, concluída e dominada usam as cores da própria legenda do pacote; missão concluída em verde; aluno no ranking em linha azul; grupo da liga com as linhas de promoção e rebaixamento de antes.
- **Etapa "Pediatria" do pacote**: o nome de cada etapa vem do banco; o pacote mostra o que o banco devolve hoje para a conta do dono.
- **Celular da trilha**: mostra 4 etapas a partir da anterior à atual (no pacote a atual é a primeira), mais o simulado.
- **Alvos de toque**: pílulas e abas com 44 px no toque (com mouse, as pílulas do ranking ficam com 40 px como no pacote). Claro e escuro derivados dos tokens.
- **Dados de exemplo do pacote** (João Paulo, "0 alunos", 129 no banco etc.) não entram: tudo vem das funções. Na prévia, os dados de teste imitam o pacote só para comparar captura com captura; as linhas de ranking da prévia chamam "Aluno de teste A..." e só aparecem com `&rankcheio=1` ou `&liga=1`.

## O que não foi possível
- Medalhas e escudos 3D: onda 7.
- Cabeçalho no estilo do pacote no celular ("< Mais"): é da casca (ramo da casca final), não desta onda.

## Testes
`src/__tests__/novasTelasOnda6.test.tsx` (novo, 10 testes: computador e celular das 3 telas, Arena desligada, ligas desligadas, ranking vazio sem ninguém inventado e sem emoji, liga com grupo). Ajustado `playScreens.test.tsx` (título da próxima etapa virou h2; no computador a liga fica ao lado, sem aba). Rodados também: novasTelasOnda2, novasTelasOnda5, segundaFaseEmBreve, admConfigEstacoesApp (todos passam). Build `vite build`: ok.
Verificação automática (Playwright) nas 3 rotas, 3 larguras, claro e escuro e estados: sem rolagem horizontal, sem erro no console; único alvo menor que 44 px são as pílulas do ranking com mouse (40 px, de propósito).
