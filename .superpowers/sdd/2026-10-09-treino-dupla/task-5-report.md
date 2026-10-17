# Relatório da Tarefa 5 (Etapa 2): estações de teste do INEP 2020

Ramo `treino-dupla-t5`, partida `ed3759b`. Só local: nada foi empurrado, nada de Supabase, GCP, Vercel nem rede.

## O que foi construído
- **Conversor** `scripts/dupla/converter-inep2020.ts`: lê `stations-inep2020.js` do pacote como TEXTO e o percorre com a árvore sintática do TypeScript. Nada do pacote é executado (sem eval, import ou vm). Só avalia literais, as chamadas `C(...)` e `R(...)` do próprio arquivo e a constante `ORIGIN`. Ignora `PAGES`, `PEP`, `SECTIONS`, `NUMS` e os `forEach` da vitrine. Qualquer outra forma dá erro com arquivo:linha:coluna. Depois valida com `loadStations` (soma 10,00 por estação) e, se algo não fechar, para com o motivo (não corrige dado).
- **JSON gerado e commitado** `server/dupla/data/teste-inep2020.json`: 10 estações no formato publicado (`Station[]`), ids `teste-inep2020-e01` a `e10`. Itens: 8/28/11/13/14/9/14/18/13/11 = 139, todas somam 10,00.
- **Carga de teste** `server/dupla/testStations.ts`: `loadDuplaTestStations()` e `buildDuplaTestStatements()` (insere em `checklist_stations` e `checklist_station_contents` com `on conflict do update`; recusa rodar com `NODE_ENV=production`). O conteúdo guarda também `version: "teste"`, que o tipo `Station` não tem (o plano usa em `RoomContent.station.version`).
- **Trava da carga real** em `scripts/supabase/seed-builder.ts`: `assertNoTestStations(ids)` lança "A carga do Supabase não aceita estações de teste (teste-…)." e é chamada em `buildSeedRows`. Também passei a exportar `textArray` (só adicionei `export`).
- **Banco local** `server/devDb/devDatabase.ts`: a carga local acrescenta `buildDuplaTestStatements()`.
- **Testes** `src/__tests__/duplaEstacoesTeste.test.ts` (10 testes).

## De onde veio cada dado
Tudo de `/Users/joaopaulomendes/Downloads/templates/handoff-treino-dupla/ui_kits/treino-dupla/stations-inep2020.js` (só lido).
- nome, cenário, tarefas, impressos (título e texto), critérios, pontos, pontos parciais, subitens (`items`), dicas (`hint`), texto dos níveis (`rubric`), `tags`, `duration`, `code` (área): do pacote.
- `topic` = nome; `taxonomy_path` = [área, nome]; `institution` "INEP"; `year` "2020"; `goal` "Revalida"; `styles` = `tags`; `medical_review` "approved"; `is_pro_only` false; `max_score` 10; `phase` "PEP" em todo item: do plano.
- `duration_ms` = `duration` x 1000 (todas as 10 têm 600 s).
- Área: rótulo do Banco pelo `code` (CM, CR, GO, PED, MFC); o conversor confere que o rótulo do pacote bate e para se não bater.
- `created_at` fixo igual ao do catálogo (`2026-10-01T00:00:00.000Z`).

## O que está duvidoso por OCR
- O próprio pacote avisa que os critérios e pontos vieram do `PEP_Publicacao.pdf` lido por OCR. O README do pacote diz que "itens com leitura incompleta trazem uma dica avisando para conferir no original". **Nesta cópia do arquivo não existe nenhuma dica assim**: só há 2 `hint` (e01 item 2, "É necessária a execução dos 2 procedimentos…", e e04 item 3, sobre PALM-COEIN) e nenhuma pede conferência. Então não tenho como apontar quais itens são os duvidosos. Eles entram com a dica do pacote no campo `tip` e o aviso geral fica aqui: todos os 139 critérios e pontos são "OCR, conferir contra o PEP oficial antes de qualquer uso fora de teste". Não achei aviso por item para copiar e não inventei um.
- Impressos que o pacote escreve como remetendo a imagem: e01 item 2 e e03 item 3 ("Imagem disponível no documento original (página N do caderno de prova)"). Ficam com esse texto do pacote e `image_url` nulo.
- e06, impresso 1: o texto ("O caderno de prova não traz o conteúdo destes impressos… Pelo PEP: hemograma com leucocitose…") é uma explicação escrita pelo autor do pacote, não texto do caderno. Mantido como está no pacote; vale conferir.

## TODO(dono) (nada inventado)
- Roteiro do ator das 10 estações: não consta nos documentos. `actor_script` = "" (comentado no conversor, na carga e no teste).
- Imagens dos impressos (esfregaço, radiografia, recortes das páginas): não estão nos documentos. `image_url` = null e não há `pressing_assets`.
- Como o roteiro está vazio, a sala de teste terá o avaliador sem roteiro nessas estações.

## Decisões pequenas (fora do texto do plano)
- A linha "Observação: …" das tarefas (e05 e e10) não ganha número: o caderno a escreve como observação, não como tarefa. Fica em linha própria depois das tarefas numeradas. Texto literal.
- Os textos de `doctor_tasks` mantêm o ";" e o "e" finais do caderno ("…; e").
- Item sem `rubric` no pacote: `criteria` = `{ correct: "", incorrect: "" }` (como o plano manda). Sem texto parcial quando o pacote não traz.

## Arquivos
Criados: `scripts/dupla/converter-inep2020.ts`, `server/dupla/data/teste-inep2020.json`, `server/dupla/testStations.ts`, `src/__tests__/duplaEstacoesTeste.test.ts`, este relatório.
Alterados: `scripts/supabase/seed-builder.ts`, `server/devDb/devDatabase.ts`.
Não toquei: migração 9000, `src/__tests__/helpers/duplaDb.ts` (Tarefa 4), nem rotas `/dupla/preparar` e `/dupla/sala-teste` (são da Tarefa 10; a Tarefa 5 só dá os dados).

## Testes e resultados (pela fila, `--pool=threads --maxWorkers=1 --testTimeout=120000`)
- `duplaEstacoesTeste.test.ts`, `supabaseSeed.test.ts`, `lessonsRoutes.test.ts`: 3 arquivos (os 3 existem), 21 testes passando.
- Conferência de efeito colateral no banco local (o seed agora traz 10 estações a mais): `supabaseSchema`, `supabaseAdminApi`, `estacoesRevisaoMedica`, `sqieClosing`, `checklistBankApi`, `presenceAndChecklistBank`: 6 arquivos, 86 testes passando.
- `tsc --noEmit`: 1831 erros, o mesmo número da base; nenhum nos arquivos novos nem alterados.
- `npm run build:vercel`: ok (uma vez).
- O teste "o conversor refeito dá o JSON commitado" só roda na máquina onde o pacote existe (se o arquivo não estiver lá, passa sem comparar).
- A suíte completa não foi rodada (pedido: nunca a suíte inteira).

## Desvios do plano
- O plano cita o pacote em `/Volumes/Samsung/...`; usei o caminho do pedido (`Downloads/templates/handoff-treino-dupla`) e a fila em `/Volumes/StaziaMed/...`.
- Exportei `textArray` do seed-builder (o plano só pedia `assertNoTestStations`).
- `buildDuplaTestStatements` recusa `NODE_ENV=production` (proteção extra, não pedida).
- Meu teste do banco local abre o banco de desenvolvimento por `openDevDatabaseForTests` com as migrações atuais (as que existem no ramo). Não precisei de esquema de teste à parte: a Tarefa 5 só usa `checklist_stations` e `checklist_station_contents`, que já existem desde a `…0400`.

## O que a junção com a Tarefa 4 exige
- Nada de arquivo em comum: a Tarefa 4 mexe na migração e em `duplaDb.ts`; esta não.
- Depois da junção, o banco local só ganha as estações de teste quando uma migração nova é aplicada (a carga roda quando o conjunto de migrações muda). Um `.data/dev-db` já existente recebe as 10 estações assim que a migração 9000 entrar; ou, se quiser antes, rodar `buildDuplaTestStatements()` nele.
- O helper `duplaDb.ts` da Tarefa 4 (`addStation`, `STATION`) segue com a estação própria `teste-dupla-e01`; as 10 do INEP 2020 servem para a sala de teste local (Tarefa 10) e para testes que queiram estações reais de formato (`loadDuplaTestStations()` / `buildDuplaTestStatements()`).
- Quando a 9000 trocar a política de `checklist_station_contents` para "só da equipe", a carga local não muda (o dono do banco grava direto). Com a leva 2 (8000) a recarga passa pelo gatilho `checklist_stations_review_guard`, mas como `medical_review` não muda ('approved' sempre), nada é apagado.
- `dupla_station_meta` (9000) entende `teste-inep…-eNN` pelo regex `^(?:teste-)?inep-?(\d{4})(?:-([12]))?(r)?-e(\d{1,2})$`: `teste-inep2020-e01` dá `edition "2020"`, `number 1`. Conferir quando a 9000 chegar.
