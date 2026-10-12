# Fase 1, grupo A: Central de Conteúdo, Documentos e Processamento

Ramo `adm-f1-a`, criado de `5d659d1` (o que está no ar). Nada foi empurrado, nada foi publicado e nenhum serviço real foi tocado (sem Supabase, Google Cloud, Vercel ou rede; nenhuma chave de produção usada nos testes). Faixa de migrações usada: `20261003009840` a `20261003009844` (a faixa pedida era 9840 a 9859).

## 1. O que foi feito, item por item

Cada item foi conferido no código de `5d659d1` antes de construir (a auditoria é de 11/10 e antiga).

| Item | Ainda era verdade em 5d659d1? | Estado | O que mudou |
|---|---|---|---|
| CC03 | Sim: `pipeline.ts` marcava `awaiting_review` mesmo sem rascunho nenhum (a linha 1089 e, no fim da etapa de rascunho, a conta nem olhava as unidades) | Construído | Documento que termina sem nenhum rascunho ganha a situação própria **"Sem rascunhos para revisar"**, com o motivo em português na linha do documento (sem afirmações, sem fonte oficial, sem tema, texto barrado pela conferência). A etapa de rascunho encerra o documento ali (não gera materiais nem revisão à toa). Se depois uma fonte nova faz a reconferência criar rascunhos, o documento passa sozinho para "Aguardando revisão" ao fim da revisão automática. Migração 9841 |
| CC05 | Sim: nenhuma estimativa nem teto por documento | Construído (estimativa + aviso + estrutura de teto DESLIGADA) | Botão "Calcular estimativa" na tela do documento (só administrador): pior caso pela mesma conta dos tetos, com o texto já lido; mostra o que é conhecido, o custo de uma chamada nas etapas que dependem das afirmações, o gasto já registrado e se o teto está ligado. Sem preço cadastrado, **não inventa valor em dólar**. Aviso no envio ("a leitura não usa IA... veja a estimativa no documento"). Teto por documento: tabela e funções criadas, nasce **desligado e sem valor**; ligado, o processamento para o documento (pendência, sem gastar tentativa) ao alcançar o teto. Tela em Configuração (administrador). Migração 9843 |
| CC06 | Sim: a falta de crédito caía no erro comum e, depois de 3 tentativas, o documento ficava "Falhou" | Construído | Erro de crédito ou cota (Claude, OpenAI, Gemini) vira **pendência** (sem gastar tentativa), com aviso claro no documento ("Sem crédito na IA: ... tenta de novo sozinho a cada 10 minutos. Recarregue o crédito"). Volta sozinho, no máximo a cada 10 minutos (cada volta é uma chamada que o provedor recusa na hora). Limite por minuto não conta como falta de crédito. A chamada que falhou continua registrada. Migração 9842 |
| CC07 | Sim: só o dono e o administrador viam o documento | Construído | Editor e administrador veem os documentos de qualquer pessoa da equipe (lista, detalhe, páginas, blocos, leitura direta). Aluno e revisor que não é da equipe continuam sem ver o dos outros. Migração 9840 |
| CC08 | Sim: o servidor baixava o PDF inteiro (até 300 MB) para a memória, calculava o hash e enviava de volta | Construído (em parte, ver limites) | O servidor agora lê o arquivo em pedaços só para calcular o SHA-256 e conferir `%PDF-`, e **copia dentro do próprio depósito** (sem baixar nem reenviar). Limite de 200 s com erro claro em português (504) e de tamanho (413). Depósito sem essas operações (banco de desenvolvimento) segue o caminho antigo. Não precisa de migração |
| CC09 | Sim: `referenceCleanup.ts` exigia licença que não existe mais | Construído | "Tirar marcas de terceiros" na tela do documento (só administrador): o administrador digita os nomes e endereços (um por linha), vê a prévia (antes e depois, nada gravado), aplica e pode desfazer. Sem nenhuma licença. O texto original nunca é alterado. Contatos com @ e avisos de direitos reservados também são achados. Migração 9844. **Nenhum campo de licença ou direitos foi recolocado** |
| CC10 | Sim: "O processamento começou." | Construído | Texto novo, verdadeiro: "Arquivo recebido e na fila. O processamento pega o arquivo na próxima passada (a tarefa passa a cada 1 minuto; se estiver ocupada com outro documento, ele espera a vez) e PDF grande leva mais tempo para terminar." O padrão do script de implantação (`deploy-pdf-worker.sh`) passou de 10 minutos para 1 minuto, para uma reimplantação não desfazer o minuto que já está no ar |
| CC11 | Sim: o servidor do site conferia as próprias chaves | Construído | Com relato novo do processamento (formato "Central de IAs"), o painel usa só o relato (as chaves da tarefa do Google). O site só confere as próprias chaves quando o processamento é o próprio servidor (desenvolvimento), ou quando ainda não há relato ou o relato é antigo |
| CC33 | (ação do dono, não é código) | **Depende do dono** | Abrir o documento da Apostila de Ginecologia e clicar **"Tentar de novo"** na etapa Afirmações. Nada foi feito em produção |

Itens já cobertos pela leva 4 (Análise de questões, Buscar fontes com IA, Questões Inéditas, trava de aprovação sem fonte oficial): nenhum dos meus itens cai nela. Nenhum deles estava já resolvido.

## 2. Arquivos

Migrações novas (faixa 9840 a 9844):
- `supabase/migrations/20261003009840_documentos_equipe_ve_todos.sql` (CC07)
- `supabase/migrations/20261003009841_documento_sem_rascunhos.sql` (CC03)
- `supabase/migrations/20261003009842_pausa_sem_credito.sql` (CC06)
- `supabase/migrations/20261003009843_teto_por_documento_desligado.sql` (CC05)
- `supabase/migrations/20261003009844_tirar_marcas_de_terceiros.sql` (CC09)

Servidor: `server/contentHub/pipeline.ts`, `router.ts`, `infra.ts`, `referenceCleanup.ts`, `costEstimate.ts` (novo).
Telas: `src/novo/app/admin/content/DocumentTools.jsx` (novo), `DocumentDetail.jsx`, `Documents.jsx`, `HubSettings.jsx`, `labels.js`.
Script: `scripts/cloudrun/deploy-pdf-worker.sh` (padrão do agendador: a cada minuto).
Testes novos: `src/__tests__/fase1aCentralDocumentos.test.ts` (36 testes) e `src/__tests__/fase1aCentralTelas.test.tsx` (7 testes). Testes antigos ajustados: `licensedAdaptation.test.ts` (retirada sem licença) e `reconferenciaInsuficientes.test.ts` (documento sem tema agora termina "Sem rascunhos").
Simulação de colagem: `.superpowers/sdd/fase1-a/colagem-3x.mjs` e `lib-retrato.mjs`.

## 3. Testes e verificações

- Testes pela fila (`--pool=threads --maxWorkers=2`), 47 arquivos distintos (os 2 novos, os 2 ajustados e 43 vizinhos da Central, das Fontes, da Central de IAs e das rotas), todos passaram: 630 + 355 testes ok (6 "esperados falhar" e 1 pulado já existiam).
- Os testes novos foram escritos junto do código; para provar que pegam o defeito, rodei os dois arquivos contra o código antigo (sem as mudanças em `server/` e nas telas): **24 dos 43 testes falharam** (os 19 que passaram são os do banco, porque as migrações novas continuavam presentes), e voltaram a passar com o código novo.
- `npm run build`: ok.
- `tsc --noEmit`: 1831 erros, igual à base, nenhum novo nos arquivos tocados.
- Simulação de colagem (banco de teste com as 103 migrações de `5d659d1`, depois as 5 migrações do grupo coladas 3 vezes): **15 colagens sem erro; 1ª x 2ª e 2ª x 3ª sem nenhuma diferença** (funções, gatilhos, políticas, permissões, colunas, restrições, índices e dados). Funções: 640 para 646 (6 novas, 0 removidas, 3 existentes mudam: `app_ch_documents`, `ch_assert_document`, `ch_worker_unblock`; nenhuma permissão de função existente mudou). 1 tabela nova (`ch_processing_settings`, com RLS e leitura só do administrador). Nenhum dado de tabela existente muda. Funções novas do servidor (`ch_worker_*`) só executáveis pelo serviço; as duas do administrador (`app_ch_*`) conferem `assert_admin`.
- Teste do "aluno barrado": aluno não vê documento nenhum (lista, detalhe e leitura direta das tabelas dão zero ou recusam); a estimativa e as marcas de terceiros são recusadas (403) para editor e aluno.

## 4. Como colar o SQL

Colar no Supabase, **antes** do site, nesta ordem, cada arquivo pode ser colado mais de uma vez sem estragar nada (conferido 3x):
1. `20261003009840_documentos_equipe_ve_todos.sql`
2. `20261003009841_documento_sem_rascunhos.sql`
3. `20261003009842_pausa_sem_credito.sql`
4. `20261003009843_teto_por_documento_desligado.sql`
5. `20261003009844_tirar_marcas_de_terceiros.sql`

Eles não dependem uns dos outros; dependem só do que já está no ar (tabelas da Central, `ai_calls` da Central de IAs, `assert_admin`). Não mexem na faixa de nenhum outro grupo.

Compatibilidade (o SQL é colado antes do site):
- **SQL novo + site antigo**: tudo continua como hoje. O editor passa a ver os documentos dos outros. O site antigo ainda não conhece "Sem rascunhos" (nenhum documento fica nessa situação enquanto o site antigo processa). O botão de marcas do site antigo não existe.
- **Site novo + SQL antigo**: a tela de "Sem rascunhos" cai no jeito antigo ("Aguardando revisão" com o mesmo motivo escrito, sem derrubar a etapa; testado); a estimativa funciona, só sem gasto e teto; a configuração do teto mostra "Disponível depois que a atualização do banco for aplicada"; a falta de crédito pausa o trabalho mas volta a cada passada (sem a espera de 10 minutos); "Tirar marcas" avisa em português que falta aplicar a migração 9844. Nenhum erro técnico chega ao dono.

## 5. Publicação do código

- Site (Vercel): leva as mudanças de `server/` e das telas.
- **Processamento (Cloud Run)**: precisa de imagem nova para CC03 (Sem rascunhos), CC06 (pausa sem crédito) e o teto por documento. Até a imagem nova, o processamento antigo continua terminando como "Aguardando revisão" e falhando sem crédito.
- Agendador: o script agora cria a cada minuto por padrão; quem já está no ar com 1 minuto não precisa mexer em nada.

## 6. O que o dono vê e testa

1. **Editor**: entrar como editor e ver na lista de Documentos os PDFs que outro editor enviou (abrir, ver páginas e texto lido).
2. **Documento sem rascunhos**: enviar um PDF sem fonte oficial cadastrada: ele termina com o selo "Sem rascunhos para revisar" e o texto do motivo, em vez de "Aguardando revisão".
3. **Estimativa**: abrir um documento como administrador, clicar em "Calcular estimativa". Sem preços cadastrados na Central de IAs, aparece "sem preço cadastrado" e os tokens não viram dólar.
4. **Teto por documento**: Configuração mostra o teto desligado. Para testar: ligar com um valor pequeno e ver o documento parar com aviso; desligar volta ao normal (lembrar de desligar).
5. **Marcas de terceiros**: no documento, digitar o nome do outro curso, "Ver prévia", "Aplicar" e "Desfazer".
6. **Aviso do envio**: depois de "Enviar e processar", o texto fala em fila e na passada a cada 1 minuto.
7. **Sem crédito**: difícil de testar sem gastar; o aviso aparece no documento como "Pendência: Sem crédito na IA...".
8. **CC33 (dono)**: Apostila de Ginecologia, "Tentar de novo" na etapa Afirmações.

## 7. Limites e riscos (honestos)

- **CC08 não é a solução completa do audit.** O audit sugeria também mover a conferência para o Google. Fiz a parte segura: não baixar o arquivo inteiro para a memória, não reenviar, e ter um limite claro. O servidor ainda lê o arquivo uma vez (em pedaços) para calcular o SHA-256; num arquivo de 300 MB na Vercel isso deve levar segundos (mesma região), mas **não foi medido com um arquivo real** (sem rede neste trabalho). Se um dia ficar lento, o próximo passo é o hash na tarefa do Google.
- **CC05 é estimativa de pior caso**, não promessa. Para as etapas que dependem de quantas afirmações a IA achar, mostra o custo de uma chamada e fica "parcial" até as afirmações existirem. O total em dólar só aparece com preço cadastrado; os preços e tetos continuam para depois do aplicativo pronto. O botão não impede o processamento (decisão do dono: construir só estimativa/aviso); quem quiser travar usa o teto por documento, que nasce desligado.
- **CC06**: a deteção olha o texto do erro do provedor (crédito, cota, cobrança, 402). Um texto novo de erro de um provedor pode não ser reconhecido e cair no comportamento antigo (3 tentativas e falha). A volta a cada 10 minutos gera uma linha de falha em `ai_calls` por volta enquanto não houver crédito.
- **CC03**: documentos antigos que já estão "Aguardando revisão" sem rascunho **não mudam sozinhos** (só os próximos processamentos). A fonte de referência lida (`source_index`, linha 500 de `pipeline.ts`) continua terminando em "Aguardando revisão" de propósito: mudar isso quebraria o fluxo das Fontes oficiais (leva 4); fica como ponto de decisão.
- **CC07**: ver o documento dos outros também deixa o editor revisar blocos, classificar e reprocessar etapas dele (as mesmas funções que já valiam para o dono). É o efeito esperado de a equipe trabalhar junta.
- **CC09**: a retirada é conservadora e só mexe no texto revisado. Nome muito curto (menos de 3 letras) é recusado para não apagar palavra comum. A antiga rota por licença e as tabelas de licença continuam no banco sem uso.
- **CC10**: outras telas ainda dizem "passa a cada 10 minutos" (Materiais visuais e Busca de fontes: `visual/VisualMaterials.jsx`, `visual/VisualEditor.jsx`, `SourceSearch.jsx`). Não mexi por serem de outros grupos; vale um ajuste de texto igual quando eles forem fechados.
- Em `reconferenciaInsuficientes.test.ts` troquei o que o teste esperava para documento sem tema ("Aguardando revisão" para "Sem rascunhos"): é a mudança pedida em CC03, não um defeito novo. A regra "a reconferência automática não muda o documento" continua valendo, com uma exceção deliberada: documento "Sem rascunhos" que ganha rascunhos passa a "Aguardando revisão".
