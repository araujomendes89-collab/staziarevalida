# Busca por significado (embeddings) na Central de Conteúdo

Escrito para: o dono do produto (o que mudou, custo e como ligar) e quem for manter.

## O pedido
A Administração mostrava a pendência: "Busca por significado (embeddings) ainda não existe: a busca de evidências usa palavras.
Depende de escolher o modelo de embeddings". Em 2026-10-06 o dono escolheu o **Gemini Embedding 2** (`gemini-embedding-2`, do
Google, abril de 2026). Escolher o modelo autoriza enviar ao Google os textos das fontes oficiais e as buscas.

## O que mudou
- **Trechos das fontes.** Cada trecho de fonte cadastrada ganha um vetor de 768 números. Ele é gerado pelo processamento (a tarefa
  do Cloud Run), em lotes de 50, sempre que há trechos sem vetor. A tabela é `ch_passage_embeddings`, gravada só pelo servidor.
  O texto vai no formato do modelo: `title: <fonte — seção> | text: <trecho>`.
- **Buscas.** A pergunta vira vetor no servidor (`task: search result | query: …`). Depois, o banco junta duas listas pela fusão das
  posições (RRF, k = 60): a das palavras (como antes) e a dos trechos mais parecidos em significado. Um trecho bem colocado nas duas
  sobe. Sem vetor, o resultado é igual ao de antes. As buscas que usam isso:
  - a da equipe no painel (Vincular evidência). Ela mostra se o trecho veio "pelo sentido" ou por "palavras e sentido" e a semelhança;
  - a de evidências do processamento;
  - a das fontes oficiais na conferência dos rascunhos.

  As regras de cada uma continuam as mesmas: só fontes vigentes; nada de relatório preliminar nem de consulta pública; sociedade
  médica só com aprovação editorial; nível A–D na conferência de rascunhos.
- **No banco.** No Supabase, o pgvector faz o índice HNSW (cosseno). Onde não há pgvector (testes e o banco do navegador), a
  comparação é feita direto.
- **Kill switch.** A chave "IA ligada" do painel e o `CONTENT_LAB_ENABLED=false` também desligam a busca por significado: nada vai
  ao Google e a busca segue só por palavras.
- **Troca de modelo.** Os vetores antigos deixam de valer, porque são espaços diferentes. O processamento refaz todos aos poucos.

## Como ligar (variáveis do servidor e do processamento)
```
CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL=1   # autoriza o envio ao Google (Vercel e Cloud Run)
CONTENT_HUB_EMBEDDINGS_VERTEX_PROJECT=…   # SÓ no Cloud Run: Vertex AI completo pela conta de serviço da tarefa (manda; sem chave)
CONTENT_HUB_EMBEDDINGS_VERTEX_LOCATION=…  # opcional: global (padrão), us ou eu
GEMINI_API_KEY=…                          # AI Studio: o único caminho no site (Vercel); no Cloud Run: stazia-gemini-api-key
CONTENT_HUB_EMBEDDINGS_MODEL=…            # opcional (padrão gemini-embedding-2; "off" desliga)
CONTENT_HUB_EMBEDDINGS_MIN_SIMILARITY=…   # opcional (0 a 1): piso para um trecho entrar só pelo significado; sem piso por padrão
```
**A `VERTEX_API_KEY` não serve para a busca por significado** (correção de 2026-10-10). Ela é do modo expresso do Vertex AI, que
aceita só 8 modelos de texto e imagem e nenhum de busca por significado: o Google respondia 404 (falha vista em produção em
2026-10-09). Só com ela, a busca fica parada, o painel mostra o motivo e a busca segue por palavras. A Central de IAs continua
usando a `VERTEX_API_KEY` para o Gemini de texto.

No Vertex AI completo, a biblioteca do Google aceita um texto por pedido: o processamento manda os trechos um a um, no máximo 4 ao
mesmo tempo. No AI Studio continua o lote de 50. Um erro de configuração do Google (400, 401, 402, 403 ou 404) não é repetido: a
busca por significado para por 10 minutos, segue por palavras e o relato do processamento mostra o motivo. O motivo do painel e do
relato sai em português simples, pelo código (400 pedido recusado, 401/403 chave recusada ou sem permissão, 402 sem crédito, 404
modelo não encontrado nesse acesso); a mensagem crua do Google (em inglês, em JSON) fica só no registro (log).

**O projeto do Vertex AI vai só no Cloud Run** (correção de 2026-10-10, revisão). O Vertex AI completo usa a conta de serviço do
Google, que existe na tarefa do Cloud Run e não existe no site (Vercel). Se a variável estiver no site, a biblioteca do Google não
acha credencial: a busca não repete o pedido, para por 10 minutos, segue por palavras e o painel mostra "sem credencial do Google
neste ambiente". No site, a busca por significado das perguntas só liga com a `GEMINI_API_KEY` (AI Studio, com crédito).

O script do Cloud Run (`scripts/cloudrun/deploy-pdf-worker.sh`) liga a busca na tarefa quando há `GEMINI_API_KEY` no `.env` do Mac
ou quando é chamado com `EMBEDDINGS_VERTEX=1` (Vertex AI completo no próprio projeto, pela conta de serviço da tarefa, que precisa
do papel `roles/aiplatform.user`). Sem nenhum dos dois, a tarefa segue só com palavras e o painel mostra a pendência.

## Custo
- **Preço:** US$ 0,20 por milhão de tokens (a tabela do Google; `AI_COST_CONFIG` substitui).
- **Indexar:** umas 5 mil páginas de fontes custam cerca de US$ 0,60, uma vez. Cada lote fica em `ch_ai_runs` (etapa
  `embeddings`), com tokens estimados (4 caracteres por token) e custo.
- **Buscar:** cada busca envia só a pergunta, um custo de frações de centavo, que não é registrado chamada a chamada.

## Situação no painel
Administração › Central de Conteúdo › Configuração, linha "Busca por significado":
- **Ligada:** mostra o modelo e quantos trechos já têm vetor.
- **Desligada:** explica o que falta.

O processamento também relata se gera os vetores.

## Testes
`contentHubSemanticSearch.test.ts`, com o Google simulado:
- configuração e consentimento;
- formato, lotes, normalização, nova tentativa e erro sem chave;
- vetores em lotes com custo, troca de modelo e trecho apagado;
- busca nas três funções, com filtros, regras das fontes, piso e modelo diferente;
- pgvector com índice;
- a chave "IA ligada";
- rota da equipe e situação no painel;
- permissões.

Ajustado: `contentHubProcessing.test.ts`.

## Limites conhecidos
- **Acervo vazio:** em 2026-10-06 a produção não tinha nenhuma fonte cadastrada. A busca por significado fica pronta, mas só acha
  algo depois que as fontes oficiais forem enviadas (aba Fontes).
- **Semelhança sem calibração:** os valores mudam de modelo para modelo, por isso não há piso. Se aparecer trecho pouco relacionado
  entre as evidências, defina `CONTENT_HUB_EMBEDDINGS_MIN_SIMILARITY`. Comece por 0,5 e confira a semelhança mostrada no painel.
- **Nunca chamado de verdade:** o Gemini Embedding 2 foi testado só com o Google simulado, a partir da documentação de 2026-10.
