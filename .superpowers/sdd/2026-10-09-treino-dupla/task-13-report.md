# Relatório da Tarefa 13 (Etapa 4): baralho, "Deu match!" e sons

Ramo `treino-dupla-t13`, base `339c061` (já com as Tarefas 11 e 12). Só local: nada foi empurrado, nada de Supabase, GCP, Vercel nem rede.
Regra do dono (12/10): onde o pacote de design diverge do plano, o pacote manda no visual e nos textos. Pacote só lido (textos e medidas), nada executado nem copiado.

## O que foi construído
- **Sons** (`src/novo/app/dupla/sound.js`): apito (1.400 Hz, 2 s, vibra 800 ms), "Deu match!" e "pular", com os mesmos números do protótipo
  (App.jsx:1-32 e Match.jsx:30-88). `installAudioWake()` instala uma vez só. `soundOn()/setSoundOn()` usam `localStorage["sz-sound"]` ("off" desliga os três sons).
- **Baralho** (`deck.js`): `mergeDeck(atual, novo)`: quem continua mantém o lugar e ganha os dados novos; o cartão de cima fica até ser escolhido; quem
  saiu some; novos entram no fim. Também `firstName`.
- **"Deu match!" e convite** (`MatchModal.jsx`): `MatchModal` (Match.jsx:89-118, sem "Agendar sessão" e sem "Enviar mensagem"; fanfarra ao abrir; botão
  "Desativar som"/"Ativar som") e `InviteWatcher` (o convite mais novo e no prazo abre o modal; "Abrir sala agora" aceita e vai à sala; "Continuar
  buscando"/Esc recusa; o prazo usa a hora do servidor; erro do servidor vira aviso e o modal fecha).
- **Praticar** (`PracticeScreen.jsx`): `installAudioWake`, `useHeartbeat("livre")`, `useDuplaChannel({ radar })`, `<InviteWatcher>` e o baralho por
  `app_dupla_deck` (banco local a cada 20 s; ao vivo a cada 30 s; e ao voltar a aba ou a rede), com `mergeDeck`. Cabeçalho "{n} colegas online"
  (Presença, senão o `online` do baralho) e "{n} match(es) hoje"; dica de arraste (`SwipeHint`, "Fechar dica"); pilha com "Próximo: {primeiro nome}";
  "Pular" (←) e "Estudar junto" (→); resumo "{n} compatíveis · {k} ocultos pelo papel"; escolha por `app_dupla_swipe`; quem completa vê "Deu match!"
  (Abrir sala agora / Continuar buscando = `app_dupla_leave`); sala aberta vira o aviso "Sala aberta com {nome}" com "Abrir sala agora" e "Sair da sala",
  sem baralho.
- **Perfil** (`StudyProfileScreen.jsx`): quando há perfil salvo, `installAudioWake`, `useHeartbeat("livre")`, `useDuplaChannel({ radar })` com o radar SALVO
  (não o do rascunho) e `<InviteWatcher>` com o nome público salvo. Sem perfil salvo, nada disso (o componente `ProfileLive` nem é montado).

## Arquivos
- Criados: `src/novo/app/dupla/{sound.js,deck.js,MatchModal.jsx}`, `src/__tests__/duplaSom.test.ts` (8 testes), `src/__tests__/duplaMatchTela.test.tsx`
  (33 testes), `src/__tests__/helpers/fakeAudio.ts` (AudioContext de mentira), este relatório.
- Alterados: `src/novo/app/dupla/{PracticeScreen.jsx,StudyProfileScreen.jsx}`; `src/novo/ds/components/feedback/Dialog.{jsx,d.ts}` (ver desvio 6);
  `src/__tests__/duplaPraticarTela.test.tsx` e `duplaPerfilTela.test.tsx` (só o banco simulado ganhou deck/sinal/convites; no Praticar, o teste "nada do que
  ficou fora" agora espera "0 colegas online" e "0 matches hoje" e continua proibindo Convite rápido, Agendar sessão, Enviar mensagem etc.).

## Testes e resultados (pela fila, `--pool=threads --maxWorkers=1 --testTimeout=120000`, 12/10/2026)
- TDD: escrevi `duplaSom` e `duplaMatchTela` antes do código; sem `sound.js`/`deck.js` os dois arquivos falharam (erro de importação). `sound.js` ficou
  pronto antes da primeira rodada do `duplaSom` (rodei sem o arquivo para ver falhar, depois com ele: 8/8). A tela teve 4 falhas na primeira rodada
  (2 de relógio falso, 1 de espera, 1 de expectativa minha sobre o AudioContext); corrigidas nos testes, sem mexer em comportamento.
- Cobertos pelo plano: cabeçalho e "Próximo: Bruno"; ← pula com o som de pular e → estuda, teclas ignoradas em campo de texto e com janela aberta;
  quem completa (texto do protótipo, Abrir sala agora, Continuar buscando, Esc); quem recebeu o convite (aceitar, recusar, vencido, erro); Perfil (sinal
  "livre"/"fora", convite, radar salvo, sem perfil); baralho atualizado não troca o cartão de cima (Review Focus 2); sala aberta (Review Focus 3); som
  desligado e botão que alterna; sem Convite rápido/Agendar sessão/Enviar mensagem. Além do plano: singular/plural, erro ao escolher (o cartão volta com
  aviso), quem acabou de ser escolhido não volta por resposta atrasada, dica de arraste, estação do Banco vai no "Estudar junto", troca de papel recomeça
  a pilha, falha do baralho com "Tentar de novo", consulta a cada 20 s (local) e 30 s (ao vivo) com Presença, "Deu match!" aberto congela o baralho.
- 16 arquivos (todos existem) rodados juntos: `duplaMatchTela`, `duplaSom`, `duplaPraticarTela`, `duplaPerfilTela`, `duplaTempoReal`, `duplaFundacao`,
  `duplaComponentesBase`, `duplaComponentesEstacao`, `...EstacaoA`, `...EstacaoB`, `duplaEstacoesTela`, `duplaRotas`, `duplaSalaFases`, `playScreens`,
  `novoLocalBackend`, `segundaFaseEmBreve`: **291 testes passando**.
- `tsc --noEmit`: 1831 erros, o mesmo número da base; nenhuma linha nos filtros do plano (`src/novo`, `server/dupla`, `server/devDb`, `src/__tests__/dupla*`
  etc.). (Uma linha minha apareceu na primeira rodada, 1832, e foi corrigida.)
- `npm run build`: passou (vite build + servidor).
- NÃO feito: ver a tela num navegador (nenhuma captura, nenhum teste de arrastar com o dedo/mouse de verdade, nenhuma conferência visual do modo noite), nem o
  Realtime do Supabase de verdade (só simulado). Isso fica para o teste à mão com duas contas, como o plano descreve para o fim da Etapa 4.

## Divergências entre o plano e o pacote (o pacote mandou) e outros desvios
1. **Convite rápido (⚡): NÃO construído.** Não há ação própria no banco (T11) e a spec não define; o mapeamento óbvio seria o mesmo "Estudar junto", o que
   deixaria dois botões iguais com nomes diferentes. Dúvida para o dono abaixo.
2. **Não construídos (já decididos antes):** "Agendar sessão", "Enviar mensagem", "Busca automática de duplas", "Permitir convites diretos" e a coluna da
   direita (lista Online/Atores/Salas abertas) do pacote. A tela segue em uma coluna de 640 px, como na Tarefa 8.
3. **Singular:** o pacote escreve sempre "colegas online" e "compatíveis" (só trata singular em "match/matches" e "oculto/ocultos"). Usei "1 colega online"
   e "1 compatível" para não ficar errado com um colega só. Fácil de voltar ao literal se o dono preferir.
4. **Selo "{n} match(es)" no painel "Encontrar dupla"** (Match.jsx:153): o pacote tem e o plano não citava; coloquei (tom `brand`, o app não tem `accent`),
   com o mesmo número de "matches hoje" que vem do servidor (matches da pessoa, não de todos).
5. **Cores:** onde o pacote tinha branco/hex/rgba/escala própria, usei só tokens do app: dica de arraste (`#fff`, `#F29A8C`, `#7FD39A` → `--text-inverse`,
   `--red-200`, `--green-200`), botões redondos (`#fff` → `--surface-card`, `--danger-solid`, `--action-primary`), pilha (`--ink-50` → `--surface-subtle`),
   confete e anéis (`--mint-400` → `--green-200`, `--coral-600` → `--red-600`; o app não tem mint nem coral), avatares (`#fff` → `--gray-0`, como o MatchCard).
   O fundo da janela é o do Dialog do app (`--surface-overlay`); o pacote usava cinza translúcido com desfoque de 2 px, que não entrou.
6. **Dialog do app estendido** (`Dialog.jsx`/`.d.ts`, fora da lista de arquivos do plano): ganhou as props opcionais `className` e `label`, sem mudar nada para
   quem já usa. Motivo: o "Deu match!" tem as bolinhas e o confete ACIMA do título e o confete precisa sair da caixa (a caixa do Dialog corta o que passa), e
   sem `title` a janela ficava sem nome para leitor de tela (`label="Deu match!"`). As animações vieram do pacote (components.css:174-181) com nomes novos
   (`dupla-*`) dentro de um `<style>` no `MatchModal.jsx`, sem tocar CSS global; respeitam "reduzir movimento".
7. **Pilha:** o pacote gira o baralho (volta ao início); o baralho real não gira. "Próximo: {nome}" só aparece quando existe um próximo; com um cartão só, não há pilha.
8. **`--text-muted` não existe** nos tokens do app e a Tarefa 8 usou essa variável em "Arraste para a direita…"; troquei por `--text-tertiary` (o texto estava sem a cor prevista).
9. **Comando do botão/tecla:** o `command` do MatchCard é zerado depois de cada escolha. No protótipo ele ficava guardado e o cartão seguinte saía sozinho ao montar.
10. **Teclas ← →:** além de campo de texto, ignoram `select`, texto editável, Ctrl/Cmd/Alt e qualquer janela aberta (o "Deu match!" do Perfil também). Botões
    "Pular"/"Estudar junto" ficam sem clique (apagados) quando não há cartão.

## Decisões pequenas (fora do texto do plano; o dono pode mudar)
- "Estudar junto" leva a estação do Banco (`?estacao=`) **só** quando a estação foi achada na lista e só no gesto da direita; pular nunca falha por causa de estação.
- O cartão de cima fica mesmo que o servidor já não o traga (ficou offline, entrou em outra sala): é isso que o plano pede ("o de cima fica até ser
  escolhido"). Escolhê-lo só grava a escolha; não dá match sem ele estar online. Ao trocar o papel, a pilha recomeça do que o servidor mandar (senão alguém
  agora oculto pelo papel poderia ficar no topo).
- Quem acabou de ser escolhido não volta nesta tela nem se uma resposta atrasada o trouxer (o servidor já o esconde por 7 dias).
- Com o "Deu match!" aberto no Praticar, as consultas só atualizam os números; a sala nova não vira aviso "Sala aberta…" por baixo do modal.
- "Colegas online": Presença do canal quando existe (sem mim), senão o `online` do baralho; os números só aparecem depois do primeiro baralho (nada de "0" falso).
- `installAudioWake` cria o contexto de áudio na primeira interação mesmo com `sz-sound` desligado (igual ao protótipo); nenhum tom toca com o som desligado.
- Erro ao escolher: o cartão volta ao topo e aparece a mensagem do servidor. Erro ao sair da sala no "Continuar buscando": a mensagem aparece, o modal fecha e o
  próximo baralho mostra "Sala aberta com…" (com "Sair da sala").

## Dúvidas para o dono
1. **Convite rápido (⚡):** quer o botão? Hoje ele não tem função própria no banco. Se for só atalho do "Estudar junto", dá para pôr (um botão a mais), mas fica
   igual ao botão grande. Se for um convite direto sem passar pelo baralho, precisa de função nova no banco (a spec não define).
2. Singular "1 colega online" / "1 compatível" (o pacote só escreve no plural). Manter?
3. Texto novo desta tela: nenhum além dos que já estavam na lista do plano ("Sala aberta com {nome}").

## O que a junção exige
- Nenhum arquivo das Tarefas 14 e 15 foi tocado. Único arquivo compartilhado fora da lista: `Dialog.jsx`/`Dialog.d.ts` (mudança só aditiva); se outra tarefa
  mexer neles, juntar à mão.
- `go("dupla-sala", { sala })` já existe no `App.jsx` (rota `/dupla/sala/:roomId`).
- Dependem das funções da migração 9770 com os nomes e argumentos do bloco Interfaces: `app_dupla_deck`, `app_dupla_swipe(p_to, p_direction, p_station_id)`,
  `app_dupla_invites`, `app_dupla_answer_invite(p_invite_id, p_accept)`, `app_dupla_leave(p_room_id)`, `app_dupla_heartbeat(p_status, p_room_id)`.
- Como testar à mão (fim da Etapa 4): servidor local seguro, duas contas, `npm run dupla:sala-teste -- --preparar <email1> <email2>`, uma janela comum e uma
  anônima, criar os perfis, "Estudar junto" nas duas e conferir o "Deu match!" e as duas na mesma sala; conferir também o modo noite e o arrastar com o dedo.
