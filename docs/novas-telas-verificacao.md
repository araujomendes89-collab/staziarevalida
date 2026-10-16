# Novas telas do app: verificação e plano (Fase 1, sem implementar)

Data: 15/10/2026. Ramo `novas-telas` (a partir do main atual, 143005f2). Sem push, sem publicação, sem migração, sem .env.
Pacote do dono: `/Volumes/StaziaMed/Tela para questoes/Telas/Novas telas/extraido/StaziaMed-telas/` (66 telas em HTML + `assets/` de 744 KB). Lido só como texto e aberto apenas no navegador de prévia (servidor estático na porta 31950, encerrado ao final). Os 21 zips/PDFs antigos não foram necessários.
Capturas: `/Volumes/StaziaMed/.tmp-aulas/novas-telas/capturas/` (12 imagens JPEG, 2 MB no total): `index`, `home-web`, `home-mobile`, `tablet-home`, `questao-antes`, `questao-depois`, `trilha-web`, `conquistas-web`, `ranking-web`, `temas-web`, `medalhas`, `login-web`.

## Resumo em uma página

- O pacote é, em essência, **um redesenho de telas que já existem e já estão ligadas ao banco**. Quase todo texto e número do pacote é idêntico ao que o app mostra hoje para a conta do dono (conferi tela por tela com `src/novo/app`). Não há tela do pacote sem equivalente no app, exceto a busca global do "Mais".
- Classificação dos 66 arquivos: **A = 49, B = 4, C = 4, D = 9**.
- Tokens: o azul principal `#0A6FD8`, Plus Jakarta Sans, JetBrains Mono e Barlow Condensed (só no login) **já são os do app**. As diferenças reais são poucas (seção 1.3) e as grandes são de estrutura: menu sanfona fixo no lugar do menu recolhível com Dock flutuante, barra de abas no celular e no tablet, e **o pacote não tem tema escuro**.
- Riscos principais: (a) contraste e tamanho de letra do pacote abaixo do mínimo em vários textos; (b) o pacote traz, nas telas de Questão, itens que já decidimos não ter (dica do Tutor, Pular, correção e Fontes no simulado/inédita); (c) a arte 3D das medalhas é a única peça realmente nova e precisa passar pelo diretor de arte; (d) cada tela existe em 3 arquivos com tamanho fixo, sem CSS responsivo: não dá para copiar o HTML, é preciso reconstruir com os tokens e os componentes do app.
- Ordem recomendada: ondas 0 a 7 (seção 4). Primeiro tokens e casca (menu), depois Início e Plano, Praticar, a casca das áreas de conteúdo, Evolução e Conta, Arena, e por último as medalhas 3D.

## 1. Tokens, cores e tipografia

### 1.1 O que bate com o app
- Azul de ação `#0A6FD8` = `--teal-700` (nome mantido por compatibilidade), foco `#009DFE` (anel `rgba(0,157,254,.35)` igual a `--focus-ring`), fundo de seleção `#EBF5FF` = `--teal-50`, borda `#B3DCFF` = `--teal-200`.
- Cinzas de texto do pacote (`#94A0AF`, `#687586`, `#4F5A69`, `#3A4350`) = `--gray-400/500/600/700`.
- Famílias: Plus Jakarta Sans (400 a 800) e JetBrains Mono (500, 600) nas telas; Barlow Condensed só no Login. É o mesmo do app (o app já embute Barlow em `src/novo/app/auth/fonts`).
- Verde `#16803C`, vermelho `#C62828`, âmbar `#E59A0B`, violeta `#6236D6`/`#6A47E0` (Tutor, Preventiva): iguais aos tokens.
- Raios (999 pílulas, 12, 14, 16, 20, 22, 24) e sombra `0 1px 2px rgba(13,28,66,.06)` = `--shadow-xs`.

### 1.2 Medição no pacote (103 cores hex distintas; 46 estão nos tokens, 57 não)
| Item | Pacote | App hoje | Efeito |
|---|---|---|---|
| Azul-marinho de títulos e texto principal | `#052A5A` (1.188 usos) | `--navy-900` `#0D1C42` (`--text-primary`) | Troca de tom em todas as telas. A tela de questão que está no ar já usa `#052A5A` nos títulos. Decisão 1 |
| Fundo da página | `#F7F8FA` (e `#F5F7FA`) | `--bg-app` `#F4F6F9` | Diferença leve |
| Bordas | `#E3E8EF`, `#EEF1F5`, `#E6EAF0` | `#DCE1E8`, `#ECEFF3` | Bordas um pouco mais claras no pacote |
| Pastéis das áreas (fundo e texto por área) | 8 a 10 pares novos (`#FFF2E8/#B34A0C` Cirurgia, `#EDF2FD/#1C43A8` Clínica, `#FCEEF5/#B8336F` GO, `#EFFAF5/#0B6B4A` Pediatria, `#F3EFFE/#4F28B0` Preventiva) | só a cor sólida por área (`--area-*`) | Criar tokens de fundo/texto por área |
| Laranja da sequência | `#F26B1D` | `--streak` laranja 500 | Quase igual; unificar |
| Degradês azuis (cartão "Continue de onde parou", botão Entrar, ícone do perfil) | `#0752AB`→`#031A3A`, `#009DFE`→`#052A5A` | `--brand-gradient` `#2B9BFF`→`#0A4FA8` | Criar 1 ou 2 tokens de degradê |
| Tema escuro | **não existe em nenhum dos 66 arquivos** (nenhum `prefers-color-scheme`, nenhum `data-theme`) | existe e é opção na Conta (Claro/Escuro/Do sistema) | Escuro é derivado dos tokens, sem arte nova (risco, seção 5) |
| Responsividade | nenhum `@media`; cada tela em 3 arquivos de largura fixa (web 1440, tablet 834, mobile 390) | CSS e `useMobile` (corte em 860 px) | Reconstruir como uma tela responsiva por rota |
| Tamanhos de letra | 10 a 64 px; 294 usos de 11 px e 19 de 10 px | corpo 14 a 16 | Subir o mínimo (seção 5) |

### 1.3 Diferenças a registrar
Tokens a criar ou ajustar (onda 0): `--text-primary` (decisão 1), `--bg-app`/bordas (ajuste fino, opcional), pastéis por área (fundo/texto, claro e escuro), degradês de marca, tom de sequência, selo "IA" violeta (já existe `--ai`). Nada disso muda cor principal nem fonte.

## 2. Inventário e classificação por tela (66 arquivos)

Legenda: **A** só trocar o visual (dados e funções existem) · **B** precisa função/dado novo · **C** recurso inexistente ou arte nova · **D** conteúdo fixo do modelo de hoje, muda só a casca. "Arena" = depende do interruptor `boot.play.enabled` (se desligado, o app já mostra aviso).

### 2.1 Casca e navegação (7 arquivos)
| Arquivo(s) | O que é | Equivalente no app | Classe |
|---|---|---|---|
| `Sidebar.html` | Menu lateral em sanfona (6 grupos + Tutor com IA, Preferências, Sair), card do usuário no topo | `src/novo/app/Shell.jsx` (`Rail`, `GROUPS`) | A |
| `MobileMenu.html`, `MobileMais.html` | Início no celular e o "Mais aberto"; barra de abas Início, Questões, Revisar (selo), Tutor, Mais | `Shell.jsx` (`MobileNav`, `MoreSheet`) | A |
| `HomeMais.html`, `HomePrefs.html` (mobile), `TabletMais.html`, `TabletPrefs.html` | "Mais" e "Preferências": lista completa por grupo, card do usuário com "Stazia Score 383 · Explorador", seletor de fase, **campo "Buscar no app"** | `MoreSheet` (não tem busca) | **B** (só pela busca global, que não existe; sem ela vira A. Obs.: a diferença entre "Mais" e "Preferências" é só o título do arquivo e o estado aberto) |

### 2.2 Questão do simulado (4 arquivos)
| Arquivo | Equivalente | Classe |
|---|---|---|
| `Main.html` (antes de responder, web), `TabletQuestao.html` | `practice/PracticeSession.jsx` + `practice/tela/*` (já no ar, `docs/tela-questao-modelo.md`) | A |
| `Respondida.html` (depois, web), `TabletRespondida.html` | `practice/tela/QuestionReview.jsx`, `Correction.jsx` | A |

Atenção: o pacote é do mesmo modelo que já implementamos, mas **mostra no simulado coisas que decidimos não ter** (seção 5.3). Fica só o que já está no ar; conferir apenas diferenças visuais (cabeçalho, anel do cronômetro, "Nesta questão", A−/A+ do tablet, "Ver caso completo"). **Não há tela de questão para celular no pacote**: o app mantém o CSS responsivo atual.

### 2.3 Visão Geral e Plano (9 arquivos)
| Arquivo(s) | Equivalente | Classe |
|---|---|---|
| `Home.html`, `TabletHome.html`, `HomeMobileCompact.html` | `home/HomeScreen.jsx` (rota `home`; usa `app_home`, `app_today`, trilha, missões, temas prioritários, score) | A |
| `PlanoWeb/Tablet/Mobile.html` e os 3 `…Aberto.html` (Personalizar) | `home/TodayPlan.jsx` (rota `hoje`, "Tempo de estudo por dia", "Foco de hoje", cartão de inéditas) | A |

O bloco "Para você · deslize" do celular só reordena cartões que já existem (trilha, missões, Arena).

### 2.4 Praticar (6 arquivos)
| Arquivo(s) | Equivalente | Classe |
|---|---|---|
| `BancoWeb/Tablet/Mobile` | `practice/QuestionBuilder.jsx` (modo `q`; `app_question_filters`, `app_count_questions`, `app_recent_sessions`) | A |
| `SimuladosWeb/Tablet/Mobile` | `QuestionBuilder.jsx` (modo `sim`; Rápido/Por área/Geral/Personalizado, "Como corrigir?" clássico ou TRI, cronômetro) | A |

### 2.5 Aprender, só casca (9 arquivos, todos D)
| Arquivo(s) | Equivalente | Classe |
|---|---|---|
| `TemasWeb/Tablet/Mobile` | `study/ThemesScreen.jsx` (rota `temas`) | D |
| `DiretrizesWeb/Tablet/Mobile` | `study/UpdatesScreen.jsx` (rota `atualizacoes`; Lista/Tabela comparativa, "Lida" salva no aparelho) | D |
| `MapasWeb/Tablet/Mobile` | `mapas/MapasScreen.jsx` (rota `mapas`; Revisão rápida/Aprofundado) | D |

Os três usam só **cartões-modelo vazios** (`[Nome do tema]`, `[n] questões`, `[Título do tema]`, faixa amarela "Modelo de cartão — o sistema preenche…"). Portanto o pacote entrega só barra de filtros, abas de área, cabeçalho e moldura. **Os cartões reais continuam os de hoje** (Temas com imagem realista da área, Mapas com pôster, Atualizações 2025/2026). A tela de Flashcards (`review/FlashcardsScreen.jsx`) **não tem tela no pacote**: continua como está, só com a casca nova.

### 2.6 Evolução, Conta e Login (18 arquivos)
| Arquivo(s) | Equivalente | Classe |
|---|---|---|
| `DesempenhoWeb/Tablet/Mobile` | `review/PerformanceScreen.jsx` (7d/30d/90d, "Me teste nos pontos fracos") | A |
| `AnaliseWeb/Tablet/Mobile` | `tutor/ReportScreen.jsx` (rota `analise`: domínio por área, evolução, revisões, "Com o Tutor") | A |
| `PlanejamentoWeb/Tablet/Mobile` | `home/PlanningScreen.jsx` (rota `plano`: calendário, ritmo, semana; `app_planning`) | A |
| `ContaWeb/Tablet/Mobile` | `account/AccountScreen.jsx` (rota `perfil`: Minha conta, Arena, Estudo e prova, Segurança, Privacidade/LGPD, Ajuda) | A |
| `MeuPlanoWeb/Tablet/Mobile` | `plan/PlansScreen.jsx` (rota `planos`; texto igual: "ainda não há cobrança nem preço aqui") | A |
| `LoginWeb/Tablet/Mobile` | `auth/LoginScreen.jsx` (mesmas etapas Identidade/Segurança/Acesso e mesma frase "Foco no que cai…") | A (praticamente pronto; só conferir diferenças visuais) |

### 2.7 Stazia Arena (9 arquivos A + 4 arquivos C)
| Arquivo(s) | Equivalente | Classe |
|---|---|---|
| `TrilhaWeb/Tablet/Mobile` | `play/TrailScreen.jsx` (rota `trilha`) | A (Arena) |
| `MissoesWeb/Tablet/Mobile` | `play/MissionsScreen.jsx` (rota `missoes`) | A (Arena) |
| `RankingWeb/Tablet/Mobile` | `play/LeaderboardScreen.jsx` (rota `classificacao`; Geral/Semana/Mês, métricas, Liga da semana). O pacote mostra o estado vazio e o desenho das 7 ligas | A (Arena); a faixa das 7 ligas usa a arte nova (C) |
| `ConquistasWeb/Tablet/Mobile` | `play/AchievementsScreen.jsx` (rota `conquistas`; 41 medalhas por categoria e raridade, aba Recompensas) | **C** (a tela inteira gira em torno da arte 3D das medalhas) |
| `Medalhas.html` | Folha de arte: 41 medalhas e 7 ligas em padrão 3D. Hoje o app usa ícone Lucide por medalha (`AchievementCard`) | **C** |

Observação sobre a orientação do pedido, que listou Planejamento, Missões e Ranking como possíveis C: no código eles **existem e estão ligados ao banco** (Planejamento é rota normal; Missões, Trilha e Ranking dependem só do interruptor Arena). Não consegui conferir em produção se a Arena está ligada (sem acesso ao banco real). Por isso os classifiquei A, com a Arena na penúltima onda. Se o dono preferir tratá-las como "depois", basta reclassificar: Planejamento 3 + Trilha 3 + Missões 3 + Ranking 3 viram C e o placar passa a **A = 37, B = 4, C = 16, D = 9** (Trilha incluída na conta).

### 2.8 Placar
| Classe | Arquivos | Quais |
|---|---|---|
| A | 49 | Sidebar, MobileMenu, MobileMais; Questão (4); Início (3); Plano (6); Banco (3); Simulados (3); Desempenho (3); Análise (3); Planejamento (3); Conta (3); Meu plano (3); Login (3); Trilha (3); Missões (3); Ranking (3) |
| B | 4 | HomeMais, HomePrefs, TabletMais, TabletPrefs (só pela busca "Buscar no app") |
| C | 4 | ConquistasWeb/Tablet/Mobile, Medalhas |
| D | 9 | Temas (3), Diretrizes e Atualizações (3), Mapas Mentais (3) |

Funções ou dados novos necessários (todas as telas somadas):
1. **Busca global "Buscar no app"** (B): não existe. Não há tabela nem função. Para entregar sem banco: filtro local dos itens do menu (nome da tela); busca em conteúdo exigiria índice novo (não recomendo agora).
2. **A−/A+ (tamanho do texto do caso) no tablet**: só no navegador (guardar preferência local), sem banco.
3. **Mapeamento medalha → arte** (C): 41 medalhas + 7 ligas, do `slug` do banco para o arquivo de arte. Fica no front-end. Medalhas secretas: sempre silhueta genérica, nunca a arte real antes de liberar.
4. **Tokens novos** (onda 0): só CSS.
Nenhuma função de banco ou rota de servidor é necessária. Nenhuma migração.

## 3. Dados "de exemplo" e o que fazer

Achado central: os números e nomes do pacote não são inventados em sentido estrito; são uma **fotografia da conta do dono** (e do banco de desenvolvimento). Copiados como texto fixo, seriam falsos para qualquer aluno. Regra: **nenhum valor literal do pacote entra no código; tudo vem das mesmas funções que o app já chama; sem dado, usar o estado vazio que já existe.**

| Onde | Dado de exemplo no pacote | O que fazer |
|---|---|---|
| Menu, card do usuário, Conta | "João Paulo Mendes", iniciais "JP", e-mail do dono, "Equipe · acesso completo", "Você é administrador" | Nome, iniciais, e-mail e papel do `boot.profile`. "Abrir administração" só para equipe |
| Início | "0 dias", "2/20", "Faltam 19 · cerca de 38 min", "383 Stazia Score", "Explorador", "55% acurácia", "9 itens na semana", "3 dias ativos", "5 para revisar", "Coloproctologia · etapa 1 de 60", "Cirurgia geral e trauma · 0% domínio", lista de 4 temas prioritários (Geriatria 9, Infectologia 2…) | Dados reais de `app_home`, `app_today`, play. Sem dado: estado vazio atual ("Seu desempenho aparece aqui") |
| Plano | "20 questões de Pediatria", "50 min", "Todas as 74 liberadas" (inéditas) | Plano real do aluno; contagem de inéditas pelo cartão atual (respeita plano e limites) |
| Trilha | Pediatria 12 etapas, "129 no banco", "70% das etapas concluídas" | Dados reais da trilha; "no banco" é contagem real. Texto de regra só se bater com a regra do código |
| Banco e Simulados | Contagens 1205/377/169/213/238/208 e 1216/378/172/213/243/210; histórico "1/20 · hoje, 17:19", "4/50 · 13 de out." | Contagens de `app_count_questions` e histórico de `app_recent_sessions` |
| Questão | Caso do diazepam, "nº 13", fontes "Lista Nacional…/Ministério da Saúde", "Dificuldade Média" com 2 barras | É uma questão de exemplo: nunca copiar. Conteúdo vem da sessão. Fontes de inédita **não** aparecem (decisão do dono, 15/10). Dificuldade só com valor validado por humano, e o rótulo precisa bater com as barras |
| Missões | "Acerte 15 questões +15 XP", "+50 XP · +25 moedas", semanais (150 questões…) | Missões e prêmios do banco (`app_gamification_*`); nunca fixos |
| Planejamento | "134 semanas", calendário de outubro, "4 dias de estudo neste mês" | `app_planning` |
| Análise e Desempenho | "Sessões 15", "13 min", "9 por voz", "55% em 11", gráfico 7 a 15 de out., domínio por área | Dados reais; áreas sem resposta como "sem respostas" (já é o texto atual) |
| Conquistas | Lista dos 41 nomes, XP e moedas | São as medalhas reais do banco (`stazia_play`); manter a leitura do banco. Secretas: "Conquista secreta" sem arte |
| Ranking | "0 alunos", "Ninguém neste ranking ainda", nomes das 7 ligas | Real e sem pessoas inventadas (o pacote não mostra nenhum nome de outro aluno, pontuação de terceiros ou posição). Ligas vêm do banco |
| Meu plano | "Pro: Voz do Tutor até 60 minutos por dia", "Elite: …" | Só o que o catálogo de planos do banco diz. **Sem preço, sem "assinar"** (Stripe parada) |
| Mapas, Temas, Diretrizes | `[Título do tema]`, `[n] questões`, `[Área]`, "[n] de [total] lidas" | São marcadores, não dados. Substituir pelos dados reais atuais; nada de texto de marcador no ar |
| Login | e-mail `voce@exemplo.com`, `suporte@staziamed.com.br` | Placeholder de campo é normal; e-mail de suporte já é o do app |

Não encontrei no pacote nome de outro aluno, ranking de terceiros, pontuação de colega ou medalha "ganha". Todas as medalhas aparecem bloqueadas ("0 de 41").

## 4. Peças compartilhadas e ordem de troca

### 4.1 Peças a construir primeiro
1. **Tokens (onda 0)**: ajustes da seção 1.3, claro e escuro, com captura de conferência.
2. **Menu lateral (web)**: sanfona fixa com 6 grupos (Minha jornada, Aprender, Praticar, Revisar, Stazia Arena, Minha evolução) + Tutor com IA, selos (`0/2`, `5`, `0/3`, `IA`), card do usuário; grupo da rota atual aberto; teclado e `aria-expanded`. Substitui o menu recolhível e o Dock flutuante de `Shell.jsx`. Em largura média, o pacote usa barra de abas no topo (tablet).
3. **Barra de baixo do celular**: Início, Questões, Revisar (selo de pendentes), Tutor, Mais; "Mais" abre a lista completa por grupo (hoje é `MoreSheet`; reaproveitar).
4. **Cabeçalho**: saudação + sequência + seletor de fase ("2ª Fase" continua "Em breve" para aluno) + data. Já existe em `Header`.
5. **Componentes de cartão**: cartão-herói azul (Continue de onde parou), faixa de indicadores, linha de tarefa com botão "Começar", cartão de trilha, selos por área (pastéis). Reaproveitar `src/novo/ds` (Card, Badge, Chip, SegmentedControl).
6. **3D das medalhas (última)**: 41 medalhas + 7 ligas em SVG estático (assets do pacote somam 744 KB; cada medalha ~6 KB). Componente `Medalha` (arte por slug, aro por raridade, fita por categoria, versão bloqueada desbotada, secreta genérica).

Não serão copiados: scripts do pacote, o carregamento de fonte pelo Google Fonts (usar as fontes locais do app), o botão "← Todas as telas" e alturas fixas (a barra lateral do pacote tem `height: 868px`).

### 4.2 Ondas (tamanho: P até 1 dia, M 2 a 4 dias, G mais de 4 dias; um agente, com revisão por captura)
| Onda | Conteúdo | Arquivos do pacote | Tam. | Risco |
|---|---|---|---|---|
| 0 | Tokens, contraste e tamanhos mínimos, tema escuro derivado, conferência por captura | — | P | Baixo |
| 1 | Casca: menu sanfona, barra de abas (celular e tablet), cabeçalho; remover Dock; rotas e selos atuais | Sidebar, MobileMenu/Mais, Home Mais/Prefs, Tablet Mais/Prefs (B resolvido sem busca) | G | Alto (toca todas as telas) |
| 2 | Início e Plano de Hoje (+Personalizar) | Home×3, Plano×6 | M | Médio |
| 3 | Praticar: Banco, Simulados; só diferenças visuais da Questão | Banco×3, Simulados×3, Questão×4 | M | Médio (a questão já está no ar) |
| 4 | Aprender, só casca: Temas, Diretrizes, Mapas, e Flashcards sem tela nova | Temas×3, Diretrizes×3, Mapas×3 | M | Médio (conteúdo não pode mudar; testes de conteúdo e captura antes/depois) |
| 5 | Evolução e Conta: Desempenho, Análise, Planejamento, Conta, Meu plano, Login | 18 arquivos | M | Baixo a médio |
| 6 | Arena: Trilha, Missões, Ranking (sem a arte nova) | 9 arquivos | M | Médio (interruptor Arena) |
| 7 | Medalhas e ligas 3D + Conquistas | Medalhas, Conquistas×3 | G | Alto (arte nova, aprovação do diretor de arte) |

Valor/risco: as ondas 0 e 1 dão a cara nova a todo o app e destravam o resto; 2 e 3 cobrem as telas mais usadas pelo aluno; 4 e 5 são mais seguras; 6 e 7 ficam por último por dependerem da Arena e da arte.

## 5. Riscos

### 5.1 Acessibilidade (medido)
- Texto `#94A0AF` sobre branco tem **contraste 2,66:1** (243 usos no pacote, em textos de 11 a 13 px); sobre `#F7F8FA`, 2,50:1. Reprova AA (mínimo 4,5:1). Usar `--gray-500` (4,69:1) como mínimo para texto; `--gray-400` só em ícone decorativo.
- `#687586` sobre `#F7F8FA` = 4,41:1 (borderline); `#009DFE` com texto branco = 2,89:1 (reprova); `#F26B1D` sobre branco = 3,05:1; `#0A6FD8` com branco = 4,91:1 (ok); `#052A5A` sobre branco = 14,1:1 (ok).
- Letras muito pequenas: 294 usos de 11 px e 19 de 10 px (selos, rótulos, legendas). Mínimo recomendado 12 px, e 14 px para texto corrido.
- Alvos de toque: chips e botões de 32 a 34 px; o mínimo é 44 px no celular (a barra do app já usa 52).
- Foco visível: o pacote tem anel de foco; manter o `--focus-ring` do app. Movimento reduzido: o pacote não anima nada além de transições curtas; a skill de motion exige `prefers-reduced-motion` em qualquer animação nova (medalhas, celebração).

### 5.2 Tema claro e escuro
O pacote tem **só o claro**. O app tem escuro e a Conta oferece "Claro / Escuro / Do sistema" (a Conta do pacote também mostra essas opções). Plano: derivar o escuro dos tokens e conferir por captura; as áreas e degradês novos precisam de par escuro (onda 0). A arte das medalhas é feita para fundo claro: precisa de teste sobre fundo escuro.

### 5.3 Regras do projeto
- **Aluno nunca vê referências, códigos nem gabarito antes de responder**: as telas "antes de responder" do pacote não mostram nenhum dos três. Mantém. Cuidado ao copiar a tela "depois": só aparece depois da resposta e só no treino.
- **Itens do pacote que conflitam com decisões já tomadas (15/10)**: (1) "Travou? Peça uma dica ao Tutor" aparece no cabeçalho de **Simulado** (a dica é só em treino); (2) botão "Pular" no simulado (não existe no simulado, só no treino); (3) correção, gabarito e explicação logo após marcar no simulado (o simulado não corrige durante a prova); (4) "FONTES" numa questão inédita StaziaMed (fontes das inéditas ficam fora da tela e do servidor); (5) "Dificuldade: Média" com 2 barras (só valor validado por humano). Em todos, **o app mantém a regra atual; do pacote vem só o visual**.
- **Ferramentas de IA só na Administração**: o pacote não tem nenhuma tela administrativa. Os itens de IA voltados ao aluno ("Tutor com IA", "Análise feita pelo Tutor", "Me teste", "Discutir com o Tutor") já existem no app como recurso do aluno; nada de ferramenta de produção aparece. O pacote também **não tem entrada para Administração nem "Revisão médica"** no menu: o app precisa manter essas entradas para equipe e revisores.
- **Fase 2 · Prática**: o seletor do pacote deixa clicar em "2ª Fase · Prática". No app ela está "Em breve" para aluno; manter travado. Estações, Treino em Dupla, Match, Paciente simulado: sem tela no pacote, ficam fora.
- **Aulas**: o pacote não tem "Aulas" no menu; o app já mantém Aulas fechadas ao aluno (`features.js`). Coerente.
- **Preço e assinatura**: Meu Plano do pacote respeita "sem cobrança nem preço". Manter.
- **Conteúdo fixo (D)**: nas áreas Temas, Diretrizes, Mapas e Flashcards só a casca muda; os cartões e dados atuais não. Pôsteres, imagens por tema e conteúdo das atualizações não podem ser trocados pelos cartões-modelo do pacote.

### 5.3 bis. Conflitos com o que já está no ar
- Tela de questão azul (`practice/tela`): sem conflito de cor; cuidado para a casca nova (menu e cabeçalho) não remover o modo "tela cheia" da sessão (`FULL=['sessao','estacao']`).
- Menu: troca do menu recolhível + Dock flutuante por sanfona fixa muda hábito do aluno; o Dock hoje dá atalho a Banco/Flashcards/Simulado/"Perguntar ao tutor" (o pacote não tem). Decisão 6.
- Login: o pacote é igual ao que está no ar; mexer pode apenas introduzir risco.
- Cores por tema das Aulas (`temaCores.js`) e orbes do Tutor ficam de fora, como já decidido.

### 5.4 Desempenho
Pacote inteiro com 2 MB de HTML e 744 KB de imagens; as 48 artes de medalha são SVG estáticos pequenos, sem animação: bom para celular. Riscos reais: (a) renderizar 41 medalhas de uma vez (usar `loading="lazy"` e `decoding="async"` nas imagens, ou sprite); (b) gráficos do Desempenho/Análise em SVG inline: já existem no app; (c) fontes: não carregar do Google (privacidade e CSP); (d) não portar o motor de template do pacote (reescrita completa de DOM a cada clique).

### 5.5 Outros
- O pacote usa alturas e larguras fixas por dispositivo (264 px de menu, 868 px de altura, cartões de 1440/834/390). Em telas intermediárias (1024, 1180, 1280) o resultado do app precisa ser desenhado por nós; o app corta em 860 e 1180/1200 px.
- A captura `home-mobile.jpg` mostra barra de rolagem horizontal na versão celular do pacote (carrossel "Para você"): evitar estouro lateral no app.
- Mapas Mentais, Temas e Diretrizes mostram 7 áreas (Clínica, Cirurgia, GO, Pediatria, MFC, Saúde Coletiva, Saúde Mental); o app de Mapas já usa as mesmas 7. A Taxonomia médica está em revisão (memória do projeto): filtros de área devem vir dos dados, não de lista fixa.

## 6. Perguntas ao dono (8, com recomendação)

1. **Cor dos títulos e do texto principal.** O pacote usa azul-marinho `#052A5A`; o app usa `#0D1C42` (a tela de questão no ar já usa `#052A5A`). Trocar em todo o app? **Recomendo: sim**, é mais legível (contraste 14,1:1) e unifica com a tela de questão.
2. **Tema escuro.** O pacote só tem claro, mas a Conta oferece Escuro. **Recomendo: manter o escuro derivado dos tokens (sem desenhar telas novas), conferido por captura**; se preferir, esconder a opção por enquanto.
3. **Menu novo.** Aprova trocar o menu recolhível e o Dock flutuante pela sanfona fixa (web), barra de abas no tablet e barra de baixo no celular (Início, Questões, Revisar, Tutor, Mais)? **Recomendo: sim**, mantendo o botão "Perguntar ao tutor" em lugar visível e as entradas de Administração e Revisão médica para quem tem acesso.
4. **Busca "Buscar no app".** Não existe. **Recomendo: tirar na primeira entrega** e, depois, fazer só uma busca simples pelos nomes das telas (sem banco).
5. **Telas de questão do pacote.** Mostram dica do Tutor, Pular, correção e Fontes no simulado e na inédita, contra o que já decidimos. **Recomendo: manter as regras atuais e usar só o visual** (confirme).
6. **Arena (Trilha, Missões, Ranking, Conquistas).** O código existe e está ligado a dados, mas a Arena depende de um interruptor. **Recomendo: trocar o visual por último, sem mexer na lógica**, e só se a Arena estiver ligada em produção; se estiver desligada, adiar as 4 telas.
7. **Medalhas e ligas em 3D.** São 41 medalhas + 7 ligas já prontas como imagens. De quem é a arte e há direito de uso? **Recomendo: aprovar como arte oficial depois de uma rodada do diretor de arte** (consistência com a nova logo e contraste no escuro), com medalhas bloqueadas desbotadas e secretas sempre em silhueta.
8. **Dificuldade da questão e telas que faltam no pacote.** O pacote mostra "Dificuldade Média" e não traz Flashcards, Caderno de Erros, Aulas, Tutor, Questão no celular. **Recomendo: mostrar dificuldade só com valor validado por pessoa (hoje nenhuma) e manter essas telas como estão, só com a casca nova.**

## 7. Como conferir (reprodução)
- Servidor estático: `python3 -I -m http.server 31950 --bind 127.0.0.1` dentro da pasta do pacote (encerrar depois).
- O texto de cada tela foi lido renderizado no navegador (`document.body.innerText`), sem executar nada fora dele.
- Contagens de cor, fonte e raio: leitura de texto dos 66 HTML; contraste calculado pela fórmula WCAG.
- Nenhum arquivo do pacote foi alterado ou copiado para o projeto.
