# Central de IAs (Administração › Central de IAs)

Escrito para: o dono do produto (o que existe e como usar) e quem for manter o código.

## O pedido
Em 2026-10-07 o dono pediu que as IAs do StaziaMed trabalhem **sozinhas ou em conjunto** em criação, verificação,
checagem e engenharia reversa, com um menu para escolher **qual IA e qual modelo** usar (Claude Opus, Fable, Sonnet,
os modelos da OpenAI, Gemini e o Ollama do Mac). Esta é a **etapa 1 de 5** desse projeto. As próximas são os
assistentes nas abas, o editor estilo Word, a criação de materiais com IA e o motor do Mac de engenharia reversa.

Especificação: `docs/superpowers/specs/2026-10-07-central-de-ias-design.md`.

## Onde fica e quem usa
- **No painel:** Administração › aba **Central de IAs**. Só o administrador vê a aba e só ele grava; o banco também
  recusa, não só a tela.
- **A equipe** (editor) vê um resumo em Central de Conteúdo › Configuração: funções configuradas, IAs ligadas e
  gasto do mês.
- **As chaves** ficam só no servidor (Vercel e Cloud Run). A tela nunca pede nem mostra chave.

## Mudança importante ao publicar
**Todas as IAs começam desligadas.** Depois da publicação, ficam paradas até o administrador ligar as IAs na tela
(um clique por IA, com confirmação):
- o processamento da Central de Conteúdo;
- a análise e a reanálise de questões;
- a conferência dos rascunhos;
- o assistente das Aulas;
- o roteiro dos Podcasts.

Ligar é a autorização: fica registrado quem ligou e quando. O Tutor (texto e voz) **não muda** nesta etapa.

**Recomendação:** salve cada função na tela, em vez de deixá-la sem configuração salva, para o site (Vercel) e o
processamento (Cloud Run) usarem a mesma escolha. Uma função sem configuração salva segue as variáveis de cada servidor,
e a Vercel e o Cloud Run podem ter variáveis diferentes. A tela só deixa salvar uma função cuja IA já está ligada: ligue
as IAs e salve as funções em seguida, antes de deixar o processamento trabalhar.

## Primeiros passos (depois de publicado)
1. **IAs:** ligue as que vai usar. Em cada uma, clique **Atualizar lista** para trazer os modelos e ver a situação:
   pronta, sem chave, chave recusada ou roda só no Mac.
2. **Funções:** cada função pode ficar **sem configuração salva**, usando a IA e o modelo das variáveis do servidor,
   como hoje, desde que essa IA esteja ligada: `CONTENT_HUB_AI_PROVIDER` e, quando existirem, as específicas
   `CONTENT_HUB_AI_PROVIDER_CREATE` (criação, engenharia reversa e assistentes) e `CONTENT_HUB_VERIFIER_PROVIDER`
   (verificação). Ou você salva o modo e as IAs de cada uma (recomendado, veja acima). A tela marca a função como
   **não está pronta** quando a IA escolhida não pode rodar (IA desligada, ou Ollama no site publicado); se só a principal
   não roda e há reserva que roda, a tela avisa que a reserva vai responder. Chave que falta no site é só aviso (veja
   "Chaves das IAs: o site e o processamento").
3. **Gasto e tetos:** se quiser, preencha o teto mensal e o teto por execução e ligue os tetos.

## Chaves das IAs: o site e o processamento
- O site (Vercel) e o processamento da Central (Cloud Run) são servidores diferentes, cada um com as suas chaves. A tela só
  enxerga as variáveis do servidor que responde, o site.
- Chave que falta **no site** é só aviso na tela ("sem chave no site" no seletor, "sem chave neste servidor" na função e no
  cartão da IA): a IA continua escolhível e a função continua pronta, porque o processamento usa as chaves do Cloud Run (as que
  o roteiro de implantação leva).
- Aulas e Podcasts rodam **no site**: para usarem uma IA, a chave dela precisa estar também na Vercel. Hoje falta a do Gemini
  lá; enquanto isso, o Gemini aparece como sem chave no site e essas abas o mostram como não pronto.

## As funções
| Função na tela | Onde é usada hoje |
|---|---|
| Criação | Etapas de criação da Central (classificação, afirmações, rascunho, materiais), assistente das Aulas, roteiro dos Podcasts |
| Verificação e checagem | Etapas de conferência da Central e os três conferentes dos rascunhos (na ordem: fontes, atualidade, advogado do diabo) |
| Engenharia reversa | Análise e reanálise de questões |
| Assistente: preencher / conferir / revisar a redação | Já configuráveis; entram em uso na etapa 2 |

## Os modos
- **Sozinha:** uma IA principal e uma reserva opcional. Se a principal falhar, há uma nova tentativa e depois a reserva.
- **Linha de produção:** a principal cria e de 1 a 3 conferentes devolvem um parecer ("de acordo" ou a lista de
  problemas com gravidade). Problema de gravidade alta, ou conferente que não respondeu, marca o resultado como
  "precisa de revisão".
- **Comitê:** a principal e os outros membros (de 2 a 4 IAs no total) recebem o mesmo pedido ao mesmo tempo. O
  sistema compara os campos objetivos (gabarito, área…) e marca concordância ou divergência. Divergência = "precisa de
  revisão". Os textos não são fundidos: a equipe escolhe.
- **Cuidado:** "Rápido" ou "Caprichado" (padrão). Vira o esforço do Claude; as outras IAs ignoram.
- **Independência:** na linha de produção, o conferente nunca é da mesma família da criadora (nem da reserva). Ex.:
  Sonnet cria e Opus confere **não** vale. No comitê, a mesma família é permitida com o aviso "não é independente".

Nada é aprovado pela IA: tudo continua rascunho até a decisão de uma pessoa.

Nesta etapa, os usos atuais gravam **um** resultado. Neles, a função usa a principal e a reserva. Os pareceres e o
comitê mostrados para a equipe aparecem a partir da etapa 2.

## Tetos de gasto
- **Teto por execução:** uma execução é um pedido ao maestro, com todas as IAs que ele chamar. Antes de chamar, o
  sistema estima o pior caso: caracteres ÷ 4 × preço de entrada, mais o limite de saída × preço de saída. Passou do
  teto → nenhuma IA é chamada.
- **Teto mensal:** gasto já registrado no mês (horário de Brasília) + a estimativa. Passou → as IAs pagas não são
  chamadas; o **Ollama continua**.
- **Duas execuções ao mesmo tempo** podem passar do teto em até o custo de uma execução (a tela avisa).
- Com os tetos ligados, **modelo pago sem preço fica bloqueado**. Ollama custa zero.
- **Quando o teto é atingido**, os documentos da Central ficam **parados** (pendência) e voltam sozinhos quando o teto
  permitir: a cada rodada do processamento os parados voltam para a fila e, se o teto ainda não deixa, param de novo sem
  gastar tentativa. Subir o teto basta; ninguém precisa reenviar o documento.
- O gasto do Tutor (texto e voz) aparece à parte, só como informação, e não entra no teto. As chamadas das Aulas e do
  roteiro dos Podcasts passam pelo maestro e contam no gasto da Central.
- No Gemini, o raciocínio do modelo é cobrado como saída e entra na conta.

## Preços
Os preços iniciais foram conferidos em **2026-10-07** nas páginas oficiais, e cada um guarda a fonte e a data:
- Claude: `platform.claude.com/docs/en/about-claude/pricing`;
- OpenAI: `developers.openai.com/api/docs/pricing` (faixa até 272 mil tokens de entrada);
- Gemini: `ai.google.dev/gemini-api/docs/pricing` (faixa até 200 mil tokens de entrada).

Eles entram no banco quando você clica **Atualizar lista**, só para os modelos que a chave lista e que ainda não têm
preço. Modelo sem preço: preencha na tabela da tela.

**Atenção:** pela página oficial, os Gemini 3.6, 3.7 e 3.8 Flash custam US$ 0,75 / 3,75 por milhão de tokens até
31/12/2026 e passam a US$ 1,50 / 7,50 em **01/01/2027**. Atualize esses três na tabela em janeiro.

## Ollama (só no Mac)
- O servidor procura o Ollama em `OLLAMA_BASE_URL` (padrão `http://localhost:11434`). A lista vem do próprio Ollama,
  sem chave e sem custo.
- Na Vercel e no Cloud Run ele aparece como **roda só no Mac** e **não pode ser escolhido** no site publicado: no seletor
  da função ele fica "indisponível" e desabilitado, e o servidor recusa salvar uma função com ele. Se uma função com
  Ollama foi salva no Mac, no site publicado ela aparece como não pronta, ou com o aviso de que a reserva vai responder,
  e o Ollama não é chamado.
- A lista de modelos do Ollama deixa de fora os modelos de busca (os que têm `embed` no nome), que não geram texto.

## Seletor nas abas
O interruptor **Permitir trocar a IA nas abas** começa desligado. Desligado: Aulas, Podcasts e as outras abas usam o que
está definido na Central, e a tela da aba mostra "IA definida na Central de IAs: <IA> <modelo>". Ligado: a escolha
feita na aba vale, desde que a IA esteja ligada e o modelo esteja na lista.

## Registro
- Cada chamada fica em `ai_calls`: quem pediu, função, modo, papel, IA, modelo, tokens, custo estimado, duração,
  resultado (ok, falha, teto, bloqueada) e de onde veio. As últimas aparecem na tela.
- Cada mudança de configuração fica no registro de ações (`admin_audit_log`), com o e-mail de quem mudou. A seção
  **Histórico** da tela mostra as últimas.

## Ordem de publicação (só com a ordem do dono)
1. **Supabase:** aplicar a migração `supabase/migrations/20261003005200_central_de_ias.sql` (o SQL é entregue pronto
   para colar).
2. **Cloud Run:** `scripts/cloudrun/deploy-pdf-worker.sh`. O roteiro agora leva para a tarefa as chaves de IA que
   estiverem no `.env` (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`), sem mostrar os valores. Em
   2026-10-07 o `.env` tinha as do Claude e do Gemini; a da OpenAI não estava lá.
3. **GitHub → Vercel:** `git push`. As chaves da Vercel continuam nas variáveis do projeto da Vercel.

## Limites conhecidos
- A estimativa é do pior caso. O custo gravado de uma chamada que falhou ou passou do tempo é zero, mesmo que a
  empresa tenha cobrado algo, então o gasto do mês pode ficar um pouco abaixo do real.
- A reserva que entra depois de uma falha da principal confere só o teto mensal, não de novo o teto por execução.
- A simulação (`mock`) só existe no desenvolvimento e nos testes; em produção, pedir simulação é recusado.
- O Tutor não usa a Central nesta etapa.

## Para quem mantém
| Peça | Arquivo |
|---|---|
| Tabelas, funções do banco e painel | `supabase/migrations/20261003005200_central_de_ias.sql` |
| Ollama | `server/contentHub/ai/ollama.ts` |
| Listas de modelos das empresas | `server/ai/models.ts` |
| Preços iniciais e estimativa | `server/ai/prices.ts` |
| Leitura da configuração, validação, situação das funções e das IAs neste servidor | `server/ai/config.ts` |
| O maestro (modos, tetos, registro, adaptadores, escolhas das abas) | `server/ai/maestro.ts` |
| Rotas `/api/ai-central` (o prefixo `/api/ai` é do app antigo e não pode ser usado) | `server/ai/router.ts` (montadas em `server.ts`) |
| Usos | `server/contentHub/pipeline.ts`, `worker.ts`, `router.ts`, `questionAnalysis.ts`, `questionReanalysis.ts`, `draftChecks.ts`, `server/lessons/assist.ts`, `server/podcasts/script.ts` |
| Tela | `src/novo/app/admin/ai/` (`AdminAI.jsx`, `FunctionEditor.jsx`, `aiApi.js`), aba em `AdminScreen.jsx`, resumo em `content/HubSettings.jsx` |
| Testes | `src/__tests__/aiCentral.test.ts`, `aiCentralScreen.test.tsx` e os ajustes nos testes de cada uso |

Regra da fila: os trabalhos parados por falta de IA voltam para a fila quando alguma IA está ligada na Central (ou na
simulação), no servidor (`worker.start()`) e na tarefa do Cloud Run (`scripts/content-hub/worker-job.ts`).
