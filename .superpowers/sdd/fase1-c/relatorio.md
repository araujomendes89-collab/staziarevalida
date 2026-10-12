# Fase 1 do gerenciamento, grupo C: Central de Conteúdo

Ramo `adm-f1-c`, base `5d659d1` (o que está no ar). Faixa de migrações usada: `20261003009870` a `20261003009873` (a faixa liberada era 9870 a 9879).
Nada foi publicado, nada foi enviado (push), nenhum serviço real foi tocado.

## 1. Item por item

Cada item foi conferido no código de `5d659d1` antes de mexer (a auditoria é antiga). A leva 4 foi lida no ramo `leva4` (somente leitura).

| Item | Estado | O que foi feito |
|---|---|---|
| CC18 Aguardando reanálise nunca andava | **Construído** | Botão **Reanalisar agora** (só administrador) na seção Análise de questões, bloco "Reanálise por IA". Mais a chave **Análise automática** da Configuração, que agora funciona de verdade: o processamento reanalisa sozinho a cada rodada. A tela mostra quantas questões esperam, se há pedido, e o resultado da última rodada (propostas gravadas, puladas, motivo de parada). A IA só **propõe**; quem decide continua sendo o revisor médico. A leva 4 não traz isto (ela cobre a análise geral das questões e a conferência dos rascunhos inéditos, não a reanálise por mudança de fonte), então não houve duplicação. |
| CC19 Modo sombra não segurava o aluno | **Construído** | Com o modo sombra ligado (ou a publicação desligada) a análise de questão e o cartão de atualização **aprovados ficam guardados** e não chegam ao aluno (correção, Tutor, diagnóstico do erro, linha do tempo). Equipe e revisores continuam vendo. Libera quando o administrador desliga o modo sombra **e** liga a publicação (mesma regra das unidades). Nada é apagado. Aviso na tela de Análise de questões. **Atenção ao risco (seção 6).** |
| CC20 Aprovada nunca entra no banco | **Coberto pela leva 4** | "Publicar / Republicar / Recolher" no painel Questões StaziaMed (`PublishBox`, `app_staziamed_publish`). Nada construído aqui. |
| CC21 Pedir ajustes sem editor | **Coberto pela leva 4** | Botão **Editar** (`DraftEditor`) e **Equilibrar gabarito** no rascunho aberto. Nada construído aqui. |
| CC22 Camadas só por terminal | **Coberto pela leva 4** | Botão **Conferir** (com estimativa de custo) e **Buscar fonte oficial**, que rodam as camadas (regras, fontes, atualidade, revisão clínica) como tarefa. Nada construído aqui. |
| CC23 Conferir fontes monitoradas sempre dava erro | **Construído** | No site publicado quem confere é o processamento no Google. O botão agora deixa o pedido marcado em cada fonte monitorada e a tela diz: "Pedido enviado: N fonte(s) serão conferidas na próxima rodada (até 10 minutos)". Se não há fonte monitorada, diz isso. No desenvolvimento (processamento junto do servidor) confere na hora, como antes. |
| CC24 PDF de fonte já enviado em Documentos não virava trechos | **Construído** | A fila reconhecia a leitura como repetida e não criava trabalho. Agora, se a leitura já terminou, manda **direto indexar os trechos da fonte** (sem ler o PDF de novo, o que apagaria o trabalho do documento); se a leitura tinha falhado, refaz; se está na fila ou rodando, deixa terminar, e a leitura agora relê no fim se o documento virou fonte. |
| CC26 Versão nova da taxonomia separava temas antigos dos novos | **Construído** | O rascunho guarda de que tema antigo cada tema veio. Ao publicar, unidades, afirmações, marcas de tema dos blocos e apelidos **seguem para o tema da versão nova** (inclusive tema renomeado e tema que a IA sugeriu depois de aberto o rascunho). A versão antiga fica arquivada, nada é apagado. Também leva para a versão publicada o que ainda apontava para versões arquivadas (só quando o mesmo caminho existe). |
| CC27 "Aliases" em inglês | **Construído** | Tudo virou **Apelidos** (tela, botões, mensagens de erro do banco). "órfão" virou "tema não existe mais". |
| CC29 Dois interruptores que não faziam nada | **Construído** | **Análise automática**: agora liga de verdade (CC18). **Provedor NotebookLM**: removido da tela (nunca fez nada; a chave continua guardada no banco, sem efeito, para não quebrar nada). |
| CC30 Textos técnicos ou em inglês na Configuração | **Construído** | "Content Lab" virou "Central de Conteúdo"; "Sinalizadores" virou "Chaves liga e desliga"; "Prompts em uso" virou "Instruções da IA em uso" com nome em português de cada instrução e "código de conferência" no lugar de "hash"; cabeçalhos da tabela de consumo, "Gerador de PDF", "reconhecimento de texto", "tokens" explicado, etc. A lista de variáveis do servidor ficou (é necessária), mas agora com o título "para quem cuida da parte técnica" e descrições em português simples. Rótulos novos no Registro (reanálise pedida, conferência de fontes pedida). |

Nada ficou "depende de decisão do dono" neste grupo, exceto a confirmação do risco do CC19 abaixo.

## 2. Arquivos

Migrações (em `supabase/migrations/`):
- `20261003009870_taxonomia_versao_nova_continua.sql` (CC26 e CC27)
- `20261003009871_modo_sombra_segura_o_aluno.sql` (CC19)
- `20261003009872_reanalise_e_conferencia_pedidas.sql` (CC18 e CC23)
- `20261003009873_fonte_pdf_ja_enviado.sql` (CC24)

Servidor:
- novo `server/contentHub/reanalysisRun.ts` (rodada de reanálise: pedido ou chave automática)
- `server/contentHub/router.ts` (rotas `/sources/check` e `/questions/reanalysis`; continuação do PDF já enviado)
- `server/contentHub/pipeline.ts` (uma linha: a leitura relê no fim se o documento virou fonte)
- `scripts/content-hub/worker-job.ts` (a tarefa do Google chama a reanálise)

Telas (`src/novo/app/admin/`): `content/HubSettings.jsx`, `content/Taxonomy.jsx`, `content/Sources.jsx`, `content/UpdatedQuestions.jsx`, `content/QuestionAnalyses.jsx`, novo `content/ReleaseNotice.jsx`, `auditLog.js`.

Testes novos: `src/__tests__/admCBanco.test.ts` (18), `admCServidor.test.ts` (8), `admCTelas.test.tsx` (13). Script de colagem: `.superpowers/sdd/fase1-c/recolar.mjs`.

## 3. Testes e resultados

- Testes novos: 39 de 39 passam. Os de servidor (CC23, CC18, CC24) **falham** no código antigo e passam no novo (conferido tirando `router.ts` e `pipeline.ts`).
- 11 arquivos de teste antigos precisaram de **uma linha** na preparação (ligar publicação e desligar modo sombra, como já fazem outros testes), porque agora o aluno só recebe análise com as duas chaves liberadas (CC19): `admQuestoesBanco`, `apoioT4Banco`, `apoioVarredura`, `correcoesQuestoesAjustesBanco`, `correcoesQuestoesBanco`, `fontesComplementaresBanco`, `questionIntelligence`, `questionKnowledge`, `questionUpdates`, `sqieClosing`, `studentDiagnosis`. Sem essa linha 42 testes antigos falhavam (isso é a prova de que o CC19 muda o comportamento).
- Vizinhança (Central, fontes, Registro, administração, Tutor/correção da questão): 31 arquivos além dos meus 3, **34 arquivos, 722 testes passam** (93 "falha esperada" que já existiam). O número de arquivos rodados conferiu com o pedido.
- `npm run build`: passou. O pacote da tarefa do Google (`worker-job`) também compila.
- `tsc`: 1831 erros, o mesmo número da base, nenhum nos meus arquivos.
- Colagem 3 vezes (`recolar.mjs`: banco simulado com as 103 migrações de `5d659d1` e depois as 4 novas, 3 passadas): **sem erro**; 1a x 2a colagem e 2a x 3a colagem **sem nenhuma diferença** (funções, gatilhos, políticas, permissões, colunas, restrições, índices, dados). O que muda na 1a colagem: 10 funções novas, 7 funções redefinidas (apelidos x2, rascunho e publicação da taxonomia, `ch_card_shows`, `ch_raw_app_question_timeline`, `question_analysis_fits`), 1 tabela nova (`ch_reanalysis_control`) e 1 coluna nova (`ch_taxonomy_nodes.origin_node_id`). Também colado 2 vezes dentro de `admCBanco`.

## 4. Passo de colagem do SQL

Colar no Supabase **antes** de publicar o site, nesta ordem (cada arquivo pode ser colado mais de uma vez):
1. `20261003009870_taxonomia_versao_nova_continua.sql`
2. `20261003009871_modo_sombra_segura_o_aluno.sql`  (**veja a conferência da seção 6 antes**)
3. `20261003009872_reanalise_e_conferencia_pedidas.sql`
4. `20261003009873_fonte_pdf_ja_enviado.sql`

São independentes entre si; a ordem acima é só por organização. Funções redefinidas partem das versões mais novas (`…2900`, `…1400`, `…7700`, `…9620`). Permissões: funções do app com `revoke` de público e anônimo e `grant` para logado; funções do processamento sem acesso para ninguém além da chave de serviço; tabela nova com RLS ligada e sem acesso direto.

Compatibilidade: SQL novo + site antigo funciona (o site antigo só não tem os botões novos). Site novo + SQL antigo não dá erro técnico: a caixa de reanálise some, o botão de conferir fontes avisa em português "falta concluir uma atualização do banco de dados", e a continuação do PDF já enviado cai no comportamento antigo.

Para a reanálise (CC18) e o PDF já enviado (CC24) valerem no Google, **a imagem do processamento (Cloud Run) precisa ser trocada** (muda `worker-job` e `pipeline`).

## 5. O que o dono vê e testa

1. Administração > Central de Conteúdo > **Configuração e custos**: títulos em português; só 5 chaves (sem NotebookLM); "Instruções da IA em uso" com nomes legíveis.
2. **Análise de questões**: aviso azul "O aluno ainda não recebe estas análises" enquanto o modo sombra estiver ligado; bloco **Reanálise por IA** (quantas esperam, botão **Reanalisar agora**, resultado da última rodada).
3. **Fontes oficiais** > **Conferir fontes monitoradas**: mensagem "Pedido enviado..." em vez de erro; depois de até 10 minutos as fontes aparecem conferidas.
4. Enviar em **Fontes** o mesmo PDF que já estava em **Documentos**: depois de até 10 minutos a fonte passa a ter trechos.
5. **Taxonomia**: abrir rascunho, renomear um tema, publicar: a unidade continua ligada ao tema (renomeado); o apelido segue o tema; tudo escrito como "Apelido".
6. Teste "aluno barrado": o aluno nunca vê estes botões (as funções exigem administrador) e, com o modo sombra ligado, não recebe análise aprovada.

## 6. Limites e riscos (ser honesto)

- **CC19 pode esconder do aluno análise que já esteja no ar.** Se alguma análise ou cartão de atualização já estiver publicado para os alunos e as chaves estiverem no padrão (modo sombra ligado, publicação desligada), eles somem até o administrador liberar as duas chaves. Antes de colar o 9871, rodar no Supabase:
  `select (select count(*) from public.question_analysis where status = 'published') as analises_publicadas, (select count(*) from public.question_update_cards where status = 'published') as cartoes_publicados, (select jsonb_object_agg(key, value) from public.ch_flags where key in ('shadow_mode','publish_enabled')) as chaves;`
  Se `analises_publicadas` for maior que zero e a intenção for continuar mostrando, ligar `publish_enabled` e desligar `shadow_mode` na Configuração logo depois de colar. Pela memória do projeto não havia análise real publicada (faltam revisores e acervo), mas **não consegui conferir o banco de produção**.
- Esse efeito vale também para tutor e diagnóstico do erro (todos passam por `question_analysis_fits`).
- **Rascunho de taxonomia aberto antes do SQL**: se alguém já renomeou um tema nesse rascunho, o tema vem com o nome antigo de volta ao publicar (o rascunho antigo não guardava a origem). Rascunhos novos não têm esse limite.
- **CC24, parte da corrida**: o ajuste que faz a leitura reler no fim se virou fonte (arquivo anexado enquanto ainda era lido) foi escrito, mas **não tem teste automático** próprio (não dá para simular a janela exata). Os três cenários de teste (leitura pronta, falha, na fila) passam; o da fila já passava antes do ajuste.
- A rodada de reanálise é de **10 questões** (automática) ou **20** (pedido manual) por rodada de 10 minutos; usa a função "engenharia reversa" da Central de IAs, respeitando liga/desliga e tetos (hoje desligados). Se a IA estiver desligada, a tela mostra o motivo e o pedido não fica preso.
- O pedido manual só é atendido na próxima rodada do Google (até 10 minutos); no desenvolvimento começa na hora.
- A reanálise não reaproveita a tabela de pedidos da leva 4 (`ch_ai_requests`, migração 9810) porque ela não existe na base `5d659d1` e serve a outras funções; se quiserem unificar depois (um só histórico de pedidos de IA), é trabalho de integração.
- **Conflitos esperados ao juntar com a leva 4** (só texto, os dois lados ficam): `server/contentHub/router.ts` (linhas de importação no topo) e `src/novo/app/admin/content/QuestionAnalyses.jsx` (linha de `<ReleaseNotice />` ao lado de `<GenerateAnalyses ... />`). `pipeline.ts` e `auditLog.js` juntam sozinhos. Não toquei em `DraftQuestions.jsx` (a leva 4 o apaga). Simulado com `git merge-tree`, somente leitura.
- Os textos de motivo que vêm do servidor (ex.: "IA desligada pelo administrador") são traduzidos só na caixa de reanálise; os textos antigos do servidor não foram trocados porque testes antigos dependem deles.
