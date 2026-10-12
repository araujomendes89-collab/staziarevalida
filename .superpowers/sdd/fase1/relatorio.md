# Fase 1: junção das levas 4 e 5 (ramo `fase1`)

Ramo `fase1` = `leva5` (d98c484) + merge de `leva4` (d1869be). Nada empurrado, nada publicado, nenhum serviço real.

## 1. Junção de código
Conflitos de texto (os 3 previstos), todos resolvidos mantendo os dois lados:
- `server/contentHub/router.ts`: importações `runScheduledReanalysis` (leva 5) e `mountQuestoesStaziaMed` (leva 4).
- `QuestionAnalyses.jsx`: `<ReleaseNotice />` (leva 5) e `<GenerateAnalyses />` (leva 4) lado a lado.
- `fontesComplementaresOrdem.test.ts`: vale `98\d\d` (cobre 9800 a 9899).
Juntaram sozinhos: `pipeline.ts`, `auditLog.js`, `ContentHub.jsx`, `Units.jsx`, `labels.js`, `ui.jsx`, `HomeScreen.jsx`, `QuestionBuilder.jsx`, `server/ai/config.ts`, `registroAdministracao.test.ts`.
Ajuste de junção (1): `ch_reanalysis_waiting` (leva 5, 9872) lê `public.questions`; o catálogo da leva 4 (`questoesStaziaMedSoOficiais`) exige toda função que lê `questions` classificada. Classificada como "só oficiais, herda": só conta questão com pedido de atualização por mudança de fonte, e esse pedido nasce da ligação questão-afirmação, que só a análise (feita só com oficiais) cria. Não pus filtro `origin` na 9872 porque a coluna é da 9801 (leva 4) e a leva 5 precisa colar sozinha.

## 2. Testes, build, tipos (fila, --pool=threads --maxWorkers=2, nunca a suíte inteira)
- 234 nomes (233 arquivos de teste + 1 ajudante): todos os novos/ajustados das levas 4 e 5, ordem de migrações, Registro, Central, Fontes, Tutor/Nexus, Planos, Conta, login, aceite, menu, Suporte e as suítes de banco que citam as 123 funções da leva 4 e as 80 da leva 5. **3.709 testes passaram** (85+6 "esperados falhar" e 2 pulados que já existiam). Uma falha da junção (catálogo acima), corrigida; o arquivo passou em seguida (8/8).
- `npm run build`: passa. Bundle do worker (`scripts/content-hub/worker-job.ts` com o esbuild do Dockerfile): compila.
- `tsc --noEmit`: **1831 erros = base**.

## 3. Simulação de produção (`fase1-completo.mjs`, `logs/fase1-completo.txt`)
Base 23d53c1 + partes 1–7 + Arena + DESLIGAR tetos + 9610 + 9620/9621 + leva 3 (9700–9732). Depois, pelos PACOTES REAIS de Downloads: conferência 0 da leva 4, partes 1–4 da leva 4, conferência 0 da leva 5, partes 1–5 da leva 5, a sequência inteira 3 vezes.
- 27 colagens x 3: todas "OK" com conferências true (leva 4: 8, 8, 12, 6; leva 5: 9, 10, 11, 11, 9). As conferências 0 rodam antes e depois sem erro.
- 1ª x 2ª e 2ª x 3ª volta: nenhuma diferença (funções, ACL, gatilhos, políticas/RLS, colunas, restrições, índices, dados).
- Estado final x produção: funções 640 -> 780 (142 novas, 2 removidas = as versões antigas de 3 e 7 parâmetros que a 9830 da leva 4 unifica, 61 mudadas), 11 tabelas novas, políticas +11 -4, 6 gatilhos novos. Dados existentes com conteúdo diferente: `ai_settings`, `ch_taxonomy_nodes`, `tutor_config` (colunas novas da leva 5) e `exams` (a prova "Questões Inéditas", da leva 4).
- **Leva 4 -> leva 5 pelos pacotes = leva 4 -> leva 5 pelas migrações diretas = leva 5 -> leva 4**: mesma estrutura (funções, ACL, gatilhos, RLS, colunas, restrições, índices). Confirmado: o estado final já provado se mantém.
- Quadro pessoa x função no estado final: `matriz-permissoes-leva5-no-estado-final.md` (idêntico ao da leva 5 sozinha) e `matriz-permissoes-leva4-no-estado-final.md` (idêntico ao da leva 4 sozinha). Nenhuma permissão mudou por causa da outra leva.
- Colar arquivos antigos depois de tudo (`recolar-antigos.mjs`): 4 arquivos deixam resíduo (partes 1, 5 e 6 de 11/10 e o DESLIGAR), os mesmos 4 da referência sem nenhuma das levas. Os demais voltam a "tudo igual" se, depois, se recolam leva 3 (1–4), leva 4 (1–4) e leva 5 (1–5).

## 4. Documentos do dono
- `~/Downloads/publicacao-staziamed-2026-10-12-ORDEM-GERAL.txt`: ordem única (conferência 4, partes 1–4, conferência 5, partes 1–5, UMA imagem do Cloud Run, UM site) e a regra de recolagem.
- Os dois LEIA-ME ganharam um bloco "ORDEM GERAL" (a regra de recolagem mudou: com as duas levas, re-colar a 9610/9620/9621 ou partes da leva 3 pede recolar leva 3, leva 4 e leva 5 inteiras). Mais nada mudou nos pacotes; os arquivos SQL são os mesmos (hashes em `sha256-pacotes.txt`).
