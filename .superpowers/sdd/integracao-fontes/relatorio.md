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
