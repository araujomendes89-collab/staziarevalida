# Fase 1 — Grupo D: rotas e segurança do servidor + mensagens de erro de todas as abas

Ramo `adm-f1-d`, base 5d659d1. Nenhuma migração de banco (faixa 20261003009880–9889 não foi usada). Não há SQL para colar.

## Tabela dos itens

| Item | Estado | O que foi feito |
|---|---|---|
| TD01 | Construído | Tradutor de erros em português simples, usado por todas as abas. Frase pronta do banco passa inteira; erro técnico vira motivo + o que fazer; nunca sai texto técnico nem segredo. |
| RT03 | Construído | Inventário rota a rota (abaixo). 3 grupos sem nenhuma chamada foram desligados; "trocar de plano sem pagar" passou a ser só administrador; o resto continua (app antigo chama) e já exige administrador ou login. |
| RT04 | Construído | `/api/health` público mostra só `status` e `timestamp`. Os detalhes foram para `/api/ai/health` (só administrador). |
| RT05 | Confirmado, mantido | `/api/ai/*` e `/api/gemini/*` já eram só administrador (testes `aiSoAdmin` e `geminiSoAdmin`). NÃO removi: o app antigo (src/services e telas) ainda tem código que chama essas rotas, então "tem uso". Teste novo confere que sem login nenhuma chega à IA. |
| RT06 | Construído | Rota `/api/radar/updates` removida (4 notícias médicas fixas e inventadas). `AiService.fetchRadarUpdates()` devolve lista vazia sem chamar rede; `AppContext` não carrega mais as notícias de exemplo (ninguém as exibia). |
| RT07 | Construído | Conferência de login que falha devolve "Não foi possível conferir o seu acesso agora. Tente de novo em instantes." (o texto técnico vai só para o registro do servidor). Os demais erros dessas rotas passam pelo tradutor. |
| RT08, RT09, RT10 | Ação do dono | Passo a passo no fim, sem valores de segredo. |

## TD01 — como funciona

Arquivo único e puro: `src/shared/errors/explicarErro.ts` (`explainError`, `isReadableMessage`, `DEFAULT_ERROR_MESSAGE`). Vale igual nas telas e nos servidores.

1. Se a mensagem já é uma frase pronta em português (como as do banco: "Informe o tema.", "Acesso restrito à equipe."), ela passa inteira. Teste confere as 400+ mensagens fixas de `raise exception` das migrações: nenhuma é trocada (exceto "Cole antes a migração…", que só aparece no editor do Supabase).
2. Se é técnico, vira o motivo. Cobertos: falta de permissão (42501, row-level security), registro repetido (23505), item ligado a outros (23503), campo obrigatório vazio (23502), valor fora da regra (23514), formato inválido (22P02), texto/número grande demais (22001/22003), conflito ao mesmo tempo (40001/40P01), demorou demais (57014, timeout, 504), função/tabela/coluna que ainda não existe no banco (PGRST202, 42883, 42P01, 42703: "falta aplicar uma atualização do banco, avise a equipe técnica"), sessão vencida (JWT, 401), sem conexão (Failed to fetch, fetch failed, ECONN…), resposta que não era JSON, arquivo grande demais (413), muitos pedidos/limite (429, quota, overloaded), chave de IA inválida, modelo indisponível, IA recusou o conteúdo, login errado/e-mail não confirmado/e-mail já cadastrado/senha fraca, arquivo ou pasta de armazenamento não encontrado, e os números de erro "Erro 400/401/403/404/409/422/500/502/503".
3. Não reconhecido: texto padrão (ou o que a tela pediu). As frases traduzidas são fixas e não repetem nada do erro: chave, token e endereço com chave nunca saem. Frase em português com texto técnico dentro ("A IA do roteiro falhou: TypeError…") também é trocada.

Ligações:
- `messageOf` (src/novo/app/admin/common.jsx) agora chama o tradutor (mantém o segundo parâmetro de texto padrão).
- Telas que mostravam `error.message` cru passaram a usar o tradutor: Central de IAs (AdminAI, FunctionEditor), vozes oficiais, Central de Conteúdo (ContentHub, DocumentDetail, HubSettings, ui.jsx, VisualPreview), Podcasts, Aulas, e as 3 telas do Tutor que tinham `messageOf` próprio (ReportScreen, TutorGate, NexusScreen).
- Servidores (`server/auth/friendlyError.ts`: `shown`, `ACCESS_CHECK_FAILED`): podcasts, aulas, figuras das questões, Central de Conteúdo, materiais visuais, Central de IAs, assistente das abas, Tutor e Play.
- Não alterei: erros que o app mostra por regra própria (FlashcardForm, QuestionBuilder, AcceptanceScreen etc.), nem mensagens de tempo real da voz (useRealtimeVoice/useNexusVoice), que têm texto próprio por código.

## RT03 — inventário das rotas do app antigo (server.ts, createApp)

Todas usam o login do Firebase do app antigo. Nenhuma é chamada de dentro de `src/novo` (teste confere).

| Rota | Quem chama | Proteção | Decisão |
|---|---|---|---|
| `/api/entitlements` (plans, me, check, consume) | entitlementsClient.ts, PricingPage (app antigo) | login | Mantida |
| `/api/entitlements/upgrade-self` | entitlementsClient.upgradePlan, PricingPage | login → **agora administrador** | Fechada para aluno/editor: antes qualquer conta logada se dava Pro/Elite de graça. Quem chamava recebe 403 e a tela antiga trata como falha. |
| `/api/admin/users` | adminUserDirectoryClientService | login + ADMIN | Mantida |
| `/api/admin/design` | jcodesMoreCloneAdapter, jcodesmoreWorkerClientService | login + ADMIN | Mantida |
| `/api/admin/content/publication` | adminContentPublicationClientService | login + ADMIN | Mantida |
| `/api/admin/content` (editorial, PDF) | editorialExportClientService | login + ADMIN | Mantida |
| `/api/checklist-bank` | services/checklistBank/apiClient | login + papel | Mantida |
| `/api/admin/entitlements` | ninguém | login + ADMIN | **Desligada** |
| `/api/admin/flashcards/drafts` | ninguém | login + ADMIN | **Desligada** |
| `/api/published-content` | ninguém (o app antigo lê direto do Firestore) | login (qualquer um) | **Desligada** |

Os arquivos de código continuam em `server/routes/`. Cobrança (`/api/billing`, `/api/webhooks`) já tinha sido desligada em RT01/RT02.

## Arquivos

Novos: `src/shared/errors/explicarErro.ts`, `server/auth/friendlyError.ts`, `src/__tests__/explicarErro.test.ts`, `src/__tests__/errosAmigaveisRotas.test.ts`.
Alterados: `server.ts`, `server/routes/entitlements.ts`, rotas `server/{podcasts,lessons,contentHub,contentHub/visual,questions,ai,adminAssistant,tutor,play}`, `src/services/aiService.ts`, `src/context/AppContext.tsx`, `src/components/admin/AiModelSelector.tsx` (agora lê `/api/ai/health`), `src/novo/app/admin/common.jsx` e as telas citadas, testes `rotasAntigasPagamento` (novos blocos RT03–RT06) e `aiSoAdmin` (14 rotas, com `/api/ai/health`).

## Testes e resultados

- Fila, 100 arquivos (vizinhos das rotas, telas e tradutor + 4 novos/alterados + geminiSoAdmin): 99 passaram, 1 falhou por tempo (`aulasXpAteOFimRodada2Tela`, depende de relógio; rodando sozinho passa 5/5). 1498 testes passaram.
- `explicarErro.test.ts` (47): frases do banco intactas, 40 erros técnicos reais traduzidos sem texto técnico, segredos nunca saem.
- `errosAmigaveisRotas.test.ts` (10): conferência de login falhando em 7 rotas, erro no meio da operação, `upgrade-self` (sem login 401; aluno e editor 403, nenhuma troca; administrador 200).
- `rotasAntigasPagamento.test.ts` (17): sobe o servidor como na Vercel: `/api/health` só com `status` e `timestamp` (mesmo com chaves no ambiente), `/api/ai/health` sem login não abre, `/api/radar/updates` 404, três rotas sem uso 404, as que ficam respondem 401, `src/novo` não chama nenhuma.
- `npm run build`: ok. `tsc`: 1831 erros, o mesmo número da base; nenhum nos arquivos tocados.
- Simulação de colagem de SQL: não se aplica (sem migração).

## Compatibilidade

Sem SQL: site novo com SQL atual funciona; nada depende de ordem de colagem. Quem usa o site antigo (Firebase) e chamava `/api/health` para ver o projeto de IA agora recebe os detalhes só em `/api/ai/health` com login de administrador do app novo; na prática o seletor de modelos do app antigo já dependia desse login.

## O que o dono vê/testa

- Em qualquer aba, provocar um erro (ex.: tentar uma ação sem permissão ou com a internet desligada): a mensagem diz o motivo e o que fazer, em português.
- Abrir `/api/health` no navegador: aparece só `{"status":"ok","timestamp":…}`.
- `/api/radar/updates` não existe mais.

## Limites e riscos

- A tradução é por reconhecimento de padrões. Erro novo que não esteja na lista cai no texto padrão (ainda sem texto técnico). Se aparecer um caso comum que mostre o texto padrão, é só acrescentar uma regra em `explicarErro.ts`.
- A frase "falta aplicar uma atualização do banco" aparece quando o site novo roda com SQL antigo; é de propósito.
- `upgrade-self` fechado a aluno pode afetar a tela de planos do app antigo (que já não é aberta em produção: `/` redireciona para `/novo`). Stripe segue parada.
- RT05: as rotas antigas de IA continuam no código por haver chamadas no app antigo; se o dono decidir aposentar o app antigo, elas podem ser removidas depois.
- `SEED_RADAR_UPDATES` (dados de exemplo) continua no arquivo `src/data/knowledgeGraphData.ts`, sem nenhum uso.
- Não testado com Supabase real nem com a Vercel (regra do grupo).

## RT08, RT09, RT10 — passo a passo para o dono (sem mostrar valores)

Eu não tenho acesso ao painel da Vercel nem ao console do Google; estes passos são seus.

**RT08 — conferir os segredos que o servidor exige (Vercel > projeto staziamed-revalida > Settings > Environment Variables, ambiente Production):**
1. Confirme que EXISTEM (basta ver o nome na lista; não copie valores): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CRON_SECRET`.
2. IA: `VERTEX_API_KEY` (manda sobre `GEMINI_API_KEY`), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (ou o projeto da Vertex: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`).
3. Voz: `ELEVENLABS_API_KEY` (e as vozes `ELEVENLABS_VOICE_*`, se você usa).
4. Depois de qualquer mudança, faça um novo deploy para valer.

**RT09 — variáveis que o código atual não lê (candidatas a apagar):** `PAYMENT_WEBHOOK_SECRET` (só era usada pelo aviso de pagamento que foi desligado), `DEFAULT_AI_MODEL`, `APP_URL` (o código usa `APP_BASE_URL`), `SUPABASE_DB_URL` (não é lida pelo site), e as `VITE_FIREBASE_*` só se você decidir aposentar o app antigo. Para cada uma: anote o nome, apague, faça deploy e veja se o site abre. Na dúvida, deixe.

**RT10 — chaves do Google ligadas à conta padrão (console.cloud.google.com > APIs e serviços > Credenciais):**
1. Abra cada chave de API listada e veja o campo "Restrições de API".
2. Chave sem restrição ou que você não reconhece: apague (ou restrinja só às APIs que usa: Generative Language / Vertex AI).
3. Chave que o site usa (a mesma que está em `VERTEX_API_KEY`/`GEMINI_API_KEY`): restrinja às APIs necessárias e, se puder, ao serviço; não apague sem trocar a variável na Vercel antes.
4. Confirme em "Faturamento" que a chave está no projeto certo (não na conta padrão antiga).
