# Relatório: integração da Fonte complementar (ramo integracao-fontes)

Base: `publicar-fontes-ia` (eef035b = produção 8748c97 + Fontes oficiais com IA 9610 + Arena sem equipe 9630). Nada foi empurrado, nenhum
serviço real foi tocado. Tudo em commits locais.

## 1. O que foi juntado e como cada conflito foi resolvido

Foram juntados, nesta ordem: `adm-fontes-apoio` (A, 92e90ec) e `adm-fontes-apoio-b` (B, 723f122).

| Onde | Conflito | Como resolvi |
|---|---|---|
| `src/novo/app/admin/auditLog.js` (A) | A põe o nome de `source.audience`; o ramo de Fontes põe o resumo de `question.delete` | Ficaram os dois |
| `src/novo/app/admin/content/Sources.jsx` (A) | imports (`AUDIENCE`, `AUDIENCE_NOTE` x `DOC_STATUS`, painéis de busca) e a linha de selos (selo "Fonte complementar" x "encontrada pela busca") | Imports somados; os dois grupos de selos ficaram |
| `src/novo/app/admin/auditLog.js` (B) | B põe `podcast.source_complementar` e repete `podcast.source_rename` (que já existia) | Fica o nome novo e uma só `podcast.source_rename` |
| `src/novo/app/admin/content/Sources.jsx` (B) | import de `ComplementarMentions` x imports de A e das Fontes | Todos os imports; a tela `ComplementarMentions` aparece na aba Fontes só para o administrador |
| `src/__tests__/apoioT4Banco.test.ts` (A e B criaram o arquivo) | add/add | Refeito por junção de 3 vias com a versão efe07a1 como base (só 5 trechos em conflito, todos a favor de B, que corrige o que A deixava aberto) |

Problema que o merge de A trouxe e que eu corrigi: A tinha cópias **antigas** de arquivos de IA e o merge as aplicou por cima do que já
está em `publicar-fontes-ia`. Restaurei de `publicar-fontes-ia`: `server/ai/maestro.ts`, `server/contentHub/ai/openai.ts`,
`server/contentHub/ai/provider.ts`, `server/contentHub/ai/webSearch.ts`, `src/__tests__/fontesOficiaisIA.test.ts` e
`.superpowers/sdd/publicar-fontes-ia/relatorio-endurecimento.md` (o merge o tinha apagado). Conferi o resto do diff contra
`publicar-fontes-ia`: só há mudanças de fonte complementar. Os nomes do Registro das Fontes, `busca_fontes` sem Gemini e as sementes
`www.gov.br` ficaram como estavam.

Migrações: `git diff publicar-fontes-ia -- supabase/migrations` mostra **só** a 9620 e a 9621 novas. Nenhuma migração antiga de produção
mudou (as cópias antigas trazidas pelos ramos ficaram com a versão de `publicar-fontes-ia`). Numeração: 9620 e 9621 rodam depois da 9610 e da 9630.
A 9620 que vale é a de A (a 9620 antiga que B trazia foi trocada); a 9621 é a de B, ajustada (ver 3).

## 2. Ordem e base das funções (checagem feita)

Método: PGlite com a base 23d53c1 + partes 1 a 7 do pacote (`Downloads/publicacao-staziamed-2026-10-11`) + 9630 + 9610; guardei o
`pg_get_functiondef` de todas as funções do schema public; colei a 9620 e a 9621 duas vezes; guardei de novo; comparei função por função
(para as funções que a 9620 guarda como `ch_raw_*`, comparei o corpo antigo com o corpo `ch_raw_*`). Scripts em
`.superpowers/sdd/integracao-fontes/verificar-ordem-e-base.mjs` e `comparar-funcoes.py`.

Resultado: 25 funções mudam, 51 são novas. Colar 2 vezes não dá erro; uma 3ª colagem não muda nenhuma função.

**Achado importante (corrigido na 9620):** `lesson_materials_json` e `app_lesson_material` partiam de uma 9580 **antiga** (sem a
conferência do áudio). Colar a 9620 teria desfeito a regra "áudio aguardando conferência: o aluno não vê" e tirado dos dados da equipe
`review_status`, `reviewed_at`, `reviewer` e `can_release`. Agora as duas partem da 9580 atual e só somam o filtro
`not hidden_from_student`. Teste novo: `fontesComplementaresOrdem (f)`. Consequência: a 9620 agora **precisa da 9580 já aplicada**
(em produção já está); isso está escrito no cabeçalho da 9620 e o teste "(e) colar antes da 9593" passou a colar depois da 9580.

| Função | Parte de | Diferença contra a produção simulada |
|---|---|---|
| app_question_commentary, practice_correction_view, tutor_truth, app_question_timeline, app_podcast, lesson_view, guideline_update_view | 7700 / 2600 / 9593 / 9580 / 4100 (as versões de produção) | só a funcionalidade nova (filtro de fonte complementar, `ch_scrub_json`, `ch_card_shows`, `audience = 'oficial'`) |
| lesson_materials_json, app_lesson_material | 9580 atual (corrigido) | só `not m.hidden_from_student` |
| app_ch_set_source_authority, ch_worker_claims_by_ids | 2100 / 1500 | só a trava "complementar só nível E" e a coluna `audience` |
| app_lessons, app_lesson, app_start_lesson_questions, app_guideline_updates, app_guideline_update, app_start_guideline_questions | versões de produção | só `security definer`, colunas que o aluno pode ler e busca sem instituição/documento |
| app_tutor_session, app_podcasts, app_announcement, app_admin_podcast_approve/publish, app_admin_review/publish_guideline_update | invólucro (`ch_take_raw`) | o corpo de produção vira `ch_raw_*` **idêntico**; o invólucro só filtra ou confere |
| podcast_admin_view (9621) | 4700 (ninguém mais a redefiniu) | só `complementar` e `student_hidden` (corrigi: `student_hidden` agora também olha arquivo/SHA-256, como `app_podcast`) |
| app_admin_podcast_source_complementar, app_ch_complementar_mentions | novas na produção; a de B vence a de A | B (só administrador, Registro com nome da fonte; varredura ampliada) |

Fumaça no estado simulado: `app_ch_complementar_check()` devolve `ok`; o aluno não vê a diretriz de aula que é apostila cadastrada; o
administrador é barrado ao salvar texto com o título cadastrado e **não** é barrado com "sangue nos olhos"/"apostila" soltos;
`lesson_materials_json` mantém `review_status`.

## 3. Decisão do dono (2026-10-11): "sangue nos olhos" e "apostila" soltos deixam de barrar

Nova regra, valendo no banco, no servidor e na tela: texto médico com "sangue nos olhos" (queixa clínica) ou com a palavra "apostila"
**não** é barrado, nem escondido do aluno, nem listado como menção. Continua valendo **só**: título completo e exato de fonte complementar
cadastrada; órgão/editora cadastrado quando distintivo (3 palavras e 20 letras); siglas em `ch_sources.aliases`; link, arquivo e SHA-256;
o filtro de classe (`audience`) e a trava de nível E.

O que mudou:
- **9620:** `ch_complementar_hit` e `ch_text_cites` não olham mais "sangue nos olhos" nem `apostilas?`; `ch_text_mentions` e a varredura
  da 9620 também não; `ch_worker_complementar_terms` não leva mais `'Sangue nos Olhos'` fixo e só aceita órgão, autor, arquivo e site
  quando distintivos (3 palavras e 20 letras); mensagem ao aprovar roteiro de podcast não fala mais da palavra "apostila".
- **9621:** `ch_complementar_terms_keys` sem termo fixo; `ch_complementar_regex` sem `apostilas?`; entram as siglas cadastradas (aliases);
  órgão só quando distintivo; mensagem nova: "Este texto cita uma fonte complementar cadastrada (o aluno não pode ver). Reescreva sem citar o
  nome desse material."
- **Servidor:** `server/contentHub/complementarGuard.ts`: `ALWAYS_TERMS` ficou vazio e a expressão `APOSTILA` saiu de `mentionsSupportMaterial` e
  `labelIsSupportMaterial`. Quem usa (podcast, aula, análise, atualização, Tutor texto e voz) herda. Os prompts continuam **proibindo a IA** de
  citar apostila (instrução à IA, deixei).
- **Tela:** `ComplementarMentions.jsx` (textos e vazio), dica da "Classe da fonte" em `Sources.jsx`; nome em português para a ação nova
  `source.aliases` no Registro. `registroAdministracao.test` passa (inclui `podcast.source_complementar`, `podcast.source_rename`, `source.audience`).
- **Testes:** os que provavam o bloqueio da expressão solta agora provam que **não** bloqueia (seção "0b" do T2, 100 frases médicas sem nenhuma
  barrada, T3, Equipe, Banco, Ordem, Varredura) e que o título completo cadastrado **ainda** bloqueia/esconde. Mantive `it.fails` onde o vazamento continua aberto (ver 5).

### Efeito sobre a segurança (para o dono ver)
- Apostila cadastrada com título curto, como só "Sangue nos Olhos" (3 palavras, 16 letras): a regra "recusa marcar como complementar título com
  menos de 3 palavras" continua. Mas o filtro do banco só esconde esse título quando o texto/campo é **igual** ao título; dentro de uma frase
  ele passa. O gatilho de salvar (9621) e o servidor da IA ainda barram esse título curto inteiro (então barram também a queixa clínica, mas só
  nesse caso em que o dono cadastrou assim).
- Um **órgão** chamado só "Sangue nos Olhos" não barra mais nada em frase (antes barrava).
- Passam a vazar (antes eram pegos pela expressão solta): domínio/endereço não cadastrado (`sangue-nos-olhos.com.br`) no rótulo SQL e na
  varredura (no servidor ainda é barrado pelo site cadastrado); fonte digitada "Apostila SNO" sem sigla cadastrada; "segundo a apostila" sem título.
- **Aviso de tela proposto** na hora de marcar como complementar (Classe da fonte): "O título desta fonte é curto. O sistema só a esconde do
  aluno quando o texto é igual ao título. Para proteger de verdade, use o título completo (com editora e ano) e cadastre as siglas." Mostrar quando o
  título tiver menos de 20 letras. Não implementei (é decisão de texto do dono).

## 4. Testes e verificações

- Os 12 arquivos de fontes complementares (T2, T3, T4 banco/telas, varredura banco/servidor, banco, equipe, equipe tela, ordem, servidor, tela):
  **484 passaram, 1 pulado, 0 falharam** (inclui 99 `it.fails` esperados, os vazamentos abertos).
- `registroAdministracao.test` (26) e o resto da lista ligada: **88 arquivos de teste no total** (os 12 acima + registroAdministracao + 75 de
  lotes: tudo que o diff para `publicar-fontes-ia` criou ou alterou, os que citam os arquivos alterados e os que rodam as migrações: podcasts, lessons,
  tutor*, aiCentral*, fontesOficiais*, registroAdministracaoBanco, adminAbasVisiveis, supabase*Api, etc.): **1228 testes passaram e 1 falhou uma vez**. O que falhou:
  `aiCentralScreen > conferentes: a IA indisponível salva…` (teste de tela, arquivo e código não alterados por mim). Rodado de novo (junto com o apoioT4Telas) passou; o lote falhou enquanto o typecheck rodava ao mesmo
  tempo, então suspeito de lentidão, mas não provei. Anoto como instável, não como causado por esta junção.
- Nunca rodei a suíte inteira. Tudo pela fila `vaga-de-teste.sh`.
- Typecheck (`tsc --noEmit`): **1831 erros, igual a `publicar-fontes-ia`**. A junção trouxe 1 novo (`apoioT4Telas`, `onClose` faltando); corrigi.
- Build (`npm run build`): passou (vite + servidor).
- Colagem dupla no estado de produção simulado: 9620 e 9621 duas vezes sem erro; terceira colagem não muda função nenhuma.

## 5. Vazamentos ainda abertos (continuam como `it.fails`)

- Tutor: leitura direta de `tutor_messages` e `tutor_sessions.summary` antigos; `checklist_station_contents` (estações aprovadas) com texto antigo.
- Paráfrase, tradução (inglês, espanhol), erro de digitação, leetspeak, título em ordem trocada ou pedaço do título, título parcial.
- Sigla não cadastrada (SNO, S.N.O.); nome de arquivo, link e autor não cadastrados na biblioteca (só valem os que estão em `ch_sources` / `ch_documents`).
- Colado (CamelCase), hashtag, letras espaçadas e hifenização de linha na varredura do administrador; largura zero, homóglifo e `&nbsp;` em partes do rótulo SQL.
- Novos pela retirada da expressão solta: ver 3 (endereço não cadastrado, "Apostila SNO" sem sigla).
- Materiais já publicados com a seção Referências (PDF/HTML prontos) não têm rota para refazer.
- Se a 9580 ou a 9593 for colada de novo depois da 9620, o filtro some até colar a 9620 outra vez (há `app_ch_complementar_check()` para conferir).

## 6. Riscos

- A 9620 revoga a leitura direta de colunas de `lessons`, `guideline_updates` e `questions.sources` para aluno/anônimo (a lista de colunas é montada na hora
  da colagem; coluna nova adicionada depois a essas tabelas não fica legível ao aluno até recolar). Conferi que nenhuma tela lê essas tabelas direto.
- O gatilho de salvar (9621) é mais largo do que o filtro de leitura (9620) para título curto (ver 3). Foi mantido de propósito: salvar com o título
  cadastrado é barrado.
- Gravação interna (servidor, sem usuário) não é barrada pelo gatilho: só aviso no log; a IA passa pela conferência do servidor.
- O teste de tela instável acima.

## 7. Passo a passo de colagem (produção)

Pré-requisito: a produção já tem a base 8748c97, as partes 1 a 7 do pacote, a 9630 (já colada) e a 9610 (Fontes oficiais com IA) colada.
1. Colar `supabase/migrations/20261003009620_fontes_complementares.sql` inteira no SQL do Supabase. (Exige a 9580; colar 2 vezes é seguro.)
2. Colar `supabase/migrations/20261003009621_fontes_complementares_equipe.sql` inteira. (Exige a 9620.)
3. Conferir, como administrador: `select public.app_ch_complementar_check();` deve devolver `{"ok": true, "faltando": []}`.
4. Só depois publicar o site/servidor (o servidor novo chama `ch_worker_file_sha` e `ch_worker_complementar_terms`, criadas na 9620).
5. Na tela Fontes: marcar as apostilas como complementares (título completo, de preferência com editora e ano); cadastrar as siglas se houver
   (função `app_ch_set_source_aliases`; ainda sem tela). Conferir "Textos que citam fontes complementares".
Se colar de novo a 9580 ou a 9593, colar de novo a 9620 e a 9621 depois, na ordem.

## 8. Rodada de correções (revisão independente da OpenAI, achados confirmados pelo líder)

Base desta rodada: 476f340. As migrações 9620 e 9621 ainda não foram coladas em produção, então foram editadas no lugar. Testes novos:
`fontesComplementaresRodada2Banco.test.ts` (A, D, E, B-banco), `fontesComplementaresRodada2Servidor.test.ts` (B-servidor) e
`fontesComplementaresRodada2Termos.test.ts` (C). Cada um foi visto falhando antes da correção e passando depois.

### (A) ALTO: mudar o nível ou a classe de uma fonte não atualizava as marcas dos anexos
- **Era:** o gatilho `ch_sources_refresh_flags` só disparava em título, órgão, link, autores, siglas, SHA-256 e documento, e só quando a fonte já
  era complementar. Subir uma fonte oficial para nível E (`app_ch_set_source_authority` ou UPDATE direto) a tornava complementar pelo gatilho
  `ch_sources_audience_guard`, mas `lesson_materials.hidden_from_student`, `lessons.guideline_hidden` e `guideline_updates.source_hidden`
  ficavam com a marca velha: `app_lesson_material` continuava entregando o arquivo ao aluno.
- **Mudou (9620):** o gatilho de UPDATE agora também dispara em `authority_level` e `audience` e quando a fonte ESTÁ ou ESTAVA complementar
  (`new.audience = 'complementar' or old.audience = 'complementar'`), então a marca volta quando a fonte deixa de ser complementar. Como o
  Postgres não aceita `OLD` na condição de um gatilho de INSERT, ficaram três gatilhos: `ch_sources_refresh_flags` (update),
  `ch_sources_refresh_flags_ins` (insert complementar) e `ch_sources_refresh_flags_del` (apagar fonte complementar devolve a marca). `app_ch_set_source_audience`
  já chamava o refresh e continua assim. Marca de podcast: não é guardada (`app_podcast` e `podcast_admin_view` calculam na hora), o teste prova que acompanha.
- **Teste:** `Rodada2Banco (A)`: 6 casos, nos dois sentidos (função do administrador, UPDATE direto do nível, UPDATE direto da classe, apagar,
  inserir nível E), conferindo a marca do material, da aula e da atualização, e `app_lesson_material` como aluna.

### (B) ALTO: falha ao gravar o SHA-256 só ia para o log, e o material podia ser liberado
- **Era:** `markFile` em `server/lessons/router.ts` e `server/podcasts/router.ts` engolia o erro; o material ficava sem SHA-256 e sem
  classificação por impressão digital.
- **Escolha (fecha por segurança, sem janela):** uma **retenção por caminho** no banco, em vez de "esconder depois que falhar" (que teria a
  mesma janela se a segunda chamada também falhasse) ou "desfazer o registro" (o desfazer também pode falhar):
  1. ANTES de registrar, o servidor pede `ch_worker_file_hold(caminho)` (tabela nova `ch_file_holds`, só o servidor mexe). Se isso falhar, o envio é
     recusado com erro 500 em português e nada é registrado.
  2. Enquanto a retenção existe, `ch_complementar_file` devolve verdadeiro: o arquivo fica escondido do aluno (material de aula, fonte de podcast,
     `app_lesson_material`, `app_podcast`), pelos mesmos pontos que já escondem fonte complementar. A retenção também vale no `ch_refresh_hidden_flags`.
  3. Registrado o arquivo, o servidor calcula e grava o SHA-256 (`ch_worker_file_sha`, que solta a retenção antes de gravar para o gatilho
     recalcular). Se falhar, repete UMA vez (`server/contentHub/fileSha.ts`). Se falhar de novo, a retenção fica, o arquivo segue escondido, o log recebe a
     frase em português e a equipe recebe o aviso "Não foi possível conferir a impressão digital do arquivo; confira antes de liberar. Por segurança, o arquivo
     ficou escondido do aluno até essa conferência." (aulas: campo `aviso` da resposta e faixa amarela na tela de aulas por `sha_pendente`; podcasts: campo `note` que a
     tela já mostra, e a fonte aparece com o selo "escondida do aluno").
  4. `ch_worker_file_sha` agora devolve 0 e mantém a retenção se não houver material com aquele caminho (o servidor trata como falha); o material antigo (já em
     produção, sem SHA-256 e sem retenção) NÃO é afetado.
- **Como a equipe resolve:** enviar o arquivo de novo (substitui o de slides; nos outros tipos, remover o antigo). Se quiser uma tela de "liberar manualmente",
  é decisão de produto; não criei.
- **Mudança de contrato:** `ch_worker_file_hold` é nova e o servidor novo a chama: colar a 9620 ANTES de publicar o servidor (já era a ordem do passo 4).
  `lesson_materials_json` (equipe) e `podcast_admin_view` (equipe) ganharam o campo `sha_pendente`.
- **Teste:** `Rodada2Banco (B)` (retenção, solta com o SHA, SHA de apostila continua escondendo, caminho sem material mantém a retenção, podcast,
  permissões) e `Rodada2Servidor` (banco falso que falha no SHA: funcionando; falha passageira com a nova tentativa; falha nas duas; falha ao pedir a
  retenção; aulas e podcasts).

### (C) ALTO: lista de termos indisponível desligava a conferência sem aviso
- **Era:** `loadComplementarTerms` devolvia lista vazia quando a RPC falhava sem cache, e uma resposta que não era lista virava lista vazia guardada por 60 s.
- **Mudou (`server/contentHub/complementarGuard.ts`):** só resposta boa (array) entra no cache; falha ou resposta inválida nunca é guardada. Com falha: usa a
  última lista boa se tiver até 6 horas (aviso no log em português); sem lista boa, LANÇA `ComplementarTermsUnavailable` (status 503, mensagem
  "Não foi possível conferir agora a lista de fontes que o aluno não pode ver. Tente de novo em instantes."). Sem banco (db nulo, só teste/dev): sem termos, como antes.
- **Por chamador:**
  - Tutor texto (`engine.ts`, `termsOrFail`): erro 503 do Tutor "não conseguiu fazer uma conferência de segurança agora", antes de chamar a IA e de gravar qualquer mensagem.
  - Tutor voz (`realtime.ts`, fala do professor): 503 e a fala NÃO é gravada no histórico.
  - Ferramentas da voz (`tools.ts`: evento de aprendizagem e memória): nada é guardado; a voz recebe o erro curto em português.
  - Busca de fontes do Tutor (`searchSources`): sem a lista, não devolve fonte nenhuma (já era tratado como falha da busca, agora com o aviso certo no log).
  - Roteiro de podcast (gerar e conferir o roteiro) e assistente de aula: 503 com a mensagem, sem chamar a IA e sem gravar nada (a lista é pedida antes da IA).
  - Análise e reanálise de questões: devolvem o aviso em `pending`, sem chamar a IA e sem gravar.
- **Teste:** `Rodada2Termos` (21): cache, resposta inválida (6 formas), último cache bom, mais de 6 h, e cada chamador com banco real e a lista falhando de
  propósito. Ajustei o teste antigo `fontesComplementaresServidor` que provava o comportamento ruim ("se o banco falhar, sobram os termos fixos").

### (D) MÉDIO: entidades HTML diferentes no banco e no servidor
- **Era:** o servidor decodificava `&#97;` para `a`; o banco trocava a entidade inteira por espaço, então "S&#97;ngue nos Olhos — Pediatria" escapava do filtro.
- **Mudou (9620):** função nova `ch_decode_entities` (uma passada, como o servidor): decimais, hexadecimais (`&#x61;`, `&#X61;`, com zeros à esquerda), nomeadas
  `nbsp amp quot lt gt apos shy` (sem diferenciar maiúsculas) e qualquer outra vira espaço; código impossível (0, acima de U+10FFFF, metade de par substituto) vira espaço;
  `&amp;#97;` vira `&#97;`, não `a`. `ch_text_key` a usa depois de tirar as etiquetas e antes do `%xx`, na mesma ordem do servidor.
- **Teste:** `Rodada2Banco (D)`: 29 textos (HTML, %20, largura zero, hífen suave, acento solto, NFD, NFKC, homóglifos do cirílico e do grego, maiúsculas, entidades de todos os tipos)
  dão a MESMA chave em `ch_text_key` e em `normalizeKey` do servidor; e o título cadastrado escrito com `&#97;`/`&#x61;` agora é reconhecido por `ch_complementar_hit`.

### (E) MÉDIO: o gatilho de salvar montava a expressão a cada linha (e a cada campo, com biblioteca vazia)
- **Mudou (9621):** indicador `v_built` (a expressão é obtida no máximo uma vez por chamada, mesmo quando o resultado é NULL = biblioteca sem termos) e cache no
  nível da instrução: `set_config('apoio.cre', …, true)` guarda a expressão ('N' = sem termos); um gatilho de instrução (`ch_guard_complementar_reset`, antes de insert/update, nas
  6 tabelas conferidas) zera no começo de cada instrução. Assim um lote grande monta uma vez, e uma instrução nova nunca vê a biblioteca velha (equivale ao que já
  acontecia: a expressão sempre foi relida a cada instrução). Resultado idêntico ao de antes. Escolhi zerar por instrução (e não por mudança em `ch_sources`) para não
  depender de invalidação cruzada entre transações.
- **Teste:** `Rodada2Banco (E)`: lote de 500 linhas com biblioteca vazia (antes: 2999 construções) e com termos (antes: 500): no máximo 1 por instrução (contador por sequência
  numa função instrumentada); lote limpo salva as 500; lote com 1 linha citando o título cadastrado é barrado inteiro com a mesma mensagem e código 22023; troca de título
  da fonte entre duas instruções é vista pela segunda; toda tabela com o gatilho de salvar tem o gatilho de zerar.

### (F) Decisões de desenho, NÃO são defeito (documentado, nada mudou)
1. Leitura direta pela API REST das colunas de texto livre de `lessons`, `guideline_updates` e `tutor_*` não passa pelo filtro (só as colunas de fonte foram fechadas): texto novo é
   barrado ao salvar e o texto antigo aparece na varredura da tela Fontes para a equipe reescrever.
2. Título complementar curto (menos de 3 palavras ou 20 letras) só é escondido quando o texto inteiro é igual ao título.
3. Nome de arquivo curto e SHA-256 dentro de texto livre não são filtrados (só o arquivo em si, por SHA-256).

### Ordem e base das funções, de novo (estado de produção simulado)
Mesmo método da seção 2 (base 23d53c1 + partes 1 a 7 + 9630 + 9610; 9620 e 9621 coladas duas vezes): sem erro; a 3ª colagem não muda nenhuma função; **25 funções mudam, 54 são
novas** (as 3 novas desta rodada: `ch_decode_entities`, `ch_guard_complementar_reset`, `ch_worker_file_hold`); nenhuma função de produção sumiu ou perdeu corpo. As únicas diferenças novas contra a
produção, além das da seção 2, são o campo `sha_pendente` em `lesson_materials_json` e `podcast_admin_view`. Fumaça: tudo ok.

### Testes desta rodada
- Os 12 arquivos de fontes complementares (T2, T3, T4 banco e telas, varredura banco e servidor, banco, equipe, equipe tela, ordem, servidor, tela): 385 passaram, 99 `it.fails` esperados, 1 pulado, 0 falhas
  (= 485, igual à seção 4). `registroAdministracao`, `registroAdministracaoBanco`, `supabaseLessonsApi` e os três arquivos novos da rodada: 142 passaram.
- Os 37 arquivos que citam os arquivos de servidor alterados (tutor*, lessons, podcasts, análise/reanálise, telas de aulas e podcasts, etc.) e os 60 outros que rodam as migrações
  (supabase*Api, fontesOficiais*, aiCentral*, contentHub*, sqie, arena, etc.): todos passaram.
- Build (`npm run build`): passou. `tsc --noEmit`: 1831 erros, igual à base (nenhum novo).
- Nunca rodei a suíte inteira; tudo pela fila `vaga-de-teste.sh`, no máximo 12 arquivos por vez.

### Ressalvas honestas
- A retenção (B) cobre arquivos enviados DEPOIS da 9620. Material de aula e fonte de podcast que já existem em produção sem SHA-256 continuam sem ele (não há como calcular sem os bytes);
  uma varredura única do servidor que leia os arquivos antigos e grave o SHA-256 seria um trabalho à parte.
- O Flashcast copiado de um podcast para a aula (`/:id/flashcast`) não passa pela retenção (é áudio gerado pelo próprio servidor, não arquivo enviado pela equipe).
- (Corrigido na rodada 2, seção 9) A lista de termos vencida deixou de valer: depois dos 60 s a falha tenta de novo uma vez e depois fecha.
- O cache da expressão (E) é por instrução, não por transação: um lote feito por uma função que dá uma instrução por linha não ganha com isso.

## 9. Rodada de correções 2 (segunda leitura da OpenAI: A, B, D e E ficaram resolvidos; 2 pontos novos)

### (1) ALTO: lista de termos velha liberava texto quando o banco falhava
- **Era:** com o banco fora e cache de até 6 horas (inclusive lista VAZIA), `loadComplementarTerms` seguia com a lista velha. Caso: o servidor guardou `[]`, a equipe cadastrou uma
  fonte, passaram 60 s, a consulta falhou e o texto com o título novo passava na conferência.
- **Mudou (`complementarGuard.ts`):** dentro dos 60 s vale o cache (como antes). Passados os 60 s, a consulta é refeita; se falhar (erro ou resposta que não é lista), tenta de novo UMA vez
  (150 ms depois); se continuar falhando, lança `ComplementarTermsUnavailable` (503). Lista vencida nunca é usada, nem vazia. O limite de 6 horas foi removido. Log em português:
  "lista de termos indisponível depois de 2 tentativas ... a lista vencida não é usada e o pedido foi recusado."
- **Chamadores:** o padrão (fechar) vale para todos, como na seção 8 (C). Único tratamento diferente que já existia: a busca de fontes do Tutor (`searchSources`) não gera nem publica texto, só filtra
  trechos, então ela devolve "nenhuma fonte" em vez de derrubar a resposta; o Tutor continua exigindo a lista ao montar a resposta (`termsOrFail`) e fecha com 503. Não achei leitura crítica que
  cair desnecessariamente.
- **Testes (`Rodada2Termos`, agora 24):** dentro do prazo, falha usa o cache sem nem perguntar; depois do prazo, 2 falhas lançam (conta 2 consultas); lista vazia em cache + falha depois do
  prazo = indisponível (e dentro do prazo continua valendo); 1ª tentativa falha e a 2ª dá certo = lista nova, guardada; resposta inválida também tenta 2 vezes. Os testes que afirmavam "usa a última lista boa
  por até 6 h" foram trocados.

### (2) BAIXO: retenção órfã quando o registro é recusado
- **Era:** se o registro do material/fonte era recusado antes de criar a linha, o tratamento chamava `recordFileSha`; `ch_worker_file_sha` achava 0 registros, apagava a retenção e a recriava: ficava órfã.
- **Mudou (9620):** função nova `ch_worker_file_release(p_path)` (security definer, search_path vazio, revoke de public/anon/authenticated, idempotente): solta a retenção SÓ se não houver
  material de aula nem fonte de podcast com aquele caminho (arquivo já registrado nunca é solto por ela). `ch_worker_file_sha` agora devolve 0 e NÃO mexe na retenção quando não há linha com o caminho
  (não apaga nem recria); havendo linha, solta a retenção ao gravar o SHA-256, e se a gravação falhar a retenção simplesmente continua (a função nem chega a apagar).
  Os dois roteadores chamam `releaseFile` (`fileSha.ts`) no tratamento de erro do registro; falha ao soltar só vai para o log.
- **Testes:** banco: liberar sem material solta, repetir devolve falso sem erro, com aula ou fonte de podcast registradas NÃO solta, SHA em caminho sem material não mexe na retenção, permissão só do servidor.
  Servidor: aula com título vazio (registro recusado) e podcast com PDF sem texto (422) não deixam retenção; aula registrada com SHA falho continua retida.
- **Limite conhecido:** no envio de desenvolvimento a chave do arquivo é derivada do conteúdo; dois envios simultâneos do MESMO arquivo, em que um é recusado, poderiam soltar a retenção do outro antes
  do registro dele (janela de milissegundos, só em desenvolvimento; em produção a chave é aleatória).

### Verificação desta rodada
- Ordem e base (estado de produção simulado, 9620 e 9621 duas vezes): sem erro, 3ª colagem não muda função, 25 funções mudam, 55 novas (a nova é `ch_worker_file_release`), nenhuma função de produção sumiu; fumaça ok.
- 12 arquivos de fontes complementares: 385 passaram, 99 `it.fails` esperados, 1 pulado. `registroAdministracao`, `registroAdministracaoBanco`, `supabaseLessonsApi` e os 3 de rodada 2: 149 passaram.
- 38 arquivos que citam os arquivos alterados: todos passaram. 60 arquivos que rodam as migrações: todos passaram; `questionKnowledge > reaplicar a carga não duplica` falhou uma vez por lentidão
  (7,7 s com a fila cheia) e passou sozinho (8/8); arquivo e código não alterados por mim.
- Build passou; `tsc --noEmit` 1831 erros, igual à base.
