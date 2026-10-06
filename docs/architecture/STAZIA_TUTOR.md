# Stazia Tutor — desenho, o que foi feito e o que falta

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

