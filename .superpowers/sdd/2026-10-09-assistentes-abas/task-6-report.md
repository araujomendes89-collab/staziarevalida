# Relatorio Tarefa 6

Base: c600369ef64786fcf684d5b7b5ebc86569a574f0

## Implementado
- src/shared/textDiff.ts (wordDiff, itemDiff, LCS)
- src/novo/app/admin/assistant/assistantApi.js (status, run, readPdfMaterial; reaproveita pdfPages/capPages sem mudar as Aulas)
- src/novo/app/admin/assistant/AssistantPanel.jsx (tres modos, material, cartoes, achados, avisos, custo)
- Testes: textDiff.test.ts e assistantPanel.test.tsx

## TDD
- RED: `npx vitest run src/__tests__/textDiff.test.ts src/__tests__/assistantPanel.test.tsx --maxWorkers=1` -> 2 files failed, no tests (modulos inexistentes).
- GREEN: mesmo comando -> 16 passed (16).

## Decisions
- Erro do run: mensagem do servidor (erro com status) e mostrada como veio; sem status passa por messageOf (que esconde mensagens tecnicas). Motivo: mensagens como "IA indisponivel: x" nao terminam em ponto e messageOf as esconderia.
- Testes dos modos usam within(radiogroup "Modo") (ruling A1); campos vazios vem marcados, entao os testes de material fornecem `passos` preenchido.
- Teste extra: Conferir de um campo, erro do run, wordDiff com bordas.
- "Usar tudo" aparece no Preencher com 2 ou mais sugestoes pendentes.
- Achado sem campo (null) mostra "Item inteiro".
- Material enviado em todos os modos quando dado.
