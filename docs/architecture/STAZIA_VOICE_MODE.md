# Stazia Voice Mode: Tutor por voz em tempo real (tela cheia)

Data: 2026-10-06. Pedido: "Tutor IA por voz em tempo real… sem destruir nem duplicar funcionalidades" (itens 1–95), com o vídeo
`gemini_generated_video_b0688b55.mp4` como referência visual. Base anterior: `STAZIA_TUTOR_V2.md` (Tutor v2, motor de personalidade
2.2.0, voz OpenAI Realtime).

## 1. O que já existia (auditoria feita no código antes de mudar)

| O pedido pede | Já existia | Onde |
|---|---|---|
| Framework, back, banco, login | React 19 + Vite (`src/novo`), Express (`server.ts`, função na Vercel), Supabase (RLS, `app_*` e `ch_worker_*`), login Supabase | — |
| Assinatura, teste grátis, limites | `subscriptions`, `tutor_entitlement` (teste de 7 dias no primeiro uso; voz 10 min/dia e 40 min no teste; pago 60 min/dia), reserva de voz por tempo | migração 3500 |
| Questões, gabarito, desempenho | `questions`, `tutor_truth` (Truth Engine), `question_attempts`, `tutor_answers`, `tutor_reviews`, `student_error_events`, `tutor_learning_memory` | 3100–3700 |
| Professores Acolhedor/Direto/Durona | `tutor_personalities` (+ `engine`: multiplicador de frustração 0,25/0,70/1,25, teto de sarcasmo e de linguagem) | 3500/3700 |
| Motor emocional (24–29), memória da sessão, piadas internas, expressões recentes | `server/tutor/emotion.ts` (estado completo, gravidade 1–5, tipos de erro, eventos, trava "explique antes"), `tutor_learning_memory` (perfil, piada interna, evolução) | 2.2.0 |
| Voz WebRTC com segredo temporário, `semantic_vad`, interrupção, ferramentas | `server/tutor/realtime.ts`, `tools.ts`, `useRealtimeVoice.js` (Realtime) | 3500/3600 |
| Custo e uso | `ai_usage_ledger` (só acrescenta), `ai_usage`, `AI_COST_CONFIG` | 3500 |
| Painel do Tutor | Administração › Configurações › Stazia Tutor | `AdminPanels.jsx` |
| Animação / mascote | **não existia** (o avatar era só dado) | — |

## 2. O que foi reaproveitado

Tudo da tabela acima. Nenhuma tabela duplicada: `tutor_student_state` e `tutor_topic_state` do pedido continuam **derivados**
(`tutor_learning_memory` a partir de tentativas, erros e revisões); `tutor_preferences`, `tutor_sessions` (+ `summary`), `tutor_voice_calls`
e `ai_usage_ledger` cobrem preferências, sessões, uso e custo. O motor de texto (`tutorTurn`) virou o "backend" do GPT-Live.

## 3. Arquitetura (as quatro camadas do pedido)

```
VOZ (GPT-Live ou Realtime, WebRTC)  →  CONVERSA (useRealtimeVoice + StaziaVoiceMode)
  →  ORQUESTRADOR (delegate.ts: regra para letra/dica/resolução/próxima; tutorTurn para o resto)
  →  PERSONALIDADE (personality.ts + emotion.ts) + PEDAGOGIA (modos, progressão de ajuda) → CONHECIMENTO (tutor_truth, fontes)
  →  MEMÓRIA (tutor_learning_memory + tutor_memories + resumo da sessão)
```

- **GPT-Live (preferido quando configurado)**: o navegador manda a oferta WebRTC para `/api/tutor/voice/start`; o servidor confere direito,
  cota e reserva, e troca a oferta com a OpenAI (`POST /v1/live/sessions`, delegação `client`). **Nenhuma credencial vai ao navegador.**
  O GPT-Live conversa e, quando precisa de conteúdo, delega (`session.delegation.created`); o aplicativo manda a fala transcrita a
  `/api/tutor/voice/delegate` e devolve à voz `session.commentary.append` (o que dizer, **já conferido pela segurança antes de falar**),
  `session.instructions.append` (o tom do professor) e `session.thinking.append` (contexto silencioso). O gabarito é sempre do banco:
  a letra dita vai para `ch_worker_tutor_answer_as` e o professor reage ao resultado.
- **Realtime (reserva, ou escolhido no painel)**: como antes (segredo temporário de 2 min, ferramentas pelo servidor), mais as ferramentas
  `save_tutor_memory`, `schedule_review` e `wait_for_user`.
- **Sem acesso ao GPT-Live** (401/403/404/400 da OpenAI): o servidor libera a reserva sem cobrar, cai no Realtime com a mesma oferta e
  não tenta o GPT-Live por 10 min.
- **Fim sem cortar a fala**: no fim da cota ou do limite por conversa, a renovação devolve `stop` com 20 s de folga; o aplicativo espera o
  professor terminar o turno e encerra; sem isso, a varredura derruba (no GPT-Live, pelo canal lateral `wss://…/live/sessions/{id}/attach`).

## 4. Tela (Stazia Voice Mode)

`src/novo/app/tutor/voice/`: `StaziaVoiceMode.jsx` (tela cheia, foco preso, Esc fecha, rolagem da página travada), `StaziaVoiceOrb.jsx`
(esfera), `VoiceControls.jsx` (chat · microfone · encerrar), `VoiceStatus.jsx` (Conectando… Pronto Ouvindo… Pensando… Falando…
Reconectando…), `VoiceTranscript.jsx` (legenda progressiva e chat), `useAudioLevel.js` (Web Audio: AnalyserNode, RMS suavizado
0,78/0,22), `audioUnlock.js` (AudioContext criado no toque do aluno, liberado ao fechar), `voiceMode.css`.

- Entradas: **"Conversar com o Tutor"** no início do Tutor (abre a sessão já em voz, com os minutos que restam à vista) e
  "Conversar por voz" dentro de uma conversa (inclusive no painel do Tutor aberto de outras telas).
- Esfera: o vídeo enviado, **recortado só na esfera** (sem a interface desenhada nele e sem som), 480×480, 0,9 MB:
  `public/novo-assets/tutor/stazia-voice-orb.mp4` + pôster `.jpg`. Muda velocidade, escala, brilho, contraste, cor (raiva puxa para
  roxo/magenta, não vermelho), anéis e partículas por estado, emoção (vinda do servidor, nunca do texto) e nível do áudio. Variáveis CSS:
  `--audio-input`, `--audio-output`, `--emotion-intensity`, `--orb-scale`, `--orb-glow`, `--ring-speed`. Sem vídeo: esfera em CSS.
  Movimento reduzido: vídeo parado e efeitos mínimos.
- Microfone liga/desliga sem encerrar (no GPT-Live também `session.input_audio.mute`); chat por cima sem desligar a voz (digitar entra
  na mesma conversa); legenda e volume são preferências do aparelho.
- Fechar: `session.close` (GPT-Live), para microfone e alto-falante, fecha o WebRTC, registra o fim com as métricas e libera o áudio;
  numa conversa que nasceu por voz, encerra a sessão (resumo e estado salvos).
- Erros sempre com saída: microfone negado, outro aparelho ("Assumir aqui"), cota, rede ("Tentar de novo") e **"Continuar por texto"**.

## 5. Banco (migração `20261003004400_tutor_voice_mode.sql`)

- `tutor_config`: `voice_provider` (auto/live/realtime), `voice_name` (nula = voz de cada professor), `voice_session_max_seconds`,
  `save_transcripts`, `transcript_retention_days` (0 = sem prazo), `emotion_engine`, `inside_jokes`, `durona_level`
  (moderada/forte/sem_filtro), `pronunciations`.
- `tutor_voice_calls`: `provider`, `metrics` (latência de conexão, da primeira fala e de cada turno, reconexões, ferramentas, delegações,
  interrupções, trocas de microfone, motivo do fim; só números e rótulos curtos), `closing_at`/`closing_reason` (folga do fim).
- `tutor_memories` (nova): lembranças que o professor decide guardar (piada interna, fato, preferência, meta, conquista), uma por assunto,
  fortalecida a cada repetição, no máximo 100 por aluno; o aluno lê as próprias; escrita só pelo servidor.
- `tutor_reviews.reason` aceita `tutor_request`; `ai_usage_ledger.feature` aceita `tutor_voice_live` (minutos do GPT-Live) e
  `tutor_voice_backend` (respostas do servidor na voz).
- Funções: `ch_worker_tutor_settings`, `ch_worker_tutor_voice_attach`, `…_voice_start/renew/end/call` (redefinidas),
  `ch_worker_tutor_voice_sweep`, `ch_worker_tutor_voice_metrics`, `ch_worker_tutor_save_memory`, `ch_worker_tutor_voice_context`
  (lembranças + última conversa), `ch_worker_tutor_schedule_review`, `ch_worker_tutor_purge_transcripts`, `ch_worker_tutor_memory` e
  `ch_worker_tutor_append` (redefinidas), `app_admin_tutor_config/save_config` (redefinidas, com a qualidade da voz em 30 dias),
  `app_admin_tutor_personalities`, `app_admin_tutor_set_personality`. Roteiro de volta no fim do arquivo.

## 6. Variáveis de ambiente (servidor; nenhuma vai para o navegador)

```
OPENAI_API_KEY=…                     # já existe na Vercel
TUTOR_VOICE_ALLOW_EXTERNAL=1         # já existe
OPENAI_REALTIME_MODEL=gpt-realtime-2.1   # já existe (reserva)
OPENAI_LIVE_MODEL=gpt-live-1         # NOVA: liga o GPT-Live
OPENAI_VOICE_PROVIDER=auto           # opcional: gemini | live | realtime | auto (o painel pode escolher por cima)
GEMINI_API_KEY=…                     # já existe na Vercel (ou GOOGLE_GEMINI_API_KEY): com ela, a voz do Gemini fica pronta (§16)
GEMINI_LIVE_MODEL=gemini-3.8-live    # opcional (este já é o padrão)
OPENAI_REALTIME_VOICE=marin          # opcional: voz padrão quando o professor não tem uma
DETERMINISTIC_TUTOR=true             # só testes: sem variação aleatória
TUTOR_SETTINGS_TTL_MS=15000          # opcional: cache da configuração do painel
AI_COST_CONFIG={"gpt-live-1":{"per_minute":0.05},"gemini-3.8-live":{"per_minute":0.023}}   # opcional (estes já são o padrão)
```

## 7. Modelo e provedor

Desde a 2.5.0, o "Automático" prefere a voz do Gemini (`gemini-3.8-live`, §16) quando a chave do Gemini existir; depois o
GPT-Live 1 (`gpt-live-1`, US$ 0,05/min de voz, cobrado por segundo; o servidor que responde às delegações usa o motor de texto do
Tutor, cobrado à parte) quando `OPENAI_LIVE_MODEL` existir; depois o OpenAI Realtime (`OPENAI_REALTIME_MODEL`). O painel pode fixar
um deles. Nomes de modelo só no ambiente (e na tabela de preços).

## 8. Como trocar a voz

Painel › Configurações › Stazia Tutor › Voz e personalidade › Voz: "A voz de cada professor" (padrão: Acolhedor e Direto `cedar`,
Durona `marin`), Marin, Cedar ou outra. Vale a partir da próxima ligação (a voz não muda no meio de uma ligação). Por professor:
`tutor_personalities.voice.realtime`. Antes de fixar, ouvir em português com gente de verdade (sotaque, siglas, remédios, números).

## 9. Como trocar o vídeo da esfera

Substitua `public/novo-assets/tutor/stazia-voice-orb.mp4` e `.jpg` (quadrado, sem som, só a esfera). Para recortar um vídeo novo no Mac:
`swift scripts/tutor/crop-orb-video.swift <original.mp4> public/novo-assets/tutor/stazia-voice-orb.mp4 public/novo-assets/tutor/stazia-voice-orb.jpg <x> <y> <lado> <lado-final>`
(o original de 2026-10-06 usou `60 280 600 600`). O original fica intacto.

## 10. Como adicionar um professor

Uma linha em `tutor_personalities` (migração nova) com `params`, `style_notes`, `openings`, `lines`, `examples`, `voice` e `engine`
(multiplicador de frustração, tetos de sarcasmo, agressividade e linguagem, paciência e calor de base) e, se quiser, uma escala de tom em
`ESCALATION` (`emotion.ts`). O motor, a voz e a tela não mudam. Ligar/desligar: painel (o Acolhedor é o padrão e não sai).

## 11. Limites por plano

Painel › Stazia Tutor: voz por dia (pago), voz por dia e no teste todo (teste grátis), interações de texto, questões no teste e o limite de
cada conversa por voz. A conta é sempre do servidor (`tutor_entitlement`); a voz conta tempo, nunca tokens.

## 12. Testes

`tutorVoiceMode.test.ts` (servidor, 14): provedor e configuração; GPT-Live com a oferta pelo servidor e sem credencial no navegador;
queda para o Realtime; painel (provedor, voz, limite); regras da fala (letra, negação, dúvida, dica, resolução, próxima); delegação com
o gabarito do banco, tom, emoção e sem gastar texto; limite por conversa com folga e varredura; lembranças entre conversas e piadas
internas; revisão pedida; transcrição desligada e retenção; validação do painel e professores; nível da Durona, modo determinístico,
inércia e motor desligado. `tutorVoiceModeScreen.test.tsx` (tela, 9): tela cheia, oferta pelo servidor, delegação, legenda e emoção;
microfone, chat, legenda e volume; fechar (microfone parado, fim com métricas); queda para o Realtime; microfone negado e "Continuar por
texto"; sem vídeo e movimento reduzido; Esc; "Conversar com o Tutor"; painel da voz. Ajustados: `tutorV2.test.ts` (fim com folga, idioma),
`tutor.test.ts` (versão 2.4.0, situação), `tutorRealtime.test.tsx` (tela cheia). Voz do Gemini (§16): `tutorGeminiVoice.test.ts`
(servidor, 6), `geminiLiveModule.test.ts` (navegador, 5) e `tutorGeminiVoiceScreen.test.tsx` (tela, 4).

## 13. Pendências reais

- **GPT-Live nunca foi chamado de verdade**: tudo foi testado com a OpenAI simulada, a partir da documentação de 2026-10. Falta pôr
  `OPENAI_LIVE_MODEL=gpt-live-1` na Vercel e conversar de verdade (a conta precisa ter acesso ao GPT-Live; sem acesso, cai no Realtime).
- Escolher a voz com avaliação humana em português (marin × cedar) no GPT-Live e no Realtime.
- A migração 4400 e o código ainda não foram aplicados nem publicados (dependem do pedido de deploy).
- Exportação de dados da conta (LGPD) ainda não inclui `tutor_memories`.
- **Gemini nunca foi chamado de verdade** (§16): tudo foi testado com o Google simulado, a partir dos tipos do SDK `@google/genai` 2.21
  e da documentação de 2026-10. Se o modelo ou a chave não servirem, a ligação cai sozinha na OpenAI.

## 14. Riscos técnicos

- Eventos do GPT-Live não documentados por completo (fim de fala, cancelamento de delegação): o estado "falando" sai das transcrições
  parciais e do nível de áudio; delegação interrompida termina no servidor e a voz decide se usa.
- Na voz, o que a IA acrescenta por conta própria só é conferido depois de dito (correção falada em seguida), como antes.
- Reconexão abre uma ligação nova (até 2 vezes); a conversa e as métricas seguem, mas a voz não lembra o que estava dizendo.
- iPhone/Safari: o áudio é liberado no toque; se o navegador bloquear, a tela pede um toque ("Toque na tela para ouvir").
- O vídeo de 10 s não foi feito para repetir: um esmaecido curto esconde a emenda.

## 15. Validação manual (com o GPT-Live ligado)

1. Vercel: `OPENAI_LIVE_MODEL=gpt-live-1` (e redeploy). Painel › Stazia Tutor: "Automático"; conferir "GPT-Live pronto no servidor".
2. No celular (Safari e Chrome) e no computador: Tutor › "Conversar com o Tutor". Esperar "Pronto" e a abertura do professor.
3. Falar uma pergunta; ver "Ouvindo…" → "Pensando…" → "Falando…" e a esfera reagindo à voz. Interromper no meio: o professor para.
4. Numa questão: dizer "é a letra B"; conferir que a correção bate com o gabarito oficial e que a Durona muda o tom com erros seguidos.
5. Microfone desligado: falar e conferir que nada é ouvido. Chat: digitar uma pergunta sem desligar a voz.
6. Fechar e reabrir no dia seguinte: o professor pode lembrar da conversa anterior e de uma piada interna.
7. Painel: custo por ligação, latências e motivo do fim em "Voz em 30 dias".

## 16. Português do Brasil nativo (Gemini) e fala sem filtro (prompt 2.5.0, 2026-10-06)

Pedido: "Não gostei da linguagem do tutor por IA, quero algo mais sem filtros, bem natural, ela pode gritar. Ainda está com muito
sotaque americano, quero português do Brasil." Migração `20261003004900_tutor_sem_filtro_voz_gemini.sql`.

**Sotaque.** O texto já era português; o sotaque vinha das vozes da OpenAI, feitas para o inglês. A voz nativa do Gemini (Live API,
áudio nativo, `gemini-3.8-live`) reconhece o idioma sozinha e fala com pronúncia de brasileiro. No "Automático" ela vem primeiro
(Gemini → GPT-Live → Realtime) e a OpenAI fica de reserva automática.

- **Servidor** (`voiceProviders.ts`, `realtime.ts`): a cada ligação cria uma chave temporária do Google com tudo travado (instruções do
  professor, voz, ferramentas, transcrições, diálogo afetivo, compressão de contexto). Ela abre uma conversa só (retomar a mesma
  conversa não conta) e vence 2 min depois do que a ligação pode durar (o limite da conversa ou o tempo de voz que o aluno ainda tem).
  A chave principal nunca sai do servidor.
- **Navegador** (`voice/geminiLive.js`):
  - Usa o SDK oficial `@google/genai/web`, carregado só quando a voz abre.
  - O microfone vai em PCM 16 kHz. O contexto de áudio liberado no toque do aluno roda a 48 ou 44,1 kHz e é reduzido no próprio
    processador de captura, o que funciona no Safari e no Firefox.
  - A voz do professor sai em PCM 24 kHz pelo mesmo contexto, então a esfera reage igual.
  - A abertura do professor só sai depois de a conexão estar pronta e entregue ao aplicativo.
- **Ferramentas:** são as mesmas do Realtime, executadas pelo servidor (`/api/tutor/voice/tool`). A correção do que foi dito entra como
  instrução do sistema.
- **Conexão:**
  - O Google troca a conexão de tempos em tempos (aviso `goAway`). O aplicativo continua a mesma conversa, com até 8 trocas e até
    2 quedas de rede. A troca de rotina não conta como queda nas métricas.
  - Se não der para continuar, abre outra ligação, até 2 vezes, como na OpenAI.
- **Reserva da OpenAI:**
  - **O Google recusou a chave** (400/401/403/404): o servidor libera a reserva sem cobrar, abre a OpenAI no mesmo pedido e não tenta
    o Gemini por 10 min.
  - **O Gemini não abriu no aparelho** (antes de ficar pronto): o aplicativo encerra a reserva sem cobrar e pede outra voz
    (`avoid: ["gemini"]`). Nesse aparelho, vai direto para a OpenAI por 10 min.
- **Painel:**
  - Provedor "Gemini (português do Brasil nativo)".
  - Vozes do Gemini: Kore é a padrão, e há Sulafat, Orus e outras.
  - Aviso de pronto ou pendente.
- **Custo:**
  - É cobrado por tempo: `tutor_voice_gemini` no `ai_usage_ledger` (provedor `google`).
  - O padrão é US$ 0,023/min: o teto do Google é US$ 0,005/min de entrada mais US$ 0,018/min de saída.
- **Limite conhecido:** o servidor não consegue desligar uma conversa do Gemini, porque a ligação é do navegador com o Google. Quem
  desliga é o aplicativo, quando a renovação manda parar. Um aplicativo adulterado poderia continuar até a chave vencer; por isso a
  validade é o tempo que resta.

**Fala sem filtro.**
- **Prompt 2.5.0:**
  - Bloco "FALA DE GENTE, SEM FILTRO": gíria, palavrão espontâneo no jeito do professor e grito curto em maiúsculas para bronca ou
    comemoração.
  - Idioma com "NADA DE SOTAQUE AMERICANO" (fonética do português do Brasil e termos em inglês ditos como um brasileiro diz).
  - Lembrete final reforçado.
- **Motor emocional:**
  - Cada professor tem um piso de linguagem (`language_base`): Acolhedor 1 (sem palavrão), Direto 2 (teto 4) e Durona 3.
  - A Durona "Sem filtro" é o novo padrão (base 4). As instalações que estavam em "forte" passaram para "sem_filtro".
  - A alegria também solta a língua: impressionado 4, satisfeito ou animado 3.
- **Professores:** exemplos e falas novos para os três (migração 4900).
- **O que não mudou:**
  - As proibições: ofensa ao aluno, preconceito, palavrão pesado e ataque pessoal.
  - O gabarito sempre vem do banco.
  - O teto de palavrão continua sendo o menor entre professor, preferência do aluno e painel.

**Validação manual.**
1. Vercel: a `GEMINI_API_KEY` e a `TUTOR_VOICE_ALLOW_EXTERNAL=1` já existem. Publicar com a migração 4900 aplicada. Em Painel › Stazia
   Tutor, deixar "Automático" e conferir "Gemini pronto no servidor".
2. No celular (Safari e Chrome) e no computador, abrir "Conversar com o Tutor" com a Durona. Ouvir o sotaque, as siglas, os remédios,
   os números, as gírias e os palavrões. Conferir o grito curto ao errar de novo e ao acertar.
3. Em Painel › Voz em 30 dias, conferir o custo por ligação (Gemini) e as reconexões.
4. Reserva: no painel, escolher "Realtime" e conferir que a OpenAI abre. Voltar para "Automático".
