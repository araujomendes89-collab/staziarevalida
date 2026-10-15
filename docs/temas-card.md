# Cartão dos Temas Essenciais e ilustrações em vidro

Etapa 1, 15/10/2026. Tela: Temas Essenciais (Grandes Temas), `src/novo/app/study/ThemesScreen.jsx`.
Cartão: `src/novo/app/study/TemaCartao.jsx`. Estilo: `src/novo/app/study/temas.css`.
Fotos: `public/temas/foto/GR-xxx.webp` + manifesto `src/novo/app/study/fotos-temas.json` (item 5).
Atualização de 15/10/2026 à tarde: o dono preferiu as **fotos realistas** (geradas pelo Nano Banana) às ilustrações em vidro
desenhadas em código. As ilustrações ficaram guardadas, sem uso, em `src/novo/_dormente/ilustracoes-vidro/` (não entram no
site). Os itens 5 a 8 abaixo descrevem esse estilo só como registro.

## 1. O cartão (padrão da referência e dos 5 exemplos do dono)

- Cartão branco e arejado, cantos de 28 px (24 px no celular), sombra suave em duas camadas e uma faixa fina na cor do tema no topo.
- Canto superior esquerdo: o selo da situação.
  - "Aula disponível" (verde, com check): só quando o tema tem aula publicada (`app_temas_com_aula`).
  - Sem aula: "Roteiro em validação" (cinza, relógio) ou "Aula pronta, aguardando revisão médica" (azul, relógio), como antes.
  - O aluno nunca vê o código do tema (GR-xxx).
- Canto superior direito: a pílula "17 questões · 10 provas" com seta. Ela abre o mesmo treino de "Treinar este tema"
  (`app_start_session` com o filtro `grande_tema`). Tema sem questão: pílula "0 questões", sem seta e sem clique.
- Título grande em negrito e, abaixo, "Tema N · subárea" em cinza.
- Foto do tema à direita, que some em degradê para o branco por CSS (máscara para a esquerda e para baixo; no claro a foto
  ainda se funde ao branco do cartão). Nenhum texto na imagem. Tema ainda sem foto: cartão limpo, sem ilustração.
- Escuro: fotos de anatomia em vidro têm a luz invertida com a cor preservada (o fundo claro some no cartão escuro); cenas,
  objetos e paisagens ficam mais escuras e esmaecidas.
- "Progresso da aula": barra na cor do tema e "70% concluído". Só aparece com dado real (ver item 4).
- Botões:
  - com aula: "Abrir a aula" (principal, na cor do tema, ícone de play), "Treinar este tema" (secundário, ícone de barras) e "Me teste" (terciário, estrela de brilho);
  - sem aula e com questões: "Treinar este tema" vira o principal (play), e "Me teste" ao lado;
  - sem questão: só "Me teste" e o aviso "Ainda não há questão oficial catalogada ligada a este tema.".
- "Me teste" já existia: abre o Tutor no modo perguntas com o tema (mesmo pedido de antes).
- Celular primeiro: margem de 16 px, sem rolagem lateral, a foto encolhe e fica por trás do lado direito; o botão
  principal ocupa a linha inteira e os outros dois ficam embaixo. Os tamanhos seguem a largura do cartão (container), então
  o mesmo cartão serve no celular e na grade de duas colunas do computador.
- Acessibilidade: tudo é botão de verdade (teclado e foco visível com anel), barra de progresso com `role="progressbar"`,
  foto decorativa (texto alternativo vazio, escondida dos leitores de tela, carregamento preguiçoso), contraste AA conferido (texto branco sobre a cor do tema ≥ 4,5;
  cor do tema sobre branco ≥ 4,5; brilho do tema sobre o fundo escuro ≥ 11).

## 2. O que NÃO mudou

Funções do banco, rotas, filtro por área, busca sem acento, estados carregando/vazio/erro, abertura da aula (`?aula=ordem`),
volta para o mesmo ponto da lista, treino do tema (20 questões com o filtro `grande_tema`) e o "Me teste".

## 3. Pendência: favoritar tema

A referência mostra um botão de favoritar (marcador). Hoje não existe favoritar tema no sistema (só "Marcar" questão,
`app_set_bookmark`). Pela regra "não inventar comportamento", o botão ficou de fora. Para ligar: criar no banco
`app_tema_favorito(p_tema_id, p_on)` e devolver os favoritos do aluno em `app_grandes_temas` (ou numa função própria);
o lugar do botão no cartão é ao lado da pílula, quadrado de 44 px com o ícone `bookmark`.

## 4. Progresso da aula

A lista não recebe o progresso do banco. O número mostrado é o mesmo que a própria aula calcula (seções marcadas como
estudadas ÷ seções da aula, `progressoDaAula`), depois que as caixas do aluno foram lidas do banco. Quando o aluno abre a aula
e volta, o cartão mostra o progresso. Ao recarregar a página, some até a aula ser aberta de novo. Para mostrar sempre: uma
função leve no banco (ex.: `app_temas_progresso()` devolvendo `{tema: pct}`), sem mexer na tela além de preencher o mesmo dado.

## 5. Fotos dos temas (em uso)

- Origem: imagens 16:9 geradas pelo Nano Banana (fora do repositório, em `/Volumes/StaziaMed/.tmp-aulas/imagens-temas/img/`,
  com os prompts, o tipo e o risco médico em `prompts.json`).
- Sincronizar quando chegarem novas: `pdfpython scripts/sincronizar-fotos-temas.py` (na raiz do projeto). Converte para
  WebP 1280 × 720, qualidade 80 (baixa até caber em 180 KB), grava em `public/temas/foto/` e atualiza o manifesto com
  arquivo, tipo, risco médico e estado. Foto nova ou trocada entra como "pendente de revisão médica". Tema "aprovada" nunca
  é sobrescrito. PNG igual ao já convertido é pulado. `--seco` mostra o que faria.
- O cartão só mostra foto de tema que está no manifesto (e não "reprovada"). O aluno não vê estado, risco nem código.
- Plano completo, auditoria e decisões: `docs/temas-card-fotos.md`.

## 5b. Registro: estilo das ilustrações em vidro (guardadas, sem uso)

Tudo em SVG desenhado em código (sem imagem, sem serviço pago). Caixa de 240 × 240.

| Camada | O que é | Valores |
|---|---|---|
| Halo | círculo radial atrás do desenho, na cor de brilho do tema (`--gt-b`) | opacidade 0,85 → 0,32 → 0 |
| Corpo de vidro | degradê diagonal claro, azul-esverdeado | branco 0,78 → #E8F6FB 0,5 → #C4E5F3 0,4 → #8EC5DF 0,5 |
| Tinta do tema | leve camada da cor do tema por cima do corpo | 0 → 0,55, aplicada a 0,3 |
| Rosa interno | brilho rosado difuso (vasos, tecido vivo) | #EE6F87 0,62 → #F6A9B7 0,3 → 0 |
| Ramos | brônquios, artérias: árvore gerada, escura no tronco e clara nas pontas | #D24E69 → #F3A2B1; vasos azuis #5B98C0 → #9CCBE3 a 0,42 |
| Sombra interna | traço largo azul desfocado por dentro da borda (dá volume) | #2F6F98, 0,42, largura 13, desfoque 4 |
| Brilho da borda | traço branco desfocado por dentro | branco 0,7, largura 3,2 |
| Brilho especular | elipse branca radial no alto do corpo | branco 0,95 → 0,35 → 0 |
| Contorno | linha branca fina sobre uma linha azul de definição | branco 0,92 (1,2) sobre #4E8FB8 0,32 (2,2) |
| Tubos | traqueia, vasos, ureter, cordão: 4 traços do largo escuro ao reflexo fino | azul #4F8DB6/#BFE2F2/branco ou rosa #C9546C/#F0A0AF |
| Some no branco | máscara do cartão: transparente à esquerda e embaixo | esquerda 0→30 %, embaixo 64→98 % (48→82 % quando há progresso) |

Peças (em `vidro.jsx`): `Vidro` (corpo com tudo acima), `Tubo`, `arvore` + `Ramos` (ramificação determinística),
`Brilho`, `suave` (curva suave por pontos). Componente base: `<IlustracaoTema motivo="pulmao" />` (usa `--gt-b` do cartão)
ou `<IlustracaoTema motivo="rim" cor="#90E7CD" />`. Motivo sem desenho cai no genérico da área.

## 6. Registro: motivos desenhados (11 + genérico)

pulmão (traqueia com anéis, brônquios ramificados, lobos com fissuras e toques rosados), coração e grandes vasos, cérebro
(giros, fissura lateral, cerebelo e tronco), rim (pirâmides, pelve, ureter, artéria e veia), útero com trompas e ovários,
feto no útero (placenta, cordão, cabeça para baixo), osso/articulação (joelho com menisco e patela), vírus e bactéria,
e, pelos exemplos do dono: intestino com apêndice, recém-nascido com ambu, agente de saúde no território.
Genérico da área: célula de vidro com núcleo na cor do tema (a disposição muda por área).

## 7. Registro: mapa dos 100 temas

`src/novo/_dormente/ilustracoes-vidro/mapa.js`: 36 motivos; cada um dos 100 temas aponta para um motivo.

## 8. Registro: motivos que faltariam desenhar (etapa 2 cancelada pela troca para fotos)

| Motivo | Temas |
|---|---|
| vaso (artéria e veia) | 3, 15, 42, 82 |
| sangue (hemácias) | 23, 73 |
| pâncreas | 2, 29, 46 |
| fígado e vias biliares | 6, 22, 28 |
| tireoide | 24 |
| esôfago e estômago | 21 |
| parede abdominal | 35, 39 |
| bexiga e vias urinárias | 9, 75 |
| mama | 52, 57, 62 |
| placenta e cordão | 45, 48, 51 |
| chama e raio | 36 |
| bisturi e sutura | 37, 38 |
| criança e curva de crescimento | 63 |
| termômetro | 71 |
| seringa e vacina | 64 |
| pessoas e família | 80, 83 |
| pessoa idosa | 85 |
| mãos que cuidam | 86 |
| rede de serviços | 87, 88 |
| prancheta e ficha | 89, 90 |
| gráfico e lupa | 81, 91, 92, 93 |
| balança (ética) | 94 |
| cabeça e mente | 95, 96, 97, 98 |
| copo e substâncias | 100 |
| pílula e contracepção | 55, 84 |

(Sem efeito agora: tema sem foto fica com o cartão limpo.)

## 9. Fotos realistas

Em uso desde 15/10/2026 (item 5). Plano, auditoria, banco futuro e decisões: `docs/temas-card-fotos.md`.
