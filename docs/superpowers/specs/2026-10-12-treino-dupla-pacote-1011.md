# Treinamento em Dupla — pacote de design de 11/10/2026: o que mudou e o que fazemos

Data: 2026-10-12. Escrito para o dono do produto (o que mudou, o que isso desmancha do que já foi feito, o que é novo e o
que ele precisa decidir) e para quem for construir. **Só documento: nenhum código de produto foi alterado, nada foi publicado.**
Base: ramo `treino-pacote-1011`, a partir de `a49bfd9` (Etapas 1 a 4 prontas). Plano que acompanha este texto:
`docs/superpowers/plans/2026-10-12-treino-dupla-pacote-1011.md`.

Este documento **complementa** a especificação `2026-10-09-treino-dupla-design.md` (a "spec de 09/10") e o plano
`2026-10-09-treino-dupla.md` (o "plano de 09/10"). Onde nada é dito aqui, a spec de 09/10 continua valendo. Outro agente
escreve, em outro ramo, o adendo "Praticar sozinho e radar" (`2026-10-12-treino-dupla-sozinho-e-radar.md`); este texto não
mexe nele e só registra o conflito (§5).

## 0. Resumo em poucas linhas
1. O pacote novo (pasta `Documents/StaziaMed-Previas/treino-dupla-2026-10-11`) muda **a sala** (preparação, sala do avaliador,
   candidato, rodapé, menu recolhido), **o match** (chat interno, cota por pacote, compra, convite rápido e direto) e traz o
   **roteiro do ator da estação 1** e a **pasta com os 39 PDFs do INEP 2020–2025**.
2. O que a sala nova exige já desfaz partes das Etapas 1 a 4: o tema da estação hoje vai ao candidato (cabeçalho, carregamento,
   lista de estações da sala, estado da sala); o link da chamada e a "leitura prévia" saem da preparação; o relato do caso
   passa a ficar visível desde o início; o impresso ganha "número de origem" separado do número na tela.
3. Proponho **uma etapa nova antes da Etapa 5** (Etapa P, 7 tarefas pequenas, uma migração, a 9900) para ajustar o que já
   existe, e a **revisão das tarefas 14 a 20** seguindo o pacote novo.
4. Do que é **escopo novo**: só o **chat entre os dois do match** entra já (depois da Etapa 7). Cota por pacote, compra,
   convite rápido e convite direto **esperam decisão sua** (§3 e §7). Compra real fica de fora: a Stripe está parada por ordem
   sua.
5. Há **4 conflitos com regras suas** (§5): IA no Praticar sozinho x "sem IA" do pacote; logotipo do INEP; como os dois
   conversam sem o link da chamada; tema da estação x Banco de estações e escolha da estação.
6. Nada de preço, limite ou texto comercial foi inventado: tudo que o pacote deixa em aberto está em "a definir" (§3, §7).

## 1. O que o pacote novo mudou

### 1.1 Por arquivo (diff real contra a versão de 08/10, em `~/Downloads/templates/handoff-treino-dupla`)
Conferido com `diff -rq` e `diff -u`; os PDFs da pasta de provas não foram abertos (só os nomes). `components/`, `tokens/` e
`_ds_bundle.js` são **iguais** aos de 08/10.

| Arquivo (em `ui_kits/treino-dupla/`, salvo indicação) | Situação | O que mudou |
|---|---|---|
| `Loading.jsx`, `Matching.jsx`, `Profile.jsx`, `Result.jsx`, `Stations.jsx`, `data.js`, `match-rules.js` | **iguais** | nada (mas `Loading.jsx` e `Setup.jsx` ainda usam `st.name`: ver R3) |
| `App.jsx` (10,9 → 15,3 KB) | mudou | sala do avaliador abre **antes** de iniciar (`openEvaluatorRoom`, `stationStarted`); início da estação por `localStorage` + `BroadcastChannel` (truque de protótipo: **não portar**); menu recolhe na sala (`sidebarCollapsed`); candidato esconde o próprio cronômetro (`sessionStorage`); `sz-screen` passa a `sessionStorage`; sem `link` no rodapé |
| `Setup.jsx` (12,7 → 9,4 KB) | mudou | **saem** o cartão "Conectar com meu parceiro" (link da reunião, copiar, "Abrir chamada") e a "Leitura prévia do avaliador"; o cartão do cronômetro some da preparação (vai para o rodapé do avaliador); avaliador ganha "Abrir sala do avaliador"; sub-título "Confirmem a prontidão para iniciar a estação."; candidato não inicia sozinho |
| `Room.jsx` (17 → 34,8 KB) | mudou | tela do ator em 2 colunas com rolagem própria em cada uma; PEP com cabeçalho fixo e somatória; rodapé do avaliador (`EvaluatorStartPanel`); folha única do candidato (`candidateImage`); `PrintImage` com "Ocultar imagem" e zoom −/+ (60% a 200%); numeração `displayIndex`; cabeçalho do candidato "Estação em andamento"; cronômetro do candidato com "Ocultar/Mostrar cronômetro"; blocos "Materiais" e "Feedback" na coluna esquerda; "Sinalizar problema" só mostra aviso local; blocos **visuais** "TutorIA — Bloqueado" e botão "Liberar" do PEP (não fazem nada) |
| `Match.jsx` (27 → 30 KB) | mudou | corrige o "Estudar junto" que selecionava várias pessoas em sequência (trava por cartão); "Enviar mensagem" abre o chat; **saem** "Agendar sessão" e o cartão "Grupo de duplas no WhatsApp"; cota, aviso e compra; "Convite rápido" e "Convidar" passam pelo mesmo controle de cota; `role="dialog"` no "Deu match!" |
| `Sidebar.jsx` (6,5 → 7,5 KB) | mudou | modo recolhido (72 px) com botão "Recolher menu / Expandir menu" |
| `stations-inep2020.js` | mudou só na **estação 1** | `candidateImage`; impresso 2 (esfregaço) ganha `displayIndex: 1` e imagem própria; **roteiro do ator da estação 1 (10 blocos)**; as outras 9 estações seguem com `actor: []` |
| `index.html` | mudou | só CSS (sala do avaliador, rodapé fixo, barras de rolagem) e a lista de scripts |
| `StudyChat.jsx`, `study-social.js`, `study-social.css`, `study-social.test.cjs` | **novos** | chat de estudo, cota por pacote, tela "Adquirir matches", filtro de palavras; 14 testes locais. **Tudo local no navegador** (`localStorage`); compra **simulada**; conta de demonstração |
| `MATCH-CHAT-REGRAS.md` | **novo** | registro das regras do chat, cota e pacotes (11/10) e do que falta para produção |
| `ATUALIZACOES_2026-10-11.md`, `LEIA_PRIMEIRO_IA_OPERACIONALIZACAO.md` (raiz) | **novos** | lista das mudanças; "o que falta para ser operacional"; regras que não podem se perder |
| `README.md` (raiz e do kit), `PROMPT_IA.md` | mudaram | só avisos no topo mandando ler os arquivos novos; **o corpo antigo continua dizendo coisas já substituídas** (link da chamada, "sem IA"): vale o que está em `ATUALIZACOES` |
| 6 PNGs na raiz (`match-chat-interno`, `match-cota-pacotes`, `candidato-ocultar-cronometro`, `rodape-estacao-atualizado`, `match-corrigido`, `match-enviar-mensagem`) e 10 PNGs novos em `assets/inep2020/` | novos | referência visual e imagens da estação 1 (folha do candidato única, esfregaço, relato) |
| `PROVAS_HABILIDADES_CLINICAS_INEP_2020_A_2025/` | novo | 39 PDFs em 13 pastas (§6) |

### 1.2 Por regra (o que o pacote manda e o que acontece com o que já construímos)
"Já construído" = ramo `treino-pacote-1011` em `a49bfd9`. "Impacto" aponta a tarefa do plano novo que cuida do assunto.

| # | Regra do pacote (onde está) | Hoje no que construímos | Impacto |
|---|---|---|---|
| R1 | **Relato do caso visível desde o início**, sem liberação pelo avaliador; fica dentro da folha única "instruções + relato" (`Room.jsx` `isCaseReportPrint`, `candidateImage`; LEIA §3 item 5) | O candidato só vê impresso depois que o avaliador libera (`released_pressings`); relato é um impresso comum | muda a lista de impressos e a função de conteúdo: P1, P2, P3 |
| R2 | **"Impresso 1" na interface** para o esfregaço, que é o "impresso 2" da prova: `source_number` (origem) separado de `display_number` (tela) (`displayIndex`; LEIA §3 item 6) | Número = posição na lista (`index`) | campo novo no formato do impresso: P1, P2, P3 |
| R3 | **Tema reservado ao ator/avaliador** durante o atendimento; o candidato não o recebe no título, preparação, carregamento, nome de arquivo, URL, descrição de imagem ou dado oculto (LEIA §3 item 1 e "Lacunas") | **Vaza hoje:** `station.name` vai ao candidato em `dupla_room_state` (9760) e em `app_dupla_room_content` (9750) e aparece em `RunningPhase` (cabeçalho), `ConnectingPhase` ("Carregando a estação"), `RolesPhase`/`StationPicker` ("Estação {n} · {nome}") e na faixa da estação no Praticar | migração 9900 e telas: P2, P4a, P4b |
| R4 | **Rodapé do avaliador** com cronômetro, ajuste de tempo, "Iniciar estação" / "Pausar" / "Finalizar estação", sinalizar e sair | Cronômetro e ±1 min no cabeçalho; ajuste de duração e "Iniciar" na preparação; barra de baixo com "Abrir chamada externa" | tarefas 16 e 17a |
| R5 | **Candidato espera o início** e pode **esconder o próprio cronômetro** (some só nele; o tempo continua) (`candidato-ocultar-cronometro.png`) | Os dois podem esconder/minimizar (`localStorage`); candidato fica na preparação até `running` | 17a e 17b (a "espera" já é o estado do servidor) |
| R6 | **Menu recolhido na sala**, com botão para expandir | O app já tem menu recolhível (`Shell.jsx`, `Rail`), mas escolhido à mão; a sala é `bare` (sem cabeçalho) | P5 |
| R7 | **Tela do ator em 2 colunas, cada uma com rolagem própria**; PEP à direita com marcação e **somatória** | Já são 2 colunas (grade `auto-fit`) com a página inteira rolando; PEP já soma (`PepTable`, cabeçalho fixo) | só layout e CSS: P4b, tarefa 19 |
| R8 | **Sala do avaliador abre antes do início**; o candidato espera e entra sozinho quando o avaliador inicia | Preparação única; "Iniciar" está na preparação | tarefas 16 e 17a (usa a fase do servidor, não o truque de `BroadcastChannel`) |
| R9 | **Sem link da chamada** e sem "Leitura prévia" (a própria sala do avaliador já mostra tudo) | Preparação tem o cartão do link, "Abrir chamada" e a leitura prévia; `RunningPhase` tem "Abrir chamada externa"; plano tem `app_dupla_set_link` | P4a; **conflito 5.3** |
| R10 | **Impressos:** o avaliador libera/oculta; o candidato abre/fecha, amplia (−/+) e pode ocultar a imagem | Libera/oculta e "Ampliar" (Esc fecha) já existem; faltam zoom −/+, "Ocultar imagem" e abrir/fechar | P3 |
| R11 | **Materiais:** "Resumo sobre o tema" e "Flash Card" ligados ao tema certo; sem link genérico (LEIA §3 item 8) | Não existe | §3.4 e P4b (só com o que existe) |
| R12 | **"Enviar mensagem"** abre **chat interno** entre os dois do match, com filtros e feedback de bloqueio (`MATCH-CHAT-REGRAS.md`) | Escondido por decisão de 09/10 (spec §3) | escopo novo, §3.1, etapa C |
| R13 | **"Agendar sessão"** e o cartão do WhatsApp **removidos** | Já escondidos (spec §3) | nenhum |
| R14 | **Cota de matches por pacote**; sem cota: **"Sua cota de matches acabou"**, aviso de que pode adquirir mais e tela de compra | Não existe: "N matches hoje" só conta | escopo novo, decisão, §3.2 |
| R15 | **Correção do match que selecionava várias pessoas em sequência** (trava por cartão, `swipeLock`, `completedCard`) | A Etapa 4 já trata isso no servidor (par travado por `pg_advisory_xact_lock`) e no cartão (testes "baralho atualizado não troca o cartão de cima") | conferir com um teste novo, P6 |
| R16 | **"Convite rápido"** e **"Convidar"** (convite direto) passam pelo mesmo controle de cota | Escondidos (spec §3); só há convite como **resposta** ao segundo "Estudar junto" (`app_dupla_swipe` → `study_invites`) | escopo novo, decisão, §3.3 |
| R17 | **Roteiro do ator da estação 1** (10 blocos; "Não consta no script." onde o roteiro não diz) | Estações de teste têm `actor_script` vazio | P1 (só dado de teste); §6 |
| R18 | PDFs das provas e PEPs 2020–2025 | Não são usados pelo app | §6 |
| R19 | `TutorIA — Bloqueado` e botão **"Liberar"** do PEP: blocos **visuais** que não fazem nada | Não existem (spec §3: "nada sem lastro") | **não construir**; §5.1 |
| R20 | **"Sinalizar problema"** só mostra "Problema sinalizado à equipe" (a própria LEIA diz que não pode afirmar isso) | Escondido (spec §3) | continua escondido; decisão §7 |

## 2. Impacto no que já foi construído (Etapas 1 a 4)

### 2.1 Banco (migrações 9750, 9760 e 9770 **não mudam**; a correção vai numa migração nova, regra do plano de 09/10)
| O quê | Mudança | Tarefa |
|---|---|---|
| `dupla_room_state` (9760) e `app_dupla_room_content` (9750) | o candidato **não recebe** o nome (tema) da estação enquanto a rodada não chega ao resultado; recebe "Estação N" e a área. Impressos ganham `source_number`, `display_number`, `initially_visible`; o conteúdo do candidato passa a trazer os impressos iniciais (relato) sem liberação e **a "folha do candidato"** (texto, ou imagem se existir) | P2 (migração **9900**) |
| `checklist_station_contents.content` (formato publicado, `src/shared/checklistBank/types.ts` e `catalog.ts`) | `Pressing` ganha 3 campos **opcionais** (`source_number`, `display_number`, `initially_visible`); `normalizeStation` hoje **descarta** o que não conhece, então precisa aprender | P1 |
| Montagem de estações (outro ramo) | passa a publicar os 3 campos e a folha do candidato; sem eles, a regra "relato visível desde o início" não tem de onde sair. **Combinar com a Montagem**; no Treino, o padrão sem campo é `source = display = posição` e `initially_visible = false` | P1 (nota) |

### 2.2 Código e testes já existentes
| Arquivo | O que muda | Testes que mudam |
|---|---|---|
| `scripts/dupla/converter-inep2020.ts` | hoje **recusa** propriedade desconhecida: precisa aceitar `candidateImage`, `displayIndex`, `img` e a constante `ACTOR_SCRIPT_1`; lê o pacote novo | `duplaEstacoesTeste.test.ts` (lê `PACOTE` em `~/Downloads/...`; passa a apontar a pasta nova; `actor_script` da E1 não é mais vazio; E1 ganha impresso inicial) |
| `server/dupla/data/teste-inep2020.json`, `server/dupla/testStations.ts` | regerar (E1: relato inicial, esfregaço `display_number 1`/`source_number 2`, roteiro) | idem; `duplaSalaTesteLocal.test.ts` |
| `src/novo/ds/components/osce/PrintItem.jsx` + `PrintImage.jsx` + `osce.css` | rótulo "Impresso {display_number}"; zoom −/+; "Ocultar imagem"; abrir/fechar | `duplaComponentesEstacaoA.test.tsx` (linhas 131 a 215) |
| `src/novo/app/dupla/room/SetupPhase.jsx` | tirar link, copiar, "Abrir chamada" e "Leitura prévia"; só prontidão; "Abrir sala do avaliador" | `duplaSalaFases.test.tsx` (preparação: linhas 211 e 260) |
| `.../ConnectingPhase.jsx`, `RolesPhase.jsx`, `StationPicker.jsx`, `parts.jsx` (`stationTitle`) | sem o nome da estação para quem pode ser candidato; só o avaliador escolhe a estação | `duplaSalaFases.test.tsx` (linhas 138, 173, 195) |
| `.../RunningPhase.jsx` | cabeçalho do candidato "Estação em andamento"; folha do candidato; impressos iniciais; rodapé do avaliador; 2 colunas com rolagem própria; "Materiais" e "Feedback"; sem "Abrir chamada externa" | `duplaSalaFases.test.tsx` (linhas 267, 312) |
| `.../useRoom.js`, `RoomScreen.jsx` | nada de link; candidato espera; avaliador "abre a sala" localmente | idem |
| `src/novo/app/Shell.jsx` (+ `App.jsx`) | recolher o menu ao entrar na sala e devolver ao sair | `duplaRotas.test.tsx` |
| `src/novo/app/dupla/PracticeScreen.jsx` (faixa "estação escolhida") | a faixa mostra o nome: ver §5.4 | `duplaPraticarTela.test.tsx` (linha 132) |
| `src/novo/app/dupla/MatchModal.jsx` | botão **"Enviar mensagem"** só quando a etapa C existir | `duplaMatchTela.test.tsx` (linha 485 "nada do que ficou fora" muda) |
| `src/__tests__/helpers/duplaDb.ts` e `duplaMigracaoDados.test.ts` (linhas 101, 122, 138) | entram as migrações novas na lista; "funções que o Treino refaz" muda (agora refaz 2 do Treino, nenhuma de produção) | idem |

### 2.3 Tarefas 14 a 20 do plano de 09/10
| Tarefa antiga | Situação | O que muda |
|---|---|---|
| 14 — migração 6800 (ações da sala) | **revisada** | número vira **9910**; sai `app_dupla_set_link`; `app_dupla_set_station` só pelo avaliador; impressos iniciais não são "liberáveis"; `app_dupla_print_path` serve também ao relato inicial |
| 15 — estado ao vivo e relógio | **mantida** | sem mudança de regra |
| 16 — sala ao vivo (1): papéis, conexão, preparação | **revisada** | sem link; "Abrir sala do avaliador"; candidato espera e entra sozinho |
| 17 — sala ao vivo (2): estação, impressos, PEP, conferência, queda | **dividida em 17a, 17b e 17c** e revisada | rodapé do avaliador, folha do candidato, cronômetro, impressos com zoom, rolagem própria |
| 18 — migração 6900 e Resultado | **mantida**, número **9920** | nome da estação só aparece ao candidato no resultado |
| 19 — celular e acessibilidade | **revisada** | usa os pontos de quebra do pacote (900, 1100 e 480 px) e novos avisos de leitor de tela |
| 20 — ponta a ponta e documentação | **revisada** | sem passos do link; testes novos do vazamento do tema; SQL "9900 a 9920" |

## 3. Escopo novo que o plano aprovado não tinha
Regra de ouro (LEIA §3, itens 9 a 11): "Agendar sessão" e a chamada externa não voltam; **não há franquia gratuita global**;
**os números da prévia (3 matches por dia, pacotes de 5 e de 10, 600 caracteres, 5 mensagens em 30 s) são exemplos, não
regra**; **conversas existentes continuam abertas e não consomem outro match**.

### 3.1 Chat entre os dois do match ("Enviar mensagem") — **ENTRA JÁ** (etapa C, depois da Etapa 7)
O pacote registra a decisão do dono (11/10) e não envolve preço nem limite comercial. Reaproveita o que existe: `study_matches`
(uma conversa por par que deu match), RLS e o padrão de canais privados do Realtime (`room:{id}` → `chat:{id}`), consulta
periódica no banco local.
- **Entra:** uma conversa por match (só depois do match, como no pacote); mensagens guardadas no banco, só os dois leem e
  escrevem; **filtro de palavras e de contatos/links no servidor** (o do pacote é só no navegador e "não é barreira de
  segurança"); tamanho e frequência validados no servidor; texto sempre como texto, nunca como HTML; lista de conversas no
  Praticar; botão "Abrir sala" dentro da conversa (leva à sala do match, sem consumir cota); conta excluída = "Conta
  excluída", como já fazemos nas avaliações.
- **Valores propostos pelo pacote (aprovar ou trocar):** até 600 caracteres; no máximo 5 mensagens em 30 s por conversa; 9
  palavras na lista inicial (`idiota`, `imbecil`, `babaca`, `otario`, `porra`, `caralho`, `merda`, `puta`, `puto`) com
  variações simples (acento, caixa, letras trocadas por números, pontuação no meio); bloqueio de endereços, e-mails, telefones
  e frases de divulgação. O teste do pacote garante que termos clínicos e horários **não** são bloqueados por trecho de palavra;
  esse caso vira teste do servidor. A lista fica editável pela Administração (chave em `app_settings`, desligada de código).
- **Textos já escritos no pacote (reaproveitar sem mudar):** "Um espaço para treinar juntos. Sem ofensas, divulgação ou
  contatos externos."; "Vocês têm o treino em comum."; "Escolham a estação, combinem os papéis e comecem quando estiverem
  prontos."; "Mensagem para {nome}"; "Combine uma estação ou um horário…"; "Conversas de estudo"; "Conversar e retomar uma dupla
  não consome novos matches."; "Abrir sala". Os avisos de bloqueio do filtro também. **Não copiar** "Prévia local · mensagens
  não são enviadas ao outro usuário." nem "salvo na prévia".
- **Decisão sua antes de construir a parte de moderação (não trava o chat básico):** denúncia e bloqueio de pessoa; por quanto
  tempo guardar as mensagens; quem da equipe pode ler; se a Política de Privacidade ganha um parágrafo sobre o chat (§7, D6).

### 3.2 Cota de matches por pacote — **DECISÃO DO DONO ANTES DE CONSTRUIR**
Existe no pacote só como simulação local. No banco o controle precisa de **regras que o pacote deixa em aberto**:
- o que é "pacote" (é o plano Pro/Elite que já liga o módulo, ou um produto novo?) e **quanto vale a cota diária de cada um**;
- **quem é debitado** quando o match se forma pelo segundo "Estudar junto": só quem completou, só quem escolheu primeiro, ou os
  dois (e o que acontece se um dos dois já não tiver cota quando o match se formaria);
- **quando** debita: no primeiro "Estudar junto", na formação do match ou no aceite do convite; e se recusa, convite vencido ou
  sala fechada **devolvem** a cota;
- validade dos extras e do pacote, renovação diária (o pacote usa 00h de Brasília, que é o que o "N matches hoje" já usa),
  e se os extras acumulam;
- sem pacote ativo, o pacote diz que a cota é **zero**: isso fecharia o módulo para quem não tem pacote. Proposta: ligar a
  cota por uma chave (`app_settings.treino_dupla`, desligada por padrão, como a chave de abertura e os tetos de IA), para o
  módulo continuar funcionando como hoje até o dono definir os valores.
- O que **já está firme** no pacote e entra no desenho: pular um perfil não consome; retomar um par que já existe não consome;
  mensagens não consomem; aviso **"Sua cota de matches acabou"** + "você pode adquirir mais matches" + tela de pacotes; conversas
  continuam acessíveis.
- Reaproveitar: tabela nova de movimentos (livro-caixa) e a função de checagem chamada por `app_dupla_swipe` e pelo convite.
  Os 14 testes do pacote (`study-social.test.cjs`) viram casos de teste do banco (limite exato, concorrência no último crédito,
  virada de dia em Brasília, extras só depois da cota do pacote, compra repetida não duplica).

### 3.3 Convite rápido e convite direto — **DECISÃO DO DONO ANTES DE CONSTRUIR**
No pacote, os dois produzem "match" na hora (o aceite do colega é simulado). **O pacote não diz a diferença entre os dois.** Na
vida real não existe match sem a outra pessoa aceitar. Proposta para o desenho (a confirmar):
- **Convite direto ("Convidar", na lista de quem está online):** cria a sala e um `study_invites` de 60 s para a pessoa, **sem
  esperar o segundo "Estudar junto"** (reaproveita 100% do convite que a Etapa 4 já faz); a pessoa aceita ("Deu match!") ou
  recusa/vence e a sala fecha. Precisa de uma função nova (`app_dupla_invite`) e de um campo "permitir convites diretos" no
  perfil de estudo (o pacote tem a chave "Permitir convites diretos" na tela, sem gravar). **Esta peça é a mesma que o adendo "Praticar sozinho e radar" pede
  (lista de quem está online para convidar): combinar com o outro agente para construir uma vez só.**
- **Convite rápido (o raio no meio dos botões do cartão):** proposta = convite direto para a pessoa do cartão de cima, sem o
  gesto de arrastar. Se o dono quiser outra coisa, precisa dizer.
- Os dois passam pelo mesmo controle de cota que o "Estudar junto" (R14); como a cota espera a decisão, os dois também esperam.
- Já firme: respeitar `radar_visible` (quem está invisível não recebe convite), estar online, não estar em sala; "pular não
  consome".

### 3.4 Compra de pacotes — **NÃO CONSTRUIR AGORA**
- A tela "Adquirir matches" do pacote é **simulada** (`simulatePurchase` soma créditos no navegador): **nunca** vai para o
  banco. A Stripe está parada por ordem do dono (2026-10-10).
- Quando a cota for ligada, a tela aparece como **aviso informativo** ("Sua cota de matches acabou", sem botão de pagar) até a
  Stripe voltar. Para o dono decidir: se a equipe pode conceder créditos à mão pela Administração enquanto isso (é uma
  alternativa, não faz parte do pacote).
- **Preços, quantidades de pacotes extras, validade, moeda e provedor: nada definido; nenhum número entra no código.** Os
  nomes "Mais uma rodada" e "Mais parceiros de treino" e "Preço a definir" são do pacote e podem ficar na tela como rótulo
  temporário só se o dono quiser.

### 3.5 Outros itens novos do pacote (não são de match)
| Item | Decisão deste texto |
|---|---|
| Menu recolhido na sala | entra (P5), é mudança de tela |
| Materiais ("Resumo sobre o tema" e "Flash Card") | o pacote aponta para `/estudar/materiais` e `/revisar/flashcards`, que **não existem** no app (`/novo/materiais` hoje leva a "Atualizações" e os flashcards são `/novo/flash`, não por tema). Entra só **"Resumo sobre o tema"** quando a estação tem `summary` publicado; "Flash Card" fica escondido até haver link por tema. Decisão em §7 (D9) |
| "Sinalizar problema" | continua escondido (spec §3); o pacote só mostra um aviso e a própria LEIA diz que isso não pode afirmar que a equipe foi avisada |
| `TutorIA — Bloqueado`, "Liberar" do PEP | não entram (R19) |

## 4. Ambiguidades do pacote (não resolvi por conta própria)
1. **Número do impresso na tela x texto da folha.** A folha do candidato diz "ler o impresso 1 (relato...)" e "conforme orientação
   do impresso 1", e a lista lateral mostra "Impresso 1 · Aguardando liberação", que é o **esfregaço** (`candidato-ocultar-
   cronometro.png`). O avaliador lê no roteiro "liberar o IMPRESSO 2" e vê "Impresso 1" na tela. O pacote manda assim (LEIA §3
   item 6) e pede que se explique a correspondência ao avaliador. Texto novo para aprovar: "Impresso {display} · no documento
   oficial: Impresso {source}" (só para o avaliador).
2. **Candidato com "Finalizar estação" no rodapé** (`BottomBar`, e na captura). A spec de 09/10 diz que só o avaliador finaliza.
   Mantive a spec; **o candidato fica com "Sair da sala"** (decisão D8 pede confirmação).
3. **Antes de iniciar**, o avaliador pode ver tudo, e no protótipo pode liberar impresso e marcar o PEP. No servidor, liberar e
   marcar só valem com a estação em andamento (`running`); antes disso os botões ficam desligados com a dica "Disponível depois
   de iniciar a estação."
4. **"Tempo esgotado. Estação encerrada."** (aviso do protótipo) afirma que a estação encerra, mas ela segue até o avaliador
   finalizar (spec §8). Fica o selo "Tempo esgotado" e o apito, sem esse aviso.
5. **O que acontece com o candidato se estiver fora da tela quando o avaliador inicia?** O protótipo avisa "O Ator/Avaliador
   iniciou a estação." Aqui o estado vem do servidor: ao voltar, a sala já está em `running` com o tempo certo.
6. **Cota:** quem é debitado, quando, relação pacote x plano (§3.2).
7. **`PROMPT_IA.md` e `README.md` antigos** continuam descrevendo a chamada externa e "sem IA" no corpo; só o cabeçalho foi
   atualizado. Valem os arquivos de 11/10.
8. **Duas cópias do pacote.** `ATUALIZACOES` diz que a cópia atualizada está em `Documents/StaziaMed-Previas/handoff-treino-dupla`
   e que a pasta original no volume do projeto **não foi atualizada** (disco cheio). O dono apontou `treino-dupla-2026-10-11`;
   usei essa. Se existirem as duas, podem divergir: o plano manda conferir antes de ler (tarefa P1).

## 5. Conflitos com regras do dono

### 5.1 IA: "sem IA" no pacote x Praticar sozinho com avaliação por IA (pedido de hoje)
- **Pacote (LEIA §3 item 4):** "Não modificar os critérios oficiais nem gerar pontuação/feedback clínico automaticamente por IA";
  `TutorIA` é um bloco visual bloqueado ("aguarde o médico finalizar a análise"); `PROMPT_IA.md` do dono de 08/10: "sem IA no
  módulo".
- **Spec de 09/10:** "Sem IA neste módulo" e custos "R$ 0 de IA" (§10).
- **Pedido de hoje (2026-10-12), memória `treino-dupla-sozinho-e-radar`:** o Praticar também pode ser **sozinho**, com
  **avaliação por IA** e radar de quem está online; o treino sozinho conta no histórico, marcado "sozinho", sem ranking.
- **Como fica:** o pacote vale para **duas pessoas** (a nota é do avaliador e do PEP oficial, nunca da IA). O modo sozinho é
  outro caso e pede **decisão expressa** (D1): (a) a regra 4 do pacote vale só para a dupla e o sozinho pode ter nota por IA;
  (b) vale para tudo e o sozinho só tem autoavaliação; (c) o sozinho tem IA, mas só **sugere** item a item contra o PEP
  publicado e a pessoa confirma. Minha recomendação: (c), mostrada sempre como "avaliação por IA", separada da nota de dupla,
  contra o PEP oficial da estação, com conferência por IA de **outra empresa** (regra do dono, 2026-10-10) — e isso é do
  adendo do outro agente, não deste texto. Além disso: aluno ver IA de produção só na Administração (memória
  `ia-administrativa-nao-aparece-ao-aluno`) vale para ferramentas de **produção de conteúdo**; a avaliação do sozinho é uma IA
  **do aluno**, como o Tutor, e precisa de plano e custo (tetos de IA estão desligados até liberar aos alunos). O bloco "TutorIA"
  do pacote **não entra** nem na dupla.

### 5.2 Logotipo do INEP
- **Pacote:** a estação 1 tem versões "sem logos" e uma folha única com identidade StaziaMed (`..._sem_logos.pdf`,
  `estacao-01-instrucoes-e-relato-unica.png`).
- **Spec da Montagem de estações (09/10, regra decidida na coordenação):** o logotipo do INEP **nunca é removido**; a marca
  StaziaMed entra por cima ou numa faixa, com o aviso "Material adaptado para fins educacionais — StaziaMed".
- **Decisão D2:** o dono quer a folha **sem** logotipo do INEP (como o pacote) ou **com** (regra da Montagem)? Até lá, nada
  derivado do pacote entra no app, e as imagens do pacote **não são copiadas** (regra do plano: pacote só referência).

### 5.3 "Como os dois conversam" sem o link da chamada
- **Spec de 09/10, §1 e §8:** os dois "conversam por uma chamada externa (Meet, Zoom, Teams ou WhatsApp)", com link gravado na
  sala. O pacote novo **tirou o link** e diz (LEIA §6): "Como ocorrerá a interação falada no treino remoto. O chat combina o
  treino, mas não implementa voz/vídeo. Não reinserir chamada externa nem construir videoconferência sem aprovação."
- **O chat novo bloqueia links e telefones**, então os dois também não conseguem combinar uma chamada por ele.
- **Decisão D3:** (a) seguir o pacote: sem link e sem voz (cada um combina fora do app); (b) manter o campo de link só
  dentro da sala (a coluna `call_link` já existe desde a 9750; a função `app_dupla_set_link` é a do plano antigo, ainda não construída; custo zero); (c) voz/vídeo dentro do app (fora de escopo).
  **Padrão adotado no plano: (a)**, porque o pacote de 11/10 é a ordem mais nova do dono. (b) fica como passo opcional da
  tarefa 16, que só se faz se o dono responder (b).

### 5.4 Tema da estação x Banco de estações, "clique abre o match" e escolha da estação
- **Pacote:** o tema é do ator/avaliador durante o atendimento.
- **Spec de 09/10 (decisões do dono):** o Banco de estações lista as estações **com nome**; clicar numa estação abre o Praticar
  com ela escolhida (faixa mostra o nome); na fase dos papéis **qualquer um dos dois** escolhe a estação.
- **Choque:** quem pode vir a ser candidato já viu o tema ao escolher. **Isso não dá para impedir** se a mesma pessoa escolhe e
  depois treina de candidato. O que dá para garantir é que **o servidor não entrega o tema ao candidato dentro da sala**.
- **Proposta (D4):** (1) dentro da sala, o candidato vê só "Estação N · Área"; o nome aparece para ele no resultado; (2) só o
  **avaliador** escolhe ou troca a estação na sala, e só depois de definidos os papéis; (3) o Banco de estações continua com
  nomes (a tela `Stations.jsx` do pacote não mudou); (4) aceitar, e dizer ao aluno de forma simples, que quem escolhe uma
  estação no Banco já sabe o tema. Se o dono quiser proteger também isso, a única saída é sortear a estação para o par.

## 6. Estações: PDFs do INEP, as 10 de 2020 e a Montagem

### 6.1 O que o pacote traz
- **39 PDFs em 13 pastas** (conferido pelos nomes; **os PDFs não foram abertos**): `2020`, `2020-reaplicacao`, `2021`,
  `2021-reaplicacao`, `2022-1`, `2022-1-reaplicacao`, `2022-2`, `2023-1`, `2023-2`, `2024-1`, `2024-2`, `2025-1`, `2025-2`.
  26 arquivos = 13 edições x (caderno `Prova_Habilidades_Clinicas*.pdf` + PEP). Os outros 13 estão em
  `2020/estacoes_extraidas`: as **10 estações de 2020 separadas** (`Estacao_01…10`, por área) e **3 versões editadas da
  estação 1** (instruções "sem logos", relato "sem logos" e "sem logos sem descrição").
- `2025-2` traz `PEP_Preliminar.pdf` (não é o definitivo; `2025-1` traz `PEP_Definitivo.pdf`).
- O pacote diz que "guardar PDFs na pasta não cadastra estações no sistema": **são as 10 de 2020** que estão cadastradas
  (`stations-inep2020.js`), e só a **estação 1 tem roteiro do ator** (10 blocos, fornecido pelo dono; vários "Não consta no
  script."). As outras 9 têm `actor: []`; o pacote manda não apresentar roteiro editorial como se fosse oficial.
- A LEIA manda **não** publicar a pasta de PDFs num diretório público do app (os PEPs são de uso controlado por papel).

### 6.2 Relação com o que existe
| Assunto | Hoje | Com o pacote novo |
|---|---|---|
| Estações de teste (`teste-inep2020-eNN`) | 10 estações geradas do pacote de 08/10, só nos testes e no banco local; a carga do Supabase recusa esse prefixo; `actor_script` vazio em todas | E1 ganha o roteiro, o relato como impresso inicial e o esfregaço com `display_number 1`; continuam **só dado de teste** |
| Fonte oficial da Montagem | 13 edições, **26 PDFs** (cadernos e PEPs), em `/Volumes/Samsung/…/fontes_oficiais/INEP_Revalida_Habilidades_Clinicas/`; PEPs de 2020 e o caderno da reaplicação de 2020 são escaneados; 2025/2 tem PEP **preliminar** | O pacote diz que copiou os mesmos 26 arquivos "sem alteração". **Não conferi por soma de verificação** (não abri PDF nenhum): fazer na tarefa P1 só comparando tamanho e `shasum` dos 26, antes de tratar como a mesma fonte |
| Roteiro do ator das outras estações | "O roteiro do ator está no PEP" ("a paciente simulada deverá informar que…"); vem da **extração da Montagem** (PEP de 2020 é escaneado: OCR) | Nada muda: as 9 outras estações de 2020 recebem roteiro **pela Montagem**, com revisão médica e página de origem, não por texto do pacote |
| Imagens dos impressos e da folha do candidato | `pressing_assets` → `station_assets` (Montagem); `image_url` nulo nos testes | A folha única do pacote é **derivado com marca** (e **sem logo do INEP**: conflito 5.2). Quando a Montagem gerar a folha do candidato (modelo da 2ª fase, 2025/1, decidido em 10/10), o Treino a lê pelo mesmo caminho; **nada de imagem do pacote é copiado** |
| Primeira estação real | Montagem: edição **2024/1, estação 1** é o teste real | O pacote traz a estação 1 de **2020** pronta no visual. Para o dono decidir (D5): usar 2020/E1 como primeira estação publicada (já tem roteiro) ou seguir a ordem da Montagem (2024/1) |
| Publicar todas as edições | — | **Não** (LEIA: "Incluir as provas na pasta não significa importar automaticamente"); importar só pela Montagem, uma por vez, com revisão |

## 7. Decisões para o dono (curtas) e ordem recomendada

### 7.1 Sim / não / valor
| # | Pergunta | Opções | Minha recomendação | Bloqueia |
|---|---|---|---|---|
| D1 | Praticar sozinho tem **IA que dá nota**? (conflito 5.1) | (a) vale a regra do pacote só na dupla e o sozinho pode ter nota por IA; (b) sem IA no sozinho; (c) IA **sugere** contra o PEP, a pessoa confirma | (c) | o adendo do sozinho, não esta etapa |
| D2 | Folha do candidato **sem logotipo do INEP** (como o pacote) ou **com**? | sem / com | com a marca por cima (regra da Montagem), até você dizer o contrário | imagens da folha (não bloqueia a Etapa P) |
| D3 | Como os dois falam durante o treino? | (a) fora do app, sem link; (b) campo de link só na sala; (c) voz dentro do app | (a), como o pacote; (b) é fácil de religar | só o passo opcional da tarefa 16 |
| D4 | Tema só para o avaliador e **só o avaliador escolhe a estação**? | sim / não | sim, com o aviso ao aluno | Etapa P |
| D5 | Primeira estação publicada para o aluno | 2020/E1 (tem roteiro) ou 2024/1/E1 (ordem da Montagem) | 2024/1/E1 (fonte mais nova), e 2020/E1 só depois de conferir o roteiro | publicação, não construção |
| D6 | Chat: denúncia e bloqueio; tempo de guarda das mensagens; quem da equipe lê; parágrafo na Política de Privacidade | valores seus | bloquear e denunciar **sim**; guarda: **valor seu**; leitura pela equipe só em denúncia | a parte de moderação do chat |
| D7 | Cota por pacote: o que é "pacote" (plano atual ou novo)? quanto por dia? **quem** é debitado e **quando**? devolve se recusar/vencer? validade dos extras? | valores seus | ligar por chave desligada; débito dos **dois** na formação do match; devolve se a sala fecha sem ninguém entrar | etapa Q inteira |
| D8 | O candidato pode "Finalizar estação"? | sim / não | não (só o avaliador; candidato "Sair da sala") | tarefa 17 |
| D9 | "Materiais" na sala do avaliador | só "Resumo" quando existir / nada / com flashcards por tema (precisa de obra nova) | só "Resumo" quando existir | pequeno |
| D10 | "Sinalizar problema" | continua escondido / registro real (tabela e tela na Administração) | continua escondido | nada |
| D11 | Convite rápido e direto: aceitar o desenho da §3.3, incluindo o campo "permitir convites diretos" | sim / não / outra ideia | sim, junto com o adendo do radar | etapa V |
| D12 | Compra: manter parada; tela só informativa? A equipe pode dar créditos à mão? | valores seus | parada; informativa; créditos à mão **só se** você quiser | nada agora |

### 7.2 Ordem recomendada
1. **Etapa P** (ajustar o que já existe ao pacote novo; só depende de D4 e é seguro): R1 a R10 da sala, sem escopo comercial.
2. **Etapas 5, 6 e 7** revisadas (sala ao vivo, resultado, celular, ponta a ponta). Aqui o módulo de **dupla** fica completo.
3. **Etapa C** (chat) — depois das 7, com D6 só para a moderação.
4. **Etapa V** (convite direto/rápido) — junto com o adendo do radar, depois de D11.
5. **Etapa Q** (cota) — só com D7 respondida; liga por chave.
6. **Compra** — só quando a Stripe voltar.
Publicação continua como na spec de 09/10 (§13): só com ordem sua, por etapa.

## 8. O que foi lido
`ATUALIZACOES_2026-10-11.md`, `LEIA_PRIMEIRO_IA_OPERACIONALIZACAO.md` e `ui_kits/treino-dupla/MATCH-CHAT-REGRAS.md` inteiros;
`diff` completo de `App.jsx`, `Match.jsx`, `Room.jsx`, `Setup.jsx`, `Sidebar.jsx`, `stations-inep2020.js`, `index.html` e dos
avisos de `README.md`/`PROMPT_IA.md`; `Room.jsx` novo inteiro; `study-social.js` inteiro; textos de `StudyChat.jsx`; 4 dos 6
PNGs (cota, rodapé do avaliador, cronômetro do candidato, chat); nomes dos 39 PDFs. **Não foram abertos:** nenhum PDF; nenhum
arquivo do pacote foi executado ou copiado.

## Decisões do dono (2026-10-12) sobre D1–D12 desta spec — valem sobre qualquer recomendação acima

| # | Resposta do dono |
|---|---|
| D1 | A IA no Praticar **sozinho** vale (o pedido do dono manda sobre o "sem IA" do pacote). Ela **escuta a prática** e dá **feedback conforme a engenharia reversa das estações e o que a Matriz do INEP cobra**. (Voz ao vivo é o destino; a narração escrita vem primeiro. Ver adendo do sozinho.) |
| D2 | Folha do candidato com o **logotipo do Revalida** e, junto, o nome **StaziaMed**; **sem demais logos** |
| D3 | Os dois conversam **fora do app** (sem link, como o pacote) |
| D4 | **Sim**: tema só para o avaliador e só o avaliador escolhe a estação, com aviso ao aluno |
| D5 | **Quer VER as duas primeiro** (2020/E1 e 2024/1/E1) antes de decidir. Nada publicado ao aluno até lá |
| D6 | Chat: as mensagens **se apagam a cada 24 horas**; **denúncia** enviada vai à equipe; a equipe tem **acesso a todas as conversas** denunciadas (leitura da equipe via denúncia). Bloqueio/denúncia: sim |
| D7 | Cada match é cobrado do **crédito diário** de cada aluno, **de ambos** os participantes. Pacote, quantidade por dia, devolução e validade: ainda a definir (o dono enviará o método de engenharia do match e da cobrança) |
| D8 | **Não**: o candidato não finaliza a estação |
| D9 | Na sala do avaliador: **resumo, impressos, controle do cronômetro e marcação do PEP** |
| D10 | "Sinalizar problema" **abre uma janela** onde o usuário envia mensagem à equipe de suporte, e **aparece na Administração**: criar campo/aba no menu da Administração para esses sinais |
| D11 | Convite rápido e direto: aceitar o desenho do plano (junto com o radar) — resposta não escrita explicitamente pelo dono, adotada conforme a recomendação; confirmar |
| D12 | Compra **parada**, tela só informativa; o dono enviará o método de engenharia do match e da cobrança |
