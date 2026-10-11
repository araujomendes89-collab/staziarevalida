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
3. **Gasto e tetos:** se quiser, preencha o teto mensal e o teto por chamada e ligue os tetos.

## Chaves das IAs: o site e o processamento
- O site (Vercel) e o processamento da Central (Cloud Run) são servidores diferentes, cada um com as suas chaves. A tela só
  enxerga as variáveis do servidor que responde, o site.
- Chave que falta **no site** é só aviso na tela ("sem chave no site" no seletor, "sem chave neste servidor" na função e no
  cartão da IA): a IA continua escolhível e a função continua pronta, porque o processamento usa as chaves do Cloud Run (as que
  o roteiro de implantação leva).
- Aulas e Podcasts rodam **no site**: para usarem uma IA, a chave dela precisa estar também na Vercel. Em 2026-10-07 a
  Vercel (produção) tinha as chaves de Claude, OpenAI e Gemini; uma IA sem chave lá aparece como "sem chave no site" e
  essas abas a mostram como não pronta.

## O que o interruptor liga e desliga (IA03, 2026-10-11)
O interruptor **Ligada/Desligada** de cada IA vale para o que passa pelo maestro (`server/ai/maestro.ts`): as seis funções e todos os
usos delas (etapas da Central de Conteúdo, conferência de rascunhos, Questões, assistentes das abas, assistente das Aulas e
roteiro dos Podcasts). A frase antiga da tela, "Uma IA só é chamada se estiver ligada aqui", não era verdade para o resto. Os usos
abaixo **não passam pelo interruptor**: usam a chave direto no servidor, cada um com a trava própria.

| Uso | IA | Trava que vale no servidor | Código |
|---|---|---|---|
| Tutor: conversa e avaliação | Claude por padrão (`TUTOR_AI_PROVIDER`, `TUTOR_MODEL`) | `TUTOR_AI_ALLOW_EXTERNAL=1`, os sinalizadores gerais da Central de Conteúdo (`enabled`, `ai_enabled`) e o "Tutor ligado" do painel do Tutor | `server/tutor/engine.ts` (`resolveTutorProvider`) |
| Tutor: transcrição do microfone | OpenAI | `TUTOR_STT_ALLOW_EXTERNAL=1` | `server/tutor/stt.ts` |
| Tutor: voz ao vivo | Gemini, GPT-Live ou OpenAI Realtime | `TUTOR_VOICE_ALLOW_EXTERNAL=1` e `TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1` | `server/tutor/voiceProviders.ts`, `realtime.ts` |
| Tutor: voz do professor | ElevenLabs (não é uma das IAs da Central) | `ELEVENLABS_API_KEY` e o painel do Tutor | `server/tutor/elevenlabsTts.ts`, `officialVoices.ts` |
| Podcasts: áudio | OpenAI; a voz do Gemini só liga com `PODCAST_TTS_GEMINI_ENABLED=1` | `CONTENT_HUB_AI_ALLOW_EXTERNAL=1` | `server/podcasts/audio.ts` |
| Busca por significado | Gemini (AI Studio ou Vertex AI) | `CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL=1` e o sinalizador geral "IA ligada" da Central de Conteúdo | `server/contentHub/embeddings.ts` |
| Rotas antigas `/api/ai/*` e `/api/gemini/*` | Claude e Gemini | só administrador (`requireAdmin`) | `server.ts`, `server/ai/modelRouter.ts`, `functionCalling.ts` |

"Atualizar lista" também consulta a lista de modelos da empresa com a chave, mesmo com a IA desligada: não gera texto e não tem custo.

**Decisão:** a tela passou a dizer a verdade, com a lista acima. Fazer esses usos obedecerem ao interruptor **não foi feito**: eles
param no ato se a IA que usam estiver desligada na Central (hoje o áudio dos Podcasts, a transcrição e a voz do Tutor dependem
da OpenAI, que pode estar desligada aqui sem ninguém ter percebido). Se o dono quiser, o passo certo é ligar antes as IAs que
eles usam e só então fazê-los obedecer.

## As funções
| Função na tela | Onde é usada hoje |
|---|---|
| Criação | Etapas de criação da Central (classificação, afirmações, rascunho, materiais), assistente das Aulas, roteiro dos Podcasts |
| Verificação e checagem | Etapas de conferência da Central e os três conferentes dos rascunhos (na ordem: fontes, atualidade, advogado do diabo) |
| Engenharia reversa | Análise e reanálise de questões |
| Assistente: preencher / conferir / revisar a redação | Já configuráveis; entram em uso na etapa 2 |

## Os modos
- **Sozinha:** uma IA principal e uma reserva opcional. Se a principal falhar, há uma nova tentativa (só em falha passageira;
  veja IA06) e depois a reserva.
- **Linha de produção:** a principal cria e de 1 a 3 conferentes devolvem um parecer ("de acordo" ou a lista de
  problemas com gravidade). Problema de gravidade alta, ou conferente que não respondeu, marca o resultado como
  "precisa de revisão".
- **Comitê:** a principal e os outros membros (de 2 a 4 IAs no total) recebem o mesmo pedido ao mesmo tempo. O
  sistema compara os campos objetivos (gabarito, área…) e marca concordância ou divergência. Divergência = "precisa de
  revisão". Os textos não são fundidos: a equipe escolhe.
- **Cuidado:** "Rápido" ou "Caprichado" (padrão). No Claude vira o esforço (baixo/alto), só nos modelos que aceitam a opção
  (lista da página oficial "Effort", `CLAUDE_EFFORT_MODELS`; o Haiku 4.5 não aceita). Desde 2026-10-10 (correção IA07;
  revisões rodadas 3 e 5) o "Rápido" também reduz o raciocínio no Gemini (orçamento de 1.024 tokens no 2.5 Pro e no 2.5 Flash;
  orçamento 0, sem raciocínio, no 2.5 Flash-Lite; nível baixo nos Gemini 3) e na OpenAI (`reasoning_effort: "low"` nos GPT-5/6
  e na série o, menos as variantes "-chat"); "Caprichado" deixa o padrão desses modelos. O "Rápido" nunca pensa mais que o
  padrão: os Gemini 3 Flash-Lite (padrão MINIMAL, o menor nível, pela página "Thinking" do Vertex AI) ficam no padrão, como os
  modelos de imagem do Gemini e o Ollama. No 2.5 Flash-Lite, o orçamento 0 também não liga o raciocínio pelo AI Studio (onde ele
  já não pensa por padrão); pelo Vertex AI, que é o caminho de produção, ele pensa até 8.192 no padrão. O Cuidado vai num campo próprio
  (`care`) que só a Central manda: o esforço baixo que o Tutor usa não mexe no Gemini nem na OpenAI.
- **Independência:** na linha de produção, o conferente nunca é da mesma família da criadora (nem da reserva). Ex.:
  Sonnet cria e Opus confere **não** vale. No comitê, a mesma família é permitida com o aviso "não é independente".
- **Conferência por outra empresa no processamento (decisão do dono, 2026-10-10):** a evidência de cada afirmação e a
  revisão automática do rascunho nunca são feitas pela empresa da IA que escreveu o texto (o banco guarda quem escreveu:
  `ch_claims.created_by_model` e `ch_unit_versions.generated_by_model`; a versão candidata criada por mudança de fonte herda
  da versão de origem; migração 7600). Vale a Verificação (principal, depois reserva) pulando essa empresa. Só quando
  nenhuma das duas serve, outra das três empresas pronta, na ordem **Gemini → Claude → OpenAI**, com o modelo dela já
  escolhido na Central (Verificação primeiro, depois as outras funções; senão `CONTENT_HUB_<IA>_MODEL` ou o padrão): nada de
  reserva escondida quando a Verificação já tem quem confira. A empresa vem da IA cadastrada (não do nome do modelo). Sem
  nenhuma pronta, a etapa espera (sem gastar tentativa) com o aviso "Falta uma IA de outra empresa pronta para conferir…";
  banco sem a migração 7600 também faz a etapa esperar, com aviso. Texto escrito por uma pessoa segue a Verificação como
  antes. A Central avisa na Verificação quando ela é da empresa da Criação (principal ou reserva). Código:
  `maestroCheckerProvider` (`server/ai/maestro.ts`).

Nada é aprovado pela IA: tudo continua rascunho até a decisão de uma pessoa.

**Correções de 2026-10-10 (página "Correções da Administração", decididas pelo dono):**
- **IA04:** Linha de produção e Comitê mostram sempre o aviso de que, por enquanto, só a principal e a reserva rodam
  (na Verificação, os conferentes só rodam na conferência de rascunhos feita por comando).
- **IA06:** a mesma IA só é tentada de novo em falha passageira (limite por minuto, sobrecarga, servidor fora, rede, resposta fora
  do formato). Sem crédito ou cota, chave recusada, modelo inexistente, pedido inválido e tempo esgotado vão direto para a
  reserva (`shouldRetrySame`). Também vão direto para a reserva, porque se repetiriam iguais com a mesma entrada: a resposta
  cortada pelo limite de saída, a resposta bloqueada pelo filtro do provedor (Gemini) e a recusa da IA (Claude com
  `stop_reason: "refusal"`; OpenAI com `message.refusal` ou `finish_reason: "content_filter"`, `AiRefused`). Desde o polimento de
  2026-10-10, a recusa do Claude e a recusa e o filtro da OpenAI gravam os tokens que vieram, com o custo, e não são repetidos na
  mesma IA (antes ficavam com custo 0 e eram repetidos).
- **IA10:** no site (Vercel) cada PEDIDO tem hora-limite de 270 s, marcada na chegada (`server/ai/requestDeadline.ts`, middleware
  depois do `express.json`) e respeitada por todas as chamadas de IA dele (`MAESTRO_DEADLINE_MS` muda; no Cloud Run não há).
  A chamada é cortada antes do limite e nenhuma IA é chamada com menos de 30 s de prazo útil (sobram 15 s para gravar e
  responder): "Sem tempo para chamar esta IA dentro do limite do pedido.". Cada chamada é gravada em `ai_calls` na hora
  (gravação com tempo-limite de 10 s; falha só avisa e não regrava, para não duplicar).
  - **Prazo da reserva no site:** com reserva pronta, a principal (e a nova tentativa) deixa 75 s do prazo para a reserva
    (`RESERVE_KEEP_MS`), mas só divide o prazo quando cabem as duas: a principal com pelo menos 120 s (`PRIMARY_SPLIT_MIN_MS`),
    ou seja, com pelo menos 195 s úteis. Na primeira chamada do site (255 s úteis), a principal fica com 180 s e a reserva com até
    75 s. Com menos tempo útil, a principal fica com o prazo todo e, se ela esgotar, a reserva é recusada sem custo. Sem reserva,
    com a reserva desligada, ou no Cloud Run (sem prazo do pedido), nada muda.
  - **Tempo-limite de cada chamada:** 180 s; no Gemini cresce com a saída máxima mandada (30 s mais 10 ms por token, entre 180 s e
    290 s, abaixo dos 300 s em que o Node fecha a conexão sem resposta). Tempo esgotado cancela o pedido, não é repetido na mesma IA
    e grava o custo estimado (veja "Custo das falhas").
- **IA11:** esforço só nos modelos do Claude que aceitam; preço do Claude Haiku 5.5 (0,10/0,50 até 100 mil tokens). Limite
  conhecido: a tabela não tem preço por faixa; o Haiku 5.5 acima de 100 mil tokens (0,50/2,50) e o Gemini 2.5 Pro acima de
  200 mil tokens ficam com o custo abaixo do real.

Nesta etapa, os usos atuais gravam **um** resultado. Neles, a função usa a principal e a reserva. Os pareceres e o
comitê mostrados para a equipe aparecem a partir da etapa 2.

## Tetos de gasto
- **Teto por chamada** (IA08, 2026-10-11; antes "teto por execução"): uma chamada é um pedido ao maestro, com todas as IAs que ele
  chamar (principal, nova tentativa e reserva). **Vale para cada chamada, não para um trabalho inteiro:** um documento da Central
  de Conteúdo faz várias chamadas (uma por etapa e por pedaço), e cada uma tem o seu teto, então um trabalho de 50 chamadas pode
  gastar até 50 vezes o valor. O que limita o total é o teto mensal. Somar por trabalho **não foi feito** (exigiria guardar o gasto
  de cada trabalho entre as etapas e decidir o que fazer com o trabalho que passa do valor no meio; veja as perguntas ao dono). Antes
  de **cada tentativa**, o sistema soma o gasto real já feito nesta chamada (com o custo das tentativas que falharam), a estimativa
  das tentativas em andamento e a estimativa desta tentativa. A estimativa é o pior caso: caracteres ÷ 4 ×
  preço de entrada, mais a saída máxima que vai de fato para a IA × preço de saída (no Gemini, o pedido mais a folga do
  raciocínio; no Claude, no mínimo 8.192 tokens; na OpenAI, no mínimo 4.096). Passou do teto → essa tentativa não sai (linha
  "teto" no registro). Se nada foi chamado ainda, o trabalho fica parado (veja abaixo); depois de uma falha cobrada, a chamada
  termina como falha comum e o trabalho gasta uma tentativa.
- **Teto mensal:** gasto já registrado no mês (horário de Brasília) + o gasto desta chamada + a estimativa. Passou → as IAs
  pagas não são chamadas; o **Ollama continua**.
- **Duas chamadas ao mesmo tempo** podem passar do teto em até o custo de uma chamada (a tela avisa).
- Com os tetos ligados, **modelo pago sem preço fica bloqueado**. Ollama custa zero.
- **Preço exigido com ou sem teto (IA09, 2026-10-11):** modelo pago sem preço cadastrado aparecia com gasto US$ 0 quando os tetos
  estavam desligados. Agora, ao **salvar** uma função (a rota `PUT /functions/:key`), cada IA paga dela precisa de preço, com os
  tetos ligados ou não: sem o preço, a função não salva e o motivo diz onde cadastrá-lo (tabela "Preços por milhão de tokens" ou
  "Atualizar lista" da IA, que preenche os preços oficiais conhecidos). O que **já está salvo e rodando não para**: com os tetos
  desligados, o modelo sem preço continua sendo chamado, e a função só mostra o aviso "sem preço cadastrado" (funções sem
  configuração salva também, para a IA e a reserva das variáveis do servidor). Parar a chamada pararia o que funciona hoje em
  produção, onde o preço pode faltar até alguém usar "Atualizar lista". Na tabela "Últimas chamadas", IA paga que gastou tokens e
  ficou com custo zero aparece como "sem preço", e não como "US$ 0".
- **Quando o teto é atingido**, os documentos da Central ficam **parados** (pendência) e voltam sozinhos quando o teto
  permitir; ninguém precisa reenviar o documento.
  - Teto **por chamada** (o pedido estimado passa do teto): a cada rodada do processamento os parados voltam para a fila
    e, se o teto ainda não deixa, param de novo sem gastar tentativa. Suba o teto por chamada.
  - Teto **mensal** atingido: a fila não é destravada até o mês virar (horário de Brasília) ou o teto mensal subir; aí os
    parados voltam na rodada seguinte.
- O gasto do Tutor (texto e voz) aparece à parte, só como informação, e não entra no teto. As chamadas das Aulas e do
  roteiro dos Podcasts passam pelo maestro e contam no gasto da Central. A voz dos Podcasts (a geração do áudio) não passa
  pelo maestro: o gasto dela aparece no painel do Tutor (custos por recurso), não na Central.
- No Gemini, o raciocínio do modelo é cobrado como saída e entra na conta.
- **Folga do Gemini:** o raciocínio conta dentro do limite de saída do Gemini; batendo no limite, a resposta sai cortada e o
  raciocínio é cobrado mesmo assim. Por isso o pedido ao Gemini ganha uma folga: + 8.192 tokens na família 2.5 (Pro, Flash e
  Flash-Lite) no Caprichado; + 1.024 no Rápido (nada no 2.5 Flash-Lite, que no Rápido não pensa); + 16.384 nos Gemini 3 e nos
  apelidos "-latest"; nada nos modelos de imagem, voz e vetores; no máximo 65.536 no total. O Google cobra só o que foi gerado: a
  folga sobe a estimativa dos tetos (o pior caso), não o gasto real.
- **Custo das falhas:** a resposta que não serve também é cobrada. A resposta cortada, bloqueada, recusada ou fora do formato
  grava os tokens que vieram, com o custo pelo preço cadastrado; o tempo esgotado (o pedido é cancelado e não traz tokens) grava
  o pior caso estimado, dito no erro. Esse custo entra no gasto da chamada (teto por chamada) e no gasto do mês (`ai_calls`).
  Falha sem resposta (rede, servidor fora do ar, chave recusada) fica com custo 0.
- **Aviso na tela:** com os tetos ligados, o editor de cada função avisa quando o teto por chamada não cabe uma tentativa típica de
  uma IA da função, e quando não cabe a principal mais a reserva (para a reserva socorrer depois de uma falha cobrada) ou duas
  chamadas da principal mais a reserva (nova tentativa), sempre com o valor mínimo. Chamadas típicas (saída pedida no código e
  entrada que costuma ir): etapas da Central de Conteúdo, 8.192 tokens e ~30 mil caracteres; Aulas, 6.000 e 85 mil; Podcasts,
  16.000 e 125 mil; Questões, 12.000 e 8 mil; assistentes, 6.000 e 70 mil. Na Verificação, conferentes e membros são conferidos
  com a conferência de rascunhos (4.096 de saída, ~20 mil caracteres, **sem** o Cuidado da função).

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

## Gemini pelo Vertex AI (2026-10-09)

Decisão do dono: a chave do AI Studio é pré-paga e acabou (erro 402); o Gemini passa pelo **Vertex AI**, que cobra na conta
do projeto `staziamed-revalida-prod`. Uma chave Vertex vale nos dois lugares (site na Vercel e processamento no Cloud Run):

- `VERTEX_API_KEY` manda quando existe; sem ela, vale `GEMINI_API_KEY`/`GOOGLE_GEMINI_API_KEY` (AI Studio) como antes
  (`server/ai/googleKey.ts`). Vale para a Central de IAs (provedor Gemini) e a busca por significado.
- Lista de modelos do Gemini no modo Vertex: os modelos Gemini com preço cadastrado (conferidos no Vertex do projeto em
  2026-10-09), sem chamar a internet.
- Ficam no AI Studio: o áudio dos Podcasts (serviço `interactions`, que não existe no Vertex) e a voz Gemini do Tutor (a voz
  em uso é a da ElevenLabs).
- Mensagens de erro escondem também as chaves do Google no formato novo (`AQ.…`).
- No Cloud Run a chave vai pelo segredo `stazia-vertex-api-key` (variável `VERTEX_API_KEY` da tarefa).

**Modo expresso (correção IA05, 2026-10-10):** a chave em uso é do modo expresso do Vertex, que só aceita os modelos da
tabela oficial (`VERTEX_EXPRESS_MODELS`: Gemini 2.5 Pro, 2.5 Flash, 2.5 Flash-Lite, 3.1 Pro preview, 3 Flash preview e os de
imagem). "Atualizar lista" faz um teste real da chave (contar os tokens de uma palavra, sem custo) e mostra só os modelos com
preço que a chave aceita; função salva com outro modelo passa a mostrar "modelo não está mais na lista".

## Limites conhecidos
- A estimativa é do pior caso. No tempo esgotado, o custo gravado é esse pior caso (a empresa pode ter cobrado menos); numa
  falha sem resposta (rede, servidor fora do ar), o custo gravado é 0.
- No custo de cada documento da Central de Conteúdo ("Execuções de IA", `ch_ai_runs`), entra só a resposta que deu certo (ou a
  última falha, sem tokens): a tentativa que falhou antes da reserva responder está no gasto do mês (`ai_calls`), mas não aparece
  no custo do documento. Fazer isso mexe no processamento da Central de Conteúdo e não foi pedido.
- Com o teto por chamada entre 2 × principal e 2 × principal + reserva, depois de uma resposta fora do formato a nova tentativa
  ainda sai e pode deixar a reserva sem espaço (o aviso da tela diz o valor que cobre as duas). Mudar essa regra é decisão do dono.
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
| Testes | `src/__tests__/aiCentral.test.ts`, `aiCentralScreen.test.tsx` e os ajustes nos testes de cada uso; correções de 2026-10-10: `centralIasCorrecoes`, `geminiMotivoParada`, `geminiFolgaTodosModelos`, `tetoExecucaoGastoReal`, `avisoTetoExecucao`, `reservaDentroDoPrazo`, `tempoEsgotadoCancela`, `tempoGeminiLimiteNode`, `tetoSaidaMinimaProvedor`; polimento: `recusaVaiParaReserva` |

Regra da fila: os trabalhos parados por falta de IA voltam para a fila quando alguma IA está ligada na Central (ou na
simulação), no servidor (`worker.start()`) e na tarefa do Cloud Run (`scripts/content-hub/worker-job.ts`).
