# Textos legais 3.0 — como publicar, conferir, desfazer e trocar a versão depois

Ramo `termo-v3`. Migração `supabase/migrations/20261003013740_termo_v3.sql` (SQL único: estrutura, textos, troca da versão vigente e
conferência no fim). Desfazer: `supabase/desfazer/20261003013740_termo_v3.desfazer.sql`. Cópias prontas para colar (com `begin;`/`commit;`)
em `/Volumes/StaziaMed/.tmp-aulas/termo-v3/termo_v3_aplicar.sql`, `termo_v3_desfazer.sql` e `termo_v3_conferir.sql` (só leitura).

## O que fica desligado até o SQL
O site novo funciona com o banco de hoje exatamente como o site atual (Termo 2.0, textos do próprio site): as funções `app_legal_*` não
existem e ele usa a reserva. A troca para o 3.0 acontece **só quando o SQL é colado**.

## Ordem de publicação
1. Publicar o site do ramo `termo-v3` (Vercel). Conferir `/novo/termos` (ainda 2.0), `/novo/regulamento` (aviso "passa a valer junto com a
   versão 3.0"), login e cadastro.
2. Colar `termo_v3_aplicar.sql` no editor de SQL do Supabase (uma transação; se a conferência do fim falhar, nada muda).
   Pré-requisitos já no ar: 013660 e 013661. Não usar `supabase db push`.
3. Rodar `termo_v3_conferir.sql`: termo_uso 3.0 (`497d18a8…`), politica_privacidade 3.0 (`b7b4e4dd…`), regulamento 1.0 (`d7be859d…`),
   tutor_ia 2.0.
4. Conferir no site: `/novo/termos`, `/novo/privacidade` e `/novo/regulamento` mostram os textos 3.0; um aluno de teste vê "Atualizamos nosso
   Contrato", aceita e entra; Minha Conta → Documentos mostra o aceite; uma conta nova aceita a 3.0 no cadastro.
5. Conferir o IP de um aceite real: `select origin, host(ip) from public.legal_acceptances where version = '3.0' order by id desc limit 5;`
   (deve vir preenchido para tela de aceite e Google; para cadastro por e-mail, chega logo depois pela `app_legal_cadastro_ip`). Se vier
   vazio, a API do Supabase não está entregando o cabeçalho do IP ao banco: o aceite continua valendo, mas sem IP — avisar.

**Não colar o SQL antes do site**: o site antigo não tem o texto 3.0 e mostraria o 2.0 na tela de aceite da versão 3.0.

## Desfazer
Colar `termo_v3_desfazer.sql`. Volta o Termo 2.0 vigente e o site volta sozinho aos textos 2.0. Nenhum aceite é apagado (quem aceitou o
3.0 continua com a prova). Quem só aceitou o 3.0 verá a tela de aceite do 2.0. Colar o aplicar de novo religa o 3.0.

## Trocar o texto depois da revisão do advogado
Cada texto publicado fica guardado para sempre (`legal_texts`, não pode ser alterado). Texto novo = versão nova:

```sql
-- correção sem mudança relevante: MESMO grupo de aceite ('3.0') → ninguém precisa aceitar de novo; quem entra novo aceita a 3.0.1
select public.legal_publish('termo_uso', '3.0.1', 'Contrato de Assinatura e Termos de Uso', $texto$...texto completo...$texto$,
                            '3.0', true, '[]'::jsonb, true);

-- mudança relevante: grupo NOVO → todos os alunos veem a tela de aceite com o resumo do que mudou
select public.legal_publish('termo_uso', '3.1', 'Contrato de Assinatura e Termos de Uso', $texto$...texto completo...$texto$,
                            '3.1', true, '["Primeira mudança em uma frase.", "Segunda mudança."]'::jsonb, true);

-- Política ou Regulamento novos (vão junto no registro do próximo aceite do Contrato):
select public.legal_publish('politica_privacidade', '3.0.1', 'Política de Privacidade', $texto$...$texto$, '3.0', false, '[]'::jsonb, true);
```

Parâmetros: documento, versão, título, texto, grupo de aceite, guarda IP no aceite, resumo do que mudou, já tornar vigente.
O site não precisa ser publicado de novo: ele lê a versão vigente e o texto do banco. Guardar o texto também em
`src/novo/app/legal/textos/` (o teste confere que o da migração é igual).

Quem decide se a mudança é "relevante" (novo aceite) é o dono/advogado. O Contrato 3.0 (cláusula 6.5) chama de material a mudança que
afete preço, limites, direitos, dados ou o serviço, com aviso de 30 dias.

## O que o registro guarda (legal_acceptances)
Versão, data e hora do servidor, origem (cadastro, google, tela_aceite, tutor), navegador, e-mail em código (SHA-256), IP (versões com
`collects_ip`), código do texto aceito, versões e códigos da Política e do Regulamento vigentes, plano e situação da assinatura e o
identificador da conta (fica mesmo se a conta for apagada). A prova não pode ser alterada nem apagada; só a rotina de expurgo (5 anos,
ainda não feita) pode apagar, ligando `set app.legal_expurgo = 'on'` na própria transação.
