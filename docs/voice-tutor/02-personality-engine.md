# Voice Tutor — Personality Engine (Fase 2/3, ramo `vt-personalidade`)

Data: 2026-10-16. Nada publicado, nada aplicado no banco real, sem chave paga.

## O que foi feito
| Peça | Arquivo | O que faz |
|---|---|---|
| Catálogo de reações | `src/shared/tutor/voiceReactions.ts` | 16 reações citadas pela documentação oficial (ElevenLabs v3/v4; Gemini TTS só `<laugh>`/`<sigh>`), o que cada provedor entende, os 7 perfis configuráveis (Tranquilo, Direto, Durona atual, Explosiva N1–N4) |
| Motor | `server/tutor/personalityEngine.ts` | 9 parâmetros por perfil (formalidade, sarcasmo, impaciência, intensidade, frequência de palavrão e de reação, provocação, socrático, extensão); 13 estados; transições fixas por acerto, erro, erro repetido, bom raciocínio, conduta perigosa, chute, frustração, brincadeira, pedido de seriedade, tema sensível e crise; política do turno (palavrão, grito, zombaria, reações) e camada de prompt |
| Filtro | `server/tutor/voiceReactionFilter.ts` | separa **texto falado** (só reações liberadas, na marcação do provedor), **transcrição exibida** (sem marcação nem cena) e **metadados de emoção** (estado, intensidade, reações e posição, expressão do mascote); tira `*gargalhada*`, `(risos)`, `</td>`; com grito desligado devolve MAIÚSCULAS ao normal sem mexer em siglas; confere ameaça e deboche da pessoa |
| Ligação ao banco | `server/tutor/voiceReactions.ts` | `planPersonaTurn` (ponto de encaixe do turno de voz do vt-voz); falha fechada (sem banco = nenhuma reação, Explosiva desligada) |
| Painel | `src/novo/app/admin/VoiceReactionsPanel.jsx` (aba Vozes do Nexus) | o dono marca reação por professor/nível, frequência por fala e "a cada 10 falas", liga a Explosiva, salva com motivo |
| Banco | `supabase/migrations/20261003011900_tutor_reacoes_de_voz.sql` + desfazer | tabelas novas (regras do dono, interruptor da Explosiva, escolha do aluno); nada existente muda |

## Regras garantidas por teste
- N1 sem palavrão nem grito; N2 no máximo palavrão leve; N3/N4 palavrão do pedido do dono; N3/N4 sem ativação + maioridade caem para N2.
- Ofensa à pessoa, discriminação, ameaça, xingamento pesado: barrados em qualquer nível. Zombaria do erro passa.
- Crise (ex.: "quero morrer"): todos os professores calmos até o fim da conversa, sem palavrão/grito/reação, com CVV 188.
- Reação só passa se o dono marcou para aquele perfil, o provedor entende, combina com o estado e não estourou a frequência.
- Gabarito escondido continua barrado pelo `safety.ts` mesmo na N4; simulado sem ajuda → nenhum perfil dá dica.
- O Tutor atual (engine.ts, voz do professor, fingerprint das vozes aprovadas) não foi tocado.

## Limitações honestas
- Qualidade das reações em pt-BR: **não confirmada**; tudo nasce desmarcado.
- Gemini ao vivo e OpenAI ao vivo não leem marcação: a lista vira só orientação de tom (o modelo fala antes de qualquer filtro).
- Detecção de crise/seriedade é por palavras (determinística): pode errar em frase incomum.
- Falta: tela do aluno para escolher N1–N4 e desligar gritos (as funções do banco já existem); ligar `planPersonaTurn` no endpoint do vt-voz; ouvir as reações com a voz escolhida antes de marcar.
