# Voz do Stazi (celebracoes)

Uma voz fixa (Gemini TTS pelo Vertex, voz pre-definida "Charon", grave e rapida), tres estilos de fala:
- `durona/` (PADRAO, nivel moderada): seca, ironica, com carinho por tras.
- `durona_forte/` (extra, nivel forte; sem_filtro usa estas): mais seca e exigente, sem ofensa.
- `stazi/`: malandro simpatico, mais solto.

`manifest.json` lista cada arquivo: evento(s), texto, estilo, entonacao (v1, v2, v3), duracao, pico, frequencia
("sempre" para eventos de impacto; "ocasional" para XP, Coins, acerto, flashcards, dia comum), momento e atraso.
169 MP3 mono 24 kHz (~2 MB). Frases de impacto tem ate 3 entonacoes; as demais, 1.

Honestidade: a equipe de IA nao ouve audio. Medido por maquina: pico sempre abaixo de 0 dB, volume uniforme,
silencio das pontas e pausas internas cortados. Um modelo de IA avaliou testes de vozes (nao os 169 arquivos finais).
Duracao: o TTS fala devagar; mesmo acelerando ate 1,4x, 75 arquivos passam de 1,5 s (campo `dentro_do_limite_1_5s` = false;
maximo 3 s). Quem integra deve preferir os de `dentro_do_limite_1_5s: true`. O dono precisa ouvir e aprovar a voz.
Custo estimado: menos de US$ 1 (cerca de 55 mil tokens de audio, duas rodadas; a primeira, com modelo 3.1, foi descartada por ser lenta).
Fonte do texto: falas do agente de efeitos (falas.py) + 5 eventos extras. Geracao em /Volumes/StaziaMed/.tmp-aulas/voz-stazi/.
