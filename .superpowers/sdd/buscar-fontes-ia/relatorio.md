# Buscar fontes com IA nas abas + fontes sempre as mais atuais

Ramo `buscar-fontes-ia` (partida 8bd82fb). Nada foi empurrado, nenhuma chamada real a IA, internet, Supabase, GCP ou Vercel.

## O que foi feito (em português simples)

### A. Botão "Buscar fontes com IA" onde falta fonte
- Componente novo `src/novo/app/admin/assistant/SearchSourcesButton.jsx`. Ele usa a MESMA função que a aba Fontes já usa para pedir busca (`app_ch_source_search_start`); não existe fila nova.
- Aparece em:
  1. Assistente de **Questões**: dentro do aviso "Faltou fonte para este tema" e junto das linhas "Sem fonte: cole um trecho da diretriz…". Usa área, tema (ou subtema) da questão aberta.
  2. Assistente de **Atualizações**: mesmo lugar. Usa área, tema, e no texto do pedido o subtema e a instituição.
  3. **Atualizações > Editar atualização** vinda do app antigo (caixa "Veio do app anterior": link com erro 404, selo sem registro, citação que não confere): botão logo abaixo dos avisos, com o tema da atualização.
  4. **Análise de questões** (aviso "Sem fonte oficial cadastrada e conferida…") e **Vincular evidência > Buscar** quando volta "Nenhum trecho encontrado": botão com um campo "Tema para buscar fontes" (não há tema do item nesses lugares).
  Como o painel é o mesmo para todas as abas (`TabAssistant`), as abas futuras (Planos, Aulas, Podcasts) herdam o botão se o formulário tiver `area`/`topic`.
- Antes de pedir, mostra: "Custo estimado: cerca de US$ 0,40 por tema (média medida nas buscas feitas). Inclui até N buscas na internet a US$ 0,01 cada (preço atual da tabela de preços) e o uso do modelo Claude …", e "Só entra na biblioteca depois que você aprovar na aba Fontes." O preço por busca, o modelo e o máximo de buscas vêm do status do servidor (`/source-search/status` agora também devolve `provider`, `model`, `per_search_usd`).
- Andamento (conferido a cada 5 s só enquanto a busca anda): Na fila, A IA está buscando, Conferindo os documentos, Concluída com N candidatos (+ botão "Ver candidatos"), Concluída sem nenhum achado conferido, Nada encontrado, A busca falhou: (motivo em português), Parada (teto, função desligada). "Ver candidatos" abre a aba Fontes em outra janela (quem está editando um item não perde o que digitou).
- Só administrador pede. Editor, revisor e outros veem "Peça ao administrador para buscar fontes deste tema." (sem botão e sem nenhuma chamada).
- Busca repetida: antes de pedir, o banco diz se já houve busca do mesmo tema nos últimos 7 dias (as que falharam não contam) ou se há candidatos aguardando para ele. Se sim, aparece "Este tema já foi buscado", com a data, o resultado, quantos candidatos aguardam, "Ver candidatos" e "Buscar de novo mesmo assim" (ou "Não buscar").
- Site novo + SQL antigo: se a função nova do banco não existe, aparece "O banco ainda não recebeu a atualização necessária para esta busca… cole a migração 20261003009820" no lugar do erro cru.

### B. "Sempre as fontes mais atuais" (quatro frentes)
1. **Pedido à IA** (`prompts.ts`, versão do prompt 1.0.0 → 1.1.0; `search.ts`): instrução explícita de buscar a versão MAIS RECENTE EM VIGOR (PCDT, diretriz, protocolo, nota técnica, manual), conferir na própria página/documento a data de publicação ou atualização e a vigência, preferir a edição mais nova, procurar ativamente versão mais nova de cada documento da biblioteca, nunca afirmar "mais atual" sem a data aparecer, e DIZER em `observacao` (que vira a mensagem da busca) quando só achou versão antiga ou não achou a data. A entrada leva a lista `biblioteca`: título, órgão, versão, data de publicação e vigência das fontes vigentes do tema (até 12; nenhum texto de documento). A IA também devolve `vigente_ate` (opcional).
2. **Servidor** (`server/contentHub/sources/currency.ts` novo, `verify.ts`): a data só é "comprovada" quando (a) a data que a IA disse aparece no texto do documento (dia inteiro em qualquer lugar; só o ano nas 3 primeiras páginas) ou (b) a PÁGINA WEB declara a data (meta published_time etc.). A data interna de um PDF (metadados) NÃO prova publicação: fica só como aviso. A vigência dita pela IA é guardada e marcada como encontrada ou não encontrada no documento. No fim de cada busca o servidor classifica cada candidato:
   - **versão mais nova que a da biblioteca** (substitui a fonte vigente X: mesma regra de `ch_source_replacement`, mesmo título e órgão);
   - **mesma versão da biblioteca**;
   - **mais antiga que a da biblioteca** (avisa; não é oferecida como substituta);
   - **a IA achou outra mais nova para o mesmo tema** (mesmo título e órgão, datas comprovadas diferentes; vale também entre buscas diferentes: um achado novo muda o estado do antigo que ainda aguarda);
   - **data não comprovada** (inclui: biblioteca sem data, e só ano contra dia no mesmo ano);
   - **documento novo na biblioteca** (data comprovada, nada igual na biblioteca; estado a mais, necessário para o caso sem comparação).
3. **Tela de candidatos** (`SourceCandidates.jsx`): selo de atualidade, "Data comprovada (e de onde veio)", "Vigência segundo a IA (comprovada ou não encontrada no documento)", nota do servidor, avisos de prova. Lista com os mais atuais primeiro (ordem no banco: mais nova que a biblioteca, documento novo, mesma versão, sem prova, outra mais nova, mais antiga; dentro de cada grupo continua governo primeiro e data mais recente). Versão mais antiga: caixa vermelha, botão "Aprovar versão mais antiga" e confirmação explícita que diz "Aprovar vai SUBSTITUIR a mais nova pela mais antiga". O banco também exige (`confirm_older`), mesmo que a tela seja burlada, e o registro da administração guarda "Versão mais antiga aprovada com confirmação".
4. **Monitor** (nada novo construído): ver "Como o monitor atual avisa" abaixo.

## Arquivos
Novos: `server/contentHub/sources/currency.ts`; `supabase/migrations/20261003009820_fontes_atualidade.sql`; `src/novo/app/admin/assistant/SearchSourcesButton.jsx`; `src/novo/app/admin/content/sourceCurrency.js`; testes `src/__tests__/fontesAtualidadeClassificacao.test.ts`, `fontesAtualidadeBusca.test.ts`, `fontesAtualidadeTelas.test.tsx`.
Alterados (poucas linhas cada): `server/contentHub/ai/prompts.ts`, `sources/search.ts`, `sources/verify.ts`, `router.ts` (status), `AssistantPanel.jsx` (+3 linhas: prop `sourceAction`), `TabAssistant.jsx` (+2), `AdminUpdates.jsx` (+4), `QuestionAnalyses.jsx` (+2), `content/ui.jsx` (+2), `SourceCandidates.jsx`, `auditLog.js` (resumo do aprovar), testes `fontesOficiaisRotas`, `fontesOficiaisContrato` (o contrato do status ganhou 3 chaves), `registroAdministracao`.
Nenhum arquivo de `AdminQuestions.jsx`, `types.ts`, `QuestionAnalyses` (só 2 linhas), `DraftQuestions.jsx` ou `pipeline.ts` foi tocado de forma que conflite com leva3-final / analise-ia / ineditas (conferi: esses ramos só mexem em migrações 97xx/98xx e em `auditLog.js`, onde mudei só o resumo do aprovar candidato).

## Migração (20261003009820, dentro do meu intervalo)
Idempotente (colar 2x, testado), `security definer`, `search_path` vazio, revoke de public/anon (e authenticated nas internas).
- Colunas novas em `ch_source_candidates`: `ai_valid_until`, `currency`, `currency_date`, `currency_info`.
- Redefinidas a partir da versão MAIS NOVA (a da 9610; nenhuma outra migração as recria): `ch_worker_source_candidate_create`, `app_ch_source_candidates` (só a ordem), `app_ch_source_candidate_approve` (confirmação da versão mais antiga + registro).
- Novas: `ch_worker_source_library_for_theme`, `ch_worker_source_currency_context`, `ch_worker_source_currency_set` (internas) e `app_ch_source_search_check` (só administrador).
- **Como colar**: Supabase > SQL Editor > colar o arquivo inteiro > Run. Pode colar de novo sem estragar. Cole DEPOIS da 9610 (e das demais já aplicadas). Depois de colar, conferir de fora (o item "conferir SQL colado" da memória): chamar `app_ch_source_search_check` como administrador e ver `{recent, waiting, search}`.

## Ordem de publicação
1. **SQL** (9820) no Supabase.
2. **Cloud Run** (processamento): funciona mesmo antes do SQL (se a função nova do banco não existir ele segue sem a lista da biblioteca e sem classificar, sem derrubar a busca paga).
3. **Site** (Vercel): se sair antes do SQL, o botão mostra o aviso em português e a tela de candidatos continua igual (sem selos).
Recomendado: SQL, Cloud Run, site, nessa ordem. Antes do SQL, `ch_worker_source_candidate_create` antigo ignora as chaves novas.

## Custo esperado
Sem custo novo por busca: o texto do pedido cresce poucas centenas de tokens (lista de até 12 fontes). Estimativa mostrada: cerca de US$ 0,40 por tema (medido: US$ 0,38 em 55 temas), com até 5 buscas na internet a US$ 0,01 (preço da tabela). Se o dono pedir muitas buscas pelas abas, é por tema: 10 temas ≈ US$ 4. Os tetos da Central de IAs continuam valendo.

## Testes (todos passaram, IA e internet falsas)
- Lote 1 (12 arquivos, 225 testes): classificação (17), busca com atualidade (11), telas de atualidade (27), telas de Fontes, painel do assistente, assistente de Questões, de Atualizações, registro da administração, rotas, contrato, busca, banco das fontes oficiais.
- Lote 2 (12 arquivos, 266 testes): conferência, IA das fontes, rede, contentLab, limites de esquema, pipeline, registro (banco), erro padrão do assistente, painéis da Central, atualizações/questão de treino, abas visíveis, fontes complementares (tela).
- Cobrem: botão em cada aba, permissões (administrador pede; editor/revisor/aluno veem o aviso), busca repetida (7 dias/aguardando) e "Buscar de novo mesmo assim", andamento, site novo + SQL antigo (tela e servidor), prompt com a instrução de atualidade e os títulos/datas das fontes vigentes (e sem texto baixado), os 6 estados, ordenação, confirmação da versão mais antiga (tela e banco), nada vira fonte sem aprovação, registro em português, migração colada 3x, funções internas fechadas.
- `npm run build`: passou (uma vez). `tsc --noEmit`: 1831 erros = a base; nenhum erro novo nos meus arquivos.

## Riscos e limites (honestos)
- **Prova da data é conservadora**: data de PDF só dos metadados não prova. Muitos PDFs do governo que não trazem a data por extenso no texto vão aparecer como "Data não comprovada". Isso é de propósito (nunca marcar "mais atual" sem prova), mas pode dar trabalho de conferência manual. "Comprovada" quer dizer "a data aparece no documento", não que seja necessariamente a data de publicação (o ano sozinho só é procurado nas 3 primeiras páginas).
- **Comparação com a biblioteca é por título e órgão iguais (sem caixa)**, a mesma regra de substituição que já existia. Se a IA escrever o título um pouco diferente, o candidato sai como "documento novo", não como "mais nova que X". O pedido manda a IA usar os títulos da biblioteca.
- **Aprovar versão mais antiga continua substituindo a vigente** (regra existente); agora só com confirmação explícita. Não fiz o caminho "guardar como antiga sem substituir".
- Candidatos antigos (de antes desta migração) aparecem como "Atualidade não avaliada" até uma busca nova tocar o mesmo documento; aí viram "data não comprovada" (não há prova guardada).
- Não testei o comportamento da IA real diante da nova instrução (sem chamada real, como pedido): a primeira busca real deve ser acompanhada.
- A ordem da lista passou a ser por estado de atualidade primeiro; "governo primeiro" ficou como segundo critério.
- Fontes aprovadas pela busca NÃO entram sozinhas no monitor (ver abaixo).

## O que NÃO foi feito
- Varredura/rebusca periódica (pedido era só propor).
- Monitor automático para fontes recém-aprovadas.
- Botão em abas que ainda não têm assistente (Planos, Aulas, Podcasts da leva3): herdam pelo `TabAssistant` se tiverem `area`/`topic`; não toquei nelas.
- Nenhuma mudança em `SourceSearch.jsx` (tela Fontes) nem em `AdminQuestions.jsx`.
- Teste real na tela do navegador (só jsdom).

## Como o dono usa (passo a passo)
1. Na aba Questões ou Atualizações, abra o item e o Assistente; clique em Preencher. Se aparecer "Faltou fonte para este tema", vai aparecer embaixo o bloco "Buscar fontes com IA".
2. Leia o custo ("cerca de US$ 0,40") e o aviso de que nada entra sem a sua aprovação. Clique em **Buscar fontes com IA**.
3. Se o tema já foi buscado há menos de 7 dias ou tem candidatos esperando, o sistema avisa; escolha "Ver candidatos" ou "Buscar de novo mesmo assim".
4. Acompanhe: na fila, buscando, conferindo, concluída com N candidatos.
5. Clique em **Ver candidatos** (abre a aba Fontes numa janela nova). Os mais atuais vêm primeiro. Leia o selo (versão mais nova, mesma, mais antiga, outra mais nova, data não comprovada, documento novo), a data comprovada e a vigência.
6. Confira o arquivo, escolha o nível e aprove. Para uma versão mais antiga o botão muda para "Aprovar versão mais antiga" e o sistema pede a confirmação dizendo o que vai ser trocado.
7. Em Atualizações do app antigo e na Análise de questões o botão fica logo abaixo do aviso; nesta última você escreve o tema.

## Como o monitor atual avisa mudança de versão
- Tabela `ch_source_watch` (uma linha por fonte vigiada: endereço, intervalo em dias, último resumo/hash). Só existe linha quando o administrador clica "monitorar" numa fonte da aba Fontes (`app_ch_watch_source`); aprovar pela busca NÃO cria vigilância.
- O processamento (`worker.checkSources`, a cada 30 min, ou quando alguém pede) busca cada endereço vencido, calcula a impressão digital da publicação (`publicationHash`) e chama `ch_worker_watch_result`. Se mudou: grava uma linha em `ch_source_changes`, marca os materiais que dependem da fonte como "requer atualização" (`ch_flag_dependents`) e a fonte ganha o selo de mudança na aba Fontes. Em páginas web guarda um instantâneo dos trechos e compara com o anterior (`sourceCompare.ts`/`sourceDiff`): diz quais afirmações foram afetadas. PDF segue só com a impressão digital.
- Limites: só detecta que O MESMO ENDEREÇO mudou; não descobre uma versão nova publicada em outro endereço (o caso típico de PCDT novo).

## Proposta do passo seguinte (não construída): rebuscar periodicamente os temas aprovados
1. Ao aprovar um candidato (ou registrar fonte com https), criar automaticamente a vigilância semanal dele (um `insert` em `ch_source_watch` dentro da aprovação). Custo zero de IA.
2. Rotina mensal opcional (ligada/desligada em Configuração, começa DESLIGADA, com teto de temas por mês): pega os temas das fontes vigentes, começando pelos com mudança detectada pelo monitor e pelos de vigência vencida (`valid_until`), e põe uma busca por tema na fila existente (mesma `app_ch_source_search_start`, via função de serviço), pulando temas com candidatos aguardando ou buscados nos últimos 30 dias. Cada busca já sai com a instrução de atualidade e a lista da biblioteca, então os candidatos chegam classificados ("versão mais nova que a da biblioteca"). Respeita os tetos mensais/por execução da Central de IAs.
3. Aviso na Administração: "N temas com versão mais nova achada" (contagem de candidatos `versao_mais_nova` aguardando).
Custo de referência: ~US$ 0,40 por tema; 55 temas por mês ≈ US$ 22 (menos se só os vencidos/mudados).


## Revisão independente 1 (OpenAI, sobre e09727c)

Todos os 8 achados foram lidos no código e **confirmados**. Cada correção tem teste que falha sem ela (23 testes novos ou ajustados falharam sem a correção e passam com ela). A migração 9820 foi editada no lugar (ainda não foi colada em produção; continua idempotente, testado 3 vezes).

| # | Gravidade | Achado | Resultado | O que mudou |
|---|---|---|---|---|
| 1 | Alto | Aprovação gravava `published_on` com `file_date`/`ai_published` sem prova | Confirmado (SQL usava `coalesce(editada, file_date, ai_published)`) | `published_on` = data do administrador, senão a COMPROVADA (`currency_date`), senão nula ("data não comprovada"). Ano comprovado vira só a versão. O formulário da tela também só vem preenchido com a data comprovada. |
| 2 | Alto | Substituição por `v_dup` (mesmo arquivo/endereço) não exigia `confirm_older` | Confirmado | Verificação única para toda fonte que será substituída (`v_rep` e `v_dup`): mais antiga exige `confirm_older` ("Confirme a versão mais antiga…"); data não comparável (candidato ou fonte sem data, ou só ano no mesmo ano) exige `confirm_older` ("Confirme a versão sem data comparável…"). Função nova `ch_source_date_cmp`. Corrigido de passagem: comparação com `null` fazia o teste de "mais antiga" nunca disparar com `currency` nulo. |
| 3 | Alto | Endereço igual bloqueava a edição nova | Confirmado (e pior: `url_norm` era UNIQUE e o passo 2 do servidor descartava endereço de fonte/aprovado/rejeitado antes de baixar) | Repetido só quando o SHA-256 é o mesmo ou o candidato do mesmo endereço ainda aguarda. `url_norm` deixou de ser único (índice comum). O servidor só dispensa o download quando há candidato aguardando; o resto baixa e compara o SHA-256 (fonte cadastrada, vigiada, aprovada e rejeitada continuam repetidas pelo ARQUIVO). O candidato antigo nunca é apagado. A tela avisa que, se o conteúdo do link mudar, a versão nova pode aparecer. |
| 4 | Alto | Irmão mais novo ignorado em "mesma versão"/"sem data"/"só ano" | Confirmado | `classifyCurrency` considera o irmão comprovadamente mais novo antes desses retornos (só "mais antiga que a biblioteca" continua mais grave). A aprovação repete a verificação no banco (candidatos irmãos aguardando de mesmo título e órgão com data comprovada mais nova) e exige `confirm_older`. |
| 5 | Médio | Data achada no texto não prova o significado | Confirmado | Data só comprova com o contexto antes dela (até 60 caracteres): publicação/atualização ("publicado em", "atualizado em", "edição", "Brasília,"…) ou fim da vigência ("vigente até", "válido até", "validade", "valid until"…). Ano isolado só com contexto e nas 3 primeiras páginas. Publicação não comprova vigência e vice-versa. |
| 6 | Médio | Falha na classificação encerrava sem nova tentativa | Confirmado | Candidato aguardando sem estado numa busca concluída é a pendência (função `ch_worker_source_currency_pending`, até 20 buscas). É refeita sem IA: no começo de toda busca nova, a cada 30 min no laço do processamento e por `worker.reconcilePendingCurrency()`. Também recupera o caso "Cloud Run novo antes do SQL". |
| 7 | Médio | Acompanhamento parava em `pendente` | Confirmado | Continua consultando em `pendente` (3 vezes mais devagar) e volta ao andamento normal quando a busca retoma ou termina. |
| 8 | Baixo | Aviso técnico (SQL, migração, Supabase) e erros crus na tela | Confirmado | Aviso: "O sistema está aguardando uma atualização para liberar esta busca. Avise quem cuida do sistema e tente de novo mais tarde." Erros crus (rede, permissão, banco, inglês) viram avisos simples em português; a mensagem da busca passa pelo mesmo tradutor. |

**Permissões e idempotência (pedido extra)**: a migração agora tem `grant execute` explícito: `service_role` nas funções internas (`ch_worker_source_candidate_create`, `…library_for_theme`, `…currency_context`, `…currency_set`, `…currency_pending`, `ch_source_date_cmp`) e `authenticated` + `service_role` nas três funções da tela (`app_ch_source_candidates`, `app_ch_source_candidate_approve`, `app_ch_source_search_check`, cada uma com `assert_admin` por dentro); `anon` e `authenticated` seguem sem acesso às internas. Teste com `has_function_privilege` cobre todas. A migração foi colada 3 vezes nos testes sem perder dados.

**Testes afetados ajustados de propósito** (comportamento mudou de forma pedida): aprovação sem data comprovada grava data nula (Banco); fonte cadastrada pelo mesmo endereço com arquivo novo vira candidato (Conferência); substituição precisa de datas comparáveis (Banco, Contrato); campo de data do cartão só com data comprovada (Telas).

**Limites que restam**
- A prova por contexto é por palavra-chave perto da data; documentos que escrevem a data sem nenhuma dessas palavras (ex.: só "10/05/2024" no rodapé) ficam "data não comprovada" até o administrador digitar a data.
- Fonte da biblioteca sem data (cadastrada à mão) agora sempre pede `confirm_older` ao ser substituída ("sem data comparável"); é o preço da regra pedida.
- Candidatos antigos continuam "Atualidade não avaliada" até uma busca tocar o mesmo documento ou a rotina de pendência rodar (a rotina só olha buscas concluídas com candidatos aguardando e sem estado, ou seja, também os antigos: na primeira rodada após colar o SQL eles serão classificados como "data não comprovada").
- Mesmo endereço com conteúdo novo exige baixar o arquivo de novo a cada busca (custo de banda, não de IA).
- Comparação com a biblioteca continua por título e órgão iguais.
- Sem IA real e sem navegador real nos testes.
