# Tutor Nexus: tela única, escolha do professor e voz pelo motor Stazia (ElevenLabs só como voz) — especificação

Data: 2026-10-07. Estado: **aprovada pelo dono em 2026-10-08** ("continuar siga"), com as sugestões do §15 e as decisões de 2026-10-08 no §2.
Base técnica: o estudo `.superpowers/tutor-nexus/design-recomendado.md` (3 desenhos, 2 juízes), a revisão do trabalho
guardado no commit `25c079d` (ramo `trabalho-solto-2026-10-07`) e uma conferência desta especificação contra o código
(47 apontamentos, todos tratados aqui). Onde o estudo e o dono discordam, vale o dono (ex.: a reserva com a voz atual e o
limite de 5 minutos por dia).

## 1. O pedido
O dono definiu a arquitetura: **a ElevenLabs é só a camada de voz**. Todo o comportamento — conhecimento médico, memória,
regras pedagógicas, personalidade e emoção — fica no Stazia:

aluno → microfone → transcrição → **motor do Stazia Tutor** (conhecimento, contexto, histórico, desempenho, memória,
personalidade, regras, dificuldade, Emotion Engine) → resposta em texto → **Speech Director** → ElevenLabs → áudio → esfera.

A ElevenLabs nunca decide o que falar nem quando ficar irritada, não conhece o aluno, não corrige e não controla a
personalidade. Só o Speech Director, no servidor, escolhe as marcações de voz (como `[angry]`): o prompt proíbe a IA de
escrever marcações entre colchetes, e o servidor ainda troca colchetes por parênteses antes de mandar o texto.

Pediu também: o Tutor mostra **só a tela Nexus**, e dentro dela o aluno **escolhe o tipo de professor**.

## 2. Decisões do dono (2026-10-07)
| Assunto | Decisão |
|---|---|
| Professores e vozes | Três: **Tranquilo** (a personalidade preguiçosa), **Durona** (a mesma de hoje), **Direto** (ele mesmo). Vozes `ELEVENLABS_VOICE_TRANQUILO`, `_DURONA`, `_DIRETO` (já na Vercel, com `ELEVENLABS_API_KEY`). |
| Caminho de voz | Fazer microfone → transcrição → motor Stazia → ElevenLabs → esfera **dentro da Nexus**. |
| Escolha do professor | Na Nexus, **antes** de começar. Uma conversa nunca troca de professor. |
| Durona | Sobe a irritação já no **1º erro** (firme, ~0,25). Quando o aluno **acerta**, mostra **alívio e solta um palavrão** (regras no §4). |
| Direto | Continua xingando também ao **comemorar**. |
| Limite de voz | **5 minutos de fala do professor por aluno por dia** (~4.500 caracteres) no teste grátis de 7 dias. Passando disso, segue pelo Chat e pela voz que já existe. Terminado o teste, vale o bloqueio automático do Tutor (já existe). Pacotes e recarga de minutos: projeto próprio. |
| Tela única | Antes de começar: o professor e, se quiser, um modo (padrão: a conversa livre, que no app se chama "Perguntar ao Tutor"). Conversas anteriores num botão "Histórico". O botão Chat continua. |
| Transcrição | Pela **OpenAI**: o áudio não é guardado, fica só o texto. |
| Reserva | Sem voz ElevenLabs aprovada ou sem créditos, a esfera usa **a voz atual** (Gemini/OpenAI ao vivo) como reserva. |
| Aprovação das vozes | **Botão no painel** "Vozes do Nexus". Só o dono aprova; "Revogar" desliga na hora. |
| Plano ElevenLabs | **Subir de plano antes** de abrir aos alunos. Até lá, a voz ElevenLabs fica só para a equipe. |
| Nome do aluno na voz | O primeiro nome do aluno **pode ir** dentro do texto que vai para a ElevenLabs. |
| Ordem | Depois do Termo de aceite e cadastro (**publicado em 2026-10-08**, com o aceite do §34 antes do primeiro uso do Tutor). |
| Fornecedores no texto (2026-10-08) | **Não nomear** OpenAI, Google nem ElevenLabs na Política nem nos avisos do app. Vale a Política de 07/10/2026, que fala de "IA e voz" de forma geral; nenhum texto jurídico novo é pré-requisito. |
| Limites e créditos (2026-10-08) | Nesta etapa os limites seguem em minutos/caracteres, **todos editáveis no painel**. A conversão para "créditos de IA" (1 mensagem = 1, 1 min de voz = 4) vem no projeto de pagamentos (pausado). |

## 3. Fora desta etapa
- Pacotes (entrada, intermediário, avançado), recarga avulsa de minutos e pagamento (projeto próprio). Aqui só deixamos o
  limite por plano e a contagem de uso por aluno.
- **Fase 2:** voz frase por frase (streaming), falar por cima do professor, frases de espera gravadas e modelo mais rápido.
- Questões Inéditas e os assistentes de IA nas outras abas (projetos próprios).

## 4. Os três professores
- O aluno vê só três professores: **Tranquilo**, **Durona** e **Direto**.
- **Tranquilo** usa o id técnico `acolhedor` (para não quebrar preferências) com o jeito do Professor Preguiçoso, que
  existe no banco desde o Tutor v1 (desligado): descontraído, levemente irônico, faz o aluno pensar antes de explicar e
  **nunca xinga**.
- **Durona**: a mesma de hoje, com a escalada abaixo.
- **Direto**: ele mesmo. Como hoje, fala solto desde a primeira fala, com gíria e palavrão leve ("pô", "putz"). Palavrão
  pesado só com irritação alta e **ao comemorar** (qualquer comemoração: acerto difícil, sequência de acertos ou acerto
  depois de errar).
- Os perfis antigos do Tutor v1 continuam guardados e desligados. A preferência de quem estiver num deles passa a ser
  Tranquilo. O Questionador (criado no trabalho guardado e nunca publicado) não entra.
- **Palavrão:** vale o teto do painel do Tutor (sem, leve ou moderado) e a regra de hoje: o palavrão vem do professor
  escolhido (Durona e Direto: até o teto do painel; Tranquilo: nunca). O aluno não tem botão para desligar o palavrão: quem
  não quer palavrão escolhe o Tranquilo. Com o teto abaixo de "moderado", Durona e Direto mostram a mesma emoção com
  palavras mais leves.

**Escalada emocional (o motor decide; a voz só atua). Os números são valores iniciais, ajustáveis nos testes:**
| Momento | Durona | Direto | Tranquilo |
|---|---|---|---|
| 1º erro | **firme** (humor novo, só dela): irritação entre 0,25 e 0,40, sem sorteio nesse passo | seco, como hoje (no máximo palavrão leve) | calmo |
| 2º erro seguido | frustrada, ~0,45 | mais exigente | leve ironia |
| 3º erro seguido no mesmo conceito | irritada, ~0,70 | pode soltar palavrão pesado (irritação alta) | calmo, mais insistente |
| Acerto logo depois de ≥1 erro seguido | **alívio** (humor novo): a irritação cai para no máximo 0,40, com **palavrão sobre a situação** (ex.: "Ufa, porra, até que enfim!") | comemora **com palavrão** (ex.: "Isso, porra. Essa era difícil.") | reconhece de leve |
| Acerto sem erro antes | reconhece do jeito dela, como hoje | reconhece; em acerto difícil ou sequência de acertos, comemora com palavrão | elogia de leve |
- Muda a "inércia" de hoje (um acerto depois de erros mantém a Durona brava e o motor pede "reconheça pouco"): para a
  Durona, o acerto logo depois de erro vira alívio naquele turno, mesmo com irritação alta; para o Direto, vira
  comemoração. O texto do jeito da Durona no banco ("reconhece meio a contragosto") muda junto.
- O palavrão é sempre sobre a situação, **nunca contra o aluno**. A conferência de segurança continua barrando ofensa ao
  aluno.
- Na voz: perfis "firme" e "alívio" no Speech Director. Se a ElevenLabs não tiver marcação de alívio, no `eleven_v3` o
  alívio vem do ritmo e do estilo (nesse modelo a estabilidade fica fixa); no `eleven_multilingual_v2`, também da
  estabilidade. Confirmado só na audição.

**Histórico (conversas antigas):**
- Conversa encerrada abre só para leitura, com o resumo e "Conversar de novo" (conversa **nova**, mesmo professor).
- Conversa que ficou aberta continua de onde parou, com o mesmo professor, pelo caminho de voz novo.
- Conversas criadas com o Acolhedor antes da troca e as de perfis desligados ficam só para leitura, com o nome original e
  a frase "Este professor mudou. Comece uma conversa nova." Assim nenhuma conversa troca de professor no meio.

## 5. A tela única Nexus
**Entrada (antes de começar)**, sobre o fundo escuro da esfera:
- três cartões — **Tranquilo**, **Durona**, **Direto** — com uma frase curta e o botão "Ouvir". A amostra é a gravação
  aprovada do cenário "Apresentação" (sem palavrão) e não gasta crédito. Sem voz aprovada, ou quando a pessoa vai
  conversar na voz reserva, o cartão não mostra "Ouvir";
- os modos: **Perguntar ao Tutor** (a conversa livre, já marcado), Questões, Meus erros e Me teste;
- a linha de voz: "Voz hoje: X min" (ou "Voz reserva hoje", quando a voz ElevenLabs não estiver disponível para a pessoa);
- o botão "Começar com a Durona" (o nome muda com a escolha). O último professor vem marcado, mas nada começa sem o toque.
  Dentro desse mesmo toque (e no "Conversar de novo"), o app libera o som e pede o microfone, como o Safari exige;
- o aceite do Tutor (§34 do Termo, feito no projeto do Termo) aparece antes do primeiro uso.

**Conversa:** os cartões somem; no topo fica um selo do professor que não pode ser tocado. Botões: **Chat**, **Microfone** e
**Encerrar**, mais **Interromper** enquanto o professor fala. Nos modos Questões e Meus erros, um cartão compacto abaixo da
esfera mostra a questão com as alternativas para tocar, **Responder**, "Pedir ajuda", "Ver resolução" e "Próxima". O
enunciado **não** é lido em voz alta (gastaria muito crédito).
- **Responder uma questão:** falar ou tocar uma letra só **marca** a alternativa (o professor diz "Marquei a B"). A
  resposta vai com "confirmo" (voz) ou com o botão Responder (toque); "cancela" desmarca. Assim um "é a B?" mal
  transcrito não responde a questão.
- **Microfone negado ou ausente:** aparece o aviso que já existe ("O navegador bloqueou o microfone…") e a conversa segue
  pelo Chat, com resposta em voz enquanto houver limite.

**Fim:** Encerrar sempre fecha a conversa e mostra o resumo, com "Conversar de novo" (conversa **nova**, mesmo professor)
e "Trocar de professor" (volta aos cartões). "Histórico" lista as conversas antigas (regras no §4).

**Vindo de outras telas:** a Nexus abre por cima da tela atual (como a gaveta de hoje), sem sair dela, inclusive no meio
de um treino com cronômetro. Ela já vem com o modo e o contexto do botão, e o aluno só escolhe o professor:
- Correção e Caderno de erros → Perguntar ao Tutor sobre aquela questão;
- Flashcards → Perguntar ao Tutor sobre o tema;
- Temas → Me teste no tema;
- Desempenho → Me teste nos pontos fracos.
Para outro modo, o aluno abre a Nexus pelo menu. Nenhuma conversa é criada antes do "Começar".

**Saem da tela do aluno:** a escolha de voz do aparelho (VoicePicker) e o modo de voz antigo do chat. A escolha entre
Gemini, GPT-Live e Realtime continua onde sempre esteve, no painel do Tutor ("Provedor da voz"), decidindo qual voz ao vivo
é a reserva.

## 6. O caminho de voz (fase 1: um turno de cada vez)
1. **O aluno fala.** O aparelho grava (até 45 s). No computador e no Android, a gravação para sozinha depois de 1,5 s de
   silêncio. No iPhone e no iPad (em qualquer navegador), o aluno toca em "Falar" e depois em "Enviar". O microfone fica
   fechado enquanto o professor fala (sem eco).
2. **Transcrição** no servidor pela OpenAI, em português, com dica de termos médicos e de comandos ("alternativa B",
   "confirmo", "cancela", "dica", "próxima"). O áudio fica só na memória do servidor: não vai para o banco nem para os
   registros.
3. **O motor Stazia responde** pelo mesmo caminho do chat, com personalidade, memória, estado emocional e conferência de
   segurança. "Confirmo" com uma letra marcada vira resposta da questão antes do texto, para a bronca ou o alívio já saírem
   no texto. Um turno por vez por aluno, e um turno repetido pela queda da rede não é respondido duas vezes.
4. **A legenda e a emoção aparecem logo**, antes do som.
5. **A ElevenLabs lê** só o texto já conferido, com a emoção com que **aquela resposta** foi escrita, escolhida pelo Speech
   Director. A esfera usa a mesma emoção. A fala é cortada em ~450 caracteres, num fim de frase; o texto inteiro continua
   na legenda e no chat.
6. **A esfera fala** com o som real (o volume anima a esfera). "Interromper" para o som na hora.
7. Depois, a escuta volta sozinha (computador e Android) ou aparece "Toque para falar" (iPhone e iPad).
- Nos jeitos "Voz ElevenLabs" e "Por escrito" (§7), cada resposta do motor (falada ou digitada) gasta **1 interação** do
  limite de texto do plano, como no chat de hoje (no teste, 40 por dia), com a devolução que já existe se a IA falhar. Sem
  interações, a Nexus mostra o mesmo aviso do chat. Na voz reserva vale o limite de tempo, como hoje.
- Os tempos de cada etapa (transcrição, motor, voz, começo da fala) são medidos desde o início, para decidir a fase 2.

## 7. Os três jeitos de conversar na Nexus
A Nexus escolhe sozinha, a cada conversa, e mostra qual está valendo:

| Jeito | Quando | Fala do aluno | Texto digitado | Resposta |
|---|---|---|---|---|
| **Voz ElevenLabs** | voz aprovada para aquele professor (ou pessoa da equipe, ver abaixo), liberada para a pessoa, com limite e créditos | transcrição → motor | motor | voz ElevenLabs + legenda |
| **Voz reserva** | sem a voz ElevenLabs (sem aprovação, voz ainda só da equipe, ElevenLabs fora do ar, limite do aluno ou teto da conta) e com tempo de voz ao vivo | voz ao vivo, como hoje | voz ao vivo, como hoje | voz ao vivo |
| **Por escrito** | sem as duas vozes | transcrição → motor | motor | por escrito |

- **Antes da aprovação**, só a equipe (administrador e editor) ouve as vozes ElevenLabs na Nexus, para medir os tempos.
  Aluno nunca ouve voz sem aprovação.
- **A reserva** usa os limites de tempo que já existem para a voz ao vivo (painel do Tutor): no teste, 10 min por dia e
  40 min no teste inteiro (vale o que acabar primeiro); no pago, 60 min por dia; cada conversa por voz vai até 30 min.
- **O que fala na reserva** depende da voz ao vivo escolhida no painel. Com o GPT-Live, as respostas vêm do motor do Stazia.
  Com o Gemini (o preferido no automático) e o Realtime, o modelo de voz fala sozinho, seguindo as instruções, e o servidor
  confere depois. Por isso é só reserva.
- A voz do aparelho nunca é usada.
- Transcrição falhou: "Não entendi, pode repetir ou digitar?", e o campo de texto abre. Motor falhou: "O professor não
  conseguiu responder, tente de novo", sem gastar limite.

## 8. Limites e custos
- **Quem tem voz:** quem tem direito ao Tutor (teste grátis ativo, plano pago ou equipe). O teste grátis e o bloqueio
  automático só existem com o painel em "Planos pagos + teste grátis"; desligado, todos contam como plano pago.
- **Por aluno, por plano** (como já é feito com a voz ao vivo): teste grátis, **5 minutos de fala por dia** (~4.500
  caracteres); plano pago, o mesmo limite até os pacotes existirem. Os dois são editáveis no painel do Tutor.
- A voz ElevenLabs **não depende nem gasta** o tempo da voz ao vivo: ela funciona mesmo com esse tempo esgotado e só
  obedece ao limite de caracteres e aos tetos da conta. O interruptor "Conversa por voz" do painel desliga as duas vozes e
  o microfone (fica só o Chat, por escrito).
- Terminado o teste grátis, o bloqueio automático do Tutor que já existe continua valendo.
- **Da conta inteira:** um **teto mensal** e um **teto diário** de caracteres da ElevenLabs, editáveis no painel do Tutor.
  São eles que protegem os créditos; atingidos, todos passam para a reserva. Valores iniciais: **30.000 por mês e 4.500
  por dia** (cabem nos ~40 mil créditos do seu painel e sobra para as audições). Ao subir de plano, o dono ajusta.
- **Dia** é o dia de Brasília (vira à meia-noite), como os limites de hoje. **Mês** é o mês do calendário em Brasília,
  como na Central de IAs.
- **Liberação:** enquanto o plano da ElevenLabs não subir, a voz ElevenLabs fica **só para a equipe** (interruptor no
  painel do Tutor, desligado para alunos). Com o plano novo, o dono liga para os alunos.
- O consumo é reservado antes de gerar a voz (dois pedidos ao mesmo tempo não estouram o limite) e devolvido se a voz não
  for gerada. A fala interrompida conta inteira.
- **Um minuto de fala vale 900 caracteres**: é a conta do "Voz hoje: X min" e a base do saldo de minutos dos pacotes.
- Mensagens: "Você usou sua voz de hoje" (limite do aluno), "A voz da plataforma acabou por hoje" (teto diário) e "A voz
  da plataforma acabou neste mês" (teto mensal). Nos três casos a conversa segue na reserva.
- **Custos:** o preço da ElevenLabs (por mil caracteres) e o da transcrição (por minuto) ficam no painel do Tutor,
  preenchidos com o valor do plano contratado antes de liberar aos alunos. Sem preço, o painel avisa que o custo está
  zerado. A voz gerada e a transcrição entram no registro de consumo que já existe (que a Central de IAs soma).
- As audições do painel entram no registro de consumo à parte e **não contam** no limite de quem ouviu nem nos tetos da
  conta.

## 9. Aprovação das vozes (painel "Vozes do Nexus", só administrador)
- **Cada voz vale sozinha.** Aprovada a voz da Durona, quem escolhe a Durona já ouve a ElevenLabs; Tranquilo e Direto
  continuam na reserva até serem aprovados. Revogar desliga só aquela voz, na hora.
- Cada voz tem os seus cenários: os cinco de hoje (apresentação, correção, erro repetido, acerto/recuperação, pronúncia)
  para as três; "1º erro firme" e "alívio com palavrão" só para a Durona; "comemoração com palavrão" só para o Direto.
- "Aprovar esta voz" só fica ativo depois que o servidor registrou que o dono ouviu todos os cenários daquela mesma versão
  da voz nas últimas 24 h. Aprovado, vale na hora, sem publicar código.
- A "versão da voz" junta a voz, o modelo, o formato, os cenários **dela** e a direção do Speech Director. Se qualquer um
  mudar, a aprovação cai sozinha e aquela voz volta para a reserva.
- Só quem estiver na lista do servidor pode aprovar (o e-mail do dono). O painel aprova, mas **não escolhe** a voz: os ids
  continuam só nas variáveis da Vercel.
- Ao aprovar, o servidor guarda a gravação do cenário "Apresentação" num arquivo privado do Supabase; é ela que toca no
  "Ouvir" dos cartões.
- Modelo da voz: começa com `eleven_v3` (mais expressivo). A troca para `eleven_multilingual_v2` é decidida na audição.

## 10. Privacidade
- **Voz ElevenLabs e por escrito:** a fala do aluno vai só para o serviço de transcrição. O StaziaMed não guarda o áudio.
  O texto fica, como no chat.
- **Voz reserva:** a fala do aluno vai ao vivo para o serviço de voz ao vivo escolhido no painel, como hoje.
- **ElevenLabs:** recebe só o texto final do professor, sem e-mail, id ou outro dado de cadastro. O motor conhece o
  primeiro nome do aluno e pode usá-lo na resposta; quando isso acontece, o nome vai dentro do texto (aceito pelo dono).
- Nenhuma chave de fornecedor vai para o navegador no caminho novo.
- **Aviso antes do primeiro uso da voz (decisão de 2026-10-08: sem nomes de fornecedores):** a frase da própria Política de
  07/10/2026, seção 3, sem mudar nada: "Interações com recursos de IA e voz podem ser processadas para responder, sintetizar
  áudio e adaptar a experiência. Fornecedores de IA recebem somente o necessário para executar a solicitação."
- **Política:** continua a de 07/10/2026 (já publicada). Nenhum texto jurídico novo é pré-requisito desta etapa.

## 11. Liberação segura e medição
1. Equipe primeiro, com as vozes ainda não aprovadas, medindo os tempos no iPhone e no Android.
2. Audição e aprovação das três vozes no painel de produção.
3. Plano da ElevenLabs maior, preços preenchidos e tetos conferidos.
4. Alunos.

## 12. Testes
- Motor: Durona firme no 1º erro (0,25 a 0,40, sem sorteio); alívio com palavrão no acerto logo depois de erro, mesmo com
  irritação alta; Direto solto desde o início e com palavrão ao comemorar; Tranquilo sem palavrão; teto de palavrão do
  painel; a conferência barrando ofensa ao aluno; o prompt sem marcações entre colchetes.
- Caminho de voz: transcrição sem guardar áudio; um turno por vez; turno repetido; cada resposta gastando 1 interação;
  letra só marca e "confirmo"/Responder responde; emoção da mensagem na voz e na esfera; corte da fala.
- Limites: aluno do teste grátis ouvindo a ElevenLabs até o limite do dia; voz ElevenLabs funcionando com o tempo da voz
  ao vivo esgotado (dia e teste inteiro); limite por plano; tetos da conta com dois pedidos ao mesmo tempo; as três
  mensagens; estorno quando a voz não sai; audições fora dos limites.
- Jeitos de conversar: passagem para a reserva (sem aprovação, só equipe, fora do ar, limite, teto) e para "por escrito";
  equipe ouvindo voz não aprovada e aluno nunca.
- Telas: entrada com os três cartões e os modos; "Ouvir" só com voz aprovada; professor travado na conversa; Encerrar;
  Conversar de novo; Trocar de professor; Histórico (encerrada só leitura, aberta continua, Acolhedor antigo e perfis
  desligados só leitura); Nexus por cima de outras telas com modo travado e sem criar conversa; cartão da questão;
  microfone negado.
- Painel: aprovação por voz só depois de ouvir os cenários dela; só quem está na lista; revogar uma voz não mexe nas
  outras; aprovação caindo quando a versão da voz muda; amostra guardada.
- Rotas novas recusando quem não tem o aceite do Tutor (§34).
- Conferência no navegador (computador, Android e iPhone) com servidor temporário isolado.

## 13. Publicação (só com ordem do dono)
1. Código: do ramo guardado, trazer **só o commit `25c079d`**, nunca o ramo inteiro. Ficam de fora `4b2649a` (busca por
   significado), `88a2031` (páginas legais reescritas; vale o Termo v1.0) e `4367f04` (dele, só as linhas da ElevenLabs do
   `.env.example`).
2. Supabase: as migrações do Tutor (refeitas e com números novos) e a migração nova do caminho de voz; o espaço privado das
   amostras de voz.
3. Vercel: o código (GitHub) e duas variáveis novas, `TUTOR_STT_ALLOW_EXTERNAL=1` e `TUTOR_VOICE_APPROVERS` (o e-mail do
   dono). As chaves da OpenAI e da ElevenLabs e os ids das vozes já estão lá. O Cloud Run não muda.
4. Conferir no ar com a equipe; aprovar as vozes; preencher os preços; depois liberar aos alunos.

## 14. Riscos
- Créditos: com o plano atual, a voz ElevenLabs dura poucos minutos por mês para todos; a reserva vai ser comum até o plano
  subir.
- Tempo de resposta não medido (transcrição, motor e voz em série). O `eleven_v3` não é indicado para tempo real. Pode
  levar à fase 2 ou à troca de modelo.
- iPhone e iPad: eco, reprodução automática e captação do microfone.
- Palavrão de alívio ou de comemoração barrado pela conferência vira nova tentativa (mais tempo e custo).
- A reserva também custa (voz ao vivo), dentro dos limites de tempo que já existem.
- Os testes de tela antigos do Tutor precisam ser reescritos junto.

## 15. Decisões finais e sugestões
**Decidido pelo dono (2026-10-07):** o primeiro nome do aluno pode ir dentro do texto para a ElevenLabs.

**Sugestões minhas (valem se você não mudar):**
- O alívio com palavrão da Durona vale no acerto logo depois de errar; num acerto sem erro antes, ela reconhece do jeito
  dela, como hoje.
- Cada resposta na Nexus gasta 1 interação do limite de texto (no teste, 40 por dia), como no chat.
- Vindo de outras telas, o modo vem travado e o aluno só escolhe o professor.
- Letra falada ou tocada só marca; responde com "confirmo" ou com o botão Responder.
- Conversas antigas com o Acolhedor ficam só para leitura.
- Antes da aprovação, a equipe ouve as vozes não aprovadas na Nexus para medir os tempos.
- Plano pago com o mesmo limite do teste (5 min/dia) até os pacotes; tetos iniciais da conta 30.000 caracteres por mês e
  4.500 por dia; mês do calendário.
- O Questionador não entra.
- Cartão da questão abaixo da esfera; o enunciado não é lido em voz alta.
- Texto digitado na Nexus respondido com voz enquanto houver limite.
- "Meu relatório" vai para Análise; conversas antigas no botão "Histórico".
- Sem atalho novo na barra do celular.

## 16. Notas técnicas para a implementação
- **Rotas novas:** `POST /api/tutor/voice/transcribe` (áudio de até 4 MB e 45 s, só nessa rota; trava própria
  `TUTOR_STT_ALLOW_EXTERNAL`; aceita só quem tem o aceite do Tutor e uma conversa de voz aberta; modelo e preço da
  transcrição conferidos na implementação) e `POST /api/tutor/voice/say` (`delegateVoice` aceita o modo `tts`; no `tts`,
  letra só marca e "confirmo" responde; o resto vai a `tutorTurn`; trava de turno no banco de 60 s; `client_turn_id`
  contra repetição). As duas recusam quem não tem o aceite do Tutor (§34) com a mesma situação do projeto do Termo.
- **Leitura da voz:** continua em `/api/tutor/speech {kind:'message', session_id, message_id}`, que só lê texto gravado
  no servidor. Ela e `ch_worker_tutor_speech` deixam a regra antiga "só assinante" (`requires_pro`/`is_pro`, que recusa o
  teste grátis com "O Tutor faz parte dos planos pagos") e passam a seguir o direito do Tutor (`tutor_entitlement`) e o
  limite de caracteres por plano. Saem o `TUTOR_VOICE_DAILY_CHARS` (30.000) e as mensagens que prometem "a voz do
  aparelho".
- **Speech Director:** `ch_worker_tutor_speech` devolve, para `kind='message'`, o estado com que o texto foi escrito
  (`meta.personality`, que passa a guardar também o entusiasmo), não `s.emotion` (humor atual) nem `meta.avatar` (depois
  da avaliação). A esfera e a legenda usam o mesmo estado. Frases fixas: neutro. A migração da direção de voz guardada é
  refeita (não basta renumerar). Perfis novos `firm` (só Durona) e `relieved`, com `MOOD_PT`, `avatarOf` e as cores da
  esfera.
- **Motor:** humor `firm` da Durona no 1º erro (piso 25, teto 40, sem sorteio); evento `relieved` a partir de 1 erro
  seguido, vencendo as faixas de frustração; a "inércia" e o "reconheça pouco" mudam para Durona e Direto; o texto de
  jeito da Durona no banco muda; o Direto pede palavrão na comemoração (dentro do teto); o prompt proíbe marcações entre
  colchetes. Turno da Nexus pelo `tts` reserva 1 interação de texto (`ch_worker_tutor_text_reserve`), mesmo com
  `voiceCallId`.
- **Chamada `tts` em `tutor_voice_calls`:** serve à trava de turno e ao `client_turn_id`. `tutor_voice_seconds` ignora as
  chamadas `tts`; abrir uma não depende do tempo da voz ao vivo (exige Tutor ligado, voz ligada no painel, direito ao
  Tutor e limite de caracteres); renovar, encerrar e a varredura não gravam segundos para `tts`; ela não cai entre turnos
  enquanto a Nexus está aberta; ao passar para a reserva, o servidor encerra a `tts` antes de abrir a voz ao vivo (uma
  chamada ativa por aluno); o check e o `ch_worker_tutor_voice_attach` aceitam `tts`.
- **Limites:** contagem própria de reserva e estorno de caracteres, com trava (por aluno por dia; conta por dia e por mês),
  porque o `ai_usage_ledger` só aceita linhas novas com caracteres ≥ 0. No registro entra `tutor_tts` só quando a voz foi
  gerada, `tutor_stt` (segundos) e `tutor_tts_audicao` (audições, fora dos limites e dos tetos). Preços e limites no
  `tutor_config`, com o interruptor "só equipe".
- **Banco:** `app_tutor_start(..., p_personality)` grava a conversa, a última escolha e o palavrão da conversa (como
  `app_tutor_save_preferences` faz hoje) numa transação, aceitando só os três professores ativos; as conversas antigas do
  Acolhedor ficam marcadas como só leitura; tabelas `tutor_voice_approvals` e `tutor_voice_listen_log` (só por funções de
  administrador).
- **Aprovação:** sai a regra "as três vozes aprovadas" (`officialVoices.ts:70-74`, `elevenlabsTts.ts:53`,
  `speech.ts:231-233`); cenários por voz; a versão da voz inclui a direção do Speech Director; amostra em
  `tutor-voice-samples/<voz>/<versão>.mp3` (Supabase Storage privado).
- **Remover:** o bloqueio 409 de `/voice/start` com ElevenLabs; a variável `TUTOR_VOICE_PROVIDER` deixa de decidir a voz
  (decidem o painel e a aprovação); o uso da voz do aparelho (`speechSynthesis`) como reserva; o preço por
  `ELEVENLABS_PRICE_PER_MIN` (vai para o painel).
- **Telas:** `NexusScreen` e `NexusLobby` (o `/tutor` abre a Nexus); a Nexus abre por cima das outras telas, no lugar da
  gaveta, que deixa de criar a conversa sozinha; "Meu relatório" vai para `/analise`; o tocador de áudio sai do Gemini
  para `voice/audioPlayer.js`.
- **Testes que mudam de propósito:** `tutor.test.ts:890` (Durona "neutra" no 1º erro), `:957` (`/status` com
  `tts_only`), `:1071-1072` (`TUTOR_VOICE_DAILY_CHARS`) e `:1076-1077` (403 para quem não é assinante);
  `tutorOfficialVoices.test.ts` (aprovação no código, "as três vozes", `tts_only`/409, voz com a emoção da sessão e
  estabilidade); `tutorVoiceMode.test.ts:402` (multiplicador 0,25 do Acolhedor) e `:414-417` (inércia); e os testes das
  telas antigas do Tutor.
