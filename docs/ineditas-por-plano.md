# Questões Inéditas por plano

Pedido do dono (2026-10-15). Migração: `supabase/migrations/20261003010300_ineditas_por_plano.sql` (aditiva, com bloco DESFAZER no fim).
**Não aplicada em produção.** Ensaiada no PGlite (todas as migrações, incluindo colar de novo) e em produção dentro de uma
transação com ROLLBACK (corpo das 7 funções redefinidas conferido IGUAL ao que a migração copia; nada gravado).

## O que o aluno vê

- Opção "Questões Inéditas" da lista "Prova / edição": `Questões Inéditas (20 de 74)`.
- Quadro "20 de 74 liberadas no seu plano", barra de respondidas, "As outras 54 estão bloqueadas…" e botão "Conhecer os planos"
  (vai para a tela de Planos informativa). Sem preço, sem botão de assinar.
- Plano com "todas" (Pro e Elite hoje), equipe e revisor: nada de limite na tela.
- Sem acesso (teste vencido, plano vencido, sem assinatura): continua o aviso e nenhuma questão; passa a mostrar "Existem 74 Questões Inéditas no banco".
- Antes de responder: nenhuma função devolve gabarito, explicação, fontes ou códigos novos (o teste confere as chaves devolvidas).
- Oficiais do Inep: nenhuma mudança (todo filtro novo vale só para `origin = 'staziamed'`; o teste conta 1.200 legíveis para todos).

## Planos que existem de verdade

`subscriptions.plan` é o enum `plan_code = trial | pro | elite`. **Não existem** "entrada / intermediário / avançado" no banco
(estão só na memória de pacotes futuros). A tabela de limites usa o mesmo enum: quando os planos novos nascerem, entram
valores no enum e linhas aqui (linha ausente: teste = 20, pagos = todas).
O plano que vale é o que dá o acesso hoje: plano pago válido usa o limite do próprio plano; teste grátis válido usa o limite do
"teste" (mesmo que a linha diga Pro/Elite com situação "Em teste").

## A regra dos N (recomendada e implementada)

Ordem do aluno = `md5(id_do_aluno || ':' || id_da_questão)`. Liberadas = as que ele já respondeu + as primeiras da ordem dele
que ainda não respondeu, até completar N (as respondidas contam dentro do N).

Por que esta e não "as primeiras N na ordem da carga": as primeiras 20 seriam todas do lote L01 (24 questões, uma só área
dominante), e todo aluno em teste veria as mesmas. Com a ordem por aluno o conjunto é misto, cada aluno recebe um diferente
e o banco inteiro é amostrado. Continua determinística: recarregar, trocar de aparelho ou abrir de novo dá o mesmo conjunto
(sem sorteio a cada acesso), e não há como burlar: a leitura da tabela (RLS), o sorteio, o gatilho de resposta, a correção, a
figura e as "relacionadas" usam a mesma função.
Efeitos: subir o limite só acrescenta; baixar nunca tira o que o aluno já respondeu; carga nova só pode trocar questões ainda
não respondidas. Alternativa, se o dono preferir todos vendo as mesmas 20: trocar a ordem por `number` (uma linha na função
`ineditas_released_ids_for`).
Limite de contas: quem cria outra conta de teste ganha outras 20; isso é a regra do teste (uma por pessoa), fora desta mudança.

## Como o administrador configura

Administração > Planos > cartão "Questões Inéditas por plano": por plano, "Liberar todas" ou um número inteiro (0 a 100000).
Padrão: Teste grátis 20, Pro todas, Elite todas. Funções (só administrador, com registro em `admin_audit_log`, ação
`plan.ineditas_limits`, antes e depois): `app_admin_ineditas_limits()` e `app_admin_save_ineditas_limits(jsonb)`.
A tabela `ineditas_plan_limits` não tem acesso direto (nem leitura) para ninguém além das funções.

## O que mudou no banco

Novas: `ineditas_plan_limits`, `ineditas_limit_for`, `ineditas_released_ids_for` (internas), `ineditas_released_ids`
(política), `ineditas_can_open` (interna), `app_my_ineditas` (aluno), `app_admin_ineditas_limits`, `app_admin_save_ineditas_limits`.
Redefinidas (corpo mais novo + a regra): política de leitura de `questions`, `question_attempts_ineditas_gate`,
`practice_question_view` (9930), `ch_raw_practice_correction_view` (9920), `app_question_figure` (9801),
`app_related_questions` e `app_start_related_question` (9910) e `app_question_filters` (9801; a opção ganha `released`,
`answered`, `limited`).
**Ordem ao colar de novo:** colar 9801/9910/9920/9930 depois desta desfaz a regra; cole a 010300 por último (os testes antigos
agora recolam a 010300 no fim).

## Para publicar

1. Aplicar a migração `…010300` no Supabase (colar; pode repetir). 2. Publicar o site (as telas leem `released/limited`; sem a
migração as telas antigas continuam funcionando: sem `limited` não mostram limite). 3. Conferir no painel Planos os números.

## Testes

`src/__tests__/ineditasPorPlanoBanco.test.ts` (16 casos: teste vê 20 e o total, estável, outro aluno recebe outro conjunto,
não burla leitura direta/visão/resposta/relacionada, pago vê o limite, sem acesso vê 0, oficiais intactas, sem gabarito, não-admin
não grava, auditoria, subir/baixar, colar de novo) e `ineditasPorPlanoTelas.test.tsx` (5 casos). Ajustados: `questoesStaziaMedAlunoBanco`
(retirada fora do teste; chaves novas; recola 9970 e 010300) e `questoesStaziaMedSoOficiais` (catálogo e recolagem).
Já vermelho antes desta mudança (fora do escopo): o catálogo de `questoesStaziaMedSoOficiais` não classifica `irt_*` (simulado TRI, 9996).

## Prévia

`npx vite --config scripts/preview/ineditas-por-plano/vite.config.mjs --port 31939` (dados simulados; alterna perfil e tema).
Capturas em `/Volumes/StaziaMed/.tmp-aulas/ineditas-plano/`.

## Decisões do dono

1. Os 20 do teste: por aluno (recomendado) ou os mesmos 20 para todos?
2. Pro e Elite começam com "todas"; quer limite menor em algum?
3. Nomes entrada/intermediário/avançado: só existem trial/pro/elite; os novos entram junto com os pacotes.
4. Texto do convite ("Conhecer os planos") enquanto a assinatura pelo app não existe.
