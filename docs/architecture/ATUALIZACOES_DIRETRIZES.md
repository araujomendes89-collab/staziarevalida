# Atualizações & Diretrizes

> **Nome no app: Atualizações** (o dono pediu em 2026-10-06 para deixar só "Atualizações" no menu e no título). As tabelas e funções continuam `guideline_updates`/`app_guideline_*`.

Data: 2026-10-06. Pedido: trocar "Materiais oficiais e diretrizes" (app novo) por "Atualizações & Diretrizes" do app anterior, mantendo o design novo.

## O que existia

- **App anterior** (`src/components/materiais/ProtocolUpdatesHubView.tsx` + `src/data/protocolUpdatesData.ts`): 19 atualizações de conduta escritas no próprio código (não havia banco), com antes × agora, transição 2025/2026, o que lembrar para o Revalida, pegadinha, impacto clínico, fonte, questões de prova "afetadas", 5 flashcards e 1 questão inédita, além de lista, filtros e tabela comparativa.
- **App novo**: a rota `materiais` mostrava o protótipo com exemplos fixos ("Tela em reconstrução"). O motor de atualização do SQIE (fontes oficiais `ch_sources`, cartões `question_update_cards`) existe, mas em produção estava vazio (0 fontes, 0 cartões em 06/10/2026).

## O que foi conferido no conteúdo do app anterior (06/10/2026)

| Item | Resultado |
|---|---|
| 19 endereços "oficiais" | todos davam "página não encontrada" (404) |
| Selo de validação | as 19 traziam o mesmo selo "VALIDADO_OFICIAL_SUS" e a mesma "verificação" em 30/08/2026, sem registro de quem conferiu |
| Prioridade | as 19 marcadas como "muito alta" |
| 3 questões de prova citadas | não conferem com o banco oficial: 2022/2 Q14 é sobre dispareunia (citada como HPV), 2022/1 Q19 sobre gravidez ectópica (citada como pólio), 2021 Q45 sobre sulfato de magnésio, sem a alternativa "AAS 100 mg" citada |

Por isso o conteúdo entrou como **rascunho para conferência médica**: nada disso aparece ao aluno, e o painel mostra ao revisor o que não se sustenta.

## Como ficou

- **Banco** (`20261003004100_atualizacoes_diretrizes.sql`): tabela `guideline_updates` (área, tema, subtema, anos, prioridade, instituição, documento, data, endereço oficial, antes, linha do tempo por ano, conduta vigente, como cai no Revalida, pegadinha, impacto clínico, termos para o treino, flashcards, questões de treino, conferência, publicação, origem e dados do app anterior). RLS: aluno lê só o publicado; equipe e revisores leem tudo; escrita só pelas funções.
- **Regras** (as do SQIE): só um **revisor médico cadastrado na área** confere, com nota do que foi conferido e com o **endereço do documento oficial** registrado; a conferência guarda quem e quando. Só o **administrador publica**. Editar o que o aluno lê depois de conferido volta a conferência para pendente. Recusada não pode ser publicada. Publicada sem conferência mostra o aviso "Ainda sem conferência médica" na tela do aluno.
- **Tela do aluno** (`/novo/atualizacoes`; `/novo/materiais` redireciona): no layout de "Materiais oficiais" do novo design (busca e "Atualizações em destaque"; o quadro "Fontes aceitas" foi retirado a pedido do dono do produto) com as abas por grande área, filtros por ano, lista ou tabela comparativa (antes × agora; no celular, cartões). O detalhe tem cabeçalho com área, anos, prioridade e "Treinar questões deste tema"; "O que mudou na conduta" (antes × conduta vigente + transição por ano); "O que lembrar para o Revalida" (como cai, pegadinha, impacto clínico); "Fonte oficial" (botão só com endereço registrado); flashcards; questão de treino (marcada como não oficial). O selo "Conferido por revisor médico" só aparece com conferência registrada.
- **Treinar questões deste tema**: questões oficiais da área com os termos cadastrados (`search_terms`); sem termos ou sem achados, a área.
- **Administração › Atualizações** (equipe e revisores médicos): filtros (pendentes, conferidas, publicadas, vindas do app anterior), edição de todos os campos (linha do tempo, flashcards e questão de treino), aviso do que veio do app anterior, conferência (aprovar/recusar com nota) e publicação (administrador).
- Menu: "Estudar › Atualizações & Diretrizes" no lugar de "Materiais oficiais".

## Testes

`supabaseGuidelineUpdatesApi.test.ts` (banco: importação como rascunho, aluno não vê rascunho, quem confere e com quê, só admin publica, edição volta a revisão, filtros, cadastro e validações, segurança), `updatesScreen.test.tsx` (tela), `adminContentPanels.test.tsx` (painéis de Aulas e de Atualizações).

## Pendências

- Cadastrar os revisores médicos por área (Central de Conteúdo › Configuração) e conferir as 19 no documento oficial (ou recusar/apagar).
- Decidido pelo dono do produto em 06/10/2026: as 19 do app anterior ficam como rascunho até a conferência médica (nenhuma publicada antes).
- Ligar as atualizações ao acervo de fontes oficiais do SQIE (`ch_sources`) quando ele tiver documentos.
