# Funções do Contrato 3.0 (ramo `termo-funcoes`) — como publicar, conferir, ligar e desfazer

Sai de `origin/main` eb5adc55 (Termo 3.0 no ar, 013740 aplicada). Migrações novas: `20261003013800_termo_copia_email_marketing.sql`
e `20261003013810_contas_inativas_expurgo.sql` (desfazer em `supabase/desfazer/`). Cópias prontas para colar (com `begin;`/`commit;`)
em `/Volumes/StaziaMed/.tmp-aulas/termo-funcoes/`: `013800_…_aplicar.sql`, `013810_…_aplicar.sql`, os `…_desfazer.sql` e
`termo_funcoes_conferir.sql` (só leitura).

## O que faz
1. **SEM cópia do contrato por e-mail** (decisão do dono, 18/10/2026: "Contrato não é enviado ao cliente, fica dentro do app dele.").
   O contrato aceito fica só em Minha Conta → Documentos (versão, data e hora do aceite, ler e baixar). A 013800 cria só a **fila de
   e-mails de serviço** (`email_saida`), usada pelo aviso de conta inativa (013810): a tarefa `/api/legal/email` (a cada 5 min) manda
   o que estiver na fila. Falha antes da entrega: tenta de novo (5 min, 30 min, 2 h, 12 h; na 5ª desiste). Caiu depois de mandar:
   não repete. Conta com e-mail não confirmado: espera até 30 dias. **Sem as variáveis SMTP, nada sai** (fica na fila).
2. **Marketing (fora do cadastro, decisão do dono de 17/10)**: a escolha é feita no **onboarding** com o componente
   `src/novo/app/account/MarketingPergunta.jsx` (pergunta, texto e os botões "Sim, quero receber" / "Agora não"; nada marcado; só o
   "Sim" grava, com a origem `onboarding`; "Agora não" não grava nada) e pela chave em Minha Conta → Privacidade e dados. Guarda a
   escolha com data, origem e o texto mostrado (`marketing_consents` + histórico `marketing_consent_log`). Ainda não existe envio
   de marketing. **Encaixe no onboarding** (ramo onboarding/pacote1, junção do Pacote 2): ver o comentário no topo do componente.
3. **Ajuda**: telefone/WhatsApp (41) 99903-1074, "de segunda a sexta, das 9h às 18h" (cláusula 1.3) e privacidade@staziamed.com.br.
4. **Conta inativa** (Política 3.0 seção 5; Regulamento 4.3) e 5. **expurgo dos aceites 5 anos depois do fim do contrato**: rotina
   diária `/api/legal/diaria`, **desligada** (só relatório). Detalhes e chaves no topo da migração 013810.
6. **Criar conta**: "Mínimo de 8 caracteres." ao sair da Senha; "As senhas não são iguais." ao sair do Conferir senha ou quando o
   tamanho já bate.

## Variáveis a criar na Vercel (Production; nunca no código)
| Variável | Valor |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | a conta do Google Workspace **dona da senha de app** (e-mail completo) |
| `SMTP_PASSWORD` | a senha de app de 16 letras (com ou sem espaços) |
| `SMTP_FROM` | `nao-responda@staziamed.com.br` |
| `SMTP_FROM_NAME` | `StaziaMed` |
| `APP_BASE_URL` | `https://app.staziamed.com.br` (opcional; é o padrão) |
`CRON_SECRET` já existe (tarefas do Play/Tutor). Se `SMTP_USER` não for a própria nao-responda, ela precisa ser um alias "Enviar
como" dessa conta no Gmail, senão o Google troca o remetente. Os nomes são os mesmos do ramo `fase1-compra` (avisos de cobrança):
um conjunto só serve aos dois.

## Ordem de publicação (SQL antes do site)
0. **Antes de tudo: "Confirm email" ligado no Supabase** (Authentication → Providers → Email). Sem ele, a conta já nasce "confirmada"
   e o aviso de conta inativa pode ir para um e-mail digitado errado ou de outra pessoa (revisão LGPD).
1. Colar `013800_…_aplicar.sql` e depois `013810_…_aplicar.sql` no editor de SQL do Supabase. **Nunca `supabase db push`.**
   Cada uma confere tudo no fim e, se algo não bater, para sem mudar nada. Podem ser coladas de novo.
2. Rodar `termo_funcoes_conferir.sql`: estrutura "ok", chaves todas `false`, permissões todas `false`.
3. Criar as variáveis SMTP na Vercel (pode ser depois: até lá a fila só acumula).
4. Publicar o site do ramo (Vercel). O `vercel.json` ganha as tarefas `/api/legal/email` (*/5) e `/api/legal/diaria` (4h20 UTC).
5. Conferir: criar uma conta de teste (sem caixa de marketing no cadastro) → **nenhum e-mail com o contrato chega**; Minha Conta →
   Documentos mostra o contrato com a versão e a data do aceite; Minha Conta → Privacidade e dados mostra a chave de marketing
   desligada;
   Ajuda mostra telefone e horário; o relatório da rotina aparece em `app_rotinas_conta_log` com modo `ensaio`.

Site antes do SQL também funciona (as chamadas novas falham em silêncio e a chave de marketing não aparece); SQL primeiro mesmo assim.

## Ligar as rotinas (decisão do dono)
```sql
update public.app_rotinas_conta_config set inativas_avisar = true, updated_at = now();   -- manda os avisos (11 meses sem acesso)
update public.app_rotinas_conta_config set inativas_agir = true, updated_at = now();     -- faz o que o aviso disse, depois do prazo
update public.app_rotinas_conta_config set expurgo_ativo = true, updated_at = now();     -- apaga aceites 5 anos depois do fim
```
Como todas as contas de hoje contam como vistas no dia da migração, a rotina só encontra alguém daqui a 11 meses.

## Desfazer
Colar `013810_…_desfazer.sql` e depois `013800_…_desfazer.sql`. Nenhum aceite é tocado. Sai junto a fila, o histórico de marketing e a
prova dos avisos (o arquivo diz como guardar antes).

## Juntar com o ramo fase1-compra
`fase1-compra` tem `server/avisos/smtp.ts` (mesma ideia, mesmas variáveis). Ao juntar: ficar com `server/email/smtp.ts` (este; tem
anexo e o "talvez entregue" para não repetir) e apontar `server/avisos/avisos.ts` para ele. As filas continuam separadas (avisos de
cobrança na 013760, aviso de conta inativa na `email_saida`).
