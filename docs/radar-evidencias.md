# Radar de Evidências StaziaMed

Estado em 15/10/2026: migração aplicada em desenvolvimento e em produção, job do Cloud Run implantado com três adaptadores ativos (Conitec, vacinação, Febrasgo; o Diário Oficial está DESLIGADO por decisão do dono, ver a seção própria), mapa por trecho lido da produção em somente leitura, contador de custo com teto de US$ 5 por mês e job do Cloud Run pronto (sem deploy). Nada foi publicado e nenhum conteúdo do aluno foi tocado; em produção o Radar só grava nas tabelas `radar_*`.

## Decisões do dono (15/10/2026) e como estão no código

1. Migração aprovada, banco de desenvolvimento primeiro, produção depois. O banco de desenvolvimento do projeto é o PGlite do servidor (`.data/dev-db`, mesmas migrações do Supabase). A migração saiu de `supabase/propostas` e está em `supabase/migrations/20261003010100_radar_evidencias.sql` (a última existente era a 9997; nenhuma worktree usa número maior). Entra sozinha no dev-db de quem rodar o servidor depois do merge.
2. "Revalidar" só AVISA (opção A). O item continua visível ao aluno e entra na fila de revisão; nunca bloqueia publicação nem altera gabarito, aula, questão ou atualização (a ação do banco só aceita o valor `revalidar`, e a migração não toca em nenhuma tabela de conteúdo). O Radar dá GRAVIDADE a cada evento: **grave** = revogação da fonte ou mudança de conduta; **leve** = redação, numeração, moldura, proposta em consulta pública, evidência complementar de sociedade. Só as graves vão para o dono (`precisa_decisao_dono`).
3. Fila resolvida por 2 agentes revisores (skill revisor-medico) em até 48 h: cada evento nasce com `prazo_revisao_ate = agora + 48 h`. Os revisores (perfil editor) resolvem os leves; uma grave só pode ser encerrada pelo administrador (dono), os revisores dão parecer (`em_revisao`). Funções: `app_admin_radar_fila(só_graves)` e `app_admin_radar_decidir(evento, status, nota)`.
4. Vigia a cada 3 DIAS, Gemini (`VERTEX_API_KEY`, modelo `gemini-3.8-flash`, testado) SÓ quando há mudança com texto para explicar, e teto de US$ 5 por mês no código (`scripts/radar/custo.mjs`): o total do mês é persistido; ao atingir, a IA para e a mudança é só registrada (`ia_pulada: teto_mensal`). O teto do ambiente (`RADAR_TETO_USD`) só pode DIMINUIR o limite. Preço de tabela: US$ 0,75/3,75 por milhão de tokens até 31/12/2026 e 1,50/7,50 depois (mesma tabela de `server/ai/prices.ts`). A chave nunca é impressa nem gravada; 429 e 503 do Google têm espera e nova tentativa.
5. Mapa por trecho lido da produção em SOMENTE LEITURA (ver abaixo).
6. Adaptadores: Conitec, calendário de vacinação e Febrasgo ativos. O Diário Oficial foi implementado mas DESLIGADO em 15/10/2026 (ver "Diário Oficial desligado").

## O que o radar faz

1. Vigia fontes oficiais: PDF da biblioteca local, URL oficial e, agora, os quatro adaptadores (sites que publicam documentos novos).
2. Detecta mudança por hash, e quando os bytes mudam mas o texto é igual, trata como só metadados (não revalida nada).
3. Mostra EXATAMENTE o que mudou: diff por frase, com página antiga e página nova e o menor trecho alterado.
4. Classifica a referência: `vigente | proposta | revogada | evidencia_complementar | desconhecido`, mais `proibida_samu`. Recomendação de sociedade ou OMS, mesmo recente, nunca vira "norma do SUS" (`norma_sus = false`; vale também para a Febrasgo).
5. Dá gravidade (grave/leve) e acha as questões, aulas e atualizações que usam a fonte, marcadas `revalidar` (aviso).
6. A IA só lê o diff e explica em português simples; toda análise sai com `precisa_revisao_medica = true` (constraint no banco).

Regras fixas: gabarito do Inep nunca muda; versão histórica só serve para explicar a prova; protocolos do SAMU são fonte proibida (`uso_permitido = nenhum`, fora das comparações e das consultas); o aluno nunca vê fonte ou código.

## Arquitetura

```
scripts/radar/
  lib.mjs          lógica determinística (hash, diff, classificação, gravidade, linha de base, mapa por tema)  SEM rede, SEM IA
  adaptadores/     http.mjs (cliente educado) conitec.mjs dou.mjs vacinacao.mjs febrasgo.mjs pdf.mjs index.mjs
  nucleo.mjs       adaptadores -> diferença contra a base -> gravidade -> temas afetados -> IA (se houver texto e orçamento)
  custo.mjs        contador de custo e teto mensal (arquivo, memória ou tabela radar_custo_mensal)
  ia.mjs           prompt, chamada ao Gemini (com espera em 429) e análise com teto
  estado.mjs       linha de base dos adaptadores (arquivo local ou tabela radar_itens_vistos)
  mapa-trechos.mjs mapa por trecho, leitura SOMENTE LEITURA da produção
  vigia.mjs        ensaio local completo (biblioteca + adaptadores + relatório em Markdown e JSON)
  job.mjs          o job do Cloud Run (a cada 3 dias)
  aplicar-dev.ts   aplica a migração no banco de desenvolvimento e prova que nada existente mudou
cloudrun/radar-vigia/{Dockerfile,cloudbuild.yaml}   scripts/cloudrun/deploy-radar-vigia.sh
```

## Adaptadores

Todos usam o mesmo cliente (`adaptadores/http.mjs`): user-agent identificado (`StaziaMed-Radar/0.2 ... contato@staziamed.com.br`), pausa de 1,5 s entre pedidos, `robots.txt` consultado por site (cache), tempo limite, nenhum erro lançado (falha de site vira `erros` do adaptador e o vigia segue). Cada item sai normalizado: `{adaptador, fonte, chave, titulo, versao, data, url, hash, tipo[, texto]}`. Leitura incompleta nunca vira linha de base e uma enxurrada de itens novos de uma vez (base incompleta ou site reorganizado) é aceita como nova base sem gerar eventos.

| Adaptador | Como lê | Observações do ensaio real |
|---|---|---|
| Conitec | sitemap oficial (3 arquivos `.gz`, com data de modificação de cada arquivo) filtrado em `/midias/relatorios/` (relatórios e portarias de decisão de incorporação), `/midias/consultas/relatorios/` (relatórios preliminares: proposta) e `/midias/protocolos/` (PCDT) | cerca de 4.700 documentos; título vem do endereço (o sitemap não traz título); `robots.txt` da Conitec bloqueia só `/search` e `/login`; sitemap cortado vira erro, nunca "vazio" |
| Diário Oficial da União | pergunta ao `robots.txt` da Imprensa Nacional; **in.gov.br proíbe robôs (`Disallow: /`)**, então o Radar NÃO faz nenhum pedido ali e registra o bloqueio no relatório. Canal permitido: notícias do Ministério da Saúde (gov.br/saude) sobre atos publicados, filtradas por termos de saúde relevantes (portaria, protocolo clínico, diretriz, incorporação, calendário, revogação...) | canal fraco por natureza (título de notícia, sem texto do ato). As portarias de decisão da Conitec já entram pelo adaptador da Conitec. Caminho oficial e completo para o DOU: INLABS (XML diário da Imprensa Nacional, exige cadastro do dono). Ver pendências |
| Calendário de vacinação | páginas e arquivos do calendário nacional e do calendário técnico (comparados pelo TEXTO por página), listas de legislação e de notas técnicas/informativas do PNI do ano e do ano anterior (documento novo = item novo) e a Instrução Normativa do calendário | o calendário técnico por faixa etária é um **PDF** (descoberto no ensaio): lido com PyMuPDF por página; sem Python ou sem camada de texto, cai no hash do arquivo e avisa |
| Febrasgo | API pública `wp-json/wp/v2`: tipos `fps`, `diretriz`, `protocolo-assistenci` e a biblioteca de mídia de PDFs (`media`) | "mediateca" não existe como tipo na API (404); a mediateca do site é a biblioteca de mídia do WordPress (1.774 PDFs; o vigia olha as 3 páginas mais recentes). Sempre `evidencia_complementar`, `norma_sus = false` |

## Diário Oficial desligado (decisão do dono, 15/10/2026)

O adaptador `adaptadores/dou.mjs` continua no código e testado, mas não roda: a lista `ATIVOS` em `adaptadores/index.mjs` é `conitec, vacinacao, febrasgo`, e o job do Cloud Run tem 3 tarefas (`CLOUD_RUN_TASK_INDEX` 0 a 2 = esses três, na ordem). Os 2 registros antigos do DOU em `radar_itens_vistos` ficam. Motivo: a Imprensa Nacional (in.gov.br) proíbe robôs no `robots.txt` e o canal alternativo (notícias do Ministério da Saúde) é fraco.

Como religar no futuro com o INLABS:
1. O dono se cadastra no INLABS (inlabs.in.gov.br), que entrega o XML diário do DOU por login autorizado.
2. Trocar o canal do `dou.mjs` por um leitor do XML do INLABS (credenciais em novos segredos `INLABS_EMAIL` e `INLABS_SENHA` no Secret Manager), filtrando seção 1 e 2 por órgão Ministério da Saúde/Anvisa/Conitec e pelos termos de `TERMOS_RELEVANTES`.
3. Acrescentar `"dou"` a `ATIVOS` e rodar `PROJECT=staziamed-revalida-prod scripts/cloudrun/deploy-radar-vigia.sh` depois de mudar `--tasks` e `--parallelism` do script para 4.
4. A primeira rodada com o DOU só grava a linha de base.

## Gravidade

`classificarGravidade` (em `lib.mjs`, testada):
- **grave**: fonte revogada, retirada, incorporação negada/excluída; diferença de negação ou de número com unidade clínica (mg, ml, dose, meses, anos, %, ...) em par de frases parecido; página/arquivo do calendário com par parecido de números diferentes; arquivo do calendário que mudou sem texto comparável (revisar à mão); Instrução Normativa do calendário que mudou; PCDT ou decisão de incorporação nova/alterada que toca tema do app; norma nova (portaria, protocolo, diretriz, calendário...) que toca tema do app.
- **leve**: redação, numeração de artigo/§/quadro/figura, moldura de página, relatório preliminar em consulta pública, evidência complementar de sociedade (Febrasgo), itens sem tema do app.
- Tema do app = palavra-chave do dossiê dos 100 Grandes Temas no título (palavra curta exige palavra inteira). É heurística conservadora: na dúvida entre grave e leve, a revisão dos 2 agentes decide; o dono só vê as graves.

## Mapa por trecho (somente leitura da produção)

`mapa-trechos.mjs` lê da produção, só com GET na API REST do Supabase (o leitor não tem nenhum outro método; teste confere o código e os pedidos): `ch_gt_fontes`, `ch_sources`, `question_source_links`, `questions` (só id e status), `guideline_updates`, `lessons`. Em SQL puro seria `BEGIN READ ONLY; ... ROLLBACK;`; o ambiente não tem driver Postgres instalado (e a regra é não instalar), e GET da API é equivalente e não escreve.
- Nível **trecho**: `question_source_links` (questão -> fonte -> página, seção e citação; só vínculo não "nao_confirmada", referência vigente, questão não anulada nem recolhida). A questão só é afetada se a página dela está entre as páginas que o diff mostrou mudadas (ou se o vínculo não tem página).
- Nível **tema**: fallback pelos Grandes Temas (dossiês + `ch_gt_fontes`), como antes.
- Atualizações (`guideline_updates.source_url`) e aulas (`lessons.guideline_url`) entram quando o endereço da fonte coincide.
- Estado real em 15/10/2026: `question_source_links` tem **0 linhas** em produção, então hoje 100% dos 3.917 vínculos de questão são por tema (nada de trecho ainda); 22 atualizações e 519 vínculos de aula (aulas por tema + 0 `lessons` com `guideline_url`). O código já usa o trecho automaticamente quando o pipeline "fontes vinculadas" (9900) começar a gravar vínculos. Uso: `node scripts/radar/vigia.mjs --mapa-producao`.

## Migração (aplicada em desenvolvimento)

Cria `radar_fontes`, `radar_eventos` (com `gravidade`, `motivo_gravidade`, `prazo_revisao_ate`, `precisa_decisao_dono`), `radar_afetados` (com `nivel`, `paginas`, `citacao`), `radar_itens_vistos` (linha de base dos adaptadores), `radar_custo_mensal`, `radar_rodadas`; e as funções `radar_registrar_evento` (só chave de serviço; repetir a rodada não duplica o evento), `radar_custo_somar` (só chave de serviço), `app_admin_radar_pendencias`, `app_admin_radar_fila`, `app_admin_radar_decidir` (equipe). RLS só equipe; aluno e anônimo nunca leem nem escrevem.

Ensaio no banco de desenvolvimento (`scripts/radar/aplicar-dev.ts`): sobe as 144 migrações existentes, tira uma fotografia do esquema (2.008 colunas, 969 funções, 175 políticas, 353 índices, 2.434 restrições, 108 gatilhos, 4.519 permissões, 176 tabelas com RLS), aplica a do Radar DUAS vezes (pode ser colada de novo), fotografa de novo e compara: **nada existente mudou**. Também prova: prazo de 48 h; grave precisa do dono; aluno e anônimo barrados; revisor encerra leve, mas não grave (o administrador encerra); evento repetido não duplica; análise de IA sem revisão médica é barrada pela constraint; SAMU com uso de conduta é barrado; a contagem de `questions` não é tocada. Relatório: `/Volumes/StaziaMed/.tmp-aulas/radar/migracao-ensaio.json`.

Aplicação em produção (quando o dono mandar): colar o arquivo `supabase/migrations/20261003010100_radar_evidencias.sql` no SQL Editor do Supabase de produção (entrego pela área de transferência) e conferir de fora que as tabelas `radar_*` existem. Dependências já conferidas em produção: `ch_sources` e `ch_vigilance_items` existem; `radar_*` ainda não existem. Para desfazer, o comentário final do arquivo traz os `drop`.

## Agendamento (a cada 3 dias) e deploy (NÃO feito)

Job do Cloud Run (`stazia-radar-vigia`, 3 tarefas paralelas, uma por adaptador ativo, 2 h de limite cada; a duração de cada adaptador fica em `radar_rodadas.resumo`) no projeto `staziamed-revalida-prod`, no padrão do `stazia-pdf-worker`: `cloudrun/radar-vigia/Dockerfile` (Node 22 + PyMuPDF só para PDFs de calendário, sem pacotes npm), `cloudbuild.yaml` e `scripts/cloudrun/deploy-radar-vigia.sh`. O Cloud Scheduler dispara TODO DIA às 06h (Brasília) e o job pula sozinho se a última rodada terminou há menos de 70 h (tabela `radar_rodadas`), o que dá exatamente "a cada 3 dias" (um cron `*/3` do mês teria intervalos de 1 e 2 dias na virada do mês). Segredos: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `VERTEX_API_KEY` vão do `.env` para o Secret Manager sem aparecer na tela. A primeira rodada só grava a linha de base (nenhum evento). Variáveis: `RADAR_MODELO`, `RADAR_TETO_USD` (só diminui), `RADAR_ENSAIO=1` (lê tudo e não grava), `RADAR_FORCAR=1`, `RADAR_ADAPTADORES`.

Comando para ligar, depois da migração em produção:
```
PROJECT=staziamed-revalida-prod scripts/cloudrun/deploy-radar-vigia.sh
gcloud run jobs execute stazia-radar-vigia --region=southamerica-east1 --project=staziamed-revalida-prod --update-env-vars=RADAR_FORCAR=1 --wait
```
Recomendado: primeiro `RADAR_ENSAIO=1 PROJECT=... scripts/cloudrun/deploy-radar-vigia.sh` e uma execução, para ver o resumo (JSON no log) sem gravar nada. Para pausar: `gcloud scheduler jobs pause stazia-radar-vigia-agenda --location=southamerica-east1 --project=staziamed-revalida-prod`.

## Como rodar localmente

```
TMPDIR=/Volumes/StaziaMed/.tmp-aulas node scripts/radar/vigia.mjs \
  --max-remoto 25 --max-pares 3 --max-ia 3 --pares "pcdt-hepatite-b-2023:pcdt-hepatite-b-2026-preliminar" \
  --adaptadores --mapa-producao --envelhecer-base
```
Opções: `--adaptadores [conitec,dou,vacinacao,febrasgo]`, `--envelhecer-base` (ensaio: grava a base real, cria uma cópia envelhecida artificialmente e lê de novo, para mostrar o que o vigia faz diante de mudanças), `--mapa-producao`, `--teto-usd`, `--sem-rede`, `--sem-ia`, `--sem-hash-local`, `--modelo`, `--biblioteca`, `--saida`, `--env`. Testes: `TMPDIR=/Volumes/StaziaMed/.tmp-aulas bash ../vaga-de-teste.sh npx vitest run src/__tests__/radarEvidencias.test.ts src/__tests__/radarAdaptadores.test.ts --pool=threads --maxWorkers=1` (57 testes; as amostras gravadas dos sites estão em `src/__tests__/fixtures/radar/`).

## Parte determinística da biblioteca (lib.mjs, testada desde o MVP)

- `sha256Hex`, `normalizar`, `esqueleto`: comparação sem acento, caixa ou pontuação.
- `compararVersoes`: pareia frases (igual exato, depois melhor semelhança por termos raros), classifica cada par e devolve `{resumo, itens}` com página de cada lado. Números em algarismo e por extenso contam (seis x nove meses); numeração de parágrafo no começo da frase não conta; negação só vale em frase curta e parecida.
- `classificarReferencia`, `esferaDaFonte`, `ehFonteProibida`: regras conservadoras; na dúvida, `desconhecido`.
- `familiasDeVersoes`, `duplicatasExatas`, `decidirMudanca`, `textoDeHtml`, `decodificarBytes`, `montarMapaUsos`/`itensAfetados`.

## Resultado do ensaio completo de 15/10/2026

Relatório completo (o que mudou nas fontes, gravidade, itens afetados por trecho, custo): `/Volumes/StaziaMed/.tmp-aulas/radar/20261015-1622/relatorio.md` e `.json`. Rodada com `--adaptadores --envelhecer-base --mapa-producao`.
- Biblioteca: 578 documentos classificados (266 vigentes, 186 evidência complementar, 79 desconhecidos, 30 revogados/históricos, 12 propostas, 5 SAMU proibidos); 342 de 342 PDFs locais iguais ao catálogo; 8 grupos de duplicatas exatas.
- Internet (25 URLs oficiais): 19 iguais, 4 com texto diferente (Rede Alyne PRT 5350/2024, PNAB PRT 2436/2017, PRC 2/2017 e PNAISP PRT 482/2014; as três primeiras com diferença de número com unidade clínica ou negação = graves para triagem, a quarta leve), 2 falhas de certificado TLS (Inep).
- Versões dentro da biblioteca: PCDT hepatite B 2023 x proposta 2026 (grave; a IA aponta possível omissão da dose de entecavir para Child B/C, p. 29 antiga x p. 36 nova, a conferir); AVC isquêmico agudo 2022 x 2023 (grave; a IA aponta contraindicação nova na p. 26 e reclassificação da certeza da evidência); hepatite B 2023 x edição "livro" 2023 (marcado grave pelas regras, mas a IA, com certeza alta, só viu redação: o relatório avisa para rebaixar, é o tipo de falso grave que a revisão dos 2 agentes resolve).
- Adaptadores com base envelhecida artificialmente (4 itens mais novos removidos da base, 3 alterados): Conitec 4.742 lidos, 7 eventos (todos leves: portarias de decisão sem tema do app, relatórios preliminares); DOU 2 itens relevantes no canal permitido (in.gov.br bloqueado por robots.txt), 1 evento leve; vacinação 79 itens, 7 eventos (os calendários técnicos por faixa etária viraram PDF lido por página: "idoso" e "gestante", com número alterado na base antiga, saíram GRAVES com o trecho exato; os "novos" são artefato da simulação); Febrasgo 709 itens (fps 81, diretriz 7, protocolo assistencial 322, mediateca/PDF 299), 7 eventos, todos leves (evidência complementar, não é norma do SUS).
- Mapa: modo trecho com leitura somente leitura da produção (5 GETs): 254 fontes, 3.917 vínculos de questão (0 por trecho, 3.917 só por tema, porque `question_source_links` está vazia em produção), 22 vínculos de atualização, 519 de aula.
- Custo do Gemini (`gemini-3.8-flash`, preço de tabela): cerca de US$ 0,009 por rodada completa, 5 chamadas; as cinco rodadas de ensaio e teste somaram cerca de US$ 0,05 (24 chamadas registradas no contador, mais as primeiras 6 de uma rodada anterior), contra o teto de US$ 5 por mês.
- Achados reais do ensaio (já corrigidos): o calendário técnico é PDF (não HTML); um sitemap lido pela metade gerava 1.128 "novos" na rodada seguinte (agora: sitemap cortado vira erro, leitura parcial sem base não vira base, enxurrada de novos é aceita como nova base sem eventos); URLs de pasta e atalhos repetidos entravam como documento.

## Limites conhecidos

- O diff é lexical: reescrita grande, PDFs com tabelas coladas e diferença de diagramação geram ruído; por isso o relatório diz `certeza` e a IA pode responder "nenhuma recomendação clara". Comparar documentos distintos de títulos parecidos não é diff de versão (o script sinaliza pela porcentagem de trechos em comum).
- PDFs sem camada de texto não são lidos (sem OCR): o Radar sinaliza e compara pelo hash do arquivo. 1.432 páginas da biblioteca vieram de OCR de baixa confiança.
- A gravidade é heurística (ver acima): serve para ordenar e para decidir o que vai ao dono, não para decidir conduta.
- Documento NOVO nos adaptadores é avisado pelos metadados (título, data, endereço); o Radar ainda não baixa e lê o texto do documento novo para a IA resumir (próximo passo natural).
- O DOU completo depende do INLABS (cadastro) ou de autorização expressa da Imprensa Nacional; o canal de notícias do MS é complementar.
- O job do Cloud Run não compara PDFs da biblioteca local (578 documentos, que vivem no SSD do Mac); essa parte continua no ensaio local (`vigia.mjs`). O job cuida dos quatro adaptadores.
- Classificação por regras sobre o catálogo; 79 fontes ficam `desconhecido` até alguém conferir.

## O que falta para ligar em produção

1. Dono manda colar a migração no Supabase de produção (eu entrego o SQL pela área de transferência) e eu confiro de fora que entrou inteira.
2. Rodar o deploy do job (comando acima), primeiro em modo ensaio, depois normal; a primeira rodada só cria a linha de base.
3. (Futuro) Religar o DOU com o INLABS, ver "Diário Oficial desligado".
4. Ligar na Administração a tela da fila (usa `app_admin_radar_fila` e `app_admin_radar_decidir`) e escolher os 2 agentes revisores e quem recebe o aviso das graves. Hoje a fila existe no banco e no relatório; a tela ainda não foi construída.
5. Conferir na fatura do Google Cloud o custo real da IA (o contador usa preço de tabela) depois do primeiro mês.

## Fila do Radar e aviso ao dono (15/10/2026, parte 2) — PROPOSTA, nada aplicado em produção

### O que o app já tinha (auditoria)
- Não existe central de avisos nem sino no app novo (`/novo`). O único "sino" é o do app antigo (`src/components/layout/Header.tsx`), alimentado por atualizações de diretrizes locais; `notificationService.ts` só faz notificação do navegador e som para convites de dupla.
- Avisos ao usuário que existem: faixa `app_announcement` no Início (texto e tom definidos pela equipe), contador de Flashcards no menu e a Fila de vigilância da Central de Conteúdo (`ch_vigilance_items`, para onde o Radar já manda cada evento).
- E-mail transacional: não há. Só o Supabase Auth manda e-mail (recuperação e confirmação) e o SMTP próprio está pendente. Nenhum serviço novo foi montado.

### O que foi feito
1. Aba **Fila do Radar** na Administração (`src/novo/app/admin/radar/`; só administrador; entrada única em `AdminScreen.jsx`). Filtros: Aguardam você (padrão), Graves, Leves, Pendentes, Decididos, Todas. Cada evento mostra fonte (nome oficial), antes/depois com página, gravidade e motivo, classificação da fonte, quem usa (por trecho e por tema, com links internos para Questões, Aulas e Atualizações), prazo de 48 h, parecer dos revisores (campo para colar) e a decisão do dono (Sem impacto, Ajustar texto, Refazer, Encaminhar à revisão, e Concluir depois) com nota obrigatória. A decisão só registra: nenhuma questão, aula, atualização ou gabarito é alterado.
2. **Aviso no app** (não precisa de nada além da migração): número de graves que esperam o dono na própria aba, no item "Administração" do menu (lateral e "Mais" do celular) e uma faixa vermelha no Início do administrador. Só o administrador pergunta ao banco (`useRadarAvisos`); para os outros papéis nem há chamada, e o banco devolve zero.
3. **Aviso por e-mail: gancho pronto, envio NÃO montado.** O gatilho `radar_aviso_grave` enfileira em `radar_avisos` um aviso por administrador e por evento grave (assunto e corpo em português). Quando houver canal de e-mail, um processo com a chave de serviço lê `radar_avisos where status = 'pendente'`, envia e marca `enviado` ou `erro`. O endereço do dono é lido de `auth.users` na hora do envio.
4. Migração proposta: `supabase/migrations/20261003010200_radar_fila_e_avisos.sql` (colunas `decisao_dono` e `parecer_*` em `radar_eventos`, tabela `radar_avisos`, gatilho e funções `app_admin_radar_fila_detalhada`, `app_admin_radar_avisos`, `app_admin_radar_parecer`, `app_admin_radar_acao`; esta última chama `app_admin_radar_decidir`). Só acrescenta; pode ser colada de novo; o final traz o desfazer.
5. Regra de quem decide: o revisor (editor) pode registrar parecer e encaminhar uma grave à revisão, mas isso NÃO a tira da lista do dono; só a decisão do administrador tira. Revisor resolve leves.

### Ensaio e testes
- `scripts/radar/ensaio-fila-avisos.ts` (banco de desenvolvimento PGlite, apagado no fim): aplica a migração duas vezes e prova que nada existente mudou; só grave gera aviso; leve não; repetir a rodada não duplica; aluno e anônimo barrados (funções e tabela); revisor lê zero em `radar_avisos`; ninguém escreve direto; nota obrigatória; `questions` intacta. Relatório: `/Volumes/StaziaMed/.tmp-aulas/radar/fila-avisos-ensaio.json`.
- `src/__tests__/radarFilaTela.test.tsx` (15 testes): filtros, tela vazia, decisão com nota, parecer, aba só do administrador, aluno sem chamada nem faixa, texto da migração. `adminAbasVisiveis` passou de 14 para 15 abas.
- Capturas (claro/escuro, desktop/celular, vazio, faixa do Início): `/Volumes/StaziaMed/.tmp-aulas/radar-fila/`. Prévia com dados simulados e sem login: `npx vite --config scripts/radar/previa/vite.config.mjs --port 31938 --host 127.0.0.1` e abrir `/scripts/radar/previa/index.html?cenario=cheio|vazio|sem-graves&tema=claro|escuro&rota=admin&aba=radar|home&papel=admin|editor|aluno`.

### Para ligar
1. Colar a migração 20261003010200 no SQL Editor de produção (depois da 010100). Sem ela, a aba mostra o erro em português e não aparece número nem faixa.
2. Publicar o site. Cloud Run não muda.
3. Decisão do dono: canal do e-mail (SMTP do Supabase quando sair, ou outro) para esvaziar `radar_avisos`.
