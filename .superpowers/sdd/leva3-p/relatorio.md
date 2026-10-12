# Leva 3, frente P (aba Podcasts): P07 e P08

Ramo `leva3-p`, partida `c2a354a`. Nada foi empurrado (sem `git push`), nada foi colado em Supabase, GCP ou Vercel reais, sem rede.
Nenhum "No space left on device".

## 1. Em palavras simples

**P07, quem aprova o roteiro.** Antes qualquer pessoa da equipe aprovava (até quem gerou o roteiro), bastava escrever 10 letras de nota.
Agora só aprova o **administrador** ou o **revisor médico da área do episódio** (a mesma regra que as Aulas já usam para liberar o áudio, migração 9580).
Editor comum, revisor de outra área, aluno e visitante são barrados **pelo banco**. Na tela, o botão "Aprovar roteiro" e o campo da nota ficam desligados
e aparece um aviso em português dizendo por quê ("Só o administrador ou o revisor médico da área Pediatria aprova o roteiro. Peça a um deles para conferir e aprovar.").
A recusa de roteiro que cita fonte complementar (da 9620) continua igualzinha.

**P08, áudios antigos esquecidos.** Antes, ao editar o roteiro, gerar outro ou tirar uma fonte, o banco soltava o vínculo mas o MP3 antigo ficava guardado.
Agora, **por evento**, o arquivo que ficou sem uso é apagado do depósito logo depois, **só se nenhuma linha do banco ainda o usa**.
Não existe varredura: os arquivos que já estão esquecidos hoje **não são tocados**; para eles há só uma **lista de leitura** (seção 5).

## 2. O que mudou (arquivos)

Migrações (no seu intervalo 9720 a 9729):
- `supabase/migrations/20261003009720_podcasts_aprovacao_revisor.sql` (P07)
- `supabase/migrations/20261003009721_podcasts_arquivos_esquecidos.sql` (P08)

Rotina de leitura (não é migração): `supabase/rotinas/lista-podcasts-arquivos-esquecidos.sql`.

Servidor e telas:
- `server/podcasts/router.ts`: função `releaseFiles` (apaga o que o banco liberou; nunca lança erro), chamada ao tirar fonte, apagar episódio, gerar roteiro e juntar o áudio; rota nova `POST /api/podcasts/:id/files/cleanup`. O apagamento direto antigo (áudio anterior no fim do áudio, arquivo da fonte, arquivos do episódio) agora passa pela conferência do banco.
- `src/novo/app/admin/AdminPodcasts.jsx`: pergunta ao banco se a pessoa pode aprovar; botão e nota desligados com o motivo; texto da faixa e do passo do áudio ("depois que o administrador ou o revisor médico da área aprovar"); depois de salvar a edição do roteiro avisa o servidor para limpar o áudio antigo.
- `src/novo/app/podcasts/podcastsApi.js`: `cleanupPodcastFiles`.
- `src/novo/app/admin/auditLog.js`: nome em português da ação nova do Registro: **"Arquivos antigos do podcast apagados do depósito"** (`podcast.files.cleanup`) e o resumo ("1 áudio antigo apagado · Arquivos: audio-xxxx.mp3", com falhas se houver).
- `docs/architecture/PODCASTS.md`: papéis e arquivos esquecidos.

Testes novos ou ajustados:
- novo `src/__tests__/podcastsRevisorBanco.test.ts` (9 testes), novo `src/__tests__/podcastsArquivos.test.ts` (13 testes);
- ajustados: `podcasts.test.ts` (o editor do teste vira também revisor da área do episódio), `podcastsTelas.test.tsx` (+1 teste e o texto novo), `registroAdministracao.test.ts` (+1 teste), `fontesComplementaresOrdem.test.ts` (a lista de migrações "antes da 9620" também deixa de fora as 9720 a 9729, como já fazia com a 9621).

Commits: `3ff4abc` (P07), `d2126eb` (P08) e o commit final desta entrega (relatório, documentação e script de conferência).

## 3. Passo de colagem no Supabase (à mão, nesta ordem)

Pré-requisito: a produção já com a 9620 e a 9621 coladas (e, antes delas, a 9630 e a 9610, como já combinado).
1. Colar `20261003009720_podcasts_aprovacao_revisor.sql` inteira. Se a 9620 não estiver colada, a própria migração para na primeira linha com a mensagem "Cole antes a migração 20261003009620".
2. Colar `20261003009721_podcasts_arquivos_esquecidos.sql` inteira (mesma proteção para a retenção `ch_file_holds`).
3. Só depois publicar o site (o site novo funciona mesmo antes da 9720: se o banco ainda não tem a pergunta de "posso aprovar", o botão fica ligado e o banco decide; a limpeza de arquivos só começa depois da 9721).

Ambas são idempotentes (`create or replace`, `if not exists`, gatilhos refeitos com `drop trigger if exists`). Não mudam nem apagam nenhum dado existente.
Se a 9620 for colada **de novo** depois da 9720, a regra do revisor **continua** (ela mora na função interna `ch_raw_app_admin_podcast_approve`, que a 9620 não redefine); testado.

Conferência no estado de produção simulado (base 23d53c1 + partes 1 a 7 do pacote + 9630 + 9610 + 9620 + 9621; script em `.superpowers/sdd/leva3-p/verificar-producao.mjs`, método do relatório da integração das fontes):
- 9720 e 9721 coladas duas vezes cada, sem erro; a terceira colagem não muda nenhuma função (nem permissão);
- 9 funções novas, **1 função existente muda**: `ch_raw_app_admin_podcast_approve(uuid,text)`, e a diferença é **uma única linha** (`perform public.ch_podcast_approver_check(p_id);`); o invólucro `app_admin_podcast_approve` da 9620 (com a recusa de fonte complementar) fica **idêntico**; nenhuma função sumiu;
- permissões: nenhuma função nova chamável por visitante; só `app_admin_podcast_approval` chamável por login; as internas e as `ch_worker_*` fechadas;
- fumaça: editor barrado, revisora de Pediatria aprova, pergunta da tela responde certo, aluno barrado, áudio invalidado entra na fila.

## 4. Escolhas de desenho (onde o dono não decidiu, adotei a recomendada)

P07
1. **Revisor "da área"** = o mesmo cadastro das Atualizações e das Aulas (`ch_reviewer_areas`, com a tradução de área `guideline_area_code`). Não inventei papel novo.
2. **Episódio sem grande área: só o administrador aprova.** A mensagem explica: escolher a área no passo 1 ou pedir ao administrador.
3. **Revisor precisa também ser equipe (editor ou administrador) para abrir a aba Podcasts**, exatamente como nas Aulas (a 9580 também começa com `assert_staff`). Um revisor puro (sem papel de editor) é barrado com "Acesso restrito à equipe". Decisão do dono se quiser abrir a aba a revisores puros (muda a regra de acesso da aba toda, fora do escopo).
4. **Quem gerou o roteiro pode aprová-lo se for revisor da área** (o dono pediu "revisor médico da área ou administrador", sem exigir segunda pessoa).
5. **Reaprovar um roteiro já aprovado segue a mesma regra** (um editor não substitui a aprovação de um revisor). Editar o roteiro continua tirando a aprovação.
6. A regra mora na **função interna** da aprovação e não no invólucro da 9620, para a 9620 colada de novo não desfazê-la. A ordem das checagens fica: equipe, citação de fonte complementar (invólucro 9620), permissão de aprovar, estado, nota. Quem não pode aprovar e tenta com roteiro que cita apostila vê primeiro o aviso da apostila (não vaza nada, é equipe).
7. A tela pergunta ao banco (`app_admin_podcast_approval`) em vez de calcular sozinha: o texto do motivo é o mesmo da recusa do banco.

P08
1. **Por evento, por fila.** Gatilhos do banco anotam o caminho em `podcast_files_released` quando: o áudio do episódio é limpo (editar roteiro, roteiro novo, fonte tirada) ou trocado (áudio refeito), o episódio é apagado, uma fonte com arquivo é apagada. Gatilho em vez de reescrever 5 funções: pega qualquer caminho, inclusive o que a tela faz direto no banco (editar o roteiro não passa pelo servidor), sem copiar função de versão antiga.
2. O servidor apaga **logo depois** do evento (tirar fonte, apagar episódio, gerar roteiro, juntar áudio) e, no caso de **editar o roteiro** (feito direto no banco), a tela avisa o servidor logo em seguida (`/files/cleanup`). Se esse aviso se perder, o arquivo fica "pendente" e sai no próximo evento do mesmo episódio.
3. **Só apaga se nenhuma linha do banco usa o caminho**: outro episódio (`podcasts.audio_path`), outra fonte (inclusive duas fontes do mesmo episódio com o mesmo arquivo: o mesmo PDF enviado duas vezes cai no mesmo nome), material de aula (`lesson_materials`) e retenção `ch_file_holds`. O que ainda é usado vira "mantido" e não é apagado (e se a última fonte que o usa for tirada depois, um novo evento o enfileira de novo e ele sai). Isso também corrige um defeito antigo: tirar uma de duas fontes com o mesmo arquivo apagava o arquivo da que ficou.
4. **Cinto de segurança**: só são apagados caminhos no formato `podcasts/<id do episódio>/<arquivo>` (sem `..`). Qualquer outro vira "mantido".
5. **Falha ao apagar não desfaz nada**: a operação principal já terminou; a linha fica "pendente" com o erro (`last_error`) e `attempts`, e é tentada no próximo evento do episódio. Falha também não vira erro para a pessoa (só linha no log do servidor).
6. **Flashcast copiado para a aula** não é afetado: a cópia é outro arquivo no depósito das aulas; o banco ainda confere `lesson_materials`.
7. **Registro**: cada limpeza que apagou algo grava uma linha `podcast.files.cleanup` (quem, episódio, quantos áudios, quantos arquivos de fonte, nomes dos arquivos, falhas). Aparece no Registro com o título do episódio, também depois de ele ser apagado.
8. Os arquivos **temporários** de um áudio que não terminou (pasta `tmp`) continuam sendo limpos como antes ao terminar; os de um áudio abandonado a meio **não** são apagados por evento (o depósito não permite listar pasta pelo servidor) e aparecem na lista de leitura.

## 5. Lista de áudios esquecidos (rotina só de leitura, para o dono)

Arquivo: `supabase/rotinas/lista-podcasts-arquivos-esquecidos.sql`. É um único `SELECT`: **não apaga, não cria, não muda nada**.
Como usar: abrir o editor SQL do Supabase, colar o conteúdo do arquivo e rodar (pode rodar quantas vezes quiser).
O resultado tem a **primeira linha "RESUMO"** com a conta (por exemplo "7 arquivos esquecidos (84,3 MB no total): 4 de áudio, 1 de fonte, 2 temporários, 0 outros. Nada foi apagado.") e depois **uma linha por arquivo** com o tipo, o **nome completo** (`podcasts/<episódio>/audio-xxxx.mp3`), o tamanho em MB e a data de envio.
Entra na lista o arquivo do depósito `podcasts` que: nenhum episódio tem como áudio, nenhuma fonte tem como arquivo, nenhum material de aula usa e não está retido pela Fonte complementar. As partes temporárias só entram com mais de 1 dia (geração em andamento não é esquecida). O dono olha a lista e decide; apagar é sem volta e nenhuma rotina automática apaga esses arquivos.
Testada em PGlite com um depósito simulado (`storage.objects`): lista só o que deve, ignora o que está em uso, em outro depósito, recente ou retido, e confirma que nada foi apagado.
Observação: não rodei contra o Supabase real (sem acesso); a consulta depende de `storage.objects` (colunas `bucket_id`, `name`, `created_at`, `metadata->>'size'`), que é o formato padrão do Supabase.

## 6. Testes e resultados

Todos pela fila, com `--pool=threads --maxWorkers=2`, nunca a suíte inteira. Em todas as rodadas o número de arquivos relatado bateu com o número de arquivos que existem.
- `podcastsRevisorBanco` 9/9 (P07): visitante, aluno, editor comum, revisora da área, revisora de outra área, revisor que não é equipe e administrador; episódio sem área; reaprovação; recusa por fonte complementar (9620) mantida; nota curta; publicar continua só do administrador; funções internas fechadas; colar 9720 duas vezes e colar a 9620/9621 de novo depois.
- `podcastsArquivos` 13/13 (P08): editar roteiro (mais Registro em português), gerar outro roteiro, refazer áudio, apagar episódio (editor barrado), tirar fonte (arquivo repartido), uso por outro episódio / retenção / material de aula, Flashcast da aula preservado, caminhos fora do formato, falha do depósito (principal não é desfeito, tenta de novo), nenhum arquivo antigo apagado por varredura, permissões (aluno, visitante, funções do banco), lista de esquecidos.
- Ligados: `podcasts` 34/34, `podcastsTelas` 16/16, `registroAdministracao` + `registroAdministracaoBanco`, `fontesComplementaresOrdem` 3/3, `supabaseSchema`, `adminAbasVisiveis` (9 arquivos, 135 testes).
- Também passaram, depois da 9721 (8 arquivos, 226 testes, 4 "esperados falhar" e 1 pulado que já eram assim): `fontesComplementaresBanco`, `fontesComplementaresEquipe`, `fontesComplementaresRodada2Banco`, `fontesComplementaresRodada2Servidor`, `apoioT3Servidor`, `apoioT4Banco`, `apoioVarredura`, `adminContentPanels`.
- Outros 12 arquivos que carregam todas as migrações (`aiCentral`, `arenaSemEquipe`, `assistenteAbasBanco`, `estacoesRevisaoMedica`, `fontesOficiaisBanco`, `gastoDoMesTudo`, `reconferenciaInsuficientes`, `supabaseAnswerKey`, `termoAceiteTutor`, `termoAceiteBanco`, `lessonAssist`, `supabaseLessonsApi`): 304 testes passando.
- `registroAdministracao` confirma que toda ação gravada pelas migrações (inclusive `podcast.files.cleanup`) tem nome em português.
- `npm run build`: ok (uma vez).
- Typecheck (`tsc --noEmit`): **1831 erros, o mesmo número da base; nenhum erro novo** (nenhum em arquivo tocado).

## 7. Riscos e limites (honestos)

- Apagar é sem volta. O que reduz o risco: só por evento, só caminho no formato certo, só se nenhuma linha do banco usa, sem varredura. Resta uma janela minúscula: o mesmo PDF reenviado ao mesmo episódio no mesmo instante em que a última fonte que o usava é tirada (o envio pelo servidor reaproveita o nome do arquivo). Já existia antes, ficou menor.
- Depende de a 9721 estar colada **antes** de o site novo agir: sem ela, as funções `ch_worker_podcast_files_*` não existem, a limpeza falha em silêncio (só linha no log) e nada é apagado; nada quebra.
- Quem edita o roteiro e fecha a aba antes do aviso ao servidor deixa o arquivo "pendente": sai no próximo evento do mesmo episódio. Se ninguém mais mexer naquele episódio, o arquivo continua no depósito; como nenhuma linha do banco o usa, ele aparece na lista de leitura do dono (seção 5).
- Se alguém mudar a **grande área** de um episódio já aprovado, a aprovação antiga continua valendo (foi dada por quem podia na época). Não mexi em `app_admin_save_podcast`.
- O revisor puro (sem papel de editor) continua sem acesso à aba Podcasts (seção 4, P07 item 3).

## 8. O que NÃO foi feito

- **Nenhuma varredura/apagamento dos arquivos já esquecidos.** Só a lista de leitura.
- Arquivos que sobram de **envios que falharam** (PDF enviado e depois recusado por não ter texto) e de **áudios abandonados a meio** não são apagados por evento; aparecem na lista.
- Não rodei a lista contra o Supabase real, nem colei nada lá.
- Não mudei o acesso de revisor puro à aba Podcasts.
- Não mexi na pasta principal, em outros worktrees (só li o relatório e os scripts do `integracao-fontes` e o pacote em Downloads), nem empurrei nada.
