# Relatório - Leva 3, frente A (aba Aulas): A07 e A08

Ramo `leva3-a` (partida c2a354a). Nada foi empurrado, nenhum serviço real foi tocado, nenhuma rede foi usada.
Migrações no meu intervalo: **20261003009710** (A07) e **20261003009711** (A08).
Commits: A07 = `4d26542`; A08 = `f98b7b0`; ajustes finais (teste mais firme e função da 9710 sem depender da 9620 na hora de colar) logo depois.

## O que mudou, em português simples

### A07 - Remover o material apaga também o arquivo do depósito
- Quando a equipe **remove** um material, **troca** o PDF/áudio por outro, **libera** um áudio que substitui o anterior, ou o administrador **apaga a aula**, o arquivo guardado no depósito `lessons` também é apagado.
- **Só apaga se ninguém mais usa o arquivo**: outro material de aula, uma fonte de episódio de podcast, ou a retenção de arquivo da Fonte complementar (`ch_file_holds`). O Flashcast copiado de um podcast tem caminho próprio (cópia), então remover o material da aula não mexe no áudio do episódio.
- **Falha ao apagar não desfaz a remoção**: o material já saiu; o arquivo volta para a fila e é apagado na próxima limpeza (acontece a cada remoção/troca/envio da equipe). A falha vai para o log do servidor.
- **Registro da Administração**: nova ação `lesson.file.delete`, escrita "Arquivo de aula apagado do depósito", com a aula e o caminho apagado (só entra no Registro depois que o servidor confirma que apagou).
- Na tela da equipe: aviso "Ao remover ou trocar um arquivo, o arquivo antigo também é apagado do depósito, sem volta (se nenhum outro material o usa)." e o aviso de apagar aula fala dos arquivos.

Como funciona por dentro (versão depois da rodada de correções): um gatilho em `lesson_materials` anota na fila `lesson_files_pending_delete` o caminho de toda linha que sai (se anotar falhar, a remoção continua valendo). O servidor, como SERVIÇO, chama `ch_worker_lesson_files_reserve()` (confere que ninguém usa o caminho e o marca "apagando"; devolve só o reservado), apaga cada arquivo no depósito e confirma com `ch_worker_lesson_files_done()` (tira da fila e escreve no Registro; só vale para o que foi reservado) ou devolve a reserva com `ch_worker_lesson_files_release()` se o depósito falhou. Enquanto o caminho está reservado, material de aula, fonte de podcast e retenção para ele são recusados. Rotas novas: `DELETE /api/lessons/materials/:id` (equipe), `DELETE /api/lessons/:id` (administrador), `POST /api/lessons/files/sweep` (equipe). Envio de arquivo novo e o Flashcast de podcast também limpam o que foi substituído.

### A08 - XP da conclusão só para quem assistiu a aula até o fim (decisão revisada do dono: era 50%, agora é a aula completa)
- Concluir continua **marcando a aula como feita** (com ou sem assistir). O **XP** só vem quando as duas coisas existem: concluída **e** assistida até o fim, na ordem que acontecer (concluir antes e assistir depois também paga, uma vez só).
- **Definição técnica de "até o fim"** (revisada na rodada de correções): o player avisou o fim do vídeo (evento `ended`) **e** o navegador mediu que o aluno assistiu a aula COMPLETA: soma dos **trechos contínuos** lidos do player (de uma leitura para a próxima, andando, no máximo 3 s para a frente; o que foi pulado ou repetido não conta e trecho visto duas vezes conta uma só). O tempo assistido precisa cobrir a duração da aula (informada pelo player; sem ela, o ponto mais longe a que chegou) com **folga técnica de 3 s** (primeira e última leitura do player; não é regra de negócio). Pular quase tudo (10 → 590 → 590.25 → fim) ou começar perto do fim **não vale**. O banco guarda o fim só se o tempo informado for coerente (ver "Rodada de correções", achado 3).
- Tela do aluno (só aparece com a Arena ligada): **"Para ganhar o XP, assista a aula até o fim."** Variações: "Você assistiu até o fim. Marque a aula como concluída para ganhar o XP.", "Aula concluída. Falta assistir até o fim para ganhar o XP.", e os avisos dos tipos que não medem (abaixo). Sumiu o texto antigo "Concluir a aula vale XP...".
- **Nada retroativo**: a migração não altera nenhuma linha de progresso e não tira XP de ninguém; quem já ganhou o XP antes mantém (o evento já existe e não é pago de novo; testado, inclusive colando a migração de novo).
- Banco: coluna nova `lesson_progress.watched_to_end_at`; função nova `app_lesson_watch(p_id, p_seconds, p_ended, p_duration)` (grava o tempo realmente assistido - só cresce - e o fim, se coerente; devolve o XP pago agora) e `app_lesson_watch_state(p_id)` (só leitura); `gam_process_lesson` redefinida a partir da versão da 8100 (a mais nova) exigindo o fim assistido. `app_lesson_progress` **não mudou** (só grava a conclusão).

#### Tipos de aula e se dá para medir o fim
| Tipo | Mede o fim? | O que acontece |
|---|---|---|
| Arquivo MP4/WebM tocado na página | Sim (eventos do `<video>`) | XP ao assistir até o fim |
| YouTube (embutido) | Sim, pelo aviso do player (mensagens `postMessage`, com `enablejsapi=1`) | XP ao assistir até o fim |
| Vimeo (embutido, inclusive não listado) | Sim, pelo aviso do player (mensagens `postMessage`) | XP ao assistir até o fim |
| **Link `.m3u8` e qualquer outro endereço (abre em outra aba)** | **Não** | Concluir marca como feita, **não dá XP**; a tela avisa |
| **Aula sem vídeo** | **Não** (nada para assistir) | Concluir marca como feita, **não dá XP**; a tela avisa |
| YouTube/Vimeo que não responde (bloqueio do navegador, embed restrito) | Não, depois de 15 s sem nenhum aviso | A tela avisa "Não conseguimos medir... não dá XP" |

**Aviso importante ao dono**: as aulas que hoje valiam XP ao clicar em concluir e que usam link `.m3u8`/outro endereço, ou que estão sem vídeo, **deixam de dar XP**. Se isso for um problema, a saída é colocar o vídeo como YouTube/Vimeo/MP4.

## Escolhas de desenho (onde o dono não decidiu, adotei a opção recomendada)
1. A07 vale também para **trocar o arquivo, liberar áudio e apagar a aula** (o problema original citava os três), não só "remover material".
2. Arquivo com **retenção** (`ch_file_holds`) nunca é apagado; fica na fila até a retenção cair (a retenção cai quando o SHA-256 é gravado ou o arquivo é reenviado).
3. **Sem limpeza retroativa**: arquivos que já ficaram órfãos antes desta migração não estão na fila e não foram tocados (descobrir quais exigiria listar o depósito inteiro; a proposta original dizia "listar antes de apagar"; não foi feito).
4. Quem pode limpar: editor e administrador (como remover material hoje); apagar aula continua só administrador.
5. A08: o fim é medido pelo **evento de fim**, sem tolerância e sem número de negócio. "Maior ponto assistido" ficou só como informação (`seconds_watched`, só cresce).
6. O XP é pago **na ordem que as duas condições se completam** (concluir/assistir); a resposta de `app_lesson_watch` já diz o XP para mostrar o "+20 XP".
7. O estado "já assistiu até o fim" volta quando o aluno reabre a aula (`app_lesson_watch_state`), sem mexer em `lesson_view` (assim não redefini nenhuma função de 9580/9620).
8. A regra descrita no cadastro de regras da Arena (`xp.lesson_completed`: "Aula concluída (quando as aulas forem ligadas)") **não foi reescrita**; o valor continua 20 e continua editável.

## Passo de colagem (Supabase, à mão, nesta ordem, depois da 9620 e da 9621)
1. `supabase/migrations/20261003009710_aulas_apagar_arquivo.sql`
2. `supabase/migrations/20261003009711_aulas_xp_ate_o_fim.sql`
(Ordem de publicação: SQL, depois imagem do Cloud Run, depois o site.)
Colar **antes de publicar o site**. As duas são idempotentes (colar duas vezes não dá erro; uma terceira colagem não muda nenhuma função). Simulação do estado de produção (base 23d53c1 + partes 1-7 do pacote + 9630 + 9610 + 9620 + 9621), script em `.superpowers/sdd/leva3-a/simular-producao.mjs`: colou 2x sem erro (e uma 3a vez sem mudar nenhuma função); **única função existente que muda: `gam_process_lesson()`** (parte da 8100); nenhuma permissão (ACL) de função existente mudou; 8 funções novas; **3 gatilhos novos em tabelas existentes** (`lesson_materials`, `podcast_sources`, `ch_file_holds`: só recusam um caminho reservado para apagar); `lesson_materials_json` continua com `review_status` e `hidden_from_student` (9580/9620 intactas). Janela entre colar o SQL e publicar o site: o site antigo continua funcionando, mas quem concluir aula nessa janela **não ganha XP na hora** (o site antigo não manda o fim); o XP não se perde: vem quando o aluno assistir até o fim no site novo (concluir antes e assistir depois também paga, uma vez só). Janela inversa (site novo + SQL antigo): ver "Rodada de correções", achado 8.
Permissões (nas funções novas): `revoke ... from public, anon` + `grant ... to authenticated`; internas (gatilho, `lesson_file_in_use`) sem acesso para ninguém; tabela da fila com RLS ligado e `revoke all`. Todas `security definer` com `set search_path = ''`. Testado com visitante, aluno, revisora (não da equipe), editor e administrador.

## Arquivos
- Migrações: `supabase/migrations/20261003009710_aulas_apagar_arquivo.sql`, `20261003009711_aulas_xp_ate_o_fim.sql`
- Servidor: `server/lessons/files.ts` (novo), `server/lessons/router.ts`, `server/podcasts/router.ts` (limpa depois do Flashcast)
- Tela: `src/novo/app/study/lessonWatch.js` (novo), `LessonsScreen.jsx`, `lessonsApi.js`, `src/novo/app/admin/AdminLessons.jsx`, `auditLog.js`
- Testes novos: `aulasArquivoApagadoBanco.test.ts`, `aulasArquivoApagadoServidor.test.ts`, `aulasArquivoApagadoTela.test.tsx`, `aulasXpAteOFimBanco.test.ts`, `aulasXpAteOFimTela.test.tsx`
- Testes ajustados (comportamento mudou de propósito): `supabaseLessonsApi.test.ts` (concluir não dá XP; o fim dá), `arenaRegrasConferidas.test.ts` (linha de progresso agora com o fim), `lessonsScreen.test.tsx` (endereço do YouTube com `enablejsapi=1`).

## Testes e resultados
- Lote 1 (12 arquivos, 144 testes): os 5 novos + registroAdministracao + registroAdministracaoBanco + lessonsScreen + adminAulasCorrecoes + aulasAlunoCorrecoes + lessonsRoutes + supabaseLessonsApi: **12/12 passaram, rodado 2x**.
- Lote 2 (10 arquivos, 174 testes): podcasts, podcastsTelas, lessonAssist, arenaRegrasConferidas, fontesComplementaresOrdem, fontesComplementaresRodada2Servidor, fontesComplementaresBanco, fontesComplementaresEquipe, apoioT3Servidor, videoLessonsPrototypeIntegrity: **10/10 passaram**.
- Outros rodados no meio: supabasePlayApi, admConfigEstacoesBanco, arenaSemEquipe passaram.
- `npm run build`: ok. `tsc --noEmit`: **1831 erros, os mesmos da base; nenhum em arquivo tocado por mim**.
- Um teste meu de tempo (15 s sem aviso do player) falhou uma vez sob carga e foi refeito para não depender de relógio; depois passou 2x. Um teste antigo (fontesComplementaresOrdem "(e)") falhou porque minha 9710 usava uma função SQL que consultava `ch_file_holds` ao ser criada; troquei por plpgsql (só consulta quando roda) e passou.

## Riscos e limites (honestos)
- **A medição do YouTube e do Vimeo NÃO foi testada contra os players de verdade** (sem rede aqui). Usei o protocolo de mensagens do player (documentado no Vimeo; no YouTube é o protocolo `listening`/`infoDelivery` do iframe, muito usado, mas não é API oficial documentada em detalhe). Os testes simulam as mensagens. **Antes de contar com isso, o dono deve abrir uma aula de cada tipo (YouTube, Vimeo, MP4), assistir até o fim e ver o "+20 XP"** (depois de concluir). Se o player não responder, o aluno vê o aviso de "não conseguimos medir" e não ganha XP: o risco é de falta de XP, nunca de XP indevido.
- A medição vem do navegador: quem mexer no navegador/chamar `app_lesson_watch` direto consegue declarar tempo e duração coerentes. Para uma recompensa de 20 XP aceitei; não há como provar visualização sem servidor de vídeo.
- O tempo assistido é medido por visita à aula (na mesma abertura da tela): quem assiste metade, sai e volta precisa assistir a aula inteira de novo para o fim valer (decisão do dono pendente: guardar os trechos já vistos entre visitas).
- Dev local (chaves de arquivo pelo conteúdo): reenviar o mesmo arquivo no instante em que a limpeza o apaga é recusado com "tente de novo em instantes" (reserva), nunca fica sem arquivo. No Supabase os nomes são aleatórios.
- Retenção de arquivo órfã (SHA-256 não gravado e material removido) deixa o arquivo na fila (não apaga) até a retenção cair; não ocupa mais o lote da limpeza. Fica visível na tabela `lesson_files_pending_delete` (só pelo SQL).
- O servidor só apaga se tem o depósito com `remove` (Supabase e pasta local têm).

## O que NÃO foi feito
- Limpeza dos arquivos que já estavam órfãos antes (sem registro de quais são).
- Reescrever o texto da regra `xp.lesson_completed` no cadastro da Arena.
- Teste real contra YouTube/Vimeo/HLS; HLS (`.m3u8`) continua abrindo em outra aba, sem medir.
- Medir tempo assistido acumulado ou percentual (a decisão final é o fim do vídeo).

## Rodada de correções da revisão (leva 3, revisão independente de outra empresa, diff c2a354a..HEAD)

Base: 8bd82fb em produção + minhas migrações 9710 e 9711 (ainda não coladas, por isso editadas no lugar; seguem idempotentes). Nada empurrado, nenhum serviço real tocado. A pasta tinha o ramo limpo (nenhuma alteração solta do agente anterior).

| # | Achado | Veredito | O que mudou | Teste |
|---|---|---|---|---|
| 1 | Pular o vídeo ainda dá XP (só o último salto era lembrado) | **Confirmado** (reproduzido: 10 → 590 → 590.25 → fim valia; começar perto do fim valia) | `lessonWatch.js`: o tempo assistido é a soma dos trechos contínuos (união, sem contar o pulado nem o repetido); o fim só vale com a aula coberta (duração do player, ou ponto mais longe) menos 3 s de folga técnica; vale para YouTube, Vimeo e MP4. A tela manda `p_seconds` = tempo realmente assistido e `p_duration` | `aulasXpAteOFimTela` (10→590→590.25→fim, começar perto do fim, rever o mesmo trecho e saltar, retomar de onde parou) e `aulasXpAteOFimRodada2Tela` (na tela) |
| 2 | Arquivo ganha referência entre consultar e apagar | **Confirmado** (reproduzido: o material novo era aceito e ficava apontando para arquivo apagado, sem Registro) | Reserva do caminho no banco (estado `apagando`) ANTES de apagar; gatilhos em `lesson_materials`, `podcast_sources` e `ch_file_holds` recusam (em português) caminho reservado; conferência, reserva e criação rodam sob o mesmo trava por caminho (`pg_advisory_xact_lock`), então a criação simultânea ou é vista pela reserva ou é recusada. Reserva vence em 10 min e não bloqueia ninguém depois | `aulasArquivoApagadoBanco` ("a corrida entre conferir e apagar está fechada": material, troca de caminho, fonte de podcast, retenção, ordem inversa, reserva vencida) e `aulasArquivoApagadoServidor` (reenviar o mesmo arquivo no meio da limpeza é recusado e depois funciona). A corrida de verdade entre duas conexões não é reproduzível em PGlite (uma conexão só): o teste fixa as duas ordens possíveis, e a exclusão mútua é do trava do Postgres |
| 3 | `app_lesson_watch` aceita `p_ended = true` sem tempo | **Confirmado**; limite parcial aceito | O banco só grava o fim com tempo coerente: >= 1 s e, com `p_duration` do player, >= duração - 5 s; sem a duração, metade da duração cadastrada da aula (se houver). "Fim" com 0 s não grava e não paga. **Limite aceito**: tempo e duração vêm do navegador; quem chama a função direto pode informar um par coerente. Para 20 XP o banco não tem como provar visualização (precisaria de servidor de vídeo) | `aulasXpAteOFimBanco` ("o fim só vale com tempo assistido coerente") |
| 4 | Equipe confirma apagamento que não houve | **Confirmado** (reproduzido: `done` direto esvaziava a fila e escrevia no Registro) | Reservar, confirmar e devolver viraram funções de SERVIÇO (`ch_worker_lesson_files_*`, sem acesso para `authenticated`): a equipe não chama direto. Confirmar só vale para caminho reservado. As funções antigas `app_admin_lesson_files_*` somem (`drop function if exists`) | `aulasArquivoApagadoBanco` (achado 4: confirmar sem reserva = 0; ninguém de fora chama) |
| 5 | Falha na confirmação deixa apagamento sem Registro | **Confirmado** | Confirmação com 2 tentativas; se falhar, o caminho continua `apagando` e, vencida a reserva (10 min), a próxima limpeza entrega de novo, apaga (inofensivo) e registra | `aulasArquivoApagadoServidor` (falha 1x: registra; falha 2x: registra na limpeza seguinte) e `aulasArquivoApagadoBanco` (reserva vencida) |
| 6 | 200 retenções antigas prendem a fila | **Confirmado** (reproduzido: devolvia vazio) | Retidos saem do `limit 200` (filtro dentro da consulta); quem voltou a ser usado sai da fila sem limite; o servidor percorre a fila em lotes (até 10 rodadas) | `aulasArquivoApagadoBanco` e `aulasArquivoApagadoServidor` (200 retidos + 450 livres: os 450 saem, os 200 ficam) |
| 7 | Falha ao enviar o fim não é recuperada ao sair | **Confirmado** (leitura do código: o desmontar só mandava `report(false)`) | Fim validado e não confirmado: guardado no aparelho (`localStorage`, por aluno, 30 dias) antes de enviar; reenviado ao sair da aula, ao voltar a ter conexão, com 3 novas tentativas (5 s, 15 s, 45 s) e na próxima vez que abrir as aulas | `aulasXpAteOFimRodada2Tela` (sair da aula com a rede de volta; fechar o app e abrir de novo) |
| 8 | Janelas de publicação | **Parcialmente confirmado; tratado** | *Site novo + SQL antigo*: a tela detecta a ausência das funções (erro de função inexistente) e volta a falar como antes ("Concluir a aula vale XP...", sem prometer XP pelo fim); o fim fica guardado e é reenviado quando o SQL chegar; o servidor detecta a falta das funções da limpeza, não quebra, registra no log "SQL ainda não aplicado" e se comporta como hoje (a remoção vale; o arquivo fica). *SQL novo + site antigo*: o site antigo não manda o fim, então quem conclui nessa janela não ganha XP na hora, mas **não perde**: o XP vem quando assistir até o fim no site novo (pago uma vez); o servidor antigo não limpa arquivos (igual a hoje) e a fila é limpa na primeira ação da equipe depois | `aulasXpAteOFimRodada2Tela` (SQL antigo; reenvio quando o SQL chega) e `aulasArquivoApagadoServidor` (SQL antigo na limpeza e pela rota) |

Limites que dependem do dono (não inventei regra):
- **Aulas já cadastradas com duração errada**: o banco usa a duração que o PLAYER informa; só quando ela falta usa metade da duração cadastrada. Se o dono quiser que o banco exija a duração cadastrada, é decisão dele (risco: aula cadastrada com minutos errados deixaria de dar XP).
- **Assistir em duas visitas**: hoje o tempo assistido vale por visita à aula (precisa assistir a aula inteira numa abertura). Guardar os trechos já vistos entre visitas é possível; precisa da decisão do dono.
- **Servidor que cai no meio da limpeza**: se o servidor cair depois de reservar e antes de apagar, o arquivo fica reservado até 10 minutos e depois é refeito sozinho na próxima ação da equipe.

Testes que passaram nesta rodada (fila, `--pool=threads --maxWorkers=2`):
- Lote 1 (12 arquivos, 145 testes): aulasArquivoApagadoBanco, aulasArquivoApagadoServidor, aulasArquivoApagadoTela, aulasXpAteOFimBanco, aulasXpAteOFimTela, aulasXpAteOFimRodada2Tela (novo), registroAdministracao, registroAdministracaoBanco, lessonsScreen, adminAulasCorrecoes, aulasAlunoCorrecoes, lessonsRoutes.
- Lote 2 (12 arquivos, 243 testes): supabaseLessonsApi, podcasts, podcastsTelas, lessonAssist, arenaRegrasConferidas, fontesComplementaresOrdem, fontesComplementaresRodada2Servidor, fontesComplementaresBanco, fontesComplementaresRodada2Banco, fontesComplementaresEquipe, apoioT3Servidor, videoLessonsPrototypeIntegrity.
- Lote 3 (6 arquivos, 91 testes): supabasePlayApi, arenaSemEquipe, fontesComplementaresServidor, fontesComplementaresTela, fontesComplementaresEquipeTela, conferenciaOutraEmpresa.
- `npm run build`: ok. `tsc --noEmit`: 1831 erros, os mesmos da base; nenhum em arquivo tocado.
- Simulação do estado de produção (`simular-producao.mjs`): colou 2x sem erro e uma 3a vez sem mudar função; única função existente que muda: `gam_process_lesson()`; nenhuma ACL existente mudou; 8 funções novas; fumaça ok (reserva, recusa de caminho reservado, XP).

## 2ª rodada da revisão independente (1 alto + 1 médio)

| # | Achado | Veredito | O que mudou | Teste |
|---|---|---|---|---|
| Alto | A reserva de apagar vale 10 min, o servidor apaga até centenas em sequência sem renovar, sem checar vencimento e sem identificar QUAL reserva confirma/devolve | **Confirmado** (leitura do código: `done`/`release` agiam só pelo caminho; nada renovava) | (1) Cada reserva ganha um código (uuid) devolvido ao servidor; confirmar e devolver exigem o código e só agem na reserva vigente daquele caminho (reservar de novo uma vencida troca o código). (2) Antes de CADA exclusão no depósito o servidor chama `ch_worker_lesson_files_renew(caminho, código)`: sob o trava do caminho o banco confere de novo que ninguém passou a usar o arquivo, que o código é o vigente e que o prazo NÃO venceu, e renova por mais 10 min; (3) sem o "sim" o servidor PULA o arquivo (reserva vencida nunca permite apagar; arquivo que voltou a ser usado sai da fila); (4) as quatro funções só existem para o serviço (`revoke` de public/anon/authenticated + `grant` ao service_role). Lotes de 50 (até 40 rodadas = 2000 arquivos por limpeza). | `aulasArquivoApagadoBanco` (código por reserva; código errado/antigo não confirma nem devolve nem registra; limpeza antiga não age sobre a reserva nova; renovar vigente/vencida/sem reserva/em uso/retenção; reserva renovada continua recusando referência; permissões e ACL do service_role) e `aulasArquivoApagadoServidor` (reserva vence no meio do lote: pula e depois retoma com código novo; arquivo que ganhou uso não é apagado; banco mudo na renovação: não apaga e devolve; falha do depósito não mexe em reserva refeita por outra limpeza) |
| Médio | A 9710 pulava em silêncio o gatilho em `ch_file_holds` se a tabela não existia (9710 antes da 9620) | **Confirmado** | A 9710 agora PARA no começo, sem deixar nada pela metade, com "Cole antes a migração 9620 (fonte complementar)..." se `ch_file_holds` não existe; o gatilho é criado sempre. No pacote do dono isso não ocorre (9620 já está em produção). O teste `fontesComplementaresOrdem` (e) passou a colar as migrações posteriores à 9620 depois dela | `aulasArquivoApagadoBanco` ("a 9710 exige a 9620": para com o aviso, e com a tabela cola 2x), simulação de colagem |

Limites que restam (documentados, não inventei regra):
- **Chamada ao depósito que trava por mais de 10 minutos**: a renovação garante o prazo até a chamada começar; se a própria exclusão no depósito demorar mais de 10 minutos para terminar, nesse intervalo outro envio do mesmo arquivo poderia ser aceito. Na prática uma exclusão leva segundos; não há como cancelar uma chamada já feita ao depósito.
- **Servidor ANTIGO** (janela "SQL novo + site antigo") não limpa arquivos (igual a hoje): nada muda.
- As 9710/9711 já coladas na versão da 1ª rodada (só em ambiente de teste) têm as funções antigas removidas por `drop function if exists`; em produção ainda nada foi colado.

Simulação de colagem (`simular-producao.mjs`, base 23d53c1 + partes 1-7 + 9630 + 9610 + 9620 + 9621 + 9710 + 9711): colou 2x sem erro e uma 3ª vez sem mudar nenhuma função; única função existente que muda: `gam_process_lesson()`; nenhuma ACL existente mudou; 9 funções novas (a nova é `ch_worker_lesson_files_renew`); a 9710 colada sem a 9620 para com o aviso em português.
