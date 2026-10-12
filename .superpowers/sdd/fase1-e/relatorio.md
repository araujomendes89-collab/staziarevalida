# Relatório — Fase 1 objetiva, Grupo E (Planos, Configurações, Central de IAs, Vozes do Nexus, Visão geral, Stazia Arena)

Ramo `adm-f1-e`, base 5d659d1 (site no ar). Nada foi empurrado, nada foi publicado, nenhum serviço real foi tocado. Tudo em commits locais.

Status: PRONTO. Pendências só onde o dono precisa dar um número ou escolher (lista na seção 3).

Commits (do mais antigo ao mais novo): `b96be02` (Planos, PL01), `d00a17f` (microfone e voz, CF02 e VZ03), `5f91fc5` (teto geral de IA, IA02), `6589ed2` (avisos, GE06 e script de colagem), mais o commit final deste relatório.

Migrações criadas (faixa 9890 a 9899, só estas):
- `supabase/migrations/20261003009890_planos_informativo_aluno.sql`
- `supabase/migrations/20261003009891_microfone_transcricao_estrutura.sql`
- `supabase/migrations/20261003009892_teto_geral_ia_mes.sql`

## 1. Re-auditoria (código de 5d659d1)

A auditoria de 11/10 estava velha. O que confirmei no código, aba por aba, e o que REALMENTE faltava:

| Item | O que a auditoria dizia | Estado real em 5d659d1 | O que fiz |
|---|---|---|---|
| PL01 tela de planos do aluno | não existe | continuava não existindo (o botão "Ver planos" caía na Conta) | CONSTRUÍDO agora (informativa) |
| PL02 teste vencido trava o pago | só o Tutor | já resolvido pela leva 3 (9730: simulados, Tutor e estações Pro) | já estava resolvido |
| PL03, PL05, PL08 | resolvidos | confirmei no código (faixa do Início, prévia do preço, linhas em branco) | já estava resolvido |
| PL04 Elite | pergunta | leva 3 trouxe a estrutura (9731: minutos de voz e correção de estação, sem números) | já estava resolvido (números dependem do dono) |
| PL06 chave do teste no cadastro | não fazia nada | leva 3 fez valer (9732) | já estava resolvido |
| CF01, CF05, CF06, CF07 | resolvidos | confirmei (trava do Tutor sem planos pagos, vozes Kore/Sulafat/Orus, aviso do motivo, 9600) | já estava resolvido |
| CF02 microfone ao aluno sem aprovação e sem teto | só em outro ramo | CONTINUAVA ABERTO em 5d659d1: o aluno com plano pago transcrevia sem teto; o commit 121b9b0 não está no ar | CONSTRUÍDO (trava + estrutura do teto vazia) |
| CF03 prazo próprio do teste do Tutor | pergunta | decisão do dono: sem prazo próprio por ora | não fiz (decisão dada) |
| CF04 teto diário da voz do professor | pergunta | continua com os valores de antes | depende do dono |
| CF08 chave do Gemini | pergunta | continua | depende do dono |
| IA01 tetos desligados | aviso | aviso e guia no ar; tetos continuam desligados (decisão do dono) | já estava resolvido (valores dependem do dono) |
| IA02 teto geral do mês | só leitura | só leitura; o teto geral NÃO existia | CONSTRUÍDO a estrutura (desligada, vazia, só avisa) |
| IA03 interruptor das IAs | texto | texto corrigido e lista dos usos fora do interruptor; o comportamento é o de antes | texto resolvido; mudar o comportamento depende do dono |
| IA04–IA07, IA10, IA11 | resolvidos | confirmei nos arquivos de `server/ai` | já estava resolvido |
| IA08 teto por trabalho | renomeado | continua "por chamada" (a tela explica) | depende do dono (o grupo A já traz o teto por documento da Central, migração 9843, desligado) |
| IA09 modelo sem preço | aviso | avisos na tela e no salvar; com tetos ligados o salvar é bloqueado | resolvido; bloquear o já salvo depende do dono |
| VZ01, VZ02, VZ04 | resolvidos | confirmei (trava própria da voz ao vivo, rota Ouvir só equipe, avisos em português) | já estava resolvido |
| VZ03 preço da voz zerado | pergunta | continuava zerado, só com aviso | CONSTRUÍDO a trava (não libera a voz aos alunos sem preço); o preço depende do dono |
| VZ05 quem aprova as vozes | pergunta | só quem está na lista de e-mails do servidor | depende do dono |
| P02 gasto de voz do podcast | sem teto | o gasto já aparece no painel "gasto do mês de tudo"; sem teto por episódio | coberto pelo teto geral (só avisa); teto por episódio depende do dono |
| ES05 relatos dos alunos | aviso | CONFIRMADO: o aviso continua verdadeiro (as telas de estações do aluno ainda são maquete e escondidas; o aluno não tem como relatar) | já estava resolvido |
| GE06 cartão "Sem figura" | legenda | A LEGENDA FICOU FALSA: dizia "o envio da imagem ainda não está na tela", mas a leva 3 trouxe o envio de figura em Questões | CORRIGIDO agora |
| GE01–GE05 Visão geral | resolvidos | confirmei (9601, blocos "Esperando revisão" e "Gasto de IA") | já estava resolvido |
| AR01–AR09 Stazia Arena | resolvidos | confirmei os arquivos (9570–9573, 9630) e o texto em português; só a criação de medalhas ainda pede "Critério (JSON)" e códigos (tela de configuração avançada) | já estava resolvido; medalhas ficam como estão |

Nada do que sobrou neste grupo é da leva 4 (Análise de questões, Buscar fontes, Inéditas): nenhum item foi marcado "coberto pela leva 4". Conferi que os ramos da leva 4 e os outros grupos da Fase 1 NÃO redefinem as funções que eu redefini.

## 2. O que foi construído

### PL01 — Tela de Planos do aluno, só informativa (migração 9890)
- Nova tela "Planos" (menu "Geral" e botão "Ver planos" do Início, da Conta, da tela de Simulados e do Tutor). Mostra: a situação da pessoa (ex.: "Teste grátis até 20/10/2026", "Plano Pro", "Acesso gratuito", "Equipe · acesso completo"), e um cartão por plano com o nome, a descrição e os recursos que o administrador escreveu em Administração > Planos. Para Pro e Elite mostra também os minutos de voz do Tutor, só quando o Tutor está no ar com planos pagos, e só o que o dono já preencheu em Configurações (o Elite nunca abaixo do Pro; correção de estação com devolutiva só se estiver ligada).
- NÃO tem preço, NÃO tem periodicidade de cobrança, NÃO tem "marcado para venda" e NÃO tem botão de assinar. O aviso do alto diz "A assinatura pelo app ainda não está disponível". O banco (função `app_plans_info`) nem entrega preço ao aluno.
- O Teste grátis só aparece como opção enquanto o cadastro o oferece (ou se a pessoa está nele). Plano que a equipe ainda não descreveu mostra "A equipe ainda vai descrever o que este plano inclui."
- A aba Planos da Administração agora explica o que o aluno vê (antes dizia "os planos ainda não aparecem para os alunos").
- Quem tem o teste grátis acabado ou o plano vencido passa a ver "Ver planos" ao lado do aviso (antes não havia botão porque não havia tela). Continua sem botão de assinar.
- Rota do aluno `/planos`; `go("planos")` deixou de ser redirecionado para a Conta.

### CF02 — Microfone/transcrição ao aluno (migração 9891 + servidor + telas)
- O microfone da Nexus (voz do professor e "por escrito") agora é SÓ DA EQUIPE por padrão (chave "Microfone só para a equipe", ligada). Aluno recebe 403 com texto em português antes de qualquer gasto; a tela da Nexus não pede nem deixa aberto o microfone; o aluno segue pelo Chat. A voz reserva ao vivo (microfone direto do navegador, com limites próprios no banco) NÃO mudou.
- Estrutura do teto diário da transcrição, VAZIA e sem números: três campos em Administração > Configurações > Nexus (por aluno no teste grátis, por aluno no plano pago, e da plataforma toda, em minutos por dia).
- O banco só deixa DESLIGAR a chave (abrir o microfone aos alunos) com os três tetos e o preço da transcrição preenchidos; esvaziar um teto com o microfone aberto também é recusado; fechar de novo é sempre permitido. O servidor também fecha se achar a chave aberta sem teto (estado que o painel não cria).
- Com o microfone aberto e os tetos preenchidos, o servidor soma o que a pessoa e a plataforma já transcreveram HOJE (dia de Brasília, pelo registro de uso) e recusa passando do teto, com o aviso em português; a Nexus mostra o aviso e abre o Chat.
- Não trouxe o commit 121b9b0 do ramo antigo: o código atual mudou (cota, `mode`, reserva), então refiz a trava sobre o código de hoje (mesma ideia: microfone só da equipe).

### VZ03 — Preço da voz (mesma migração 9891)
- O banco e a tela não deixam LIBERAR a voz do professor aos alunos ("Voz do professor só para a equipe" ligado para desligado) com o preço da voz em zero. A regra vale só na hora de liberar; quem já estiver liberado não fica preso.

### IA02 — Teto geral do mês (migração 9892 + servidor + tela)
- Novo bloco "Teto geral do mês (só avisa)" na Central de IAs: valor vazio e chave desligada. Soma o que tem registro: Central, Tutor, vozes, transcrição, Podcasts e busca por significado. Ligado, avisa a 80% e ao passar (faixa no alto da Central). NÃO PARA NENHUMA IA: o que fazer ao chegar no teto é decisão do dono.
- O banco não deixa ligar sem valor. O Registro mostra "Teto geral do mês" e "Teto por chamada" (corrigi também o nome antigo "Teto por execução" no Registro).
- Sem a migração colada, a tela diz "falta uma atualização do banco" e a rota recusa com uma frase clara (a função antiga ignoraria a chave em silêncio).

### GE06 — Cartão "Sem figura" da Visão geral
- Legenda corrigida: "citam figura sem imagem vinculada e ficam fora dos treinos; envie a figura em Questões".

## 3. Depende do dono (pergunta exata)

| Item | Pergunta |
|---|---|
| CF02 (números) | Quantos minutos de microfone por dia, por aluno no teste grátis? Por aluno no plano pago? E no total da plataforma por dia? (A proposta antiga era 10 minutos no teste, 60 no pago e mais um teto geral.) E qual o preço da transcrição por minuto (hoje zero; o OpenAI atual é US$ 0,003)? Depois de preencher, é só desligar "Microfone só para a equipe". |
| CF04 | Aceita subir o teto diário da voz do professor para 90.000 caracteres por dia e 600.000 por mês antes de liberar aos alunos? |
| VZ03 | Qual o preço da voz do professor (US$ por mil caracteres) para eu preencher antes de liberar aos alunos? |
| VZ05 | A aprovação das vozes continua só para quem está na lista de e-mails do servidor, ou todo administrador pode aprovar? |
| IA01 | Posso ligar os tetos de gasto da Central? (Sugestão antiga: US$ 50 por mês e US$ 2,00 por chamada.) |
| IA02 (valor e regra) | Qual o valor do teto geral do mês? Ao chegar nele, só avisa (como está), para as ferramentas da equipe, ou para tudo (Tutor, vozes e alunos)? |
| IA03 | O Tutor, a transcrição, a voz e os Podcasts devem passar a obedecer o interruptor de cada IA da Central? (Antes, é preciso ligar as IAs que eles usam, senão param.) |
| IA08 | Quer somar o teto por trabalho (por documento) em vez de por chamada? (O grupo A já traz um teto por documento, desligado, na Central de Conteúdo: 9843.) |
| IA09 | Um modelo pago já salvo sem preço deve ser bloqueado? (Hoje só avisa; com os tetos ligados o salvar já bloqueia.) |
| P02 | Quer um teto de gasto de voz por episódio de podcast, conferido ANTES de gerar o áudio? Qual valor? (Hoje o gasto aparece no painel e entra no teto geral, que só avisa.) |
| CF08 | A chave do Google AI Studio (voz ao vivo do Gemini) tem crédito? Se não, deixo a voz ao vivo em GPT-Live. |
| PL04 (números do Elite) | Quantos minutos de voz por dia o Elite tem a mais que o Pro? A correção de estação com devolutiva entra no Elite? (A estrutura está pronta e vazia.) |
| Preços e Stripe | Parados por decisão do dono. Nenhum preço, texto de venda ou botão de assinar foi criado. |

## 4. Passo de colagem do SQL (Supabase, à mão, editor que para no primeiro erro)

Colar DEPOIS de tudo o que já está em produção (inclusive 9730, 9731 e 9732 da leva 3, e depois de qualquer leva 4/grupo A–D que o dono decidir colar; elas não mexem nas mesmas funções). Uma de cada vez, nesta ordem:
1. `20261003009890_planos_informativo_aluno.sql` (depende da 9731: usa `plan_benefits`).
2. `20261003009891_microfone_transcricao_estrutura.sql`
3. `20261003009892_teto_geral_ia_mes.sql`

Cada uma pode ser colada de novo sem estragar nada. Conferido em produção simulada (todas as 103 migrações de 5d659d1; script `.superpowers/sdd/fase1-e/verificar-colagem.mjs`): coladas duas vezes dão OK e uma terceira colagem não muda nenhuma função. Só 3 funções existentes mudam, e só no que se pretendia: `app_admin_tutor_save_config` (parte da …5600, a mais nova; só acrescenta os campos novos e as duas travas; 1 linha trocada por outra que lê também o estado anterior da voz), `ch_worker_tutor_settings` (parte da …5600; só 4 campos a mais) e `ch_worker_ai_save_settings` (parte da …5200, a única; só as duas chaves novas e a trava de ligar sem valor). Funções novas: `app_plans_info` (só quem está logado) e `ch_worker_tutor_stt_today` (só o servidor). Nenhuma função nova é chamável por visitante.

Efeito de colar: NENHUM para ninguém. O microfone dos alunos nasce fechado (a transcrição só funciona se `TUTOR_STT_ALLOW_EXTERNAL` estiver ligada no servidor; se estiver, o aluno PERDE o microfone da Nexus até o dono abrir). O teto geral nasce desligado. A tela de planos só lê.

Compatibilidade de ordem:
- SQL antigo + site novo: a tela de Planos mostra "Não foi possível carregar os planos agora"; Configurações > Nexus mostra "falta uma atualização do banco" e trava só os campos do microfone; a Central mostra "falta uma atualização do banco" no teto geral; o servidor usa o padrão fechado (aluno sem microfone). Nenhum erro técnico aparece.
- SQL novo + site antigo: nada muda para o aluno (o site antigo ainda deixa o aluno transcrever, como hoje, até o site novo entrar); o site antigo salvar o Tutor continua funcionando, e liberar a voz aos alunos com preço zerado passa a mostrar a frase do banco em português.

## 5. O que o dono vê e testa

- Como aluno: menu lateral "Planos" (no celular, pelo botão "Ver os planos" da Conta ou "Ver planos" do Início) abre a tela informativa; sem preço e sem botão de assinar. Na Nexus, o aluno não vê microfone nem "Ouvindo"; escreve pelo Chat.
- Administração > Planos: o aviso novo; ao escrever recursos do Pro/Elite eles aparecem na tela do aluno.
- Administração > Configurações > Nexus: bloco "Microfone e transcrição": a chave ligada, três campos vazios e o aviso "Pendente: definir os tetos diários...". Tentar desligar a chave sem os tetos mostra o motivo e trava o Salvar.
- Administração > Central de IAs: bloco "Teto geral do mês (só avisa)" vazio e desligado.
- Administração > Visão geral: legenda nova do cartão "Sem figura".
- Teste "aluno barrado": aluno, editor e visitante recusados em todas as funções de Administração novas (provado em teste de banco).

## 6. Testes (pela fila, 2 trabalhadores; número de arquivos conferido)

Testes novos (TDD: o de banco da 9890 foi visto falhando sem a migração, 7 de 7):
- `planosInformativoBanco` (7), `planosInformativoTelas` (13), `tutorMicrofoneBanco` (13), `tutorMicrofoneServidor` (11), `tutorMicrofoneTela` (10), `tetoGeralIa` (10), `tetoGeralIaTela` (7): 7/7 arquivos, 71 testes passaram.
- Testes antigos ajustados porque o comportamento mudou DE PROPÓSITO: `planosTesteVencidoTelas` (agora há "Ver planos" no aviso, sem botão de assinar), `nexusEntrada` ("Ver planos" abre `planos`), `correcoesAcessoTelas` (texto da aba Planos), `admConfigEstacoesTela` (legenda do cartão Sem figura), `registroAdministracao` ("Teto por chamada"), `tutorNexusVoz` e `tutorNexusTranscricao` (agora o microfone e a voz dos alunos são abertos direto no banco de teste, como o dono faria), `nexusConversa` (+1 teste do limite de fala).
- Vizinhos: 125 arquivos de teste que usam as telas, o servidor do Tutor, a Central de IAs, o Registro e as funções mexidas, em 8 lotes: 125/125 arquivos passaram (lotes de 16; 526+233+268+255+258+232+181+133 testes, mais os "expected fail" de sempre).
- `npm run build`: passou. `tsc --noEmit`: 1831 erros, igual à base (1831); nenhum erro nos arquivos que toquei (achei e tirei um import repetido meu em `server/tutor/router.ts`).
- Colagem 2x + 3ª sem mudança em produção simulada: tudo ok.

## 7. Limites e riscos

- Efeito imediato ao abrir o site novo: se a transcrição estiver ligada no servidor (`TUTOR_STT_ALLOW_EXTERNAL=1`), o aluno deixa de falar ao microfone da Nexus e passa a escrever pelo Chat até o dono preencher os tetos e abrir. É a decisão registrada do dono (microfone só da equipe até haver teto).
- O teto geral só AVISA (a 80% e ao passar). Não há bloqueio de nada por causa dele. A soma só tem o que fica registrado; as rotas antigas de IA e as perguntas da busca por significado continuam "sem registro" e ficam de fora.
- O teto diário da transcrição é conferido pelo registro de uso e pelo servidor: duas falas ao mesmo tempo (duas abas) podem passar do teto em até uma fala (o servidor já limita a uma transcrição por vez por aluno).
- A tela de Planos mostra o que o administrador escreveu; se um plano estiver sem texto, aparece "A equipe ainda vai descrever...". Nada de venda foi inventado.
- Não conferi no navegador real (só testes de tela e de servidor simulados); a mudança do menu "Geral" (item "Planos") e a tela nova precisam de uma olhada do dono.
- A criação de medalhas da Stazia Arena ainda usa "Critério (JSON)" e códigos; é tela de configuração avançada, não bloqueia a Fase 1.
- Os grupos A–D e a leva 4 têm migrações em outras faixas; conferi que nenhuma redefine as 3 funções que redefini, mas se alguma for criada depois, a ordem de colagem deve respeitar as versões mais novas.
