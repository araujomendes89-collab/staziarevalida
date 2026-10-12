# Relatório — Planos e Configurações (ramo leva3-pl, partida c2a354a)

Status: PRONTO COM RESSALVAS (ressalvas na seção 7). Nada foi empurrado, nenhum serviço real foi tocado, tudo em commits locais.
Decisões do dono de 11/10 aplicadas: PL02 (SIM), PL04 (SIM, só a estrutura), PL06 (SIM). CF03 NÃO foi feito.

## 1. O que mudou, em linguagem simples

**PL02 — teste grátis vencido (commit be75c46, migração 9730)**
- Quem não é equipe, nem revisor médico, nem tem plano pago válido, nem teste valendo fica "sem acesso pago".
- Fecha para essa pessoa: **simulados completos** (o banco recusa começar, com aviso em português), **Tutor** (não consegue mais começar o teste do Tutor; a tela diz "Seu teste grátis terminou") e **estações Pro** (já eram fechadas para quem não paga; nada novo, mas agora há teste provando).
- Continuam abertos: **questões e flashcards** (e tudo o que já era aberto).
- Não muda nada para: administrador, editor, revisor médico, quem tem Pro/Elite pago dentro da data (com a tolerância de 3 dias do pagamento pendente) e quem está com teste grátis dentro do prazo.
- Telas: Início (faixa "Seu teste grátis terminou" com o que fica aberto e fechado, sem botão de assinar), Conta (aviso), Simulados (aviso e botão desligado; o treino de questões segue aberto), Tutor (cartão "Seu teste grátis terminou"). O servidor do Tutor (`server/tutor/engine.ts` e `realtime.ts`) usa o aviso novo quando o banco avisa `plan_locked`.
- A assinatura Stripe está parada: os avisos dizem "A assinatura pelo app ainda não está disponível" e NÃO têm botão de assinar.

**PL04 — Elite com algo a mais, só a estrutura (commit 6b5230e, migração 9731)**
- Administração › Configurações ganhou o bloco **"Benefícios do plano Elite"** (só administrador): "Voz do Tutor por dia no Elite (minutos)" e a chave "Correção de estação com devolutiva: só Elite".
- Padrão: vazio e desligado = o Elite é igual ao Pro e **nada muda para ninguém** até o dono preencher. Onde falta valor a tela mostra o aviso **TODO(dono)**.
- Voz: o Elite pago usa os minutos do Elite quando preenchidos, nunca menos que os do Pro (o banco recusa valor menor que o Pro). Equipe e Pro não mudam. O valor do Pro continua no painel do Tutor ("Voz por dia (plano pago, minutos)"); em Configurações ele aparece só como leitura.
- Correção de estação com devolutiva: as telas de estações do aluno ainda estão em construção, então hoje a chave só (a) mostra o benefício na Conta do aluno Elite e (b) deixa pronta a função `station_feedback_allowed()` para essas telas.
- O aluno Elite vê "Benefícios do seu plano Elite" na Conta somente com o que o dono ligou/preencheu. Nenhum texto de venda, número ou preço inventado.

**PL06 — "Oferecer teste grátis no cadastro" vale de verdade (commit 96e2e5f, migração 9732)**
- Ligada: como hoje (teste pelos dias das Configurações). Desligada: o cadastro novo nasce **sem teste** ("Teste grátis · Expirado", sem data; na Conta "Acesso gratuito"; em Usuários "Acesso gratuito · sem teste"), com questões e flashcards abertos e o resto fechado (mesma regra do PL02). Quem já está em teste não muda. Vale para cadastro por e-mail e por Google (mesmo gatilho). WhatsApp e aceite do termo continuam sendo gravados.
- A chave é a que já existia na tela (aba Planos › Teste grátis, campo `active` do plano `trial`); o texto da chave foi corrigido e o selo mostra "Cadastro sem teste" quando desligada.

## 2. Arquivos

Migrações (intervalo 9730 a 9739):
- `supabase/migrations/20261003009730_teste_vencido_trava_pago.sql` (PL02)
- `supabase/migrations/20261003009731_elite_beneficios.sql` (PL04)
- `supabase/migrations/20261003009732_cadastro_sem_teste.sql` (PL06)

Telas e servidor: `src/novo/app/plan/planAccess.js` (novo), `src/novo/app/home/HomeScreen.jsx`, `src/novo/app/account/AccountScreen.jsx`, `src/novo/app/practice/QuestionBuilder.jsx`, `src/novo/app/tutor/nexus/TutorGate.jsx`, `src/novo/app/admin/AdminPanels.jsx` (Configurações, aba Planos), `src/novo/app/admin/AdminUsers.jsx`, `src/novo/app/admin/auditLog.js`, `server/tutor/engine.ts`, `server/tutor/realtime.ts`.

Testes novos: `planosTesteVencidoBanco`, `planosTesteVencidoTelas`, `planosEliteBanco`, `planosEliteTelas`, `planosCadastroSemTesteBanco`, `planosCadastroSemTesteTelas`. Testes antigos ajustados (comportamento mudou de propósito): `correcoesAcessoBanco` (plano pago vencido/cancelado sem teste do Tutor começado agora fica "bloqueado", antes caía no teste do Tutor), `tutor.test.ts` (o aluno da voz do professor agora é posto em teste grátis válido em vez de plano vencido), `correcoesAcessoTelas` (texto da chave do teste).

Registro (auditLog.js): ação nova `plan.benefits` = "Benefícios do Elite alterados" (resumo: voz do Tutor no Elite e correção ligada/desligada). `plan.save` do plano Teste grátis agora diz "oferecido no cadastro" ou "NÃO oferecido no cadastro (cadastro novo sem teste)". `registroAdministracao` e `registroAdministracaoBanco` passam.

## 3. Passo de colagem (Supabase, à mão, editor que para no primeiro erro)

Ordem: DEPOIS da 9620 e da 9621 (e de tudo que já está em produção, inclusive 9550 e 9630). Colar nesta ordem, uma de cada vez:
1. **Antes de colar a 9730**: rodar a consulta que está no cabeçalho da 9730 (lista quem perde simulados e o Tutor novo: teste vencido, plano vencido/cancelado, cadastro sem teste; equipe e revisor ficam de fora). Se a lista tiver gente que não deve perder, dar um plano ou um teste em Usuários antes. Mostrar ao dono.
2. `20261003009730_teste_vencido_trava_pago.sql`
3. `20261003009731_elite_beneficios.sql`
4. `20261003009732_cadastro_sem_teste.sql` (a chave nasce ligada, então colar a 9732 não muda o cadastro de ninguém).

Conferido: no estado de produção simulado (base 23d53c1 + partes 1 a 7 do pacote + 9630 + 9610 + 9620 + 9621, script em `.superpowers/sdd/leva3-pl/verificar-ordem-e-base.mjs`), as 3 migrações coladas 2 vezes dão OK e uma 3ª colagem não muda nenhuma função. Só 3 funções existentes mudam, e a diferença é só o que se pretendia (`comparar-funcoes.py`): `app_start_session` (parte da 1700, a mais nova; só ganha a trava do simulado), `tutor_entitlement` (parte da 9550; só `v_locked`, `v_paid_voice`, bloqueio do teste novo e o campo `plan_locked`) e `handle_new_user` (parte da 5300; só a escolha de dar ou não o teste). 8 funções novas; nenhuma é chamável por visitante (anon); as internas (`subscription_trial_is_valid`, `user_without_paid_access`, `user_is_paid_elite`) não são chamáveis nem por quem está logado. A tabela nova `plan_benefits` tem RLS e nenhum acesso direto.

## 4. Escolhas de desenho (onde o dono não decidiu adotei a RECOMENDADA; confirme)

1. "Sem acesso pago" = sem acesso completo (equipe/revisor), sem plano pago válido e sem teste valendo. Vale também para plano pago vencido/cancelado/expirado e conta sem assinatura (não só para "teste vencido"): um Pro que não pagou não deve ter mais que um teste vencido. Alternativa: limitar só a quem tem plano `trial`.
2. "Teste valendo" = situação "Em teste" com data de fim no futuro, ou sem data registrada (a Administração sempre pede a data; mesma leitura que a Conta já fazia).
3. Tutor: teste vencido e nunca começou o teste do Tutor = bloqueado. Quem já começou o teste do Tutor segue até o prazo PRÓPRIO dele (é o CF03, que o dono ainda vai definir; não mexi). Alternativa: cortar o teste do Tutor junto com o da conta.
4. Simulados: o que se recusa é COMEÇAR; um simulado já aberto pode ser terminado.
5. Elite: valores numa tabela nova de uma linha (`plan_benefits`) com funções próprias só do administrador, em vez de chaves em `app_settings` (que exigiria mexer na trava de chaves e nas duas funções de configuração). Fica no bloco novo de Configurações, com Registro próprio.
6. Elite nunca abaixo do Pro (validação e `greatest`). Equipe fica com o limite do plano pago.
7. Correção de estação com devolutiva: equipe e revisor sempre passam em `station_feedback_allowed()`; aluno só se for Elite pago válido e a chave estiver ligada. Nasce desligada.
8. Cadastro sem teste = assinatura `trial` com situação `expired` e sem data de fim (não criei plano "free" novo no banco, para não mexer no tipo `plan_code`). Quem tem data de fim = teste que acabou ("Seu teste grátis terminou"); sem data = "Você está no acesso gratuito".
9. Avisos sem botão de assinar (não existe tela de assinatura e a Stripe está parada). Quando a tela de planos existir, ligar o botão em `src/novo/app/plan/planAccess.js` (`lockNotice`) e nos 4 lugares que o usam.
10. Revisor médico não vê mais a faixa "teste grátis" no Início (era uma ressalva da leva anterior).

## 5. O que depende de valores que o dono ainda vai definir

- Minutos de voz do Tutor por dia do Elite (vazio = igual ao Pro). TODO(dono) na tela.
- Se a correção de estação com devolutiva entra no Elite (desligada). TODO(dono) na tela.
- Preço do Elite e texto de venda: nada foi criado.
- CF03 (prazo próprio do teste do Tutor): não feito.

## 6. Testes e resultados (pela fila, 2 trabalhadores; conferi o número de arquivos)

- Grupo banco (12 arquivos): correcoesAcessoBanco, equipeAcessoCompleto, termoAceiteBanco, termoAceiteTutor, supabaseSchema, supabaseAdminApi, supabaseHomeApi, supabasePracticeApi, tutor, tutorV2, planosTesteVencidoBanco, planosEliteBanco — 12/12 arquivos passaram (225 testes; o `tutor.test.ts` foi reexecutado depois do ajuste: 51/51).
- Grupo 2 (12 arquivos): planosCadastroSemTesteBanco, admConfigEstacoesBanco, registroAdministracao, registroAdministracaoBanco, tutorNexusBanco, tutorNexusCaracteres, tutorNexusMotor, tutorNexusTranscricao, tutorNexusVoz, tutorVoiceMode, tutorVozesAprovacao, tutorTresProfessores — 12/12, 139 testes.
- Grupo telas (12 arquivos): planosTesteVencidoTelas, planosEliteTelas, planosCadastroSemTesteTelas, correcoesAcessoTelas, equipeAcessoTelas, adminAbasVisiveis, contaTermo, segundaFaseEmBreve, tutorVoiceModeScreen, simuladoCronometro, admConfigEstacoesApp, adminUsuariosTela — 12/12, 153 testes.
- Grupo 4 (12 arquivos): tutorGeminiVoice, tutorTravaVozAoVivo, novoLocalBackend, estacoesRevisaoMedica, tutorRealtime, tutorNexusFala, tutorNexusChamada, nexusEntrada, nexusOutrasTelas, supabaseAccountApi, supabaseReviewApi, supabasePlayApi — 12/12, 126 testes.
- Extras (6 arquivos): arenaRegrasConferidas, arenaCorrecoesAdmin, engineSeed, supabaseAnswerKey, entitlementsService, checkoutAndPaymentFlow — 6/6, 78 testes.
- `planosTesteVencidoBanco` depois da consulta de conferência: 20/20.
- TDD: os testes novos de banco foram vistos falhando sem a migração (12 de 19 no PL02; 4 de 11 no PL06) antes de passar.
- Permissões testadas (banco) com visitante, aluno em teste vencido, aluno em teste válido, aluno Pro, aluno Elite (e Elite vencido), editor, revisor médico e administrador.
- `npm run build`: passou (uma vez). `tsc --noEmit`: 1831 erros, igual à base (1831); nenhum erro nos arquivos que toquei.

## 7. Riscos e ressalvas

- **Efeito imediato ao colar a 9730**: toda conta com teste vencido (a maioria dos cadastros com mais de 7 dias), plano pago vencido ou cancelado perde os simulados completos e não começa mais o teste do Tutor. É o que o dono pediu, mas é mudança visível: use a consulta do cabeçalho e avise o dono.
- O Tutor continua dependendo do dono ligar "Planos pagos + teste grátis" (CF01, da 9550); com `requires_pro` desligado o Tutor segue aberto para todos e a PL02 não o toca.
- A mensagem da voz do professor (`server/tutor/speech.ts`) ainda usa o texto antigo "Seu teste grátis do Tutor terminou" para quem está sem teste; os outros caminhos do Tutor (texto, voz ao vivo, tela) usam o aviso novo. Em geral essa tela nem é alcançada, porque o Tutor já bloqueia antes.
- Entrada pela Stazia Arena: o nó "simulado" da trilha chama o mesmo `app_start_session`; o banco recusa corretamente, mas não conferi como a tela da Arena mostra o erro (pode vir a mensagem genérica).
- Visitante (anon) consegue chamar `app_admin_save_plan` (desde a 1300) mas a função o recusa ("Acesso restrito a administradores"); não mexi (não redefini essa função). As funções novas da Administração estão fechadas para anon.
- Antes da migração por colar, as telas novas não quebram: Configurações mostra erro só no bloco do Elite, e a Conta funciona sem os benefícios.
- Cadastro sem teste usa a situação "Expirado": o cartão "Em teste" da Visão geral não conta essas pessoas.

## 8. O que NÃO foi feito

- CF03 (prazo próprio do teste grátis do Tutor).
- Tela de assinatura/planos do aluno, cobrança e Stripe (parada por decisão do dono).
- A funcionalidade "correção de estação com devolutiva" em si (as telas de estações do aluno ainda não existem; só a chave e a função).
- Rotina que muda a situação do teste para "expirado" sozinha (o fim é calculado na hora; a situação no banco segue "Em teste").
- O sistema antigo de planos em Firestore (`server/services/entitlements`, `server/routes/billing.ts`) não foi tocado; ele não serve o app novo.
- Texto de venda, preços e números para o Elite.

## 9. Rodada de correções da revisão (leva 3, revisão independente de outra empresa)

Commits: 09e5323 (banco), edc630e e 357453f (telas e testes). Base conferida: produção simulada = 23d53c1 + partes 1-7 do pacote + 9630 + 9610 + 9620 + 9621. Nada empurrado.

| # | Gravidade | Veredito | O que mudou | Teste |
|---|---|---|---|---|
| 1 | Alto | Confirmado em parte, depois limite aceito documentado | Com a chave "Planos pagos + teste grátis" desligada o Tutor fica aberto a todos (decisão antiga do dono, 9550). Mas pelo painel isso NÃO se alcança: o banco recusa salvar o Tutor ligado com a chave desligada (trava CF01); só ajuste direto no SQL ou estado antigo de produção. O que foi corrigido: o aviso não contradiz mais o Tutor. Uma regra só no banco (`user_plan_lock`, `app_my_access`, `simulado_gate`) diz o motivo e se o Tutor está fechado para aquela pessoa; com o Tutor aberto, o aviso não diz que ele é pago. | planosRevisaoBanco "Achado 1" (4 testes, inclui o alcance real); planosRevisaoTelas "Achado 1" |
| 2 | Alto | Confirmado e corrigido | A consulta do cabeçalho da 9730 parte dos USUÁRIOS (left join em assinaturas), então lista também conta sem linha de assinatura, e ganhou a coluna "Tutor" (Perde / Segue até o fim do teste do Tutor / Aberto a todos). Quem perde ao colar: sem equipe, sem revisor, sem plano pago válido e sem teste valendo perde COMEÇAR simulados completos; no Tutor perde quem nunca começou o teste do Tutor (se a chave do Tutor cobra plano pago). | planosRevisaoBanco "Achado 2": a consulta do cabeçalho é executada e bate, e-mail por e-mail, com `user_without_paid_access` |
| 3 | Médio | Refutado | `app_start_session` NÃO é security definer na base desde a 0700/1700 (executa como a própria pessoa, para a segurança por linha de `practice_sessions` valer). A 9730 só acrescenta a trava do simulado; continua invoker com search_path vazio. Mudar para definer exigiria reabrir a segurança do sorteio e da gravação: não feito de propósito. | planosRevisaoBanco "Achado 3" (prosecdef = false, search_path vazio, sessão invisível para outro usuário); comparar-funcoes.py: só 9 linhas de diferença |
| 4 | Médio | Confirmado e corrigido | A tabela `plan_benefits` e a versão FINAL de `tutor_entitlement` (com a voz do Elite) ficam na 9730; recolar a 9730 depois da 9731 não tira mais os 60 min do Elite. A 9731 só traz as funções que leem e gravam a tabela. | planosRevisaoBanco "Achado 4" (Elite 60, Pro 20; recola 9730, 9731, 9730) |
| 5 | Médio | Confirmado e corrigido | Conta refaz a consulta de benefícios quando plano, situação ou data do plano pago mudam e apaga o que estava na tela (inclusive quando deixa de ser Elite sem desmontar a tela). | planosRevisaoTelas "Achado 5" (Elite cancelado; Elite para Pro) |
| 6 | Médio | Confirmado e corrigido nas duas telas; a janela "site antigo + SQL novo" é limite aceito | Site novo + SQL antigo: as telas perguntam ao banco (`app_my_access`; `app_admin_signup_trial_rule`) e, se a função não existe, ficam como antes (sem aviso novo, botão do simulado liberado, texto da chave "todo cadastro novo recebe o teste" e selo "Fora de venda"). Site antigo + SQL novo: o site antigo mostra "Ajuste os filtros e tente de novo" para quem perdeu os simulados (o site antigo engole a mensagem do banco; não há como corrigir sem o site novo). A janela é curta (SQL, imagem do Cloud Run, site em seguida) e só atinge quem perdeu o acesso por decisão do dono. | planosRevisaoTelas "Achado 6" (5 testes); correcoesAcessoTelas PL06 com e sem a regra; planosRevisaoBanco "Achado 6" |
| 7 | Baixo | Confirmado e corrigido | Os selos "TODO(dono)" viraram "Pendente: definir os minutos de voz do Elite" e "Pendente: decidir se a correção de estação com devolutiva entra no Elite". | planosRevisaoTelas "Achado 7"; planosEliteTelas |
| Redefinições | - | Conferido | Só 3 funções existentes mudam e só no que se pretendia (`app_start_session`: +trava; `tutor_entitlement`: v_locked, v_paid_voice, bloqueio, plan_locked; `handle_new_user`: escolha do teste). 11 funções novas; nenhuma chamável por visitante; as internas (`user_plan_lock`, `user_without_paid_access`, `user_is_paid_elite`, `subscription_trial_is_valid`) não são chamáveis nem por quem está logado. As funções da Fonte complementar (9620/9621) não são tocadas. | verificar-ordem-e-base.mjs: 3 migrações coladas 2x = ok; 3ª colagem não muda nenhuma função |

### O que o dono precisa saber
- Colar a 9730 tira dos alunos sem acesso pago (teste vencido, plano pago vencido ou cancelado, conta sem assinatura e cadastro sem teste) o direito de COMEÇAR simulados completos, e do Tutor se ele nunca começou o teste do Tutor. Rodar antes a consulta do cabeçalho da 9730 e conferir a lista (a coluna "Tutor" diz o que acontece com o Tutor de cada um).
- Se o Tutor estiver hoje ligado com "Planos pagos + teste grátis" DESLIGADO (estado antigo, ver 9550), o Tutor continua aberto a todos, inclusive para quem perdeu o acesso pago; os avisos nas telas não chamam o Tutor de pago nesse caso. Só o dono decide ligar a chave (quem não paga cai no teste do Tutor de 7 dias).
- Ordem: SQL (9730, 9731, 9732), depois imagem do Cloud Run, depois site. Se colar 9730 e o site demorar, quem perdeu o simulado vê uma mensagem genérica no site antigo.

### Verificação
- Colagem em produção simulada 2x + 3ª sem mudança: ok (RESULTADO FINAL: tudo ok).
- Testes ligados (pela fila, 2 trabalhadores, nº de arquivos conferido): 12/12 (226), 12/12 (146), 12/12 (139, depois do ajuste de correcoesAcessoTelas: 21/21), 12/12 (108), 8/8 (117) e correcoesAcessoTelas 21/21. Inclui registroAdministracao e registroAdministracaoBanco.
- TDD: planosRevisaoBanco contra as migrações de antes da correção: 9 de 10 falhavam (consulta sem conta sem assinatura, voz do Elite perdida ao recolar, funções ausentes) e passam depois.
- `npm run build`: ok. `tsc --noEmit`: 1831 erros, igual à base; nenhum nos arquivos tocados.
