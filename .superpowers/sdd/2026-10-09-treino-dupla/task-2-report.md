# Tarefa 2 · Componentes base (Dialog, Toast, Accordion, Textarea) · relatório

Ramo `treino-dupla-t2` (partida 13463d4). Nada empurrado; nada tocado fora deste worktree; Supabase/GCP/Vercel não usados.

## O que foi construído
- `Dialog` (portal em `document.body`, `role="dialog"` `aria-modal="true"` `aria-labelledby`/`aria-describedby`, foco no 1º focável ao abrir, Tab preso dentro, Esc e clique no fundo chamam `onClose`, foco volta a quem abriu). Sem focável, o foco vai para a própria caixa.
- `Toast` (`role="status"`, `data-tone`, botão "Fechar" opcional) e `useToast()` -> `[node, show(title, tone = "success")]`: um aviso por vez, some em 2600 ms, novo aviso troca o antigo e reinicia o prazo, timer limpo ao desmontar.
- `Accordion` (`<button type="button" aria-expanded aria-controls>`, corpo `role="region"`, controlado ou não, `onToggle(open)`).
- `Textarea` (label ligada por `htmlFor`, dica, contador "{n}/{maxLength}" em mono com `showCount`, `aria-describedby` para dica e contador, funciona controlada ou não).
- Assinaturas exatamente como no bloco Interfaces da Tarefa 2.

## Arquivos
- Novos: `src/novo/ds/components/feedback/{Dialog,Toast}.jsx` e `.d.ts`; `src/novo/ds/components/surfaces/Accordion.jsx` e `.d.ts`; `src/novo/ds/components/forms/Textarea.jsx` e `.d.ts`; `src/__tests__/duplaComponentesBase.test.tsx`.
- Alterados: `src/novo/ds/index.js` (Dialog, Toast, useToast, Accordion, Textarea); `src/novo/ds/components/components.css` (classes `sm-dialog*`, `sm-toast*`, `sm-acc*`, `sm-textarea*` no fim do arquivo, mais um bloco `@media (max-width:900px)`).
- Não mexi em nenhum arquivo da Tarefa 1 (dupla.css, format.js, areas.js, labels.js, Badge, novo.html).

## Testes (pela fila, `--pool=threads --maxWorkers=1`)
- Primeiro, sem os componentes: `duplaComponentesBase.test.tsx` 17 falhas de 17 (esperado).
- Depois: `duplaComponentesBase.test.tsx` 17 de 17 passam.
- Arquivos que citam o DS/CSS (`git grep` por `ds/index`, `components.css`, `ds/components`): `adminAbasVisiveis.test.tsx`, `duplaFundacao.test.ts`, mais `segundaFaseEmBreve.test.tsx` (pedido do plano): 4 arquivos existem, 4 rodaram, 67 testes passam.
- `npm run build`: sem erro (aviso de tamanho de chunk que já existia).
- Typecheck filtrado e suíte completa ficam para o fim da etapa (como diz o plano), não rodei.

## Desvios do plano (e por quê)
1. Cores: o pacote usa `#fff`/`#7FD39A`/`#F2C26B`/`#F29A8C` no Toast. Troquei por tokens do app (`--surface-inverse`/`--text-inverse`, `--teal-300`, `--green-200`, `--amber-200`, `--red-200`; no modo noite a superfície inversa é clara, então os ícones usam `--teal-700`/`--green-700`/`--amber-700`/`--red-700`). Nenhuma cor hexadecimal nem `rgba()` nos componentes novos (testado).
2. Nomes dos tokens: o pacote usa `--text-strong`, `--surface-raised`, `--accent` etc.; no app viraram `--text-primary`, `--surface-card`, `--action-primary`/`--text-brand`, `--focus-ring`.
3. Accordion: o corpo fica sempre no DOM com o atributo `hidden` quando fechado (no pacote era desmontado), para o `aria-controls` apontar para um elemento que existe. Quem põe conteúdo pesado dentro (ex.: PEP) fica montado mesmo fechado; se isso pesar na Tarefa 3 ou depois, dá para trocar por render condicional mantendo o `id`. O recuo de 62 px do corpo só vale com `icon` (classe `sm-acc--icon`); sem ícone o recuo é 18 px.
4. Accordion: apliquei os valores finais do pacote (borda transparente, sombra `--shadow-sm`, cabeçalho de 60 px), que sobrescrevem os primeiros no `components.css` dele.
5. Textarea: a estrutura é `div.sm-field` + `<label htmlFor>` (padrão do `TextField` do app), não `<label>` envolvendo tudo como no pacote. Usa `useId` quando não há `id`.
6. Dialog no celular (<= 900 px): painel de baixo com `padding: 12px 12px 0`, raio `22px 22px 0 0` e espaço de área segura no rodapé dos botões (o pacote mantinha raio nos quatro cantos). Segue o plano ("raio só em cima, 12 px").
7. Dialog: a caixa tem `max-height:100%` e o corpo rola, para não estourar a tela; `title` aceito como string (interface do plano). Sem trava de rolagem do fundo (não pedida).
8. `useToast`: o `node` é um contêiner fixo `.sm-toast-host` com `aria-live="polite"` sempre presente (vazio sem aviso); o `Toast` dentro tem `role="status"`. Posição: direita 24 px, 96 px do rodapé; <= 900 px: 12 px dos lados, 84 px do rodapé.
9. Commit com a linha `Co-Authored-By: Claude Sonnet 5.5` (pedido do orquestrador), diferente da regra do plano (Opus 5.5).

## Dúvidas / pontos para a revisão
- Nenhum token da Tarefa 1 foi necessário.
- Dois diálogos abertos ao mesmo tempo: cada um escuta o Esc no documento, então um Esc fecharia os dois. A Tarefa 3 (PrintImage) tem a própria tela cheia; se precisar empilhar, ajusto.
- Não abri o app no navegador (modo noite e celular foram conferidos só pelo CSS e pelos testes); a conferência visual fica para a vitrine da Tarefa 3.
