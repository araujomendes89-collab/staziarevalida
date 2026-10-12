# Relatório da Tarefa 7: tela Banco de estações

Ramo `treino-dupla-t7`. Escrito em 11/10/2026 (retomada de um agente interrompido por limite de sessão).

## O que encontrei e o que fiz
- O agente anterior já tinha feito o commit `87f11d4` ("tela Banco de estacoes com dados reais") com a tela e o teste, e deixou
  um único ajuste NÃO commitado no teste (só tipagem do mock `state.rpc`, para o `tsc` não acusar erro).
- Revisei a tela contra a Tarefa 7 do plano, contra o protótipo (`Stations.jsx:19-58`) e contra as regras do `constraints.md`.
  Não faltava nada do comportamento: nenhuma mudança na tela foi necessária. Só commitei o ajuste de tipagem do teste e este relatório.

## O que a tela faz (`src/novo/app/dupla/StationsScreen.jsx`)
- Frase de apoio na primeira linha, igual ao protótipo (o título "Banco de estações" fica no cabeçalho do app; nenhum `h1`).
- 5 blocos de área com contagem; clicar liga/desliga o filtro. Abas "Todas" + 5 áreas, com contagem, que fazem o mesmo filtro.
- Busca fixa ao rolar (`position: sticky` abaixo da barra superior, `--topbar-h`), placeholder "Buscar por estação, tema ou
  queixa"; acha em nome, tema e pílulas (`styles`), sem diferenciar acento nem maiúscula; a área não entra na busca (como o plano diz).
- "Ordenar": "Ordem da prova" (ordem em que o servidor entrega) e "A–Z" (pt-BR). "Visualização": Grade e Lista.
- Agrupamento por área só com "Todas" + "Ordem da prova"; estação de área desconhecida não some (vai depois dos blocos).
- Grade com o `StationCard` da Tarefa 3 (número, origem "Revalida 2020 · INEP", pílulas, "Sua última nota" e "Média geral",
  "Já realizada"); Lista com "Última nota" e "Média geral". Sem dado: "—". Sem origem ou sem número (estação autoral): nada aparece.
- Vazio: "Nenhuma estação encontrada", "Tente outro termo ou limpe o filtro de área." e "Limpar filtros" (este só quando o
  banco tem estações; banco vazio não oferece limpar).
- Clique (cartão ou linha): `go("dupla", { estacao: id })`.
- Carregamento/erro pelo `useLoad`, `Loading` e `LoadError` (com "Tentar de novo").
- Só tokens `var(--…)`; selos brancos sobre Cirurgia e Pediatria usam `areaVars().solid` (contraste, ruling R3); `Icon` do DS.
  Sem "Simulado de prova", sem "Dificuldade", sem número, pessoa ou estação inventada; sem `localStorage`, sem IA.

## Arquivos
- `src/novo/app/dupla/StationsScreen.jsx` (criado em `87f11d4`)
- `src/__tests__/duplaEstacoesTela.test.tsx` (criado em `87f11d4`; tipagem ajustada neste commit)
- este relatório

## Testes e resultados (pela fila, `--pool=threads --maxWorkers=1 --testTimeout=120000`)
- `duplaEstacoesTela.test.tsx`: 11 testes, todos passam. Cobrem: cartões com número/origem/notas e "—"; estação autoral sem origem
  e sem número; blocos, abas, busca por nome e por pílula, sem acento, "Limpar filtros"; frase de apoio e sem `h1`; A–Z,
  Grade/Lista e agrupamento; área desconhecida; clique na grade e na lista; sem "Simulado de prova"/"Dificuldade"/porcentagem
  inventada; banco vazio; erro e "Tentar de novo"; regras do arquivo (sem hexadecimal, `rgba`, `lucide-react`, IA, dados do protótipo).
- Junto: `duplaFundacao`, `duplaComponentesBase`, `duplaComponentesEstacao`, `duplaComponentesEstacaoA`, `duplaComponentesEstacaoB`:
  6 arquivos, 88 testes, todos passam (arquivos que existem = arquivos rodados).
- `npx tsc --noEmit`: 1831 erros, o mesmo número da base; nenhum em `StationsScreen.jsx`, `duplaEstacoesTela.test.tsx`,
  `src/novo/app/dupla` nem `src/novo/ds`.
- `npm run build`: passou (vite + servidor).

## Desvios do plano
- Nenhum de comportamento. Observação: o teste usa o nome do exemplo do plano `inep-2020-e01` só como comentário; os ids reais
  usados são os de teste `teste-inep2020-eNN` (regra da base).

## Dúvidas para o dono
- Nenhuma nova.

## O que a junção exige
- A tela ainda não está ligada a rota nenhuma (isso é a Tarefa 10: rota, `App.jsx`, `Shell.jsx`, `go("dupla", { estacao })`).
- Depende de `app_dupla_stations()` da Tarefa 6 (contrato do bloco Interfaces do plano, linha 493). Aqui foi testada com um
  backend simulado que devolve linhas nesse formato. Se a Tarefa 6 mudar o nome de algum campo (`area_code`, `number`,
  `edition`, `reapplication`, `institution`, `styles`, `my_last_pct`, `average_pct`), a tela e o teste precisam do mesmo ajuste.
- Quem receber `?estacao=<id>` no Praticar (Tarefa 8/11) precisa tratar o id; esta tela só envia.
