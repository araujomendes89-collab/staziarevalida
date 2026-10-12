# Relatório: pedir a IA pela tela (Análise de questões e Questões inéditas)

Ramo `analise-ia` (partida 8bd82fb, o que está em produção). Nada foi empurrado, nada foi publicado, nenhuma chamada real a IA, Supabase, Cloud Run ou Vercel.

## O que foi feito (em palavras simples)

**1. Aba "Análise de questões", seção "Gerar análises com IA" (no topo).**
O administrador (ou o revisor médico de uma área) escolhe a prova, a quantidade (1 a 10, padrão 3) e se quer "só questões ainda sem análise". A tela mostra ANTES de confirmar: quantas questões entram, quantas há disponíveis, o custo estimado em dólares (e o máximo), quanto ainda resta da cota do dia e se a IA da Central está pronta. O botão "Pedir análise" só liga quando está tudo certo. Depois do pedido aparece o andamento (Na fila, Analisando, Concluído, Falhou ou Aguardando a IA, com o motivo em português, barra "1 de 3" e o gasto). Ao concluir, as análises caem em "Rascunhos" e "Para revisar" (listas que já existiam). Dá para cancelar um pedido que ainda não começou.

**2. Aba "Questões inéditas", seção "Conferir com IA" (no topo).**
Escolhe lote, área, quantidade (1 a 20, padrão 10), as camadas (regras sempre, grátis; fontes oficiais, atualidade e revisão clínica opcionais) e "conferir de novo". Mostra a estimativa em dólares por camada antes de confirmar. Botão "Pedir conferência".
Cada rascunho ganhou um **selo de triagem**: "Reprovada pela IA ou pelas regras", "Sem fonte oficial: bloqueada", "Com apontamentos", "Só regras conferidas", "Ainda não conferida", "Sem apontamentos". Há contagem por selo, filtro por selo e ordem ("mais problemáticos primeiro" ou "sem apontamentos primeiro"). A tela diz: "A IA não aprova: quem decide é o revisor médico."
**Rascunho sem fonte oficial (nível A a D) fica com a aprovação bloqueada no banco** (não só na tela). Pedir ajustes e recusar continuam livres.

**3. No banco (uma migração só).** Funções de pedido, prévia, lista, cancelamento, limites fixos, idempotência, triagem. Veja abaixo.

**4. No processamento (Cloud Run).** Duas etapas novas na fila (`question_analysis` e `draft_check`) que reaproveitam `runQuestionAnalysis` e `runDraftChecks`, só para as questões/rascunhos congelados no pedido. Gasto registrado na Central de IAs (`ai_calls`, funções Engenharia reversa e Verificação). Conferência por OUTRA empresa: usa a Verificação, mas nunca a empresa que criou o rascunho (troca sozinha na ordem Gemini, Claude, OpenAI, regra do dono de 10/10).

## Regras que ficaram no banco (números fixos)

| Pedido | Por pedido | Por dia por pessoa | Padrão |
|---|---|---|---|
| Análise de questões | 10 | 20 | 3 |
| Conferência de rascunhos | 20 | 60 | 10 |

- Dia = dia de Brasília. Pedido que falhou sem fazer nada não gasta a cota.
- Quem pede: administrador (qualquer área) ou revisor médico cadastrado (só questões/rascunhos das áreas dele). Aluno, editor sem área, revisor de outra área e quem não entrou são barrados.
- Recusa em português se a Central de Conteúdo ou a IA da função (Engenharia reversa / Verificação) não estiver pronta.
- Mesmo pedido repetido enquanto anda não duplica (devolve o que existe).
- Análise já PUBLICADA ou REVISADA nunca é trocada por este caminho.
- Parada de segurança: o processamento para se o gasto real passar do DOBRO do pior caso estimado do pedido.
- Os tetos globais de gasto continuam desligados (decisão do dono); o controle é por pedido, como combinado.

## Arquivos

- `supabase/migrations/20261003009810_analise_ia_pedidos.sql` (migração, intervalo 9810)
- `server/contentHub/aiRequests.ts` (novo: roda o pedido)
- `server/contentHub/pipeline.ts` (2 etapas novas no mapa `STEPS`)
- `server/contentHub/questionAnalysis.ts` (opções `ids`, `onlyMissing`, `maxCostUsd`, `onProgress`, `mockProvider`)
- `server/contentHub/draftChecks.ts` (opções `ids`, `force`, `maxCostUsd`, `onProgress`, `crossCompany`, `mockProvider`)
- `src/novo/app/admin/content/AiRequests.jsx` (novo: as duas seções e a lista de pedidos)
- `src/novo/app/admin/content/QuestionAnalyses.jsx`, `DraftQuestions.jsx`, `labels.js`
- `src/novo/app/admin/auditLog.js` (nomes em português no Registro: pedido, resultado e cancelamento)
- Testes: `src/__tests__/analiseIaBanco.test.ts`, `analiseIaWorker.test.ts`, `analiseIaTelas.test.tsx`

Não foi preciso criar rota nova no servidor: a tela fala direto com as funções do banco.

## Migração 20261003009810: passo de colagem

- Colar o arquivo inteiro no SQL Editor do Supabase. **Pode colar 2 vezes** (testado).
- Recria a restrição de etapas da fila (`ch_jobs_step_check`) com a **união** do que já existe no banco (lido da própria restrição) + as 17 etapas conhecidas até a 9610 + as 2 novas. Colar depois de outra migração que acrescente etapa não apaga a dela. As chaves de `ai_functions` não mudam.
- Cria `ch_ai_requests` (com RLS: administrador vê tudo, cada pessoa os seus) e as funções `app_ch_question_analysis_preview/request`, `app_ch_draft_check_preview/request`, `app_ch_ai_requests`, `app_ch_ai_request_cancel` e as internas (`ch_ai_*`, `ch_qa_*`, `ch_dc_*`, `ch_draft_triage`, `ch_worker_ai_request_*`, `ch_worker_*_ids`), todas com `security definer`, `search_path` vazio, e `revoke` de public/anon (e authenticated nas internas).
- **Redefine duas funções** que já existiam: `app_draft_questions` (parte da versão da 2100; ganha 2 parâmetros com padrão, `p_triage` e `p_order`) e `app_draft_question_decide` (parte da versão da 1800; ganha o bloqueio de aprovação sem fonte oficial). **Não** mexe em nenhuma `app_admin_question*`, `practice_correction_view`, `tutor_truth` nem `app_question_commentary`, então não colide com o conjunto 9700-9732 do ramo `leva3-final`. Se esse ramo ou outro redefinir `app_draft_questions` ou `app_draft_question_decide`, quem vier depois parte do corpo desta migração.
- Depois de colar, conferir de fora: `select count(*) from public.ch_ai_requests;` (deve dar 0) e abrir a aba (a seção "Gerar análises com IA" deve mostrar a prévia, sem o aviso amarelo).

## Ordem de publicação

1. **SQL** (colar a 9810 no Supabase; conferir que entrou inteira).
2. **Cloud Run** (o processamento precisa conhecer as duas etapas novas; sem isso o pedido fica na fila).
3. **Site** (Vercel).

Se o site subir antes do SQL: as duas seções mostram o aviso amarelo "Pedido de IA ainda indisponível" (sem erro cru) e a lista de rascunhos aparece sem selo, com aviso. Se o SQL subir antes do Cloud Run: o pedido fica "Na fila" até o Cloud Run novo entrar (não perde nada, não gasta nada).

## Custo estimado (pela tabela de preços da Central de IAs)

A tela calcula com o preço cadastrado da IA principal de cada função (não usa número fixo). Com os preços de hoje:

- **Análise de uma questão** com Claude Opus 5.5 (US$ 4 entrada / US$ 20 saída por milhão): cerca de **US$ 0,06 típico** (≈ 1.500 tokens de entrada + 2.600 de saída) e **US$ 0,24 no pior caso** (12.000 de saída). Um pedido de 3 fica perto de **US$ 0,19** (máximo ≈ US$ 0,76); um de 10, perto de US$ 0,60. Se a reserva (gpt-6.1-sol, US$ 2/10) responder, fica na metade.
- **Conferência de rascunhos**: só regras = US$ 0. Fontes e atualidade: 1 chamada por rascunho cada, mas **só gastam se houver trecho de fonte oficial cadastrado** (sem acervo o resultado sai "insuficiente" sem chamar IA); revisão clínica: 2 chamadas por rascunho. Com a Verificação em gpt-6.1-sol, na casa de **US$ 0,01 a 0,03 por rascunho** com as três camadas; se a troca por outra empresa levar ao Claude Opus, aproximadamente o dobro. A estimativa mostrada é o valor típico e o máximo.
- O dado de hoje (busca de fontes: média de US$ 0,38 por tema com Opus 5.5) é de outra função (inclui as buscas na internet, US$ 0,01 cada, e muita leitura) e não entra nessas contas; a primeira rodada real deve ser pequena (1 a 3 itens) para comparar o gasto real, que aparece no pedido e na Central de IAs, com a estimativa.

## Testes (todos passaram)

- Novos: `analiseIaBanco` (19), `analiseIaWorker` (8), `analiseIaTelas` (15).
  - Banco: colar a migração 2x; etapas de fila (união); funções fechadas e RLS; prévia sem gravar; pedido válido enfileira; idempotência; limite de 10 e de 20 por dia (e volta no dia seguinte); pedido que falhou não gasta cota; aluno, editor sem área, revisor de outra área e anônimo barrados; IA desligada / interruptores / sem preço; análise publicada nunca entra; cancelar; tarefa morta fecha o pedido; os mesmos para rascunhos (20 por pedido, 60 por dia); triagem em todos os casos; aprovação bloqueada sem fonte; nada aprovado pela triagem.
  - Worker (IA falsa, sem rede): gera rascunhos só das questões do pedido, conferidas por regras, gabarito intacto, nada publicado, gasto em `ai_calls` com o preço da tabela; IA desligada deixa pendente sem gastar tentativa e termina quando a IA volta; parada de segurança; modo simulação; conferência de rascunhos usa IA de outra empresa (verificado: nenhuma chamada à empresa criadora), grava só nos rascunhos do pedido, não toca na `ai_review` antiga nem aprova nada; "conferir de novo".
  - Telas: estimativa antes de confirmar, limites 1 a 10 / 1 a 20, IA não pronta, cota curta, sem preço, andamento, cancelar, SQL antigo (aviso em vez de erro cru), selo/filtro/ordem, aprovação bloqueada, Registro em português.
- Rodados e passando junto: `registroAdministracao`, `registroAdministracaoBanco`, `contentHubDraftChecks`, `questionIntelligence`, `adminAbasVisiveis`, `engineSeed`, `adminContentPanels`, `sqieClosing`, `conferenciaOutraEmpresa`, `contentHubPipeline`, `contentHubProcessing`, `fontesOficiaisBanco`, `fontesOficiaisBusca`, `fontesOficiaisTelas`, `adminUsuariosOrdemMigracoes`, `fontesComplementaresOrdem`, `supabaseContentHub`, `aiCentralScreen`, `relatoIaProcessamento`, `contentLabFoundation`, `fontesComplementaresRodada2Termos`: 24 arquivos, 414 testes + os 42 novos.
- `npm run build`: passou.
- `tsc --noEmit`: 1831 erros, o mesmo número da base; nenhum nos arquivos novos ou alterados.

## Riscos e pontos de atenção

- **Estimativa é aproximada.** Usa caracteres ÷ 4 e saída típica de 2.600 tokens; o gasto real vem da Central de IAs. Na conferência de rascunhos o modelo que de fato responde pode mudar pela troca automática de empresa; a estimativa usa a IA da Verificação.
- **Chave de API ausente no Cloud Run** só aparece no próprio pedido (fica "Aguardando a IA" com o motivo); o banco só enxerga se a IA está ligada na Central.
- **Revisão clínica da conferência**: continua sendo opinião de IA (apontamento), nunca evidência; o selo "sem apontamentos" NÃO significa aprovado.
- **Aprovação bloqueada sem fonte oficial** vale também para rascunhos que já estavam aguardando: como hoje nenhuma fonte oficial A a D cobre os 200 rascunhos (a camada de regras já marcava "só cita material de terceiros"), enquanto não houver conferência com fonte, **nenhum dos 200 poderá ser aprovado**, e isso é de propósito. Para destravar é preciso cadastrar o documento oficial e rodar a camada Fontes (que passa a "compatível"). Confirme com o dono que é isso mesmo que ele quer.
- O selo vem só de conferências do MESMO texto: se o texto do rascunho mudar, volta a "Ainda não conferida".
- `app_draft_questions` agora calcula a triagem por rascunho (função SQL por linha); com 200 rascunhos é leve, com milhares ficaria mais lento.
- Pedido que ainda está "analisando" não pode ser cancelado (só na fila ou pendente).

## O que NÃO foi feito

- Nenhum teste contra IA, Supabase, Cloud Run ou Vercel reais; nada empurrado nem publicado.
- Não alterei gabarito oficial, telas do aluno, nem funções `app_admin_question*`, `practice_correction_view`, `tutor_truth`, `app_question_commentary`.
- Não criei teto global de gasto (decisão do dono); o controle é por pedido.
- Não rodei o teste de tela dentro do navegador real nem tirei capturas (só jsdom).
- Reanálise de questões (`questionReanalysis`, por mudança de fonte) continua só por linha de comando; fora deste pedido.
- Não há botão para "reprocessar" um pedido que falhou: o administrador faz um pedido novo (o que já foi gravado não é repetido nem pago de novo, por causa do cache de respostas e do filtro "só sem análise").

## Como o dono usa, passo a passo

**Análises de questões**
1. Administração, Central de Conteúdo, aba "Análise de questões".
2. No quadro "Gerar análises com IA", escolha a prova e a quantidade (comece com 1 a 3).
3. Leia a linha "Custo estimado" e quantas questões entram. Se aparecer aviso amarelo, ele diz o que ligar na Central de IAs.
4. Clique em "Pedir análise". Pode sair da tela; o andamento aparece em "Pedidos recentes".
5. Quando ficar "Concluído", as análises estão em "Rascunhos" e "Para revisar". Nada foi publicado: o revisor médico da área abre, confere e só então aprova.

**Questões inéditas**
1. Aba "Questões inéditas", quadro "Conferir com IA".
2. Escolha lote, área e quantidade; marque as camadas que quer (regras sempre rodam, sem custo).
3. Leia a estimativa e clique em "Pedir conferência".
4. Ao concluir, cada rascunho mostra o selo de triagem. Use "Triagem" e "Ordem" para começar pelos problemáticos ou pelos limpos.
5. Lembrete: o selo é só triagem. A IA não aprova: quem decide é o revisor médico. Rascunho "Sem fonte oficial: bloqueada" só pode receber "Pedir ajustes" ou "Recusar" até haver o documento oficial cadastrado.
