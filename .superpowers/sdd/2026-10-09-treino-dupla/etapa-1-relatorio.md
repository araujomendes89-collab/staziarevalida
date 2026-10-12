# Etapa 1 · Treinamento em Dupla · fechamento da Tarefa 3 e da Etapa 1

Ramo `treino-dupla` (partida em 50ea691). Nada empurrado; nada tocado fora deste worktree; Supabase, GCP e Vercel reais não foram usados. A Etapa 2 (banco) não foi começada.

## O que ficou pronto (em português simples)
- Os sete componentes da estação (cronômetro, impresso, imagem do impresso, indicador, cartão de estação, cartão de parceiro e folha do PEP) agora estão ligados ao design system: o CSS entra no app e os componentes saem pelo `ds/index.js`.
- Existe uma "Vitrine do Treinamento em Dupla": uma página só para o desenvolvimento, com as cores novas ao lado das cores do app e todos os componentes, com dados rotulados "Exemplo" (nenhuma pessoa, nota ou estação de verdade).
- A vitrine só existe no servidor de desenvolvimento. Provado: o build de produção não tem o texto da vitrine nem o endereço dela.

## Arquivos
Novos:
- `src/novo/app/dupla/Vitrine.jsx` (`export function Vitrine()` e também `export default`, porque o `React.lazy` pede o padrão)
- `src/__tests__/duplaComponentesEstacao.test.tsx` (12 testes)

Alterados:
- `src/novo/ds/styles.css`: importa `osce.css` e `osce-match.css` depois de `components.css`
- `src/novo/ds/index.js`: exporta `osce/index.js` (parte A) e `osce/index-b.js` (parte B). Os arquivos de cada parte seguem separados, como o teste da parte A exige (`index.js` e `osce.css` sem MatchCard/PepTable/osce-match)
- `src/novo/app/App.jsx`: a rota de desenvolvimento (abaixo)
- `src/__tests__/duplaComponentesEstacaoA.test.tsx`: tirei uma linha `// @ts-expect-error` que não servia mais (o typecheck acusava "diretiva sem uso"; era o único erro novo do módulo)

### Como a rota de desenvolvimento ficou no `App.jsx`
Quatro linhas, todas com `import.meta.env.DEV` na própria linha:
1. `const Vitrine = import.meta.env.DEV ? React.lazy(() => import("./dupla/Vitrine.jsx")) : null;` (sem import estático)
2. entrada `"vitrine-dupla"` em `TITLES` (assim entra em `ROUTES` sozinha); o título do topo é "Vitrine de componentes · Somente em desenvolvimento · dados de exemplo"
3. `"vitrine-dupla"` em `CONNECTED` (para não aparecer o aviso "Tela em reconstrução")
4. o `else if (import.meta.env.DEV && Vitrine && route === "vitrine-dupla")` que desenha a página dentro de `React.Suspense`

Em produção a rota não existe e o endereço `/novo/vitrine-dupla` volta para o início.

## O que a vitrine mostra
- Cores: as do app (referência) e, por área, base do app / soft / ink / solid; papéis candidato e ator; pontuação (full, partial, none, pending); azul INEP (900 a 50); folha do PEP. Só nomes de variável, nenhum valor de cor escrito. Dia e noite pelo botão do topo do app.
- Cronômetro em seis estados: parado, correndo, aviso (120 s), perigo (30 s), pausado, esgotado.
- Indicadores (StatTile, com "—"), selos de papel (Badge candidate e actor, dois tamanhos).
- Impressos: avaliador (com Liberar/Ocultar), candidato liberado e candidato sem liberação; imagem de exemplo com "Ampliar".
- Cartão de estação nas cinco áreas, sem nota e com nota (valores 80% e 60,5%, só para ilustrar o layout).
- Cartão de parceiro com "Pessoa de Exemplo 1": arrastando ou pelos botões Pular/Estudar junto, com "Trazer o cartão de volta".
- Folha do PEP com a estação de exemplo do plano (2,5/1,25/0 · 2,5/—/0 · 5/2,5/0), editável e depois só leitura.
- Janela (Dialog), avisos (Toast, quatro tons e o aviso temporário), seção (Accordion) e texto (Textarea com contador).

## Como o dono testa
1. Na raiz do worktree `treino-dupla`, subir o servidor local seguro (variáveis por extenso, como nas Global Constraints):
   `PORT=3000 NODE_ENV=development CONTENT_HUB_WORKER=0 VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= SUPABASE_DB_URL= npx tsx server.ts`
   Só usar depois de ver no log `[central] banco: desenvolvimento` e `[dev-db] Banco de desenvolvimento pronto`; sem isso, encerrar na hora.
2. No banco local novo, a tela de entrada cria a conta master (equipe). Entrar com ela.
3. Abrir `http://localhost:3000/novo/vitrine-dupla`.
4. Alternar dia e noite no botão do topo e olhar cada bloco (cores, cronômetros, cartões, folha do PEP).
5. Encerrar pelo PID (`lsof -tiTCP:3000 -sTCP:LISTEN | xargs kill`) e conferir que nada segura a porta 24678.

Eu NÃO abri a vitrine no navegador (não subi o servidor). A aparência, o modo noite e o celular foram conferidos só pelo CSS, pelos tokens e por testes automáticos; a conferência visual é do dono.

## Resultados
- Teste novo `duplaComponentesEstacao.test.tsx`: 12 de 12 (vitrine renderiza todos os componentes, cronômetro nos seis estados, dez cartões de estação, folha editável soma e a janela abre/fecha, cartão de parceiro sai e volta, sem cor hexadecimal/rgb/hsl, toda variável usada existe nos tokens, `App.jsx` só cita a vitrine em linhas com `import.meta.env.DEV`, `ds/index.js` exporta os sete componentes, `styles.css` importa os dois CSS depois de `components.css`).
- Junto com `duplaFundacao`, `duplaComponentesBase`, `duplaComponentesEstacaoA`, `duplaComponentesEstacaoB` e `segundaFaseEmBreve`: 7 arquivos existem, 7 rodaram, 131 testes passam (duas vezes seguidas, pela fila).
- Build (`FILA npm run build:vercel`): sem erro (só o aviso antigo de chunk grande). `grep -rl` em `dist` e `server-dist`: "Vitrine do Treinamento em Dupla" = limpo; também limpos "vitrine-dupla", "Vitrine de componentes", "Pessoa de Exemplo", "Estação de Exemplo" e "Impresso de exemplo"; nenhum chunk com nome de vitrine. O CSS novo (`osce-timer`, `sm-pep`) está no CSS do build.
- Typecheck (`tsc --noEmit` pela fila): 1.831 erros no total, igual à linha de base (~1.831); o filtro `^(src/novo|server/dupla|server/devDb|src/__tests__/(dupla|helpers/dupla|supabaseSchema|segundaFase))` não devolve nenhuma linha. (Antes de tirar o `@ts-expect-error` do teste A eram 1.832, com 1 erro nesse filtro.)
- Suíte completa: a fila recusa `vitest run` sem arquivos (o script `vaga-de-teste.sh` só deixa com `VITEST_TUDO=1`, porque o projeto inteiro trava o disco). Em vez disso rodei por lotes de 12 arquivos, 24 lotes em sequência, cada um pela fila (`--pool=threads --maxWorkers=1 --testTimeout=120000`, relatório JSON por lote). Conferência: 286 arquivos existem em `src/__tests__/**/*.test.{ts,tsx}` e 286 apareceram nos relatórios. Resultado: 3.474 testes, 3.467 passaram, 7 falharam:
  - 6 são as falhas JCodesMore conhecidas (zip `/Volumes/PortableSSD/ai-website-cloner-template-master.zip` ausente): `jcodesmoreCloneExecutionEngine` (1), `jcodesmoreWorkerHealthAndDiscovery` (1), `jcodesmoreWorkerSourceIntegrity` (4).
  - 1 é `adminUsuariosTela.test.tsx` ("quem o banco devolve de novo em páginas posteriores aparece uma vez só": esperava 97 linhas e viu 50). Não tem a ver com este ramo (nada de Administração foi tocado). Rodando o arquivo sozinho passou 17 de 17, e mais duas vezes em seguida junto dos testes do módulo: parece teste sensível a carga da máquina (rodou no meio de muitos agentes). Conclusão: nenhuma regressão minha, mas o teste é instável e vale vigiar.
  - A pasta temporária (`$TMPDIR`, pastas de 21 caracteres só com `client/` e `ssr/`) NÃO foi limpa por mim, porque outros agentes testam ao mesmo tempo.

## Commits (locais)
- `670eb78` Treino em dupla: componentes da estacao e vitrine de desenvolvimento
- `7958471` Treino em dupla: tira diretiva ts-expect-error sem uso do teste da parte A
- (e o commit deste relatório)

## Desvios do plano
1. A suíte completa foi por lotes de 12 arquivos, não de uma vez (a fila bloqueia o projeto inteiro). Mesmo resultado, conferido arquivo a arquivo.
2. A Vitrine tem também `export default` (o plano pede `export function Vitrine()`, que continua; o default é só para o `React.lazy`).
3. Título do topo da rota é "Vitrine de componentes" (o texto "Vitrine do Treinamento em Dupla" fica só dentro da página, no `<h1>`), para o `App.jsx` não carregar esse texto.
4. Cartão de estação mostra números 1 a 10 e notas 80% / 60,5%; são só ilustração de layout, rotulados "Exemplo" no título e na nota da seção. Se o dono preferir "—" também nos cartões com nota, é só trocar.
5. Cartão de parceiro com compatibilidade 50 (valor neutro de exemplo, não é cálculo).
6. Nada de IA, nada de banco, nada de texto novo fora da vitrine (que é de desenvolvimento); a página não vai para o aluno.

## Dúvidas para o dono (olhando a vitrine)
1. **Cronômetro: borda vermelha de 2 px sempre ligada.** O protótipo final tem a borda vermelha mesmo com tempo sobrando (copiei fiel). Parece pouco intencional para um relógio normal. Olhar o bloco "Cronômetro" (parado, correndo, pausado): se preferir a borda só nos tons de aviso e perigo, é uma linha no CSS.
2. **Cabeçalho "grudado" (sticky) da folha do PEP x barra fixa do app.** O cabeçalho da folha fica preso no topo ao rolar; a folha não sabe a altura da barra do app, então o topo pode colidir com ela. Olhar rolando o bloco "Folha do PEP", no computador e no celular. Se colidir, ajustar o `top` do cabeçalho para a altura da barra.
3. Dois pequenos pontos herdados das partes A e B, só para conferir no olho: "0,00 ponto / 1,25 ponto / 2,50 pontos" (singular até 1,99, regra do português) e o fundo da imagem ampliada com `color-mix()` (navegadores atuais).

## Parada
Fim da Etapa 1: PARE, confirmação do dono antes de qualquer coisa da Etapa 2 (banco).
