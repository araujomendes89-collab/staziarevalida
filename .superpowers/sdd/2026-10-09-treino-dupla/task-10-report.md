# Relatório da Tarefa 10 (Etapa 3): rotas, acesso por plano, atalhos, painel e sala de teste local

Ramo `treino-dupla-t10`, pasta `.claude/worktrees/treino-t10`, partida `45c7dce` (Etapas 1 e 2 e Tarefas 6, 7, 8 e 9 já juntas).
Só local: nada foi empurrado, nada de Supabase, GCP, Vercel nem rede externa. O servidor local que subi para conferir usou o banco de
desenvolvimento (log `[central] banco: desenvolvimento` e `[dev-db] Banco de desenvolvimento pronto`), as chaves de produção em branco, a
porta 3011 e uma pasta de banco só minha (`DEV_DB_DIR`); foi encerrado pelo número do processo.
Nenhuma chave foi ligada em produção: a chave `treino_dupla` continua nascendo DESLIGADA na migração.

## O que foi construído
- **Rotas** (`App.jsx`): `/estacoes`, `/dupla`, `/dupla/perfil` e `/dupla/sala/:roomId` abrem as telas reais (StationsScreen, PracticeScreen,
  StudyProfileScreen, RoomScreen) dentro do `DuplaGate`; `Screen({ view })`; `go("dupla-perfil")`, `go("dupla-sala", { sala })` e
  `go("dupla", { estacao })`; títulos novos ("Banco de estações", "Praticar em dupla", "Meu perfil de estudo"); sem o aviso "Tela em
  reconstrução" nessas telas. Endereços desconhecidos continuam voltando ao início.
- **Acesso por plano**: `useSession().dupla` (lido de `app_dupla_access` junto do `app_bootstrap`; falha ou sem resposta vira `null`);
  `isPhase2Locked(role, access)`; `DuplaGate` (equipe ou `permitido` vê a tela; os demais veem o convite "Praticar em dupla" com "Ver planos",
  que leva à Conta). `AccountScreen` passa `dupla` nas duas chamadas de `isPhase2Locked`.
- **Aluno com a 2ª fase aberta**: a 2ª fase começa no Banco de estações; Início, Teoria, Meus PEPs, Paciente simulado e Desempenho aparecem
  apagados, sem clique e com "Em breve"; `/home2`, `/teoria2`, `/peps`, `/paciente`, `/desempenho2` e `/estacao` levam a `/estacoes`; o seletor
  de fase também leva às Estações.
- **Atalhos** (`Shell.jsx`): "Treinar estação" abre o Banco de estações e "Praticar" abre `/dupla`; o aluno não tem PEPs nem Paciente simulado
  (nem no menu do celular, que fica só com Estações e Praticar); a equipe mantém os dois. A sala fica sem cabeçalho, sem barra de atalhos e sem
  menu do celular (o menu lateral do computador continua, como no protótipo); Perfil de estudo e Sala marcam "Praticar" no menu.
- **Painel** (`AdminDupla.jsx`, aba Configurações): cartão "Treinamento em Dupla" com "Abrir para os alunos", "Teste grátis", "Pro", "Elite" e
  "Salvar configurações" (`app_admin_save_dupla`), com "Configurações salvas." Lê os valores de `app_admin_settings`.
- **Sala de teste local**: rotas `POST /api/dev-db/dupla/preparar` e `/dupla/sala-teste` (só em `createDevDbRouter`), o apoio
  `server/dupla/salaTeste.ts` e o script `npm run dupla:sala-teste` (`--fase`, `--preparar <e-mails>`, `--porta`).
- **Decisões do dono aplicadas** (reversíveis): o parágrafo "Arraste para a direita para estudar junto…" saiu do Praticar até a Etapa 4 (ficou um
  comentário `TODO(dono)` no código); o interruptor "Aparecer no radar de duplas" ficou com o texto atual; a chave nasce desligada e, desligada,
  só equipe e revisor médico entram (os demais veem "2ª Fase · Em breve").

## Arquivos
Criados: `src/novo/app/dupla/DuplaGate.jsx`, `src/novo/app/admin/AdminDupla.jsx`, `server/dupla/salaTeste.ts`, `scripts/dupla/sala-teste.ts`,
`src/__tests__/duplaRotas.test.tsx` (35 testes), `src/__tests__/duplaSalaTesteLocal.test.ts` (20 testes), este relatório.
Alterados: `App.jsx`, `Shell.jsx`, `session.jsx`, `admin/common.jsx`, `admin/AdminScreen.jsx`, `account/AccountScreen.jsx`, `server/devDb/router.ts`,
`package.json` (`dupla:sala-teste`), `dupla/PracticeScreen.jsx` (parágrafo escondido), e os testes `segundaFaseEmBreve.test.tsx`,
`admConfigEstacoesApp.test.tsx` e `duplaPraticarTela.test.tsx`.

## Testes e resultados (pela fila, `--pool=threads --maxWorkers=1 --testTimeout=120000`, 12/10/2026)
- Os 26 arquivos juntos (que existem = que rodaram): `duplaFundacao`, `duplaComponentesBase`, `duplaComponentesEstacao`, `…EstacaoA`, `…EstacaoB`,
  `duplaConteudo`, `duplaEstacoesTela`, `duplaEstacoesTeste`, `duplaMigracaoDados`, `duplaPerfilTela`, `duplaPraticarTela`, `duplaRealtimePoliticas`,
  `duplaRotas`, `duplaSalaFases`, `duplaSalaTesteLocal`, `duplaTelasBanco`, `supabaseSchema`, `segundaFaseEmBreve`, `supabaseAdminApi`,
  `adminAbasVisiveis`, `aiCentralScreen`, `telaAceite`, `termoSessaoAceitar`, `contaTermo`, `admConfigEstacoesApp`, `novoLocalBackend`:
  **389 testes passando**.
- Outros 16 arquivos que usam o App, a Sessão ou a Administração (cadastroTermo, celebration, loginScreen, termoPaginas, tutorAceite,
  correcoesAcessoTelas, equipeAcessoTelas, semRegrasDeLicencaTela, centralTelaAdm, adminContentPanels, adminUsuariosTela, estacoesAdminTela,
  adminPlayRegrasConferidas, podcastsTelas, admConfigEstacoes…): passaram (a única falha, no `admConfigEstacoesApp`, era o teste antigo que
  exigia o aviso de reconstrução no Banco de estações; atualizado, ver abaixo).
- `tsc --noEmit`: 1831 erros, o mesmo número da base; nenhuma linha nos filtros `src/novo`, `server/dupla`, `server/devDb`, `scripts/dupla`,
  `src/__tests__/(dupla|helpers/dupla|supabaseSchema|segundaFase)`.
- `npm run build`: passou.
- Conferi no servidor local (navegador sem tela): Banco de estações (equipe), Praticar, Sala em `setup`, menu "Em breve" do aluno, atalhos, painel
  salvando a chave (e `app_dupla_access` refletindo), e as telas no celular. Sem erro no console (só o aviso do canal de recarga automática do Vite,
  porque a porta 24678 já estava com outro servidor).
- Observação honesta sobre TDD: escrevi os testes junto com a implementação e só rodei depois; não registrei a fase "vermelha" de `duplaRotas` e
  `duplaSalaTesteLocal`. Dois testes meus falharam na primeira rodada por erro NO CÓDIGO (WhatsApp de teste com um dígito a menos e sala fechada
  com confirmações) e foram corrigidos no código.

## Desvios do plano e por quê
1. `isPhase2Locked(role, access)` também libera quando `access.permitido === true` (além de `aberto`). O plano dizia só `aberto`; sem isso o revisor
   médico não entraria com a chave desligada, e o dono decidiu que ele entra. Os três casos do plano continuam valendo.
2. Criei `server/dupla/salaTeste.ts` (a lógica das rotas de teste) em vez de pôr tudo no `router.ts`; o roteador só chama as duas funções.
3. A rota `sala-teste` aceita também `motivo` (opcional: `saiu`, `convite_recusado`, `convite_expirado`, `sem_sinal`; padrão `saiu`) e o script
   `--motivo`, para ver os três textos da fase "Encerrada". Sem `motivo` é exatamente o contrato do plano.
4. `sala-teste` fecha as salas abertas anteriores entre as duas contas de teste (uma sala aberta por dupla) e deixa o sinal das duas contas fresco.
5. `DuplaGate` também confere o papel (`boot.role`), além de `dupla`: se a leitura do acesso falhar (null), a equipe ainda vê as telas.
6. Atualizei dois testes antigos que descreviam o comportamento substituído: `admConfigEstacoesApp` (o Banco de estações real não tem o aviso;
   `/peps` continua tendo) e `segundaFaseEmBreve` (mocks das telas novas no lugar de `Phase2.Stations` e `Match.Pair`; rotas novas; chave ligada na Conta).
   Os testes `adminAbasVisiveis`, `aiCentralScreen` e `telaAceite` não precisaram do mock de `AdminDupla` (não renderizam a aba Configurações).
7. O menu lateral continua visível na sala (como no protótipo); só cabeçalho, atalhos e menu do celular saem.

## Textos novos (para o dono aprovar)
- Painel: título "Treinamento em Dupla", interruptor "Abrir para os alunos", grupo "Planos com acesso" (o plano pedia só os quatro rótulos; o
  grupo ficou por acessibilidade), "Teste grátis", "Pro", "Elite", "Salvar configurações", "Configurações salvas.".
- Menu do aluno: "Em breve" ao lado de Início, Teoria, Meus PEPs, Paciente simulado e Desempenho.
- Convite do plano (já do plano): "Praticar em dupla", "Encontre um colega com os mesmos objetivos e treine as estações da 2ª fase.", "Ver planos".
- Scripts e rotas de teste (só aparecem no terminal/banco local): "Fase inválida.", "Motivo inválido.", "Conta não encontrada: …", "Informe os e-mails das contas.".

## Dúvidas para o dono
- O texto do arraste ("Arraste para a direita para estudar junto, para a esquerda para pular.") volta com o baralho, na Etapa 4: confirmo que é isso?
- O cartão "Treinamento em Dupla" fica logo depois do cartão do aviso e antes do Nexus, com o próprio "Salvar configurações" (o painel de cima tem
  outro botão com o mesmo nome). Prefere um nome diferente (por exemplo "Salvar Treinamento em Dupla")?
- Hoje as telas do módulo ainda não enviam sinal de presença (isso é da Etapa 4): uma sala de teste fecha sozinha depois de 15 minutos parada.
  Basta rodar o comando de novo.

## O que a junção exige
- Esta tarefa fecha a Etapa 3. Arquivos que as próximas etapas vão mexer de novo: `App.jsx` e `Shell.jsx` (Tarefa 13 e 19: celular e acessibilidade),
  `session.jsx` (nenhuma mudança prevista) e `server/devDb/router.ts`.
- `AdminScreen.jsx` e `AdminPanels.jsx` também são mexidos pela frente das estações (migração 8000): a mudança aqui é só uma linha de importação
  e uma linha `<AdminDupla />` na aba Configurações; se houver conflito, juntar à mão mantendo as duas.
- O banco de teste precisa da migração 9750 e da 9760 (já nesta base). As rotas de teste só existem fora de produção.
- Migrações: nenhuma nova nesta tarefa.

---

# Como o dono testa (servidor local seguro)

Tudo abaixo roda só neste computador, com banco de teste; nada toca o Supabase de verdade.

## 1. Subir o servidor
Na pasta do ramo (`.claude/worktrees/treino-t10`, ou onde a prévia estiver), em um terminal, tudo numa linha só:

```
PORT=3000 NODE_ENV=development CONTENT_HUB_WORKER=0 VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= SUPABASE_DB_URL= npx tsx server.ts
```

Só vale se o terminal mostrar `[central] banco: desenvolvimento` e `[dev-db] Banco de desenvolvimento pronto`. Se não aparecerem, feche na hora.
Se a porta 3000 ou a 24678 estiver ocupada por outro servidor (hoje a 24678 está com o servidor do ramo `treino-dupla`), use outra porta
(`PORT=3011`, junto de `DISABLE_HMR=true`) e a mesma porta no passo 5 (`--porta 3011`); a página funciona do mesmo jeito.
Banco novo: a tela de entrada pede para criar a conta "master" (equipe). Para um banco limpo, aponte `DEV_DB_DIR=/pasta/nova` na mesma linha.

## 2. Como equipe (conta master)
Abra `http://localhost:3000/novo` e entre com a conta master.
- `/novo/estacoes`: Banco de estações com as 20 estações (10 de teste do INEP 2020 e 10 da carga, estas pendentes de revisão; a equipe vê todas).
  Teste os 5 blocos de área, as abas, a busca ("febre", "tosse"), "Ordem da prova" e "A–Z", Grade e Lista, e o clique numa estação (abre
  `/novo/dupla?estacao=…` com a faixa da estação).
- `/novo/dupla/perfil`: preencha o perfil de estudo, salve, recarregue a página e confira que voltou salvo; veja a prévia do cartão e os interruptores.
- `/novo/dupla`: Praticar com o seletor de papel, "Meu perfil de estudo", a faixa da estação escolhida e "Como a compatibilidade é calculada"
  (sem o texto do arraste, por enquanto).
- Modo noite (botão da lua no cabeçalho) em cada tela.

## 3. Painel e acesso por plano
- Administração › Configurações › "Treinamento em Dupla": a chave nasce desligada. Marque "Teste grátis", "Pro" ou "Elite", ligue e salve.
- Em outra janela (anônima), crie uma conta de aluno pelo cadastro. Com a chave DESLIGADA: o seletor mostra "2ª Fase · Em breve" e `/novo/estacoes`
  volta ao início. Com a chave LIGADA e só Pro/Elite marcados (o padrão): o aluno novo, que está no teste grátis, vê o convite "Praticar em dupla" com "Ver planos".
  Marque também "Teste grátis" e salve: as telas abrem para ele. No aluno com acesso, o menu mostra Início, Teoria, Meus PEPs, Paciente
  simulado e Desempenho com "Em breve", e os atalhos de baixo são só "Treinar estação" e "Praticar".
- Atenção: `npm run dupla:sala-teste` (passo 4) abre a chave sozinho e dá plano Pro às contas de teste; refaça o passo 3 antes dele se quiser ver o
  bloqueio.

## 4. Sala de teste, em todas as fases
Com o servidor de pé, em outro terminal na mesma pasta:

```
npm run dupla:sala-teste -- --fase setup
```

Fases: `roles`, `connecting`, `setup`, `running`, `review`, `result`, `closed` (para `closed`, `--motivo saiu|convite_recusado|convite_expirado|sem_sinal`).
Com outra porta: `--porta 3011`. O comando imprime o link `/novo/dupla/sala/<id>` e as duas contas:
`candidato@dupla.local` e `avaliador@dupla.local`, senha `dupla-local-123` (são criadas na primeira vez).
Abra o link em duas janelas (uma anônima), uma com cada conta, e confira cada fase como candidato e como avaliador:
- `roles` (papéis), `connecting` (conexão), `setup` (link, prontidão e cronômetro), `running` (impresso 1 liberado, PEP do avaliador com 3 marcações),
  `review` (conferência), `result` (resultado com nota e feedback de teste), `closed` (encerrada).
- Os botões da sala ainda não agem (isso é a Etapa 5); aqui só se vê a tela de cada fase. A sala fecha sozinha se ficar 15 minutos parada: rode o
  comando de novo.
- Para contas reais do banco local: `npm run dupla:sala-teste -- --preparar um@x.com outro@x.com` (Pro ativo, aceites, WhatsApp de teste, chave aberta).

## 5. Encerrar
`lsof -tiTCP:3000 -sTCP:LISTEN | xargs kill` (ou a porta usada) e conferir que nada ficou segurando a porta 3000 nem a 24678 por causa deste servidor.
