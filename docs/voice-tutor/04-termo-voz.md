# 04 — Termo de Aceite e Uso 2.0 e Política de Privacidade (Tutor de voz)

**Situação:** pronto para ativar quando o dono decidir. Nada foi publicado e nada foi aplicado no banco real.
**Revisão jurídica:** não é etapa obrigatória antes de ativar (decisão do dono, 16/10/2026). Os pontos sensíveis ficam
registrados como **riscos conhecidos** na seção 6.
**Data:** 16/10/2026 · **Ramo:** `vt-termo` (a partir do `main` c71bb6f9) · **Pedido do dono:** 15/10/2026, decisões finais em 16/10/2026.

## Resumo em linguagem simples

1. O novo Termo (versão **2.0**) diz que o app é só para **maiores de 18 anos que são médicos(as) formados(as)**, e pede duas
   declarações marcadas, que ficam gravadas no banco junto do aceite (data, hora, versão).
2. Ele **dá nome aos fornecedores** do Tutor (Anthropic; Google Cloud / Vertex AI; OpenAI; ElevenLabs), explica o que cada um
   recebe, que o StaziaMed **não grava o áudio** da voz do aluno e que o **texto das falas por voz é apagado em 7 dias**.
3. Traz o **consentimento de voz** (o microfone é opcional, para que serve o áudio, como retirar o consentimento).
4. **Palavrões e humor adulto vêm LIGADOS POR PADRÃO para todos** (Durona e nível Explosiva), porque todos são médicos 18+;
   o aluno pode **desligar quando quiser** nas preferências do tutor. O aceite específico do Tutor (§34) muda junto (versão 2.0).
5. O código está pronto e testado, mas **não liga sozinho**: a 2.0 só passa a valer quando o dono colar o SQL de ativação. Aí
   todo aluno aceita de novo no próximo login (Termo e, no Tutor, o §34).

### Decisões do dono (16/10/2026)

| Tema | Decisão | Onde está |
|---|---|---|
| Durona / Explosiva | "ativo para todos": palavrões e humor adulto **ligados por padrão**; o aluno pode desligar | Termo §5, §34, §35; Política §3; cartão do Tutor 2.0 |
| Retenção do texto das falas de voz | "menos tempo" que 30 dias: **7 dias** | Termo §24; Política §3; SQL de ativação |
| Voz ao vivo do Google | passa para o **Google Cloud Vertex AI** (não a API gratuita do Gemini) | Termo §20 e §24; Política §3 |
| Histórico da ElevenLabs | "vamos manter como está": retenção conforme as regras da ElevenLabs, sem prometer apagar | Termo §24; Política §3 |
| Advogado | não é etapa obrigatória antes de ativar; pontos ficam como riscos conhecidos | seção 6 |

---

## 1. O que o código faz hoje (conferido no código, não na memória)

### 1.1 Fornecedores realmente usados pelo Tutor

| Parte do Tutor | Fornecedor | O que recebe | Onde está no código | Liga/desliga |
|---|---|---|---|---|
| Respostas do Tutor (texto) | **Anthropic (Claude)** — padrão | o texto da conversa, inclusive o texto da fala transcrita | `server/tutor/engine.ts` (`resolveTutorProvider`, `TUTOR_AI_PROVIDER` padrão `anthropic`) | `TUTOR_AI_ALLOW_EXTERNAL=1` |
| Voz ao vivo (1ª opção) | **Google — Gemini Live** (`gemini-3.8-live`). **Hoje** pela Gemini API (`GEMINI_API_KEY`); **decisão: passar para o Vertex AI** (mudança de código ainda não feita, ver 3A) | o **áudio da voz do aluno**, direto do navegador ao Google (chave temporária criada no servidor); transcrição de entrada e saída ligadas | `server/tutor/voiceProviders.ts` (`geminiVoiceConfig`, `createGeminiVoiceToken`) | `TUTOR_VOICE_ALLOW_EXTERNAL=1` **e** `TUTOR_LIVE_VOICE_ALLOW_EXTERNAL=1` |
| Voz ao vivo (reserva) | **OpenAI — GPT-Live** e **Realtime** | o **áudio da voz do aluno** (WebRTC) | `voiceProviders.ts` (`createLiveSession`), `realtime.ts` | as mesmas duas travas + modelos no ambiente |
| Transcrição da fala ("voz do professor"/Nexus) | **OpenAI** `gpt-4o-mini-transcribe` | o **áudio** (até 45 s / 4 MB), que passa pelo nosso servidor só na memória | `server/tutor/stt.ts` (cabeçalho: "nada grava nem registra o áudio ou o texto") | `TUTOR_STT_ALLOW_EXTERNAL=1`; microfone só da equipe até o dono abrir (`stt_team_only`) |
| Voz do professor | **ElevenLabs** `eleven_v3` (TTS) | só o **texto da resposta** do professor (pode conter o primeiro nome do aluno). **Não recebe a voz do aluno.** | `server/tutor/elevenlabsTts.ts`, `speech.ts`, `nexus.ts` | `TUTOR_VOICE_ALLOW_EXTERNAL=1`, voz aprovada no painel, "só equipe" |
| ElevenAgents (agente de conversa da ElevenLabs) | **não é usado hoje** | — | nenhuma ocorrência no código (busca por `convai`, `agent_id`) | é o caminho estudado no diagnóstico (`01-diagnostico.md`, seção 12) |

Estado das travas no ar (memória do projeto, não conferido de novo no painel da Vercel): a **voz ao vivo dos alunos está desligada**
(`TUTOR_LIVE_VOICE_ALLOW_EXTERNAL` não existe na Vercel, fechamento da leva 2 em 11/10) e o **microfone da Nexus é só da equipe**.
Ou seja: hoje, na prática, **nenhum aluno manda áudio** a fornecedor. O Termo 2.0 precisa estar em vigor **antes** de abrir isso.

### 1.2 O que o StaziaMed guarda

| O quê | Guarda? | Por quanto tempo | Onde |
|---|---|---|---|
| Áudio da voz do aluno | **Não** | — | `stt.ts` (só memória); na voz ao vivo o áudio nem passa pelo servidor |
| Texto das falas da **voz** (transcrição) | Sim, se `tutor_config.save_transcripts` estiver ligado (padrão: **ligado**) | `tutor_config.transcript_retention_days`: padrão do código **180 dias** (0 = sem prazo); **a ativação põe 7 dias**. Apagado por `ch_worker_tutor_purge_transcripts`, chamado a cada minuto pela rotina `/api/tutor/voice/sweep` (`vercel.json`) | `tutor_messages` com `meta.realtime = true` (migração …4400) |
| Conversas **por escrito** com o Tutor | Sim | **sem prazo** (até a conta ser excluída; apaga junto com a conta) | `tutor_messages` |
| Prova do aceite | Sim | fica mesmo depois de excluir a conta (sem a pessoa; e-mail só em código SHA-256) | `legal_acceptances` (…5300) |
| Declarações 18+ e médico (novo) | Sim | igual à prova do aceite | `legal_declarations` (…11500, nova) |

**Os valores reais de produção de `save_transcripts` e `transcript_retention_days` não foram lidos** (sem acesso ao banco real nesta
tarefa). O SQL de ativação põe a retenção em **7 dias** (se estiver em 0 ou acima de 7). Depois disso, **não aumentar no painel**
sem trocar o Termo.

---

## 2. O que a documentação oficial dos fornecedores diz (consultada em 16/10/2026)

Só o que está escrito nas páginas abaixo. O que não achei está marcado **NÃO CONFIRMADO**. Os links ficam aqui no documento
interno; o texto do aluno não traz links.

- **Google Cloud — Vertex AI, governança de dados (atualizada em 15/10/2026):** "Google won't use your data to train or fine-tune any
  AI/ML models without your prior permission or instruction." Cache em memória dos modelos Gemini ligado por padrão e apagado "no
  later than 24 hours after it's written" (dá para desligar com `disableCache: true`). O Google "may log prompts to detect potential
  abuse" (prazo **NÃO CONFIRMADO** na página; dá para pedir exceção do monitoramento de abuso). Na **Live API**, a retomada de sessão
  vem desligada; se ligada, guarda dados por até 24 h ("To achieve zero data retention, do not enable this feature").
  <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance> ·
  <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention>
  (a segunda página já fala em "Gemini Enterprise Agent Platform", novo nome do Vertex AI).
- **ElevenLabs — agentes (ElevenAgents), retenção:** "By default, ElevenLabs retains conversation data for 2 years." Ajuste por
  agente em *Advanced › Data Retention* ou pela API em `platform_settings.privacy.retention_days`; `0` = "scheduled deletion",
  `-1` = sem limite; ao reduzir, dá para aplicar também às conversas antigas (apaga na hora o que passou do prazo).
  <https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention>
- **ElevenLabs — agentes, gravação de áudio:** "By default, audio recordings are enabled." Desliga em *Advanced › Privacy Settings*
  ou `platform_settings.privacy.record_voice = false`; a transcrição continua visível.
  <https://elevenlabs.io/docs/eleven-agents/customization/privacy/audio-saving>
- **ElevenLabs — TTS (o que usamos hoje):** "Customers by default have history preservation enabled." O modo de retenção zero
  (`enable_logging=false`) é só para clientes **Enterprise**; sem ele, a ElevenLabs guarda conforme a Política de Privacidade dela.
  Prazo do histórico do TTS: **NÃO CONFIRMADO** (a página não diz). **Decisão do dono: manter como está.**
  <https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode>
- **ElevenLabs — Termos de Uso (atualizados em 09/10/2026):** "If you are under 18 years of age (...) you may not use our Services".
  <https://elevenlabs.io/terms-of-use>
- **OpenAI — API:** dados da API **não** são usados para treinar modelos (salvo opção expressa); registros de monitoramento de abuso
  por **até 30 dias**. Tabela por endpoint: `/v1/audio/transcriptions` → monitoramento **nenhum**, estado **nenhum**;
  `/v1/realtime` → **30 dias**; `/v1/live/sessions` → **30 dias** ("None, or 30 days if stored" para o estado).
  <https://developers.openai.com/api/docs/guides/your-data>
- **Anthropic — API comercial:** apaga entradas e saídas em **até 30 dias**; se marcado por violação de política, até **2 anos**
  (página de 01/07/2026). Uso para treino: a página não diz (**NÃO CONFIRMADO** aqui).
  <https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data>

---

## 3. O que precisa ser verdade ANTES de ativar (senão o Termo promete o que não acontece)

| # | Item | Situação | Quem |
|---|---|---|---|
| A | **Voz ao vivo do Google pelo Vertex AI.** O Termo e a Política dizem Google Cloud (Vertex AI). O código ainda cria a chave temporária pela Gemini API (`GEMINI_API_KEY`, `voiceProviders.ts`). Trocar para o Vertex (ou manter a voz ao vivo desligada até lá). Ao trocar: não ligar a retomada de sessão da Live API sem necessidade (guarda até 24 h) — hoje o app usa a retomada ao reconectar. | **pendente (código)** | frente da voz |
| B | **Palavrões e humor adulto ligados por padrão.** Hoje o padrão do aluno é `tutor_preferences.profanity = 'off'` e a Durona só vale se o aluno escolher (`app_tutor_start`, migração …3100). Mudar o padrão e garantir a opção de **desligar** nas preferências antes de ativar. | **pendente (código)** | frente de personalidade |
| C | **Retenção da transcrição em 7 dias.** O SQL de ativação ajusta. Não aumentar depois no painel sem trocar o Termo. | resolvido pelo SQL | — |
| D | **ElevenLabs (TTS):** histórico mantido como está (decisão do dono). O texto só diz que os fornecedores podem manter registros "conforme as regras de cada um". | decidido | — |
| E | **ElevenAgents (se for adotado):** configurar o agente com `record_voice = false` e `retention_days` mínimo **antes** de abrir para alunos, e atualizar o Termo se o áudio do aluno passar a ir à ElevenLabs (hoje o texto diz que ela **não** recebe a voz). | futuro | equipe |
| F | **Motor de texto:** confirmar no servidor que `TUTOR_AI_PROVIDER` é Anthropic (o Termo nomeia a Anthropic). | conferir | equipe |

---

## 4. Texto do Termo de Aceite e Uso 2.0

Texto completo em `src/novo/app/legal/termo-uso-v2.0.md`. As seções que **não aparecem abaixo são iguais à 1.0, palavra por
palavra** (2, 3, 4, 6, 7, 8, 10 a 19, 21 a 23 e 25 a 32). A numeração foi mantida (o cartão do Tutor cita o §34).

#### 1. O QUE É O STAZIAMED REVALIDA

O **StaziaMed Revalida** é uma plataforma digital de apoio educacional destinada à preparação de **médicos e médicas formados em Medicina** para o **Exame Nacional de Revalidação de Diplomas Médicos Expedidos por Instituições de Educação Superior Estrangeiras — Revalida**.

A plataforma é exclusiva para **pessoas com 18 anos ou mais** que já concluíram a graduação em Medicina (veja a seção 9).

A plataforma poderá disponibilizar, entre outros recursos:

- aulas e mini aulas;
- Grandes Temas;
- conteúdos organizados por áreas médicas;
- questões de múltipla escolha;
- simulados;
- flashcards;
- revisões programadas;
- caderno de erros;
- banco de imagens;
- cronogramas e trilhas de estudo;
- análise de desempenho;
- ranking e sistema de conquistas;
- missões e mecanismos de gamificação;
- simuladores para preparação da etapa prática;
- conteúdos baseados em diretrizes, protocolos e referências médicas;
- ferramentas de Inteligência Artificial;
- tutores virtuais por texto e/ou voz;
- recomendações personalizadas de estudo.

A plataforma possui finalidade exclusivamente **educacional e preparatória**.

O StaziaMed Revalida não representa, não pertence e não possui vínculo institucional com o **INEP, Ministério da Educação, Ministério da Saúde ou qualquer instituição responsável pela elaboração, aplicação ou correção oficial do Revalida**, salvo se expressamente informado.

#### 5. PERSONALIDADES DOS TUTORES

O usuário poderá selecionar diferentes estilos de tutor.

Dependendo da personalidade escolhida, o comportamento do tutor poderá variar quanto a:

- nível de objetividade;
- paciência;
- humor;
- formalidade;
- cobrança;
- intensidade das correções;
- ironia;
- sarcasmo;
- provocações educacionais;
- linguagem informal.

Algumas personalidades poderão utilizar linguagem mais firme e expressões populares brasileiras.

Quando o próprio usuário selecionar um tutor com personalidade mais intensa, como um tutor **direto, durão ou provocador**, declara compreender que poderá receber respostas com maior cobrança, ironia, impaciência simulada ou linguagem informal.

Essa característica faz parte da experiência educacional escolhida pelo usuário.

**Palavrões e humor adulto (Durona e nível Explosiva)**

Como a plataforma é exclusiva para médicos maiores de 18 anos, os tutores vêm com **palavrões, broncas encenadas, gritos de efeito, ironia e humor adulto LIGADOS POR PADRÃO** para todos os usuários, especialmente o tutor **Durona** e o seu nível mais intenso (**Explosiva**). Esses recursos são sempre usados como recurso de personagem, voltados ao erro ou à situação de estudo, nunca à pessoa.

O usuário pode **desligar** palavrões e humor adulto **a qualquer momento**, nas preferências do tutor, e ligar de novo quando quiser.

Esses recursos continuam sujeitos às proibições da seção 6.

#### 9. QUEM PODE USAR E CONTA DO USUÁRIO

O StaziaMed Revalida é destinado exclusivamente a quem, ao mesmo tempo:

- tem **18 anos ou mais**; e
- é **médico ou médica**, com a graduação em **Medicina concluída** (no Brasil ou no exterior).

Ao criar a conta ou aceitar este Termo, o usuário declara que atende às duas condições. As declarações ficam registradas junto com o aceite (data, hora e versão do Termo).

Se for constatado que o usuário não atende a essas condições, a conta poderá ser suspensa ou encerrada.

O acesso à plataforma é individual.

O usuário é responsável pelas informações utilizadas durante o cadastro e pela segurança de suas credenciais.

É proibido:

- compartilhar conta;
- vender acesso;
- emprestar acesso de forma recorrente;
- compartilhar senha;
- permitir que várias pessoas utilizem uma única assinatura;
- utilizar mecanismos para contornar limites da plataforma.

A plataforma poderá utilizar mecanismos de segurança para identificar acessos incompatíveis com uso individual.

Isso poderá incluir análise de:

- sessões simultâneas;
- dispositivos;
- localização aproximada;
- comportamento de acesso;
- alterações excessivas de dispositivo;
- tentativas de compartilhamento da conta.

Atividades consideradas suspeitas poderão resultar em solicitação de nova autenticação, bloqueio temporário ou suspensão da conta.

#### 20. USO DE INTELIGÊNCIA ARTIFICIAL

Ao utilizar funcionalidades de IA, o usuário reconhece que determinadas respostas podem ser produzidas de forma automatizada.

A plataforma poderá utilizar diferentes modelos ou fornecedores tecnológicos para processamento das solicitações.

Hoje, os Tutores de IA usam os seguintes fornecedores:

- **Anthropic (Claude)**: escreve as respostas do tutor a partir do texto da conversa, inclusive do texto da sua fala, quando você fala ao microfone;
- **Google Cloud (Vertex AI, modelos Gemini)** e **OpenAI**: conversa por voz ao vivo e transcrição da sua fala em texto (veja a seção 24);
- **ElevenLabs**: transforma em voz o texto das respostas do professor.

A lista pode mudar. Quando um fornecedor que recebe a sua voz for incluído ou trocado, esta seção será atualizada e, se a mudança for relevante, será pedido novo aceite.

O usuário não deverá inserir informações pessoais ou dados médicos identificáveis de pacientes reais nos tutores ou simuladores, salvo quando existir funcionalidade especificamente desenvolvida e autorizada para esse tratamento de dados.

#### 24. RECURSOS DE VOZ

Determinadas funcionalidades poderão permitir interação com tutores por voz.

A voz utilizada pelo tutor poderá ser produzida por tecnologias de síntese de voz.

O usuário reconhece que a voz apresentada é uma interface artificial e não corresponde necessariamente a uma pessoa real participando da conversa em tempo real.

**Quando você fala com o tutor**

Usar o microfone é **opcional**: todos os tutores também funcionam por escrito.

Quando você liga o microfone, o **áudio da sua voz** é enviado a um fornecedor de tecnologia para ser transformado em texto ou respondido na hora:

- na **conversa por voz ao vivo**, o áudio vai do seu aparelho para o **Google Cloud (Vertex AI, modelos Gemini)** ou, como reserva, para a **OpenAI**, que devolvem a fala do professor;
- na **voz do professor**, o áudio passa pelo servidor do StaziaMed só para ser transformado em texto pela **OpenAI**; a voz do professor é gerada pela **ElevenLabs**, que recebe apenas o texto da resposta, e não a sua voz.

**O que guardamos e por quanto tempo**

- **O StaziaMed não grava o áudio da sua voz.** O áudio é usado na hora e descartado.
- O **texto** das falas da conversa por voz (a transcrição) pode ficar no histórico da conversa para você rever e para o tutor lembrar do que foi dito. Ele é **apagado automaticamente depois de 7 dias**.
- As conversas **por escrito** ficam no seu histórico enquanto a sua conta existir. Ao excluir a conta, elas são apagadas.
- Os fornecedores processam o áudio e o texto para executar o pedido e podem manter registros por um período limitado, conforme as regras de cada um (por exemplo, para segurança e prevenção de abuso). Os detalhes estão na Política de Privacidade.
- Alguns fornecedores processam dados **fora do Brasil**.

**Consentimento para usar a sua voz**

Ao ligar o microfone pela primeira vez, você concorda que o áudio da sua voz seja enviado aos fornecedores acima, apenas para a conversa com o tutor.

O StaziaMed **não usa a sua voz para identificar você, não cria cópia da sua voz e não usa a sua voz para treinar modelos de Inteligência Artificial**.

Você pode retirar esse consentimento a qualquer momento: basta não usar o microfone e seguir por escrito, ou pedir pelo suporte.

Não fale ao microfone dados de pacientes reais nem de outras pessoas (seção 21).

#### 33. ACEITE ELETRÔNICO

O aceite realizado eletronicamente possui validade como manifestação de vontade do usuário.

Ao selecionar a opção de aceite, o usuário declara:

**“Declaro que li e compreendi os Termos de Aceite e Uso e a Política de Privacidade do StaziaMed Revalida e concordo com suas condições.”**

E, em seguida, marca também:

**“Declaro que tenho 18 anos ou mais.”**

**“Declaro que sou médico(a), com a graduação em Medicina concluída.”**

As três marcações são obrigatórias e ficam registradas com a data, a hora e a versão deste Termo.

#### 34. ACEITE ESPECÍFICO DOS TUTORES DE IA

Antes da primeira utilização dos Tutores de IA, poderá ser solicitado aceite específico:

**“Estou ciente de que os Tutores do StaziaMed Revalida utilizam Inteligência Artificial e podem cometer erros. Entendo que os tutores usam linguagem informal, humor adulto, ironia, cobrança e palavrões dentro do contexto educacional, ligados por padrão, e que posso desligar os palavrões e o humor adulto a qualquer momento nas preferências do tutor.”**

☐ **Li e concordo.**

#### 35. DECLARAÇÃO FINAL

Ao continuar utilizando o StaziaMed Revalida, o usuário confirma que:

- tem 18 anos ou mais e é médico(a), com a graduação em Medicina concluída;
- compreendeu a finalidade educacional da plataforma;
- entende que não existe garantia de aprovação;
- reconhece que ferramentas de Inteligência Artificial podem cometer erros;
- compreende que os tutores possuem diferentes personalidades e que palavrões e humor adulto vêm ligados por padrão e podem ser desligados por ele a qualquer momento;
- sabe que, ao usar o microfone, o áudio da sua voz é processado pelos fornecedores indicados na seção 24;
- aceita as características do tutor que escolher;
- compromete-se a não compartilhar sua conta;
- compromete-se a respeitar os direitos de propriedade intelectual;
- compromete-se a não inserir dados identificáveis de pacientes reais;
- concorda com as regras aplicáveis ao plano contratado;
- declara ter lido e aceitado este Termo e a Política de Privacidade.

---

## 5. Texto da Política de Privacidade (acompanha o Termo 2.0)

Arquivo: `src/novo/app/legal/privacidade-v2.js` ("Última atualização: 16 de outubro de 2026" — trocar pela data da ativação, se for
outra). Seções 2, 5, 6, 7 e 8 e a controladora (STAZIA TECNOLOGIA E EDUCAÇÃO LTDA) iguais à de 07/10/2026. Mudam:

#### 1. Dados tratados

Podemos tratar dados de cadastro e autenticação, perfil, plano, pagamentos, dispositivo, IP, registros de acesso, suporte e dados de aprendizagem, como respostas, desempenho, metas, histórico e interações com o tutor.

Guardamos também as declarações feitas no aceite do Termo (ter 18 anos ou mais e ser médico ou médica com a graduação em Medicina concluída), com a data, a hora e a versão do Termo, como prova do aceite.

Quando você usa o microfone do tutor, tratamos o áudio da sua voz e o texto da sua fala (transcrição), como explicado na seção 3.

#### 3. IA, voz e personalização

Interações com recursos de IA e voz podem ser processadas para responder, sintetizar áudio e adaptar a experiência. Fornecedores de IA recebem somente o necessário para executar a solicitação. Não envie dados reais de pacientes, prontuários ou informações sujeitas a sigilo.

**Fornecedores dos Tutores de IA.** Anthropic (Claude) escreve as respostas a partir do texto da conversa. Google Cloud (Vertex AI, modelos Gemini) e OpenAI fazem a conversa por voz ao vivo e a transcrição da fala. ElevenLabs gera a voz do professor a partir do texto da resposta e não recebe a sua voz.

**Áudio da sua voz.** O microfone é opcional. Quando você o liga, o áudio é enviado ao fornecedor só para ser transformado em texto ou respondido na hora. O StaziaMed não grava o áudio, não usa a sua voz para identificar você, não cria cópia da sua voz e não a usa para treinar modelos. A base legal é o seu consentimento, que você pode retirar deixando de usar o microfone ou pedindo pelo suporte.

**Transcrição.** O texto das falas da conversa por voz pode ficar no histórico da conversa por até 7 dias e depois é apagado automaticamente. As conversas por escrito ficam no histórico enquanto a conta existir.

**Retenção nos fornecedores.** Cada fornecedor pode manter registros do que recebeu por um período limitado, conforme as próprias regras (por exemplo, para segurança e prevenção de abuso), e alguns processam dados fora do Brasil. A conversa por voz ao vivo com o Google usa o Google Cloud (Vertex AI), serviço profissional pago no qual, segundo as regras do Google, os dados não são usados para treinar modelos sem autorização.

**Palavrões e humor adulto.** Vêm ligados por padrão (Durona e nível Explosiva) e podem ser desligados a qualquer momento nas preferências do tutor.

#### 4. Compartilhamento

Dados podem ser compartilhados com fornecedores de hospedagem, banco de dados, autenticação, pagamentos, análise, suporte, IA e voz, sob obrigações de segurança. Os fornecedores de IA e voz dos tutores estão nomeados na seção 3. Também poderá haver compartilhamento por exigência legal ou proteção de direitos. Alguns fornecedores podem processar dados fora do Brasil com salvaguardas adequadas.

---

## 6. Riscos conhecidos (registrados; sem revisão jurídica obrigatória antes de ativar)

1. **Declaração no lugar de comprovação.** O app só pede a declaração (18+ e médico). Não confere documento, CRM nem diploma.
   (Quem se forma no exterior e ainda vai revalidar **não tem CRM** — por isso o texto fala em "graduação em Medicina concluída".)
2. **Quem já tem conta e não é médico.** O Termo 1.0 aceitava "estudantes e candidatos". Com a 2.0, quem não puder declarar fica
   preso na tela de aceite (só consegue sair). Decisão do dono: todos os alunos são médicos.
3. **Voz como dado pessoal sensível.** A LGPD pode tratar a voz como dado biométrico quando ligada a uma pessoa (art. 5º, II; art. 11).
   O StaziaMed não usa a voz para identificar ninguém e não cria cópia da voz. O consentimento está dentro do Termo; não existe hoje
   uma tela própria de consentimento na primeira vez que o aluno liga o microfone (dá para fazer igual ao cartão do Tutor).
4. **Base legal** do áudio (consentimento) e do texto das conversas (execução do contrato).
5. **Transferência internacional:** todos os fornecedores processam fora do Brasil; o texto diz isso de forma geral.
6. **Fornecedores nomeados no texto do aluno:** trocar um fornecedor que recebe a voz pede nova versão do Termo ("se a mudança for
   relevante").
7. **Palavrões e humor adulto ligados por padrão** para todos: protegido pela elegibilidade (só médicos 18+), pela opção de desligar
   e pelas proibições do §6. Quem se incomodar só descobre depois da primeira conversa — o §34 2.0 avisa antes do primeiro uso.
8. **Retenção nos fornecedores** descrita de forma genérica ("período limitado, conforme as regras de cada um"); os prazos conhecidos
   estão na seção 2 deste documento, não no texto do aluno.
9. **"Os dados não são usados para treinar modelos"**: escrito como compromisso do StaziaMed e, na Política, só para o Google Cloud
   (Vertex AI), que é o que a documentação dele diz. Só vale depois do item 3A.
10. **Aceite eletrônico com três marcações** (§33): prova com data, hora, versão, navegador e e-mail em código; sem IP (decisão de 07/10).
11. **Idade nos termos da ElevenLabs e do Google:** exigem 18+ de quem usa o serviço (a conta é do StaziaMed). O público 18+ do Termo
    2.0 resolve o risco apontado no diagnóstico (ElevenLabs proíbe produto para menores sem aprovação).

---

## 7. Quadro "o que mudou" (1.0 → 2.0)

| Seção | Termo 1.0 (no ar desde 08/10) | 2.0 | Por quê | Risco (seção 6) |
|---|---|---|---|---|
| §1 O que é | "médicos, estudantes e candidatos" | só **médicos(as) formados(as)**, 18+ | decisão do dono 15/10 | 1, 2 |
| §5 Personalidades | perfis "direto, durão ou provocador" | + bloco: **palavrões, broncas e gritos encenados, ironia e humor adulto LIGADOS POR PADRÃO** para todos (Durona, Explosiva); o aluno desliga nas preferências quando quiser | decisão do dono 16/10 ("ativo para todos") | 7 |
| §9 Conta | "CONTA DO USUÁRIO" | "**QUEM PODE USAR** E CONTA": 18+ e graduação em Medicina concluída; declarações registradas; conta pode ser suspensa se não atender | elegibilidade e política da ElevenLabs | 1, 2 |
| §20 Uso de IA | "diferentes modelos ou fornecedores" | + lista: Anthropic (texto), **Google Cloud (Vertex AI)** e OpenAI (voz ao vivo e transcrição), ElevenLabs (voz do professor); troca relevante pede novo aceite | transparência; Vertex por decisão do dono 16/10 | 6 |
| §24 Recursos de voz | "regras de áudio deverão constar da Política" (pendente desde 07/10) | microfone opcional; para onde vai o áudio; **StaziaMed não grava o áudio**; transcrição da voz **7 dias**; conversas escritas até excluir a conta; fornecedores guardam por período limitado; fora do Brasil; **consentimento de voz** e como retirar | resolve a pendência do §24; 7 dias por decisão do dono 16/10 | 3, 4, 5, 8 |
| §33 Aceite | uma marcação | **três**: aceite + "tenho 18 anos ou mais" + "sou médico(a), com a graduação em Medicina concluída"; gravadas com data, hora e versão | prova da declaração | 10 |
| §34 Aceite dos Tutores | palavrões "quando selecionados por mim" | palavrões e humor adulto "ligados por padrão", e "posso desligar a qualquer momento nas preferências" (aceite do Tutor também vira 2.0) | coerência com o §5 | 7 |
| §35 Declaração final | 10 itens | + 18+/médico; palavrões ligados por padrão e desligáveis; ciência do áudio aos fornecedores | coerência | — |
| Rodapé | "Versão do Termo: 1.0 — Outubro de 2026" | "Versão do Termo: 2.0 — Outubro de 2026" | — | — |
| Política §1 Dados | lista geral | + declarações do aceite; + áudio e transcrição | — | 3 |
| Política §3 IA e voz | 1 parágrafo genérico | fornecedores nomeados (Google Cloud Vertex AI); áudio não gravado; consentimento; transcrição 7 dias; retenção nos fornecedores; Vertex não treina sem autorização; palavrões ligados por padrão | — | 3, 8, 9 |
| Política §4 Compartilhamento | geral | aponta para os fornecedores da §3 | — | 5 |
| Política "Última atualização" | 07/10/2026 | 16/10/2026 (trocar pela data da ativação) | — | — |

---

## 8. Como fica no sistema

**Peças (todas no ramo `vt-termo`, commits locais, sem push):**

- `supabase/migrations/20261003011500_termo_v2_declaracoes.sql` — **só estrutura, aditiva**; sozinha não muda nada para o aluno:
  coluna `legal_versions.requires_declarations` (padrão falso), tabela `legal_declarations` (RLS: cada um lê as próprias; ninguém
  grava pelo navegador; só "sim" é aceito), `legal_record` com as declarações (a antiga passa por ela e recusa quando a versão exige),
  `app_accept_terms_declared`, cadastro lendo `declares_adult`/`declares_physician` dos metadados, `app_legal_state` com
  `declarations_required` só quando a versão pede, exportação dos dados com `declarations`.
- `supabase/ativar/20261003011500_termo_v2.ativar.sql` — **o interruptor**: Termo vigente = 2.0 com declarações; aceite dos Tutores
  (§34) = 2.0; retenção da transcrição em **7 dias**. É isto que faz todo aluno aceitar de novo no próximo login (a tela de aceite e o
  cartão do Tutor já existiam e reagem à versão do banco).
- `supabase/desfazer/…_termo_v2.ativar.desfazer.sql` (volta Termo e §34 para 1.0 sem prender ninguém; retenção volta a 180) e
  `supabase/desfazer/…_termo_v2_declaracoes.desfazer.sql` (apaga a estrutura; perde as declarações gravadas).
- Site: a tela de aceite mostra o texto **da versão que o banco diz** e as duas declarações quando o banco pede
  (`AcceptanceScreen.jsx`, `documentos.js`); o cartão do Tutor mostra o §34 da versão que o banco diz (`TutorConsentCard.jsx`); o
  cadastro (e-mail e Google) pede as declarações quando `TERMO_VERSAO` for "2.0" (`AuthScreens.jsx`, `googleAcceptance.js`,
  `backend.ts`, `server/devDb/router.ts`); `session.acceptTerms` usa `app_accept_terms_declared` só nesse caso. `TERMO_VERSAO`
  **continua "1.0"**: o site deste ramo pode ir ao ar sem mudar o texto que o aluno vê.

**Ordem para ativar:** (1) resolver 3A e 3B (Vertex na voz ao vivo; palavrões ligados por padrão com opção de desligar);
(2) colar a migração 011500; (3) colar o SQL de ativação; (4) trocar `TERMO_VERSAO` para "2.0" em
`src/novo/app/legal/versions.js` e publicar o site. Entre (3) e (4) nada quebra: quem se cadastrar passa pela tela de aceite ao entrar.

**Testes (fila, PGlite e jsdom):** `termoV2Declaracoes.test.ts` (ensaio: migração aplicada duas vezes sem mudar colunas, políticas
e permissões que existiam, nem o estado do aluno; ativação; recusas; cadastro; RLS; exportação; conta apagada; desfazer da ativação;
desfazer da migração dentro de transação com **rollback**), `termoV2Telas.test.tsx`, `termoV2Cadastro.test.tsx`, mais as suítes
do Termo e do aceite do Tutor que já existiam.
