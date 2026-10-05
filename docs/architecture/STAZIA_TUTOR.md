# Stazia Tutor — desenho, o que foi feito e o que falta

> Escrito para: o dono do produto (decisões e custo) e quem for programar (mapa técnico).
> Origem: "Prompt mestre — Agente Tutor IA StaziaMed Revalida" (2026-10-04) e o lembrete de que o Tutor também é por voz.
> Estado: versão 1 implementada (migração `3100_tutor`). O Tutor nasce **desligado**.

## 0. Em uma página

O Tutor é um professor de IA que conversa com o aluno por **texto e por voz**, com 13 personalidades. A regra que organiza tudo:

```
NÚCLEO CIENTÍFICO (igual para todos)          PERSONALIDADE (o aluno escolhe)
 fato, gabarito, fonte, segurança              tom, humor, cobrança, tamanho da resposta
 → server/tutor/prompts.ts + safety.ts         → tabela tutor_personalities + server/tutor/personality.ts
```

A personalidade é um conjunto de **parâmetros** (0 a 100), não um prompt próprio: o mesmo núcleo atende os 13 professores.
Ela é aplicada **depois** de o conteúdo estar decidido, e toda resposta passa por uma **validação de software** antes de o aluno ver ou ouvir.

**O que o Tutor pode afirmar.** Valor com unidade (dose, corte, prazo), nome de documento, "conduta atual" e data de mudança só saem quando estão na
**base conferida** daquela conversa: a questão oficial (com as explicações oficiais), a análise Stazia revisada por médico, o cartão de atualização
publicado e os trechos de fontes oficiais vigentes. Fora disso, o Tutor ensina o raciocínio clínico e diz, com estas palavras:
*"Não encontrei confirmação suficiente na base disponível."*
Hoje **não há fonte oficial cadastrada nem análise publicada**: a base real é a questão oficial e suas explicações. Aula teórica com números depende do acervo.

## 1. O que existia (Fase 0)

| Achado | Consequência |
|---|---|
| A rota "Tutor IA" do app mostrava um **protótipo de design com texto fixo**, citando uma "diretriz da FEBRASGO" e valores sem fonte | **substituída** pela tela real (o desenho foi mantido) |
| `ai_usage` (uso de IA por aluno e por dia) existia, sem ninguém gravar nela | passa a ser o contador do limite diário e do custo |
| `server/ai/voiceTutor.ts` (app antigo) gera explicação falada sem base conferida | **não reaproveitado**: o Tutor novo valida antes de falar |
| 10 estações práticas, todas com revisão médica **pendente** | o modo Estação/Paciente virtual **não entrou**: precisa de estação revisada |
| 1.200 questões, todas com explicação oficial; 1.117 com classificação (subárea, competência, dificuldade) | base do modo Questões e da escolha adaptativa |
| `question_attempts`, caderno de erros, diagnóstico do erro (fase 5 do SQIE), provedores de IA com fallback, sinalizador `ai_enabled` | reaproveitados |

## 2. Arquitetura

```
Navegador (src/novo/app/tutor)                 Servidor (server/tutor)                         Banco (migração 3100)
 TutorScreen  ── rpc app_tutor_* ───────────────────────────────────────────────▶ tutor_personalities, tutor_config,
   escolha do professor, conversa,                                               tutor_preferences, tutor_sessions,
   questão, relatório                                                            tutor_messages, tutor_answers,
 useVoice (fala e escuta do aparelho)                                            tutor_reviews, ai_usage
   └─ POST /api/tutor/turn ──▶ engine.tutorTurn
                                1 pode responder? (ligado, plano, limite, IA)
                                2 contexto + base conferida ◀── ch_worker_tutor_context, fontes oficiais
                                3 NÚCLEO → MODO → (VOZ) → PERSONALIDADE
                                4 provedor de IA (com fallback)
                                5 VALIDAÇÃO (safety.ts) → nova tentativa → resposta fixa
                                6 grava ── ch_worker_tutor_append ──▶ mensagens + uso do dia
```

**Camadas do prompt (item 49).** Sistema: `TUTOR_CORE` (imutável) + modo de ensino + camada de voz (se o aluno está falando) + personalidade.
Dados: `<base>` (blocos Q, A, U, F1…), `<contexto_do_aluno>`, `<conversa>`, `<aluno>`, `<tarefa>`. As camadas fixas ficam guardadas em `ch_prompt_versions`.

**Validação (item 26, 48.10).** Barra, por regra de software: número com unidade fora da base; documento, link ou "conduta atual" sem citação de fonte;
citação que não é cópia exata; contestar o gabarito oficial; entregar a resposta com a questão aberta (antes da dica 5); palavrão acima do liberado;
ataque pessoal. Barrada, a IA recebe a lista e tenta de novo uma vez. Barrada outra vez, o aluno recebe uma resposta **fixa e honesta** e o texto inválido
nunca é gravado. Embaixo de cada resposta aparece de onde ela veio, calculado pelas citações válidas (não pelo que a IA declara).

**Quem corrige questão é o banco.** A IA nunca decide se o aluno acertou. Com a questão aberta, a IA **nem recebe** o gabarito (só nas dicas, que precisam dele).

## 3. Personalidades (itens 3–18, 50–53)

13 professores em `tutor_personalities` (parâmetros, jeito, primeiras falas e voz): Amigável, Rabugento, Xingão, Mal-Humorado, Preguiçoso, Socrático,
Preceptor de Plantão, Examinador do Revalida, Militar, Ansioso, Sarcástico, Nerd, Motivador.

- **Intensidade 1 a 5** afasta ou aproxima cada traço do neutro. Nunca toca em conteúdo.
- **Escolhas do aluno**: humor, tamanho da explicação (curta, normal, detalhada, nerd), cobrança (baixa, normal, alta, insana), palavrões.
- **Palavrão** só sai com três chaves: o personagem xinga (hoje só o Xingão), o aluno liberou e a plataforma permite. Vale o menor nível. É ênfase, nunca agressão.
- **Limites de toda personalidade**: nada de ataque pessoal, humilhação, insulto à inteligência, discriminação ou comentário sobre aparência, raça, religião,
  gênero, orientação sexual, deficiência ou saúde mental. Isso está no prompt **e** na validação.
- **Tutor Inteligente (item 31)**: três erros seguidos → pega mais leve e volta aos fundamentos, **avisando o aluno**; três acertos limpos → sobe a complexidade.
  O professor escolhido nunca muda sozinho.
- A primeira fala de cada conversa vem do repertório do personagem, **sem chamar IA**.

## 4. Modos de ensino (item 19) e o que cada um usa

| Modo | Estado | Base |
|---|---|---|
| Questões | **feito** | questão real do banco, escolhida pelos pontos fracos e pelo nível da conversa; dicas 1 a 5; confiança 0 a 5 |
| Revisão de erros | **feito** | o que o aluno errou e as revisões na hora (1, 3, 7, 14, 30 dias) |
| Perguntas (socrático) | **feito** | tema livre ou uma questão que o aluno já respondeu |
| Aula · Revisão rápida | **feito**, limitado | sem fonte oficial sobre o tema, ensina o raciocínio e diz que números dependem de fonte |
| Conversa livre | **feito** | idem |
| Flashcards | não feito | — |
| Caso clínico · Plantão · Prova oral | não feito | exigem caso com dados clínicos inventados e gabarito revisado por médico |
| Estação prática · Paciente virtual | não feito | as 10 estações estão com revisão médica pendente |

**Dicas (item 35).** 1 direcionamento, 2 conceito, 3 eliminar alternativas, 4 raciocínio quase completo, 5 resposta explicada. A dica 5 **revela**: a questão
fecha e não conta no histórico. Com 3 dicas ou mais, mesmo acertando a questão volta em revisão.
**Confiança (item 34).** Acerto com certeza = consolidado; acerto com confiança mínima = provável chute (o Tutor pede o porquê e a questão volta em revisão,
a menos que o aluno explique bem); erro com certeza = prioridade máxima.
**Dificuldade (item 21).** Três acertos limpos sobem um nível; dois erros seguidos descem dois. O nível escolhe a faixa de dificuldade da questão
(baixa, moderada, alta). Os níveis 8 a 10 da especificação (prova oral, estação, caso integrado) ainda não têm conteúdo.
**Domínio (item 20).** DOMINADO ≥ 85% · BOM ≥ 70% · INTERMEDIÁRIO ≥ 55% · FRACO ≥ 40% · CRÍTICO abaixo; com menos de 5 respostas, "sem dados".

## 5. Voz (itens 27–28)

O aluno fala e ouve o professor **no próprio aparelho**, com o reconhecimento e a síntese de voz do navegador (`useVoice.js`):

- o que é falado é sempre o **texto que já passou pela validação**; por isso a voz não usa um modelo de áudio em tempo real, que falaria antes de ser conferido;
- cada personalidade tem velocidade e tom próprios (`tutor_personalities.voice`);
- com a voz ligada, o Tutor escreve para o ouvido (frases curtas, sem lista nem símbolo);
- **interrupção**: o aluno toca no microfone ou em "Interromper", o professor para na hora, e a frase que estava sendo dita volta para o servidor, para ele
  retomar daquele ponto; dizer só "espera" faz o professor parar sem virar mensagem;
- depois de falar, o Tutor volta a ouvir sozinho quando a conversa começou por voz.

Limites: a voz é a do aparelho (qualidade varia); a latência é a de um turno de texto (alguns segundos), não a de uma chamada em tempo real; navegador sem
microfone por API (ex.: Firefox) só lê em voz alta; em alguns navegadores o reconhecimento de fala manda o áudio ao fabricante do navegador.

## 6. Memória e relatório (itens 29, 30, 42, 43)

Guardado por aluno: professor e intensidade, conversas e mensagens, respostas no Tutor (confiança, dicas, chute, tipo de erro apontado pela IA), revisões
agendadas, uso do dia. O relatório (`app_tutor_report`) traz domínio por área, temas críticos, área de maior risco, evolução de 30 dias, revisões e números do
Tutor. **Não há previsão de aprovação**: não existe base para isso. A memória nunca altera fato científico.

## 7. Custo, limites e chaves

- Cada fala do aluno é **uma chamada de IA** (duas quando a primeira resposta é barrada). Estimativa, **não medida**: cerca de US$ 0,01 a 0,02 por mensagem
  com os preços configurados hoje no servidor. Com o limite padrão de 40 mensagens por aluno por dia, o teto fica perto de US$ 0,60 por aluno por dia.
- `tutor_config`: ligado/desligado, só planos pagos, mensagens por dia, teto de palavrões, voz. Só administrador muda, com motivo, e fica no registro.
- Servidor: `TUTOR_AI_PROVIDER` (padrão anthropic), `TUTOR_MODEL` (opcional), `TUTOR_ENABLED=false` desliga no servidor. O Tutor respeita o sinalizador
  `ai_enabled` da Central de Conteúdo e exige `CONTENT_HUB_AI_ALLOW_EXTERNAL=1`, porque a fala do aluno é enviada ao provedor de IA.

## 8. Cobertura da especificação (itens 1–58)

| Situação | Itens |
|---|---|
| **Feito** | 1 (duas camadas), 2 (pensar → responder → justificar → corrigir), 3–18 (13 personalidades por parâmetros, intensidade), 19 em parte (6 modos), 20–21 (domínio e dificuldade), 22–23 (tratamento do erro e correção de questão), 24 (gabarito oficial × conduta atual, quando houver cartão publicado), 25–26 (fontes e nada inventado), 27–28 (voz, com os limites do §5), 29–30 (memória e revisão espaçada), 31 (Tutor Inteligente), 32–35 (acertos, chutes, confiança, dicas), 42–43 (métricas e relatório), 44–46 (escolha do professor, configuração, primeira fala), 47–49 (contexto, ordem de decisão, camadas), 50–53 (parâmetros, variação), 54–56 |
| **Feito em parte** | 19 (faltam flashcards, caso clínico, plantão, prova oral, estação), 21 (níveis 8–10 sem conteúdo), 42 (tempo de resposta e retenção não são medidos) |
| **Não feito** | 36–40 (segunda fase: estação, paciente virtual, avaliação por checklist, erros críticos de segurança), 41 (XP, níveis, conquistas, ranking), "gerar questão estilo INEP" (questão nova exige revisão médica; o Tutor usa questões reais) |
| **Depende de você** | acervo de fontes oficiais (sem ele, Aula e Revisão não trazem números), revisão médica das estações, ligar o Tutor, escolha do plano que dá acesso |

## 9. Decisões para o dono

1. **Ligar o Tutor** (Administração → Configurações → Stazia Tutor) e com qual limite diário.
2. **Regra de base estrita.** Hoje o Tutor não diz dose, valor de corte ou diretriz sem fonte na base. É a mesma regra do resto do sistema ("nada inventado").
   Afrouxar isso é possível, mas faria a IA afirmar conduta sem conferência: não recomendo.
3. **Quem tem acesso**: todos, ou só planos pagos. O protótipo falava em voz no plano Elite; isso não foi decidido aqui.
4. **Palavrões**: o teto da plataforma (hoje: até moderados, e só para quem escolhe o Xingão e libera).
