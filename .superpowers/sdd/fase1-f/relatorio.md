# Grupo F — Jornada do aluno da Fase 1 (ramo adm-f1-f, base 5d659d1)

Tudo abaixo foi conferido no código de 5d659d1 antes de construir. Nada foi publicado, nada foi enviado (sem push), nenhum serviço real foi usado.

## Itens: o que estava e o que foi feito

| Item | Estado | O que foi feito |
|---|---|---|
| B2 Recuperar senha: tela "Criar nova senha" | construído agora | Depois do link do e-mail, antes de qualquer tela do app, aparece "Criar nova senha" (nova senha + conferir, mínimo de 8 caracteres, mensagem de sucesso "Senha alterada com sucesso" e botão "ENTRAR NO APP"). Usa a sessão de recuperação do Supabase (aviso PASSWORD_RECOVERY e também o endereço com type=recovery, porque o aviso pode chegar antes do app estar ouvindo). Abrir o link não derruba a sessão mesmo com "Lembrar de mim" desmarcado. Visual do login (classes lg-, SecureSignupLayout). |
| B2 Link vencido ou já usado | construído agora | Aviso "Esse link venceu. Peça um novo." com botão "PEDIR NOVO LINK" (leva ao pedido de recuperação) e "Voltar para o login". Vale na entrada (erro no endereço) e no meio do caminho (sessão de recuperação vencida ao salvar). Erros de senha fraca, senha igual à anterior e falha de conexão em português. |
| B9 Menu do celular | confirmado no código e construído | Confirmado: a barra de baixo só tinha Início, Trilha, Estudar, Ranking e Perfil. Agora tem o botão "Mais" (6 botões, tamanhos que encolhem em 320 px) que abre uma lista com todas as áreas da 1ª fase (Plano de hoje, Trilha, Aulas, Grandes Temas, Atualizações, Questões, Simulados, Flashcards, Caderno de erros, Missões, Classificação, Conquistas, Desempenho, Análise, Planejamento, Nexus, Conta e ajuda, Sair; equipe vê Administração, revisor vê Revisão médica). Fecha com o X, Esc, toque no fundo ou ao escolher. Mostra o número de flashcards a revisar. Nada da 2ª fase entra (a 2ª fase continua só com "Em breve" e os atalhos dela não mudaram). |
| Maquete: sino "Alertas" e "Buscar" | escondido (não há função real) | Saíram o sino do cabeçalho, o sino decorativo da lateral e as caixas de busca da lateral (aberta e recolhida). Voltam quando houver função real. Registrado aqui. |
| B12 Contato de suporte (configuração única) | construído agora | Nova configuração única (tabela support_config), padrão suporte@staziamed.com.br. O administrador edita em Administração > Configurações > "Contato de suporte". O e-mail aparece no login, no cadastro, na recuperação de senha, na Conta (seção nova "Ajuda e suporte" e cartão "Seu plano") e nos avisos de acesso bloqueado. O visitante do login pode ler só esse e-mail. Se o SQL ainda não foi colado, vale o padrão (sem erro na tela). |
| B12 "Relatar um problema" | construído agora | Conta > Ajuda e suporte: o aluno escolhe a tela (já vem a tela de antes da Conta), escreve de 10 a 1000 letras e envia. Aviso na tela: não escrever senhas nem dados de pacientes. Chega em Administração > Configurações > "Relatos dos alunos": data, aluno (nome e e-mail), tela, texto; filtro Abertos/Resolvidos/Todos; "Marcar como resolvido" e "Reabrir" (fica no Registro com quem fez, sem copiar o texto do aluno). Banco: tabela student_reports com RLS (só o próprio aluno grava, só a equipe lê), gatilho que limita a 5 relatos por aluno em 24 horas e força estado "aberto", sem mudar nem apagar direto. Apagar a conta do aluno apaga os relatos dele. |
| B4 Aviso de acesso bloqueado | construído agora | Troquei "A assinatura pelo app ainda não está disponível" por "Para pedir acesso ou tirar dúvidas, fale com o suporte: <e-mail da configuração>." em: avisos de Início, Conta, Simulados, Tutor (tela do Tutor) e na mensagem do servidor do Tutor. Mensagens antigas que ainda vêm do banco (SQL antigo de simulado_gate) são trocadas na tela, então nada quebra com SQL antigo. Sem pagamento automático, sem preço, sem botão de assinar. O botão "Ver planos" virou "Ver meu plano" (leva à Conta). |
| B4 "Seu plano" na Conta | construído agora | Cartão "Seu plano" com "Teste grátis até DD/MM/AAAA", "Teste grátis encerrado em ...", "Plano pago até DD/MM/AAAA", "Plano pago encerrado em ...", "Sem teste nem plano pago no momento" (sem data inventada), nota de pagamento pendente quando for o caso, e o contato de suporte. As datas vêm da assinatura (trial_ends_at e current_period_end). Equipe não vê o cartão (já tem o próprio aviso). |
| Cobrança / Stripe / checkout | não feito (de propósito) | Nada de cobrança. |
| Aluno nunca vê ferramenta de IA de produção | mantido | Nenhuma tela de IA de produção foi tocada; os relatos e o contato ficam em Configurações (aba só do administrador). |
| Coberto pela leva 4 | nenhum item deste grupo | — |
| Depende do dono | ver "Dúvidas" | — |

## Arquivos principais

- Banco: `supabase/migrations/20261003009835_suporte_e_relatos.sql` (faixa permitida 9835 a 9839; usei só a 9835).
- Recuperar senha: `src/novo/app/auth/authLink.js` (novo), `src/novo/app/session.jsx`, `src/novo/app/AuthScreens.jsx` (NewPasswordScreen, tela de link vencido), `src/novo/app/App.jsx`, `src/novo/data/backend.ts` e `supabaseBackend.ts` (evento e novos códigos de erro).
- Celular e maquete: `src/novo/app/Shell.jsx`.
- Suporte: `src/novo/app/support/` (supportContact.jsx, ReportProblem.jsx, lastScreen.js), `src/novo/app/account/AccountScreen.jsx`, `src/novo/app/auth/LoginScreen.jsx`, `src/novo/app/admin/AdminSupport.jsx` e `AdminScreen.jsx`, `src/novo/app/admin/auditLog.js` (nomes no Registro).
- Acesso bloqueado: `src/novo/app/plan/planAccess.js`, `tutor/nexus/TutorGate.jsx`, `practice/QuestionBuilder.jsx`, `home/HomeScreen.jsx`, `server/tutor/engine.ts`.

## Testes

Todos pela fila, TDD parcial (os testes de comportamento novo foram escritos junto do código; os antigos que mudaram de texto foram ajustados).

- Novos: `recuperarSenhaNovaSenha` (11), `recuperarSenhaSessao` (5, ponta a ponta com backend simulado e sessão de verdade), `menuCelularMais` (7, larguras 390, 320 e 1400), `suporteTelas` (22), `adminSuporteTela` (9), `suporteRelatosBanco` (14, banco de verdade em PGlite: permissões por pessoa, RLS, limites, colar 3 vezes).
- Ajustados por mudança de texto pedida (B4): `planosTesteVencidoTelas` (aviso novo e "Ver meu plano"), `nexusEntrada` (nome do botão).
- Rodada final: 38 arquivos pedidos = 38 rodados (os 6 novos + vizinhos: login, cadastro, termo, aceite, Registro, abas da Administração, 2ª fase em breve, planos (telas e banco), acesso/equipe, Nexus, Tutor, simulados, usuários, Arena, ícones, conta). Resultado: 486 testes, todos passam. Em uma rodada com a fila cheia, `adminUsuariosTela` ("se uma página falhar...") estourou o tempo de 1 s e `recuperarSenhaSessao` estourou 5 s; os dois passam sozinhos e juntos (não tocam em nada de Usuários); aumentei os tempos do `recuperarSenhaSessao`.
- `npm run build`: passa.
- `tsc --noEmit`: 1831 erros, igual à base (nenhum novo; corrigi um erro de tipo no meu próprio teste).
- Simulação de colagem do SQL 3 vezes: `.superpowers/sdd/fase1-f/colagem-3x.mjs` (banco com as 103 migrações anteriores, depois a 9835 três vezes). Resultado: TUDO OK. A 1ª colagem só acrescenta (6 funções, 3 tabelas, 1 gatilho, 2 políticas; nada existente mudou, dados antigos intactos); a 2ª e a 3ª não mudam nada; o e-mail de suporte escolhido e os relatos enviados sobrevivem às novas colagens; permissões e "security definer com search_path vazio" conferidos.

## Passo de colagem do SQL (para o dono)

Colar no editor SQL do Supabase UM arquivo: `supabase/migrations/20261003009835_suporte_e_relatos.sql` (pode ser colado várias vezes; deve ser colado antes de publicar o site, como de costume, mas o site novo também funciona sem ele). Depende de migrações antigas que já estão no ar (admin, perfis, Registro). Para desfazer: o cabeçalho do arquivo lista os "drop".

Compatibilidade: site novo + SQL antigo: o contato aparece com o e-mail padrão, "Relatar um problema" mostra "O envio de relatos ainda não está disponível. Escreva para o suporte: ...", Configurações mostra "Ainda não está ativo: falta uma atualização do banco" nos dois painéis. SQL novo + site antigo: nada muda para o aluno.

## O que o dono vê e testa

1. Recuperar senha: pedir o link, abrir o e-mail (depende do SMTP, B1, que continua do dono), clicar no link: cai em "Criar nova senha"; salvar; "ENTRAR NO APP". Abrir o mesmo link outra vez (ou um link vencido): "Esse link venceu. Peça um novo." com botão.
2. Celular (390 px): barra de baixo com 6 botões; "Mais" abre a lista com Aulas, Simulados, Flashcards, Tutor (Nexus), Atualizações etc.; cabeçalho sem sino; lateral do computador sem busca.
3. Login/cadastro/recuperação: rodapé com "Precisa de ajuda? suporte@staziamed.com.br".
4. Conta: cartão "Seu plano" com as datas; seção "Ajuda e suporte" com o e-mail e "Relatar um problema". Com conta de teste vencido: Início, Simulados, Tutor e Conta mostram o novo aviso com o e-mail do suporte.
5. Administração > Configurações: "Contato de suporte" (trocar o e-mail e ver mudar no login) e "Relatos dos alunos" (ver o relato enviado, marcar como resolvido).

## Limites e riscos (honestos)

- Não abri o app em navegador nem no celular de verdade: a conferência do "Mais" e das telas foi por testes automáticos (jsdom). Falta olhar o visual no aparelho (tamanho dos botões em 320 px, a lista rolando, a tela "Criar nova senha").
- O fluxo real do Supabase (link do e-mail chegando) não foi testado de verdade (sem rede, sem SMTP): foi simulado. A detecção usa o endereço (type=recovery) e o aviso PASSWORD_RECOVERY; o padrão do Supabase é o que o app já usa (tokens no endereço). Se o painel estiver configurado para o fluxo com `?code=`, o aviso PASSWORD_RECOVERY cobre, mas isso só se confirma no teste real com e-mail fora do domínio.
- O e-mail de recuperação ainda não chega (SMTP, B1): continua com o dono.
- Os relatos mostram o e-mail do aluno à equipe (necessário para responder). O texto do aluno não vai para o Registro.
- A lista de relatos fica na aba Configurações, que só o administrador vê (o banco aceita editor também). Se quiser o editor lendo, é só mudar a aba.
- A mensagem de recusa do Tutor no servidor (engine.ts) não sabe o e-mail configurado; manda "veja o e-mail em Conta, Ajuda e suporte". A tela do Tutor mostra o e-mail certo.
- "Mais" não existe na 2ª fase (só a equipe a vê; não mexi nela).
