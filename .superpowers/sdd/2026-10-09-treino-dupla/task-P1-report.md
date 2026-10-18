# Tarefa P1 (Etapa P): formato do impresso, dados de teste e leitura do pacote novo

Ramo `treino-pacote-p1` (base eb2d353). Sem push, sem Supabase/GCP/Vercel/rede. Nenhum arquivo do pacote foi executado ou copiado.

## O que foi feito
1. **Formato publicado do impresso** (`src/shared/checklistBank/types.ts`, `catalog.ts`): o impresso (`Pressing`) ganhou 3 campos opcionais: `source_number` (número na prova), `display_number` (número na tela) e `initially_visible` (visível desde o início, como o relato).
   - `normalizeStation` agora **mantém** os três quando existem. Quando não existem, **não cria chave nova**: o que já está publicado fica idêntico (teste confirma que os 10 seeds continuam só com `id, name, content, image_url`).
   - Função nova `pressingNumbers(pressing, índice)` aplica o padrão: origem = tela = posição (1, 2, 3…) e não é inicial. A migração 9900 (P2) e as telas devem usar essa regra.
   - `validateStation` recusa `display_number` ou `source_number` que não seja inteiro a partir de 1, número de origem repetido, e número de tela repetido (veja "Desvio" abaixo).
2. **Conversor** (`scripts/dupla/converter-inep2020.ts`): lê o pacote novo (11/10) e continua lendo o antigo (08/10), sempre como texto, sem executar nada.
   - `candidateImage` (na estação) e `img` (no impresso) são aceitos e **ignorados** (nenhuma imagem é lida nem copiada; `TODO(dono)` no código).
   - `displayIndex` vira `display_number`; a posição vira `source_number`.
   - Estação com `candidateImage`: o impresso da posição 1 vira `initially_visible: true`, gravado no dado.
   - `ACTOR_SCRIPT_1` vira `actor_script` da estação 1, uma linha `RÓTULO: texto` por bloco (10 linhas, texto igual ao do pacote, "Não consta no script." mantido).
   - Os campos novos só são gravados em estação que usa alguma dessas marcas (hoje só a E1). Propriedade desconhecida (na estação, no impresso, constante nova) continua recusada.
3. **JSON de teste** (`server/dupla/data/teste-inep2020.json`) regerado do pacote novo: `git diff --stat` mostra mudança **só na E1** (roteiro, e os 3 campos nos 2 impressos). Conferi também que o pacote **antigo** reproduz o JSON anterior byte a byte. E1: relato = origem 1 / tela 1 / inicial; esfregaço = origem 2 / tela 1 / não inicial. As outras 9 continuam com `actor_script` vazio e sem campos novos.
4. **`splitActorScript`** (`src/novo/app/dupla/content.js`): aceita também rótulo em CAIXA ALTA no começo da linha (`^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 /,()’'-]{6,}:`, com pelo menos uma letra), além dos rótulos da Montagem. Sem perder texto: linha sem rótulo continua anexada ao bloco anterior; "Dizer: …" e "SIM:" (minúsculas ou curto) não viram rótulo. Aproveitei para corrigir um detalhe: o rótulo é cortado pelo texto real casado, não por tamanho.
5. **Testes**: ver abaixo. O teste que lia o pacote agora aponta para a pasta nova (`PACOTE_NOVO`), só se o arquivo existir; também há um teste com o pacote antigo.

## Arquivos
Alterados: `src/shared/checklistBank/types.ts`, `src/shared/checklistBank/catalog.ts`, `scripts/dupla/converter-inep2020.ts`, `server/dupla/data/teste-inep2020.json`, `src/novo/app/dupla/content.js`, `src/__tests__/checklistBankCore.test.ts`, `src/__tests__/duplaEstacoesTeste.test.ts`, `src/__tests__/duplaConteudo.test.ts`. Nada criado além deste relatório. Não toquei em `server/dupla/testStations.ts` (não precisou: ele já passa o conteúdo inteiro).

## Testes (pela fila, `--pool=threads --maxWorkers=1`)
- Falharam primeiro (13 testes novos), depois passaram.
- Alvo: `checklistBankCore`, `duplaEstacoesTeste`, `duplaConteudo`, `duplaTelasBanco`, `duplaSalaTesteLocal`: **5 arquivos, 89 testes passaram**.
- Regressão: `duplaSalaFases`, `duplaRotas`, `duplaEstacoesTela`, `duplaPraticarTela`, `duplaMatchTela`, `duplaMigracaoDados`, `checklistBankApi`, `supabaseSchema`, `duplaFundacao`, `duplaMatchBanco`: **10 arquivos, 196 testes passaram**.
- Typecheck filtrado (`tsc --noEmit` com o filtro do plano): 1 linha, `src/__tests__/checklistBankCore.test.ts(77,18)` TS2352 (`toLite(...) as Record<string, unknown>`). **É antigo** (linha que já existia, só deslocada 1 pela importação nova); nenhum erro novo nos arquivos mexidos.
- Build não rodado (esta tarefa não mexe em telas nem em arquivo do app; só `content.js`, já coberto por teste).

## Comparação dos 26 PDFs com a fonte da Montagem (sem abrir nenhum PDF)
- Comparei **só nomes e tamanhos em bytes** (metadados; nenhum PDF foi aberto). **26 de 26 batem em nome e em tamanho** (13 edições x caderno + PEP; inclui `2025-2/PEP_Preliminar.pdf` e `2024-2/PEP_Definitivo.pdf`). A fonte da Montagem usa pasta por ano (`2020/2020`, `2020/2020-reaplicacao`, `2025/2025-2` …); o pacote usa a pasta da edição direto.
- **Não calculei `shasum`**: a ordem recebida foi não varrer os PDFs. Tamanho igual nos 26 é forte indício de cópia sem alteração, mas **não é prova**. Para provar: `shasum -a 256` nos 26 de cada lado (~65 MB cada).

## Desvio do plano e por quê
- O plano diz que `validateStation` "recusa `display_number` repetido" **e** que a E1 tem relato com tela 1 e esfregaço com tela 1. Isso se contradiz. Resolvi assim: o número da tela precisa ser único **dentro do grupo** (iniciais de um lado, liberáveis do outro), porque o relato inicial fica na folha do candidato e não entra na lista numerada "Impresso n". Dois liberáveis com o mesmo número, ou dois iniciais com o mesmo número, são recusados. O número de origem (`source_number`) precisa ser único na estação toda. O trecho do plano "mais de um impresso inicial com a mesma posição" foi coberto por essa regra (dois iniciais com a mesma tela são recusados).
- `normalizeStation` não preenche o padrão (para não mudar nada do que já está publicado); o padrão está em `pressingNumbers`. Se a P2 quiser os campos sempre preenchidos no conteúdo, é só chamar essa função ao montar a resposta.

## Para a junção e para as outras tarefas
- P2 (migração 9900) deve ler os 3 campos com o mesmo padrão de `pressingNumbers` (origem = tela = posição; inicial = falso) e **não deve enviar `source_number` ao candidato**.
- Montagem de estações (outro ramo): precisa publicar os 3 campos e a folha do candidato (`TODO(dono)`); sem eles, o relato inicial não tem de onde sair.
- Nota que vale para quem for escrever a tela do avaliador: o roteiro da E1 diz "liberar o IMPRESSO 1" (o relato, que agora já está visível desde o início) e "liberar o IMPRESSO 2" (o esfregaço, que na tela é "Impresso 1"). O texto do roteiro foi mantido exatamente como no pacote; quem mostra "Impresso 1 · no documento oficial: Impresso 2" é a tela (P3/P4b).

## Dúvidas para o dono
1. Quer que eu calcule o `shasum` dos 26 PDFs (leitura inteira dos arquivos, sem abrir como PDF) para provar que são iguais à fonte da Montagem?
2. O roteiro da E1 manda "liberar o IMPRESSO 1, mesmo se o candidato não pedir", mas pelo pacote novo o relato já está visível desde o início. Confirmar que isso é só do roteiro oficial do dono e que a tela deve seguir o pacote (relato sempre visível). Nada foi corrigido no texto.
