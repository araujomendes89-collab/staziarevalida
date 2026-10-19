# Treino em Dupla: fluxo simples (ator escolhe, convida e inicia)

Data: 19/10/2026. Base: ramo `fase2-etapa2` (8f4b20b3), que já junta radar, convite, @, match e treino sozinho sobre o main d22f69c6.
Pedido do dono depois do primeiro treino real (18/10, 21h51): "o fluxo está estranho, muito burocrático e diferente das outras
plataformas, estilo Pense Revalida; quem escolhe a estação é o ator/avaliador; podemos melhorar as telas e o fluxo".

## 1. Objetivo e critério de sucesso

- Do convite aceito ao atendimento começar: **um toque do ator** ("Iniciar estação"). Hoje são 5 etapas (papéis, conexão,
  pronto, confirmar e iniciar).
- **O ator escolhe a estação.** O candidato só vê a estação quando o atendimento começa, como na prova.
- **Telas limpas:** o ator vê roteiro, impressos e PEP; o candidato vê só a folha e os impressos liberados.
- O dono e a equipe repetem o teste com duas contas (computador e celular) e acham o fluxo direto.

## 2. Decisões do dono (19/10, perguntas 1 a 8)

| # | Decisão |
|---|---|
| 1 | O candidato entra pela **lista de colegas online dentro do app** (não por link). |
| 2 | **Só o ator convida.** Quem convida é o ator; quem é convidado é o candidato. |
| 2b | No fim, **"mesmo papel" ou "trocar de papel"**, à escolha (trocar não é obrigatório). |
| 3 | A conversa acontece **por fora** (WhatsApp, Meet ou ligação). **Sem botão de link de chamada** no app. |
| 4 | **Um botão só:** o ator aperta "Iniciar estação" e os 10 minutos começam na hora, com a folha aparecendo ao candidato. |
| 5 | **Um comentário opcional** do ator e "Enviar nota"; o candidato **pode pedir revisão**. |
| 6 | **Dois caminhos** para começar: pela estação ou pelo colega. **Sem "Sortear estação".** |
| 7 | O **match** (baralho e "Deu match!") **fica como opção secundária**. |
| 8 | A lista tem **duas abas: "Online" e "Perto de você"**. A aba "Ator" sai. |

## 2b. Decisões do dono (19/10, segunda rodada)

- Convite **por link do @ sai** (botão e rota); fica só a lista.
- Match: os papéis seguem **as escolhas de cada pessoa** no perfil (mecanismo atual, `dupla_assign`), sem regra nova.
- Match: se quem escolheu a estação virar candidato, **a estação é limpa** e o ator escolhe outra.
- O menu da 2ª fase **continua "Praticar"** (dá para praticar sozinho com IA).
- Execução: um agente por tarefa e outro confere antes da próxima. **Nenhum modelo do Vertex/Gemini** (nem para revisar).

## 2c. Decisões do dono (19/10, terceira rodada)

- **DONO-1 — o ator não vê a porta.** Durante os 2 s do apito o ator continua na tela dele (roteiro, impressos que pode liberar
  e PEP) e ouve o apito normalmente. Só o candidato vê a porta abrindo.
- **DONO-2 — nada da estação chega ao aparelho do candidato antes do início marcado** (toque do ator + 2 s do apito). Durante
  os 2 s o candidato recebe só a porta (número da área) e o horário de abertura; quando a porta abre, a tela dele pede o
  conteúdo de novo e só então recebe a folha. Isso vale no banco (não só na tela) e tem teste de banco.

## 3. Fluxo

1. **Começar (ator).**
   - Pela estação: Banco de estações → toca na estação → janela "Como você quer treinar?" → **Em dupla** → lista de colegas
     → **Convidar**.
   - Pelo colega: aba "Treinar em dupla" → lista (Online | Perto de você) → toca no colega → escolhe a estação (lista do
     Banco de estações, mesma busca e filtros; nesta entrega, busca e grupos por área — ver §5b, C3) → **Convidar**.
2. **Convite (candidato).** Aviso "Fulano te chamou para treinar como candidato" com **Aceitar** ou **Recusar**. O convite
   não mostra a estação, a área nem a origem. Vale 60 s (regra do radar, 014000). Recusa ou fim do prazo avisam o ator.
3. **Sala (ao aceitar).** Nasce com papéis e estação definidos, direto na fase de preparação.
   - Ator: roteiro, impressos e PEP para ler, e **"Iniciar estação"**.
   - Candidato: **só o desenho de uma porta com um número** (decisão do dono, 19/10). Nada de nome, tema, origem ou folha.
     O número é a porta da área, como na prova:

     | Porta | Área |
     |---|---|
     | 1 | Clínica Médica |
     | 2 | Cirurgia Geral |
     | 3 | Pediatria |
     | 4 | Ginecologia e Obstetrícia |
     | 5 | Medicina de Família e Comunidade / Saúde Coletiva |

     **A porta já aparece com o número desde a entrada na sala** (dono, 19/10: "na prova real ele já fica de frente para a
     porta"). No convite a estação vem escolhida, então a porta nasce numerada. No match e na rodada nova, enquanto o ator
     ainda escolhe, o candidato vê só "O ator está escolhendo a estação" (sem porta); a porta numerada aparece assim que a
     estação é escolhida. Nunca há porta sem número.
4. **Início com apito e porta, sincronizados** (dono, 19/10: "é como se o aluno estivesse entrando na sala real"). O ator
   aperta "Iniciar estação". O servidor marca o **início = toque do ator + duração do apito (2 s)**, e os dois aparelhos seguem
   o relógio do servidor (não o clique), para ficarem em sincronia:
   - **Os dois ouvem o apito** (o que já existe, 2 s), ao mesmo tempo.
   - **Só o candidato vê a porta abrindo** (DONO-1). A porta abre durante o apito e, quando o apito termina, o candidato
     "entra": a tela pede o conteúdo de novo ao servidor, recebe a folha e os 10 minutos começam.
   - **O ator não vê porta** (DONO-1): durante os 2 s ele continua na tela dele (roteiro, impressos que pode liberar e PEP),
     com o cronômetro parado nos 10 minutos até a porta abrir.
   - **Durante os 2 s o aparelho do candidato não recebe nada da estação** (DONO-2): só a porta (número da área) e o horário
     de abertura (e a hora do servidor). A folha, os impressos (inclusive os que o ator liberar nesses 2 s), a imagem da folha,
     a duração e o fim do cronômetro só saem do servidor depois do início marcado.
   Com som desligado, a porta abre no mesmo tempo sem som; com movimento reduzido, a porta troca sem animação. Se o aparelho
   pedir o conteúdo um instante antes (relógio adiantado), o servidor ainda não entrega: a porta fica aberta com "A estação vai
   começar" e a tela pede de novo a cada segundo até chegar.
5. **Atendimento (10 min).** O candidato vê a folha e os impressos liberados; o ator libera impressos e marca o PEP. Termina
   pelo tempo ou por **"Encerrar"** do ator.
6. **Nota.** O ator confere o PEP, escreve um comentário opcional e aperta **"Enviar nota"**. Os dois veem a nota, os itens e
   o comentário. O candidato pode **"Pedir revisão"**; o ator revisa (mantém ou muda), como já existe hoje.
7. **Depois.** **"Nova estação · mesmo papel"**, **"Nova estação · trocar de papel"** e **"Sair"**. A sala continua com os
   dois; quem for ator na rodada nova escolhe a estação dentro da sala (lista do Banco de estações).
8. **Match (secundário) = o mecanismo que já existe (dono, 19/10).** A pessoa preenche o perfil de estudo com as preferências
   dela (`app_dupla_save_profile`: papel preferido, áreas, horários etc.) e o sistema busca pessoas compatíveis (baralho,
   `app_dupla_deck` / `app_dupla_swipe`, "Deu match!"). Os papéis saem das preferências como hoje (`dupla_assign`), com a
   escolha de papéis que já existe só quando as preferências não decidem. Nada disso muda. Depois do match, a sala segue o
   fluxo novo: o ator escolhe a estação na sala e daí segue do passo 3 (preparação → "Iniciar estação").

## 4. O que muda no banco (sobre o ramo fase2-etapa2)

Regra de sempre: cada função parte da definição mais nova (ramo `fase2-etapa2` e produção) e só reaplica o acréscimo;
número de migração reservado em `.tmp-aulas/NUMEROS-MIGRACAO.md`; desfazer para cada migração; ensaio em produção com
ROLLBACK antes de gravar.

- **Convite com papéis fixos.** `dupla_invite_core` / `app_dupla_invite`: quem convida vira `evaluator_id`, o convidado vira
  `candidate_id` (ignora `role_pref` e `dupla_assign` no convite direto). A estação é obrigatória no convite direto. Ao aceitar
  (`app_dupla_answer_invite`), a sala vai direto para `setup`, sem passar por `roles`/`connecting`.
- **Iniciar só pelo ator.** `app_dupla_start` aceita a chamada do avaliador em `setup` sem exigir `ready_ids`/`confirmed_ids`
  nem conexão dos dois. `app_dupla_ready`, `app_dupla_confirm_roles` e `app_dupla_connected` continuam existindo para o match e
  para as salas antigas, mas o caminho do convite não depende delas.
- **Nova rodada.** `app_dupla_next_station` ganha a escolha "mesmo papel" | "trocar"; a sala volta a `setup` com a estação
  vazia, e só o ator da rodada escolhe a estação (`app_dupla_set_station`).
- **Match.** Perfil, baralho, compatibilidade e `dupla_assign` não mudam. A sala do match nasce em `roles` como hoje; definidos os
  papéis, vai direto a `setup` (sem `connecting`, "pronto" e "confirmar"), e o ator escolhe a estação ali.
- **Nota.** O comentário único usa `feedback_gen`; `feedback_pos`/`feedback_neg` ficam vazios (colunas mantidas). O pedido de
  revisão (`app_dupla_request_review`, `app_dupla_redo_review`) não muda.
- **Lista.** `app_dupla_radar` deixa de entregar a aba "Ator"; ficam "Online" e "Perto de você".
- **Segurança (não pode regredir):**
  - O sigilo **não depende só da fase**: para quem não é o ator, nada da estação sai do banco **antes do início marcado**
    (`started_at` nulo ou `now() < started_at`, DONO-2) — nem nome, tema, número da estação, área por escrito, origem, versão
    do conteúdo, id, duração, fim do cronômetro, folha, impressos (iniciais ou liberados) ou imagem. Antes disso saem só a
    **porta** (número da área), o **horário de abertura** (`started_at`) e a hora do servidor (`server_now`). Vale no convite
    (nem a porta), no estado da sala, no conteúdo por papel, na imagem do impresso/folha (que é a base da URL assinada) e no
    resultado e no histórico (caso o ator encerrasse e enviasse a nota durante o apito). O ator recebe tudo, sempre.
  - Aluno comum continua sem acesso (2ª fase só equipe, chave `treino_dupla` desligada); estação pendente só entre duas
    pessoas da equipe (`dupla_station_liberada`).

## 5. O que muda nas telas (src/novo/app/dupla)

- `StationsScreen.jsx`: "Em dupla" abre a lista de colegas com a estação já escolhida.
- `RadarScreen.jsx`: abas Online e Perto de você; ao tocar num colega sem estação escolhida, abre a escolha de estação; botão
  "Convidar". Sai a aba Ator.
- Aviso de convite (candidato): Aceitar/Recusar, sem dados da estação.
- `room/*`: some a tela de papéis/conexão/pronto no caminho do convite; preparação do ator com "Iniciar estação"; espera do
  candidato; resultado com um comentário opcional; fim com "mesmo papel", "trocar de papel" e "Sair". Sem campo nem botão de
  link de chamada.
- Celular: nenhuma janela ou botão escondido pela barra de baixo (z-modal 90, ade3ef1e); botões principais ao alcance do polegar.

## 5b. Variações aceitas na execução (varredura do plano, 19/10)

- **C1:** a sala do convite direto **nasce em `setup` já no convite** (não só ao aceitar); o "Iniciar estação" fica travado
  até o aceite. Para o candidato o efeito é o mesmo (só entra ao aceitar); o ator já lê a estação durante os 60 s, o que já é
  direito dele.
- **C2:** na sala do match ainda nos papéis (convite pendente ou os dois com "qualquer papel"), o candidato vê a tela dos
  papéis, não "O ator está escolhendo a estação"; esse texto aparece em `setup` sem estação.
- **C3 (pendência para o dono):** ao convidar pelo colega, a escolha de estação usa o seletor da sala (busca + grupos por
  área), **sem todos os filtros do Banco de estações**. Filtros completos ficam para depois, se o dono quiser.
- **C5:** pausar ou "+1 min" durante os 2 s do apito pode deixar até 2 s a mais no cronômetro (ex.: 10:01 depois de
  retomar). Raro e inofensivo.

## 6. Fora deste trabalho

Vídeo dentro do app; sortear estação; avaliação por IA e créditos (seguem desligados); abrir a 2ª fase aos alunos (regra de
acesso por fase e cadeado continuam pendentes); limites de convite e números de créditos (perguntas abertas ao dono).

## 7. Testes

- Banco (PGlite, todas as migrações): convite direto cria sala em `setup` com papéis fixos; candidato não recebe dados da
  estação em nenhuma fase antes de `running`; só o ator inicia, libera, marca, encerra e envia a nota; nova rodada com "mesmo
  papel" e "trocar"; match continua funcionando; aluno e visitante recusados.
- Banco, DONO-2 (obrigatório): com o início marcado no futuro, o candidato não recebe a folha nem nada da estação (estado,
  conteúdo, impressos liberados, imagem da folha, resultado e histórico), só a porta, o horário de abertura e a hora do
  servidor; o ator recebe tudo; depois do horário (no teste, o início é trazido para o passado, porque no PGlite o `now()` é
  fixo na transação) o candidato recebe. Vale também com o início de verdade (`app_dupla_start`, 2 s à frente).
- Telas: fluxo pela estação e pelo colega; convite aceito/recusado/expirado; preparação, atendimento, nota, revisão e fim.
  Porta só na tela do candidato; o ator fica na tela de trabalho e ouve o apito (DONO-1); ao abrir a porta, a tela do
  candidato pede estado e conteúdo de novo e só então mostra a folha (DONO-2).
- `apoioVarredura` e `fase2PublicacaoEquipe` passam; suíte inteira comparada ao main; build.
- Ensaio em produção com ROLLBACK (cadeia da etapa 2 + migrações novas), conferências da base (53) e da etapa 2 (22) ok.
- Teste manual do dono com duas contas da equipe (computador e celular) antes de qualquer abertura aos alunos.
