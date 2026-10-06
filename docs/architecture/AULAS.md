# Aulas teórico-práticas (Módulo Audiovisual StaziaMed)

Data: 2026-10-06. Pedido: recriar no app novo a estrutura de aula do app antigo, com o layout do novo design.

## O que existia

- **App antigo** (`src/components/estudar/VideoLessonsCatalogView.tsx`): 8 aulas de exemplo escritas no próprio código (`SAMPLE_VIDEO_LESSONS`), não em banco. Não têm vídeo nem arquivos; os botões "Slides da Aula (PDF)", "Áudio Flashcast (MP3)" e "Diretriz SUS / PCDT" não abrem nada, e os nomes de professores são de demonstração. **Não foram copiadas**: virariam conteúdo médico apresentado como real sem revisão.
- **App novo** (`src/novo/prototype/Study1.jsx`, `Aulas`): só o desenho (carrossel 3D com player em vidro), com 8 títulos fixos e o aviso "Tela em reconstrução".
- Nenhuma tabela de aulas no Supabase. Os arquivos da Central de Conteúdo ficam no depósito privado `content-hub` (só PDF/HTML).

## Estrutura de cada aula (igual à do app antigo)

| Campo | Onde fica |
|---|---|
| Área, tema, título, duração estimada, professor/convidado, especialidade | `lessons` |
| Vídeo (Módulo Audiovisual) | `lessons.video_url` (YouTube, Vimeo ou MP4, sempre https; o vídeo é hospedado fora) |
| Botão "Treinar questões deste tema" | `app_start_lesson_questions`: treino de 20 questões do **mesmo tema** das questões oficiais; sem questão nesse tema, da grande área |
| Material complementar (PDF) e áudio Flashcast (MP3) | `lesson_materials` (tipos `slides` e `flashcast`) + depósito privado `lessons` |
| Diretriz SUS / PCDT | `lessons.guideline_title/guideline_url` (endereço da fonte oficial) |
| Resumo & racionalidade clínica | `lessons.summary` |
| Pontos-chave para o Revalida | `lessons.key_points` (lista) |

`lesson_progress` guarda segundos assistidos e conclusão (só pelo `app_lesson_progress`). Concluir uma aula vale XP no Stazia Play uma vez por aula (`LESSON_COMPLETED`, regra `xp.lesson_completed` = 20).

## Telas

- **Estudar › Aulas** (`/novo/aulas`): mesmo carrossel do protótipo, agora com as aulas publicadas (abas por grande área com contagem, busca sem acento, ← → para navegar, clique na central para abrir) e uma lista em cartões logo abaixo. Sem aulas publicadas, a tela diz isso e oferece "Montar um treino".
- **Aula aberta**: palco escuro do protótipo com o vídeo de verdade, título, professor · especialidade · duração, **Treinar questões deste tema** e **Marcar como concluída**; abaixo, "Resumo & racionalidade clínica" e "Pontos-chave para o Revalida" numerados; ao lado, "Materiais complementares" com as três linhas fixas do app anterior: Material complementar (PDF), Áudio Flashcast (MP3) e Diretriz SUS / PCDT, cada uma com "Disponível" e o botão (o PDF abre em nova aba, o áudio toca na própria página, a diretriz abre a fonte oficial) ou "Não disponível".
- **Administração › Aulas** (equipe: administrador e editor): criar e editar com todos os campos, sugestão de temas que já têm questões (para o treino cair no tema certo) e a seção **Materiais complementares** já na criação: Material complementar (PDF), Áudio Flashcast (MP3) e Diretriz SUS / PCDT (título e link). Em aula nova, os arquivos escolhidos sobem logo depois de criar a aula; em aula salva, na hora. Cada linha mostra "Disponível" ou "Não disponível". Publicar; apagar aula só administrador. Tudo vai para o registro de ações.

## Arquivos (por que não passam pelo servidor em produção)

Na Vercel o corpo de cada requisição vai até 4,5 MB; slides e áudios passam disso. Com o Supabase:
- **envio**: o servidor confere a equipe e a aula e devolve um envio assinado (`POST /api/lessons/:id/upload`); o navegador manda o arquivo direto ao depósito `lessons`; o servidor confere que ele chegou e registra (`POST /api/lessons/:id/materials/confirm`);
- **leitura**: o banco confere se o aluno pode ver a aula (publicada) e o servidor devolve um endereço assinado de 10 minutos (`GET /api/lessons/materials/:id/link`).

No banco de desenvolvimento o arquivo passa pelo servidor (`POST /api/lessons/:id/materials`, `GET /api/lessons/materials/:id/file`) e fica em `.data/lessons`. Tipos aceitos: PDF (slides) e MP3 (áudio), conferidos pela assinatura do arquivo; até 200 MB por arquivo no depósito.

## Banco (migração `20261003004000_aulas.sql`)

Tabelas `lessons`, `lesson_materials`, `lesson_progress` (RLS: aluno lê só aula publicada e o próprio progresso; equipe lê tudo; escrita só pelas funções). Depósito privado `lessons`. Funções do aluno: `app_lessons`, `app_lesson`, `app_lesson_material`, `app_lesson_progress`, `app_start_lesson_questions`, `app_lesson_topics`. Equipe: `app_admin_lessons`, `app_admin_save_lesson`, `app_admin_delete_lesson` (só admin), `app_admin_lesson_material`, `app_admin_delete_lesson_material`. Gatilho `lesson_progress_play` (XP).

## Testes

`supabaseLessonsApi.test.ts` (banco: equipe × aluno, publicação, materiais, progresso e XP uma vez, treino por tema/área, exclusão), `lessonsRoutes.test.ts` (servidor: envio pelo servidor e envio assinado, tipos, quem vê o quê), `lessonsScreen.test.tsx` (tela).

## Pendências

- Nenhuma aula cadastrada: o conteúdo (vídeos, slides, áudios, resumos) precisa ser produzido e publicado pela equipe.
- Supabase: se um áudio passar de 50 MB, aumentar o limite global de arquivo (Storage › Settings); o depósito `lessons` aceita até 200 MB.
- Progresso por tempo assistido só é gravado quando o aluno conclui; acompanhar o tempo do vídeo incorporado fica para depois.
