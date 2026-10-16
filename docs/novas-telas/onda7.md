# Novas telas, onda 7: Conquistas e "Medalhas e ligas — padrão 3D"

Ramo `nt-onda7` (a partir do `novas-telas` 7908185c). Sem push, sem publicação, sem migração, sem .env, sem chaves, sem IA paga.

## Como ver
Na prévia já existente `scripts/previa-novas-telas-onda2` (porta 31971), depois de juntar este ramo:
`npx vite --config scripts/previa-novas-telas-onda2/vite.config.mjs` e abrir
- `http://127.0.0.1:31971/?rota=conquistas` (computador, tablet ou celular conforme a largura da janela)
- `http://127.0.0.1:31971/?rota=medalhas` (folha "Medalhas e ligas", só existe na prévia)
- extras: `&tema=escuro`, `&arte=0` (como o app fica hoje, sem a arte 3D), `&ganhas=1` (2 medalhas de TESTE desbloqueadas, só para ver o estado colorido), `&aba=loja`, `&lojavazia=1`, `&semmoedas=1`.

Na prévia a flag `VITE_MEDALHAS_ARTE_PACOTE` está ligada (em `vite.config.mjs` da prévia). No app ela fica desligada.
Capturas: `/Volumes/StaziaMed/.tmp-aulas/novas-telas/onda7/` (`modelo/`, `app/`, `escuro/`, `lado-a-lado/` modelo à esquerda e app à direita, `arte/` prancha de legibilidade).

## Telas (pacote -> app)
| Tela do pacote | Arquivo do app | Situação |
|---|---|---|
| ConquistasWeb / Tablet / Mobile | `src/novo/app/play/AchievementsScreen.jsx`, `play/conquistas.css`, `play/Medalha.jsx`, `play/progressoMedalha.js` | feita (3 larguras, claro e escuro, com e sem a arte) |
| Medalhas.html (41 medalhas + 7 ligas) | `src/novo/app/play/MedalhasPadrao.jsx` | feita, **só na prévia** (é folha de conferência da arte, não tela do aluno; não tem rota no app) |

Arte: `src/novo/ds/medalhas-pacote/` (48 SVG do pacote com nome = slug do banco, mais `moeda.svg`), `index.js` (slug -> arquivo) e `artes.js` (endereços). **Só a prévia importa `artes.js`**; o app não importa, então o build do app não leva nenhum SVG da arte (conferido: build de 15/10 com 0 SVG em `assets/`; na primeira tentativa, com import dinâmico em ramo morto, o Vite ainda publicava 40 arquivos, por isso mudei). Flag: `medalhasArtePacote()` em `src/novo/app/features.js`. Para levar ao aluno depois da aprovação: importar `artes.js`, chamar `registrarArtesDoPacote` no início do app e ligar `VITE_MEDALHAS_ARTE_PACOTE=1`.

## O que mudou na tela Conquistas
- Abas "Medalhas (n)" e "Recompensas" sem ícone (como no pacote). Recompensas só aparece com as moedas ligadas (regra que já existia).
- Cartão "X de N medalhas" com barra e "A raridade é só visual: nenhuma vale mais no ranking." (celular: linha compacta "Raridade é só visual").
- Filtros em pílulas: Todas, Estudo, Precisão, Sequência, Áreas, Evolução, Especiais, Secretas. As secretas saíram de "Especiais" (no pacote ficam só em "Secretas").
- Ordem do pacote (Estudo, Precisão, Sequência, Áreas, Evolução, Especiais, Secretas). O banco devolve em ordem alfabética do código da categoria (Áreas primeiro); a tela reordena sem mudar o banco.
- Computador: cartões com a medalha, nome, critério, "+XP · moedas" e raridade; clicar abre a janela de detalhe (já existia; agora fecha com Esc).
- Tablet: cartão de detalhe da medalha selecionada + grade de 6 miniaturas. Celular: detalhe + grade de 4 dentro de um quadro branco, 12 primeiras e "Ver todas as 41 medalhas" / "Mostrar menos".
- Bloqueadas: desbotadas (filtro do pacote) com cadeado no canto. **Progresso real** quando o banco tem o número: questões respondidas, acerto, maior sequência e evolução (os mesmos campos de `user_gamification_stats` que `gam_check_achievements` usa para liberar, lidos de `app_gamification_summary`). O alvo é o critério semeado na migração 3800 e só vale se a descrição do banco for a semeada (se a equipe editar a medalha, aparece só o critério). Número já batido com a medalha ainda trancada: "· libera na próxima atividade" (o banco confere a cada atividade). Áreas, "Aprendeu Mesmo" e "Top 10 semanal": só o critério (o resumo não traz esses números).
- Secretas bloqueadas: "Conquista secreta / Continue estudando para descobrir." (como o banco manda); nunca critério nem progresso.
- Desbloqueadas: cor cheia e "Desbloqueada em dd/mm/aaaa". Nenhuma medalha ganha é inventada: a prévia mostra "0 de 41", igual à conta real; `&ganhas=1` é teste explícito.
- Recompensas: a loja continua (resgate com moedas, proteção de sequência, molduras). Saldo virou cartão no estilo do pacote; catálogo vazio mostra o estado do pacote "Nenhuma recompensa ainda".

## Ícones (tabela)
| Onde | Antes (app) | Agora | Estado |
|---|---|---|---|
| Aba Medalhas | Lucide `award` | sem ícone (pacote) | trocado (removido) |
| Aba Recompensas | Lucide `gift` | sem ícone (pacote) | trocado (removido) |
| Cartão "X de N medalhas" | não havia cartão | `award` ilustrado (o mesmo do menu, AppIcons) em azulejo dourado | novo |
| Cada medalha, flag desligada (app) | Lucide do banco (`footprints`, `flame`, `cog`, `zap`, `target`, `crosshair`, `graduation-cap`, `trending-up`, `brain`, `trophy`, `stethoscope`; secretas `lock`) em azulejo | o mesmo Lucide do banco, agora num selo redondo com aro da cor da raridade | igual (ícone) / moldura nova |
| Cada medalha, flag ligada (prévia) | — | SVG 3D do pacote por slug (`ds/medalhas-pacote/<slug>.svg`) | novo, só prévia |
| Cadeado no canto da bloqueada | não havia | Lucide `lock` (inline-11 do catálogo) | novo |
| Moeda ao lado do XP | Lucide `coins` (só na loja) | flag ligada: `moeda.svg` (moeda-stazia-3d do pacote); desligada: Lucide `coins` | novo/igual |
| Saldo da loja | Lucide `coins` + selo `snowflake` "x de 3 proteções" | moeda em azulejo dourado + texto "x de 3 proteções de sequência" | trocado |
| Itens da loja | Lucide do banco (`snowflake`, `circle`) | os mesmos, em azulejo azul | igual |
| Recompensas vazia | não havia | moeda 3D (flag) ou Lucide `coins` | novo |
| Folha Medalhas: ligas | Lucide do banco (`medal`, `gem`, `crown`, `trophy`) | escudos 3D do pacote (`liga-<slug>.svg`); sem arte, o Lucide na cor do token | novo, só prévia |
O pacote também define ícones por categoria (`CQSRC`, inclusive o cadeado 3D) que o próprio modelo não desenha na tela: não usei. Cabeçalho "‹ Mais / Conquistas" do celular e menu são da casca (ondas 0 a 2), não mexi.

## Ligas: pacote x banco
| Posição | Pacote (Medalhas.html) | Banco (`public.leagues`) | Arquivo | Diferença |
|---|---|---|---|---|
| 1 | Bronze | `bronze` "Bronze" (`--league-bronze` #B8732E) | `liga-bronze.svg` | nenhuma |
| 2 | Prata | `prata` "Prata" | `liga-prata.svg` | nenhuma |
| 3 | Ouro | `ouro` "Ouro" | `liga-ouro.svg` | nenhuma |
| 4 | Platina | `platina` "Platina" (#5FB3C9, azul-piscina) | `liga-platina.svg` | nome igual; arte verde-água (#5ED3C5), cor do token um pouco mais azul |
| 5 | Diamante | `diamante` "Diamante" | `liga-diamante.svg` | nenhuma |
| 6 | Elite | `elite` "Elite" (#7A4FE0 roxo) | `liga-elite.svg` | nenhuma |
| 7 | Revalida Master | `revalida_master` "Revalida Master" (`--league-master` #D63B6C rosa) | `liga-revalida_master.svg` | nome igual; arte dourada com azul, token rosa: escolher uma das duas |
Nomes e ordem do pacote batem 1 a 1 com o banco. A divergência real é com a skill `stazia-gamification-engine` (`references/ligas-arena.md`), que ainda lista Bronze, Prata, Ouro, **Safira, Rubi, Esmeralda**, Diamante (sem Platina, Elite e Revalida Master, e Diamante como 7ª). O banco e o pacote mandam; a skill precisa ser corrigida.

## Medalhas: pacote x banco
As 41 do pacote são exatamente as 41 semeadas no banco (4 Estudo, 3 Precisão, 7 Sequência, 20 Áreas, 2 Evolução, 1 Especiais, 4 Secretas), mesmos nomes, critérios, XP, moedas e raridade. As 4 secretas do pacote são medalhas genéricas com fechadura (duas azuis "rara", duas roxas "épica"); casei pela ordem do banco (Corujão e 5 da manhã raras; Sobrevivente e Imparável épicas). Medalha nova criada pela equipe sem arte cai no ícone Lucide.

## Avaliação curta da arte (diretor de arte)
```
Peça: 41 medalhas + 7 ligas + moeda (SVG vetorial, "3D" com degradês), pacote Novas telas 15/10
Origem: assets/ do pacote do dono; autor e ferramenta não identificados
Auditoria estética: aprovada com ajustes
Coerência médica: ok (símbolos genéricos: livro, alvo, chama, bisturi, estetoscópio, mamadeira, símbolo feminino); nada clínico a revisar
Estado: rascunho — pendente da rodada do diretor de arte com o dono e do direito de uso
```
- Coerência com a nova logo: boa. Azul das fitas/aros e o degradê das ligas (#0A6FD8 -> #052A5A) são os do app; as fitas das áreas usam as cores de área do app (Cirurgia laranja, GO rosa, Preventiva roxo, Clínica azul, Pediatria verde). Estilo "brilho de jogo" é mais lúdico que o resto do app, mas consistente entre as 48 peças. Divergências: Revalida Master (arte dourada x token rosa) e Platina (tom).
- Legibilidade (prancha `arte/legibilidade-48-64-96-claro-escuro.png`): 96 px ótima; 64 px símbolo claro, plaquinha de texto ("INTERNO", "1.000", "365 DIAS") no limite; **48 px a plaquinha some** (texto com ~4 px). Consequência: em 48 px Interno x Residente (mesmo aro prata "comum", mesma fita) e 7/15/30 dias ficam iguais; quem distingue é o nome embaixo. Sugestão: usar 54 px ou mais nas miniaturas (a tela usa 46–54 px nas grades e 96 px no detalhe) ou diferenciar nível por cor de aro.
- Claro x escuro: no claro, tudo bem. No escuro as cores aguentam, mas as bloqueadas (desbotadas) ficam escuras e baixas em contraste; usei desbotado mais leve no escuro e o cadeado sempre visível. Prata (liga) e aro "comum" quase somem em fundo cinza claro.
- Peso: 48 arquivos somam 220 KB (2,3 a 6,5 KB cada), ~10 KB comprimidos juntos; sem scripts, eventos, imagens embutidas nem endereços externos (conferido em teste). Carregamento preguiçoso nas imagens. Ótimo para celular.

## Perguntas sobre direito de uso (antes de ir ao aluno)
1. Quem desenhou as medalhas e ligas (pessoa, agência, ferramenta de IA)? Há contrato ou termo de cessão para o StaziaMed?
2. Se foi gerado por IA: qual ferramenta e quais termos de uso comercial dela (cessão, exclusividade, atribuição)?
3. Alguma peça foi baseada em banco de imagens ou em ícones de terceiros (Flaticon, Freepik, conjuntos pagos)? Se sim, qual licença e se permite uso em app pago e modificação.
4. O uso inclui app, site, materiais de divulgação e redes sociais? Inclui alterar cores e criar novas medalhas no mesmo estilo?
5. Há exclusividade (o autor pode vender o mesmo desenho a outro app)?
6. Precisamos citar autoria em algum lugar?
Até as respostas e a rodada do diretor de arte, a arte fica só na prévia (flag desligada no app).

## Diferenças deliberadas em relação ao modelo
- Progresso das bloqueadas (barra + texto) nos cartões e no detalhe: o pacote não mostra, o pedido exige critério e progresso reais.
- Detalhe no celular com a medalha desbotada quando bloqueada (no pacote ela aparece colorida ali, e desbotada no tablet); deixei igual nos dois para não sugerir que foi ganha.
- Imagem do detalhe no tablet com 60 px (no pacote o desenho sai encolhido para 34 px dentro da caixa de 64).
- Nomes das miniaturas com 11,5 px (pacote 10,5 px) e pílulas com 44 px no toque.
- Loja real mantida (o pacote só desenha "Nenhuma recompensa ainda"; o banco tem 3 itens semeados). O estado vazio do pacote aparece se o catálogo vier vazio.
- Folha "Medalhas e ligas" mostra todas em cor cheia (é folha de arte), com o texto do pacote e os números do banco; ligas só aparecem se `app_league_current` devolver a lista (liga ligada).

## O que não foi possível (e por quê)
- Progresso das 20 medalhas de Áreas, "Aprendeu Mesmo" e "Top 10 semanal": o resumo não traz esses números (acertos e cobertura de temas por área contados como o banco conta, erros superados). Exigiria a função do banco devolver o progresso. **Não criei** (sem migração). Proposta para decidir: `app_gamification_achievements` passar a devolver `criteria` (só das não secretas) e `progress`/`target` calculados com o mesmo código de `gam_check_achievements`. A tela já usa `item.criteria` se vier.
- Celebração/efeito especial nas raras (skill de gamificação): fora do pacote; não fiz.

## Testes e build
- `src/__tests__/novasTelasOnda7.test.tsx` (14): progresso real (questões, acerto, sequência, evolução, "libera na próxima atividade", sem barra quando não há número ou a descrição foi editada), 41+7 artes com arquivo, SVG estáticos, só a prévia importa `artes.js`, flag desligada por padrão, computador/tablet/celular, secretas sem critério, Recompensas vazia, moedas desligadas, Arena desligada, folha Medalhas.
- Vizinhos sem mudança e passando: `playScreens`, `novasTelasOnda2`, `novasTelasOnda5`, `celebration`, `segundaFaseEmBreve`, `admConfigEstacoesApp`, `adminPlayArenaTextos`, `aulasFechadasAoAluno`.
- `vite build` ok; 0 SVG da arte no build do app.
