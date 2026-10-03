# Supabase — banco do app novo

Esquema, políticas de acesso (RLS) e carga do StaziaMed no Supabase.

## O que tem aqui

| Arquivo | Conteúdo |
|---|---|
| `migrations/…0100_core_users.sql` | Perfil, papel (aluno/editor/admin) e assinatura; cadastro cria perfil + 7 dias de teste |
| `migrations/…0200_content.sql` | Provas, 1.200 questões (com busca em português) e flashcards |
| `migrations/…0300_study.sql` | Sessões, tentativas (acerto calculado pelo banco), FSRS, plano do dia, caderno de erros e visões de desempenho |
| `migrations/…0400_checklist_bank.sql` | Estações, simulados, sala em dupla com a máquina de estados no banco, convites |
| `migrations/…0500_billing_ai.sql` | Uso de IA e eventos de pagamento (só o backend escreve) |
| `migrations/…0600_app_api.sql` | Funções `app_*` da estrutura do app: dados de abertura e perfil |
| `migrations/…0700_practice_api.sql` | Funções `app_*` de Questões, Simulados e da sessão: sorteio, resposta, correção e placar; questões marcadas |
| `migrations/…0800_home_api.sql` | Funções `app_*` do Início e do Plano de hoje: números do aluno e tarefas do dia montadas pelo histórico |
| `tests/bootstrap.sql` | Só para testes: imita o ambiente Supabase no PGlite |
| `seed.sql` | Gerado por `npm run supabase:seed` (não fica no Git) |

Regras que valem para tudo: RLS ligado em todas as tabelas; papel e plano nunca são escritos pelo navegador; o que exige confiança (nota da estação, plano, cota de IA) é escrito só com a chave de serviço, no servidor.

## Testes

```bash
npx vitest run src/__tests__/supabaseSchema.test.ts src/__tests__/supabaseSeed.test.ts
```

Rodam as migrações e a carga real num Postgres em memória (PGlite), sem Docker nem conta.

## Aplicar num projeto Supabase

1. Crie o projeto em supabase.com, região **South America (São Paulo)**. Sugestão: um projeto de desenvolvimento e outro de produção.
2. Instale e conecte a CLI:
   ```bash
   brew install supabase/tap/supabase
   supabase login
   supabase link --project-ref <ref-do-projeto>
   ```
3. Aplique as migrações e a carga:
   ```bash
   supabase db push
   npm run supabase:seed
   psql "<connection string do projeto>" -f supabase/seed.sql
   ```
4. Em **Authentication → Providers**, ligue E-mail e Google (o Google pede client ID e secret do Google Cloud). Em **URL Configuration**, cadastre o domínio do app e `http://localhost:3000`.
5. Variáveis no `.env` (nunca no chat nem no Git):
   ```bash
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<chave anon — pública, vai para o navegador>
   SUPABASE_SERVICE_ROLE_KEY=<chave de serviço — só no servidor, nunca com prefixo VITE_>
   ```

## Liberar estações para os alunos

As 10 estações do seed entram com `medical_review = 'pending'` e só aparecem para editor/admin. Depois da revisão médica:

```sql
update public.checklist_stations set medical_review = 'approved' where id in ('seed-01', '...');
```
