# Parte 2 prática (2ª fase): verificação do pacote de telas, sem implementar

Data: 15/10/2026. Ramo `nt-2fase` (de `novas-telas` 6da5dd72). Só leitura e documento: nenhuma tela da Parte 2 foi construída, nada mexeu em `treino-pacote`, sem push, sem banco, sem .env.

Fontes lidas:
- Pacote: `/Volumes/StaziaMed/.tmp-aulas/novas-telas-2fase/StaziaMed-2fase/` (30 HTML + `index.html` + `assets/`; a pasta tem um nível a mais que o informado). Abertos só no navegador de prévia (porta 31976, servidor estático local, encerrar ao fim). Texto de cada tela extraído da página já renderizada, nas 3 larguras (1440, 834, 390).
- PDF `StaziaMed-telas.pdf`: as páginas 23 a 32 são exatamente estas 10 telas (2ª fase, web/tablet/mobile). O PDF é só imagem; conferi pela miniatura que bate com os HTML. Nada a mais no PDF.
- Código: ramo `treino-pacote` (b6534b81), `src/novo/app/dupla/*`, prévia `:31960` (aberta e capturada, não alterada). Spec/plano: `docs/superpowers/specs/2026-10-09-treino-dupla-design.md`, `2026-10-12-treino-dupla-pacote-1011.md` (decisões D1 a D12), `2026-10-12-stazia-match-engenharia.md`.
- Documento do dono: `/Volumes/StaziaMed/Engenharia Match/STAZIA_MATCH_ENGENHARIA_COMPLETA_PROMPT_AGENTE.md`.
- Memória: o Treino em Dupla/Match/Sozinho/Radar está **PARADO** desde 12/10 em favor da Fase 1 (`foco-lancar-fase1-objetiva`). O dono não liberou retomar. Este documento é só mapa para quando liberar.

Capturas: `/Volumes/StaziaMed/.tmp-aulas/novas-telas/2fase/`. Modelo: `01` a `11` (e `06b`, `07b` = visão do candidato). App atual (prévia :31960): `app-01` a `app-09`.

## 0. Resumo em uma página

- O pacote tem **10 telas x 3 larguras = 30 arquivos**. Todas têm equivalente no código do ramo `treino-pacote`: **3 existem e funcionam sem banco real (Praticar, Meu perfil, Banco de estações), 6 fases da sala existem só "desenhadas" (parcial), 1 fase (Aguardando/encerrada) existe pronta**. A parte que **falta de verdade** é a **sala ao vivo (Etapa 5)**: relógio do servidor, ações dos botões (todas hoje não fazem nada), tempo real. Sem ela, nenhuma tela da sala funciona para dois alunos.
- Classificação: **A = 12 arquivos** (só visual: Perfil x3, Estações x3, Praticar x3, Estados x3 como casca), **B = 0 novos dados**, **C = 18 arquivos** (sala: Papéis, Conectando, Config, Andamento, Conferência, Resultado x3 cada, porque o visual só vale ligado à sala ao vivo), **D = 0**. Veja a seção 2 (a classe é por tela; a tabela detalha).
- O pacote **desfaz decisões do dono já tomadas** em três pontos principais (seção 4): (1) devolve o **link da chamada** e a **"Leitura prévia do avaliador"** na preparação (D3 e R9 mandaram tirar); (2) mostra o **nome do tema da estação ao candidato** (cabeçalho do Conectando, Config, Aguardando e Andamento; D4 manda só "Estação N · Área"); (3) traz o botão **"Chamada"** na estação e **"Abrir chamada"** na preparação (D3: conversam fora do app).
- O pacote também traz **sobras de protótipo** que nunca podem ir ao aluno: faixa "Ver a tela como Candidato/Avaliador" (7 telas), botão "← Telas da 2ª fase", e-mail/nome da conta do dono ("João Paulo Mendes"), colegas e notas inventados.
- **Nada do Stazia Match completo está no pacote**: sem carteira/créditos, saldo de cota, Match Now (fila), Agenda de duplas, conexões, chat, denúncia/bloqueio. O pacote cobre só o que o código já tem (deck, perfil, banco, sala).
- Ícones: **16 ícones 3D coloridos** (mesma família "ri-*" da Fase 1; 11 já são os do menu) + **15 ícones de traço** (Lucide). Todos listados na seção 3.
- Recomendação: **não construir agora** (foco Fase 1). Quando liberar: Etapa de visual das 3 telas A em cima do que já existe (barata), e só depois a sala ao vivo (Etapa 5) com o visual novo já aplicado junto, para não pintar duas vezes.

## 1. Inventário tela a tela

Legenda do equivalente: **pronta** = existe e usa dados via funções do banco (na prévia roda com dados de teste); **parcial** = tela desenhada a partir da fase gravada, ações não fazem nada; **maquete** = só desenho antigo; **não existe**.

| # | Tela do pacote (web/tablet/mobile) | Equivalente no `treino-pacote` | Estado | Classe |
|---|---|---|---|---|
| 1 | Treino em Dupla · Praticar (`DuplaWeb/Tablet/Mobile`) | `dupla/PracticeScreen.jsx` (baralho, papel, "Deu match", compatibilidade, canal em tempo real, sons) | pronta (sem banco real) | A |
| 2 | Meu perfil de estudo (`DuplaPerfil*`) | `dupla/StudyProfileScreen.jsx` (+ `profile.js`) | pronta | A |
| 3 | Banco de estações (`DuplaEstacoes*`) | `dupla/StationsScreen.jsx` (áreas, busca, ordem, grade/lista, clique abre o match) | pronta | A |
| 4 | Sala · Papéis (`SalaPapeis*`) | `room/RolesPhase.jsx` + `StationPicker.jsx` | parcial (botões sem ação) | C |
| 5 | Sala · Conectando (`SalaConectando*`) | `room/ConnectingPhase.jsx` (5 etapas) | parcial | C |
| 6 | Sala · Configuração (`SalaConfig*`) | `room/SetupPhase.jsx` (link, prontidão, duração, leitura prévia) | parcial | C |
| 7 | Sala · Em andamento (`SalaAndamento*`) | `room/RunningPhase.jsx` (cronômetro NÃO anda, sem relógio do servidor) | parcial | C |
| 8 | Sala · Conferência do avaliador (`SalaConferencia*`) | `room/ReviewPhase.jsx` | parcial | C |
| 9 | Sala · Resultado (`SalaResultado*`) | `room/ResultPhase.jsx` (solicitar revisão, inverter papéis) | parcial | C |
| 10 | Sala · Aguardando / encerrada (`SalaEstados*`) | `room/ReviewPhase.jsx` (candidato "Aguardando avaliação") + `room/ClosedPhase.jsx` | pronta (desenho) | A |

Menu: o pacote mostra o menu lateral da **1ª fase** ("Minha jornada, Aprender, Praticar…", cartão "1ª fase · Objetiva") em volta das telas 1 a 3. O app tem **menu próprio da 2ª fase** (Início, Teoria, Estações, Praticar, PEPs, Paciente) em `src/novo/app/shell/navModel.js`. **O pacote não desenha o menu da 2ª fase** (ver pergunta 1).

### 1.1 Tela por tela: o que o pacote tem e o que o app tem

**1. Praticar.** Pacote: título "Treino em Dupla" (kicker "Praticar · 2ª fase"), chips "Meu perfil de estudo", "5 colegas online", "1 match hoje" (azul-marinho), faixa rosa "Treinando a estação escolhida · Estação 4 · …" com X, cartão "Encontrar dupla" com texto **"Deslize** para a direita…" e "1 match", seletor de papel (3), cartão do colega (online, 92% compatível, CT, objetivo/disponível/papel/estações, "Por que vocês combinam" em roxo claro, chip GO), botões "Pular" (borda) e "Estudar junto" (azul, grande), "Como a compatibilidade é calculada", "4 compatíveis · 2 ocultos pelo papel", coluna "Como funciona" (3 passos) e cartão "Banco de estações · 10 estações do INEP 2020 com checklist PEP". App: mesmos blocos, mas: texto **"Arraste**…" (decisão do dono de 12/10, commit 1876715a), barra escura "Recusar / Arraste o cartão / Estudar" (não existe no pacote), botões redondos (X e aperto de mão) no lugar de "Pular/Estudar junto" retangulares, cor verde-azulada antiga (as cores de `novas-telas` ainda não estão neste ramo), e **não há** "Como funciona", nem o atalho "Banco de estações" no corpo. Mobile do pacote: barra de abas "Início, Questões, Tutor, 5, Mais". Tablet: trilho lateral.

**2. Meu perfil.** Pacote = app em campos e textos (Sobre você, Como quero treinar, Disponibilidade, Privacidade, prévia do cartão), com diferenças só visuais: chips de dias/turnos azuis (app: azul-marinho), áreas sem ícone/ponto de cor (app: ponto colorido + check), título grande com "Voltar para Praticar" em cima, botões "Descartar" (borda)/"Salvar perfil" (azul) no topo. No **mobile** o pacote tem 3 abas "Sobre / Treino / Agenda" e o botão "Ver meu cartão como os colegas veem" (acordeão); o app não tem abas (uma página longa). "Agenda" aqui = dias/turnos de disponibilidade, não a "Agenda" do documento Match.

**3. Banco de estações.** Pacote = app em função (busca, abas de área com contagem, "Ordem da prova / A–Z", "Grade / Lista", cartões com área, número, nome, tags, "Revalida 2020 · INEP", "Sua última", "Média geral"). Diferenças visuais: ícone 3D por área (ver seção 3), cartões maiores. No mobile o pacote troca a lista por área em chips "Clínica / Cirurgia / GO…" e mostra "Estação N · ÁREA" no topo do cartão.

**4. Papéis.** Pacote: duas colunas (Candidato "Você" / Ator-Avaliador), botão "Sortear" (ícone dado), "Trocar estação", "Confirmar papéis e conectar", aviso azul "Definido pelo match…". App: mesmas ações. Diferença: o pacote mostra o **nome do tema** ("Leucemia aguda: …") nesta tela para os dois (D4, seção 4).

**5. Conectando.** Pacote: anel de progresso (0%) "Preparando a sala… Carregando a estação (1/5)" + 5 etapas + avatares. App: mesmas 5 etapas. Diferença: cabeçalho do pacote traz o **nome do tema** (D4).

**6. Configuração.** Pacote (avaliador): 1 "Conectar com meu parceiro" (campo **link da reunião**, "Atualizar link", "Abrir chamada"), 2 "Prontidão" (dois cartões "Aguardando" + "Estou pronto para iniciar"), 3 "Cronômetro" (10:00, **"Desafio de tempo": Oficial / −1 / −2 / −3 min**), coluna "Leitura prévia do avaliador · O candidato não vê", rodapé "Sair da sala / Iniciar estação". Candidato: mesma coluna da esquerda, no lugar da leitura aparece "O enunciado aparece quando o avaliador iniciar a estação" e **mostra o nome do tema**. App atual: tem tudo isso (porque foi construído pela spec de 09/10); a spec de 12/10 (R9) manda **tirar** link e leitura prévia. O "Desafio de tempo" existe no app (`SetupPhase.jsx`).

**7. Em andamento.** Pacote (avaliador): cabeçalho azul-marinho com cronômetro (07:00), "Cenário e tarefas", "Impressos 1/2" (Ocultar/Liberar), "Anotações", PEP como **cartões com 3 botões por critério (Inadequado / Parcial / Adequado)**, nota "0,25 / 10,00 · 2 de 8 avaliados", barra de rodapé "Chamada / Pausar / Sair da sala / Finalizar estação". Candidato: "ENUNCIADO", tarefas 01 a 04, "Impressos 1 liberado" (Abrir), "Impresso 2 · Aguardando liberação", rodapé "Chamada / Sair da sala" (sem "Finalizar": D8 ok). App: PEP como **folha de tabela estilo INEP** ("Desempenho observado", colunas, "Parcialmente adequado" hachurado quando não existe), −/+ 1 min e "Em andamento" no cabeçalho, "Abrir chamada externa". **O pacote não tem o ajuste ±1 min** no cabeçalho (R4/D9 "controle do cronômetro" pede) e troca a folha do PEP por cartões: perde-se a fidelidade à folha oficial (a spec de 09/10 e a decisão "folha do PEP branca no modo noite" tratam a folha como parte do produto). Tablet/mobile do pacote: abas "Cenário / Checklist / Notas".

**8. Conferência.** Pacote: "Etapa final do avaliador", "Nota provisória 0,25 / 10,00 · 3%", filtro Todos/Pendentes, lista com botões Adequado/Inadequado e selo "Pendente", três campos de feedback, aviso "6 critérios sem nota. Serão registrados como não avaliados.", botão "Finalizar e liberar resultado". App: `ReviewPhase.jsx` com a mesma função (revisão antes de inverter papéis). Diferença: o pacote **não oferece "Parcial"** na conferência (só Adequado/Inadequado) enquanto a Andamento oferece Parcial: incoerente dentro do próprio pacote.

**9. Resultado.** Pacote: cartão azul com anel "5,50 / 10,00", "55% de aproveitamento", "−7 p.p. vs. última tentativa (62%)", contadores (5 Adequado / 1 Parcial / 2 Inadequado / 0 Não avaliado), "Checklist PEP" com filtro "Todos 8 / Com perda 3", "Detalhes" (avaliador, data, tempo), "Feedback do avaliador" em três cores, "Solicitar revisão da nota", "Encerrar treino" e "Treinar novamente · inverter papéis". App (capturas lado a lado): mesmos dados e botões, **só layout** diferente (faixa lilás com barra de proporção, tabela, feedback sem cores). Achado: no pacote o item 3 aparece "Parcial **0,00 / 1,50**" (parcial sem pontos); no PEP da estação 1 o Parcial **não existe** ("Parcial —" na Andamento), então a amostra é inconsistente com o PEP real.

**10. Aguardando / encerrada.** Pacote: duas faixas na mesma tela: "Aguardando avaliação" (candidato depois de finalizar) e "Treino encerrado por Colega Teste Um" (com ícone 3D de saída). App: as duas existem (`ReviewPhase` candidato + `ClosedPhase`), com os textos da spec. Visual diferente apenas. O cabeçalho do pacote mostra o nome do tema (D4).

## 2. Classificação A / B / C / D

Mesmo critério da Fase 1: A só visual; B função ou dado novo; C não existe ou depende da sala ao vivo (Etapa 5); D decidir/pausada.

| Tela | Classe | Por quê |
|---|---|---|
| Praticar x3 | A | Tudo existe; trocar casca, cores, botões e texto do arraste. Pontos de decisão: "Deslize" x "Arraste" e "Como funciona" (texto fixo, sem dado) |
| Perfil x3 | A | Mesmos campos e salvamento. Mobile ganha abas (só layout) |
| Estações x3 | A | Mesmos dados. Ícones 3D por área |
| Estados x3 | A | Textos já existem; só visual |
| Papéis x3 | C | Visual só vale com as ações da sala (escolher/sortear/confirmar), que hoje não fazem nada. Depende também de D4 (tirar o nome do tema) |
| Conectando x3 | C | Progresso real vem da sala ao vivo (hoje é desenho fixo) |
| Configuração x3 | C | Link, prontidão e relógio dependem da Etapa 5; o pacote contradiz D3/R9 |
| Em andamento x3 | C | Relógio do servidor, impressos, PEP gravado, tudo Etapa 5; contradiz D4 e muda a folha do PEP |
| Conferência x3 | C | Marcação e finalização são Etapas 5/6; "Parcial" ausente |
| Resultado x3 | C | Nota revisada, histórico e inverter papéis são Etapa 6 |

Placar: **A = 12, C = 18, B = 0, D = 0**. Nenhuma função de banco **nova** é pedida pelas telas do pacote além do que o plano de 09/10 e o pacote de 11/10 já previam (Etapas 5 e 6). Dois itens do pacote **não** estão em plano nenhum e seriam B se o dono quiser: (a) o chip **"1 match hoje"** (contagem do dia: precisa de leitura própria; no Match completo é o saldo/cota), (b) "**Como funciona**" (texto fixo, sem dado, mas é conteúdo editorial para aprovar).

## 3. Ícones

O pacote usa dois grupos: **ícones 3D coloridos** (arquivos `assets/*.svg`, ids `ri-*`; é a mesma família já aplicada ao menu na Fase 1 pelo agente de ícones `nt-icones`) e **ícones de traço** (Lucide, inline). Identifiquei cada um por forma/gradiente e pelo texto ao lado. O app usa Lucide via `Icon.jsx` (`/ds-icons/<nome>.svg`).

### 3.1 Ícones 3D (novos ou trocados)

| Arquivo (início do nome) | Nome | Onde aparece | Hoje no app (Treino) | Situação |
|---|---|---|---|---|
| 74762ca6 | casa (ri-house) | menu "Minha jornada/Início"; **também** o tile da área **Medicina de Família** | `house` no menu; MFC sem ícone próprio | trocado (menu, família Fase 1). **MFC reutilizando a casa do Início é suspeito**: pedir ícone próprio |
| 084c9d6c | livro (ri-book) | menu "Aprender" | `book-open` | trocado (Fase 1) |
| 76994254 | pergunta/documento (ri-question) | "Praticar", "Banco de Questões", aba "Questões"; **papel Candidato** na tela Papéis | `file-question` (menu); papel candidato sem ícone 3D (Lucide `user`) | trocado; **uso novo** como ícone do papel Candidato |
| d00d226f | cronômetro (ri-timer) | "Simulados"; **tile do Cronômetro** (44 px) na Config | `timer` | trocado; uso novo na Config |
| ccd29c4d | camadas (ri-layers) | "Revisar", aba com número | `layers` | trocado (Fase 1) |
| 8c7059de | troféu (ri-x-trophy) | "Stazia Arena"; aba "Arena"; **chip "1 match hoje"** | `trophy`; chip usa `handshake` | trocado; **uso novo e estranho**: troféu (Arena) para "match" |
| e538387d | gráfico (ri-chart) | "Minha evolução"/"Evolução" | `chart-column` | trocado (Fase 1) |
| c7359ebd | brilhos (ri-sparkles) | "Tutor com IA"; **chip "92% compatível"** | `sparkles`; compat usa `sparkles` | trocado; uso na compatibilidade novo (IA não está no módulo: ver risco 6) |
| 3a4ddcca | engrenagem (ri-settings) | "Preferências" | `settings` | trocado (Fase 1) |
| 12a150a9 | porta de saída (ri-logout) | "Sair"; **grande (42 px) no "Treino encerrado"** | `log-out` | trocado; uso novo no estado encerrado |
| e65a7a62 | pessoas (ri-users) | chip "Meu perfil de estudo"; menu mobile | `user-pen`/`users` | **novo** |
| 9136fe24 | prancheta (ri-clipboard) | tile "Banco de estações"; "Impresso 1/2"; **papel Ator/Avaliador** | `clipboard-list`; impressos `file-text`; papel avaliador `drama`/`user` | **novo/trocado** |
| e807cdfe | estetoscópio | **área Clínica Médica** (filtros, cartões, cabeçalho da sala) | cor/ponto da área (`--area-*`), sem ícone | **novo** |
| 8ba5e3cf | bisturi | **área Cirurgia Geral** | idem | **novo** |
| 71b3b57d | símbolo feminino/rosa | **área Ginecologia e Obstetrícia** | idem | **novo** |
| f10824d2 | verde (criança) | **área Pediatria** | idem | **novo** |
| ef639e82 | globo/múltiplo | filtro **"Todas"** | nenhum | **novo** |
| (anel de progresso, SVG inline, 120 e 132 px) | anel | Conectando (0%) e Resultado (nota) | barra/número simples | **novo** (desenho próprio, não Lucide) |

Itens 3D do pacote que **não aparecem** nestas 30 telas (são da Fase 1): 084c, 19ef, 3ea8, 5f6b, 7875, 97853, c4df, cab4, cd91, f248.
Direito de uso e arte: estes ícones 3D são do pacote do dono, mas vale a regra da Fase 1 (arte nova passa pelo diretor de arte antes de entrar). Para as 5 **áreas** e o "Todas" não há equivalente na Fase 1: são ícones novos da Parte 2.

### 3.2 Ícones de traço (Lucide)

| Ícone | Onde | Hoje no app | Situação |
|---|---|---|---|
| chevron-right (m9 18 6-6-6-6) | menu, "Banco de estações", cartões | `chevron-right` | igual |
| chevron-left | "Voltar para Praticar", mobile | `arrow-left` | trocado (seta com haste por chevron) |
| chevron-down | acordeão "Ver meu cartão" (mobile) | `chevron-down` | igual |
| chevrons-up-down | trocar de fase (cartão da conta) | `repeat` | trocado |
| search | busca do Banco | `search` | igual |
| x | fechar faixa "Treinando a estação…" | `x` | igual |
| arrow-left | botão "Pular" | `arrow-left` (barra) + `x` (botão redondo) | trocado: ícone dentro do botão retangular |
| arrow-right | botão "Estudar junto" | `arrow-right` (barra) + `handshake` | trocado: o aperto de mão **sai** do botão |
| video | botão "Chamada" (Andamento) | `video` | igual, mas ver D3 |
| eye-off | "O candidato não vê" | `eye-off` | igual |
| info (circle + i) | avisos nas telas Papéis e Conferência | `info` | igual |
| dice-3 (rect + 3 pontos) | botão "Sortear" | `shuffle` | **trocado** |
| layout-grid (4 retângulos) | aba "Mais" do mobile/tablet | `ellipsis`/grade da Fase 1 | igual ao menu da Fase 1 |
| (sem ícone) | "Grade/Lista", "Adequado/Parcial/Inadequado", chips de área no perfil | app usa `layout-grid`/`list`, check e pontos coloridos | **removidos** pelo pacote |

Ícones do app Treino que o pacote **não usa mais** (ficam órfãos se a troca for feita): `handshake`, `user-pen`, `target`, `sliders-horizontal`, `shuffle`, `users` (menu), `plug-zap`, `timer-reset`, `hourglass`, `flag`, `door-closed`, `copy`, `link`, `external-link`, `drama`, `book-open`(Treino), `check`/`minus`/`plus` dos botões. Conferir antes de apagar qualquer um (outros módulos podem usar).

## 4. Dados de exemplo que seriam inventados (nunca ir ao aluno)

Todos marcados "teste" no próprio pacote, mas estão como texto fixo:

| Onde | Valor do pacote | Regra |
|---|---|---|
| Menu/cartão da conta | "João Paulo Mendes", "JP", "1ª fase · Objetiva", contadores "0/2", "0/3", "5" | vem da conta real e da fase real |
| Praticar | "Colega Teste Um", "CT", "92% compatível", "Faculdade de Teste · Cidade de Teste · UF · Revalida 2026/2", "Colega fictício (dados de teste)", "Treinar GO", "Noite · Seg, Qua", "3 feitas · PEP 7,80", "5 colegas online", "1 match hoje", "4 compatíveis · 2 ocultos pelo papel" | tudo do baralho real (presença, compatibilidade, perfil público). Sem colega, estado vazio |
| Perfil | "Aluno de Teste", "Faculdade de Teste", "Cidade de Teste · UF", "33/160", bio de teste, "Treinar as estações de Ginecologia e Clínica", dias Seg/Qua/Sex, "Noite" | só o que a pessoa digitou (campos vazios no início) |
| Banco | "Sua última 74% / 52%", "Média geral 61,0 / 55,0 / 70,0 / 58,0 / 49,0 / 66,0 / 72,0 / 45,0 / 60,0 / 53,0%" | **notas inventadas**; real = histórico do aluno e média calculada; sem dado: "—" |
| Banco | as **10 estações do Revalida 2020** com nomes, tags e áreas (2 por área) | são conteúdo do INEP lido por OCR; só a estação 1 foi comparada com o PEP original (memória 11/10). Só entra o que o Banco de checklists/Montagem tiver **publicado e aprovado**. D5: nada publicado ao aluno até o dono ver 2020/E1 e 2024/1/E1 |
| Contagem | "10 estações do INEP 2020 com checklist PEP" | contagem real do banco |
| Sala | "Aluno de Teste (você)", "Colega Teste Um", "Ator/Avaliador"/"Candidato" sorteados, link `https://meet.exemplo.com/stazia-dupla`, "07:00", "10:00" | tudo da sala real |
| Andamento/Conferência | "0,25 / 10,00", "2 de 8 avaliados", "3%", notas marcadas nos itens 1 e 2, "6 pendentes" | marcações reais gravadas |
| Resultado | "5,50", "55%", "−7 p.p. vs. última tentativa (62%)", "5 / 1 / 2 / 0", "15 de outubro de 2026", "7 min 32 s", feedback "Boa comunicação (texto de teste).", "Organize o raciocínio (texto de teste).", "Sem comentários." | tudo calculado/escrito pelo avaliador; "vs. última tentativa" só com tentativa anterior real |
| PEP da estação 1 (8 critérios, pontos 0,25/0,75/1,5…) | texto do INEP/PEP | é o que o banco guarda; **não copiar do HTML** |
| "Roteiro do ator: ainda não consta nos documentos do INEP" | aviso honesto | manter como estado "sem roteiro" até a Montagem entregar |

O app (prévia :31960) já usa os mesmos nomes de teste ("Colega Teste Um", "Aluno de Teste") e as mesmas notas, porque a prévia foi montada **a partir deste pacote e do anterior**. Eles ficam só na prévia/testes (`scripts/previa-dupla`), nunca no código do aluno.

## 5. Diferenças em relação às decisões D1 a D12 (ramo treino-pacote, spec 12/10)

| Decisão do dono | O pacote 2fase | Conflito? |
|---|---|---|
| D1 IA no Praticar **sozinho** com feedback | Não há tela "Praticar sozinho" nem radar nem feedback de IA. O ícone de brilhos (IA) aparece na compatibilidade | Pacote **omite** (não conflita, mas falta a tela do sozinho) |
| D2 folha do candidato com logo Revalida + nome StaziaMed, sem outros logos | Não mostra a folha de impressos do candidato; no cabeçalho da sala usa o **logo StaziaMed** (PNG 326x480) | Sem conflito; **folha de impresso não está no pacote** |
| D3 conversam **fora do app**, sem link | **Tem** campo "Link da reunião · chamada externa", "Atualizar link", "Abrir chamada" (Config) e botão "Chamada" (Andamento, 3 larguras) | **CONFLITO** |
| D4 tema só para o avaliador; candidato vê só "Estação N · Área"; só o avaliador escolhe a estação | Mostra o **nome do tema ao candidato** em Papéis, Conectando, Config, Aguardando e Andamento (título "Leucemia aguda: palpação de fígado e baço", imagem de área) e **os dois** veem "Trocar estação" em Papéis | **CONFLITO** (e "Trocar estação" para os dois conflita com "só o avaliador escolhe") |
| D5 ver 2020/E1 e 2024/1/E1 antes | O pacote usa só **2020** | Sem conflito, mas reforça 2020/E1 como primeira (decisão pendente) |
| D6 chat (apagar a cada 24 h, denúncia, bloqueio) | **Sem chat, sem denúncia, sem bloqueio** | Falta (não está no pacote) |
| D7 cobrança do **crédito diário** dos dois | "1 match hoje" sem saldo; sem "créditos", sem aviso de cota | Falta |
| D8 candidato **não** finaliza | Candidato: só "Chamada" e "Sair da sala" | Ok |
| D9 sala do avaliador: resumo, impressos, **controle do cronômetro**, marcação do PEP | Tem cenário, impressos, PEP, Pausar; **não tem ±1 min** na estação e o cronômetro sem ajuste; "Desafio de tempo" só antes de iniciar | **Parcial** (falta ajuste durante a estação) |
| D10 "Sinalizar problema" abre janela e vai à Administração | **Não existe** o botão em nenhuma tela | Falta |
| D11 convite rápido e direto | Não há | Falta |
| D12 compra parada; tela informativa | Não há tela de compra/créditos | Ok (nada a fazer) |

Outros pontos de texto do pacote contra o que já foi decidido:
- Pacote: "**Deslize** para a direita…". Dono decidiu "**Arraste**" em 12/10 ("como no desenho original"). Escolher um (pergunta 5).
- Pacote: "Estudar junto" / "Pular". Documento Match sugere "Convidar para estudar" / "Passar" (texto **sugerido**, o dono ainda não escolheu); app já usa "Estudar junto".
- Pacote: rótulo da fase "1ª fase · Objetiva" no menu das telas da 2ª fase: inconsistente.
- Pacote usa o **mesmo menu 3D da Fase 1 e nenhum modo escuro**; as telas da 2ª fase têm modo noite já pronto no app (folha do PEP branca de propósito). O pacote não tem dark; derivar dos tokens (decisão 2 do dono).
- O app não tem o selo "Ver a tela como" (é só do protótipo).

## 6. Diferenças em relação ao documento Stazia Match

O documento define **três modalidades** (Discovery, Match Now, Agenda), carteira de créditos, páginas `MatchOverview`, `DiscoveryDeck`, `MatchNowQueue`, `MatchOfferDialog`, `MatchCelebration`, `MatchCalendar`, `ConnectionsList/ConnectionChat`, `WalletSummary`, `PackagesGrid`, `TrainingRoom`, `AdminMatchDashboard`.

| Item do documento | No pacote 2fase | No código |
|---|---|---|
| Discovery (deck, curtir/passar) | Sim (Praticar) | baralho + "Deu match" (Etapa 4) |
| Match Now (fila, oferta, tempo restante) | **Não** | Não existe |
| Agenda | Só dias/turnos no perfil | Não existe |
| Carteira (cota diária, extras, histórico), `WalletSummary`, `PackagesGrid`, "Você utilizou suas 3 sessões gratuitas" | **Não** | Não existe (D7/D12) |
| Conexões e chat, bloqueio e denúncia | **Não** | Não existe |
| Estados obrigatórios (`loading`, `empty`, `offline`, `error`, `permission_denied`, `quota_exhausted`, `offer_expired`, `reconnecting`, `maintenance`) | Só "Aguardando" e "encerrada" | parcial |
| Sala (TrainingRoom): papéis, readiness, checklist, cronômetro do servidor, **link do Meet externo** | Sim, **com link** | link existe no código (a spec de 12/10 manda tirar). **O documento do dono (§38–39) manda ter o link externo**: o documento e a decisão D3 se contradizem; o pacote segue o documento |
| "Nunca descontar visualmente o saldo antes de confirmação do servidor" | "1 match hoje" sem saldo | ao incluir saldo, esperar confirmação |
| "Cada sessão consome 1 unidade de **cada** participante só quando ambos confirmam Pronto" (§8) | "Estou pronto para iniciar" existe na Config | cobrança não existe; encaixa na Etapa 5 |
| Revezar papéis = **nova sessão e novo débito** (§38) | "Treinar novamente · inverter papéis" sem aviso de custo | **precisa de aviso de custo** quando a cobrança existir; conflito com spec 09/10 (inverter na mesma sala) |
| Compatibilidade: sem IA, sem "ranking opaco" (§3) | selo de brilhos (ícone de IA) em "92% compatível" e "Como a compatibilidade é calculada" | ícone de IA é só visual; o texto "Como a compatibilidade é calculada" é transparente: ok |
| Observador opcional (não debita) | Não | Não |
| Nome "Stazia Match" | O pacote chama "Treino em Dupla" | decidir o nome (já está em aberto na spec 12/10) |

Conclusão: o pacote 2fase cobre **o que já está construído no ramo** (Discovery + sala) e **nada do que o documento Match acrescenta** (créditos, fila, agenda, conexões, chat).

## 7. Riscos

1. **Desfazer decisões já tomadas** (D3, D4, D9, R9): se alguém aplicar o pacote como veio, o candidato vê o tema, a chamada volta ao app e a Leitura prévia reaparece. Aplicar o visual, **não** as seções.
2. **Sala ao vivo ainda não existe** (Etapa 5 do plano de 09/10; 7 migrações de 9750 a 9770 + 9900…): o visual novo não funciona sozinho. Pintar antes e depois da Etapa 5 = trabalho dobrado.
3. **Migrações 9750 a 9770 não confirmadas no banco real** (memória: tratadas como não publicadas). Qualquer ligação com banco real exige conferir antes.
4. **Folha do PEP**: o pacote troca a folha de tabela do INEP por cartões. Perde a fidelidade à folha oficial que a spec e o dono pediram (folha branca no modo noite). Os cartões também escondem "Parcial" só por estar desabilitado, o que é correto, mas a Conferência do pacote não tem Parcial.
5. **Dado de saída incoerente** no Resultado: item "Parcial 0,00 / 1,50" quando o PEP da estação não tem parcial.
6. **Sinal de IA na compatibilidade** (brilhos): o módulo é "sem IA" (spec 09/10) e a compatibilidade é regra simples. Usar o ícone de IA induz a erro (e a decisão "ferramentas de IA só na Administração"). Trocar por outro ícone.
7. **Contraste e texto pequeno**: os textos secundários do pacote (11 a 12 px em cinza) reprovam 4,5:1 (mesma medição da Fase 1); aplicar tokens do app, não as cores do HTML.
8. **Responsivo**: cada tela é um HTML de largura fixa (web/tablet/mobile). Reconstruir com os componentes do app; não copiar.
9. **Moderação**: nenhuma tela de denúncia/bloqueio/sinalizar; o aluno em dupla pode precisar disso antes do lançamento real.
10. **Duas fontes de verdade de ícone** (3D do pacote x Lucide do app): a Fase 1 decidiu; aqui repetir a mesma regra e atualizar `scripts/design-system/sync-icons.mjs` só se algum Lucide novo (`dice-3`, `chevrons-up-down`) não existir em `public/ds-icons` (conferir).
11. **Menu da 2ª fase não desenhado** no pacote: risco de o aluno da 2ª fase cair num menu da 1ª fase.
12. **Foco do dono**: Fase 1 primeiro. Nada disso entra na janela de lançamento.

## 8. Ordem recomendada (quando o dono liberar)

0. Responder as perguntas da seção 9 (principalmente 1 a 4).
1. **Fase 2 menu e casca** (onda de menu da 2ª fase): desenhar o menu das telas da 2ª fase com a mesma família de ícones. Sem isso as telas 1 a 3 ficam "soltas".
2. **Praticar, Perfil, Banco de estações, Estados** (A, 12 arquivos): trocar a casca, cores, botões "Pular / Estudar junto", ícones 3D das áreas, abas do mobile no Perfil. Barato, sem banco. Prévia :31960 já serve de teste.
3. **Etapa P do pacote de 11/10** (tirar tema do candidato, link e leitura prévia): pré-requisito de qualquer visual da sala.
4. **Etapa 5 (sala ao vivo) construída já com o visual novo**: Papéis, Conectando, Config, Andamento (com PEP no formato escolhido na pergunta 4).
5. **Etapa 6 (Conferência, Resultado)** com o visual novo.
6. Só depois: chat (D6), sinalizar problema (D10), carteira/Match completo e Praticar sozinho/radar.

## 9. Perguntas ao dono (até 8, com recomendação)

1. **Menu da 2ª fase.** O pacote desenha as telas da Dupla com o menu da 1ª fase ("1ª fase · Objetiva", Minha jornada, Aprender…). Quer que a 2ª fase tenha menu próprio (Início, Teoria, Estações, Praticar, PEPs, Paciente) como hoje? Recomendo **sim, manter o menu próprio da 2ª fase** e desenhá-lo na mesma família de ícones.
2. **Chamada.** O pacote traz de volta o link da reunião e "Abrir chamada" (e o documento do Match também manda). Você decidiu "fora do app, sem link" (D3). Mantém D3? Recomendo **manter D3 (sem link)**, e tirar "Chamada" e "Abrir chamada" do visual; se mudar de ideia, o campo é fácil de religar.
3. **Tema da estação para o candidato.** O pacote mostra o nome do tema ao candidato antes e durante a estação. D4 diz que só o avaliador vê. Mantém D4? Recomendo **manter**: candidato vê "Estação N · Área" e só vê o nome no resultado.
4. **Folha do PEP.** O pacote troca a folha de tabela do INEP por cartões com 3 botões. Qual vale? Recomendo **manter a folha de tabela** no modo avaliador (fidelidade à prova oficial) e usar os cartões só no celular, onde a tabela não cabe; sem "Parcial" quando a estação não tiver.
5. **Texto do arraste.** "Arraste" (sua decisão de 12/10) ou "Deslize" (pacote)? Recomendo **manter "Arraste"**, que é o que você já escolheu.
6. **Ícones 3D das áreas** (estetoscópio, bisturi, rosa, verde, globo) e o ícone de brilhos/IA na compatibilidade. Aprova os cinco das áreas? Recomendo **aprovar as áreas depois de passar pelo diretor de arte** (como a Fase 1) e **trocar o ícone de brilhos** por outro neutro (IA não faz parte do módulo). E pedir ícone próprio para Medicina de Família (hoje repete a casa do Início).
7. **"1 match hoje" e "Como funciona".** "1 match hoje" pede uma contagem do dia (e vira saldo quando a cobrança existir). "Como funciona" é texto fixo de 3 passos. Quer os dois? Recomendo **"Como funciona" sim (você aprova o texto)** e **"1 match hoje" só quando a cobrança estiver definida**; até lá mostrar só "colegas online".
8. **Quando retomar.** A Fase 2 prática está pausada. Quer que eu deixe esta verificação guardada e só execute (passos 1 a 3 da seção 8) quando você liberar? Recomendo **sim: nada da Parte 2 entra antes do lançamento da Fase 1**, e quando liberar, começar só pelo visual (passos 1 e 2), sem sala ao vivo.

## 10. O que não consegui conferir

- Não abri o app com banco real nem vi os dados reais do Treino em produção; tudo do app foi lido na prévia `:31960` (dados de teste).
- O PDF é só imagem; conferi por miniatura (32 páginas, 23 a 32 = 2ª fase). Não li o texto do PDF (não há camada de texto).
- A **identificação dos ícones 3D** é por forma e pelo texto ao lado (gradientes `ri-*` e contexto), não por nome oficial do pacote.
- Não comparei o modo escuro (o pacote não tem) nem medi contraste do pacote nesta passada; usei a medição da Fase 1.
- Não verifiquei se `public/ds-icons` já tem `dice-3` e `chevrons-up-down` (só ao implementar).
- A autenticidade das 10 estações de 2020 (OCR do PEP) continua conferida apenas na estação 1.
