# Auditoria de ícones das novas telas (onda de ícones, ramo nt-icones)

Data: 15/10/2026. Catálogo de TODOS os ícones dos 66 HTML da Fase 1, dos 30 da Parte 2 e do PDF (32 páginas; as páginas são as mesmas telas dos HTML, conferido em miniaturas). Nenhuma tela do app foi alterada: as ondas 2 a 5 aplicam. Dados lidos: `docs/novas-telas/icones.json` (máquina) e esta página (pessoas).

## Como foi feito
- Cada HTML foi aberto num navegador de prévia (Playwright, larguras 1280 / 834 / 390) e todos os `<svg>` e `<img>` renderizados foram coletados com o texto do botão ao lado; depois cruzado com o código-fonte (para estados não visíveis). Resultado: 678 SVG inline (62 desenhos distintos, 46 de linha 24 px), 1.310 `<img>` (81 SVG ilustrados distintos de `assets/` + 2 PNG de logotipo). Não há emoji nem ícone em fonte.
- Lucide: versão `lucide-static@0.468.0` (1.544 ícones, a mesma do app). Nome equivalente conferido contra os arquivos da pasta (campo "existe no Lucide").
- "App hoje" = o ícone que o código atual de `src/novo/app` e `src/novo/ds` usa no mesmo lugar (arquivo e linha indicados). Coluna "Confiança": **conferido** = li o código naquele ponto; **provável** = deduzido pelo rótulo/família de ícone, a onda que aplicar deve rechecar na própria tela.
- Ilustrados 3D: comparei as formas do SVG do pacote com o ícone renderizado do app (`RealIcons.jsx` e `AppIcons.jsx`), elemento por elemento.

## Resumo
- Ícones de linha: 46. Ilustrados 3D: 33. Gráficos/marca: 16 (anéis de progresso, gráfico de linha, logotipo Google). Medalhas e ligas 3D: 48. Logotipos PNG: 2.
- Status (linha + ilustrados): **igual 47**, **trocado 6**, **novo 12**, **sem equivalente no Lucide 14**.
- Arquivos copiados para `src/novo/ds/icons-stazia/` (17), índice em `index.json` da mesma pasta: cadeado-3d.svg, route-pacote.svg, documento-privacidade-3d.svg, escudo-mais-3d.svg, simbolo-feminino-coracao-3d.svg, bisturi-3d.svg, coroa-3d.svg, chama-sequencia-3d.svg, network-pacote.svg, estetoscopio-3d.svg, blocos-areas-3d.svg, mamadeira-3d.svg, moeda-stazia-3d.svg, cerebro-3d.svg, grade-colorida-mais.svg, dado-aleatorio.svg, google-g.svg. Os `*-pacote.svg` são os dois ilustrados cujo desenho difere do app (Trilha e Mapas).
- Achados importantes: (1) o pacote desenha os ícones de linha com traço próprio (cantos mais redondos, `stroke-width` 2 a 2,8): 21 deles são variantes visuais de um ícone Lucide existente; use o Lucide do app, não o desenho do pacote. (2) O estilo "preenchido" de play e bandeira não existe no Lucide (é o mesmo ícone com `fill`). (3) O menu ilustrado do pacote é o mesmo conjunto 3D que o app já tem, quase todos idênticos; só Trilha (route) e Mapas (network) mudaram de desenho.
- Prévia navegável (antes x depois, 16/20/24 px, claro e escuro): `node scripts/previa-icones/server.mjs` e abrir http://127.0.0.1:31985/ (a porta 31975 já estava ocupada por outro servidor, de outro agente; por isso 31985).

## 1. Ícones de linha (24 px)
Status: igual = o app já usa o mesmo ícone no lugar; trocado = o app usa outro; novo = o app hoje não tem ícone ali; sem equiv. = não existe no Lucide.

| ID | Ícone (Lucide) | Desenho | Telas do pacote | Onde (rótulo no pacote) | App hoje | Status | Confiança | Nota |
|---|---|---|---|---|---|---|---|---|
| inline-00 | chevron-left | igual | 31 (AnaliseMobile, ConquistasMobile, ContaMobile…) | Voltar para Mais / Mais | `chevron-left` app/Shell.jsx (voltar do Mais) | igual | provável |  |
| inline-01 | info | igual | 25 (AnaliseMobile, AnaliseTablet, AnaliseWeb…) | Não há previsão de aprovação / Modelo de cartão — o sistema | `info` app/practice/tela/QuestionSheet.jsx | igual | conferido |  |
| inline-02 | — (grade-colorida-mais) | proprio | 46 (AnaliseMobile, AnaliseTablet, BancoMobile…) | Mais | `layout-grid` app/Shell.jsx:403 (botão Mais da barra do celular) | sem equivalente no Lucide | conferido | App usa layout-grid (linha, uma cor); pacote usa grade 2x2 colorida própria. Cópia: `grade-colorida-mais.svg`. |
| inline-03 | triangle-alert | variante | 2 (AnaliseTablet, AnaliseWeb) | Área com maior risco hoje: g | app/tutor/ReportScreen.jsx:76 ("Área com maior risco hoje") hoje sem ícone | novo | conferido |  |
| inline-04 | chevrons-up-down | igual | 28 (AnaliseWeb, BancoMobile, BancoWeb…) | JP João Paulo Mendes 1ª fase / Trocar fase | `repeat` app/Shell.jsx:117 (troca de fase) | trocado | conferido | Pacote: chevrons-up-down; app: repeat. |
| inline-05 | chevron-right | igual | 38 (AnaliseWeb, BancoWeb, ConquistasWeb…) | Minha jornada 0/2 / Aprender | `chevron-right` app/play/TrailScreen.jsx, app/plan/PlansScreen.jsx:44 | igual | conferido |  |
| inline-07 | play | variante | 3 (BancoMobile, BancoTablet, BancoWeb) | 20 questões · Todas as áreas / 50 questões · Todas as áreas | Histórico de treinos (Banco) hoje sem ícone de play | novo | provável | Versão preenchida (fill) do play. |
| inline-08 | search | variante | 22 (BancoMobile, BancoTablet, BancoWeb…) | Tema ou assunto (opcional) P / Buscar tema, conduta, fármac | `search` app/study/UpdatesScreen.jsx, prototype/Study1.jsx | igual | conferido |  |
| inline-09 | chevron-down | igual | 17 (BancoMobile, BancoTablet, BancoWeb…) | Prova / ediçãoTodas as prova / StatusNão resolvidasTodasErr | `chevron-down` prototype/Skeleton.jsx, selects do app | igual | provável |  |
| inline-10 | arrow-right | igual | 36 (BancoTablet, BancoWeb, ContaTablet…) | Começar treino / Abrir administração | `arrow-right` app/plan/PlansScreen.jsx:164, app/home/HomeScreen.jsx | igual | conferido |  |
| inline-11 | lock | variante | 6 (ConquistasMobile, ConquistasTablet, ConquistasWeb…) | Primeiros Passos / Aquecendo os Motores | `lock` app/plan/PlansScreen.jsx:62, app/practice/PracticeSession.jsx (bloqueado) | igual | provável | Trilha: etapas bloqueadas; app usa arte própria na Trilha. |
| inline-12 | sun | variante | 2 (ContaTablet, ContaWeb) | Claro | `sun` app/Shell.jsx (alternar tema) | igual | conferido | Conta > Aparência hoje só tem texto (Claro/Escuro/Do sistema), sem ícone. |
| inline-13 | moon | variante | 2 (ContaTablet, ContaWeb) | Escuro | `moon` app/Shell.jsx (alternar tema) | igual | conferido | Conta > Aparência hoje só tem texto. |
| inline-14 | monitor | variante | 2 (ContaTablet, ContaWeb) | Do sistema | Conta > Aparência > Do sistema (hoje sem ícone) | novo | conferido | monitor não é usado em nenhum lugar do app. |
| inline-19 | flame | igual | 7 (Home, HomeMobileCompact, MobileMais…) | 0 dias | `flame` app/Shell.jsx (sequência) | igual | conferido |  |
| inline-21 | check | igual | 3 (Home, HomeMobileCompact, TabletHome) | Sua trilhaColoproctologia Ci | Home/Trilha "Sua trilha" (etapa feita) | novo | provável |  |
| inline-22 | flag | variante | 3 (Home, HomeMobileCompact, TabletHome) | Sua trilhaColoproctologia Ci | Home/Trilha "Sua trilha" (bandeira de chegada, preenchida) | novo | provável |  |
| inline-25 | lock | variante | 3 (LoginMobile, LoginTablet, LoginWeb) | Acesso seguro · Revalida / Senha | Login: campo Senha (app usa classes lg-* sem Lucide) | novo | conferido |  |
| inline-26 | mail | igual | 3 (LoginMobile, LoginTablet, LoginWeb) | E-mail | Login: campo E-mail | novo | conferido |  |
| inline-27 | eye | variante | 3 (LoginMobile, LoginTablet, LoginWeb) | Mostrar senha | `eye` app/ds/components/forms/TextField.jsx (mostrar senha) | igual | conferido |  |
| inline-30 | timer | variante | 4 (Main, Respondida, TabletQuestao…) | Tempo restante do simulado 5 | `timer` app/plan/PlansScreen.jsx:62; relógio da sessão usa anel + role=timer | igual | provável |  |
| inline-31 | pause | igual | 4 (Main, Respondida, TabletQuestao…) | Pausar simulado | `pause` app/practice/tela/QuestionHeader.jsx:95 | igual | conferido |  |
| inline-32 | lightbulb | igual | 4 (Main, Respondida, TabletQuestao…) | Travou? Peça uma dica ao Tut | `lightbulb` app/practice/tela/TutorHint.jsx | igual | conferido |  |
| inline-33 | strikethrough | igual | 4 (Main, Respondida, TabletQuestao…) | Riscar alternativa A / Riscar alternativa B | `strikethrough` app/practice/tela/QuestionSheet.jsx:106 | igual | conferido |  |
| inline-34 | bookmark | igual | 4 (Main, Respondida, TabletQuestao…) | Marcar para revisão | `bookmark` app/practice/tela/QuestionSheet.jsx:127 | igual | conferido |  |
| inline-35 | skip-forward | igual | 2 (Main, Respondida) | Pular | `skip-forward` app/practice/tela/QuestionSheet.jsx:138 | igual | conferido | Só no treino (simulado não tem Pular, decisão 5). |
| inline-36 | flag | igual | 4 (Main, Respondida, TabletQuestao…) | Encontrou algum erro nesta q | `flag` app/practice/tela/QuestionSheet.jsx (Encontrou algum erro) | igual | conferido |  |
| inline-37 | mic | variante | 3 (MeuPlanoMobile, MeuPlanoTablet, MeuPlanoWeb) | Voz do Tutor: até 60 minutos | Meu plano: "Voz do Tutor" (app/plan/PlansScreen.jsx:15 sem ícone) | novo | conferido |  |
| inline-39 | settings-2 | igual | 6 (PlanoMobile, PlanoMobileAberto, PlanoTablet…) | Personalizar plano | `sliders-horizontal` app/home/TodayPlan.jsx (Personalizar plano) | trocado | conferido | Pacote: settings-2; app: sliders-horizontal. |
| inline-43 | circle-alert | igual | 4 (Main, Respondida, TabletQuestao…) | B Somente se a paciente auto | `circle-alert` app/practice/tela/QuestionSheet.jsx | igual | provável |  |
| inline-44 | circle-check | igual | 10 (Main, PlanoMobile, PlanoMobileAberto…) | C Imediata, em até 24 horas, | `circle-check` app/practice/Correction.jsx, app/practice/tela/QuestionSheet.jsx | igual | conferido |  |
| inline-45 | shield | igual | 4 (Main, Respondida, TabletQuestao…) | Área e tema Preventiva / MFC | `shield-check` app/study/UpdatesScreen.jsx, app/account/AccountScreen.jsx | trocado | provável | Pacote: shield simples (selo de Preventiva/MFC). |
| inline-46 | file-text | variante | 4 (Main, Respondida, TabletQuestao…) | Lista Nacional de Notificaçã | `file-text` app/practice/Correction.jsx | igual | provável |  |
| inline-47 | book-open | variante | 4 (Main, Respondida, TabletQuestao…) | Diretrizes de atenção à saúd | `book-open` app/shell/navModel.js (Temas) | igual | provável |  |
| inline-48 | sparkle | igual | 4 (Main, Respondida, TabletQuestao…) | Discutir com o Tutor | `sparkles` app/tutor/TutorDrawer.jsx ("Discutir com o Tutor") | trocado | conferido | Pacote: sparkle (uma estrela); app: sparkles (três). |
| inline-49 | layers | variante | 4 (Main, Respondida, TabletQuestao…) | Criar flashcard | `layers` app/practice/Correction.jsx:135 (Criar flashcard) | igual | conferido |  |
| inline-50 | x | variante | 13 (MobileMais, MobileMenu, PlanoMobile…) | Encerrar simulado / Remover estação | `x` app/practice/tela/QuestionHeader.jsx, app/study/TemaAula.jsx | igual | provável | Encerrar simulado: app usa square em PracticeSession. |
| inline-51 | play | variante | 3 (TrilhaMobile, TrilhaTablet, TrilhaWeb) | Pediatria Disponível · 0/10  | Trilha/Temas: botão de abrir tema (preenchido) | novo | provável |  |
| inline-52 | lock | variante | 3 (TrilhaMobile, TrilhaTablet, TrilhaWeb) | Neonatologia Bloqueada · 0/1 / Cirurgia pediátrica Bloquead | `lock` app/plan/PlansScreen.jsx:62 | igual | provável |  |
| inline-53 | arrow-left | igual | 3 (P2:DuplaMobile, P2:DuplaTablet, P2:DuplaWeb) | Pular | `arrow-left` app/practice/tela/QuestionSheet.jsx, app/tutor/ReportScreen.jsx | igual | conferido |  |
| inline-54 | video | variante | 3 (P2:SalaAndamentoMobile, P2:SalaAndamentoTablet, P2:SalaAndamentoWeb) | Chamada | 2ª fase (sala): Chamada; sem tela no app | novo | provável |  |
| inline-56 | eye-off | variante | 3 (P2:SalaConfigMobile, P2:SalaConfigTablet, P2:SalaConfigWeb) | O candidato não vê | 2ª fase (sala): "O candidato não vê"; sem tela no app | novo | provável |  |
| inline-57 | — (dado-aleatorio) | proprio | 3 (P2:SalaPapeisMobile, P2:SalaPapeisTablet, P2:SalaPapeisWeb) | Sortear | 2ª fase: Sortear; sem tela no app | sem equivalente no Lucide | provável | Mais próximo no Lucide: dice-5 (não usado no app). Cópia: `dado-aleatorio.svg`. |
| inline-59 | play | variante | 4 (Main, Respondida, TabletQuestao…) | — | Simulado/Home: play preenchido pequeno | novo | provável |  |
| inline-60 | x | igual | 4 (Main, Respondida, TabletQuestao…) | — | `x` app/practice/tela/QuestionHeader.jsx:41 | igual | conferido |  |
| inline-61 | clock | igual | 4 (Main, Respondida, TabletQuestao…) | — | `clock` app/practice/Correction.jsx | igual | provável |  |

Desenho: **igual** = geometria idêntica ao Lucide; **variante** = mesmo conceito com traço/arredondamento do pacote; **proprio** = sem Lucide.

## 2. Ícones ilustrados 3D (menu, áreas, conquistas)

| Arquivo do pacote | Nome | Uso no pacote | Telas | App tem (chave) | Status | Cópia |
|---|---|---|---|---|---|---|
| assets/76994254ad94cd392024ecb730f85344.svg | question | Praticar / Banco de Questões | 70 | question | igual (100%) | — |
| assets/7875599ab4d05101fd9547ad5c2e98ee.svg | target | Missões / Precisão | 11 | target | igual (100%) | — |
| assets/084c9d6caaf5e0e5e478ce9b47bba720.svg | book | Aprender / Temas | 47 | book | igual (100%) | — |
| assets/090541c7bb626d5a7dbca37f768e6c97.svg | cadeado-3d | Conquistas secretas / bloqueado | 3 | não | sem equivalente no Lucide | `cadeado-3d.svg` |
| assets/12a150a94ce88bc428606d574ccb3bd9.svg | logout | Sair | 26 | logout | igual (100%) | — |
| assets/19ef38ef92bc30c80d5bb41f5a88982b.svg | award | Conquistas | 9 | award | igual (100%) | — |
| assets/3a4ddccaac7606a28e9c7751ef8b48ea.svg | settings | Preferências / engrenagem | 46 | settings | igual (100%) | — |
| assets/3ea8744d3a42f21b7134d4194c635a6f.svg | notebook | Caderno de Erros | 14 | notebook | igual (100%) | — |
| assets/5f6b1bd1c9a9918659bc219f216231aa.svg | route | Minha Trilha | 11 | route | trocado (0%) | `route-pacote.svg` |
| assets/6d914983adf5100b67c8ddb7003532b1.svg | documento-privacidade-3d | Privacidade e dados | 3 | não | sem equivalente no Lucide | `documento-privacidade-3d.svg` |
| assets/6f77b95f59abbeb652ba8bcf5843f57b.svg | escudo-mais-3d | Área Preventiva / MFC | 17 | não | sem equivalente no Lucide | `escudo-mais-3d.svg` |
| assets/71b3b57d6fa2e4eb213fbf88ab8827f8.svg | simbolo-feminino-coracao-3d | Área Ginecologia e Obstetrícia | 25 | não | sem equivalente no Lucide | `simbolo-feminino-coracao-3d.svg` |
| assets/74762ca693c0a0122580391fccfd429f.svg | house | Minha jornada / Visão Geral | 67 | house | igual (100%) | — |
| assets/8ba5e3cf1c7485393022bf83a864622f.svg | bisturi-3d | Área Cirurgia | 22 | não | sem equivalente no Lucide | `bisturi-3d.svg` |
| assets/8c7059de2084b759b93f2a7cd808eaf5.svg | trophy | Stazia Arena / Ranking | 51 | trophy | igual (100%) | — |
| assets/9136fe24cc4226893a4d59458e329dcf.svg | clipboard | Estações / lista | 10 | clipboard | igual (100%) | — |
| assets/97853c26ddc6ae8444046bd199fef0e5.svg | hoje | Plano de Hoje | 12 | hoje | igual (100%) | — |
| assets/c2bada8661bc03acb17302174afae146.svg | coroa-3d | Plano Pro / Ver os planos | 6 | não | sem equivalente no Lucide | `coroa-3d.svg` |
| assets/c4df75e4d2a93e7f3cb9f6b7fdf38f75.svg | calendar | Planejamento | 14 | calendar | igual (100%) | — |
| assets/c50e7bdeecc105ce7aac9d38de15ccfd.svg | chama-sequencia-3d | Sequência de dias | 0 | não | sem equivalente no Lucide | `chama-sequencia-3d.svg` |
| assets/c7359ebd1f72d9b317af431bd48314b4.svg | sparkles | Tutor com IA | 67 | sparkles | igual (100%) | — |
| assets/cab441cd0e1bfc95d69006515cea6940.svg | chart-pie | Análise Inteligente | 7 | chart-pie | igual (100%) | — |
| assets/ccd29c4d99a55ff157166f0a4ee42797.svg | layers | Revisar / Flashcards | 67 | layers | igual (100%) | — |
| assets/cd9195c1eab1a6f44e18210af13f1903.svg | network | Mapas Mentais | 8 | network | trocado (0%) | `network-pacote.svg` |
| assets/d00d226f8d923cd833b5cfd14107f3bb.svg | timer | Simulados | 18 | timer | igual (100%) | — |
| assets/e538387d6e32d0010e589fc8bcfc9e3c.svg | chart | Minha evolução / Desempenho | 45 | chart | igual (100%) | — |
| assets/e65a7a62f94d53c4a6981e6a232e1f09.svg | users | Dupla / Estudo em dupla | 6 | users | igual (100%) | — |
| assets/e807cdfe8b316a6af9a683c8539f4fd7.svg | estetoscopio-3d | Área Clínica Médica | 28 | não | sem equivalente no Lucide | `estetoscopio-3d.svg` |
| assets/ef639e823b406566450a915a3eb57896.svg | blocos-areas-3d | Áreas (todas) | 16 | não | sem equivalente no Lucide | `blocos-areas-3d.svg` |
| assets/f10824d2812ad42bf89d98f4a4119c57.svg | mamadeira-3d | Área Pediatria | 22 | não | sem equivalente no Lucide | `mamadeira-3d.svg` |
| assets/f248223347d2eb4ef9f750fc71a4951f.svg | newspaper | Diretrizes e Atualizações | 8 | newspaper | igual (100%) | — |
| assets/fe45fe000f3808f8b3d318489d34c9bf.svg | moeda-stazia-3d | Stazia Coins / XP | 7 | não | sem equivalente no Lucide | `moeda-stazia-3d.svg` |
| assets/ad076a8bf1e51366dbb352de778cb718.svg | cerebro-3d | Saúde mental (Mapas) | 4 | não | sem equivalente no Lucide | `cerebro-3d.svg` |

As ilustrações 3D têm cores e gradientes próprios (não usam currentColor); gradientes foram renomeados com prefixo para não colidir quando vários SVG ficam na mesma página. Sem scripts nem atributos de evento. As seis das áreas (escudo-mais Preventiva/MFC, símbolo feminino com coração GO, bisturi Cirurgia, estetoscópio Clínica, mamadeira Pediatria, blocos "Áreas") são arte nova: **usar só depois de passar pelo diretor de arte** (regra do projeto para toda arte); o catálogo apenas as guarda.

## 3. Gráficos, marcas e logotipos (não são ícones de interface)
- anel-progresso-42 (undefined): Anel de progresso (componente de gráfico, não é ícone); o app já tem ProgressRing nos tokens. Telas: 3 (BancoMobile, BancoTablet, BancoWeb)
- anel-progresso-92 (undefined): Anel de progresso (componente de gráfico, não é ícone); o app já tem ProgressRing nos tokens. Telas: 1 (DesempenhoMobile)
- grafico-linha-evolucao (undefined): Gráfico de dados (não é ícone). Telas: 1 (DesempenhoMobile)
- grafico-linha-evolucao (undefined): Gráfico de dados (não é ícone). Telas: 1 (DesempenhoTablet)
- grafico-linha-evolucao (undefined): Gráfico de dados (não é ícone). Telas: 1 (DesempenhoWeb)
- anel-progresso-116 (undefined): Anel de progresso (componente de gráfico, não é ícone); o app já tem ProgressRing nos tokens. Telas: 2 (Home, TabletHome)
- anel-progresso-80 (undefined): Anel de progresso (componente de gráfico, não é ícone); o app já tem ProgressRing nos tokens. Telas: 1 (HomeMobileCompact)
- anel-progresso-34 (undefined): Anel de progresso (componente de gráfico, não é ícone); o app já tem ProgressRing nos tokens. Telas: 1 (HomeMobileCompact)
- google-g (undefined): Logotipo "G" do Google (cores oficiais da marca) no botão "Continuar com Google" do Login. Cópia: `google-g.svg`. Telas: 3 (LoginMobile, LoginTablet, LoginWeb)
- anel-progresso-44 (undefined): Anel de progresso (componente de gráfico, não é ícone); o app já tem ProgressRing nos tokens. Telas: 2 (Main, TabletQuestao)
- anel-progresso-56 (undefined): Anel de progresso (componente de gráfico, não é ícone); o app já tem ProgressRing nos tokens. Telas: 1 (MissoesMobile)
- anel-progresso-76 (undefined): Anel de progresso (componente de gráfico, não é ícone); o app já tem ProgressRing nos tokens. Telas: 2 (PlanoMobile, PlanoMobileAberto)
- anel-progresso-104 (undefined): Anel de progresso (componente de gráfico, não é ícone); o app já tem ProgressRing nos tokens. Telas: 4 (PlanoTablet, PlanoTabletAberto, PlanoWeb…)
- anel-progresso-44 (undefined): Anel de progresso (componente de gráfico, não é ícone); o app já tem ProgressRing nos tokens. Telas: 2 (Respondida, TabletRespondida)
- anel-progresso-120 (undefined): Anel de progresso (componente de gráfico, não é ícone); o app já tem ProgressRing nos tokens. Telas: 3 (P2:SalaConectandoMobile, P2:SalaConectandoTablet, P2:SalaConectandoWeb)
- anel-progresso-132 (undefined): Anel de progresso (componente de gráfico, não é ícone); o app já tem ProgressRing nos tokens. Telas: 3 (P2:SalaResultadoMobile, P2:SalaResultadoTablet, P2:SalaResultadoWeb)
- assets/21dbb425921c788ac122f2b8e229161f.png: Logotipo StaziaMed no menu (480x156). Não copiado (logotipo; as novas logos aprovadas estão no ramo novas-logos).
- assets/f2cc5f75a4ac34cdad3e6efadbeb2201.png: Logotipo StaziaMed no Login e no Mais (326x480). Não copiado (logotipo; as novas logos aprovadas estão no ramo novas-logos).

## 4. Medalhas (41) e ligas (7) em 3D, só listadas
Dependem da rodada do diretor de arte e do direito de uso (decisão 7, onda 7). **Não aplicar nem copiar agora.** Arquivos em `assets/` do pacote (Medalhas.html e Conquistas*).

| Tipo | Grupo | Nome | Arquivo do pacote |
|---|---|---|---|
| liga | Ligas da semana | Bronze | assets/09e507aca941079d93ed23b8c1263b34.svg |
| liga | Ligas da semana | Prata | assets/5383551f7372a815ee512fae28e89ad1.svg |
| liga | Ligas da semana | Ouro | assets/8710ccc81e47e3ab8a0f31a244d61474.svg |
| liga | Ligas da semana | Platina | assets/dc77700f281cf187093cda79644bbe3d.svg |
| liga | Ligas da semana | Diamante | assets/b3a06a6ec46c38970c3965cddbe114ea.svg |
| liga | Ligas da semana | Elite | assets/b574d057633a9c25b46fc846e9f3098c.svg |
| liga | Ligas da semana | Revalida Master | assets/5cd171b24baa59bb624580c9ae0acc24.svg |
| medalha | Estudo | Primeiros Passos | assets/94c1b8ab62a85e8c0328f1e06698c192.svg |
| medalha | Estudo | Aquecendo os Motores | assets/8d2652e7bc117f575b5f580cf9ec8672.svg |
| medalha | Estudo | Máquina de Questões | assets/20ec53cf21754afed42dab8ef5a85fbe.svg |
| medalha | Estudo | Insano | assets/f3a43bbcce6538edd9c87ac987397d80.svg |
| medalha | Precisão | Mira Boa | assets/ec2a505fdcf71c9080ce9b000bc84cc2.svg |
| medalha | Precisão | Atirador de Elite | assets/fefed62367991817c3d2976d0995ff11.svg |
| medalha | Precisão | Quase Banca do INEP | assets/f98c1b3f0c59427ee15e7e662a8ba324.svg |
| medalha | Sequência | 3 dias seguidos | assets/1777c45c0d43cb00a672e5d20f99ce92.svg |
| medalha | Sequência | 7 dias seguidos | assets/7fffbfcbef113a68f6903dd8ab82c282.svg |
| medalha | Sequência | 15 dias seguidos | assets/0972deecb9a72c3a770777454ae3f6e4.svg |
| medalha | Sequência | 30 dias seguidos | assets/aada686c7b2ecb2fd462ac9e5126e69c.svg |
| medalha | Sequência | 60 dias seguidos | assets/c8bdd581d91f43ab251c0c10b56502c8.svg |
| medalha | Sequência | 100 dias seguidos | assets/a4b340ac5d97f07b1db57f02accf82c2.svg |
| medalha | Sequência | Um ano inteiro | assets/d2cb7915d4ad6736b7aa97565922b2f2.svg |
| medalha | Áreas | Interno em Cirurgia | assets/ca8c797bd90187933d1e23949388d57c.svg |
| medalha | Áreas | Interno em Gineco & Obstetrícia | assets/2b0ffe84066b16d9a04bbefc6916eba9.svg |
| medalha | Áreas | Interno em Preventiva / MFC | assets/ab2fe53d15124ad452ecd658d14cf9ac.svg |
| medalha | Áreas | Interno em Clínica Médica | assets/a105b5390047c5a0b1f9ec4532751ef9.svg |
| medalha | Áreas | Interno em Pediatria | assets/dc66a81c73633b9ba8cd7b2d236c02db.svg |
| medalha | Áreas | Residente em Cirurgia | assets/52772f8224b737dca240b0eac22d9c76.svg |
| medalha | Áreas | Residente em Gineco & Obstetrícia | assets/57195e9ed692cf162fcaadd2b249283c.svg |
| medalha | Áreas | Residente em Preventiva / MFC | assets/77e1477ef623cf49ec2b913f6f574679.svg |
| medalha | Áreas | Residente em Clínica Médica | assets/2ce577cf7ff846b6985985adbedb9cba.svg |
| medalha | Áreas | Residente em Pediatria | assets/6674661eedfb20a859dc1083d63e52d4.svg |
| medalha | Áreas | Especialista em Cirurgia | assets/1a4ce6e31a045562dfb8e3bc86d51b23.svg |
| medalha | Áreas | Especialista em Gineco & Obstetrícia | assets/b64071e0fa4143bb6a9cff9a6929e2d1.svg |
| medalha | Áreas | Especialista em Preventiva / MFC | assets/221e0b831b77e5ee151dcdf4e1376fd0.svg |
| medalha | Áreas | Especialista em Clínica Médica | assets/3242946b7faac886c27001e90e54cef6.svg |
| medalha | Áreas | Especialista em Pediatria | assets/1b58a483a06c4d22498cb748c0ae7b3d.svg |
| medalha | Áreas | Mestre em Cirurgia | assets/9b11ba126bde8b0ecc84f376289ee236.svg |
| medalha | Áreas | Mestre em Gineco & Obstetrícia | assets/0cfb782ced70ce89b6cba89d6b895886.svg |
| medalha | Áreas | Mestre em Preventiva / MFC | assets/a30667a7fbf618b9bce329389d84ec13.svg |
| medalha | Áreas | Mestre em Clínica Médica | assets/1ca62ae50f8912beace80924325de0ad.svg |
| medalha | Áreas | Mestre em Pediatria | assets/59f7bef94fb3b1995b71e1b64b33bcaf.svg |
| medalha | Evolução | Virada de Jogo | assets/43ed9bac8ab1b3d06587a1f13eb939b5.svg |
| medalha | Evolução | Aprendeu Mesmo | assets/0a4066cecf35c3a6a1f48fdb6a3745f0.svg |
| medalha | Especiais | Top 10 semanal | assets/3b778008596bf840742281bd752b1d09.svg |
| medalha | Secretas | Conquista secreta | assets/6a4919ad61560a2ebb148fdce804f8e6.svg |
| medalha | Secretas | Conquista secreta | assets/e4a030ecaf31e551eecb721b9a857a74.svg |
| medalha | Secretas | Conquista secreta | assets/d487f43b27a4dfd2d8742bcfe7843429.svg |
| medalha | Secretas | Conquista secreta | assets/90b1bc2fb466b5b1ed8eae5d11c5cf2f.svg |

A moeda dourada (moeda-stazia-3d, +XP) aparece nas medalhas e foi catalogada na seção 2.

## 5. Limites desta auditoria (honestidade)
- Ícones que só aparecem após clique (abas, modais) foram pegos pelo código-fonte quando são SVG literais; os estados 100% dinâmicos geram o mesmo conjunto de desenhos (mesmos 62), conferido por comparação do conjunto fonte x tela.
- "App hoje" marcado como **provável** foi deduzido; confira na sua onda antes de trocar. Onde o app tem tela equivalente com ícone próprio (Trilha, Login, Conta > Aparência) isso está dito na nota.
- Itens da 2ª fase (Dupla, Sala: câmera, olho riscado, dado) não têm tela no app; ficam como "novo".
- Não foi feita comparação pixel a pixel das 32 páginas do PDF; o PDF foi usado só para confirmar que as telas são as dos HTML.
