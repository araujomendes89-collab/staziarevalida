# Fontes oficiais com IA: buscar, baixar, conferir e aprovar — especificação

Data: 2026-10-09. Escrito para: o dono do produto (o que muda e o que ele decide) e quem for construir e manter.
Origem: pedido do dono de 2026-10-09 sobre Central de Conteúdo › Fontes. É a **Fase 1** do projeto "Atualizações com busca
por IA" (`2026-10-08-atualizacoes-busca-ia-design.md`, ainda em revisão): só achar, baixar, conferir e aprovar fontes
oficiais. Onde esta fase muda aquele documento, o motivo está escrito.

## 1. O pedido e o resultado esperado
Pedido (2026-10-09): "subir os PDFs oficiais em Central de Conteúdo › Fontes: protocolos do Ministério da Saúde; PCDT;
diretrizes de sociedades médicas. Deixe uma IA nessa tela para fazer a busca, trazer as fontes e baixar os materiais; ela vai
me mostrar, eu vou conferir e aprovar, e a partir de então vira fonte do sistema."

Resultado: na tela Fontes, o dono escolhe área e tema (ou "temas mais cobrados") e clica em **Buscar**. A IA procura na
internet, **só nos sites oficiais da lista**, e devolve documentos com título, instituição, link, data, tipo, motivo e um
trecho exato. O servidor confere cada um (não confia na IA), baixa o arquivo e guarda. O dono vê a lista **"Fontes
encontradas — aguardando sua conferência"**, abre o arquivo guardado, ajusta os dados e **aprova** ou **rejeita**. Só o
aprovado vira fonte do sistema: entra em `ch_sources`, o documento é lido, vira trechos citáveis e entra na busca por
significado. **Nada vira fonte sozinho. O arquivo baixado nunca é alterado.**

Critério de aceite: (1) Fontes tem "Buscar fontes com IA" (área, tema ou temas mais cobrados, texto livre), só para
administrador; (2) a função "Busca de fontes oficiais" da Central de IAs começa desligada e só aceita IA que busca na internet,
com gasto e tetos da Central; (3) a busca roda na fila; "nada encontrado" é válido; (4) achado fora da lista, sem https, sem
arquivo, repetido ou com trecho ausente do texto é descartado com motivo visível; (5) todo candidato tem arquivo guardado com
SHA-256; (6) o dono abre o arquivo e o texto das primeiras páginas, edita os dados, aprova ou rejeita com motivo; (7) aprovar
cria a fonte (vigente, nível escolhido, quem e quando) e o documento de referência, lido e indexado; (8) rejeitado não volta;
(9) nível E nunca entra; (10) a lista de sites é editável na tela; (11) tudo fica registrado (`ch_audit`, `ai_calls`).

## 2. O que já existe (conferido no código em 2026-10-09)
- **Fontes:** `ch_sources` (tipo `final | public_consultation | preliminary | rectification | society_guideline`, nível
  A–E, `editorial_approved` só sim/não, sem quem/quando); `app_ch_register_source` (mesmo título e órgão com arquivo ou versão
  diferente **substitui a anterior** e sinaliza o que dependia dela); tela `src/novo/app/admin/content/Sources.jsx`.
- **Documento de referência:** `ch_documents` (`purpose = 'reference_source'`, `rights_status = 'reference_only'`,
  `provenance`); `POST /api/content-hub/sources/:id/document` guarda o PDF, vincula e põe na fila `extract → source_index`
  (`pipeline.ts`), que gera `ch_source_passages` com página; os vetores da busca por significado vêm depois (`embeddings.ts`).
  `stepExtract` só aceita PDF; página web só aparece na vigia (`snapshotPassages`).
- **Fila:** `ch_jobs` já aceita trabalho sem documento, enfileirado pelo SQL (`visual_render`, `ch_visual_enqueue`). Em
  produção processa a tarefa do Cloud Run, a cada 10 min.
- **Central de IAs:** chaves em `server/ai/config.ts` e em três lugares da `…5200_central_de_ias.sql` (regra de
  `ai_functions`, `ch_worker_ai_save_function`, `app_ai_summary`); `runFunction` (`maestro.ts`) com reserva, tetos e
  `ai_calls`; preço só por token; função sem configuração usa as variáveis de ambiente. Os provedores
  (`server/contentHub/ai/provider.ts`, `openai.ts`) não buscam na internet; a OpenAI usa `/chat/completions`.
- **Outros:** `fetchLink` dos Podcasts (https, 3 redirecionamentos conferidos, endereço interno bloqueado, 8 MB, PDF ou HTML);
  `app_incidence` (questões oficiais por tema, exige usuário logado). `server/ai/officialMedicalSearch.ts` (app antigo, com
  respostas escritas à mão) **não é reaproveitado**.

## 3. Decisões
| Assunto | Decisão | De quem |
|---|---|---|
| Aprovação | Toda fonte achada pela IA espera a conferência do dono; só a aprovada vira fonte | dono (2026-10-09) |
| Sites oficiais | Lista editável na tela Fontes; valores iniciais do §4 da especificação de 2026-10-08; governo brasileiro com prioridade | dono (2026-10-08) |
| Nível E | Nunca entra pela busca (curso, apostila) | dono (2026-10-08) |
| Função na Central | Nova: "Busca de fontes oficiais" (`busca_fontes`). Sem configuração salva fica **desligada** (não usa as variáveis de ambiente). Só modo "sozinha" (principal + reserva); Ollama fora (não busca na internet) | ajuste meu |
| Custo da busca | Preço **por busca** por modelo (coluna nova em `ai_model_prices`) entra na estimativa e no teto; `ai_calls` passa a contar as buscas. Com os tetos ligados, modelo sem preço de busca não roda | ajuste meu: a Central só tinha preço por token |
| Resposta da IA | Não depende de "busca + JSON estruturado" na mesma chamada (nem todas as IAs aceitam). A IA termina com um JSON, conferido pelo esquema; inválido → uma chamada curta, sem busca, só para converter | ajuste meu |
| O que prova o achado | O que vale é o servidor baixar o arquivo e achar o trecho nele. O link ter aparecido na busca é só um sinal ("visto na busca"): o Gemini devolve links de redirecionamento | ajuste meu |
| Página web | Aceita como fonte. Sem número de página: os trechos vêm do texto da página e a citação mostra o link; a evidência ligada a ela fica sem página (as conferências que pedem página a tratam assim) | ajuste meu (a leitura atual é só de PDF) |
| PDF escaneado | Descartado nesta fase ("sem texto: o trecho não pôde ser conferido"); continua o envio manual do PDF que já existe | ajuste meu |
| Repetidos | Bloqueiam: fonte cadastrada (mesmo SHA-256 ou link), documento com o mesmo SHA-256, candidato aguardando, aprovado ou rejeitado. Descartado por falha (site fora do ar) **não** bloqueia uma busca futura | ajuste meu |
| Abrir o arquivo | PDF por link temporário do armazenamento (a Vercel não devolve resposta acima de 4,5 MB). HTML nunca é aberto a partir do nosso armazenamento: só o texto, e o botão para o site oficial | ajuste meu |
| Temas mais cobrados | Escolhidos na hora do pedido pela incidência oficial (a fila roda sem usuário); uma busca por tema, 5 por padrão, até 10 | ajuste meu |
| Versão nova | Aprovar documento com o mesmo título e órgão de uma fonte vigente segue a regra que já existe (a anterior fica substituída e o que dependia dela é sinalizado); a tela avisa e pede confirmação | consequência do código atual |
| Quem aprovou | Colunas novas em `ch_sources`: aprovação editorial com quem e quando; toda fonte aprovada aqui fica com aprovação editorial | dono (2026-10-09) |
| Migrações | A partir de `20261003006300` (5900/6000 estações, 6100 assistentes e 6200 Questões StaziaMed são de outros ramos) | ajuste meu |

## 4. Fora desta etapa
Fica para a próxima fase do projeto Atualizações (especificação de 2026-10-08): achar **mudanças** nas fontes cadastradas,
vigia semanal com comparação de texto de PDF, busca semanal automática em rodízio, rascunhos de Atualizações, questões
afetadas, cartões "Atualizada" e o caminho manual em Editar questão. **Regra levada para lá:** documento achado depois (pela
busca semanal ou pela vigia) também entra como candidato e espera a aprovação; nada entra sozinho na lista vigiada (muda o
§5 de 2026-10-08). Também fora: OCR de PDF escaneado achado pela busca; ligar a vigia sozinha ao aprovar; linha de montagem
ou comitê na busca; a IA sugerir sites novos; documentos atrás de login; avisos ao aluno.

## 5. O caminho e os estados
```
Busca:      na fila → buscando → conferindo → concluída (n conferidos, m descartados) | nada encontrado
                       └ pendente (função desligada, teto) · falhou (IA fora do ar, sem reserva)
Achado:     conferência no servidor → descartado (motivo) | candidato "aguardando sua conferência"
Candidato:  aguardando → aprovado → fonte (lendo → indexada) | rejeitado (motivo; não volta a ser sugerido)
```
Nenhuma etapa automática vai além de "aguardando sua conferência". Aprovar e rejeitar são sempre o dono (administrador).

### 5.1 Sites oficiais
Tabela `ch_official_domains`, editada só por administrador na própria tela. Cada linha: endereço sem `https://` (só ASCII,
pode ter caminho: `gov.br/saude`), instituição, tipo (governo / internacional / sociedade), ativo. Valores iniciais:
`gov.br/saude`, `bvsms.saude.gov.br`, `gov.br/conitec`, `gov.br/inca`, `gov.br/anvisa` (governo); `who.int`, `paho.org`,
`iris.paho.org` (internacional); `febrasgo.org.br`, `sbp.com.br`, `portal.cardiol.br` (sociedade). **Regra de encaixe:** o
host do link é igual ao da linha ou subdomínio dele (`www.gov.br` serve para `gov.br`; `gov.br.exemplo.com` e
`falsogov.br` não), e, se a linha tem caminho, o caminho do link começa por ele, inteiro (`/saude/…` sim, `/saudemental` não).

### 5.2 Pedido de busca
Área (as 5 do banco ou todas), **tema** (com sugestões da incidência) **ou** "temas mais cobrados" (5 por padrão, até 10) e
texto livre opcional ("PCDT mais recente de hepatite C"). A função do banco cria uma busca por tema e põe na fila (`ch_jobs`,
etapa nova `source_search`, `scope_key = 'search:<id>'`, sem documento, como `ch_visual_enqueue`); busca igual ainda na fila
não se repete. A tela avisa: "a busca roda no processamento da Central (até ~10 minutos); pode sair da tela".

### 5.3 A IA busca (§7)
A função `busca_fontes` recebe área, tema, texto livre, a data de hoje e os sites ativos (instituição e tipo). Só tem a
ferramenta de busca (sem banco, sem armazenamento, sem abrir arquivos). Devolve de 0 a 8 documentos.

### 5.4 Conferência no servidor e download
Para cada achado, na ordem, parando no primeiro problema (o motivo fica gravado na busca):
1. Esquema da resposta; link `https`, porta 443, sem usuário/senha no link; host e caminho na lista (§5.1).
2. Repetido pelo link (sem `#…` e sem `utm_…`): fonte, vigia ou candidato (ver §3).
3. Download pelo `fetchLink` ampliado: até 3 redirecionamentos, **cada um** conferido (https, lista de sites, endereço
   público); até 50 MB (cortado ao passar, mesmo sem tamanho declarado) e 60 s; só PDF (assinatura `%PDF-`) ou página HTML.
4. SHA-256; repetido pelo SHA-256 (ver §3).
5. Texto: PDF com o leitor dos Podcasts (unpdf), página a página; HTML com `htmlToText`. Sem texto → descartado (§3).
6. **Trecho:** pelo menos 20 caracteres e encontrado no texto do arquivo (comparação normalizada: maiúsculas, acentos, espaços
   e hífen de quebra de linha), com a página onde está.
7. Título e data achados no arquivo (metadados do PDF, primeira página, `<title>`/`<h1>`), mostrados ao lado do que a IA disse;
   nunca trocam o dado sozinhos.
8. Guarda em `content-hub/source-candidates/<sha256>.pdf|.html` (privado) e cria o candidato "aguardando".
O servidor se identifica ("StaziaMed-Fontes/1.0") e baixa uma vez por documento; site que bloqueia ou responde 429 vira
descarte com motivo. Nada do conteúdo baixado vai para IA nesta fase.

### 5.5 Conferência do dono
Cada candidato mostra: título, instituição, site (com o tipo), data, tipo de documento, motivo da IA, o **trecho destacado com
a página**, "visto na busca" (sim/não), arquivo (PDF ou página, páginas, tamanho, SHA-256 curto), **Abrir arquivo guardado**,
**Abrir no site oficial** e **Prévia do texto** (primeiras 3 páginas, até ~6.000 caracteres, como texto simples). Campos
editáveis: instituição, título, versão, data de publicação, tipo (`final`, `preliminary`, `public_consultation`,
`society_guideline`, `rectification`), natureza (PCDT, diretriz, manual…), **nível A–D** (com a sugestão da IA ao lado;
padrão pelo tipo do site: governo A, sociedade B, internacional C), área, tema e vigência. Ordem da lista: governo brasileiro
primeiro, depois mais recentes.

### 5.6 Aprovar ou rejeitar
- **Aprovar** exige nível A–D, título, instituição e a caixa "Conferi o documento no arquivo guardado". Se já existe fonte
  vigente com o mesmo título e órgão, a tela mostra qual será substituída e pede a confirmação. A rota do servidor (como o
  envio manual do PDF) chama `app_ch_source_candidate_approve`, que numa só transação: cria a fonte com as mesmas regras de
  `app_ch_register_source` (vigente, nível, campos do registro, aprovação editorial com quem e quando); cria o documento de
  referência (`purpose = 'reference_source'`, `rights_status = 'reference_only'`, o mesmo arquivo guardado, `provenance`
  com link pedido e final, site, instituição, SHA-256, tamanho, tipo, "encontrado pela busca em dd/mm/aaaa", busca, IA e
  modelo); vincula os dois; marca o candidato "aprovado". Depois a rota põe a leitura na fila (`extract`, sem duplicar);
  se isso falhar, a tela oferece "Ler de novo".
- **Rejeitar** exige motivo (pelo menos 10 caracteres, como as outras decisões). O registro fica, então o mesmo link ou
  arquivo não volta. O arquivo rejeitado é apagado do armazenamento; o SHA-256 fica.

### 5.7 Leitura e indexação
PDF: `extract → source_index`, sem mudança (OCR só em página sem texto, trechos com página). Página web: a leitura confere o
SHA-256 e passa direto para `source_index`, que monta os trechos com `snapshotPassages`, sem página. Os vetores da busca por
significado entram pelo worker. A fonte aparece em "Fontes cadastradas" com o selo "encontrada pela busca" e a leitura.

## 6. Dados (migração `20261003006300_fontes_oficiais_ia.sql`)
- `ch_official_domains`: endereço (único), instituição, tipo, ativo, quem criou/alterou, quando. Equipe lê; escrita só por
  `app_ch_save_official_domain` (administrador). Sementes do §5.1.
- `ch_source_searches`: quem pediu, área, tema, texto livre, origem (`tema` | `incidencia`), estado, trabalho da fila,
  execução da Central (`run_id`), IA e modelo, buscas feitas, custo, achados conferidos e descartados (com motivo, link e
  título), mensagem, criada/terminada.
- `ch_source_candidates`: busca, link pedido e final, site, título/instituição/data/tipo/motivo da IA, título e data achados no
  arquivo, trecho e página, "visto na busca", tipo de arquivo, SHA-256, tamanho, páginas, caminho no armazenamento, prévia,
  sugestões de nível e tipo, dados editados, estado (`aguardando` | `aprovado` | `rejeitado`), quem decidiu, quando, motivo,
  fonte e documento criados. Únicos: SHA-256 e link normalizado.
- `ch_sources`: `editorial_approved_by`, `editorial_approved_at`. `ch_jobs`: etapa `source_search` (a regra recriada mantém
  `visual_render`). `ai_model_prices`: `per_search_usd`. `ai_calls`: `web_searches`.
- Central de IAs: `busca_fontes` nos três lugares da `…5200` (regra da tabela, salvar função, resumo). Se outro ramo também
  acrescentar função, a última migração aplicada recria a regra com **todas** as chaves.
- Funções `app_ch_official_domains`, `app_ch_save_official_domain`, `app_ch_source_search_start`, `app_ch_source_searches`,
  `app_ch_source_candidates`, `app_ch_source_candidate_save | _approve | _reject` (administrador; ler os sites, equipe) e
  `ch_worker_source_search_*` (só servidor). Buscas e candidatos: RLS só administrador; escrita só por funções. `ch_audit`:
  pedido, resultado, edição, aprovação, rejeição e mudança de site.

## 7. IA (Central de IAs)
- **Função "Busca de fontes oficiais"** na tela da Central: o dono escolhe a IA principal e a reserva entre as que buscam na
  internet, o máximo de buscas por pedido (5 por padrão) e o preço por busca de cada modelo. Código: chave nova em
  `AiFunctionKey`/`FUNCTION_KEYS`, `envFallbackRef` devolve nada para ela, `validateFunctionConfig` recusa outro modo e o
  Ollama, `functionForPrompt('source_search')` aponta para ela, prompt `source_search` versionado em `prompts.ts`.
- **Provedores** (`StructuredRequest.webSearch = { allowedDomains, maxSearches }`; volta com buscas feitas e links vistos):
  - **Claude:** ferramenta `web_search_20260209` (ou a mais nova aceita pelo modelo), `allowed_domains` (aceita caminho,
    cobre subdomínios), `max_uses`, `pause_turn` (até 3 continuações). US$ 10 por 1.000 buscas, mais tokens (resultados
    contam como entrada). Lista de sites no Console da Anthropic, se houver, precisa conter a nossa.
  - **OpenAI:** só pela API Responses (`/responses`, ferramenta `web_search`, `filters.allowed_domains` com até 100 hosts,
    sem caminho; `include: ["web_search_call.action.sources"]`). Caminho novo no adaptador, que hoje usa `/chat/completions`.
  - **Gemini:** ferramenta `google_search`; a API não filtra sites: a lista vai no pedido e quem filtra é o servidor. Gemini 3
    cobra por busca; 2.5, por pedido. Créditos do Gemini estão esgotados hoje.
  - **Ollama:** não busca na internet; não aparece para esta função.
- **Pedido à IA:** só documentos completos e oficiais dos sites da lista, PDF do próprio documento quando houver, governo
  brasileiro primeiro, nunca inventar link, trecho copiado literalmente, lista vazia quando não achar. Resposta: `{documentos:
  [{titulo, instituicao, link, data_publicacao (aaaa-mm-dd, aaaa ou nulo), natureza, tipo, nivel_sugerido (A–D), motivo
  (até 300 caracteres), trecho (20 a 400 caracteres)}], observacao}`.
- **Custos e tetos:** estimativa = tokens + máximo de buscas × preço por busca; teto por execução e mensal da Central; teto
  atingido → busca "pendente" com o motivo, volta quando o teto permitir (como hoje). Custo de cada busca na tela.

## 8. Tela (Central de Conteúdo › Fontes)
Para administrador, acima de "Cadastrar fonte":
- **Buscar fontes com IA:** situação da função (pronta, ou "desligada — configure na Central de IAs"), área, tema ou "temas
  mais cobrados", texto livre, **Buscar**.
- **Buscas recentes:** estado, quando, IA e modelo, buscas feitas, custo, conferidos e descartados (abre os motivos).
- **Fontes encontradas — aguardando sua conferência** (com contador): um cartão por candidato (§5.5) com **Aprovar** e
  **Rejeitar**; filtro para ver aprovados e rejeitados.
- **Sites oficiais:** lista com instituição, tipo e ativo; acrescentar e editar.
A equipe continua vendo só "Fontes cadastradas". No celular, uma coluna. A Central de IAs ganha a função na lista.

## 9. Segurança e direitos
- Nunca confiar na IA: só o que passa no §5.4 vira candidato (https, sites da lista em todo redirecionamento, endereço
  público, tamanho e tempo limitados); só o dono transforma candidato em fonte.
- O conteúdo baixado é dado não confiável: nesta fase não vai para nenhuma IA; nas próximas, entra marcado como documento
  (`asDocument`), nunca como instrução. HTML guardado nunca é aberto como página no navegador do dono.
- Arquivos privados (`content-hub`), links temporários de 60 s, nada chega ao aluno. Chaves só no servidor.
- Direitos: fontes ficam como `reference_only` (citadas com página, não copiadas para material próprio), com a origem
  registrada; diretriz de sociedade fica guardada só para referência, como no envio manual de hoje.

## 10. Testes (IA e internet simuladas; nenhuma chamada real)
- **Unidade:** encaixe na lista (subdomínio, caminho, `gov.br.exemplo.com`, `falsogov.br`, não ASCII); link normalizado;
  download simulado (redirecionamento para fora, endereço interno, acima de 50 MB, tempo, tipo errado); SHA-256 e repetidos;
  trecho normalizado; título e data do arquivo; JSON no fim do texto e conversão; pedido de cada provedor (Claude com
  `allowed_domains`, `max_uses`, `pause_turn`; OpenAI `/responses` com `filters`; Gemini `google_search`; Ollama recusado).
- **Central:** função sem configuração não roda; só "sozinha"; estimativa e teto com preço por busca; `ai_calls` com buscas.
- **Fila:** busca completa com achados misturados (bons, fora da lista, trecho ausente, repetido, escaneado); "nada
  encontrado"; pendente por teto; página web aprovada vira trechos sem página.
- **Banco (PGlite):** só administrador lê e decide candidatos; equipe lê os sites; aprovar cria fonte, documento e vínculo;
  nível E recusado; rejeição com 10 caracteres; não aprova duas vezes; substituição; regras de `ai_functions` e `ch_jobs`.
- **Telas (`backend.rpc` e rotas simuladas):** pedido, temas mais cobrados, cartão, Aprovar travado sem nível e sem a caixa,
  rejeição, sites oficiais, celular; Central de IAs com a função. Depois, conferência no navegador em servidor temporário.

## 11. Primeiro teste com material real (depois de publicar)
1. IA da função, preço por busca e teto baixo. 2. Conferir os sites. 3. Buscar "dengue" em Clínica Médica. 4. Conferir cada
trecho no arquivo. 5. Aprovar um, rejeitar um. 6. Ver os trechos e a busca achar o documento. 7. Custo na Central. Depois: "temas mais cobrados".

## 12. Publicação (só com ordem do dono)
SQL `20261003006300` no Supabase (o dono cola) → código (GitHub/Vercel) → imagem nova da tarefa do Cloud Run (é ela que
roda a busca) → configurar a função na Central de IAs → primeiro teste (§11).
