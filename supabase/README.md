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
| `migrations/…0900_review_api.sql` | Funções `app_*` do Caderno de erros (lista, correção, anotação) e do Desempenho |
| `migrations/…1000_flashcards_api.sql` | Funções `app_*` dos Flashcards: fila do dia, cartões pessoais e revisão com FSRS |
| `migrations/…1100_planning_api.sql` | Função `app_planning`: semana, dias estudados no mês e ritmo até a prova |
| `migrations/…1200_account_api.sql` | Conta (LGPD): exportar os próprios dados e excluir a conta |
| `migrations/…1300_admin.sql` | Administração: usuários, papéis, planos, questões (edição e importação), estações, configurações e registro de ações |
| `migrations/…1400_content_hub.sql` | Central de Conteúdo: taxonomia versionada, documentos e blocos, fontes, afirmações e evidências, unidades, aprovações, publicação e fila |
| `migrations/…1500_content_hub_worker.sql` | Funções do processamento (`ch_worker_*`, só a chave de serviço executa), registro das chamadas de IA, arquivos finais, monitoramento de fontes |
| `migrations/…1600_content_hub_panel.sql` | Apoio ao painel: revisor médico, regenerar materiais de uma versão, consumo de IA |
| `migrations/…1700_question_engine.sql` | Pacote do motor: classificação detalhada (só equipe), limpezas registradas, questões equivalentes, incidência real |
| `migrations/…1800_draft_questions.sql` | Rascunhos inéditos aguardando revisão médica |
| `migrations/…1900_answer_key_lockdown.sql` | Gabarito fora do alcance direto do aluno: colunas restritas e correção só depois de responder |
| `migrations/…2000_storage.sql` | Depósito privado `content-hub` (PDFs e arquivos finais) |
| `tests/bootstrap.sql` | Só para testes: imita o ambiente Supabase no PGlite |
| `seed.sql` | Gerado por `npm run supabase:seed` (não fica no Git) |

Regras que valem para tudo: RLS ligado em todas as tabelas; papel e plano nunca são escritos pelo navegador; o que exige confiança (nota da estação, plano, cota de IA) é escrito só com a chave de serviço, no servidor.

## Testes

```bash
npx vitest run src/__tests__/supabaseSchema.test.ts src/__tests__/supabaseSeed.test.ts
```

Rodam as migrações e a carga real num Postgres em memória (PGlite), sem Docker nem conta.

## Aplicar num projeto Supabase

Não é preciso instalar nada: a CLI roda por `npx`.

1. No painel do Supabase, copie para o `.env` (nunca para o chat nem para o Git):
   ```bash
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_DB_URL=<botão Connect → Session pooler → URI, com a senha do banco>
   SUPABASE_SERVICE_ROLE_KEY=<API Keys → service_role — secreta, só no servidor, nunca com prefixo VITE_>
   ```
2. Confira o que será aplicado, sem alterar nada, e depois aplique as migrações e a carga:
   ```bash
   set -a; source .env; set +a
   npx supabase db push --db-url "$SUPABASE_DB_URL" --dry-run
   npm run supabase:seed                      # gera supabase/seed.sql (5,6 MB)
   npx supabase db push --db-url "$SUPABASE_DB_URL" --include-seed
   ```
   A carga é idempotente (`insert … on conflict`): pode ser reaplicada quando o banco de questões mudar.
3. Só depois de aplicar, ligue o app ao Supabase no `.env`:
   ```bash
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<API Keys → anon / publishable — pública, vai para o navegador>
   ```
   Com essas duas linhas o `/novo` e a Central de Conteúdo deixam o banco local e passam a usar o projeto.
4. Em **Authentication → Providers**, ligue E-mail e Google (o Google pede client ID e secret do Google Cloud). Em **URL Configuration**, cadastre o domínio do app e `http://localhost:3000/novo`.
5. Crie a sua conta pelo app e promova-a a administrador (seção "Primeiro administrador", abaixo).

### O que o aluno consegue ler direto no banco

A chave `anon` é pública; o que protege os dados são as políticas (RLS) e as permissões por coluna:

- **Questões**: enunciado, área, tema e figuras. A resposta correta, a explicação das alternativas e a conduta esperada **não** são legíveis; a correção sai pelas funções `app_*`, só depois de responder a questão ou de finalizar a sessão (`…1900_answer_key_lockdown.sql`).
- **Classificação detalhada, rascunhos inéditos, Central de Conteúdo**: só equipe e revisores.
- **Dados de estudo** (sessões, respostas, flashcards, plano): cada aluno só os próprios.

## Liberar estações para os alunos

As 10 estações do seed entram com `medical_review = 'pending'` e só aparecem para editor/admin. Depois da revisão médica:

```sql
update public.checklist_stations set medical_review = 'approved' where id in ('seed-01', '...');
```

## Primeiro administrador (conta master)

No banco local (sem chaves do Supabase), a tela de login oferece **Criar conta master** enquanto não houver nenhum administrador.

No Supabase isso nunca é feito pelo navegador. Depois de criar a sua conta normalmente pelo app, rode no **SQL Editor** do painel do Supabase (troque o e-mail):

```sql
update public.user_roles set role = 'admin', updated_at = now()
where user_id = (select id from auth.users where email = 'seu-email@exemplo.com');
```

Depois disso, novos administradores e editores são definidos em **Administração › Usuários**. Toda alteração fica em **Administração › Registro**.
