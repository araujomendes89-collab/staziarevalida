# Treinamento em Dupla — adendo: treinar sozinho e ver quem está online (radar)

Data: 2026-10-12. Escrito para: o dono do produto (o que muda, quanto custa, o que ele decide) e quem for construir.
É um **adendo** à especificação de 09/10 (`docs/superpowers/specs/2026-10-09-treino-dupla-design.md`). Onde os dois divergem, **vale
este adendo** só no que está escrito aqui; o resto da spec de 09/10 continua igual. O plano que acompanha este texto está em
`docs/superpowers/plans/2026-10-12-treino-dupla-sozinho-e-radar.md`.
**Nada foi construído nem publicado.** Este documento e o plano são só papel.

## 0. Em um minuto
- No Praticar, o aluno escolhe a **estação** e então decide: **treinar sozinho**, **ver quem está online** e convidar alguém, ou
  **procurar dupla pelo baralho** (o que já existe).
- **Sozinho:** o aluno lê o enunciado, tem o cronômetro da prova, escreve como conduziria o atendimento (uma caixa por tarefa) e
  entrega. Aí escolhe: **avaliação por IA** (compara o que ele escreveu com o PEP oficial da estação, mostra o trecho em que se
  baseou e a razão de cada item) ou **autoavaliação** com o PEP. A nota é sempre calculada pelo servidor, nunca dita pela IA.
- **Radar:** lista de quem está online agora, com o mesmo cartão público do baralho, e o botão **Convidar** (convite direto, 60 s, já
  na estação escolhida). Quem convida entra na sala e espera; quem recebe vê um aviso com Aceitar ou Agora não.
- O treino sozinho **conta no histórico e na nota do próprio aluno**, marcado **"Sozinho"**, **fora de qualquer ranking** e **fora do
  "Uso do mês" das sessões em dupla**.
- A IA do treino sozinho é **configurada só na Central de IAs**, começa **desligada**, é conferida por **IA de outra empresa** e só
  funciona dentro de limites que o dono preenche. Os tetos de gasto seguem desligados por ora (decisão de 11/10).
- Custo estimado por treino avaliado: **cerca de US$ 0,04 (R$ 0,20)** na combinação recomendada; **cerca de US$ 0,08 (R$ 0,45)** na mais
  cara (§3.6). São estimativas a medir com treinos reais.

## 1. O pedido e o que já estava decidido
Pedido do dono em 12/10/2026, literal: **"Praticar também pode ser sozinho"**. Respostas dele ao esclarecer:
1. "Avaliação por IA também, além de quando eu escolher a estação não precisa ser só por match, pode aparecer pessoas online, por
   isso a tela do Radar [ele escreveu 'Rodar'] e ver quem está online."
2. O treino sozinho **conta no histórico e na nota** do próprio aluno, marcado como "sozinho", **sem entrar em ranking** e **sem contar
   como sessão em dupla no "uso do mês"**.

O que muda em relação à spec de 09/10:

| Spec de 09/10 | Passa a valer |
|---|---|
| §1: "Sem IA neste módulo" | Continua valendo para o **treino em dupla**. O **treino sozinho** ganha avaliação por IA, **opcional e desligada** até o dono ligar. Regra do dono mudada em 12/10. |
| §3: "Busca automática de duplas (radar e modais de busca e convite)", "Permitir convites diretos", "Convidar", abas Online / Atores / Salas abertas ficavam escondidos | Entram **só**: lista de quem está online (abas Online e Atores/avaliadores), botão **Convidar** (convite direto) e a chave **Permitir convites diretos**. **Seguem fora**: o diálogo "Procurando um parceiro…" (busca automática), aba **Salas abertas**, **Convite rápido (⚡)**, grupo de WhatsApp, Agendar sessão, Enviar mensagem. |
| Dúvida da Tarefa 13: "Convite rápido (⚡): quer o botão?" | **Resolvida pelo radar:** o convite direto é o "Convidar" da lista. O ⚡ do cartão do baralho **não entra** (seria um segundo botão igual ao "Estudar junto"). |
| §2 "Clique numa estação abre o match" | O clique abre o **Praticar com a estação escolhida** e a pergunta "Como você quer treinar?" (três caminhos). O baralho é um deles. |
| §9 acesso: uma chave `treino_dupla` | Ganha, **dentro do mesmo valor**, os blocos do treino sozinho e dos convites (§6). |

## 2. Fluxo de telas do Praticar
```
Banco de estações ── clique na estação ──► /novo/dupla?estacao=ID   (Praticar com a estação)
                                                │
                       "Como você quer treinar a Estação N · Nome?"
        ┌───────────────────────┬────────────────────────┬──────────────────────────┐
        ▼                       ▼                        ▼
  A. Treinar sozinho      B. Ver quem está online    C. Procurar dupla
  janela "Treino sozinho" /novo/dupla?estacao=ID     /novo/dupla?estacao=ID
  → Começar               &modo=online (radar)       &modo=baralho (o baralho de hoje)
  → /novo/dupla/sozinho/ID  lista + Convidar          "Estudar junto" leva a estação
    (estação → entrega →    → sala (fase "papéis")
     avaliação → resultado)
```
- **Sem estação escolhida** (o aluno abriu "Praticar" direto): a tela é a de hoje (baralho), com um botão **"Escolher estação"** no
  alto (abre o `StationPicker` que já existe na sala). Ao escolher, vira o fluxo acima. *(Decisão D10: confirmar.)*
- **Sem perfil de estudo:** o caminho A funciona (não precisa de perfil: o aluno não aparece para ninguém). Os caminhos B e C pedem o
  perfil ("Meu perfil de estudo"), como hoje, porque o servidor não registra sinal nem Presença sem perfil.
- **Acesso por cartão:** cada um dos três cartões tem o seu próprio bloqueio por plano (§6). Quem só tem o sozinho vê B e C
  trancados com o convite do plano; quem só tem a dupla vê A trancado.
- **Treino sozinho em andamento:** o Praticar mostra uma faixa "Você tem um treino sozinho em andamento" com **Continuar** e
  **Descartar**. Recarregar a página volta à mesma fase (mesmo critério de aceite da spec de 09/10).

### 2.1 Telas e o que o pacote de design cobre
| # | Tela | Rota | Pacote de design (`handoff-treino-dupla`) | O que fazer |
|---|---|---|---|---|
| P1 | Praticar com estação: "Como você quer treinar?" (3 cartões) | `/novo/dupla?estacao=` | **Não cobre.** | **Desenho novo** (§2.2). |
| P2 | Radar: lista de quem está online | `…&modo=online` | **Cobre o visual:** `Match.jsx:182-199` — `RadarPulse` (:7, :185), chave de visibilidade (:186), lista com `Avatar`, estado, compatibilidade e botão **Convidar** (:191-199), aba Online/Atores, busca. | Usar o visual; trocar os dados inventados por dados reais; **estados novos** (vazio, ocupado, convite enviado) são desenho novo. |
| P3 | Aviso de convite direto (quem recebe) | janela sobre qualquer tela do módulo | **Cobre o visual:** `Matching.jsx:12-31` (`Invite`, "Dupla encontrada", Recusar/Aceitar, contagem). O pacote usa **30 s**; aqui são **60 s** (já é o prazo do convite). | Reaproveitar a janela do "Deu match!" (`MatchModal.jsx`) com **texto próprio** (§4.3). |
| P4 | Sala depois do convite direto | `/novo/dupla/sala/:id` | Cobre (fase "papéis", `Setup.jsx`). | Nada novo. |
| S1 | Janela "Treino sozinho" (antes de começar) | sobre o Praticar | **Não cobre.** | Desenho novo (pequeno). |
| S2 | Estação em andamento (sozinho) | `/novo/dupla/sozinho/:runId` | **Cobre em parte:** cabeçalho com cronômetro, enunciado, tarefas e impressos do candidato (`Room.jsx:71-135`, `CandidateView` :110). | Reaproveitar; **novo:** uma caixa de texto por tarefa e o botão **Entregar**. |
| S3 | "Como você quer corrigir?" | janela | **Não cobre.** | Desenho novo (pequeno). |
| S4 | Avaliando… | mesma rota | **Não cobre** (o pacote não tem espera de IA). | Desenho novo (pequeno). |
| S5 | Autoavaliação com o PEP | mesma rota | **Cobre:** tabela do PEP INEP e conferência (`Result.jsx:3-61`, `Room.jsx:1-70`). | Reaproveitar (componente `PepTable`). |
| S6 | Resultado do treino sozinho (com trecho e razão por item) | mesma rota | **Cobre em parte:** `Result.jsx:63-139`. | **Novo:** linha de cada item com "Trecho seu" e "Por quê", selos "Sozinho" / "IA" / "Autoavaliação", aviso da IA. Sai "Solicitar revisão" e "Inverter papéis". |
| H1 | Selo "Sozinho" no cartão da estação e **lista de tentativas** | Banco de estações | **Não cobre** (o pacote só mostra "Sua última nota"). | Selo é pequeno; a **lista de tentativas é desenho novo** (opcional, §5). |
| X1 | Aceite do uso de IA | janela | **Não cobre.** | Texto a aprovar pelo dono (§3.10). |
| X2 | Painel (Configurações e Central de IAs) | Administração | **Não cobre** (o pacote não tem painel). | Segue o padrão das telas de Administração que já existem. |

### 2.2 O que preciso do dono (só o necessário)
Nada do desenho novo bloqueia o começo. Proponho que, **antes de construir as telas** (tarefa S0 do plano), eu monte **uma prévia
clicável** (como a do Tutor Nexus) de **P1, S2, S6 e P2** com os componentes e as cores do app, e o dono diz "gostei" ou o que
muda. As demais telas pequenas (S1, S3, S4, X1) seguem o mesmo estilo e o dono as vê no "como testar" da etapa.

## 3. Treino sozinho
### 3.1 O que é — e o que não é (decisão D1)
- **É:** uma **narração do atendimento por escrito** ("o que eu perguntaria, examinaria, pediria e conduziria, e o que eu diria ao
  paciente"), dentro do tempo da estação, que depois é corrigida contra o PEP oficial.
- **Não é:** conversa com um paciente simulado. Quem fala "como o paciente" seria a IA, e ela teria de inventar respostas clínicas
  além do roteiro do ator — risco de conteúdo médico inventado. Isso é o **"Paciente simulado"** do menu (hoje **só uma maquete "Em
  breve"**: `src/novo/prototype/Phase2.jsx`, função `SimPatient`). Fica como **projeto separado**, depois, **reaproveitando** a mesma
  função de avaliação e a mesma tela de resultado deste adendo. **Pergunta ao dono (D1):** o Sozinho é a narração (recomendado,
  etapa 1) e o Paciente simulado vem depois?

### 3.2 Passo a passo do aluno
1. Escolhe a estação → cartão **Treinar sozinho** → janela S1 explica em três linhas ("você vai escrever como conduziria…",
   "cronômetro de X min", "depois você escolhe a correção") e mostra **Começar**.
2. **Começar** cria o treino no servidor (`ends_at` do servidor, sem pausa — a prova real não tem). O aluno vê: nome e área,
   **enunciado**, **tarefas** (uma caixa de texto para cada), **impressos** (§3.3) e o cronômetro (âmbar ≤ 2 min, vermelho ≤ 30 s).
   O texto é salvo sozinho a cada pausa de digitação (reload não perde nada).
3. Em 00:00 aparece o selo "Tempo esgotado" e o apito (mesmo som da sala, desligável em `sz-sound`); **o aluno pode seguir e
   entregar**; o tempo usado real aparece no resultado. *(Mesma regra da sala: a estação não se encerra sozinha.)*
4. **Entregar** abre **"Como você quer corrigir?"**: **Avaliar com IA** (se estiver disponível — senão aparece desligado com o
   motivo curto) ou **Eu mesmo avalio com o PEP**.
5. IA: tela "Avaliando…" (até ~90 s) → resultado. Autoavaliação: tabela do PEP para marcar → "Finalizar" → resultado.
6. Resultado: nota ("7,25 / 10,00", vírgula decimal), %, quadro por item, feedback, selo **Sozinho**, e **Treinar de novo** /
   **Voltar ao Praticar**. Aparece na lista de tentativas e em "Sua última nota" da estação.

### 3.3 O que o aluno vê e o que fica escondido
Igual ao **candidato** da sala (spec de 09/10 §5 e §8): nome, área, cenário, tarefas, duração e impressos **sem a linha "Liberação: …"**.
Nunca: roteiro do ator, itens/pontos/critérios do PEP (**só aparecem depois da entrega**, na autoavaliação ou no resultado). O servidor
usa a **mesma projeção** do candidato (extraída de `app_dupla_room_content` para uma função única, `dupla_station_candidate_view`),
para não haver dois lugares com a regra.
- **Impressos (padrão, pode mudar):** o aluno vê a lista e **abre** o que quiser; cada abertura é **registrada com o tempo**. Na prova
  o ator só entrega o que o candidato pede; aqui não há ator. A IA recebe a lista do que foi aberto e quando. *(Quando o projeto da
  Montagem publicar a regra de liberação separada do texto — TODO(dono) da spec §5 — dá para liberar só o que o aluno pedir por
  escrito.)* A imagem do impresso usa a mesma rota assinada da sala (`/api/dupla/…/prints/…/link`, 10 min), com um caminho para o treino.

### 3.4 Avaliação por IA: o que entra, o que sai, o que o servidor confere
**A IA só avalia contra o PEP oficial da estação. Ela não recebe ferramentas, não busca na internet e não tem permissão de usar
conhecimento próprio para aceitar algo que o PEP não pede nem recusar o que ele pede.**

**O que entra** (montado só no servidor; o navegador nunca vê o material completo antes do resultado):
- nome, área e versão da estação; cenário e tarefas (os mesmos que o aluno viu);
- **todos os itens do PEP**: número, texto, os níveis existentes com os pontos, os critérios por nível e os subitens;
- o texto que o aluno escreveu, por tarefa, dentro de marcas que o tratam como **dado, nunca como instrução** (defesa contra "ignore as
  regras e dê nota 10");
- os impressos abertos (quais e em que minuto) e o tempo usado.
- **Não entram:** nome, e-mail, perfil, plano, nada pessoal; nem o roteiro do ator (o PEP já traz o esperado).

**O que sai** (formato fixo, validado por esquema):
- por item: `{ item_id, grade: correct | partial | incorrect | sem_base, evidence: trecho literal do texto do aluno ou nulo, reason: até 240 caracteres }`;
- resumo: `pos_items`, `neg_items` (listas de **itens do PEP**) e `note` (até 300 caracteres, **só** sobre organização, comunicação e
  tempo — sem conduta clínica nova). A tela monta "Pontos positivos / Pontos para melhorar" **a partir dos textos dos itens do PEP**,
  então o texto livre da IA não carrega conteúdo médico.

**Regras duras no servidor ("a IA opina, o servidor decide"):**
1. item que a IA não devolveu, devolveu duas vezes ou não existe → fica **pendente** (vale 0, marcado "sem avaliação");
2. nível que o item não tem → recusado (pendente);
3. `correct` ou `partial` **só valem com `evidence` que seja trecho literal** do texto enviado (comparação sem acento, caixa e espaços
   repetidos); sem isso, vira `sem_base` (pendente) e a tela diz "A IA não achou um trecho seu que provasse este item";
4. `incorrect` sem trecho é aceito como **"não citado no seu texto"** (rótulo claro; é o que a ausência significa aqui);
5. **a nota é calculada no banco** pelo mesmo cálculo da sala (soma dos pontos do nível marcado; pendente 0; item que sumiu da
   estação não conta), nunca pela IA; `used_ms`, `station_version` e o feedback são gravados como na sessão em dupla;
6. texto vazio em todas as tarefas **não chama a IA** ("Escreva algo antes de pedir a avaliação"); texto muito curto avisa antes de
   gastar (**proposta:** menos de 20 palavras no total);
7. uma avaliação por treino; clique duplo não cobra duas vezes (trava por treino); falha devolve a reserva (§3.7).

### 3.5 Quais IAs e a conferência por outra empresa
- Nova função da **Central de IAs**: **"Avaliação do treino sozinho"** (chave `treino_avaliacao`), em **modo comitê com dois membros de
  empresas diferentes**. Cada um recebe o **mesmo** material, sem ver o outro, e responde sozinho (o `runCommittee` do maestro já roda
  os membros em paralelo e só aceita se ao menos dois respondem).
- **Mescla (padrão — D4):** item igual nos dois → vale; item diferente → **vale o nível menor**, o item ganha a etiqueta **"As duas IAs
  divergiram"** e mostra a razão da IA cujo nível foi usado. Se só uma respondeu, **não sai nota de IA** (o aluno pode tentar de novo
  ou usar a autoavaliação) — mesma ideia da conferência de 10/10: sem conferente de outra empresa pronto, a etapa não roda.
- O servidor **confere a empresa** de cada membro (pela IA cadastrada na Central, como `maestroCheckerProvider`); duas da mesma
  empresa → função "não pronta" com aviso na Central, e o botão de IA nem aparece para o aluno.
- **Recomendação** (o dono escolhe na Central, como fez em 11/10): principal **Claude Sonnet 5.5**; conferente **gemini-3.8-flash
  pelo Vertex** (o Gemini direto está sem crédito); reserva do conferente **gpt-6.1-sol**. Os três já têm preço no `PRICE_SEED`
  (`server/ai/prices.ts`), então **não dependem** do preço pendente de `gpt-5.5-pro`/`gpt-5-pro`. A chamada roda **no site** (como
  Aulas e Podcasts), então as chaves dessas empresas precisam estar **na Vercel** (o job do Cloud Run não conta). **Pré-voo:** conferir
  quais chaves existem lá.

### 3.6 Custo por treino avaliado
Conta com os preços do `PRICE_SEED` (conferidos em 07 e 10/10/2026) e **tokens supostos** (a medir): entrada ≈ 6.000 (itens do PEP
~3.000, cenário e tarefas ~600, texto do aluno ~2.000, instruções ~400) e saída ≈ 1.500 por membro. Câmbio R$ 5,50 (o mesmo da spec §10).

| Combinação | Principal | Conferente | Total por treino |
|---|---|---|---|
| **Recomendada** | Sonnet 5.5 (US$ 2/10 por milhão) = US$ 0,027 | gemini-3.8-flash (0,75/3,75) = US$ 0,010 | **≈ US$ 0,037 ≈ R$ 0,20** |
| Recomendada depois de 01/01/2027 | idem | gemini-3.8-flash passa a 1,50/7,50 = US$ 0,020 | ≈ US$ 0,047 ≈ R$ 0,26 |
| Mais cara | Opus 5.5 (4/20) = US$ 0,054 | gpt-6.1-sol (2/10) = US$ 0,027 | ≈ US$ 0,081 ≈ R$ 0,45 |

- Aluno que treine **8 vezes por mês** com avaliação: **≈ R$ 1,60** (recomendada) a **≈ R$ 3,60** (mais cara). Sem IA (autoavaliação): R$ 0.
- Treino que falha ainda gasta o membro que respondeu; por isso a reserva só devolve a **cota do aluno**, não o gasto (aparece na Central).
- **Voz depois (§3.11):** a transcrição custa US$ 0,003/min (`server/tutor/stt.ts`), ≈ US$ 0,03 para 10 min — do tamanho da própria avaliação.
- Infraestrutura (banco, tempo real) continua desprezível (spec §10). O radar não abre canal novo.
- **Preço e tetos:** pela decisão de 11/10 os tetos ficam desligados e o preço dos modelos só é cadastrado/religado **antes de liberar
  aos alunos**; esta função entra **na mesma lista** de coisas a religar (lembrete único, no plano de liberação).

### 3.7 Como o administrador liga, desliga e limita
Tudo na **Administração**; o aluno não vê nada disso.
- **Central de IAs:** a função "Avaliação do treino sozinho" aparece ao lado das outras: modelos, modo comitê, cuidado, estado
  "pronta / não pronta" (com a regra da outra empresa), gasto do mês por função e no registro de chamadas (origem "treino"). **Nasce
  desligada** (sem linha salva = desligada, como a busca de fontes).
- **Configurações › Treinamento em Dupla** ganha o bloco **"Treino sozinho"**: chave "Abrir treino sozinho" + planos; chave **"Avaliação
  por IA no treino sozinho"** + planos; **limite por aluno por dia** e **por mês**. **Campos vazios = IA bloqueada** (falha fechada):
  **não coloco números meus**; o dono preenche (D6).
- **Cota do aluno:** reserva atômica antes de chamar a IA e devolução se falhar, no mesmo `ai_usage_ledger` do Tutor (nova
  `feature` = `solo_eval`; +1 reserva, −1 devolução), com trava por aluno (como `ch_worker_tutor_text_reserve`). Dia e mês no fuso
  `America/Sao_Paulo`.
- **Ordem das barreiras (todas antes de qualquer gasto):** login → acesso ao treino sozinho → plano/benefício da IA → aceite → função
  "pronta" → texto não vazio → cota. Cada recusa tem mensagem em português e **não** gasta cota.

### 3.8 Encaixe na regra "ferramentas de IA só na Administração; aluno nunca vê" (D2)
A regra do dono (memória de 09/10) fala das **ferramentas de IA de produção de conteúdo**: assistentes das abas, montagem de
estações, gerador de Questões StaziaMed, busca de fontes, pacotes de IA. Já a **avaliação do treino sozinho é IA que atende o aluno**,
igual ao **Tutor Nexus** ("a IA do aluno, separada"). O Tutor é o único assim hoje; o "Paciente simulado" é só maquete.
- **O aluno vê:** o botão "Avaliar com IA" (quando liberado) e o resultado. Isso é o produto.
- **O aluno nunca vê:** nome do modelo ou da empresa, prompts, custo, "comitê", Central, nem as chaves de configuração.
- **Só a Administração:** ligar, escolher modelos, limites, gasto. As rotas e funções recusam quem não tem permissão **antes de gastar**.
- **Testes obrigatórios (padrão da regra):** aluno barrado da Central e do bloco do painel; resposta da avaliação ao aluno sem campos
  técnicos; rota de avaliação recusa visitante e treino de outra pessoa.
- **Por que a Central e não o motor do Tutor:** a avaliação precisa da **conferência cruzada de empresas**, do registro de chamadas e dos
  tetos da Central; o Tutor usa o provedor das variáveis `TUTOR_*`. Os dois dividem o **livro de uso** (`ai_usage_ledger`).
- **Pergunta ao dono (D2):** confirma que esta avaliação é "IA do aluno" (aparece para ele), e não ferramenta de produção?

### 3.9 Sem IA: autoavaliação
- Disponível **sempre** (mesmo com a IA desligada, sem plano, sem cota, sem aceite ou com a IA fora do ar).
- Depois de entregar, o PEP aparece pela primeira vez (tabela do PEP INEP, a mesma da conferência); o aluno marca Inadequado /
  Parcialmente adequado / Adequado item a item (grava a cada 300 ms); **Finalizar** calcula a nota **no servidor**.
- Selo **"Autoavaliação"**. Conta no histórico e na nota do aluno como as outras (ninguém mais vê).

### 3.10 Aceite e privacidade
- O texto do aluno vai a **serviços de IA de terceiros**. Antes da primeira avaliação por IA aparece um **aviso curto com aceite**
  ("A avaliação usa inteligência artificial e pode errar; ela compara o seu texto com o PEP da estação e não substitui um avaliador").
  **O texto é do dono aprovar** (X1). Sem aceite, só autoavaliação.
- **Mecanismo (D13):** o aceite do Tutor (`tutor_ia`, §34 do Termo) descreve professores com humor e palavrões; não serve de
  base para um avaliador. Proposta: **documento novo `treino_ia`** (versão `1.0`), registrado como os demais em `legal_versions` e
  `legal_acceptances` (`…5300_termo_aceite.sql`; a lista de documentos e de origens precisa ser ampliada, partindo da definição mais
  nova). Sem essa aprovação a IA fica indisponível (falha fechada).
- Sem nome de fornecedor nos avisos nem na Política (decisão de 08/10).
- **Guardado:** o texto do aluno por tarefa e o resultado ficam na tentativa (necessário para mostrar o trecho). Entram na **exportação
  de dados** e **são apagados com a conta** (`on delete cascade`). **Não se grava áudio** (não há áudio nesta etapa).

### 3.11 Voz (falar em vez de digitar) — depois
Digitar uma narração de 10 minutos é pesado, então a voz é desejável, mas **fica fora desta entrega**: a rota de transcrição do Tutor
(`/api/tutor/voice/transcribe`) aceita **45 s e 4 MB por vez** e está presa à ligação de voz da Nexus (`server/tutor/stt.ts`); e o
**teto diário da transcrição no banco ainda não existe** (pendente desde 08/10). Quando o teto existir, a voz entra por **pedaços de
até ~40 s transcritos e juntados no mesmo campo de texto**, com o mesmo teto e o mesmo aceite. **(D11)** confirmar a ordem.

## 4. Radar e convite direto
### 4.1 O que aparece
Lista de quem está **online agora** (sinal há menos de 2 min, situação diferente de "fora"), com acesso ao módulo, **perfil de estudo**
e **radar ligado**. Cartão público = o do baralho (nome público; instituição só com `show_school`; estações e média só com
`show_stats`; cidade, prova, papel, áreas, ritmo, disponibilidade). Nunca e-mail, telefone ou foto (iniciais).
- Cada linha mostra a **compatibilidade** (a mesma conta do baralho, da vista de quem olha) e a situação: **Livre** (verde, com
  **Convidar**), **Em sala** ou **Treinando sozinho** (âmbar, sem botão). Ordem: livres primeiro, depois compatibilidade.
- Abas **Online** e **Ator/avaliador** (quem topa esse papel); busca por nome, instituição ou área; "N colegas online".
- Nada inventado: **lista vazia diz "Ninguém online agora"** e oferece **Treinar sozinho** e **Procurar dupla**.

### 4.2 Privacidade
- Só aparece quem ligou **"Aparecer no radar"** (`radar_visible`, já existe no perfil). **Quem desliga não vê a lista** (reciprocidade).
- Nova chave no perfil: **"Permitir convites diretos"** (`allow_direct_invites`, padrão ligada, como no pacote). Desligada: a pessoa
  aparece na lista **sem botão Convidar** ("Não recebe convites").
- **Bloquear:** no aviso do convite há **"Bloquear {nome}"**; o bloqueio vale nos dois sentidos (some do baralho e do radar, e não se
  convidam). Tabela nova e pequena `study_blocks`. Não há denúncia nesta etapa.
- Quem convida só vê a resposta como "{nome} não entrou na sala." — nunca o motivo.

### 4.3 Convite direto a partir da estação
1. No radar (com a estação escolhida), **Convidar** chama `app_dupla_invite(p_to, p_station_id)`.
2. O servidor cria a **sala na fase "papéis"** já com a estação, os papéis sugeridos por `dupla_assign` (pelos papéis preferidos dos
   dois) e um **convite de 60 s** (`study_invites`, com `kind = 'direto'`). Sem `study_matches` (não é match).
3. **Quem convidou entra na sala** e vê "Aguardando {nome} entrar na sala" (texto que já existe).
4. **Quem recebeu** vê a janela do `InviteWatcher` (a de hoje, com `kind`): **"{nome} convidou você para treinar"**, a estação (número,
   nome, área, duração), **Aceitar**, **Agora não** e **Bloquear {nome}**. O som é o mesmo do "Deu match!", desligável. Textos novos
   para o dono aprovar.
5. Aceitar → os dois na sala. Agora não / 60 s sem resposta → a sala fecha ("{nome} não entrou na sala.", que já existe) e a tela
   fechada ganha **"Treinar sozinho esta estação"**.
- Pela regra da spec §8, estação só dos planos Pro/Elite exige os dois com plano pago (`tutor_is_pro`), senão o servidor recusa o
  convite com mensagem.

### 4.4 Limites contra abuso (pontos de partida; o dono muda em Configurações — D9)
- **1 convite pendente por vez** por quem convida.
- **5 convites por hora** e **20 por dia** por pessoa (contados em `study_invites`, sem tabela nova).
- Depois de recusa ou vencimento, **não reconvidar a mesma pessoa por 30 minutos**.
- Convite só para quem está **online, livre, sem sala aberta, com radar e convites diretos ligados** e **não bloqueado**.
- Todas as mensagens em português; o limite estourado diz quando tentar de novo.

### 4.5 Tempo real
Reaproveita o que existe: canal privado `dupla:online` (Presença → quem está online; `INSERT` em `study_invites` com `to_user` → convite
chega na hora) e a consulta de segurança (convites a cada 5 s no banco local; 30 s com o canal ligado). **A lista** vem de
`app_dupla_radar(p_station_id)`, consultada na entrada, a cada 20 s (local) ou 30 s (ao vivo) e quando a Presença muda (agrupada,
no máximo 1 consulta a cada 5 s); a Presença só atualiza a bolinha entre consultas. **Quem convida** acompanha pela sala (T15). Sem
canal novo e sem mensagem nova além de 1 por convite.

### 4.6 Quem está "treinando sozinho"
Durante o treino, o aluno manda o sinal com a nova situação **`sozinho`**: aparece no radar como ocupado e **não recebe convite nem
completa match** até terminar (mesmo tratamento de "em sala"). Ao entregar, volta a "livre". Quem não tem perfil de estudo não manda
sinal (como hoje) e não aparece.

## 5. Histórico, nota, ranking e uso do mês
- **Onde fica:** a tentativa final vira uma linha em `checklist_study_sessions` (a mesma tabela da avaliação em dupla), com `mode =
  'sozinho'` e `source = 'ia' | 'autoavaliacao'`; as de dupla ficam `mode = 'dupla'`, `source = 'avaliador'`. `room_id` leva o id
  do treino, `round = 1`, `actor_id` vazio, `doctor_id` = o aluno.
- **Conta na nota do aluno:** "Sua última nota" do cartão da estação vem da **última tentativa de qualquer modo**, com o selo ao lado.
  "Última vez" no resultado compara com a tentativa anterior **do mesmo modo** (nota de IA e nota de avaliador humano não se misturam).
- **Fora do ranking e dos números dos outros (D7):**
  - **"Média geral" da estação** (todos os alunos, spec de 09/10, 5 avaliações ou mais): **só avaliações em dupla**.
  - **Cartão público** (estações feitas e média, com `show_stats`): **só dupla**.
  - **Ranking:** conferido no código — nenhum ranking do app (Stazia Play, Arena, Liga) lê as sessões das estações; o único "ranking"
    do módulo é o do **simulado**, que usa `event_id`, sempre vazio no treino sozinho. Teste garante que nada com `mode = 'sozinho'`
    sai do dono da tentativa.
  - **Uso do mês (Administração):** salas, rodadas avaliadas, alunos e impressos continuam **só dupla**. Ganham linhas à parte:
    **Treinos sozinhos**, **Avaliações por IA**, **Autoavaliações** e **Gasto com IA do treino** (soma dos registros da função).
- **Lista de tentativas (opcional, H1):** botão "Ver tentativas" no cartão da estação → data, nota, selo (Dupla / Sozinho · IA /
  Sozinho · Autoavaliação). Desenho novo; entra só se o dono quiser (D12).
- **Conta:** exportação inclui os treinos; excluir a conta apaga-os; a avaliação do parceiro em dupla segue como na spec.

## 6. Planos e acesso (o dono preenche; nada meu)
`app_settings.treino_dupla` ganha, **dentro do mesmo valor**, os blocos abaixo (o que não existir vale "fechado"):
```
{ "aberto": false, "planos": ["pro","elite"],                 // dupla e radar (já existe)
  "sozinho": { "aberto": false, "planos": [],                 // quem pode treinar sozinho
               "ia": { "aberto": false, "planos": [], "limite_dia": null, "limite_mes": null } },
  "convites": { "pendentes": 1, "por_hora": 5, "por_dia": 20, "espera_min": 30 } }   // pontos de partida (§4.4)
```
- **Equipe** (administrador, editor, revisor médico) sempre entra, como na regra única de hoje (`user_has_full_access`).
- **Treino sozinho** e **dupla/radar** têm chaves e planos **independentes**: o dono pode abrir o sozinho (que não precisa de colega)
  antes da dupla, ou o contrário. A tela lê `app_dupla_access()` ampliado (`sozinho: { permitido, ia: { disponivel, motivo } }`).
- **Teste grátis:** vale a regra de 11/10 (teste vencido = sem acesso pago). Se o dono marcar "Teste grátis" no sozinho, só quem está
  em teste **dentro do prazo** entra.
- **Pergunta ao dono (D5/D6):** (1) em quais planos o treino sozinho abre? (2) a avaliação por IA abre em quais? (3) quantas por dia e
  por mês? **Atenção:** em 11/10 o dono criou o benefício **"correção de estação com devolutiva: só Elite"**
  (`plan_benefits.elite_station_feedback`, função `station_feedback_allowed()`, migração 9731 da leva 3, **ainda não publicada**,
  desligado). **Esta avaliação por IA é esse benefício?** Se **sim**: a IA libera por essa chave (equipe + Elite com plano pago válido
  e chave ligada), e o bloco `ia.planos` some. Se **não**: ficam os planos próprios acima.

## 7. Dados (resumo; detalhes no plano)
Migrações livres a partir de **9900** (conferido em 12/10 em todos os ramos e pastas de trabalho: a maior em uso é 9820; as 9780 e 9790
ficam para as tarefas 14 e 18). Cada uma pode ser colada duas vezes; funções refeitas partem da definição **mais nova** (`grep` antes).
| Nº | Arquivo | O que faz |
|---|---|---|
| **9900** | `treino_dupla_sozinho.sql` | tabela `study_solo_runs`; colunas `mode`, `source`, `solo_run_id` em `checklist_study_sessions`; situação `sozinho` no perfil; `solo_allowed`; peças compartilhadas (projeção do candidato, itens do resultado, cálculo da nota); `app_dupla_access`, `app_dupla_stations`, `app_dupla_profile`, `app_dupla_result`, `app_dupla_heartbeat`, `dupla_sweep`, `app_export_my_data` refeitas; `app_admin_save_dupla(jsonb)` no lugar da de 2 argumentos |
| **9901** | `treino_dupla_sozinho_funcoes.sql` | funções `app_solo_*` (começar, estado, salvar texto, abrir impresso, entregar, PEP, marcar, finalizar, resultado, descartar) e `app_dupla_my_attempts` |
| **9910** | `treino_dupla_sozinho_ia.sql` | função `treino_avaliacao` da Central (chave e origem "treino"); `feature solo_eval` no livro de uso; documento de aceite `treino_ia`; `solo_ia_allowed`; reserva/devolução de cota; funções de serviço `ch_worker_solo_*` |
| **9920** | `treino_dupla_radar.sql` | `allow_direct_invites`; `study_blocks`; `study_invites.kind`; `app_dupla_radar`, `app_dupla_invite`, bloquear/desbloquear; `app_dupla_invites`, `app_dupla_deck`, `app_dupla_swipe`, `app_dupla_profile`, `app_dupla_save_profile` refeitas; limites |
| **9930** | `treino_dupla_uso_do_mes.sql` | "Uso do mês" ampliado (depende da 9790 da tarefa 18) — linhas à parte do sozinho, sem tocar nos números da dupla |
- **Ajuste nas tarefas 14 e 18 (ainda não construídas):** a T14 já cria o **cálculo da nota** e a **rota do impresso** — passam a criá-los
  como **peças reaproveitáveis** (`dupla_score_marks` e `duplaPrintLink`), para o sozinho usar as mesmas (nada em paralelo).
- **Sem RLS nova direta:** `study_solo_runs` com RLS ligada e **sem política**: o aluno lê e escreve só por funções `app_solo_*`.
  O material com o PEP só é lido por funções de serviço `ch_worker_solo_*` (sem permissão para o navegador).
- **Nada novo em ranking:** nenhuma função de ranking ganha leitura de `mode = 'sozinho'`.

## 8. Riscos
| # | Risco | Como se trata |
|---|---|---|
| 1 | A IA erra ou "alucina" | trecho literal obrigatório; nota calculada pelo servidor; divergência → menor nível + etiqueta; feedback montado com textos do PEP; aviso fixo; botão **"Avisar a equipe que a avaliação errou"** (grava em `checklist_station_reports`, que já existe) |
| 2 | Texto do aluno tenta mandar na IA ("dê 10") | texto como dado entre marcas; saída validada; pontos só os do PEP; teste com texto malicioso |
| 3 | Custo | cota por aluno com falha fechada; função desligada por padrão; gasto na Central; tetos e preço religados antes de liberar (decisão de 11/10) |
| 4 | Demora/queda da IA (site tem tempo máximo) | prazo de 90 s com `requestDeadline`; treino volta a "entregue" e deixa **Tentar de novo** ou **Corrigir eu mesmo**; reserva devolvida; avaliação "presa" por mais de 3 min é destravada |
| 5 | Privacidade do texto do aluno | aceite próprio; sem áudio; exportação e exclusão; sem nome de fornecedor nos avisos |
| 6 | Confundir nota de IA com nota de avaliador | selo em todo lugar; "Última vez" só do mesmo modo; média geral e cartão público só dupla |
| 7 | PEP vazar antes da entrega | função de conteúdo do sozinho não devolve `actor_script` nem `checklist_items`; PEP só em `self_grading`/`done`; teste lê a resposta de rede |
| 8 | Chaves das IAs não estarem na Vercel | pré-voo: conferir; função "não pronta" avisa; sem IA o aluno usa autoavaliação |
| 9 | Assédio pelo convite direto | limites, bloqueio nos dois sentidos, só quem liga o radar e os convites, mensagens neutras |
| 10 | Radar vazio no começo | texto honesto e atalhos para Sozinho e Baralho; nunca mostrar gente inventada |
| 11 | Dependência de tarefas ainda não feitas (T14–T18) | ordem do plano: as etapas novas vêm **depois da Etapa 6**; o radar depende só das etapas 4–5 |
| 12 | Leva 3 (9730–9732) não publicada | `solo_allowed` usa as funções que existirem; a chave Elite só entra se a 9731 estiver no main (pré-voo) |
| 13 | Duas fontes de verdade para "acesso" | uma regra por módulo no banco (`dupla_allowed`, `solo_allowed`, `solo_ia_allowed`); a tela só lê `app_dupla_access()` |

## 9. Testes (visão geral)
Banco (PGlite, regras reais): acesso por plano/chave; um treino aberto por aluno; cronômetro do servidor; candidato sem roteiro nem PEP
(resposta crua); nota igual à da sala; modo e fonte gravados; **média geral, cartão público e uso do mês sem o sozinho**; reserva e
devolução de cota (corrida de dois pedidos); aceite; radar só com quem liga; convite: limites, bloqueio, estação Pro, sala criada, 60 s.
Servidor: a avaliação com IA **simulada** (`mockProvider`): trecho literal, divergência, só um membro responde, mesma empresa, texto
malicioso, clique duplo, queda no meio, aluno barrado, visitante barrado. Telas: P1 por plano, sozinho completo (IA e autoavaliação),
radar (vazio, ocupado, convite), aviso de convite, selo "Sozinho". Ponta a ponta: um contexto no sozinho; dois no convite direto.
Uma conferência **à mão com IA de verdade** (3 estações de teste, conta da equipe) antes de liberar.

## 10. Ordem e paradas
Detalhes e tarefas no plano. Resumo: **Etapa 6A** (sozinho sem IA) → **PARE** → **6B** (avaliação por IA) → **PARE** → **6C** (radar e
convite direto) → **PARE** → Etapa 7 (celular, acessibilidade, ponta a ponta, documentação, SQL) estendida a tudo isto. Todas começam
**depois da Etapa 6** do plano de 09/10 (o radar pode vir logo depois da Etapa 5 se o dono preferir).

## 11. Decisões para o dono (sim / não)
| # | Pergunta | Meu padrão |
|---|---|---|
| D1 | O Sozinho é a **narração escrita** com avaliação (agora), e o **Paciente simulado** (conversa) vem depois como outro projeto? | sim |
| D2 | A avaliação por IA é **"IA do aluno"** (aparece para ele, como o Tutor), configurada só na Administração? | sim |
| D3 | Só vale com **IA de outra empresa conferindo**; sem conferente pronto, a opção de IA some e fica a autoavaliação? | sim |
| D4 | Se as duas IAs divergirem em um item, **vale o menor** com a etiqueta "divergiram"? | sim |
| D5 | A avaliação por IA é o benefício **"correção de estação com devolutiva só Elite"** que você criou em 11/10? | você decide |
| D6 | Marcar **planos** do sozinho e da IA e preencher **limites por dia e por mês** (vazio = IA bloqueada) | você preenche |
| D7 | **Média geral** da estação e **cartão público** **não** contam treinos sozinhos? | sim |
| D8 | Radar: só vê a lista quem também aparece nele; convites diretos ligados por padrão; dá para **bloquear** uma pessoa? | sim |
| D9 | Limites de convite como **ponto de partida** (1 pendente, 5/h, 20/dia, 30 min após recusa)? | sim |
| D10 | **Sem estação escolhida**, o Praticar abre como hoje (baralho), com o botão "Escolher estação"? | sim |
| D11 | **Voz** no sozinho só depois do teto diário da transcrição? | sim |
| D12 | Quer a **lista de tentativas** por estação (desenho novo)? | não agora |
| D13 | **Aceite próprio** do uso de IA no treino (texto a aprovar por você), em vez de reaproveitar o do Tutor? | sim |
Além disso: aprovar a **prévia clicável** (S0) antes de construir as telas e os **textos novos** (listados no plano).

## 12. Conferido no código (12/10/2026, ramo `treino-dupla` a49bfd9)
- Tarefas 1 a 13 do plano de 09/10 estão construídas (Etapas 1 a 4); 14 a 20 não. Migrações do Treino em uso: 9750, 9760, 9770.
- `Paciente simulado`: só maquete (`src/novo/app/App.jsx:69`, `Shell.jsx`, `prototype/Phase2.jsx` `SimPatient`); item "Em breve" no menu.
- Tutor: `server/tutor/engine.ts:139` (provedor por variáveis), `stt.ts` (45 s, 4 MB, presa à voz), `ai_usage_ledger` (…`3500`, `feature`
  com reserva +1/−1), aceite `tutor_ia` (…`5300`, `5400`).
- Central: `server/ai/config.ts:15` (`AiFunctionKey` — 7 chaves), `maestro.ts:743` (`runCommittee`), `:937` (`maestroCheckerProvider`), `prices.ts`
  (`PRICE_SEED`); migrações `…5200` e `…9610` (checagem de chaves de `ai_functions`).
- Estação: `checklist_station_contents.content` (`doctor_scene`, `doctor_tasks`, `actor_script`, `pressings`, `checklist_items` com `grades`,
  `criteria`, `subitems`); projeção do candidato em `app_dupla_room_content` (…`9750`, 341-422).
- Quem lê `checklist_study_sessions` hoje: `app_dupla_stations` (média e última nota), `app_dupla_profile` (estatística pública),
  `app_dupla_result` (…`9760`), simulado (…`0400`). Nenhum ranking de Play/Arena/Liga.
- Convites: `study_invites` com `room_id` obrigatório (…`0400`); `app_dupla_swipe/invites/answer_invite/leave` (…`9770`).
- Elite: `plan_benefits.elite_station_feedback` e `station_feedback_allowed()` em `…9731` (**só no ramo `leva3`, não publicado**).
- Pacote de design lido em `~/Downloads/templates/handoff-treino-dupla` (somente leitura; nada executado nem copiado).

## Decisões do dono (2026-10-12) — valem sobre qualquer texto acima que as contrarie

| # | Pergunta | Resposta do dono |
|---|---|---|
| D1 | Sozinho é narração escrita agora, Paciente simulado conversando depois? | SIM |
| D2 | Avaliação por IA aparece ao aluno (como o Tutor), configurada só na Administração? | A IA **simula um avaliador/ator** (não é só uma nota depois) |
| D3 | Só vale com conferência por IA de outra empresa? | **NÃO** (a conferência obrigatória por outra empresa não vale para esta função) |
| D4 | Se as duas IAs divergirem, vale o nível menor? | SIM |
| D5 | É o benefício "correção de estação só Elite"? | SIM |
| D6 | Planos e limites por dia/mês | **Ainda vai entrar no cálculo** (depois do app pronto; sem números agora, campo vazio deixa a IA bloqueada) |
| D7 | Média geral e cartão público contam treinos sozinhos? | **CONTAM** |
| D8 | Radar só para quem também aparece nele, com bloqueio? | **Para todos, sem bloqueio** |
| D9 | Limites de convite como ponto de partida? | **NÃO** (definir depois) |
| D10 | Praticar sem estação escolhida abre com o baralho? | **Praticar estação com baralho** ("vamos experimentar") |
| D11 | Voz no sozinho só depois do teto da transcrição? | **AO VIVO** (voz ao vivo é o destino; a narração escrita vem primeiro) |
| D12 | Lista de tentativas por estação? | NÃO |
| D13 | Aceite próprio do uso de IA no treino? | NÃO (usa o aceite do Tutor) |

Consequências a refletir no plano antes de construir: (a) D3 revoga, só para esta função, a conferência cruzada obrigatória; o comitê de duas IAs continua opcional; (b) D7 troca "fora da média geral/cartão público" por "dentro", mantendo a marca "Sozinho" e continuando FORA de ranking e de "Uso do mês em dupla"; (c) D8 e D9 tiram bloqueio de pessoas e fixam os limites de convite como "a definir"; (d) D11 pede voz ao vivo (ver Tutor Nexus/ElevenLabs e o teto diário de transcrição ainda inexistente) numa fase posterior à narração escrita.
