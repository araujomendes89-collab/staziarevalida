# Voice Tutor — Personality Engine (Fase 2/3, ramo `vt-personalidade`)

Data: 2026-10-16. Nada publicado, nada aplicado no banco real, sem chave paga.

## O que foi feito
| Peça | Arquivo | O que faz |
|---|---|---|
| Catálogo de reações | `src/shared/tutor/voiceReactions.ts` | 16 reações citadas pela documentação oficial (ElevenLabs v3/v4; Gemini TTS só `<laugh>`/`<sigh>`), o que cada provedor entende, os 7 perfis configuráveis (Tranquilo, Direto, Durona atual, Explosiva N1–N4) |
| Motor | `server/tutor/personalityEngine.ts` | 9 parâmetros por perfil (formalidade, sarcasmo, impaciência, intensidade, frequência de palavrão e de reação, provocação, socrático, extensão); 13 estados; transições fixas por acerto, erro, erro repetido, bom raciocínio, conduta perigosa, chute, frustração, brincadeira, pedido de seriedade, tema sensível e crise; política do turno (palavrão, grito, zombaria, reações) e camada de prompt |
| Filtro | `server/tutor/voiceReactionFilter.ts` | separa **texto falado** (só reações liberadas, na marcação do provedor), **transcrição exibida** (sem marcação nem cena) e **metadados de emoção** (estado, intensidade, reações e posição, expressão do mascote); tira `*gargalhada*`, `(risos)`, `</td>`; com grito desligado devolve MAIÚSCULAS ao normal sem mexer em siglas; confere ameaça e deboche da pessoa |
| Ligação ao banco | `server/tutor/voiceReactions.ts` | `planPersonaTurn` (ponto de encaixe do turno de voz do vt-voz); falha fechada (sem banco = nenhuma reação, Explosiva desligada) |
| Painel | `src/novo/app/admin/VoiceReactionsPanel.jsx` (aba Vozes do Nexus) | o dono marca reação por professor/nível, frequência por fala e "a cada 10 falas", liga/desliga a Explosiva, salva com motivo |
| Tela do aluno | `src/novo/app/tutor/ExplosivaPreferences.jsx` (encaixe `duronaSettings` em `NexusLobby`) | "Jeito da Durona": N1–N4, gritos e palavrões ligados/desligados, voltar ao padrão. O encaixe só aparece quando a tela passar o quadro (ligar junto com a voz nova) |
| Banco | `supabase/migrations/20261003011900_tutor_reacoes_de_voz.sql` + desfazer | tabelas novas (regras do dono, interruptor da Explosiva, escolha do aluno) e `tutor_adult_declared` (lê a declaração do Termo 2.0 se a tabela existir); nada existente muda |

## Decisão do dono de 16/10: "ativo para todos"
- A Durona Explosiva **nasce ligada**; quem escolhe a Durona começa no **N3 Estressada**, com **gritos e palavrões ligados**.
- O aluno baixa o nível (N1/N2) ou desliga gritos e/ou palavrões no "Jeito da Durona"; "Voltar ao padrão" apaga a escolha.
- N3/N4 dependem da **declaração de 18+ e de médico gravada no aceite do Termo 2.0** (`legal_declarations`, migração 011500 do ramo vt-termo). Nada é perguntado de novo. Sem a declaração (ou antes de o Termo 2.0 estar no banco), o servidor usa **N2** e o banco recusa gravar N3/N4. O ensaio do banco aplica a migração real do vt-termo.
- A Durona de sempre só volta se o administrador desligar a Explosiva no painel.
- A coluna antiga `tutor_preferences.profanity` (padrão "off") continua valendo só para o Tutor atual; o motor novo usa a escolha própria (padrão ligado). Nenhuma preferência salva foi alterada.

## Regras garantidas por teste
- N1 sem palavrão nem grito; N2 no máximo palavrão leve; N3/N4 palavrão do pedido do dono; N3/N4 sem a declaração do Termo caem para N2; palavrão e grito desligados pelo aluno valem em qualquer nível.
- Ofensa à pessoa, discriminação, ameaça, xingamento pesado: barrados em qualquer nível. Zombaria do erro passa.
- Crise (ex.: "quero morrer"): todos os professores calmos até o fim da conversa, sem palavrão/grito/reação, com CVV 188.
- Reação só passa se o dono marcou para aquele perfil, o provedor entende, combina com o estado e não estourou a frequência.
- Gabarito escondido continua barrado pelo `safety.ts` mesmo na N4; simulado sem ajuda → nenhum perfil dá dica.
- O Tutor atual (engine.ts, voz do professor, fingerprint das vozes aprovadas) não foi tocado.

## Limitações honestas
- Qualidade das reações em pt-BR: **não confirmada**; tudo nasce desmarcado.
- Gemini ao vivo e OpenAI ao vivo não leem marcação: a lista vira só orientação de tom (o modelo fala antes de qualquer filtro).
- Detecção de crise/seriedade é por palavras (determinística): pode errar em frase incomum.
- Falta: ligar `planPersonaTurn` no endpoint do vt-voz e passar o "Jeito da Durona" para a entrada do Tutor junto; aplicar o Termo 2.0 (vt-termo) antes, senão todos ficam no N2; ouvir as reações com a voz escolhida antes de marcar.
- Prévia sem login: http://127.0.0.1:31992/ (painel) e `?tela=aluno` (aluno; `&termo=nao` mostra quem ainda não declarou).
