# Cronômetro do simulado

Data: 2026-10-06. Pedido: "o aluno escolhe quanto tempo realizar o simulado; o cronômetro tem a opção de pausar, continuar, encerrar (com confirmação)".

## O que o aluno vê

- **Montar simulado** (`/novo/simulados`, campo Cronômetro): Tempo de prova (3 min por questão), Acelerado, **Tempo personalizado** e Sem cronômetro. No personalizado, o aluno escolhe um atalho (30 min, 1h, 1h30, 2h, 3h, 5h) ou digita horas e minutos; vale de 1 minuto a 12 horas. Na primeira vez, o campo começa no tempo de prova da quantidade escolhida. Abaixo aparece o ritmo ("3 min por questão"); fora do intervalo, o aviso aparece e "Iniciar simulado" fica desligado.
- **Durante o simulado**, no cabeçalho, ao lado do relógio: **Pausar** / **Continuar** e **Encerrar** (no celular, só os ícones, com nome para leitores de tela). Simulado sem cronômetro também pausa e encerra.
- **Pausado**: a questão e a barra de ferramentas somem; aparece o cartão "Simulado pausado" com o tempo parado e três saídas: Continuar simulado, Encerrar simulado e Sair e continuar depois. O teclado (A–D, Enter) não responde.
- **Encerrar** sempre pede confirmação ("Encerrar o simulado?"), com quantas foram respondidas, quantas em branco contam como erro, o tempo que ainda resta e atalhos para as questões em branco (que, se o simulado estiver pausado, voltam a correr o tempo). "Voltar" retorna para onde o aluno estava (questão ou pausa).
- **Seus simulados** mostra "Pausado" e quanto falta; o Início ("Continuar") diz que o simulado está pausado. No resultado, o tempo "do início ao fim" desconta as pausas.

## Regras (banco, migração `20261003004300_simulado_cronometro.sql`)

- `practice_sessions.paused_at` (pausa em curso) e `paused_ms` (pausas já encerradas). Pausa só em simulado não finalizado (restrição `practice_sessions_pause_check`).
- Prazo = início + tempo escolhido + pausas (`practice_deadline`). Pausado, o prazo anda junto com o relógio: o tempo não corre e o simulado não expira.
- `app_pause_session` e `app_resume_session`: só o dono (RLS), só simulado, nunca depois de finalizar; pausar com o tempo já esgotado é recusado (a tela finaliza). Repetir pausar/continuar não muda nada.
- `app_answer_question` recusa resposta com o simulado pausado e usa o prazo com as pausas (mantém os 15 s de tolerância).
- `app_finish_session` encerra a pausa ao finalizar; `practice_result` devolve `elapsed_seconds` sem as pausas e `paused_seconds`.
- `app_get_session`, `app_recent_sessions` e `app_home` devolvem a situação do cronômetro (`paused_at`, `deadline_at`, `remaining_seconds`, `paused`), calculada pelo relógio do servidor.
- O tempo ativo de cada questão (`active_ms`) não conta a pausa.

## Testes

`supabasePracticeApi.test.ts` (banco: prazo com pausas, resposta recusada pausado, expiração, encerrar pausado, quem pode pausar) e `simuladoCronometro.test.tsx` (telas: tempo personalizado, pausar/continuar/encerrar, pausado ao abrir, celular).

## Observações

- O intervalo de 1 minuto a 12 horas já era a regra do banco (`app_start_session`).
- Não há limite de pausas nem de tempo pausado: o simulado é do próprio aluno.
- Como o aluno pode alterar as próprias sessões (regra antiga do RLS de `practice_sessions`), o cronômetro serve para o próprio estudo e não como prova vigiada; o XP do Stazia Play por simulado não depende do tempo.
