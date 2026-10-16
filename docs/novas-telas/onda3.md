# Novas telas, onda 3: Banco de Questões, Simulados e tela de Questão

Data: 15/10/2026. Ramo `nt-onda3` (a partir de `novas-telas` 6da5dd72). Sem push, sem publicação, sem banco real.
Capturas lado a lado (modelo x app): `/Volumes/StaziaMed/.tmp-aulas/novas-telas/onda3/` (`modelo-*.png` e `app-*.png`).
Prévia navegável (dados simulados, sem login): `npx vite --config scripts/previa-questoes/vite.config.mjs`, porta **31977**
(as portas 31972 a 31976 já estavam em uso por outras frentes): `/montagem.html` (Banco), `/montagem.html?modo=simulado`,
`/montagem.html?tema=escuro`, `/index.html?modo=treino|simulado&q=inedita|oficial` (tela de Questão).

## 1. Telas do pacote -> arquivos do app

| Tela do pacote | Arquivo do app | Situação |
|---|---|---|
| BancoWeb / BancoTablet / BancoMobile | `src/novo/app/practice/QuestionBuilder.jsx` (modo `q`) + `practice.css` | refeita (visual), mesmos dados (`app_question_filters`, `app_count_questions`, `app_recent_sessions`) |
| SimuladosWeb / SimuladosTablet / SimuladosMobile | `QuestionBuilder.jsx` (modo `sim`) | refeita (visual), mesmas regras (Rápido/Por área/Geral/Personalizado, Clássico ou TRI, cronômetro; a prova "Questões Inéditas" voltou à lista do simulado em 16/10, só na correção Clássica: o TRI usa só oficiais) |
| Main (antes de responder, web) | `practice/PracticeSession.jsx` + `practice/tela/*` | já estava no modelo; ajustes finos (seção 3) |
| Respondida (depois, web) | `practice/tela/QuestionSheet.jsx`, `Correction.jsx` | já estava; sem mudança além da pergunta à esquerda |
| TabletQuestao / TabletRespondida | `practice/tela/*` + `tela-questao.css` | feitas: cabeçalho do tablet, A−/A+, "Ver caso completo", duas colunas depois de responder |
| Questão no celular | não há tela no pacote | mantido o CSS responsivo atual (só ganhou A−/A+ e "Ver caso completo", que valem até 1180 px) |

Arquivos novos: `src/novo/ds/area-icons/` (6 SVG do pacote + `AreaArtTile.jsx`), `scripts/previa-questoes/montagem.{html,jsx}`,
`src/__tests__/novasTelasOnda3.test.tsx`.

## 2. Banco de Questões e Simulados: o que mudou em relação ao que estava no ar

1. **Área**: de "cartões com ícone 3D genérico em degradê" para os cartões do pacote (azulejo pastel + arte própria, nome e contagem em fonte mono, 6 colunas no computador, 3 no tablet). Selecionado: borda azul de 2 px e fundo azul claro (tokens).
2. **Ordem do Banco**: Área, Tema ou assunto (com os atalhos de tema), Prova/edição + Status, Quantidade (antes: tema vinha primeiro e a área depois).
3. **Resumo**: de cartão branco "RESUMO" para o cartão azul em degradê ("SEU TREINO"/"SEU SIMULADO", total grande, tempo, "N disponíveis com esses filtros", botão branco "Começar treino"/"Iniciar simulado"). No tablet e no celular ele desce/vira barra fixa; no computador fica fixo à direita.
4. **Histórico**: de lista simples para linhas com anel de progresso (treino/simulado aberto), traço de progresso e etiqueta ("Continuar", "Pausado", "Tempo encerrado", ou acerto/total e %). Título "Continue um treino" quando há algum aberto; senão "Seus treinos"; no simulado "Seus simulados". Linha concluída: anel verde completo com check (o pacote só mostra os abertos).
5. **Simulado**: "Como corrigir?" em dois cartões com bolinha (Clássico, padrão; TRI, opcional), mesmo texto de antes. Ordem: tipo, correção, área, tema, prova/cronômetro, quantidade.
6. **Celular**: Banco com "Continue um treino" no topo e barra fixa "N questões · ~tempo / Começar"; Simulado com abas "Novo simulado | Meus simulados (n)", áreas em fileira que rola, Questões, Correção em dois botões, "Mais filtros" (tema, prova, cronômetro) recolhível e barra fixa "Iniciar".
7. Campos de 48 px com canto 14, rótulos 14 px em negrito, quantidade em fonte mono, chips do tema com o selecionado em azul claro.
8. **Mantido do app (não está no pacote)**: cartão "Questões Inéditas" no topo do Banco, aviso das Inéditas, bloqueio do plano, cota, tempo personalizado (horas e minutos), mensagens de TRI, aviso de erro. Texto do total ("20 questões") é um texto só (no pacote os números são em fonte mono); diferença mínima, mantida para não quebrar leitores de tela.

## 3. Tela de Questão: regras atuais prevalecem (decisão 5) e o que mudou

Conferido por captura (modelo x app) em computador e tablet. As regras abaixo **não** foram trocadas pelo pacote:
- sem "Travou? Peça uma dica ao Tutor" no simulado (só treino); sem "Pular" no simulado (só treino, com lista "Questões não feitas"); "Confirmar resposta" no simulado sem correção até o fim; correção só depois de responder (treino);
- fontes de Questão Inédita fora da tela; Fontes e "Discutir com o Tutor" só em questão oficial; rótulo "Questão Inédita · nº N" (o pacote escreve "Questão StaziaMed nº 13");
- dificuldade só com valor validado por pessoa (o pacote mostra "Média" fixa); sem tela de navegação por número (ver "Não feito").

Mudanças feitas:
1. Pergunta (caixa azul) alinhada à esquerda, como no pacote (antes justificada, com buracos entre palavras). O caso clínico continua justificado (igual ao pacote).
2. Botão de pausar/continuar com as formas cheias do pacote (antes contorno Lucide).
3. Cabeçalho do tablet (720 a 1180 px): símbolo da marca (36 px), contador "1 / 20" em pílula, só o tempo restante (sem "Nesta questão"), pausa redonda e X na ponta direita. Computador mantém logo grande + "Nesta questão".
4. Progresso do simulado no tablet: um traço por questão (antes, barra contínua até 1023 px; agora a barra contínua só no celular).
5. **A−/A+** (tamanho do texto: caso 16/18/21, pergunta 19/21/24, alternativas 15/17/19 px) para tablet e celular, escolha guardada só no aparelho; no computador não aparece (como no pacote).
6. **"Ver caso completo / Mostrar menos"**: depois de responder (tablet e celular) o caso fica em 3 linhas.
7. Depois de responder no tablet: cartão e painel lateral lado a lado (antes empilhados), painel de 320 px.
8. Rótulos do cronômetro de 11 para 12 px (decisão de contraste da onda 0).
9. Teste antigo atualizado de propósito: `novoPracticeFormat.test.ts` esperava "Questão StaziaMed · nº 12", mas o rótulo decidido é "Questão Inédita · nº 12".

## 4. Ícones

Legenda: igual = mesmo ícone Lucide ou mesmo SVG no pacote e no app; trocado = o app agora usa o do pacote; novo = não existia na tela.

| Onde | Pacote | App antes | App agora |
|---|---|---|---|
| Área Todas | SVG `ef639e82…` (4 blocos coloridos) | `library` em azulejo degradê | trocado: `ds/area-icons/todas.svg` |
| Área Clínica Médica | SVG `e807cdfe…` (estetoscópio) | `stethoscope` em azulejo | trocado: `clinica-medica.svg` |
| Área Cirurgia | SVG `8ba5e3cf…` (bisturi) | `activity` | trocado: `cirurgia.svg` |
| Área Pediatria | SVG `f10824d2…` (mamadeira) | `baby` | trocado: `pediatria.svg` |
| Área Gineco e Obstetrícia | SVG `71b3b57d…` (símbolo feminino com coração) | `heart-pulse` | trocado: `gineco-obstetricia.svg` |
| Área Preventiva / MFC | SVG `6f77b95f…` (escudo com cruz) | `shield-plus` | trocado: `preventiva-mfc.svg` |
| Busca do tema | `search` | `search` | igual |
| Setas dos seletores | `chevron-down` | chevron do seletor | igual |
| Botão do resumo | `arrow-right` | `arrow-right` | igual |
| Histórico: anel com play | círculo e `play` cheio | sem ícone | novo (anel SVG + play cheio) |
| Histórico: concluído | (não existe) | sem ícone | novo: `check` em anel verde |
| Histórico: pausado | (não existe) | `pause` | igual |
| Simulado: bolinha de rádio | círculo | sem bolinha | novo (CSS) |
| Celular: "Mais filtros" | chevron | (não existia) | novo: `chevron-down`/`chevron-up` |
| Questão: cronômetro (`timer`) | SVG circle+ponteiro+topo | igual | igual |
| Questão: pausar/continuar | `pause`/`play` cheios | `pause`/`play` contorno | trocado: SVG cheio (`QuestionHeader.jsx`) |
| Questão: logo no tablet | símbolo | logo completo | trocado: `simbolo-96w.png` (claro e escuro) |
| Questão: informação, lâmpada, riscar, marcar, pular, seta, bandeira, X, check, alerta | `info`, `lightbulb`, `strikethrough`, `bookmark`, `skip-forward`, `arrow-right`, `flag`, `x`, `circle-check`, `circle-alert` | os mesmos nomes | igual |
| Questão: fonte vinculada, livro, sparkles, flashcard (`layers`), relógio, arquivo | `file-text`, `book-open`, `sparkles`, `layers`, `clock` | `file-text`, `layers`, `clock` iguais; `book-open` e `sparkles` só aparecem em questão oficial e não foram conferidos por captura | igual (conferido por código) |
| Painel "Área e tema" | `shield` (Preventiva) | `shield-plus` (ícone da área) | **diferença mantida**: o app usa o ícone da área; o pacote só mostra o escudo simples da Preventiva e não mostra as outras áreas |

## 5. Diferenças deliberadas e o que não foi feito

- **Navegação por número** ("1 / 20" que abre "Ir para a questão", só no tablet do pacote): não feita. No simulado ela equivale a pular questões, o que a decisão 5 proíbe; o contador ficou como pílula sem seta. Se o dono quiser, é decisão nova.
- **Botão ">" (próxima) no rodapé do tablet**: não feito pelo mesmo motivo; ficou "Anterior" (simulado) e "Pular" (treino).
- **Explicação no painel lateral no tablet**: no pacote do tablet a "Explicação" vai para a coluna da direita; no app ela continua dentro do cartão (como no computador) para não duplicar conteúdo na tela.
- **Alternativa riscada depois de responder** (o pacote mostra a D riscada na tela respondida): o app não mostra risco depois da correção.
- Em Banco/Simulados, os 4 tipos de simulado no celular quebram em 2 linhas de 2 (como já era) porque "Personalizado" não cabe na linha.
- Arte 3D de medalhas, Arena e Início: fora desta onda.
- Capturas de modelo: o PNG do tablet do pacote tem um ícone quebrado na Pediatria (erro do arquivo do pacote, não do app).

## 6. Testes

- Novos: `src/__tests__/novasTelasOnda3.test.tsx` (4 testes: A−/A+, Ver caso completo, arte das áreas, pausar/continuar). Achou e corrigiu um erro do tamanho padrão do texto.
- Rodados e verdes: `simuladoCronometro` (texto do histórico ajustado de propósito: "4/30 · hoje… faltam 35:00"), `simuladoTriTela`, `questoesStaziaMedAluno`, `ineditasCartaoTela`, `planosRevisaoTelas`, `planosTesteVencidoTelas`, `segundaFaseEmBreve`, `telaQuestaoModelo`, `dificuldadeValidadaTela`, `correcoesQuestoesTela`, `leva3Q*Tela`, `atualizacoesQuestaoDeTreino`, `tutorDicaInterruptorTela`, `fontesVinculadasTela`, `novoPracticeFormat`.
- **Já falhavam antes (não são da onda)**: `ineditasPorPlanoTelas` (2 testes) esperavam "Questões Inéditas" no seletor de prova do simulado, que o commit 143005f2 tirou. Resolvido em 16/10/2026: o dono pediu que os simulados também tenham as inéditas, a prova voltou à lista do simulado (ramo `simulado-ineditas`, migração 012000) e os testes voltaram a valer.
- `vite build`: passa.
