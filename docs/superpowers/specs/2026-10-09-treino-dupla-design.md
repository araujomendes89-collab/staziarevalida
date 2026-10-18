# Treinamento em Dupla (2ª Fase) — especificação

Data: 2026-10-09. Escrito para: o dono do produto (o que muda, quanto custa e o que ele decide) e quem for construir e manter.
Origem: o pedido "Prompt para a IA implementar o Treinamento em Dupla" (08/10), o pacote de design
`/Volumes/Samsung/STAZIAMED REVALIDA/handoff-treino-dupla` (README.md; PROMPT_IA.md é a fonte dos requisitos) e as decisões do
dono de 08 e 09/10. Esta especificação é o pacote ajustado ao app que já existe (`/novo`, Supabase, Banco de estações). Onde
diverge do pacote, o motivo está escrito. Levantamento do pacote, do app e do banco: `.superpowers/sdd/treino-dupla/levantamento.md`.

## 1. O pedido e o resultado esperado
Dois alunos se encontram pelo match ("deslizar o cartão"), definem os papéis (Candidato ↔ Ator/Avaliador), conversam por uma
chamada externa (Meet, Zoom, Teams ou WhatsApp, fora do app) e fazem uma estação publicada no Banco de estações, com cronômetro
do servidor, liberação de impressos e checklist PEP no estilo INEP. O avaliador confere a nota e escreve o feedback; o candidato
recebe o resultado; depois os dois invertem os papéis. **Sem IA neste módulo. Nenhum dado inventado: o que não existe no banco
fica vazio ou com um TODO claro.** Textos exatamente como no protótipo; vírgula decimal ("7,25 / 10,00").

Critério de aceite: (1) dois alunos reais, em dois aparelhos, fazem o fluxo inteiro (match → papéis → conexão → preparação →
estação → conferência → resultado → inverter papéis); (2) recarregar a página volta à mesma fase; (3) o candidato nunca recebe
roteiro, PEP nem impresso não liberado, nem pela rede; (4) o cronômetro vem do servidor e mostra o mesmo tempo nos dois aparelhos
(±1 s); (5) a nota é calculada no servidor a partir das marcações; (6) com a chave desligada o aluno continua vendo "2ª Fase · Em
breve"; ligada, quem não tem o plano vê o convite do plano; (7) funciona no banco local sem tempo real (consulta periódica) e no
Supabase com Realtime; (8) cada etapa termina com lint, typecheck, testes e "como testar", e só segue com a confirmação do dono.

## 2. Decisões
| Assunto | Decisão | De quem |
|---|---|---|
| Visual | Fontes e cores do app (Plus Jakarta Sans, JetBrains Mono, verdes do DS, modo noite que já existe, com a escolha salva no perfil). Do pacote entram só cores novas (fundo claro e texto das áreas, papéis, pontuação, azul do PEP INEP), com nomes novos, sem mudar token existente | dono (08–09/10) |
| Onde ficam as estações | No Banco de estações que já existe (`checklist_stations` + `checklist_station_contents`, com revisão médica), ampliado onde preciso. Sem tabela paralela; o conteúdo segue o formato que a Montagem de estações publica | dono (09/10) |
| Clique numa estação | Abre o match com a estação escolhida; deu match, a sala abre nela | dono (09/10) |
| Planos e custos | Quem usa o módulo é um ajuste do dono (padrão: Pro e Elite; o teste grátis vê o convite do plano). Custos na §10 | dono (09/10) |
| Tabelas | Reaproveitar `checklist_rooms`, `study_invites` e `checklist_study_sessions`; novas só as que não existem (§5) | coordenação |
| Estações do INEP 2020 do pacote | Não entram em produção (vêm da Montagem, dos PDFs oficiais, com revisão médica); só como dado de teste | coordenação |
| Botões sem lastro no plano | Escondidos (§3). Pessoas, salas e a seção "PROTÓTIPO" do protótipo não vão para o app | coordenação |
| Banco local | Sem tempo real: as telas consultam as mesmas funções de estado de tempos em tempos; no Supabase, Realtime | coordenação |
| Abertura | O aluno segue com "2ª Fase · Em breve" até o dono ligar a chave (§9) | coordenação |
| Conteúdo da estação | Lido só por funções que separam por papel; a leitura direta de `checklist_station_contents` fica só para a equipe | ajuste meu: hoje qualquer aluno Pro leria roteiro e PEP |
| Escrita na sala | Só por funções `app_dupla_*` (o servidor marca hora, papel e fase). Saem as políticas de gravação direta e a máquina antiga em `state` (nenhum código usa) | ajuste meu |
| Controle da estação | Iniciar, pausar, ±1 min, liberar impresso e finalizar: só o avaliador (o protótipo mostrava ao candidato) | ajuste meu |
| "Online" | Para o banco: sinal a cada 45 s nas telas do módulo (2 min sem sinal = fora). A Presença do Realtime só atualiza contador e selos na hora | ajuste meu: o banco não enxerga a Presença |
| Match | Forma-se no segundo "Estudar junto", com os dois online; a escolha vale 7 dias e depois a pessoa volta ao baralho; a porcentagem é a do protótipo (vista de quem olha) | ajuste meu |
| Aviso a quem deu o primeiro "Estudar junto" | Por `study_invites` (60 s), que já existe e já está no Realtime | ajuste meu |
| Revisão da nota | O candidato pede na tela de resultado, com motivo; o avaliador pode "Rever a nota" uma vez; a nota anterior fica guardada | ajuste meu: o pacote não diz quem revisa |
| Anotações do avaliador | Rascunho só no navegador dele; o que for para o candidato vai no feedback | ajuste meu: a sessão salva é lida pelos dois |
| Banco de estações | "Sua última nota" (a última, como no README); "Média geral" só com 5 avaliações ou mais; dificuldade e a ordem "Dificuldade" escondidas (o banco não tem esse dado) | ajuste meu |
| Conta excluída | A avaliação fica para o parceiro, sem o vínculo ("Conta excluída"); hoje a exclusão apagaria o histórico dos dois | ajuste meu |
| Link da chamada | Apagado quando a sala fecha | ajuste meu |

## 3. Fora desta etapa
Escondidos: Agendar sessão, Enviar mensagem, grupo de duplas no WhatsApp, Simulado de prova, Busca automática de duplas (radar e
modais de busca e convite), Permitir convites diretos, Convidar e Convite rápido, abas Online / Atores / Salas abertas (a coluna
direita do Praticar sai inteira), Sinalizar problema, sino e busca ⌘K da barra do pacote, "Envio de foto em breve".
Também fora: PEP oficial com as páginas originais na sala (o formato publicado não traz as páginas; volta quando a Montagem
publicar), Meus PEPs, Desempenho prático, Teoria, Início da 2ª fase e Paciente simulado ligados aos dados (seguem "Em breve" para
o aluno, §9), limite de sessões por plano, vídeo dentro do app.

## 4. As 7 etapas
Cada etapa termina com `npm run lint` (é o typecheck, `tsc --noEmit`), `npx vitest run --maxWorkers=3`, a lista de arquivos e
migrações, "como testar" e os TODO. **Não se avança sem a confirmação do dono.**

### Etapa 1 — Cores, componentes e modo dia/noite
- **Entrega:** tokens novos em `src/novo/ds/tokens/`, dia e noite, com os valores do pacote escritos por extenso (o `--blue-600`
  do pacote não é o do app): `--area-{clinica,cirurgia,go,pediatria,preventiva}-{soft,ink}` (a cor base segue a do app),
  `--role-candidate` (#2E68A6) e `--role-actor` (#9A5631) com `-soft`/`-ink`, `--score-full|partial|none|pending` (#2C7F49,
  #D08C1A, #BD4332, #BCC5C4) e `--inep-blue-900…50`. Componentes que faltam no DS, no padrão dele: Dialog (painel de baixo no
  celular), Toast, Accordion, Textarea, Timer, PrintItem, StationCard, MatchCard (limiar 110 px, rotação dx/22, saída 260 ms,
  volta 220 ms, `transform` direto, `touch-action: pan-y`), tabela do PEP INEP e StatTile. Ícones pelo `<Icon>` do app, sem
  `lucide-react`. O tema já vem do perfil; um script curto no `novo.html` aplica o último tema guardado antes da primeira
  pintura (hoje a tela pisca clara até o perfil chegar). Nada de `#fff` fixo.
- **Como testar:** vitrine dos componentes só no desenvolvimento (`/novo/vitrine-dupla`, fora do build), nos dois temas; testes
  de componente (arrasto, teclado, Esc, foco).
- **O dono confirma:** as cores novas ao lado das do app, dia e noite, e os componentes.

### Etapa 2 — Banco de dados com RLS
- **Entrega:** migração `20261003006500_treino_dupla_dados.sql` (§5): tabelas e colunas novas, RLS, chave `treino_dupla` e a
  regra de acesso (§9), autorização dos canais do Realtime (§6), exportação de dados e exclusão de conta ajustadas. Dado de
  teste: as 10 estações do INEP 2020 do pacote convertidas para o formato publicado, só nos testes e no banco local (id
  `teste-inep2020-eNN`; a carga do Supabase recusa esse prefixo).
- **Como testar:** `npx vitest run src/__tests__/supabaseSchema.test.ts` (PGlite com as regras reais): aluno não lê perfil de
  outro; candidato não lê roteiro nem PEP; avaliador lê; marcações só do avaliador; sessão só dos dois; chave desligada bloqueia;
  teste grátis bloqueado com o padrão. O teste antigo da sala (máquina em `state`) é reescrito para as fases novas.
- **O dono confirma:** a lista de tabelas (reaproveitadas, ampliadas, novas) e quem vê o quê.

### Etapa 3 — Rotas e telas
- **Entrega:** `/novo/estacoes` (Banco de estações real: 5 blocos de área como filtro, busca fixa, ordem da prova / A–Z, grade /
  lista), `/novo/dupla` (Praticar: cabeçalho, seletor de papel, baralho vazio até a etapa 4, "Como a compatibilidade é
  calculada"), `/novo/dupla/perfil` (Meu perfil de estudo, salvando) e `/novo/dupla/sala/:roomId` (todas as fases, desenhadas a
  partir da fase gravada na sala). Rotas novas no `Root` do `App.jsx` (hoje só `/:route?`); a sala fica sem a barra de atalhos.
  Clique numa estação → `/novo/dupla?estacao=<id>` com a faixa da estação escolhida. Atalhos da 2ª fase: Treinar estação →
  Banco de estações; Praticar → Praticar. Sem o aviso "Tela em reconstrução" nessas telas. Bloqueio por plano com
  `LockedFeature`.
- **Como testar:** banco local (`npm run dev`) com a conta da equipe: estações de teste, filtros, busca; salvar e recarregar o
  perfil; `npm run dupla:sala-teste -- --fase <fase>` (só no banco local) cria uma sala entre duas contas locais para ver cada
  fase como candidato e como avaliador.
- **O dono confirma:** telas fiéis ao protótipo, com fontes e cores do app, nos dois temas.

### Etapa 4 — Regras do match no servidor
- **Entrega:** §7 no banco (baralho, escolha, sinal de online, convite); "Deu match!" com som (liga/desliga em `sz-sound`),
  "Abrir sala agora" e "Continuar buscando"; os dois chegam à mesma sala.
- **Como testar:** duas contas em duas janelas (uma anônima) no banco local; testes do cálculo com os casos de `match-rules.js`.
- **O dono confirma:** quem aparece, a ordem, as razões e a porcentagem.

### Etapa 5 — Sala em tempo real
- **Entrega:** a §8 até "Finalizar e liberar resultado": fases, carregamento por eventos reais, link, prontidão, cronômetro do
  servidor, apito, impressos (rota da imagem), PEP gravado 300 ms após o toque, "Aguardando avaliação", conferência e
  finalização (nota calculada no servidor, sessão gravada), "Reconectando…". Realtime no Supabase; consulta periódica no local.
- **Como testar:** duas janelas no banco local fazendo uma rodada; recarregar no meio (volta à fase, cronômetro certo); fechar
  uma janela por 40 s (aviso); somar à mão o PEP de uma estação de teste; testes do restante a partir de `ends_at`.
- **O dono confirma:** a rodada completa nos dois papéis, também no celular.

### Etapa 6 — Resultado, histórico e notas
- **Entrega:** a tela Resultado com dados reais ("Última vez", avaliador e tempo certos), Solicitar revisão / Rever a nota,
  Inverter papéis, Encerrar treino; no Banco de estações, "Sua última nota" e "Média geral"; na Administração, "Uso do mês".
- **Como testar:** duas rodadas com inversão; pedir e fazer a revisão; conferir a nota no cartão da estação.
- **O dono confirma:** números e textos do resultado.

### Etapa 7 — Celular, acessibilidade e testes
- **Entrega:** até 900 px: cartão na largura da tela, diálogos como painel de baixo, margens de 16 px, barra da sala fixa;
  ← / → no match; Esc fecha o impresso; foco visível (`--focus-ring`); `aria-label` nos botões de ícone; `prefers-reduced-motion`
  desliga as animações do cartão, do match e do anel; ponta a ponta com dois navegadores (§12).
- **Como testar:** celular real (iOS e Android) e leitor de tela no match e na sala; `node scripts/e2e/dupla.mjs`.
- **O dono confirma:** o módulo pronto para publicar (§13).

## 5. Dados
Migrações: 6500 dados (etapa 2), 6600 telas (etapa 3: `app_dupla_stations`, `app_dupla_profile`, `app_dupla_save_profile`), 6700
match, 6800 sala, 6900 resultado. Toda função `app_dupla_*` é SECURITY DEFINER, confere login, acesso (§9) e papel, e responde
com mensagem em português. RLS ligada em todas as tabelas; o aluno não grava direto em nenhuma.

**Reaproveitadas sem mudar a tabela**
- `checklist_stations`: catálogo (aprovada, ou equipe). Número e "Ordem da prova" saem do id (`inep-2024-1-e01` → 2024/1,
  estação 01); duração de `duration_ms`; pílulas de `styles`. As 10 estações autorais da carga (`seed-01…10`, pendentes) seguem
  invisíveis ao aluno.
- `study_invites`: o "Deu match!" de quem deu o primeiro "Estudar junto" (60 s, já no Realtime). Criado e respondido por funções
  (`app_dupla_swipe`, `app_dupla_answer_invite`); recusar ou expirar fecha a sala.
- `subscriptions`, `plans`, `profiles`: lidas só dentro das funções (plano; nome e edição-alvo como valores iniciais do perfil de
  estudo). Nada de `profiles` chega a outro aluno.

**Ampliadas**
- `app_settings`: chave nova `treino_dupla` (§9). A checagem das chaves é refeita com a união de todas (quem mais mexer nela
  escreve a união).
- `checklist_station_contents`: leitura direta só para a equipe. O aluno lê por `app_dupla_room_content`, conforme o papel na
  sala: candidato — nome, área, cenário (`doctor_scene`), tarefas (`doctor_tasks`), duração e só os impressos liberados, sem a
  linha "Liberação: …"; avaliador — tudo, inclusive `actor_script`, todos os `pressings` e `checklist_items` com pontos e critérios.
- `checklist_rooms` (a sala): colunas novas `station_id`, `match_id`, `phase` (`roles | connecting | setup | running | review |
  result | closed`), `round`, `candidate_id`, `evaluator_id`, `confirmed_ids`, `connected_ids`, `ready_ids`, `call_link`
  (`https://` + domínio, até 500), `duration_ms`, `started_at`, `ends_at`, `paused_left_ms`, `paused_at`, `paused_total_ms`,
  `released_pressings`, `closed_reason`. Saem `state`, o gatilho `guard_checklist_room` e as políticas de inserir e atualizar;
  ficam `member_ids` (2), `rev` (+1 a cada mudança) e a leitura pelos membros. Participantes e impressos liberados viram colunas,
  não tabelas: a sala tem sempre duas pessoas, e uma linha só dá um `rev` e um aviso de tempo real por mudança.
- `checklist_study_sessions` (a avaliação de uma rodada): já tem `actor_id` (avaliador), `doctor_id` (candidato),
  `checklist_answers`, `score`, `max_score`, `correctness`, `pressings_released`, `started_at`, `finished_at`. Novas: `round`,
  `feedback_pos`, `feedback_neg`, `feedback_gen` (até 1000 cada), `used_ms`, `station_version`, `review_requested_at`,
  `review_reason` (até 500), `revised_at`, `score_before_review`; único (`room_id`, `round`). `actor_id` e `doctor_id` passam a
  `on delete set null`. RLS igual: os dois leem, ninguém grava direto.

**Novas**
- `study_profiles`: `user_id` (chave), `public_name` (3 a 40, obrigatório), `school`, `city`, `exam` (ex.: 2027/1), `bio` (até
  160), `goal`, `areas` (CM, CR, GO, PED, MFC), `role_pref` (`med | ator | any`), `pace` (`livre | cronometrado | simulacao`),
  `days`, `shifts`, `radar_visible`, `show_school`, `show_stats`, `status` (`livre | em_estacao | fora`), `last_seen_at`,
  `updated_at`. RLS: só a própria linha. O cartão dos outros sai de `app_dupla_deck` com os campos públicos (instituição só com
  `show_school`; estações feitas e média só com `show_stats`). E-mail e telefone nunca.
- `study_swipes`: `from_user`, `to_user`, `direction` (`right | left`), `station_id`, `created_at`; chave (`from_user`,
  `to_user`), regravada a cada nova escolha. RLS: só as próprias.
- `study_matches`: `id`, `user_a` (primeiro "Estudar junto"), `user_b`, `station_id`, `room_id`, `created_at`. RLS: os dois leem.
- `checklist_room_marks`: `room_id`, `round`, `item_id`, `evaluator_id`, `grade` (`correct | partial | incorrect`; vazio =
  pendente), `subitems_checked`, `updated_at`; chave (`room_id`, `round`, `item_id`). RLS: o avaliador da rodada lê; o candidato
  só depois que a avaliação daquela rodada existe. Grava só `app_dupla_mark`.
- Sem a view `station_stats` do pacote: a média geral é calculada dentro de `app_dupla_stations` (uma view leria as sessões de
  todos com a permissão do dono dela).

Conta: `app_export_my_data` passa a incluir perfil de estudo, escolhas, matches e salas; excluir a conta apaga perfil, escolhas e
matches (cascata) e deixa as avaliações do parceiro sem o vínculo. **Com a Montagem de estações:** confirmar a chave de
`pressing_assets` (id do impresso `<codigo>-p<ordem>` ou `p<ordem>`) e, se possível, publicar a regra de liberação separada do
texto do impresso; os itens do PEP chegam com `phase: "PEP"` e sem seções (se o PEP tiver seções, o formato precisa trazê-las).

## 6. Tempo real
Princípio: o tempo real só **avisa** que algo mudou; o estado vem sempre de `app_dupla_room(p_room_id, p_since_rev)` (fase,
rodada, papéis, confirmações, link, `ends_at` / `paused_left_ms`, impressos liberados, `rev`, `server_now` e o último sinal do
parceiro). O aviso não carrega dado sensível, e a reserva local usa a mesma função.
- **Sala**, canal privado `room:{id}`: `postgres_changes` (UPDATE em `checklist_rooms`, filtro `id=eq.{id}`; a tabela já está na
  publicação) → busca o estado de novo (agrupando 300 ms); Presença dos dois membros (etapa "Sincronizando com o parceiro" e
  aviso de queda).
- **Praticar**, canal privado `dupla:online`: Presença `{user_id, status: livre | em_estacao}` só enquanto a pessoa está no
  Praticar ou no perfil e com o radar ligado; dá o "N colegas online" e o selo "online". `postgres_changes` INSERT em
  `study_invites` com `to_user=eq.{eu}` traz o "Deu match!" a quem deu o primeiro "Estudar junto".
- **Autorização:** políticas em `realtime.messages` (criadas só se o esquema `realtime` existir, como a publicação): `dupla:online`
  para quem tem acesso ao módulo, `room:{id}` só para os dois membros; canais com `private: true`.
- **Sinal de online no banco:** `app_dupla_heartbeat(status, sala)` a cada 45 s nas telas do módulo e ao sair delas (vira "fora"
  na hora); 2 min sem sinal = fora. É o que o baralho usa para "online" e "em sala".
- **Reserva local** (banco local, ou Realtime fora do ar): sem os métodos de assinatura no `devServerBackend` e no `localBackend`,
  as telas consultam — sala a cada 2 s (vazio se o `rev` não mudou), convites a cada 5 s, baralho e contador a cada 20 s, sinal do
  parceiro a cada 10 s na sala. No Supabase, além do Realtime, uma consulta de segurança a cada 30 s e ao voltar a aba ou a rede.
- Métodos novos e opcionais no `Backend` (como o `subscribeStats`): `subscribeRoom`, `subscribeInvites`, `joinPresence`; só o
  `supabaseBackend` implementa. O módulo não usa o `presenceService` (Firestore) do app antigo nem os usuários fictícios dele.

## 7. Regras do match
Porte de `match-rules.js` para o banco (`app_dupla_deck`), com os mesmos números:
- **Papel elimina:** médico só vê ator/avaliador e vice-versa; "qualquer papel" vê todos; o mesmo papel específico não aparece
  (conta em "N ocultos pelo papel").
- **Pesos:** papel 40 (complementar 1,0; um flexível 0,85; os dois flexíveis 0,7); áreas 25 (em comum ÷ minhas; 0,5 se não
  escolhi); disponibilidade 20 (0,6 com turno em comum + 0,4 × dias em comum ÷ meus dias; 0,2 sem dias escolhidos); ritmo 10
  (igual 1, diferente 0,4); prova 5 (igual 1, diferente 0,5). Arredonda e limita a 40–99 %. A conta é da vista de quem olha.
- **Razões** com os textos do protótipo ("Papéis complementares: você …", "Os dois topam qualquer papel", "… em comum", turnos e
  dias, ritmo, "Prova diferente (…)").
- **Fora do baralho:** eu; quem não tem perfil de estudo ou acesso ao módulo; radar desligado; sem sinal há 2 min; em sala aberta;
  quem eu escolhi (para qualquer lado) nos últimos 7 dias. Ordem: maior compatibilidade, depois sinal mais recente. O baralho
  acaba (não volta ao começo).
- **Escolha** (`app_dupla_swipe(para, direção, estação)`): grava; se for "Estudar junto" e o outro escolheu "Estudar junto" para
  mim nos últimos 7 dias, com os dois online e fora de sala, cria o match, a sala (fase `roles`; estação de quem completou o match
  ou, sem ela, a do outro; papéis sugeridos por `assign`) e o convite para o outro. Quem completou recebe o "Deu match!" na
  resposta; o outro, pelo convite. Sem resposta em 60 s, a sala fecha ("{nome} não entrou na sala.").
- **`assign`:** médico → Candidato; ator → Ator/Avaliador; "qualquer" com médico → Ator/Avaliador; "qualquer" com ator →
  Candidato; os dois "qualquer" → sem sugestão (escolhem na fase de papéis).
- **Tela:** "N matches hoje" = meus matches desde 0 h de Brasília. O seletor de papel do Praticar grava no perfil de estudo. Sem
  perfil, o Praticar pede para criar ("Meu perfil de estudo"); com o radar desligado mostra "Com o radar desligado, ninguém vê seu
  cartão." (a frase sobre convidar colegas sai enquanto não há convites diretos). Prova: as três próximas edições a partir de
  hoje (em 09/10/2026: 2026/2, 2027/1, 2027/2), começando pela edição-alvo do perfil.

## 8. Sala e fases
`roles` → `connecting` → `setup` → `running` → `review` → `result` → (Inverter papéis) `roles` da rodada seguinte, papéis
trocados. `closed` a qualquer momento: "Sair da sala" ou "Encerrar treino" (com confirmação; o parceiro vê "Treino encerrado por
{nome}."), convite recusado ou expirado, ou 15 min sem sinal dos dois. Recarregar volta à fase gravada.
- **Papéis:** qualquer um escolhe ou usa "Sortear" (o servidor sorteia); mudar zera as confirmações; segue quando os dois
  confirmam ("Aguardando {nome} confirmar os papéis"). Faixa "Definido pelo match: …" quando veio do match. Sem estação: "Escolher
  estação" (lista do Banco), obrigatório antes de confirmar; "Trocar estação" a cada rodada.
- **Carregamento:** as 5 etapas andam por eventos reais — estação carregada; acesso conferido; conteúdo do papel recebido; canal
  assinado (local: primeira consulta); parceiro presente. Cada aparelho avisa `app_dupla_connected`; com os dois, vira `setup`.
- **Preparação:** link `https://` + domínio, gravado na sala e visto pelos dois; "Abrir chamada" em nova aba (`noopener
  noreferrer`); o app não usa câmera nem microfone. Prontidão dos dois. Cronômetro ajustado pelo avaliador (±30 s; Oficial, −1,
  −2, −3 min; mínimo 1 min; máximo a duração oficial). "Iniciar" só para o avaliador e só com os dois prontos; o candidato vê "Só
  o avaliador inicia". Leitura prévia do avaliador ("O candidato não vê").
- **Cronômetro:** iniciar grava `started_at = now()` e `ends_at = now() + duração` no servidor. Restante = `ends_at` − (relógio
  local + diferença para o servidor, medida com `server_now`). Pausar grava `paused_left_ms` e limpa `ends_at`; retomar recalcula.
  ±1 min só pelo avaliador, nunca abaixo de 30 s. Âmbar ≤ 2 min, vermelho ≤ 30 s; minimizar e esconder ficam no navegador de cada
  um. Em 00:00 aparece "Tempo esgotado" e a estação segue até o avaliador finalizar.
- **Apito:** `playWhistle` do pacote (tom duplo ~1.400 Hz, 2 s, vibração) nos dois aparelhos ao entrar em `running` e uma vez por
  rodada ao chegar a 00:00 (+1 min rearma). O áudio é "acordado" no primeiro clique da página.
- **Impressos:** Liberar / Ocultar (avaliador) muda `released_pressings`; o candidato recebe na hora. Imagem pela rota nova
  `GET /api/dupla/rooms/:roomId/prints/:pressingId/link` (Express, no padrão das Aulas): o banco confere membro, papel e
  liberação e devolve o caminho do derivado (`pressing_assets` → `station_assets`); o servidor assina um link de 10 min no depósito
  `content-hub`. "Ampliar" em tela cheia; Esc fecha.
- **PEP:** tabela no estilo INEP ("ESTAÇÃO N | PADRÃO ESPERADO DE PROCEDIMENTO"; Inadequado / Parcialmente adequado / Adequado;
  célula hachurada quando o nível não existe; pontuação fixa e TOTAL). Cada marcação grava com `app_dupla_mark` 300 ms depois do
  último toque no item. Nota = soma dos pontos do nível marcado (`grades`); pendente vale 0. Numeração = `order`.
- **Finalizar:** "Finalizar estação" (avaliador) → `review`; o candidato vê "Aguardando avaliação". Conferência: edição na tabela,
  filtro Todos / Pendentes, feedback (Pontos positivos, Pontos para melhorar, Orientações gerais) e "Finalizar e liberar
  resultado", com confirmação que diz quantos itens estão pendentes → o servidor recalcula a nota, grava a sessão e vai a `result`.
- **Resultado:** nota ("7,25 / 10,00"), %, "Última vez" (sessão anterior do mesmo candidato na mesma estação, em p.p.), barra dos
  critérios, avaliador daquela rodada, data e tempo usado (`used_ms`, sem as pausas). "Solicitar revisão da nota" (candidato, uma
  vez, com motivo) → o avaliador vê na hora e pode "Rever a nota" (volta à conferência da rodada; a nota anterior fica em
  `score_before_review`; o resultado mostra "Nota revisada"). "Treinar novamente — Inverter papéis" e "Encerrar treino".
- **Queda:** parceiro fora do canal (local: sem sinal) por mais de 30 s → aviso "Reconectando…" até voltar; nada reinicia e o
  cronômetro segue no servidor.

## 9. Acesso por plano (ajuste do dono)
`app_settings.treino_dupla = {"aberto": false, "planos": ["pro", "elite"]}`. Administração › Configurações ganha o cartão
"Treinamento em Dupla": chave "Abrir para os alunos", marcação Teste grátis / Pro / Elite e "Uso do mês" (salas, rodadas
avaliadas, alunos que treinaram, impressos por rodada), para refazer a conta da §10 com números reais.
- Equipe (administrador e editor) sempre entra. Aluno com a chave desligada: "2ª Fase · Em breve", como hoje. Chave ligada: a 2ª
  fase abre; usa quem tem um plano marcado ativo (`active` ou `past_due`; teste grátis só `trialing` dentro do prazo); os outros
  veem `LockedFeature` com o convite do plano ("Ver planos" → Conta).
- A regra mora no banco (`dupla_allowed(uid)`), usada por todas as funções `app_dupla_*`, pela Presença e pela rota dos
  impressos. A tela lê `app_dupla_access()` junto com a abertura do app (sem mexer no `app_bootstrap`, que outros ramos também
  mudam); `isPhase2Locked` passa a olhar a chave.
- Estação `is_pro_only` só com Pro ou Elite nos dois membros (importa se o dono abrir o módulo ao teste grátis).
- Com a 2ª fase aberta, o aluno vê só o que é real: Banco de estações (vira o início da 2ª fase) e Praticar. Início da 2ª fase,
  Teoria, Meus PEPs, Paciente simulado e Desempenho aparecem "Em breve"; "Treinar estação" do protótipo (`estacao`) e "Paciente
  simulado" saem da barra de atalhos do aluno. A equipe continua vendo tudo.

## 10. Custos
Premissas (preços conferidos em 09/10/2026; quando mudarem, troque e refaça a conta):
1. Sessão = uma sala, dois alunos, duas rodadas (cada um é candidato uma vez), ~45 min. Aluno ativo = 8 sessões por mês.
2. Impressos: 4 por estação, PNG de ~0,5 MB, abertos uma vez pelo candidato e uma pelo avaliador em cada rodada.
3. Supabase Pro (o app já paga): inclui 5 milhões de mensagens do Realtime por mês (depois US$ 2,50 por milhão, em pacotes de 1
   milhão), 500 conexões simultâneas (depois US$ 10 por 1.000) e 250 GB de tráfego de saída (depois US$ 0,09 por GB). Gravação no
   banco não é cobrada por unidade; pesa no tamanho da máquina.
4. Mensagens: cada mudança da sala conta 1 por aluno que escuta. Presença contada como broadcast (1 enviada + 1 por aluno no
   canal) — o Supabase não documenta; é o pior caso. ~4 eventos de Presença por aluno por sessão no `dupla:online`. N = alunos no
   Praticar ao mesmo tempo no pico: 30 (base) e 200 (alto).
5. Vercel Pro (o app já paga): US$ 0,60 por milhão de chamadas, CPU US$ 0,128/h e memória US$ 0,0106 por GB-h na região padrão
   (Washington, `iad1`; o `vercel.json` não fixa região), função de 2 GB. Só a rota dos impressos passa pela Vercel; o resto vai do
   navegador direto ao Supabase.
6. Câmbio US$ 1 = R$ 5,50. Sem IA (R$ 0). A chamada de vídeo é externa (R$ 0 para a StaziaMed).

| Por sessão | Conta | Base (N = 30) | Alto (N = 200) |
|---|---|---|---|
| Mensagens da sala | ~25 mudanças por rodada × 2 rodadas × 2 alunos | 100 | 100 |
| Convite e Presença da sala | 2 + ~10 eventos × 3 | 32 | 32 |
| Presença `dupla:online` | 2 alunos × 4 eventos × (1 + N) | 248 | 1.608 |
| **Mensagens no total** | | **380** | **1.740** |
| Tráfego de saída | impressos 8 MB + estado, conteúdo e baralho ~1,3 MB | 9,3 MB | 9,3 MB |
| Chamadas na Vercel | 16 links de impresso (~US$ 0,00005) | 16 | 16 |
| Banco | ~280 gravações (sala ~50, PEP ~84, sinal ~120, escolhas ~20, sessões 2); ~10 KB guardados | — | — |
| **Custo acima das cotas** | mensagens + tráfego + Vercel | **US$ 0,0018 ≈ R$ 0,01** | **US$ 0,0052 ≈ R$ 0,03** |

**Por aluno ativo por mês** (8 sessões, metade de cada): R$ 0 enquanto o app estiver dentro das cotas; acima delas, ≈ R$ 0,04
(base) e ≈ R$ 0,12 (alto). Para o preço do plano, o custo de infraestrutura do módulo é desprezível.
Fórmulas: mensagens/mês ≈ sessões × (132 + 8 × (1 + N)); tráfego/mês ≈ sessões × (impressos × 2 × rodadas × tamanho + 1,3 MB).
Exemplo, 1.000 alunos ativos (4.000 sessões/mês): base = 1,5 milhão de mensagens e 37 GB, dentro das cotas (R$ 0 a mais); alto =
7,0 milhões → 2 pacotes = US$ 5,00 ≈ R$ 27,50/mês (≈ R$ 0,03 por aluno). As cotas são da conta inteira (Arena, aulas, podcasts).
Degraus: mais de 500 alunos conectados ao mesmo tempo → US$ 10 por 1.000 conexões a mais no mês; banco ocupado no pico → máquina
maior (preço no painel do Supabase). Com o "Spend Cap" ligado, passar da cota não cobra, mas o Supabase pode limitar o serviço.

## 11. Textos e acessibilidade
- Textos do protótipo sem mudança. Números com uma única função de formato (`pt-BR`, duas casas: "7,25 / 10,00"), no lugar das
  duas do protótipo.
- Textos novos (sem equivalente no protótipo), para o dono aprovar na etapa em que aparecem: "Aguardando {nome} entrar na sala",
  "{nome} não entrou na sala.", "Aguardando {nome} confirmar os papéis", "Escolher estação", "Trocar estação", "Treino encerrado
  por {nome}.", "{nome} pediu revisão da nota", "Rever a nota", "Nota revisada", "Anotações ficam só neste aparelho.", "Conta
  excluída". "Aguardando avaliação" e "Reconectando…" vêm do PROMPT_IA.
- Acessibilidade: ← / → no match (com botões equivalentes), Esc, foco visível, `aria-label` nos botões de ícone, cronômetro
  anunciado só nos marcos (2 min, 30 s, fim; nunca a cada segundo), impresso liberado anunciado ao candidato, cada item do PEP
  como grupo de opções navegável pelo teclado, contraste AA das cores novas nos dois temas, `prefers-reduced-motion`.

## 12. Testes
- **Banco** (PGlite, com as regras reais): RLS de cada tabela; conteúdo por papel; fases e quem pode cada passo; cronômetro
  (início, pausa, ±1 min, piso de 30 s); nota = soma dos níveis; revisão uma vez só; chave e planos; exclusão de conta mantém a
  avaliação do parceiro; match (casos de `match-rules.js`, exclusões, 7 dias, reciprocidade, online).
- **Unidade (TS):** restante a partir de `ends_at` com diferença de relógio; formato de número; roteiro do ator separado pelos
  rótulos da Montagem; reserva local (consulta só quando o `rev` muda).
- **Telas** (vitest + Testing Library, já no projeto): arrasto e teclas do cartão, Esc, bloqueio por plano, candidato sem roteiro.
- **Ponta a ponta:** `scripts/e2e/dupla.mjs` com a biblioteca `playwright` que já está no projeto (dois contextos), no banco
  local, fluxo inteiro com inversão. O Realtime do Supabase é conferido à mão depois de publicar, em dois aparelhos.

## 13. Publicação (só com ordem do dono, etapa por etapa)
Cada etapa confirmada pode ir ao ar sozinha, com a chave desligada (o aluno não vê nada): SQL da etapa no Supabase → código
(GitHub/Vercel) → conferência com a conta da equipe. Para haver o que treinar em produção, a Montagem de estações precisa ter
publicado estações aprovadas com os impressos (`pressing_assets`). No fim: conferir o "Spend Cap", o dono escolhe os planos e
liga a chave; na primeira semana, comparar mensagens, conexões e tráfego do painel do Supabase e o "Uso do mês" com a §10.
