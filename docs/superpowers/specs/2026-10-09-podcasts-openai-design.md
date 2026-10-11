# Podcasts: voz da OpenAI por enquanto — desenho aprovado

Data: 2026-10-09. Contexto: a voz Gemini dos Podcasts usa a chave pré-paga do AI Studio, que está sem créditos; o dono decidiu
"Usar só a OpenAI por enquanto" (2026-10-09), em vez de migrar para o Text-to-Speech do Google agora.

| Tema | Decisão |
|---|---|
| Voz padrão | OpenAI (`PODCAST_TTS_OPENAI_MODEL`, padrão `gpt-4o-mini-tts`), já com chave no site |
| Voz Gemini | Fica DESLIGADA por padrão (aparece como indisponível, sem nome de fornecedor para quem não é da equipe — a tela é só da equipe) e só volta se a variável `PODCAST_TTS_GEMINI_ENABLED=1` for definida no servidor; o código da Gemini fica |
| Áudio já gerado | Não muda |
| Telas | O seletor de voz da tela de Podcasts abre na OpenAI; a opção Gemini mostra "indisponível por enquanto" enquanto desligada |

Testes: com a variável ausente, `ttsStatus('gemini')` não fica pronto com motivo claro e a geração recusa a Gemini antes de
qualquer chamada; a OpenAI segue funcionando (rede simulada); com `PODCAST_TTS_GEMINI_ENABLED=1` a Gemini volta como hoje; a tela
abre com a OpenAI escolhida.
