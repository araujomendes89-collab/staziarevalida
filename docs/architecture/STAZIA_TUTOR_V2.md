# Stazia Tutor v2 (1ª fase): auditoria e implementação

Data: 2026-10-06. Pedido: "PROMPT MESTRE — AUDITORIA E IMPLEMENTAÇÃO DO NOVO STAZIA TUTOR" (itens 1–44). Base anterior: `STAZIA_TUTOR.md` (v1).

## 1. Auditoria: o que o pedido supunha e o que existe

| O pedido supunha | O que existe de verdade | Decisão |
|---|---|---|
| Next.js, rota `/novo/tutor` | React 19 + Vite; o app novo está em `src/novo`, rota `tutor` dentro de `App.jsx` (React Router) | mantido: nada de trocar framework |
| Supabase Edge Functions | servidor Express (`server.ts`) com rotas `/api/tutor/*` e funções `ch_worker_*` só com a chave de serviço; leituras do aluno por `app_*` com RLS | as "funções" do pedido viraram rotas do servidor e funções do banco, no padrão do projeto |
| Stripe / planos | `subscriptions` (plano trial/pro/elite, status, `trial_ends_at`), `plans`, `app_settings.trial_days = 7`; `billing_events` | estendido: `subscriptions.tutor_trial_started_at`; nenhum segundo sistema de planos |
| "Sistema de 40 mensagens por dia" | `tutor_config.daily_message_limit` + `ai_usage.requests` (agregado por dia) | mantido como limite do plano pago; o teste tem os seus limites; a contagem passou a ser por reserva atômica |
| Conversas e memória | `tutor_sessions`, `tutor_messages`, `tutor_answers`, `tutor_reviews` (revisão 1/3/7/14/30), `tutor_mastery()` (domínio por área/subárea a partir de `question_attempts`) | reaproveitados e estendidos |
| Caderno de erros e desempenho | `question_attempts`, `error_notes`, `app_error_profile` (SQIE fase 5), `my_area_stats` | reaproveitados; o Tutor grava em `question_attempts` e os erros resolvem sozinhos quando o aluno acerta de novo em qualquer tela |
| Truth Engine | `questions` (gabarito, explicações, conduta esperada, fontes), `question_analysis` e `question_option_analysis` publicadas, `question_update_cards` (gabarito oficial x conduta atual) | `tutor_truth()` junta tudo, em três níveis (aberta, dica, completa) |
| Voz | voz do navegador (reconhecimento + fala) e voz natural por TTS (`speech.ts`, desligada) | voz em tempo real (OpenAI Realtime) nova; a voz do navegador fica só como reserva enquanto a nova não é confirmada em produção |
| Personalidades | 13 professores com intensidade 1–5 e campo de palavrões | 3 públicos (Acolhedor, Direto, Durona); os 13 ficam inativos (conversas antigas continuam apontando para eles) |

### Mapa

**Existente e reutilizado**: autenticação Supabase e RLS; `subscriptions`/`plans`/`app_settings`; `questions` e análises do SQIE; `question_attempts`; `tutor_*`; `ai_usage`; motor de texto (`engine.ts`), validação (`safety.ts`), provedores de IA (`contentHub/ai`), registro de prompts; tela do Tutor (mesma disposição); componente `Correction` (questões, simulados, caderno de erros).

**Existente e alterado**: `app_tutor_start` (contexto, título pelo contexto, limites do teste, abertura de discussão), `app_tutor_answer` (trava por aluno, limite de questões), `app_tutor_next_question` (área, limite), `app_tutor_status` (direito de uso), `app_tutor_save_preferences` (só o professor), `app_tutor_close` (resumo e duração), `app_tutor_report` (sessões, tipos de erro, "O Tutor percebeu"), `ch_worker_tutor_context` (Truth Engine, memória, estado), `ch_worker_tutor_append` (ledger, estado, evento de erro, título), `tutor_pick_question` (área); prompts (compositor 2.0.0); personalidade (só estilo + estado); conferência (apelido para o aluno passou a ser barrado); tela do Tutor; painel de administração.

**Obsoleto (fora do caminho novo)**: intensidade 1–5 na tela e o ajuste "Tutor Inteligente" (`adaptiveAdjust`, removido: o estado emocional substitui); os 13 professores (inativos); escolha de humor/cobrança/explicação/palavrões na tela; no servidor antigo, `/api/ai/voice-tutor/*`, `/api/gemini/tutor` e `server/services/entitlements` (Firestore) servem o app antigo em `/` e não foram tocados. **Fica até confirmar a voz nova**: voz do navegador e TTS (`useVoice.js`, `speech.ts`, `/api/tutor/speech`); só aparecem quando a voz em tempo real não está configurada no servidor (item 34).

**Novo e necessário**: `ai_usage_ledger` (só acrescenta; `ai_usage` virou o resumo do dia, por gatilho), `student_error_events`, `tutor_voice_calls` (reserva de voz, uma por aluno); funções `tutor_entitlement`, `tutor_begin_trial`, `tutor_truth`, `tutor_learning_memory`, `tutor_session_summary` e as `ch_worker_tutor_*` da voz e das ferramentas; `server/tutor/{emotion,evaluation,tools,realtime,costs}.ts`; `useRealtimeVoice.js`; `TutorDrawer.jsx`. Não houve tabela nova de memória do aluno: `tutor_learning_memory()` deriva de `question_attempts`, `student_error_events`, `tutor_reviews` e dos resumos de sessão (item 15).

## 2. Como ficou

```
CONHECIMENTO (Truth Engine: tutor_truth)  →  AVALIAÇÃO (campo "evaluation" no texto; evaluate_student_reasoning na voz)
→  ESTRATÉGIA (modo + progressão de ajuda)  →  PERSONA (só estilo) + ESTADO DA SESSÃO  →  LINGUAGEM (texto ou voz)
```

- **Compositor de prompt** (`prompts.ts`): BASE → REGRAS MÉDICAS → MODO → [VOZ] → PERSONA + ESTADO; como dado: questão (Truth Engine), memória do aluno, conversa, fala, tarefa. Texto e voz usam as mesmas camadas.
- **Três professores** (`tutor_personalities`): Acolhedor (sem palavrão), Direto (sem palavrão), Durona (palavrão até o teto da plataforma). A Durona não começa xingando: as aberturas são limpas e a frequência vem do estado.
- **Estado emocional** (`emotion.ts`, `tutor_sessions.emotion`): frustração, engajamento, paciência e entusiasmo (0–100), com os eventos do pedido; rótulos CALMO, ENGAJADO, IMPACIENTE, IRRITADO, ORGULHOSO; cada professor manifesta do seu jeito. O aluno não vê números.
- **Quatro modos**: Questões (`questao`), Meus erros (`erros`), Me teste (`perguntas`: tema, área ou pontos fracos, com nível que sobe e desce), Perguntar ao Tutor (`livre`; a primeira pergunta vira o título).
- **Progressão de ajuda**: tentativa → pergunta socrática → pista → pista mais direta → análise de distrator → resolução. "Ver resolução" (ação `reveal`) pula para a resolução e a questão sai como revelada (não conta como acerto).
- **Gabarito oficial x conduta atual**: o cartão de atualização publicado entra no Truth Engine; a regra manda dizer os dois. Nada de fonte inventada; sem base, "não encontrei confirmação".
- **Erros do aluno**: a avaliação silenciosa classifica (13 tipos do pedido) e o erro vira `student_error_events` (com área e tema da questão), uma vez por questão por sessão; acertar de novo em qualquer tela resolve.
- **Resumo da sessão** ao encerrar, só com dados (sem IA): temas, acertos, conceitos firmados, erros, erros recorrentes, o que volta em revisão, próximos temas.
- **Relatório**: o que existia + sessões, minutos (e de voz), tipos de erro, erros que se repetem e "O Tutor percebeu" (frases por regra, com amostra mínima e o número de casos; sem amostra, nada aparece).
- **Tutor em qualquer tela** (`TutorDrawer.jsx`): botão na correção (Questões, Simulados depois de terminados, Caderno de erros), nos Flashcards, nos Grandes Temas ("Me teste") e no Desempenho ("Me teste nos pontos fracos"). O contexto vai junto; o aluno não copia nada.

## 3. Teste grátis, limites e concorrência (tudo no banco)

`tutor_entitlement(user)` responde: pode usar, texto, voz, se está em teste, dia do teste, quando acaba, quanto resta hoje e no teste, plano, bloqueio.

| | Teste grátis | Plano pago |
|---|---|---|
| Duração | 7 dias (`app_settings.trial_days`) a partir do **primeiro uso real** (primeira resposta de IA ou primeira voz); uma vez por conta | — |
| Texto | 40 interações por dia | `daily_message_limit` (40) |
| Voz | 10 min por dia e 40 min no total | 60 min por dia (padrão meu, ajustável) |
| Questões no Tutor | 30 por dia | sem limite |

Todos ajustáveis no painel (Administração → Configurações → Stazia Tutor), com motivo registrado. O interruptor "Planos pagos + teste grátis" desligado libera tudo (só para testes internos).

**Equipe** (desde 2026-10-06, migração `…4600_equipe_acesso_completo.sql`): administrador **e editor** entram como plano pago (`staff: true` na resposta), nunca no teste grátis, e o teste do Tutor nunca começa para eles. O mesmo vale fora do Tutor: conteúdo Pro (`has_pro()`), aviso do teste no Início (`app_home`) e contagem de planos na visão geral (só alunos). A assinatura da pessoa fica como está: se ela sair da equipe, volta a valer. Limites diários de IA (custo) são os do plano pago.

**Concorrência**: texto reserva uma interação numa transação com trava por aluno antes de chamar a IA (dois aparelhos não passam do limite); falha da IA devolve a reserva (+1/−1 no ledger, nada apagado). Voz: uma chamada ativa por aluno (índice único); a chamada reserva janelas de 2 min, renovadas pelo app a cada minuto; o tempo conta pelo relógio do servidor; sem renovação, a chamada expira (conta até o fim da reserva) e a varredura do servidor a desliga na OpenAI (`POST /v1/realtime/calls/{id}/hangup`). Abrir em outro aparelho: "Assumir aqui" encerra a anterior.

## 4. Voz em tempo real (OpenAI Realtime, WebRTC)

1. `POST /api/tutor/voice/start`: login, direito, cota, uma voz por aluno, reserva; o servidor pede à OpenAI um segredo temporário (`POST /v1/realtime/client_secrets`, expira em 2 min) com instruções compostas, voz do professor, detecção de turno semântica com interrupção (`semantic_vad`, `interrupt_response`) e as ferramentas. A chave principal nunca sai do servidor.
2. O navegador abre o WebRTC com a OpenAI (`POST /v1/realtime/calls`) usando o segredo; o canal `oai-events` traz os eventos.
3. Ferramentas (o modelo nunca toca no banco): `get_question_context` (sem gabarito com a questão aberta; resolução só com `reveal`), `submit_answer` (quem corrige é o banco), `next_question`, `get_student_learning_memory`, `get_student_errors`, `get_topic_context` (trechos de fontes oficiais), `evaluate_student_reasoning` (avaliação neutra, só depois da resposta), `register_learning_event`. O navegador repassa a `/voice/tool`; o servidor executa com o aluno e a sessão da chamada.
4. Transcrições vão para `/voice/transcript`: viram mensagens da sessão e a fala do professor passa pela mesma conferência do texto. **Limite assumido**: na voz ao vivo a conferência acontece depois de falar; se algo escapou (resposta adiantada, número sem fonte, tom acima do limite, contestar o gabarito), o servidor devolve uma correção que o professor diz em seguida.
5. `response.done` → `/voice/usage`: tokens de texto, áudio e cache no ledger, com custo estimado. A cota é o tempo; tokens são só custo e telemetria.
6. Estados na tela: conectando, ouvindo, pensando, falando, pausado, reconectando, encerrado, erro (microfone negado, sem microfone, navegador sem suporte, rede, tempo esgotado, outro aparelho, cota). Nada fica carregando para sempre (20 s para conectar).

## 5. Custo (`AI_COST_CONFIG`)

`server/tutor/costs.ts`, atualizável pelo `.env` (JSON) sem migração. Valores padrão (US$ por milhão de tokens, conferidos em sites de preço em 2026-10; confirmar na página oficial da OpenAI antes de lançar): gpt-realtime-2.1 áudio 32/64, cache 0,40, texto 4/24; gpt-realtime-2.1-mini áudio 10/20, cache 0,30, texto 0,60/2,40. O ledger guarda provedor, modelo, tokens, duração, professor, modo e custo, o que permite custo por aluno, sessão, minuto, professor, recurso e plano. O painel mostra custo dos últimos 30 dias por recurso e por professor e quantos testes viraram assinatura.

## 6. Variáveis de ambiente novas

```
OPENAI_API_KEY=...                       # só no servidor
OPENAI_REALTIME_MODEL=...                # obrigatório para ligar a voz em tempo real
TUTOR_VOICE_ALLOW_EXTERNAL=1             # consentimento: voz do aluno e respostas passam pela OpenAI
OPENAI_REALTIME_TRANSCRIBE_MODEL=...     # opcional: transcrição da fala do aluno
AI_COST_CONFIG={"modelo":{"audio_out":64}}   # opcional
TUTOR_AI_PROVIDER=openai / TUTOR_MODEL=...    # para o texto também ir pela OpenAI (hoje: Anthropic)
```

## 7. Testes

`src/__tests__/tutor.test.ts` (banco e motor, IA simulada), `tutorV2.test.ts` (teste grátis, limites, reservas, voz com OpenAI simulada, ferramentas, conferência do que foi dito, ledger, isolamento entre alunos, relatório, custo), `tutorScreen.test.tsx` e `tutorRealtime.test.tsx` (tela, WebRTC simulado, painel, resolução, resumo, relatório).

## 8. Critérios de aceitação (item 42)

Feito e testado com IA e OpenAI **simuladas**: 1–5 (professor, modo, texto), 9–20 (consumo, limite do teste, Tutor dentro da questão, Truth Engine, erro registrado e no relatório, isolamento, chave fora do navegador, professor e modo sem mudar o fato). Implementado, mas **sem teste com a OpenAI de verdade** (não há chave válida): 6–8 (abrir a voz, interromper, encerrar). A chave da OpenAI encontrada no projeto (`revalida-reverse-engine/.env`) foi recusada pela OpenAI (401) em 2026-10-05.

## 9. Pendências reais

- **Chave da OpenAI válida** e `OPENAI_REALTIME_MODEL` no `.env` do servidor, mais `TUTOR_VOICE_ALLOW_EXTERNAL=1`; depois, uma conversa de verdade para medir latência, custo por minuto e o comportamento do turno ("aham").
- O nome exato do modelo de transcrição (se for usar) e a confirmação dos preços na página oficial.
- Decisão: o texto continua na Anthropic (testado) ou passa para a OpenAI (`TUTOR_AI_PROVIDER=openai`, `TUTOR_MODEL=...`).
- Depois de a voz em tempo real ser confirmada em produção: remover a voz do navegador e o TTS (item K).
- Retenção das transcrições: hoje ficam como mensagens da sessão, sem áudio guardado; falta a política de quanto tempo guardar.

## 10. Motor de personalidade humana (prompt 2.2.0, migração `3700_tutor_motor_personalidade`, 2026-10-06)

Pedido: "MOTOR DE PERSONALIDADE HUMANA" (itens 1–32). Código: `server/tutor/emotion.ts` (estado e regras), `engine.ts` (turno de texto),
`tools.ts` (voz), `prompts.ts` (base do personagem). Princípio mantido: o motor decide **como** falar; o que ensinar vem do Truth Engine.

| Item do pedido | Como ficou |
|---|---|
| 3. Estado interno | paciência, irritação, calor, entusiasmo, rigor, sarcasmo, confiança no aluno, frustração; contadores (erros e acertos seguidos, repetidos, por desatenção, de raciocínio, de conhecimento, questões); 8 humores. Guardado em `tutor_sessions.emotion` |
| 4–5. Tipo e gravidade do erro | a avaliação silenciosa devolve `error_type`, `severity` (1–5) e `unsafe`; chute, troca de alternativa e "esqueceu a explicação" saem dos fatos |
| 7–8. Frustração | gravidade × 3 × multiplicador do professor (Acolhedor 0,25, Direto 0,70, Durona 1,25); repetido +12, explicação esquecida +15, desatenção +8, conduta perigosa +18 (todos × multiplicador); acerto −7, excelente −12, três seguidos −15; limite 0–100 |
| 9–13. Professores e escalada | texto de personagem do pedido em cada professor; faixas da Durona (0–20 … 81–100) como referência de tom; no topo, mais cobrança, não mais palavrão; a bronca vai para a resposta, nunca para a pessoa |
| 14. Palavrão sem roteiro | intensidade de linguagem 0–5 por resposta (sobe com a frustração até o teto do professor: Acolhedor 1, Direto 3, Durona 5). A conferência aceita palavrão só a partir da intensidade 3 (um degrau de folga) |
| 15. Não repetir frases | as expressões das últimas falas vão como "evite repetir" |
| 16. Variação humana | ±8 na subida da frustração, com semente por turno (mesmo valor antes e depois da avaliação) |
| 17. Humor do dia | bom, neutro ou impaciente, sorteado ao abrir a sessão; aberturas próprias por humor |
| 18–22. Eventos | primeira questão, primeiro erro, 3 e 5 erros, erro repetido, 3/5/10 acertos, raciocínio perfeito, conduta perigosa, trocou certa por errada (e o inverso), resposta rápida (< 12 s) ou lenta (> 6 min). A tela manda o tempo de resposta e a primeira alternativa marcada |
| 12 (topo). Parar a sequência | a Durona a partir de 61 (os outros a partir de 81), em erro repetido, trava a próxima questão até o aluno explicar com raciocínio aceitável (ou insistir duas vezes) |
| 23–24. Memória longa e piadas internas | `tutor_learning_memory`: perfil (temas fortes e fracos, taxa de desatenção, tempo médio, professor preferido, qualidade do raciocínio), piada interna (o assunto que mais derrubou o aluno, e se ele já superou) e evolução (tema que errava e agora acerta) |
| 25–26. Avatar e voz | cada resposta devolve `avatar` (emoção, intensidade, animação, expressão, estilo de voz, velocidade). **Não existe mascote animado no app**: os dados estão prontos para ele |
| 31. Resposta estruturada | `pedagogical_action` virou `recommended_action` com "require_explanation"; emoção e avatar são calculados no servidor (consistentes), não escolhidos pela IA |

Não foi feito: o mascote NEX (não há desenho nem animações no projeto) e tags de emoção para TTS (a voz em tempo real recebe o tom
pelas instruções e pelas ferramentas). O nome do produto segue StaziaMed; o pedido fala em "StaziaNexus".

## 11. Voz em tela cheia (Stazia Voice Mode, prompt 2.4.0, migração `4400_tutor_voice_mode`, 2026-10-06)

A conversa por voz saiu da barra dentro do chat e virou uma tela cheia com a esfera animada (vídeo enviado pelo dono), GPT-Live como
provedor preferido (com o Realtime de reserva), delegação do conteúdo ao motor do Tutor, painel da voz, lembranças entre conversas e
métricas por ligação. Detalhes, pendências e validação manual: `STAZIA_VOICE_MODE.md`.

## 12. Fala sem filtro e português do Brasil nativo (prompt 2.5.0, migração `4900_tutor_sem_filtro_voz_gemini`, 2026-10-06)

Pedido: "quero algo mais sem filtros, bem natural, ela pode gritar; ainda está com muito sotaque americano". O professor fala como gente
(gíria, palavrão espontâneo no jeito de cada um, grito curto para bronca ou comemoração), com piso de linguagem por professor; as
proibições não mudaram. A voz passou a preferir o Gemini (áudio nativo, pronúncia de brasileiro), com a OpenAI de reserva automática.
Detalhes: `STAZIA_VOICE_MODE.md` §16.
