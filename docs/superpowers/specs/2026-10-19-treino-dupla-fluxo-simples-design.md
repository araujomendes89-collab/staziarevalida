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

## 3. Fluxo

1. **Começar (ator).**
   - Pela estação: Banco de estações → toca na estação → janela "Como você quer treinar?" → **Em dupla** → lista de colegas
     → **Convidar**.
   - Pelo colega: aba "Treinar em dupla" → lista (Online | Perto de você) → toca no colega → escolhe a estação (lista do
     Banco de estações, mesma busca e filtros) → **Convidar**.
2. **Convite (candidato).** Aviso "Fulano te chamou para treinar como candidato" com **Aceitar** ou **Recusar**. O convite
   não mostra a estação, a área nem a origem. Vale 60 s (regra do radar, 014000). Recusa ou fim do prazo avisam o ator.
3. **Sala (ao aceitar).** Nasce com papéis e estação definidos, direto na fase de preparação.
   - Ator: roteiro, impressos e PEP para ler, e **"Iniciar estação"**.
   - Candidato: "Aguardando o ator iniciar" (sem número, nome, área ou origem da estação).
4. **Atendimento (10 min).** O candidato vê a folha e os impressos liberados; o ator libera impressos e marca o PEP. Termina
   pelo tempo ou por **"Encerrar"** do ator.
5. **Nota.** O ator confere o PEP, escreve um comentário opcional e aperta **"Enviar nota"**. Os dois veem a nota, os itens e
   o comentário. O candidato pode **"Pedir revisão"**; o ator revisa (mantém ou muda), como já existe hoje.
6. **Depois.** **"Nova estação · mesmo papel"**, **"Nova estação · trocar de papel"** e **"Sair"**. A sala continua com os
   dois; quem for ator na rodada nova escolhe a estação dentro da sala (lista do Banco de estações).
7. **Match (secundário) = o mecanismo que já existe (dono, 19/10).** A pessoa preenche o perfil de estudo com as preferências
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
- **Match.** Depois do match, a sala nasce em `roles` como hoje; a escolha de quem é o ator leva direto a `setup`.
- **Nota.** O comentário único usa `feedback_gen`; `feedback_pos`/`feedback_neg` ficam vazios (colunas mantidas). O pedido de
  revisão (`app_dupla_request_review`, `app_dupla_redo_review`) não muda.
- **Lista.** `app_dupla_radar` deixa de entregar a aba "Ator"; ficam "Online" e "Perto de você".
- **Segurança (não pode regredir):** o candidato nunca recebe nome, número, área, origem, versão do conteúdo nem id da estação
  antes de `running` (inclusive no convite e na sala em `setup`); aluno comum continua sem acesso (2ª fase só equipe, chave
  `treino_dupla` desligada); estação pendente só entre duas pessoas da equipe (`dupla_station_liberada`).

## 5. O que muda nas telas (src/novo/app/dupla)

- `StationsScreen.jsx`: "Em dupla" abre a lista de colegas com a estação já escolhida.
- `RadarScreen.jsx`: abas Online e Perto de você; ao tocar num colega sem estação escolhida, abre a escolha de estação; botão
  "Convidar". Sai a aba Ator.
- Aviso de convite (candidato): Aceitar/Recusar, sem dados da estação.
- `room/*`: some a tela de papéis/conexão/pronto no caminho do convite; preparação do ator com "Iniciar estação"; espera do
  candidato; resultado com um comentário opcional; fim com "mesmo papel", "trocar de papel" e "Sair". Sem campo nem botão de
  link de chamada.
- Celular: nenhuma janela ou botão escondido pela barra de baixo (z-modal 90, ade3ef1e); botões principais ao alcance do polegar.

## 6. Fora deste trabalho

Vídeo dentro do app; sortear estação; avaliação por IA e créditos (seguem desligados); abrir a 2ª fase aos alunos (regra de
acesso por fase e cadeado continuam pendentes); limites de convite e números de créditos (perguntas abertas ao dono).

## 7. Testes

- Banco (PGlite, todas as migrações): convite direto cria sala em `setup` com papéis fixos; candidato não recebe dados da
  estação em nenhuma fase antes de `running`; só o ator inicia, libera, marca, encerra e envia a nota; nova rodada com "mesmo
  papel" e "trocar"; match continua funcionando; aluno e visitante recusados.
- Telas: fluxo pela estação e pelo colega; convite aceito/recusado/expirado; preparação, atendimento, nota, revisão e fim.
- `apoioVarredura` e `fase2PublicacaoEquipe` passam; suíte inteira comparada ao main; build.
- Ensaio em produção com ROLLBACK (cadeia da etapa 2 + migrações novas), conferências da base (53) e da etapa 2 (22) ok.
- Teste manual do dono com duas contas da equipe (computador e celular) antes de qualquer abertura aos alunos.
