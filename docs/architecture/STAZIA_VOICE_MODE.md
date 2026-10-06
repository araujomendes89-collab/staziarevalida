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
OPENAI_VOICE_PROVIDER=live           # opcional: live | realtime | auto (o painel pode escolher por cima)
OPENAI_REALTIME_VOICE=marin          # opcional: voz padrão quando o professor não tem uma
DETERMINISTIC_TUTOR=true             # só testes: sem variação aleatória
TUTOR_SETTINGS_TTL_MS=15000          # opcional: cache da configuração do painel
AI_COST_CONFIG={"gpt-live-1":{"per_minute":0.05}}   # opcional (este já é o padrão)
```

## 7. Modelo e provedor

GPT-Live 1 (`gpt-live-1`, US$ 0,05/min de voz, cobrado por segundo; o servidor que responde às delegações usa o motor de texto do
Tutor, cobrado à parte) quando `OPENAI_LIVE_MODEL` existir e o painel estiver em "Automático" ou "GPT-Live"; senão, OpenAI Realtime
(`OPENAI_REALTIME_MODEL`). Nomes de modelo só no ambiente (e na tabela de preços).

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
`tutor.test.ts` (versão 2.4.0, situação), `tutorRealtime.test.tsx` (tela cheia).

## 13. Pendências reais

- **GPT-Live nunca foi chamado de verdade**: tudo foi testado com a OpenAI simulada, a partir da documentação de 2026-10. Falta pôr
  `OPENAI_LIVE_MODEL=gpt-live-1` na Vercel e conversar de verdade (a conta precisa ter acesso ao GPT-Live; sem acesso, cai no Realtime).
- Escolher a voz com avaliação humana em português (marin × cedar) no GPT-Live e no Realtime.
- A migração 4400 e o código ainda não foram aplicados nem publicados (dependem do pedido de deploy).
- Exportação de dados da conta (LGPD) ainda não inclui `tutor_memories`.

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
