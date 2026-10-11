# Relatório: equipe fora do ranking e das ligas (AR05)

Ramo adm-arena-equipe, partida 8748c97. Nada foi empurrado; Supabase de produção não foi tocado.

## O que mudou
Migração nova: `supabase/migrations/20261003009630_arena_sem_equipe.sql` (idempotente, pode colar 2 vezes).
Equipe = administrador e editor (`public.user_is_staff`, a regra que o sistema já usa).

- Ranking: toda classificação (geral, semana, mês, precisão, evolução, questões, sequência, "perto de mim", posição própria, fotos diária e semanal) deixa de listar a equipe. Posição e total do aluno contam só alunos.
- Liga: a equipe não é inscrita (nem ao ganhar XP, nem na temporada nova); o fechamento da semana retira quem virou equipe no meio da temporada (só a inscrição), por isso a equipe não ocupa posição, não sobe, não desce, não ganha moeda nem medalha de top 10. A tela da liga e o cartão da liga no Início contam o grupo só com alunos.
- Administração: Top 10 e "Por liga" contam só alunos (rótulos na tela dizem "só alunos"). Auditoria por pessoa, ledger, XP, moedas e "N com dados na Arena" continuam vendo a equipe. Nada foi apagado.
- Quem já estava numa liga como equipe: no fim da migração, a inscrição na temporada ABERTA é retirada uma única vez e registrada em `gamification_jobs` (job `arena_sem_equipe`) com liga, grupo e XP da semana de cada um (dá para refazer). XP, moedas, eventos, medalhas, temporadas fechadas e `current_league` ficam como estão. Colar de novo não acha mais nada.
- Virar equipe ou deixar de ser: o ranking acompanha na próxima consulta (a regra é lida na hora); a liga some da tela na próxima consulta e sai da temporada no próximo fechamento. Sem rotina nova.

## Funções redefinidas e versão-base (sempre a mais nova)
| Função | Base |
|---|---|
| gam_board | 3800 (única) |
| gam_join_league | 3800 (única) |
| app_league_current | 3800 (única) |
| app_gamification_summary | 3800 (única) |
| ch_worker_gamification_close_week | 9570 (AR02, AR03, AR06 preservados) |
| app_admin_gamification | 9571 (AR04, AR07 preservados; a 9573 não a redefine) |

Todas `security definer`, `set search_path = ''`; revoke de public e anon (e authenticated nas internas gam_* e ch_worker_*); as app_* ficam com grant só para authenticated. Não mexem: `gam_award`, `ch_worker_gamification_daily` (as fotos usam gam_board; a equipe fica sem posição).

## Decisão: revisor médico
Revisor médico que não é administrador nem editor NÃO é equipe para este fim. `user_has_full_access` só dá acesso completo ao conteúdo; a pessoa continua sendo conta de estudo, no ranking e na liga. Há teste para isso. Para mudar: trocar `user_is_staff(x)` por `user_has_full_access(x)` nos pontos marcados AR05 (comentário no topo da migração).

## Telas e documentação
- `src/novo/app/admin/AdminPlay.jsx`: rótulos "Top 10 (geral, só alunos)" e "Por liga (só alunos)"; a rotina `arena_sem_equipe` aparece como "Equipe fora das ligas".
- `docs/architecture/STAZIA_PLAY.md`: um parágrafo sobre a regra.

## Testes
- Novo: `src/__tests__/arenaSemEquipe.test.ts` (14 casos, PGlite): aluno entra e equipe fica fora em todos os rankings; aluno não perde posição; equipe sem posição; Administração vê a equipe; virar/deixar de ser equipe; revisor continua; liga (inscrição, tela, cartão, fechamento, temporada nova, medalha top 10); caso de equipe já inscrita (preserva XP, moedas, eventos, temporada fechada, com registro); colar 2 vezes = mesmo banco (funções, permissões, dados); segurança. Sem a migração, 12 dos 14 falham (os 2 de segurança passam por já valerem).
- Ajustado: `src/__tests__/supabasePlayApi.test.ts` usava o administrador como 4º participante do ranking (comportamento antigo); passou a usar um aluno (EVA). Nenhuma expectativa mudou.
- Rodados pela fila (`vaga-de-teste.sh`), 12 arquivos que existem, 12 passaram, 194 casos: adminAbasVisiveis, adminPlayArenaTextos, adminPlayRegrasConferidas, arenaCorrecoesAdmin, arenaRegrasConferidas, arenaSemEquipe, celebration, correcoesQuestoesAjustesBanco, playScreens, segundaFaseEmBreve, supabasePlayApi, termoAceiteBanco. Suíte inteira NÃO foi rodada.

## Como testar à mão (depois de colar a migração)
1. Entrar como aluno em Classificação: administrador e editor não aparecem; a posição e o total contam só alunos.
2. Entrar como administrador em Classificação e Liga: sem posição, liga "ainda não entrou".
3. Administração > Stazia Play: Top 10 e Por liga "só alunos"; Últimas rotinas mostra "Equipe fora das ligas" se havia inscrição a retirar; auditoria da conta da equipe segue mostrando XP e eventos.
4. SQL: `select * from gamification_jobs where job = 'arena_sem_equipe';`

## Riscos
- `gam_board` chama `user_is_staff` por linha (consulta pela chave do papel): custo pequeno, aceitável nos milhares de alunos previstos na documentação; se crescer, trocar por anti-join.
- Perfil público de conta da equipe ainda abre pelo código público (sem posição); não é ranking, mas se o dono quiser esconder, é outro ajuste.
- A inscrição de quem virou equipe só sai de fato no fechamento da semana (antes disso fica só escondida nas telas).
- Fotos diárias/semanais da equipe continuam sendo gravadas, com posição vazia (histórico).

## O que NÃO foi feito
Não criei funções novas; não apaguei dados da equipe; não mexi em `current_league`; não alterei `gam_award` nem a rotina diária; não rodei a suíte inteira; nada foi publicado.
