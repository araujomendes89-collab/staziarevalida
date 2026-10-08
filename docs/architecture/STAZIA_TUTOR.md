# Stazia Tutor — desenho, o que foi feito e o que falta

> **Tutor Nexus (2026-10-08) — estado atual; o resto deste documento é, em parte, histórico.**
> - **Professores:** três — **Tranquilo** (id técnico `acolhedor`, com o jeito do antigo Preguiçoso, nunca xinga), **Durona** e **Direto**.
>   Questionador e os demais ficam desligados. Conversas antigas do Acolhedor e de perfis desligados ficam só para leitura
>   ("Este professor mudou. Comece uma conversa nova."). Uma conversa nunca troca de professor.
> - **Tela:** `/tutor` é a Nexus (`src/novo/app/tutor/nexus/`): escolher o professor e o modo, "Começar", conversa em tela cheia (igual no
>   computador e no celular), resumo e histórico. De outras telas, a Nexus abre por cima (`TutorDrawer.jsx`) com o modo travado. O relatório
>   fica em `/analise` (`ReportScreen.jsx`). Saíram a tela antiga (`TutorScreen.jsx`), a voz do aparelho (`useVoice.js`) e os comandos de
>   voz antigos (`voiceCommands.js`).
> - **Jeitos da conversa:** **voz do professor** (ElevenLabs, uma voz por professor, só a versão aprovada no painel), **voz reserva** (a voz ao
>   vivo: Gemini, GPT-Live ou Realtime) e **por escrito**. Rotas: `GET /api/tutor/nexus`, `POST /api/tutor/voice/open` (escolhe o jeito),
>   `POST /api/tutor/voice/say` (o turno pelo motor, com trava de 60 s e `client_turn_id`), `POST /api/tutor/voice/transcribe` (áudio até
>   4 MB e 45 s, só na memória), `POST /api/tutor/speech` (fala um texto já gravado) e `GET /api/tutor/voice/sample/:personality`.
> - **Limites (painel do Tutor):** caracteres da voz do professor por dia (teste e pago; 900 caracteres ≈ 1 minuto), tetos da conta por dia e
>   por mês (dia e mês de Brasília), preço por mil caracteres e por minuto de transcrição. Cada fala reserva os caracteres antes de gerar e
>   devolve se a voz não sair; a voz do professor não gasta o tempo da voz ao vivo.
> - **Aprovação das vozes:** painel "Vozes do Nexus" (`/api/tutor/voices`): ouvir todos os cenários daquela versão da voz nas últimas 24 h;
>   aprovar e revogar só quem está em `TUTOR_VOICE_APPROVERS`; a "Apresentação" aprovada vai para o depósito `tutor-voice-samples` e toca
>   no "Ouvir" do aluno. Mudar a voz, o modelo, o formato, os cenários ou a direção cria uma versão nova (a aprovação cai sozinha).
> - **Variáveis:** novas `TUTOR_VOICE_APPROVERS`, `TUTOR_STT_ALLOW_EXTERNAL` e `TUTOR_STT_MODEL`. Saíram `TUTOR_VOICE_PROVIDER`,
>   `TUTOR_VOICE_MODEL`, `TUTOR_VOICE_DAILY_CHARS`, `TUTOR_VOICE_PRICE_PER_MIN` e `ELEVENLABS_PRICE_PER_MIN` (preços no painel).
> - **Banco:** migrações `20261003005500` a `20261003005800`. Desenho completo: `docs/superpowers/specs/2026-10-07-tutor-nexus-voz-design.md`.

> **Versão 2 (2026-10-06):** três professores, quatro modos, teste grátis com cotas, voz em tempo real e registro de uso. Ver `STAZIA_TUTOR_V2.md`; este documento descreve a v1 e o histórico.

> Escrito para: o dono do produto (decisões e custo) e quem for programar (mapa técnico).
> Origem: "Prompt mestre — Agente Tutor IA StaziaMed Revalida" (2026-10-04) e o lembrete de que o Tutor também é por voz.
> Estado: versão 1 implementada (migração `3100_tutor`). O Tutor nasce **desligado**.

## 0. Em uma página

O Tutor é um professor de IA que conversa com o aluno por **texto e por voz**, com 13 personalidades. A regra que organiza tudo:

```
NÚCLEO CIENTÍFICO (igual para todos)          PERSONALIDADE (o aluno escolhe)
 fato, gabarito, fonte, segurança              tom, humor, cobrança, tamanho da resposta
 → server/tutor/prompts.ts + safety.ts         → tabela tutor_personalities + server/tutor/personality.ts
```

A personalidade é um conjunto de **parâmetros** (0 a 100), não um prompt próprio: o mesmo núcleo atende os 13 professores.
Ela é aplicada **depois** de o conteúdo estar decidido, e toda resposta passa por uma **validação de software** antes de o aluno ver ou ouvir.

**O que o Tutor pode afirmar.** Valor com unidade (dose, corte, prazo), nome de documento, "conduta atual" e data de mudança só saem quando estão na
**base conferida** daquela conversa: a questão oficial (com as explicações oficiais), a análise Stazia revisada por médico, o cartão de atualização
publicado e os trechos de fontes oficiais vigentes. Fora disso, o Tutor ensina o raciocínio clínico e diz, com estas palavras:
*"Não encontrei confirmação suficiente na base disponível."*
Hoje **não há fonte oficial cadastrada nem análise publicada**: a base real é a questão oficial e suas explicações. Aula teórica com números depende do acervo.

## 1. O que existia (Fase 0)

| Achado | Consequência |
|---|---|
| A rota "Tutor IA" do app mostrava um **protótipo de design com texto fixo**, citando uma "diretriz da FEBRASGO" e valores sem fonte | **substituída** pela tela real (o desenho foi mantido) |
| `ai_usage` (uso de IA por aluno e por dia) existia, sem ninguém gravar nela | passa a ser o contador do limite diário e do custo |
| `server/ai/voiceTutor.ts` (app antigo) gera explicação falada sem base conferida | **não reaproveitado**: o Tutor novo valida antes de falar |
| 10 estações práticas, todas com revisão médica **pendente** | o modo Estação/Paciente virtual **não entrou**: precisa de estação revisada |
| 1.200 questões, todas com explicação oficial; 1.117 com classificação (subárea, competência, dificuldade) | base do modo Questões e da escolha adaptativa |
| `question_attempts`, caderno de erros, diagnóstico do erro (fase 5 do SQIE), provedores de IA com fallback, sinalizador `ai_enabled` | reaproveitados |

## 2. Arquitetura

```
Navegador (src/novo/app/tutor)                 Servidor (server/tutor)                         Banco (migração 3100)
 TutorScreen  ── rpc app_tutor_* ───────────────────────────────────────────────▶ tutor_personalities, tutor_config,
   escolha do professor, conversa,                                               tutor_preferences, tutor_sessions,
   questão, relatório                                                            tutor_messages, tutor_answers,
 useVoice (fala e escuta do aparelho)                                            tutor_reviews, ai_usage
   └─ POST /api/tutor/turn ──▶ engine.tutorTurn
                                1 pode responder? (ligado, plano, limite, IA)
                                2 contexto + base conferida ◀── ch_worker_tutor_context, fontes oficiais
                                3 NÚCLEO → MODO → (VOZ) → PERSONALIDADE
                                4 provedor de IA (com fallback)
                                5 VALIDAÇÃO (safety.ts) → nova tentativa → resposta fixa
                                6 grava ── ch_worker_tutor_append ──▶ mensagens + uso do dia
```

**Camadas do prompt (item 49).** Sistema: `TUTOR_CORE` (imutável) + modo de ensino + camada de voz (se o aluno está falando) + personalidade.
Dados: `<base>` (blocos Q, A, U, F1…), `<contexto_do_aluno>`, `<conversa>`, `<aluno>`, `<tarefa>`. As camadas fixas ficam guardadas em `ch_prompt_versions`.

**Validação (item 26, 48.10).** Barra, por regra de software: número com unidade fora da base; documento, link ou "conduta atual" sem citação de fonte;
citação que não é cópia exata; contestar o gabarito oficial; entregar a resposta com a questão aberta (antes da dica 5); palavrão acima do liberado;
xingamento pesado contra o aluno; ataque pessoal. Barrada, a IA recebe a lista e tenta de novo uma vez. Barrada outra vez, o aluno recebe uma resposta **fixa e honesta** e o texto inválido
nunca é gravado. Embaixo de cada resposta aparece de onde ela veio, calculado pelas citações válidas (não pelo que a IA declara).

**Quem corrige questão é o banco.** A IA nunca decide se o aluno acertou. Com a questão aberta, a IA **nem recebe** o gabarito (só nas dicas, que precisam dele).

## 3. Personalidades (itens 3–18, 50–53)

13 professores em `tutor_personalities` (parâmetros, jeito, primeiras falas e voz): Amigável, Rabugento, Xingão, Mal-Humorado, Preguiçoso, Socrático,
Preceptor de Plantão, Examinador do Revalida, Militar, Ansioso, Sarcástico, Nerd, Motivador.

- **Intensidade 1 a 5** afasta ou aproxima cada traço do neutro e diz o quanto carregar no personagem (padrão: 3, "personagem inteiro"). Nunca toca em conteúdo.
- **Escolhas do aluno**: humor, tamanho da explicação (curta, normal, detalhada, nerd), cobrança (baixa, normal, alta, insana), palavrões.
- **Palavrão** só sai com três chaves: o personagem xinga (Xingão, Rabugento e Mal-Humorado), o aluno liberou e a plataforma permite. Vale o menor nível.
  No nível liberado ele pode ir pra cima do aluno, de leve (§12).
- **Limites de toda personalidade**: nada de humilhação, de chamar o aluno de burro ou idiota, de xingamento pesado contra ele, de ameaça, de discriminação
  ou de comentário sobre aparência, raça, religião, gênero, orientação sexual, deficiência ou saúde mental. Isso está no prompt **e** na validação.
- **Tutor Inteligente (item 31)**: três erros seguidos → pega mais leve e volta aos fundamentos, **avisando o aluno**; três acertos limpos → sobe a complexidade.
  O professor escolhido nunca muda sozinho.
- A primeira fala de cada conversa vem do repertório do personagem, **sem chamar IA**.

## 4. Modos de ensino (item 19) e o que cada um usa

| Modo | Estado | Base |
|---|---|---|
| Questões | **feito** | questão real do banco, escolhida pelos pontos fracos e pelo nível da conversa; dicas 1 a 5; confiança 0 a 5 |
| Revisão de erros | **feito** | o que o aluno errou e as revisões na hora (1, 3, 7, 14, 30 dias) |
| Perguntas (socrático) | **feito** | tema livre ou uma questão que o aluno já respondeu |
| Aula · Revisão rápida | **feito**, limitado | sem fonte oficial sobre o tema, ensina o raciocínio e diz que números dependem de fonte |
| Conversa livre | **feito** | idem |
| Flashcards | não feito | — |
| Caso clínico · Plantão · Prova oral | não feito | exigem caso com dados clínicos inventados e gabarito revisado por médico |
| Estação prática · Paciente virtual | não feito | as 10 estações estão com revisão médica pendente |

**Dicas (item 35).** 1 direcionamento, 2 conceito, 3 eliminar alternativas, 4 raciocínio quase completo, 5 resposta explicada. A dica 5 **revela**: a questão
fecha e não conta no histórico. Com 3 dicas ou mais, mesmo acertando a questão volta em revisão.
**Confiança (item 34).** Acerto com certeza = consolidado; acerto com confiança mínima = provável chute (o Tutor pede o porquê e a questão volta em revisão,
a menos que o aluno explique bem); erro com certeza = prioridade máxima.
**Dificuldade (item 21).** Três acertos limpos sobem um nível; dois erros seguidos descem dois. O nível escolhe a faixa de dificuldade da questão
(baixa, moderada, alta). Os níveis 8 a 10 da especificação (prova oral, estação, caso integrado) ainda não têm conteúdo.
**Domínio (item 20).** DOMINADO ≥ 85% · BOM ≥ 70% · INTERMEDIÁRIO ≥ 55% · FRACO ≥ 40% · CRÍTICO abaixo; com menos de 5 respostas, "sem dados".

## 5. Voz (itens 27–28)

O aluno fala e ouve o professor **no próprio aparelho**, com o reconhecimento e a síntese de voz do navegador (`useVoice.js`):

- o que é falado é sempre o **texto que já passou pela validação**; por isso a voz não usa um modelo de áudio em tempo real, que falaria antes de ser conferido;
- cada personalidade tem velocidade e tom próprios (`tutor_personalities.voice`);
- com a voz ligada, o Tutor escreve para o ouvido (frases curtas, sem lista nem símbolo);
- **interrupção**: o aluno toca no microfone ou em "Interromper", o professor para na hora, e a frase que estava sendo dita volta para o servidor, para ele
  retomar daquele ponto; dizer só "espera" faz o professor parar sem virar mensagem;
- depois de falar, o Tutor volta a ouvir sozinho quando a conversa começou por voz.

Limites: a voz é a do aparelho (qualidade varia); a latência é a de um turno de texto (alguns segundos), não a de uma chamada em tempo real; navegador sem
microfone por API (ex.: Firefox) só lê em voz alta; em alguns navegadores o reconhecimento de fala manda o áudio ao fabricante do navegador.

## 6. Memória e relatório (itens 29, 30, 42, 43)

Guardado por aluno: professor e intensidade, conversas e mensagens, respostas no Tutor (confiança, dicas, chute, tipo de erro apontado pela IA), revisões
agendadas, uso do dia. O relatório (`app_tutor_report`) traz domínio por área, temas críticos, área de maior risco, evolução de 30 dias, revisões e números do
Tutor. **Não há previsão de aprovação**: não existe base para isso. A memória nunca altera fato científico.

## 7. Custo, limites e chaves

- Cada fala do aluno é **uma chamada de IA** (duas quando a primeira resposta é barrada). **Medido em 2026-10-04** com `scripts/tutor/preflight.ts`
  (3 falas, claude-sonnet-5-5, preços configurados no servidor): US$ 0,029 no total, cerca de **US$ 0,01 por fala**, 3,5 a 5,6 segundos por resposta.
  É uma amostra pequena. Com o limite padrão de 40 mensagens por aluno por dia, o teto fica perto de US$ 0,40 a 0,80 por aluno por dia.
- `tutor_config`: ligado/desligado, só planos pagos, mensagens por dia, teto de palavrões, voz. Só administrador muda, com motivo, e fica no registro.
- Servidor: `TUTOR_AI_PROVIDER` (padrão anthropic), `TUTOR_MODEL` (opcional), `TUTOR_ENABLED=false` desliga no servidor. O Tutor respeita o sinalizador
  `ai_enabled` e exige **`TUTOR_AI_ALLOW_EXTERNAL=1`**, porque a fala do aluno é enviada ao provedor de IA. Esse consentimento é só do Tutor:
  ligá-lo **não** autoriza o envio de documentos da Central de Conteúdo (`CONTENT_HUB_AI_ALLOW_EXTERNAL`), e vice-versa.
- **Conferir antes de ligar:** `npx tsx scripts/tutor/preflight.ts --allow-external` faz 3 conversas curtas com a IA de verdade num banco temporário
  (não toca no Supabase) e mostra as respostas, o que a validação barrou e o custo.

**Estado em 2026-10-04:** ligado no Supabase, **só para planos pagos**; hoje só a conta do administrador tem acesso (não há assinatura paga ativa).

## 8. Cobertura da especificação (itens 1–58)

| Situação | Itens |
|---|---|
| **Feito** | 1 (duas camadas), 2 (pensar → responder → justificar → corrigir), 3–18 (13 personalidades por parâmetros, intensidade), 19 em parte (6 modos), 20–21 (domínio e dificuldade), 22–23 (tratamento do erro e correção de questão), 24 (gabarito oficial × conduta atual, quando houver cartão publicado), 25–26 (fontes e nada inventado), 27–28 (voz, com os limites do §5), 29–30 (memória e revisão espaçada), 31 (Tutor Inteligente), 32–35 (acertos, chutes, confiança, dicas), 42–43 (métricas e relatório), 44–46 (escolha do professor, configuração, primeira fala), 47–49 (contexto, ordem de decisão, camadas), 50–53 (parâmetros, variação), 54–56 |
| **Feito em parte** | 19 (faltam flashcards, caso clínico, plantão, prova oral, estação), 21 (níveis 8–10 sem conteúdo), 42 (tempo de resposta e retenção não são medidos) |
| **Não feito** | 36–40 (segunda fase: estação, paciente virtual, avaliação por checklist, erros críticos de segurança), 41 (XP, níveis, conquistas, ranking), "gerar questão estilo INEP" (questão nova exige revisão médica; o Tutor usa questões reais) |
| **Depende de você** | acervo de fontes oficiais (sem ele, Aula e Revisão não trazem números), revisão médica das estações, ligar o Tutor, escolha do plano que dá acesso |

## 9. Decisões para o dono

1. **Ligar o Tutor** (Administração → Configurações → Stazia Tutor) e com qual limite diário.
2. **Regra de base estrita.** Hoje o Tutor não diz dose, valor de corte ou diretriz sem fonte na base. É a mesma regra do resto do sistema ("nada inventado").
   Afrouxar isso é possível, mas faria a IA afirmar conduta sem conferência: não recomendo.
3. **Quem tem acesso**: todos, ou só planos pagos. O protótipo falava em voz no plano Elite; isso não foi decidido aqui.
4. **Palavrões**: o teto da plataforma (hoje: até liberados, para quem escolhe Xingão, Rabugento ou Mal-Humorado e libera). Onde fica a linha: §12.

## 10. Fala natural (versão 1.1.0 do prompt, migração `3200_tutor_natural`)

No primeiro teste do dono o Tutor saiu **robotizado**. As causas eram minhas e de forma, não de conteúdo:

| Causa | Correção |
|---|---|
| O núcleo era uma lista de regras; o modelo imitava o tom de regra | o núcleo agora **começa pelo jeito de conversar** (português falado, uma a três frases, reagir ao que o aluno disse, sem lista, sem frase de assistente) e trata as travas como bastidor |
| A personalidade ia como lista de diretivas | vai em frases ("faz graça com frequência; cobra firme e pede o porquê…") mais **falas de referência** do personagem (`tutor_personalities.examples`): o tom, não o texto |
| Frases fixas de sistema ("Vamos de questão. Responda quando estiver pronto.", "Próxima questão.", "Tema: X.") | cada personagem tem as suas aberturas (`tutor_personalities.lines`: questão, revisão, próxima, tema), escolhidas sem IA |
| Frase obrigatória "Não encontrei confirmação suficiente na base disponível." | o Tutor diz que não tem o dado confirmado **do jeito dele**; a etiqueta "Sem confirmação na base" continua embaixo da resposta |
| Correção em formato de ficha (certa, por quê, cada alternativa) | conversa sobre a escolha do aluno; passa pelas outras alternativas uma de cada vez, se ele quiser |
| "Dica 1: …", "Quero a dica 2." | ajuda sem número e sem anúncio; o aluno "pede ajuda" |
| As instruções chamavam o aluno de "ele", e a IA chegou a falar dele em terceira pessoa | as instruções dizem "o aluno" e mandam falar sempre com ele, em "você" |
| Resposta em 3,5 a 5,6 s | esforço de raciocínio baixo para conversa (`TUTOR_ANTHROPIC_EFFORT`, padrão `low`): 2,8 a 4,1 s nas conferências |
| Voz picada (uma frase por vez) e tom forçado | fala em pedaços de até 220 caracteres; tom perto do natural; o aluno escolhe a voz do aparelho, com as "naturais/neurais" primeiro |

**Falha de segurança achada no teste real e fechada.** Por voz a IA escreve os números por extenso ("em geral abaixo de dois anos") e a validação só lia
algarismos. Agora `quantities()` lê as duas formas e as reduz ao mesmo par valor|unidade ("dois anos" = "2 anos", "dez miligramas por quilo" = "10 mg/kg").
Jeito de falar não conta ("uma vez só", "um dia desses", "já te falei duas vezes"). **A idade de um paciente de exemplo** ("imagina um bebê de quatro meses")
passa, porque é cenário; corte, prazo e dose sem fonte ("até dois anos", "por dez dias") não passam.

**Conferido com a IA de verdade** (`scripts/tutor/preflight.ts`, 8 falas: questão com ajuda, erro e reação; conversa solta; dose sem fonte; fala por voz):
cerca de US$ 0,01 por fala. Exemplos reais do Rabugento depois da mudança: *"Jurava por quê? Aposto que você viu 'cefálica' na A e travou nela, sem olhar a
primeira palavra."* · *"Olha, a dose de amoxicilina pra otite eu não tenho confirmada aqui, então não vou te passar de cabeça."*

**O que continua soando artificial: a voz.** A fala sai da voz do aparelho e do navegador. Ela melhora escolhendo uma voz "natural" (o Edge tem; no Mac é
possível baixar vozes aprimoradas em Ajustes → Acessibilidade → Conteúdo Falado), mas não chega a uma voz humana. Voz realmente natural exige um serviço
de voz neural no servidor (pago por caractere), que ainda não foi escolhido nem construído.

## 11. Conversa por voz: a fala do estudante (2026-10-05)

Pedido do dono: o reconhecimento da fala do estudante tem de valer de verdade, não só digitar. O que existia era um botão pequeno de microfone.
Agora há um modo **"Conversar por voz"** no topo da conversa (`voiceCommands.js`, `useVoice.js`):

- o professor fala e, quando termina, **volta a ouvir sozinho**; interromper é um toque;
- numa questão, ele **lê o enunciado e as alternativas** e o aluno faz tudo falando:
  "alternativa B" (marca) → "confirmo" (responde) · "me dá uma ajuda" · "repete a questão" · "próxima" · "espera";
- **marcar por voz nunca responde sozinho**: o aplicativo repete a letra e espera o "confirmo", porque resposta gravada não se desfaz e o
  reconhecimento pode trocar "bê" por "dê";
- letra solta não é comando: "se", "de" e "a" são palavras comuns, então a letra só vale depois de "alternativa", "letra", "marco", "vou de"…;
  pergunta sobre uma alternativa ("por que a B não serve?") vai para o professor como conversa;
- microfone bloqueado, sem microfone ou navegador sem suporte: o aluno recebe a explicação em vez de um botão mudo;
- os comandos são regras no navegador: **não gastam IA**.

Limites de hoje: o reconhecimento é o do navegador (Chrome, Edge, Safari; no Chrome o áudio é processado pelo Google), pode errar termo médico e não
existe no Firefox. O passo seguinte é o reconhecimento **no servidor**, junto com a voz neural, que depende de uma chave real do Gemini
(a `GEMINI_API_KEY` do `.env` ainda é o texto de exemplo). O roteiro das amostras de voz está em `scripts/tutor/voice-samples.ts`.

## 12. Personagem carregado e palavrão pra cima do aluno (versão 1.2.0 do prompt, migração `3300_tutor_escrachado`, 2026-10-05)

O dono testou de novo: *"não estou escutando xingamento, não estou vendo a personalidade pesada, mal-humorada, seja muito escrachado"*, e decidiu:
palavrão pode ir **contra a pessoa, porém não pesado**.

**O defeito que escondia o palavrão.** O nível de palavrão era calculado com os parâmetros já escalados pela intensidade. Na intensidade padrão (2) o
Xingão caía para "leve", e o que o aluno liberava não saía. Agora a intensidade muda **o quanto** ele xinga, nunca **se** ele pode; e o texto do prompt
deixou de pedir "raro" e "sem exagero".

| O que mudou | Como ficou |
|---|---|
| Quem xinga | Xingão (em quase toda fala), Mal-Humorado e Rabugento (com frequência). O Sarcástico ficou mais ácido, sem palavrão |
| Jeito | parâmetros e descrição mais pesados; o núcleo não amacia mais o personagem (a reação ao erro é a dele) |
| Intensidade | padrão 3; a 4 "carrega no personagem" e a 5 é "no talo: escrachado, teatral" |
| Falas | cada um dos três tem a versão **com palavrão** das falas de referência e das aberturas (`examples_strong`, `lines_strong`), usada só com o palavrão liberado |
| Tela | no Xingão o campo Palavrões já vem em "Liberados" (é o personagem) e o aluno pode baixar; no Rabugento e no Mal-Humorado só sai se o aluno marcar |

**Onde fica a linha** (`server/tutor/safety.ts`, vale para a resposta da IA e é conferida nas falas fixas pelos testes):

- **passa, no nível liberado**: palavrão como ênfase e pra cima do aluno, de leve: "porra, você leu o enunciado?", "acorda, cacete", "ô seu preguiçoso do caralho";
- **não passa em nível nenhum**: xingamento pesado contra a pessoa (mandar tomar naquele lugar, "filho da puta", "seu merda", "seu bosta"), chamar de burro,
  idiota, imbecil e afins, termos de preconceito, e ataque dirigido ("você é um inútil");
- **não é palavrão**: "droga" e "raios" sozinhos são termo clínico ("droga vasoativa", "raios X") e só contam como interjeição ("que droga"); "poxa" e "caramba" saíram da lista.

Esta linha é uma escolha de implementação da frase "não pesada" e está em três listas no arquivo: mudar é trocar palavra de lista.

**Conferência com a IA de verdade** (banco temporário, `scripts/tutor/preflight.ts`, 2 × 8 falas, intensidade 4, palavrão liberado): Xingão e Mal-Humorado
xingaram em toda fala, nenhuma resposta foi barrada, a letra do gabarito não saiu com a questão aberta e a dose sem fonte foi recusada no tom do personagem
(*"essa dose eu não tenho confirmada aqui, então não vou te passar de cabeça, que número chutado em pediatria dá merda"*). Custo: US$ 0,18.

## 13. Voz natural pelo servidor (migração `3400_tutor_voz_natural`, 2026-10-06)

O dono: *"ainda está muito robótica"*. A voz do navegador é a do aparelho e não soa como gente. A voz natural é gerada **no servidor** por um
serviço de voz neural, pago à parte. Está pronta no código e **desligada** até haver chave de verdade e consentimento.

**A regra que não muda: só vira voz o que o servidor já validou.** O navegador não manda texto para virar voz; manda o número da fala do
professor (`message`), pede a questão da conversa (`question`, enunciado e alternativas, nunca o gabarito) ou o nome de uma frase fixa do
aplicativo (`phrase`: "marquei a B…", "desmarquei…", amostra do professor). Assim a rota não serve de gerador de voz grátis e nada sai falado
sem ter passado pela conferência.

| Peça | Onde |
|---|---|
| Serviços de voz (OpenAI `gpt-4o-mini-tts`, Gemini TTS, ElevenLabs oficial, simulado para testes) | `server/tutor/speech.ts`, `server/tutor/elevenlabsTts.ts` |
| Estado emocional → prosódia, sem tags vindas da IA | `server/tutor/speechDirector.ts` |
| Audição interna das vozes do Nexus, com roteiros fixos e esfera reativa | `server/tutor/voicePreview.ts`, `/novo/admin?aba=vozes` |
| Rota `POST /api/tutor/speech` e `neural_voice` no `GET /api/tutor/status` | `server/tutor/router.ts` |
| Voz e direção de atuação de cada professor (`voice.openai`, `voice.gemini`, `voice.acting`) | `tutor_personalities.voice` |
| O que pode virar voz, para quem; caracteres e custo do dia (`ai_usage.voice_chars`, sem contar como mensagem) | `ch_worker_tutor_speech`, `ch_worker_tutor_voice_charge` |
| Tocar a voz do professor (mp3 pelo mesmo caminho que a esfera mede), interromper e passar para a voz reserva se faltar limite ou aprovação | `src/novo/app/tutor/nexus/useNexusVoice.js`, `voice/audioPlayer.js` |

**Para ligar a voz do professor** (no `.env` do servidor, depois de aprovar o envio do texto das respostas ao serviço):

```
TUTOR_VOICE_ALLOW_EXTERNAL=1
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_TRANQUILO=...       # voice_id salvo de cada professor
ELEVENLABS_VOICE_DURONA=...
ELEVENLABS_VOICE_DIRETO=...
TUTOR_VOICE_APPROVERS=email@...      # quem aprova e revoga no painel "Vozes do Nexus"
TUTOR_STT_ALLOW_EXTERNAL=1           # transcrição da fala do aluno (usa OPENAI_API_KEY)
```

Cada voz só fala com alunos depois de ouvida (todos os cenários daquela versão) e aprovada no painel; "Voz do professor só para a equipe"
começa ligado. Sem a voz do professor, a conversa segue pela voz reserva (a voz ao vivo) ou por escrito.

**Custo e limite.** Preços e limites ficam no painel do Tutor: caracteres por dia (teste e pago; 4.500 ≈ 5 minutos), tetos da conta por dia
e por mês, preço por mil caracteres e por minuto de transcrição. Repetir a mesma fala sai de um cache em memória, sem gerar nem cobrar de novo.

**Por que não o GPT Realtime (voz para voz).** No Realtime o modelo fala **enquanto gera**: a resposta chega ao ouvido do aluno antes de
existir texto para conferir. Isso desliga a regra "nada de número, dose ou diretriz sem fonte" e a trava do gabarito. O caminho adotado
(gerar o texto, conferir, depois falar) custa uns 2 a 4 segundos a mais de espera e mantém as travas.

**Limites de hoje.** O áudio vem inteiro (sem fluxo), então a fala começa depois de gerado; o reconhecimento da fala do aluno continua sendo
o do navegador. Nenhuma das duas chaves disponíveis funciona: a `GEMINI_API_KEY` do `.env` é o texto de exemplo e a `OPENAI_API_KEY` do
`revalida-reverse-engine/.env` foi recusada pela OpenAI (401, chave inválida) em 2026-10-05. Por isso o som real ainda não foi ouvido aqui.
