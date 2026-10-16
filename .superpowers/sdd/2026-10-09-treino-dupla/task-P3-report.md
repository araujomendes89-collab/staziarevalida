# Tarefa P3 (Etapa P): Componentes "Impresso n", zoom, ocultar imagem e rolagem própria

Ramo treino-pacote-p3 (base eb2d353). Commit da tarefa: cdf3d4a. Sem push; nada de Supabase, GCP, Vercel ou rede.

## O que foi feito
- PrintItem: recebe `index` (número da tela) e, só para o avaliador (`canRelease`), `sourceNumber`. Quando o número do documento oficial é diferente do da tela, aparece em linha pequena "no documento oficial: Impresso N". Impresso trancado para o candidato mostra só "Impresso N · Aguardando liberação" (o título não aparece, porque pode revelar o tema).
- PrintImage: na tela cheia entram os botões − e + (aria-label "Diminuir imagem" e "Ampliar imagem"), o valor em %, de 60% a 200%, passo de 20%, largura-base de 900 px, voltando a 100% ao abrir (igual ao pacote, Room.jsx 65-72). Botões desligam nos limites. Esc e Fechar continuam. Com `canHide`: "Ocultar" (aria-label "Ocultar imagem do impresso") e "Mostrar imagem" (aria-label "Mostrar imagem do impresso"); estado só da tela, não muda a liberação.
- ScrollPane novo: região com nome, foco por teclado, `min-height:0`, `overflow-y:auto`, `overscroll-behavior:contain`, barra nativa estilizada por CSS (a barra customizada do pacote não foi portada, como decidido no plano).
- CSS só com var(--...); exportado no índice; .d.ts de todos.

## Arquivos
Alterados: src/novo/ds/components/osce/{PrintItem,PrintImage}.jsx e .d.ts, osce.css, index.js, src/__tests__/duplaComponentesEstacaoA.test.tsx.
Criados: src/novo/ds/components/osce/ScrollPane.jsx e ScrollPane.d.ts.
Não toquei nos arquivos de P1 nem de P5.

## Testes (pela fila)
- Antes de implementar: duplaComponentesEstacaoA com 10 falhas (TDD).
- Depois: duplaComponentesEstacao, EstacaoA, EstacaoB, duplaComponentesBase, duplaFundacao, duplaSalaFases: 6 arquivos, 100 testes passando.
- Também: duplaEstacoesTela, duoTrainingAndMatchmaking, duplaRotas: 3 arquivos, 58 testes passando.
- Build (npm run build): ok. Typecheck: nenhuma linha em src/novo/ds/components/osce nem nos testes de componentes.

## Desvios e observações
1. Comportamento mudou de propósito: PrintItem trancado não mostra mais o título (só "Aguardando liberação"). O teste antigo "mostra só o título trancado" foi reescrito. RunningPhase.jsx (candidato) já passava title="Aguardando liberação", então a tela de hoje não muda.
2. O foco preso da tela cheia agora circula entre −, + e Fechar (antes só havia o Fechar). Teste antigo atualizado: Tab em Fechar vai para "Diminuir imagem"; Shift+Tab volta.
3. Em PrintItem a linha do documento oficial só aparece com canRelease (avaliador), mesmo se alguém passar sourceNumber para o candidato; há teste.
4. O texto visível dos botões segue o pacote ("Ocultar", "Mostrar imagem"); os nomes completos estão no aria-label, como pediu o plano.
5. Vitrine.jsx (mostruário) não foi alterado: não está na lista de arquivos da tarefa.

## Dúvidas para o dono
Nenhuma nova.

## O que a junção exige
- P4b deve passar `index={display_number}` e `sourceNumber={source_number}` (só avaliador) ao PrintItem, usar `canHide` na imagem do candidato e envolver as duas colunas do avaliador em `ScrollPane` (a altura vem do pai, ex.: viewport menos cabeçalho e rodapé).
- RunningPhase.jsx usa hoje `index={p.index}`; continua funcionando até P4b.
