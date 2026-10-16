# Voice Tutor — voz ao vivo pelo VERTEX (ponte no Cloud Run)

Decisão do dono (16/10/2026): cérebro e voz = **Gemini Live com as nossas ferramentas, pelo Vertex** (não pela API direta do Gemini/AI Studio). Ramo `vt-voz`, sem deploy, sem push.

## 1. Como fica o caminho

```
Navegador (app)                         Vercel (app)                              Cloud Run "stazia-voz-ponte"        Google Vertex AI
POST /api/tutor/voice/start  ───────►   direito, cota, 1 voz por aluno (banco)
                                        monta instruções (núcleo do Tutor +
                                        Personality Engine) e ferramentas,
                                        SELA o bilhete (AES-256-GCM)
◄──── { gemini_ponte: { url, bilhete } }
WSS url ── {t:"abrir", bilhete} ─────────────────────────────────────────────────►  abre o bilhete (segredo só
                                                                                    do app e da ponte), checa
                                                                                    validade, uso único, origem  ──► Gemini Live
◄────────────── voz (PCM 24 kHz), transcrições, interrompido, ferramentas ◄─────────  conta de serviço do Cloud Run  ◄── us-central1
toolCall → POST /api/tutor/voice/tool (login do aluno, como hoje) → resposta → ponte (só ids que o Google pediu)
fim da ligação ─────────────────────────────────────────────────────────────────►  relatório assinado (tokens, custo) ─► POST /api/tutor/voice/ponte-uso → ai_usage_ledger
```

- **Nenhuma credencial do Google no navegador**: o navegador só tem o bilhete (cifrado; não lê nem altera), que vale 60 s para abrir e uma vez.
- **Sem retomada de sessão no Google** (o Google não guarda a conversa para retomar). Se o Google fechar a conexão (aviso "goAway", ~10 min) ou ela cair, a ponte abre outra sessão com o mesmo bilhete e devolve a conversa até ali como texto (guardado só na memória da ponte, apagado no fim). Até 3 reaberturas.
- **O servidor consegue desligar a voz**: a ponte corta no limite do bilhete (limite do painel ou o saldo de voz do aluno). Antes, com a chave temporária, a voz do Gemini não podia ser derrubada pelo servidor.
- **Ferramentas**: as 11 do Tutor (`REALTIME_TOOLS`), executadas no nosso servidor com o login do aluno; o gabarito só sai depois da resposta. Depois de `submit_answer`, a resposta traz `tom_do_professor` (Personality Engine com acerto/erro).
- **Personality Engine** (ramo vt-personalidade, 7706e99c, juntado no vt-voz): no caminho do Vertex a camada de personalidade da sessão é `personaPromptLayer(planPersonaTurn(...))` (Durona Explosiva N3 padrão, reações escolhidas pelo dono, bloqueios). Se o banco ainda não tiver as funções do motor (migração 20261003011900), fica a persona de sempre. GPT-Live, Realtime e a API direta seguem iguais.
- **Uso**: o tempo continua contado pelo banco (reserva e renovação, como hoje). O custo da ligação pelo Vertex entra pelos **tokens** que a ponte relata (`/voice/ponte-uso`, assinatura HMAC); o encerramento não lança custo por tempo para essas ligações (sem contar duas vezes). Se o relatório falhar, a ligação fica sem custo no livro-caixa (aparece no log do Cloud Run).
- **Estados reais** na tela: conectando, ouvindo, você falando, pensando, professora falando, interrompida, reconectando, microfone desligado, erro, encerrada (eventos da ponte e do microfone; nenhum temporizador inventa estado).

## 2. Arquivos

| Onde | O quê |
|---|---|
| `server/vozPonte/bilhete.ts` | selar/abrir o bilhete; uso único; assinatura do relatório |
| `server/vozPonte/ponte.ts` | a ponte (setup do Vertex, eventos, ferramentas, reabertura sem retomada, limite, uso) |
| `server/vozPonte/main.ts`, `googleToken.ts` | serviço do Cloud Run (`/saude`, WS `/ponte`, origens permitidas) |
| `cloudrun/voz-ponte/Dockerfile`, `cloudbuild.yaml` | imagem (Node 22 + `ws`, ~17 KB de código) |
| `scripts/cloudrun/deploy-voz-ponte.sh` | publicação (não rodada) |
| `server/tutor/voiceProviders.ts` | `vertexPonteConfig`; `geminiVoiceConfig` prefere o Vertex quando a ponte está configurada |
| `server/tutor/realtime.ts` | `tryGemini` sela o bilhete (Vertex) ou cai na chave temporária antiga |
| `server/tutor/router.ts` | `/voice/ponte-uso`; `tom_do_professor` em `submit_answer` (só Vertex) |
| `src/novo/app/tutor/voice/geminiPonte.js` | cliente do navegador (mesmo controle do `openGeminiLive`) |
| `src/novo/app/tutor/useRealtimeVoice.js` | usa a ponte quando o servidor manda `gemini_ponte` |
| `server/vozTeste/*`, `scripts/previa-voz/*` | prévia local (faz o papel do app, com a mesma ponte e o mesmo cliente) |
| `src/__tests__/vozPonte.test.ts`, `tutorGeminiVoice.test.ts` (bloco Vertex), `vozTeste.test.ts` | testes |

## 3. Como o dono testa no Mac (prévia, sem publicar nada)

1. No Terminal, na pasta do ramo: `bash scripts/previa-voz/rodar.sh` (precisa do `gcloud` com o login do dono).
2. Abrir **http://127.0.0.1:31991** no Chrome, escolher voz, nível da Durona (N1 a N4), gritos e palavrões, e clicar **Iniciar conversa**; permitir o microfone.
3. A professora apresenta a questão de teste (anafilaxia). Responda falando ("eu marco a letra B"), pergunte a dose, fale por cima dela para interromper. A tela mostra o estado, a transcrição, o tempo do 1º áudio, o da interrupção e o custo da sessão em dólar.
Questão fictícia, sem aluno e sem banco; custo de centavos por conversa.

## 4. O que o dono precisa para publicar (nada disso foi feito; nenhum segredo aparece na tela)

Ordem:
1. **Termo 2.0** (frente vt-termo, em andamento): ativar antes de qualquer aluno usar a voz pelo Vertex (fornecedor "Google Cloud (Vertex AI)", retenção, consentimento de voz). Junto, a migração do Personality Engine (20261003011900) para a Durona Explosiva valer na voz; sem ela, fica a persona de sempre.
2. **Ponte no Cloud Run**: `PROJECT=staziamed-revalida-prod COPIAR=1 scripts/cloudrun/deploy-voz-ponte.sh`
   - cria a conta de serviço `stazia-voz-ponte` (só `roles/aiplatform.user`), o segredo `stazia-voz-ponte-segredo` no Secret Manager (aleatório, criado uma vez), a imagem no Cloud Build e o serviço em **us-central1**;
   - no Cloud Run as variáveis já vão pelo script: `VOZ_PONTE_SEGREDO` (do Secret Manager), `VOZ_PONTE_PROJETO=staziamed-revalida-prod`, `VOZ_PONTE_REGIAO=us-central1`, `VOZ_PONTE_ORIGENS=https://app.staziamed.com.br,https://staziamed-revalida.vercel.app` (conferir), `VOZ_PONTE_RELATORIO_URL=https://app.staziamed.com.br/api/tutor/voice/ponte-uso`;
   - opcional `MIN_INSTANCES=1` (sem partida a frio na primeira ligação; custo fixo da instância ligada);
   - conferir: `curl <endereço>/saude` responde `{"ok":true}`.
3. **Vercel (Production)**: `VOZ_PONTE_URL=wss://<endereço do Cloud Run>/ponte` (o script imprime) e `VOZ_PONTE_SEGREDO` = o MESMO valor do Secret Manager (com `COPIAR=1` o script põe na área de transferência do Mac, sem mostrar; colar direto no painel). Publicar o site com este ramo (vt-voz, que já contém o vt-personalidade).
4. **Testar só com a equipe**: a trava `TUTOR_VOICE_ALLOW_EXTERNAL=1` sozinha deixa a equipe testar; abrir uma conversa por voz no app e conferir no log da ponte (`gcloud run services logs read stazia-voz-ponte --region=us-central1 --project=staziamed-revalida-prod --limit=50`) e no livro-caixa (custo por tokens, `meta.via = vertex-ponte`).
5. **Liberar aos alunos**: só depois do Termo 2.0 ativo e do teste da equipe, `TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1` na Vercel (trava própria da voz ao vivo dos alunos). Antes disso, cadastrar preço e tetos de gasto (memória "preços e tetos antes dos alunos").
A chave `GEMINI_API_KEY` deixa de ser usada pela voz quando a ponte está configurada; pode ser retirada depois.

## 5. Pendências e riscos

- Termo/Política: o áudio do aluno passa pelo Google (Vertex) — citar fornecedor, retenção e consentimento (decisão do dono de 15/10).
- Uso único do bilhete é por instância da ponte (até 10 instâncias): reuso entre instâncias dentro dos 60 s é possível só para quem já tem o bilhete (o próprio aluno). Se quiser fechar 100%, gravar o nonce no banco.
- O tom muda só quando o aluno responde (ferramenta). Mudança de humor a cada fala (sinais do texto do aluno) fica para a Fase 4.
- As instruções da voz têm ~4.900 tokens e são cobradas a cada fala (metade do custo): encurtar.
- 2 de 10 conversas explosivas caíram no meio na bancada (sem diagnóstico ainda); a ponte reabre sozinha.
- ElevenAgents (endpoint Custom LLM pronto em `server/vozTeste/customLlm.ts`) e Claude pelo Vertex (cota 0) estão parados.
