# Tarefa 3, parte B · MatchCard e PepTable · relatório

Ramo `treino-dupla-t3b` (partida 2037447). Nada empurrado; nada tocado fora deste worktree; Supabase/GCP/Vercel não usados.

## O que foi construído
- `MatchCard`: cartão de parceiro para deslizar. Limiar 110 px, rotação dx/22, saída 260 ms cubic-bezier(.2,.7,.2,1) e `onSwipe` 240 ms depois, volta 220 ms, transform direto no DOM, `touch-action: pan-y`, selos ESTUDAR/PULAR com opacidade |dx|/110, "Por que vocês combinam", pílulas "online" e "{n}% compatível" (número por `formatDecimal`), tags em `--violet-50`/`--violet-600`. Todos os dados vêm por props (sem pessoa de exemplo). `command {dir, n}` sai pelos botões; o cartão que já saiu ignora novo `command`.
- `PepTable`: folha do INEP (Room.jsx:1-50). Cabeçalho "ESTAÇÃO {n}" | "PADRÃO ESPERADO DE PROCEDIMENTO" | "Área: {area}", "{nota} / {max}" e "{feitos} de {N} avaliados", barra, colunas "ITENS DE DESEMPENHO AVALIADOS" / "DESEMPENHO OBSERVADO" / Inadequado / Parcialmente adequado / Adequado, faixa de seção, subitens com caixa, critérios, dica com ícone, linha TOTAL. Cada item é `radiogroup` "Item {number}"; opções `role="radio"` com `aria-checked` e `aria-label` "{nível}, {pontos} ponto(s)"; tabindex móvel (marcado, ou o primeiro nível); ← → andam só o foco entre os níveis que existem (com volta ao começo); Espaço/Enter marcam; marcar de novo limpa; sem `onMark` é só leitura (`aria-readonly`). Parcial inexistente = célula hachurada `aria-hidden`. Folha `--pep-sheet`/`--pep-sheet-text` nos dois temas; marcado em `--inep-blue-700` com texto `--pep-sheet`. Números só por `formatDecimal`.

## Arquivos (todos em `src/novo/ds/components/osce/` salvo o teste)
`MatchCard.jsx/.d.ts`, `PepTable.jsx/.d.ts`, `osce-match.css` (classes `sm-match*` e `sm-pep*`), `index-b.js` (exporta só MatchCard e PepTable), e `src/__tests__/duplaComponentesEstacaoB.test.tsx`.
Não criei nem mexi em: osce.css, index.js, Timer, PrintItem, PrintImage, StatTile, StationCard, Vitrine, App.jsx, styles.css, ds/index.js. **Para a junção (líder):** importar `./components/osce/osce-match.css` em `styles.css` e reexportar `index-b.js` junto do `index.js` da parte A.

## Testes (pela fila, --pool=threads --maxWorkers=1)
- Antes de implementar: o arquivo novo falhava (import dos componentes inexistentes), commit `fb3e600`.
- `duplaComponentesEstacaoB.test.tsx`: 20 de 20 passam (arrasto 120 px direita/esquerda, 100 px volta, `command` -1 e 1, rotação e opacidade dos selos, PepTable com o exemplo 2,5/1,25/0 · 2,5/—/0 · 5/2,5/0, "1 de 3 avaliados", "1,25 / 10,00", TOTAL, hachura, radiogroup/teclado/limpar/somente leitura, subitens, sem hexadecimal/rgba()/hsl() em todos os arquivos da parte B, CSS da folha e do cartão).
- Mais `duplaFundacao`, `duplaComponentesBase`, `segundaFaseEmBreve`: 4 arquivos existem, 4 rodaram, 85 testes passam.
- `npm run build`: sem erro (só o aviso de tamanho de chunk que já existia). O CSS novo passou no analisador do esbuild sem avisos (ainda não está importado no build).
- Não rodei suíte completa nem tsc (ficam para o fim da etapa) e não abri no navegador: modo noite e celular conferidos só pelo CSS.

## Desvios do plano / escolhas (e por quê)
1. Classes `sm-*` (prefixo do app) em vez de `sz-*` do pacote.
2. Cores do pacote trocadas por tokens: texto forte `--text-primary`, corpo `--text-secondary`, apagado `--text-tertiary`, fundo dos fatos `--surface-sunken`, caixa "Por que vocês combinam" `--surface-brand-soft` (no pacote `--teal-50`, que ficaria branca à noite) com título/ícones `--text-brand`, pontinho online `--success-solid`, selos `--success-text`/`--danger-text` (mudam com o tema), avatar com texto `--gray-0`. A faixa do cartão usa `--teal-100` de dia e `--surface-brand-soft` à noite no começo do degradê (mais `--area-clinica-soft`/`--area-go-soft`).
3. Pílulas e "online": nada de `rgba()`; sombra do avatar é um anel `0 0 0 4px var(--surface-card)`.
4. Pontos nos rótulos: `formatDecimal` com 2 casas ("2,50", "0,00") e plural pelo `Intl.PluralRules("pt-BR")`: "0,00 ponto", "1,25 ponto", "2,50 pontos" (regra do português: até 1,99 é singular). No pacote saía "2,5" e sempre "ponto". Se o dono preferir sempre "pontos", é uma linha.
5. Hachura do parcial inexistente: listras com `--inep-blue-200` sobre `--inep-blue-50` (o pacote usava cor lisa); a célula é `aria-hidden` e vazia.
6. Faixa de seção só aparece quando muda em relação ao item anterior (o pacote repetiria a mesma faixa se todos os itens trouxessem a mesma `section`).
7. Iniciais do avatar: duas primeiras palavras, como no pacote ("Pessoa de Exemplo" vira "PD"), ignorando espaços duplos. O avatar é `aria-hidden` (o nome já está no título).
8. Setas: voltam ao começo/fim da linha (padrão de radiogroup); só movem o foco, não marcam. Espaço/Enter fazem `preventDefault` no keydown (e Espaço também no keyup) para o clique nativo do botão não marcar duas vezes e desfazer a marca.
9. `onSwipe` lido por ref (sempre a versão mais recente) e o timer de 240 ms não é cancelado ao desmontar, como no pacote. Quem usa deve dar `key` por pessoa (o cartão que saiu não volta); isso está dito no `.d.ts`.
10. Folha do PEP com `overflow: clip` (não `hidden`) para o cabeçalho `position: sticky` continuar grudando na rolagem da página.
11. Em telas até 600 px a coluna dos níveis fica com 58 px (76 px acima disso), igual em cabeçalho e linhas via `--sm-pep-level-w`.
12. Sem uso de `areaVars(...).solid` (R3): nenhum selo da parte B tem texto `--surface-card` sobre cor de área.
13. Commits com `Co-Authored-By: Claude Sonnet 5.5` (pedido do orquestrador).

## Dúvidas
- O `aria-readonly` em `radiogroup` é válido, mas nem todo leitor de tela o anuncia; os botões continuam focáveis em modo só leitura.
- A sombra de sticky não existe (o pacote também não tinha); se a folha rolar sob a barra do app, o topo pode colidir com a barra fixa. Conferir na vitrine.
