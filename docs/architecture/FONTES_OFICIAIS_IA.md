# Fontes oficiais com IA (Administração › Central de Conteúdo › Fontes)

Escrito para: o dono do produto (o que existe, quem decide e quanto custa) e quem for manter o código.
Especificação: `docs/superpowers/specs/2026-10-09-fontes-oficiais-ia-design.md`. Plano: `docs/superpowers/plans/2026-10-09-fontes-oficiais-ia.md`.
Migração: `supabase/migrations/20261003009610_fontes_oficiais_ia.sql`.

## O pedido e o resultado
Em 2026-10-09 o dono pediu: "subir os PDFs oficiais em Central de Conteúdo › Fontes (protocolos do Ministério da Saúde, PCDT,
diretrizes de sociedades médicas). Deixe uma IA nessa tela para fazer a busca, trazer as fontes e baixar os materiais; ela vai me
mostrar, eu vou conferir e aprovar, e a partir de então vira fonte do sistema."

Na tela Fontes o administrador escolhe a área e um tema (ou "temas mais cobrados"), escreve um texto livre se quiser e clica
**Buscar**. Uma IA procura na internet **só nos sites oficiais da lista**. O **servidor** (não a IA) baixa cada arquivo, confere e
guarda. O dono vê a lista **"Fontes encontradas — aguardando sua conferência"**, abre o arquivo guardado, ajusta os dados e
**aprova** ou **rejeita**. Só o aprovado vira fonte do sistema.

## Como funciona, passo a passo
1. **Pedido.** `app_ch_source_search_start` grava uma busca por tema e põe cada uma na fila (`ch_jobs`, etapa `source_search`, sem
   documento). "Temas mais cobrados" (1 a 10; 5 por padrão na tela) escolhe os temas pela incidência das questões oficiais da área,
   na hora do pedido. Pedido igual a uma busca que ainda está andando não se repete (a tela avisa).
2. **Busca.** O processamento (a tarefa do Cloud Run em produção, a cada ~10 minutos; no desenvolvimento, o servidor local) chama a
   função **Busca de fontes oficiais** (`busca_fontes`) da Central de IAs. A IA só tem a ferramenta de busca da própria empresa,
   limitada aos sites da lista, e devolve de 0 a 8 documentos com título, instituição, link, data, tipo, motivo e um trecho exato.
3. **Conferência no servidor** (a IA nunca é confiada). Para cada achado, na ordem, parando no primeiro problema: link `https` e
   host/caminho dentro de um site **ativo** da lista; repetido (mesmo link normalizado ou mesmo SHA-256 de fonte, documento ou
   candidato, inclusive rejeitado); download com até 3 redirecionamentos, cada um conferido (https, lista, endereço público), no
   máximo 50 MB e 60 s, só PDF (`%PDF-`) ou página HTML; texto lido (PDF escaneado é descartado); o **trecho** da IA (20 a 400
   caracteres) precisa existir no texto do arquivo, com a página. Título e data achados no arquivo aparecem ao lado do que a IA
   disse e nunca o trocam sozinhos. Quem passa vira candidato **"aguardando sua conferência"**, com o arquivo guardado no depósito
   privado (`content-hub/source-candidates/<sha256>.pdf|.html`). Quem não passa fica na busca como **descartado, com o motivo**.
4. **Conferência do dono.** O cartão mostra título, instituição, site e tipo, motivo da IA, o trecho destacado com a página, se o
   link foi visto na busca, o arquivo (tipo, páginas, tamanho, SHA-256), **Abrir arquivo guardado**, **Abrir no site oficial** e a
   **Prévia do texto**. Campos editáveis: instituição, título, versão, data de publicação, tipo, natureza, nível A a D, área, tema
   e vigência. O nível já vem preenchido com o padrão do tipo de site (governo A, sociedade B, internacional C) e a sugestão da IA
   aparece ao lado; o dono vê e pode trocar.
5. **Aprovar.** Exige nível A a D, título, instituição e a caixa "Conferi o documento no arquivo guardado". Se já existe fonte
   vigente com o mesmo título e órgão, o cartão avisa qual será substituída e a tela pede confirmação (`confirm_replace`). Numa só
   transação o banco cria a fonte vigente (com quem aprovou e quando), o documento de referência (`reference_only`) e o vínculo;
   depois a rota põe a leitura (`extract`) na fila. Se isso falhar, a aprovação vale e a tela oferece **Ler de novo**.
6. **Rejeitar.** Exige motivo (pelo menos 10 caracteres). O arquivo guardado é apagado; o link e o SHA-256 ficam, então o mesmo
   achado não volta a ser sugerido.
7. **Leitura.** PDF: `extract → source_index`, com trechos citáveis com página. Página web: sem número de página (a evidência ligada
   a ela fica sem página). Depois entram os vetores da busca por significado. A fonte aparece em "Fontes cadastradas" com o selo
   **encontrada pela busca** e a situação da leitura.

Estados da busca: na fila → buscando → conferindo → concluída | nada encontrado; pendente (função desligada ou teto atingido, volta
sozinha) e falhou (IA fora do ar e sem reserva, ou tarefa morta; repetir o pedido abre outra busca).
Estados do candidato: aguardando → aprovado | rejeitado.

## Quem aprova
**Só o administrador (o dono).** Pedir busca, ver buscas e candidatos, editar, aprovar, rejeitar, abrir o arquivo e mudar a lista de
sites são ações de administrador; o banco recusa as outras pessoas (RLS e `assert_admin`), não só a tela. A equipe (editor) continua
vendo só "Fontes cadastradas" e lê a lista de sites oficiais. O aluno nunca vê nada disso.

## O que a IA nunca faz
- Não cria fonte, não aprova, não rejeita e não edita os dados do dono: nenhuma etapa automática passa de "aguardando".
- Não baixa nada: quem baixa e confere é o servidor. O link ter aparecido na busca é só um sinal; o que prova o achado é o trecho
  encontrado no arquivo baixado.
- Não procura fora da lista de sites oficiais e não sugere sites novos (a lista só muda pela mão do administrador).
- Não traz nível E (curso, apostila): o banco recusa nível E na edição e na aprovação.
- Não recebe de volta o conteúdo baixado: nesta fase nada do arquivo vai para nenhuma IA.
- Não altera o arquivo guardado, que fica privado e só abre por link temporário de 60 segundos. Página web guardada nunca é aberta
  como página no navegador do dono: só o texto e o botão para o site oficial.
- Não roda sozinha: a função **começa desligada** (sem configuração salva não usa as variáveis do servidor).

## Sites oficiais semeados (11)
Lista editável na tela (acrescentar, editar, desativar). Site desativado deixa de valer para novas buscas **e** para aprovar achados
antigos dele. Um endereço vale para o host e seus subdomínios (`www.gov.br` serve para `gov.br`; `gov.br.exemplo.com` e `falsogov.br`
não) e, se tem caminho, o caminho do link precisa começar por ele inteiro (`/saude/...` sim, `/saudemental` não).

| Endereço | Instituição | Tipo |
|---|---|---|
| gov.br/saude | Ministério da Saúde | governo |
| bvsms.saude.gov.br | Biblioteca Virtual em Saúde do Ministério da Saúde | governo |
| gov.br/conitec | Conitec | governo |
| gov.br/inca | INCA | governo |
| gov.br/anvisa | Anvisa | governo |
| who.int | Organização Mundial da Saúde | internacional |
| paho.org | Organização Pan-Americana da Saúde | internacional |
| iris.paho.org | Repositório IRIS da OPAS | internacional |
| febrasgo.org.br | Febrasgo | sociedade |
| sbp.com.br | Sociedade Brasileira de Pediatria | sociedade |
| portal.cardiol.br | Sociedade Brasileira de Cardiologia | sociedade |

Colar o SQL de novo não apaga o que o dono mexeu (as sementes entram com `on conflict do nothing`).

## Custos e tetos
- A função usa a Central de IAs (Administração › Central de IAs): o dono escolhe a **IA principal** e a **reserva** entre as que
  buscam na internet (Claude, OpenAI, Gemini; **Ollama não busca** e fica fora), o **cuidado** e o **máximo de buscas por pedido**
  (de 1 a 10; vazio vale 5). Só o modo "sozinha" existe para ela (sem linha de produção, comitê ou conferentes).
- **Preço por busca.** A tabela de preços da Central ganhou a coluna **Por busca (US$)**. O Claude vem preenchido (US$ 10 por 1.000
  buscas = 0,01 cada, mais os tokens); OpenAI e Gemini ficam em branco para o dono preencher. Linha vazia na tela limpa o preço.
- **Estimativa e teto.** A estimativa de uma busca é tokens + máximo de buscas × preço por busca, e entra nos tetos por chamada e
  mensal da Central. Com os tetos ligados, modelo sem preço por busca **não roda**; com os tetos desligados a busca roda e aparece
  como US$ 0 no gasto até o preço ser cadastrado (a tela avisa). Teto atingido: a busca fica **pendente** com o motivo.
- **Registro.** Cada chamada fica em `ai_calls` (com `web_searches`); cada busca mostra IA, modelo, buscas feitas e custo na lista
  "Buscas recentes"; pedido, resultado, edição, aprovação, rejeição e mudança de site vão para `ch_audit`.
- A retomada não paga duas vezes: se o trabalho cai depois da resposta da IA, a nova rodada reaproveita a resposta guardada.

## Como ligar (primeiro uso)
1. Central de IAs: ligar a IA escolhida; preencher o **preço por busca** do modelo; escolher teto baixo.
2. Central de IAs › Funções › **Busca de fontes oficiais**: IA principal, reserva (opcional), máximo de buscas e salvar. A tela de
   Fontes passa a mostrar "pronta" (rota `GET /api/content-hub/source-search/status`). Para desligar: **Desligar a função**.
3. Fontes › **Buscar fontes com IA**. Primeiro teste sugerido: um tema só (ex.: dengue em Clínica Médica) e conferir cada cartão.

## SQL no Supabase: ordem de colagem
A migração **9610** vem **depois da 9540** (`20261003009540_reconferir_insuficientes.sql`), que por sua vez vem depois da 9520
(`…9520_central_gasto_do_mes.sql`) e das anteriores (…8300 `central_so_equipe` etc.). Ordem das últimas: 8300 → 9520 → 9540 → **9610**.
- A 9610 **não redefine** nenhuma função da 9540 (`ch_worker_finish`, `_block`, `_fail`, `_checkpoint`, `_next` e os gatilhos
  `ch_jobs_worker_exit` / `ch_jobs_worker_enter`); o gatilho novo da busca (`ch_jobs_source_search_dead`) é `AFTER UPDATE` e vê o
  estado final.
- Ela recria as regras de `ch_jobs.step` e de `ai_functions.key` com **a união de todos os ramos** (as etapas dos materiais visuais,
  estações, Questões StaziaMed e `source_search`; as 6 chaves antigas e `busca_fontes`). Quem criar outra migração que acrescente etapa
  ou função precisa partir daí.
- Pode ser colada mais de uma vez: não apaga busca, candidato nem site já mexido.
- Também recria `app_ai_summary` (agora 7 funções), `app_ch_register_source`, `app_ch_sources` (com `found_by_search` e
  `document_status`), `ch_worker_ai_log_calls`, `ch_worker_ai_save_function` e `ch_worker_ai_save_price`.
- Ordem de publicação sugerida (só com a ordem do dono): 1) colar o SQL no Supabase; 2) Cloud Run (a busca roda lá);
  3) `git push` para a Vercel (telas e rotas).

## Rotas e telas
Rotas (todas só administrador; erro devolve `{ error }` em português):
- `GET /api/content-hub/source-search/status` → `{ ready, problems, warnings, max_searches }`.
- `POST /api/content-hub/source-candidates/:id/approve` com `{ fields }` (as 10 chaves de edição, `checked: true` e, se o servidor
  pedir, `confirm_replace: true`) → 201 `{ source_id, document_id, superseded, candidate_versions, file_kind, job, read_error? }`.
  Sem a caixa, com nível E ou com substituição não confirmada: 400 (a mensagem de substituição começa com "Confirme a substituição").
- `POST .../:id/reject` com `{ reason }` (pelo menos 10 caracteres) → `{ ok: true }`.
- `POST .../:id/read` ("Ler de novo", sem duplicar o trabalho) → `{ ok, job }`.
- `GET .../:id/file` → `{ url }` (link de 60 s do depósito) ou, no banco local, os bytes do PDF; página web: 409 com aviso; rejeitado: 404.
- `PUT /api/ai-central/functions/busca_fontes` com `{ config: { mode: "sozinha", care, primary, fallback, reviewers: [], max_searches } }` ou
  `{ config: null }` (desliga); `PUT /api/ai-central/prices/:provider/:model` com `per_search_usd` (número ou `null`).

Funções do banco que as telas chamam: `app_ch_source_search_start`, `app_ch_source_searches`, `app_ch_official_domains`,
`app_ch_save_official_domain`, `app_ch_source_candidates` (→ `{ items, counts }`), `app_ch_source_candidate_save`, `app_ch_sources`.

Telas: `src/novo/app/admin/content/SourceSearch.jsx` (pedir e buscas recentes), `SourceCandidates.jsx` (cartões, aprovar, rejeitar),
`OfficialDomains.jsx` (lista de sites), `Sources.jsx` (selo "encontrada pela busca"), `src/novo/app/admin/ai/FunctionEditor.jsx` e
`AdminAI.jsx` (função e preço por busca). Servidor: `server/contentHub/sources/search.ts` (busca na fila), `verify.ts` (conferência),
`officialDomains.ts` (encaixe na lista e limites de download), `server/contentHub/router.ts` (rotas), `server/ai/` (Central).

## Testes
`src/__tests__/fontesOficiaisBanco`, `fontesOficiaisIA`, `fontesOficiaisBusca`, `fontesOficiaisConferencia`, `fontesOficiaisRotas`,
`fontesOficiaisTelas` e **`fontesOficiaisContrato`** (banco e rotas verdadeiros recebendo exatamente o que as telas mandam e conferindo
as chaves que elas leem). Nenhum teste chama IA real nem a internet.

## Fora desta etapa
Achar **mudanças** nas fontes já cadastradas, vigia semanal com comparação de texto, busca semanal automática, rascunhos de
Atualizações e questões afetadas (fases seguintes do projeto Atualizações; documento achado depois também entra como candidato e espera
aprovação). Também fora: OCR de PDF escaneado achado pela busca, a IA sugerir sites novos, documentos atrás de login e avisos ao aluno.

## Limites conhecidos
- PDF escaneado achado pela busca é descartado ("sem texto"); o envio manual do PDF continua existindo.
- O Gemini não filtra sites na própria busca: a lista vai no pedido e quem filtra é o servidor (achado fora da lista é descartado).
- A OpenAI filtra por host, sem caminho; o caminho (`gov.br/saude`) é conferido pelo servidor depois.
- Cada busca roda no processamento da Central: pode levar até ~10 minutos; a tela atualiza sozinha a cada 15 s enquanto há busca andando.
- O primeiro teste com material real ainda não foi feito (precisa da IA, do preço por busca e de um teto baixo ligados pelo dono).
