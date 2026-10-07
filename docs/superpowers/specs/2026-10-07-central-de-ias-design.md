# Central de IAs — especificação (etapa 1 de 5)

Escrito para: o dono do produto (revisar e aprovar) e quem for implementar.
Data: 2026-10-07. Situação: aguardando aprovação do dono.

## 1. O pedido e o objetivo
O dono pediu que as IAs do StaziaMed possam trabalhar **sozinhas ou em conjunto** em criação, verificação, checagem,
engenharia reversa e nas demais funções. Também pediu um menu para escolher **qual IA** e **qual modelo** usar: no Claude,
Opus, Fable ou Sonnet; no ChatGPT, os modelos da OpenAI. Hoje a Central usa Gemini e Claude; entram também **OpenAI** e
**Ollama**.

O pedido completo foi dividido em 5 etapas, com especificação e plano próprios para cada uma. Esta é a **etapa 1**, a base
das outras:

1. **Central de IAs** (este documento).
2. Assistentes de IA em Questões, Podcasts, Atualizações e Estações (preencher, conferir e revisar), com um seletor de IA em
   cada aba, em teste.
3. Editor estilo Word (formatação, espaçamento, fontes) em Aulas, Questões, Atualizações, Estações e Podcasts, com o aluno
   vendo a formatação.
4. Criação de materiais com IA nos modelos visuais (PDF, cards, flashcards e um modelo novo de mapa mental), sempre com
   prévia, correção e aprovação antes de enviar ao destino.
5. Motor de engenharia reversa do Mac (`revalida-reverse-engine`) lendo a escolha da Central.

**Objetivo da etapa 1:** uma tela única onde o administrador liga as IAs, escolhe os modelos e define, para cada função,
como elas trabalham, com teto de gasto. Um único "maestro" no servidor executa essas escolhas para todo o sistema.

## 2. Decisões do dono (2026-10-07)
| Pergunta | Decisão |
|---|---|
| Onde roda o Ollama | Só no Mac do dono. No site publicado e no Cloud Run aparece como "roda só no Mac" e não pode ser escolhido. |
| Como trabalhar em conjunto | Os dois modos: **linha de produção** (uma cria, outras conferem) e **comitê** (várias fazem a mesma tarefa e o sistema mostra concordâncias e divergências), escolhidos por função. |
| Engenharia reversa | Vale na Central (análise de questões) e no motor do Mac. O motor fica para a etapa 5. |
| Controle de gasto | Teto mensal e teto por execução. Ao atingir o teto, as IAs pagas param com aviso, e o Ollama continua. |
| Assistentes nas abas | Preencher a partir do material, conferir o que já existe e revisar a redação (etapa 2). |
| Caminho | Uma Central de IAs única. Em cada aba, um seletor para trocar a IA naquela execução, em teste; se ficar repetitivo, sai. |
| Editor estilo Word | Em Aulas, Questões, Atualizações, Estações e Podcasts (etapa 3). |
| Autorização de envio | Ligar uma IA no menu vale como a autorização do dono para enviar texto àquela IA, registrada com data e nome. O interruptor geral "IA ligada" e o desligamento pelo servidor valem mais. |
| Modelo pago sem preço | Fica bloqueado enquanto o teto estiver ligado (nunca gastar às cegas). |

## 3. O que já existe e será reaproveitado
- **Provedores** em `server/contentHub/ai/provider.ts` (Claude/Anthropic, Gemini, OpenAI), configurados hoje só por
  variáveis de ambiente.
  - Variáveis atuais: `CONTENT_HUB_AI_PROVIDER`, `..._MODEL`, `..._PROVIDER_CREATE`, `..._PROVIDER_SOURCES/_CURRENCY/_REDTEAM`
    e `CONTENT_HUB_AI_FALLBACK_PROVIDER`.
- **Papéis:** criação mais conferentes ("fontes", "atualidade", "advogado do diabo"). A regra de independência por família
  de modelo (`familyOfModel`) e a reserva com nova tentativa (`FallbackProvider`) já existem.
- **Quem chama IA hoje:**
  - as etapas da Central (`pipeline.ts`);
  - a análise de questões (`questionAnalysis.ts`, `questionReanalysis.ts`);
  - o assistente das Aulas (`server/lessons/assist.ts`, com escolha Gemini/Claude/OpenAI na tela);
  - o roteiro dos Podcasts (`server/podcasts/script.ts`).
- **Registros de uso que já existem:**
  - `ch_ai_runs`: execuções da Central, com prompt e custo;
  - `ai_usage_ledger`: Tutor, podcasts e assistente de aula;
  - `admin_audit_log`: ações do administrador.
- **Interruptores da Central:** `ch_flags` (`enabled`, `ai_enabled`, `shadow_mode`) e as variáveis `CONTENT_LAB_ENABLED` e
  `CONTENT_LAB_AI_ENABLED`.

## 4. Escopo da etapa 1
**Entra:**
1. O provedor **Ollama**, ao lado dos três que já existem.
2. **Lista de modelos** de cada IA, consultada na própria empresa com a chave do servidor (no Ollama, no próprio Ollama).
   Ela fica guardada no banco, com o botão "Atualizar lista".
3. **Configurações no banco:** IAs ligadas, funções, modos, reservas, preços, tetos e o interruptor do seletor nas abas.
   Só o administrador grava, e toda mudança é registrada.
4. **O maestro:** um único módulo no servidor que executa os três modos, confere tetos e preços e registra cada chamada.
5. **Os usos atuais passam pelo maestro:** etapas da Central, análise de questões, assistente das Aulas e roteiro dos
   Podcasts.
6. **A tela** Administração › **Central de IAs** e um resumo com atalho na Configuração da Central de Conteúdo.
7. **O roteiro do Cloud Run** passa a levar ao Secret Manager as chaves das IAs presentes no `.env`.

**Fica fora:**
- Os assistentes nas outras abas e o seletor nas abas: o interruptor já existe na etapa 1, mas o seletor só aparece na
  etapa 2.
- O editor estilo Word.
- A criação de materiais e o mapa mental.
- O motor do Mac.
- O **Tutor**: texto e voz continuam como estão, com as cotas próprias por aluno. O gasto dele aparece na tela só como
  informação e não entra no teto.

## 5. As funções e os modos
**Funções** (as mesmas da tela):

| Chave | Nome na tela | Usos na etapa 1 |
|---|---|---|
| `criacao` | Criação | Rascunhos da Central (classificar, afirmações, rascunho de unidade), criação da análise de questões, roteiro do podcast, assistente das Aulas |
| `verificacao` | Verificação e checagem | Evidências nas fontes, revisão automática dos rascunhos, conferentes da análise de questões (fontes, atualidade, advogado do diabo) |
| `engenharia_reversa` | Engenharia reversa | DNA da questão e reanálise na Central (o motor do Mac entra na etapa 5) |
| `assistente_preencher` | Assistente: preencher | Reservada para a etapa 2 (já configurável) |
| `assistente_conferir` | Assistente: conferir | Reservada para a etapa 2 |
| `assistente_revisar` | Assistente: revisar a redação | Reservada para a etapa 2 |

**Modos** (um por função):
- **Sozinha:** uma IA e um modelo, mais uma reserva opcional. Se a principal falhar, uma nova tentativa e depois a reserva.
- **Linha de produção:** uma criadora e de um a três conferentes. Cada conferente recebe o material e a resposta e devolve
  um parecer padronizado ("de acordo" ou a lista de problemas, com gravidade baixa, média ou alta).
  - Qualquer problema de gravidade alta marca o resultado como "precisa de revisão".
  - Nada é aprovado pela IA: a decisão é sempre de uma pessoa.
- **Comitê:** de duas a quatro IAs recebem o mesmo pedido em paralelo, com tempo-limite.
  - O maestro compara os campos objetivos da resposta (os que o pedido marca como comparáveis, ex.: gabarito, área,
    classificação) e marca concordância ou divergência.
  - Os textos livres vão lado a lado, e a equipe escolhe qual usar. Não existe "fusão automática" de textos.

**Cuidado:** "rápido" ou "caprichado". Vira o esforço ou raciocínio do provedor quando ele oferece isso (ex.: `effort` no
Claude); quando não oferece, é ignorado.

**Regra de independência** (já existente, agora aplicada a todos os conferentes e membros de comitê):
- O conferente nunca é da mesma família de modelo da criadora (ex.: Sonnet cria e Opus confere não vale).
- No comitê, membros da mesma família são permitidos, mas a tela avisa que "não é independente".
- A tela impede salvar uma linha de produção inválida, e o maestro confere de novo na hora de executar.

## 6. Dados (migração nova)
Tabelas novas, todas com RLS: leitura para o administrador e gravação só pelas funções do servidor.
- **`ai_providers`:** uma linha por IA (`anthropic`, `openai`, `gemini`, `ollama`). Guarda se está ligada, quem ligou e
  quando (a autorização), a lista de modelos e quando foi atualizada, e a última situação conhecida (pronta, sem chave,
  chave recusada, roda só no Mac).
- **`ai_model_prices`:** preço por milhão de tokens de entrada e de saída de cada modelo, com origem (página oficial e data
  conferida) e quem editou. Modelos do Ollama têm custo zero.
- **`ai_functions`:** uma linha por função, com:
  - o modo;
  - a IA e o modelo principal;
  - a reserva;
  - os conferentes ou membros do comitê (lista de pares IA e modelo);
  - o cuidado;
  - quem mudou e quando.
- **`ai_settings`:**
  - o teto mensal em dólares;
  - o teto por execução em dólares (uma execução = um pedido ao maestro, com todas as IAs que ele chamar);
  - os tetos ligados ou desligados;
  - o interruptor "permitir trocar a IA nas abas" (desligado por padrão).
- **`ai_calls`:** registro de cada chamada feita pelo maestro. É a base dos tetos e do gasto mostrado na tela, e guarda:
  - quem pediu e a função;
  - o modo e o papel (criadora, conferente, membro, reserva);
  - a IA e o modelo;
  - tokens de entrada e saída, custo estimado e duração;
  - o resultado (ok, falha, recusada pelo teto);
  - a origem (Central, aula, podcast…) e o identificador do item.
- **O que continua igual:**
  - `ch_ai_runs` segue gravando o prompt e a saída da Central, para reproduzir resultados;
  - `ai_usage_ledger` segue com o Tutor;
  - o assistente das Aulas e o roteiro dos Podcasts passam a gravar em `ai_calls`.
- **Mudanças de configuração** vão para `admin_audit_log`.

**Gasto do mês:** soma de `ai_calls.cost_usd` no mês corrente, no horário de Brasília.

## 7. O maestro (servidor)
Módulo novo, `server/ai/maestro.ts`. Os provedores continuam em `server/contentHub/ai`, com o Ollama novo em
`server/contentHub/ai/ollama.ts`.

```
executar(função, pedido estruturado, origem, troca da aba?) →
  1. lê as configurações (banco; guardadas por alguns segundos); sem configuração no banco, usa as variáveis de hoje
  2. confere: interruptores gerais, IA ligada e com chave, Ollama só onde alcançável, independência
  3. estima o custo no pior caso (entrada: caracteres ÷ 4 × preço de entrada; saída: limite de saída do pedido ×
     preço de saída), somando todas as IAs da execução (num comitê de 3, as 3), e confere o teto da execução e o do
     mês (gasto real já registrado + estimativa); modelo pago sem preço com teto ligado = bloqueado
  4. executa o modo (sozinha / linha de produção / comitê)
  5. grava cada chamada em ai_calls e devolve: resultado(s), pareceres, concordâncias, situação ("ok",
     "precisa de revisão", "parou no teto") e custo total
```

- **Compatibilidade:** a regra "o banco vale mais que as variáveis de ambiente" só passa a valer quando a função tiver
  configuração salva. Antes disso, tudo segue como hoje.
- **Troca da aba (etapa 2):** só é aceita com o interruptor ligado. Só pode escolher IAs ligadas e modelos da lista, e
  passa pelas mesmas conferências.
- **Ollama:**
  - **Endereço:** `OLLAMA_BASE_URL` (padrão `http://localhost:11434`).
  - **Lista de modelos:** pela API do próprio Ollama, sem chave e sem custo.
  - **Indisponível:** quando o endereço não responde, como na Vercel e no Cloud Run, aparece como "roda só no Mac".
- **Listas de modelos:**
  - Claude, OpenAI e Gemini: pela API de cada empresa com a chave do servidor.
  - Só entram modelos de texto (ficam de fora os de imagem, voz e embeddings).
- **Preços iniciais:** conferidos na página oficial de cada empresa na implementação, com data. O dono pode editar.

## 8. A tela (Administração › Central de IAs, só administrador)
1. **IAs:** um cartão por IA, com:
   - a situação;
   - ligar ou desligar (a autorização, com data e nome de quem ligou);
   - a lista de modelos e o botão "Atualizar lista";
   - o gasto do mês.
2. **Funções:** para cada função:
   - o modo;
   - a IA e o modelo principal;
   - a reserva;
   - os conferentes ou membros do comitê;
   - o cuidado;
   - aviso e bloqueio de independência.
   Mostra também a situação de cada uma ("pronta" ou o motivo de não estar).
3. **Gasto:** os tetos, o gasto do mês por IA e por função, as últimas chamadas e a tabela de preços editável. O Tutor
   aparece à parte, só como informação.
4. **Seletor nas abas:** o interruptor (desligado por padrão).
5. **Histórico:** quem mudou o quê e quando.

A Configuração da Central de Conteúdo troca a linha "IA" por um resumo (funções prontas, gasto do mês) e um atalho para a
Central de IAs.

## 9. Falhas e mensagens
- **IA fora do ar ou chave recusada:** a reserva assume; sem reserva, falha com o motivo.
- **Resposta fora do formato:** uma nova tentativa e, se falhar de novo, falha com o motivo. Nada é "consertado" por
  conta própria.
- **Teto atingido:** as IAs pagas não são chamadas e a mensagem diz qual teto foi atingido e quanto já foi gasto. O Ollama
  continua.
- **Conferente indisponível na linha de produção:** o resultado volta como "precisa de revisão (conferência incompleta)".
- **Membro do comitê com falha:** o comitê segue com os demais se restarem pelo menos dois; senão, falha.
- **Em todos os casos:** o rascunho ou o item da equipe nunca é apagado, e a falha fica registrada em `ai_calls`.

## 10. Segurança
- As chaves ficam só no servidor (Vercel e Cloud Run por variável ou Secret Manager). O navegador nunca recebe chave.
- Só o administrador grava as configurações. A equipe vê a situação, mas não muda.
- O texto enviado às IAs continua tratado como dado: as instruções contra seguir comandos que venham dentro do material
  seguem valendo.
- Nada aqui gera conteúdo clínico publicado: tudo é rascunho até a aprovação de uma pessoa, como hoje.

## 11. Testes
Com provedores simulados, sem gastar:
- os três modos;
- a reserva;
- a independência na tela e na execução;
- o comitê com membro em falha;
- tetos por execução e por mês;
- bloqueio de modelo pago sem preço;
- compatibilidade com as variáveis de ambiente quando não há configuração;
- permissão só para administrador;
- listas de modelos com a API simulada;
- Ollama fora do ar;
- registro em `ai_calls` e em `admin_audit_log`;
- a tela.

Chamada real a uma IA paga só com a autorização do dono, para medir o custo de verdade.

## 12. Publicação
1. Migração nova no Supabase.
2. Cloud Run: imagem nova e chaves das IAs no Secret Manager. O roteiro leva só as que estiverem no `.env`.
3. Site (Vercel): conferir quais chaves de IA existem lá. A `OPENAI_API_KEY` já existe.

As IAs começam **desligadas**: nada é chamado nem cobrado até o dono ligar cada uma no menu.

## 13. Pontos a confirmar na implementação
- **Preços:** os valores de cada modelo, conferidos e datados na página oficial de cada empresa.
- **Chaves:** quais existem hoje na Vercel e no `.env`. A chave da OpenAI em `revalida-reverse-engine/.env` foi recusada
  (401) em 2026-10-06 e não será usada.
