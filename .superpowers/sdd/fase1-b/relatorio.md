# Fase 1, grupo B: Central de Conteúdo, Unidades, Detalhe e Publicar ao aluno

Ramo `adm-f1-b` (base 5d659d1, site no ar). Nada foi publicado, nada foi para o GitHub, nenhum Supabase/Vercel/Google real foi tocado.
Escrito em português simples para o dono. Os números entre parênteses são os da auditoria de 11/10.

## 1. Resumo em uma frase por item

| Item | Estado | O que mudou para quem usa |
|---|---|---|
| CC02 Publicar não leva nada ao aluno | **Construído (etapas 1 e 2 do plano)**; sobram partes (seção 5) | Publicar passa a mostrar uma **prévia** e, confirmado, cria a **aula** em Estudar > Aulas e põe os **flashcards** no baralho de todos os alunos. Retirar tira do ar sem apagar nada do aluno. "Criar versão para corrigir" fecha o ciclo. |
| CC12 Dose e contraindicação conferidas por quem não é revisor | **Construído** | Só revisor médico cadastrado na área da afirmação confirma dose, via, frequência e contraindicação. O banco recusa os outros e a tela diz de quem é a conferência. |
| CC13 Conflito decidido / evidência corrigida não destrava | **Construído** | Conflito decidido pelo administrador a favor da fonte que sustenta deixa de bloquear. Nova ação "Corrigir evidências" (descartar com motivo). |
| CC14 Aviso "nenhum bloqueio" mas Publicar é recusado | **Construído (tela)** | O aviso agora fala só de bloqueio de conteúdo e diz o que falta: aprovação, administrador, publicação ligada, modo sombra. |
| CC15 Promete unidades criadas pela equipe, sem botão | **Resolvido tirando a promessa** (decisão minha, ver 4) | A frase agora diz que as unidades nascem do processamento dos documentos. |
| CC17 PDF final barrado como pop-up | **Construído** | A aba abre já no clique. Se o navegador mesmo assim não abrir, o arquivo é baixado e a tela avisa. |
| CC28 Material visual com dose baixa sem revisão médica | **Construído** | Material visual com dose/contraindicação fica com o download travado até um revisor médico da área registrar a revisão. |

Antes de construir, cada item foi conferido no código de 5d659d1: todos ainda eram verdade (nenhum foi resolvido pelas levas 2 e 3). O ramo `central-so-equipe` (SQL 8300) já está no main/5d659d1, então a falha do gabarito está fechada no código também. Nada disto está na leva 4 (analise-ia, buscar-fontes-ia, ineditas): sem sobreposição.

## 2. Arquivos

SQL (faixa 20261003009860 a 20261003009869; usei 9860 a 9864):

| Arquivo | Para quê |
|---|---|
| `supabase/migrations/20261003009860_central_conferencia_e_conflitos.sql` | CC12 e CC13: conferência de dose só pelo revisor da área; conflito decidido e evidência descartada destravam a publicação |
| `supabase/migrations/20261003009861_publicar_unidade_aula_aluno.sql` | CC02 etapa 1: aula do aluno, prévia, publicar, retirar, travas novas, aula trancada |
| `supabase/migrations/20261003009862_publicar_unidade_flashcards.sql` | CC02 etapa 2: flashcards no baralho de todos os alunos |
| `supabase/migrations/20261003009863_visuais_revisao_medica.sql` | CC28: revisão médica dos materiais visuais |
| `supabase/migrations/20261003009864_criar_versao_para_corrigir.sql` | CC02: "Criar versão para corrigir" |

Telas: `src/novo/app/admin/content/Units.jsx` (aviso, prévia, retirar, nova versão, arquivo sem pop-up, sem a promessa), `PublishPanel.jsx` (novo, a prévia), `openFile.js` (novo, abre aba sem pop-up), `ui.jsx` (ClaimCard: conferir dose, corrigir evidências), `visual/VisualMaterials.jsx` (revisão médica), `src/novo/app/review/FlashcardsScreen.jsx` (texto "baralho StaziaMed").

Testes novos: `centralConferenciaConflitos.test.ts`, `publicarUnidadeAula.test.ts`, `publicarUnidadeFlashcards.test.ts`, `visuaisRevisaoMedica.test.ts`, `unidadesPublicarTela.test.tsx`, ajuda em `helpers/centralUnidades.ts`. Ajustado: `supabaseContentHub.test.ts` (dose agora pelo revisor; fonte de teste com nível A, como o plano previa). Script da colagem: `.superpowers/sdd/fase1-b/colagem3x.mjs`.

## 3. Como o CC02 funciona (o mínimo seguro)

1. Unidade aprovada pela revisão médica da área **e** pela editorial, sem pendências, com arquivo final da aula conferido.
2. Administrador clica em **Publicar para os alunos…**. A **prévia não grava nada**: mostra aula nova ou atualizada, aviso de aula parecida, pontos-chave, flashcards (novos, mantidos, saem), o texto como o aluno verá, e o que ainda trava (modo sombra, publicação desligada, pendências).
3. Confirmado (tudo numa transação só: ou entra tudo ou nada muda): a versão entra no ar, a aula é criada (ou a **mesma** aula é atualizada, com o progresso dos alunos mantido) e os flashcards entram.
4. O que o aluno recebe: título, texto revisado, pontos-chave, a linha "Material StaziaMed · revisado por médico da área em dd/mm/aaaa · não é material oficial do Inep" (sem nome do revisor), "atualizado em" quando é versão nova, e as **fontes oficiais** (órgão, documento, versão, página). Nunca: afirmações, trechos das fontes, apontamentos das conferências, nota de escopo, nome de arquivo de origem, nome de IA ou de modelo. Há teste que varre o que o aluno recebe procurando isso.
5. A aula da Central fica **trancada** na tela Aulas: texto, pontos-chave, área, publicação e vínculo só mudam pela Central, com nova revisão médica (o banco recusa; título, vídeo, posição e outros materiais seguem livres). Aula da Central não se apaga na tela Aulas.
6. **Retirar** (só administrador, com motivo): a aula e os cartões saem da lista do aluno; progresso, XP e agenda de revisão ficam guardados. Publicar de novo traz a **mesma** aula de volta.
7. **Publicação segue DESLIGADA e em modo sombra por padrão** (as chaves da Configuração não foram mexidas). Só administrador publica. Editor, revisor, aluno e visitante são recusados (testado).
8. Nada de IA foi chamada. Nada inventado: o texto é o texto revisado da unidade.

Travas novas, todas no banco: cada afirmação precisa de **fonte oficial vigente** (nível A a D, documento final, em vigor, dentro da validade; apostila nível E ou fonte sem nível não vale); área da unidade precisa ter grande área nas Aulas (Saúde Mental e Saúde Coletiva ainda não têm: ficam barradas); sem e-mail ou perfil @ de terceiros no texto, nos pontos-chave e nos cartões; sem o **nome do arquivo, da editora ou do autor** do material estudado no que vai ao aluno; no máximo 30 pontos-chave; limites de tamanho; cartões com frente e verso. Aula parecida (mesma área e mesmo tema) pede "Publicar mesmo assim".

Flashcards: cartão da Central é um cartão sem dono (baralho oficial), revisado por médico, ligado à unidade. Cartão igual na versão nova (mesmo com espaços ou maiúsculas diferentes) é o **mesmo cartão**, e a agenda de cada aluno fica. Cartão que saiu é **escondido, não apagado**, e a data de revisão do aluno é guardada (volta se o cartão voltar). Cartão escondido não conta nos "vencidos" nem trava o "fila zerada" (não foi preciso mexer em `app_bootstrap`).

## 4. Decisões que tomei (o dono pode mudar)

- **CC15:** tirei a promessa em vez de construir o botão "Nova unidade". Motivo: uma unidade escrita do zero à mão precisa de afirmações com evidência e revisão; sem a tela guiada (Etapa 2 do caminho do documento) seria um caminho fácil de errar. Se quiser o botão, é uma etapa à parte.
- **CC12:** o administrador **não** confere dose só por ser administrador. Se ele também for revisor da área, confere. Para o dono (médico) isso significa se cadastrar como revisor da área em Revisores.
- **CC13:** conflito decidido a favor da fonte que **discorda** continua bloqueando (o texto da afirmação está errado e precisa mudar). Adiar não destrava. Descartar evidência de conflito/desatualização é só do administrador; as outras, da equipe.
- **CC28:** o banco reconhece "conteúdo clínico" pelo texto (número com unidade de remédio, "dose", "posologia", "contraindicação"...). Na dúvida pede revisão. Material sem isso baixa direto, como hoje.
- **Texto da aula:** montado e copiado para a aula na hora de publicar (a tela do aluno, a busca e o progresso já leem dali), em vez de a tela do aluno ler a unidade ao vivo como o plano previa. Motivo: não mexe em `lesson_view`/telas do aluno que outros grupos também alteram. A trava no banco impede a edição por fora.
- **Marcas de terceiros:** a Etapa 1 do caminho do documento (termos confirmados) não está no main. No lugar, travei e-mail/@ e o nome do material de origem (arquivo, editora, autor). Quando a Etapa 1 entrar, soma-se a ela.

## 5. O que sobra do plano de 17 tarefas (honesto)

Feito: tarefa 1 (SQL 8300, já no ar), e em versão enxuta as tarefas 2 a 9 e 14 a 16 do plano (colunas, travas de fonte oficial, área e contato, prévia, publicar, retirar, cartão escondido, aula trancada, criar versão para corrigir, telas de prévia/retirar/corrigir, texto do baralho) mais a verificação (17).

**Sobra (não construído):**
1. **PDF do aluno** (tarefas 10 a 12 e a trava 6): variante do PDF sem notas internas, geração pelo processamento e link de 10 minutos para o aluno abrir. Precisa de mudança no servidor/Cloud Run. Hoje o aluno recebe o texto, não o PDF.
2. **Questões da unidade** (fila "Questões StaziaMed"): fica para depois da leva 4 (ramo `ineditas`), como o próprio plano diz. A prévia avisa isso com todas as letras.
3. **Marcas de terceiros da Etapa 1** (termos confirmados): ver seção 4.
4. **"Continuar na mesma aula"** (assumir a aula de outra unidade do mesmo tema): hoje só "Publicar mesmo assim".
5. **Aviso "Em atualização"** ao aluno quando a fonte oficial muda: a aula continua no ar sem aviso (como é hoje).
6. **Tela Aulas da Administração:** sem o selo "Da Central de Conteúdo" e sem desligar os campos na tela (o banco já recusa, mas antes de recusar a tela Aulas pede a "nota do que foi conferido"; depois mostra a mensagem em português).
7. Etiqueta "StaziaMed" nos cartões do aluno.
8. Unidades **já publicadas pelo site antigo** (sem aula): não ganham aula sozinhas. Com a publicação desligada de fábrica provavelmente não há nenhuma; se houver, é só "Criar versão para corrigir", aprovar e publicar.

## 6. Colagem no Supabase (ordem)

Colar **nesta ordem**, cada arquivo inteiro, antes de publicar o site: `20261003009860`, `009861`, `009862`, `009863`, `009864` (todos em `supabase/migrations/`). Podem ser colados 2 ou 3 vezes sem erro. Colar a 9861 de novo depois da 9862 **não** desfaz os flashcards (testado).

Compatibilidade: SQL novo + site antigo funciona (o botão antigo Publicar chama `app_ch_publish(uuid)`, que continua existindo e já leva a aula; só a trava "aula parecida" fica pedindo confirmação que a tela antiga não tem). Site novo + SQL antigo: a prévia mostra "A publicação nova ainda não está no banco: cole os arquivos SQL..." (sem erro técnico).

## 7. Verificação feita

| Verificação | Resultado |
|---|---|
| Testes novos e vizinhos (17 arquivos: os 5 novos, `supabaseContentHub`, `visualMaterials` e tela, `publicacaoSoEquipe`, `semRegrasDeLicenca` e tela, `contentLabFoundation`, `contentHubPipeline`, `licensedAdaptation`, `sqieClosing`, `sourceDiff`, `adminContentPanels`) | **17 de 17 arquivos, 201 testes passando** |
| Mais 24 arquivos de banco/telas vizinhos (aulas, flashcards, play, conta, fontes complementares, podcasts, arena...) | 24 de 24 (um teste de `questionKnowledge` estourou o tempo de 5 s sob carga e passou sozinho; não é meu) |
| `npm run build` | passou |
| `tsc --noEmit` | 1831 erros, igual à base; nenhum nos arquivos tocados |
| Simulação da colagem 3 vezes (`.superpowers/sdd/fase1-b/colagem3x.mjs`): banco no estado de 5d659d1 com dados (aula antiga, progresso, cartão pessoal com agenda, unidade publicada) | sem erro; retrato (funções, permissões, gatilhos, políticas, restrições, índices, colunas) da 1ª colagem **idêntico** ao da 3ª; dados antigos **intactos**; nenhuma função nova aberta para visitante; as internas fechadas |

Não foi feito: conferência no navegador real e no Supabase real (só PGlite e jsdom). Recomendo, antes de ligar a publicação: entrar como administrador, abrir uma unidade aprovada, ver a prévia, publicar, entrar como aluno (teste grátis e Pro) e conferir a aula e os cartões; depois retirar e publicar de novo.

## 8. O que o dono vê e testa

1. Central > Unidades e revisão > abrir uma unidade: o aviso de cima agora diz o que falta. Aprovada: botão **Publicar para os alunos…** abre a prévia.
2. Com a publicação desligada e modo sombra ligado (como vem), a prévia mostra os dois avisos e o botão fica desligado. Ligue/desligue em Configuração e custos (com motivo) só quando quiser testar.
3. Afirmação com dose: o botão "Confirmar conferência" só aparece para o revisor da área; os outros leem de quem é a conferência.
4. "Corrigir evidências" em cada afirmação; aba Conflitos: decida um conflito e a unidade deixa de acusar o bloqueio.
5. Materiais da unidade: o botão do PDF final abre numa aba nova sem ser barrado.
6. Materiais visuais: um card com "dose" aparece como "Aguardando revisão médica" e o download só libera depois do revisor da área registrar.

## 9. Limites e riscos

- O revisor médico precisa ter acesso à Central como equipe (editor ou administrador) para abrir Materiais visuais e registrar a revisão do material visual. Revisor "só da área" não entra nessa aba (a aba é da equipe).
- O reconhecimento de dose nos materiais visuais é por palavras e números; erra para o lado de pedir revisão a mais, mas um texto clínico sem número nem as palavras-chave passaria.
- O texto da aula guarda uma cópia: se a unidade mudar, é preciso publicar a versão nova (o sistema não atualiza sozinho, de propósito).
- Cartão escondido guarda a data de revisão do aluno e mostra "infinity" na data visível dele (só aparece na exportação dos dados da conta).
- `ch_publish_problems` e outras funções internas ficaram fechadas para o aluno (antes eram abertas); nada do app usa essas chamadas direto.
- Grupos A/C/D/E: nenhuma das funções que redefini aparece nas migrações deles hoje (conferido). Se alguém redefinir `ch_publish_problems`, `app_ch_publish`, `app_ch_retire` ou as `app_ch_visual_*` depois, parta da minha versão (9861/9863).
