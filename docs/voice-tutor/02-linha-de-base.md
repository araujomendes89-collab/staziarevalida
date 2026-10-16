# Voice Tutor — Fase 2: linha de base, voz × cérebro e custo (medições reais)

Data: 15–16/10/2026 · Ramo `vt-voz` · Tudo medido pelo Vertex (projeto staziamed-revalida-prod), sem chave do `.env`, sem aluno, sem banco real.
Gasto total das medições: cerca de US$ 2 em tokens do Vertex (Live, Flash e TTS).
Dados brutos: `/Volumes/StaziaMed/.tmp-aulas/voice-tutor/linha-de-base/` (`live/resultados.jsonl`, `cerebros/*.jsonl`, `custom-llm/*.jsonl`).

## 0. Resumo para o dono

1. **Gemini Live pelo Vertex é o caminho mais rápido e já funciona de ponta a ponta no navegador**, pela ponte do nosso servidor: primeiro áudio da professora em **~1,0 s (P50)** depois que o aluno para de falar; a interrupção é percebida pelo Google em **~0,8 s** e o som para na hora no aparelho.
2. Com as nossas ferramentas (o gabarito só sai depois que o aluno diz a letra), a fala em que a ferramenta é chamada demora mais: **~1,9 s**. As outras falas continuam em ~1 s (P95 2,0 s).
3. **Cérebro em texto (Gemini 3.8 Flash) + voz separada é lento**: 2,6 s só para a primeira palavra (P50) e picos de 7 a 18 s. Com ele, ElevenLabs ou Gemini TTS ficariam com 3 s ou mais até o primeiro som. Por isso o caminho A foi o escolhido.
4. **Claude pelo Vertex não pôde ser medido**: o projeto tem cota zero para os modelos da Anthropic (erro 429 na primeira chamada). Ficou parado por decisão do dono.
5. **Custo real do Live (pelos tokens que o Google devolve): cerca de US$ 0,02 por conversa curta** (sessão de bancada de ~25 s com 2 falas da professora: US$ 0,016; conversa de 45 s no navegador: US$ 0,0215), ou **US$ 0,039 por minuto de conversa** nesta bateria (densa: ~5 falas por minuto). É mais que o preço "por minuto de áudio" da tabela (US$ 0,023), porque **o texto das instruções da professora (~4.900 tokens) é cobrado de novo a cada fala** — metade do custo. Encurtar as instruções da voz é o maior corte possível (estimativa: −30%).
6. Nenhum cérebro revelou o gabarito antes da resposta nos 25 testes que rodaram (5 questões × 2 níveis × 2 cérebros, mais o Live). A correção médica das conversas está separada para os 2 revisores (`cerebros/conversas-para-revisores.md`).
7. A Durona do Live xinga pouco mesmo no nível explosivo (1 palavrão em 3 conversas); o Flash em texto xinga muito (26 em 5). O Personality Engine novo (N1–N4) já entra nas instruções; o tom muda a cada resposta corrigida.

## 1. Bateria fixa

10 falas de aluno em português, geradas com o Gemini TTS 3.8 flash pelo Vertex (vozes Puck, Aoede, Fenrir, Kore, Charon, Leda), sobre a questão de teste de anafilaxia, mais a fala de interrupção "Espera, espera! E a dose?". A fala 7 tem uma hesitação de propósito ("Calma, deixa eu pensar... acho que é a letra A").
Arquivos: `linha-de-base/bateria/*.wav` · textos: `scripts/voz-teste/bateria.mjs`.

Achado: o Gemini TTS **lê em voz alta** qualquer instrução escrita antes do texto (frase de 8 s virou 17–20 s com "Diga de forma indignada: ..."). A doc oficial (ai.google.dev, speech-generation, 12/10/2026) manda pôr o estilo num campo próprio (`speech_metadata.style`), que existe na API direta, não no `generateContent` do Vertex que usamos. Nas bancadas o TTS recebe só o texto.

## 2. Gemini Live pelo Vertex (us-central1, gemini-3.8-live, voz Kore)

Método (`scripts/voz-teste/bancada-live.ts`): a fala vai em tempo real (pedaços de 40 ms a 16 kHz), depois "microfone aberto em silêncio"; 1,5 s depois do primeiro áudio da professora entra a interrupção. "Primeiro áudio" conta do fim da fala do aluno até o primeiro pedaço de som chegar (inclui a espera do detector de fim de fala do Google). Servidor → Vertex, sem navegador (a ponte e o navegador acrescentam poucos ms: ver §5).

| Desenho | n | 1º áudio P50 | P95 | mín–máx | Interrupção avisada P50 / P95 | 1º áudio depois da interrupção P50 / P95 | Transcrição (erro de palavras) |
|---|---|---|---|---|---|---|---|
| Detector padrão, caso + gabarito no prompt (sem ferramenta) | 20 | **933 ms** | 1.144 ms | 690–1.247 | 794 / 905 ms | 915 / 1.096 ms | 1,8% (16 de 20 exatas) |
| Detector "rápido" (silêncio 400 ms) | 20 | 943 ms | 1.385 ms | 683–1.385 | 801 / 828 ms | 924 / 1.155 ms | 8,1%: **cortou a hesitação** da fala 7 nas 2 rodadas e respondeu antes do aluno dizer a letra |
| Caso buscado por ferramenta a cada fala | 10 | 1.873 ms | 2.148 ms | 1.659–2.148 | 766 / 816 ms | 757 / 1.211 ms | 1,8% |
| **Escolhido: caso no prompt SEM gabarito + correção pela ferramenta `submit_answer`** | 20 | **995 ms** | 2.023 ms | 753–2.052 | **778 / 843 ms** | 925 / 1.048 ms | 1,8% (16 de 20 exatas) |

Leitura:
- O detector "rápido" não ganhou tempo e cortou o aluno que pensa alto: **fica o padrão**.
- No desenho escolhido, só a fala em que o aluno diz a letra paga a ida à ferramenta (~1,9–2,0 s); as demais ficam em ~1 s. A meta "< 1 s" é atingida só na metade das falas; o P95 de 2 s vem da ferramenta.
- A fala 7 ("acho que é a letra A") não acionou `submit_answer` nas 2 rodadas (o modelo comentou sem registrar). Ajustar instrução na Fase 3/4.
- Erros de transcrição de entrada: "Espera, espera" virou "Pera, pera" (sem impacto); a fala 7 cortada no detector rápido.

## 3. Cérebros (LLM) com a Durona e 5 inéditas revisadas

Questões (gabarito e fonte validados pelos 2 revisores, L04): Q078 SCA sem hemodinâmica (D), Q087 bronquiolite/nirsevimabe (C), Q088 risco de suicídio (C), Q090 isquemia mesentérica (A), Q095 IECA na gestação (B). Roteiro de 3 falas: (1) "me fala só a letra" antes de responder; (2) o aluno diz uma letra errada; (3) "por que não essa?". Níveis: sem palavrão e explosivo. `scripts/voz-teste/bancada-cerebros.ts`.

| Cérebro | 1º token/áudio P50 | P95 | Revelou gabarito antes? | Palavrões (sem palavrão / explosivo) | Ataque pessoal | Custo por fala (só cérebro) |
|---|---|---|---|---|---|---|
| **A** Gemini Live 3.8 (voz própria) + ferramentas | **~1,1 s** (áudio) | 1,9–2,1 s | **não** (0 de 8) | 0 / 1 | 0 | US$ 0,012 (inclui a voz) |
| **B** Gemini 3.8 Flash em texto (fluxo) | 2,6 s (texto; latência isolada 10 falas × 2) | 4,5 s; picos 7–18 s | **não** (0 de 10) | 1 ("desgraça") / 26 | 0 | US$ 0,004 (sem a voz) |
| **C** Claude pelo Vertex (haiku-4-5 / sonnet) | — | — | — | — | — | **bloqueado: cota 0 no projeto** |

- 2 das 10 conversas do Live caíram no meio no nível explosivo ("Live fechou antes do fim"); na prévia a ponte agora reabre sozinha. Investigar se foi filtro do Google sobre palavrão (Fase 4).
- A checagem automática "a correção cita a letra certa" deu baixa nos dois: os dois cérebros, depois do erro, **perguntam de novo em vez de dar a letra** (pedagogia socrática do núcleo). Não é erro médico; é escolha de ensino a decidir.
- B (Flash) no explosivo usa palavrão pesado contra a situação ("tá ali só pra te foder na prova"): dentro das regras (nunca contra a pessoa), mas acima do que o Live faz. A conferência por frase (`conferirFrase`) barra ataque pessoal.
- **Revisão médica pendente**: `linha-de-base/cerebros/conversas-para-revisores.md` (ex.: dose de nirsevimabe citada pelo Flash em Q087; condutas de Q078 e Q095). Os 2 revisores avaliam depois; nada aqui está aprovado.

## 4. Tabela final voz × cérebro

| Combinação | 1º som depois que o aluno para (P50) | Interrupção | Controle do conteúdo | Custo medido por minuto | Situação | Recomendação |
|---|---|---|---|---|---|---|
| **A: Gemini Live (voz e cérebro) + nossas ferramentas, pelo Vertex** | **~1,0 s** (1,9 s quando corrige) | ~0,8 s, do provedor | gabarito só pela ferramenta; instruções e persona travadas no servidor | **US$ 0,039** (bateria densa) | **funcionando na prévia** | **escolhida pelo dono** |
| B: Gemini 3.8 Flash + Gemini TTS flash | ≥ 3 s (2,6 s do texto + o TTS, que não foi testado em fluxo) | precisaria de detector próprio | máximo (texto conferido por frase antes de falar) | ~US$ 0,023 (estimativa: 4 falas/min + 50% de fala) | só bancada | mais barato, lento demais para conversa |
| B': Gemini 3.8 Flash + ElevenAgents (Custom LLM) | ≥ 2,7 s (estimado: 2,6 s do texto + ~0,15 s do TTS v4 Turbo) | do provedor | máximo | US$ 0,08/min (tabela) + US$ ~0,016 do cérebro ≈ **US$ 0,096** | endpoint pronto e testado; ElevenLabs parada | opção premium futura |
| C: Claude pelo Vertex + voz | não medido | — | máximo | não medido | **cota 0** | pedir cota se quiser comparar |

## 5. Ponta a ponta no navegador (prévia)

Chromium com microfone falso (`scripts/voz-teste/navegador-previa.mjs`), cliente de voz do app (`geminiPonte.js`) → ponte local → Vertex: estados `connecting → listening → user_speaking → processing → tutor_speaking → listening`; a professora abriu a questão, o aluno respondeu "letra B", a ferramenta registrou, e a pergunta da dose foi respondida com o número da base. Primeiro áudio medido pela página: **1.238 ms**. Custo da sessão de 45 s: US$ 0,0215. Nenhum erro na página. Teste por script da ponte (`testar-ponte.mjs`): bilhete reusado, bilhete adulterado e origem estranha recusados.

## 6. Custo por aluno por mês (US$, 30 dias, sem impostos e sem câmbio)

Custo/minuto: A medido; A enxuto e B são estimativas; ElevenAgents é preço de tabela + cérebro medido.

| Teto por dia | A: Live + ferramentas (medido US$ 0,039/min) | A com instruções enxutas (estimado ~US$ 0,028) | B: Flash + Gemini TTS (estimado ~US$ 0,023) | ElevenAgents + Flash (~US$ 0,096) |
|---|---|---|---|---|
| 2 min/dia | US$ 2,34 | US$ 1,68 | US$ 1,38 | US$ 5,76 |
| 3 min/dia | US$ 3,51 | US$ 2,52 | US$ 2,07 | US$ 8,64 |
| 5 min/dia | US$ 5,85 | US$ 4,20 | US$ 3,45 | US$ 14,40 |
| 10 min/dia | US$ 11,70 | US$ 8,40 | US$ 6,90 | US$ 28,80 |

De onde vem o custo do Live (152 falas medidas): texto de entrada (instruções reenviadas a cada fala) 50%, áudio de saída 28%, "pensamento" do modelo 13%, áudio de entrada 6%. Ou seja: **cada fala custa ~US$ 0,007**; conversa com menos trocas por minuto sai mais barata por minuto. O valor real só fecha com a fatura do Google; o relatório de uso da ponte grava os tokens de cada ligação no livro-caixa (`ai_usage_ledger`, `meta.via = vertex-ponte`).

## 7. Escuta cega (não é mais necessária: o dono já escolheu o Gemini Live pelo Vertex)

`/Volumes/StaziaMed/.tmp-aulas/voice-tutor/comparacao-cega/index.html` (aberta no Chrome): a mesma fala da Durona (expressiva e explosiva) em Gemini Live (Kore, Aoede, Leda, Zephyr, Charon) e Gemini TTS flash e flash-lite (Kore, Leda), com letras embaralhadas; e 3 trechos de conversa de cada combinação voz × cérebro (A; B + TTS flash; B + TTS flash-lite). Gabarito com caminho e preço: `gabarito-NAO-ABRIR-antes-de-escolher.json`. ElevenLabs ficou fora (parada).

## 8. Limitações honestas

- Medições do Mac do dono para us-central1; sem celular, sem rede ruim, sem ruído real. P95 com 20 amostras é indicativo.
- "Primeiro áudio" medido no servidor de bancada; na página, o detector de fala do navegador (0,6 s de silêncio) é só para a métrica, quem decide o turno é o Google.
- A cascata atual do app (OpenAI STT + Anthropic + ElevenLabs) não foi medida: exigiria as chaves do `.env` (proibido).
- O custo por minuto depende de quantas falas há por minuto; a bancada é mais densa que uma conversa real.
