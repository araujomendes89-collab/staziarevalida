# Novas telas, onda 4: casca de Temas Essenciais, Diretrizes e Atualizações e Mapas Mentais

Ramo `nt-onda4` (parte de `novas-telas` + merge de `temas-card`, sem conflito). Prévia: `npx vite --config scripts/previa-onda4/vite.config.mjs` (porta 31973, dados de TESTE, sem banco).
Capturas: `/Volumes/StaziaMed/.tmp-aulas/novas-telas/onda4/` (`modelo/` = pacote, `atual/` = app; mesmos nomes; `-escuro` = modo escuro).

Regra da onda: só a casca muda. Cartões de tema com foto realista, pôster e ícone 3D dos mapas, atualizações 2025/2026 (`ANOS_VISIVEIS`) e todos os dados/rotas/permissões continuam como estavam. Nada dos cartões-modelo vazios do pacote foi copiado. Não toquei em imagens nem em `fotos-temas.json`.

## Telas

| Tela do pacote | Arquivo do app | O que mudou |
|---|---|---|
| TemasWeb/Tablet/Mobile | `study/ThemesScreen.jsx` (+ `study/casca.jsx`, `casca.css`) | "Como contamos" virou aviso recolhível (começa fechado; o texto continua na página); busca larga (máx. 560 px, 48 px de altura); filtro de área com bloco de ícone (pílulas no computador/tablet, colunas de bloco com nome curto no celular, fileira que rola); contagem "N temas" em destaque; cabeçalho de grupo com bloco de ícone, nome e "N temas · N questões ligadas". Cartão do tema (foto) inalterado. |
| DiretrizesWeb/Tablet/Mobile | `study/UpdatesScreen.jsx`, `atualizacoes.css` | Cartão de abertura com bloco de ícone + cartão "Seu progresso"; busca com "Todos / 2025 / 2026" ao lado (controle segmentado, só anos 2025/2026 vindos dos dados); filtro de área com bloco de ícone e contagem; "Atualizações em destaque" com faixa colorida; cartão da lista novo (área, NOVO, ano em fonte de código, "Lida", título, caixa "Conduta vigente", "Fonte:", botão "Ver o que mudou"); celular: destaques em fileira rolável, lista num cartão só com "Agora:" e seta, "Carregar mais" (12 em 12). |
| MapasWeb/Tablet/Mobile | `mapas/MapasScreen.jsx`, `mapas.css` | Busca + filtro de área novos; cartão branco com bloco do ícone 3D (o ícone de cada mapa continua o atual), área em caixa-alta, título, subtítulo e rodapé "N ramos · Revisão rápida · Aprofundado" (cada botão abre o mapa já no nível escolhido: `?modo=aprofundado`); celular: grade de 3 colunas e controle "Revisão rápida / Aprofundado" no topo. |
| Flashcards (sem tela no pacote) | `review/FlashcardsScreen.jsx` | Nenhuma mudança de código: só herda a casca (menu, cabeçalho, tokens). Capturas `Flashcards*.png`. |

## Ícones (cada ícone do modelo x app)

O pacote usa arte 3D própria em todos os ícones. Pela decisão 7 (arte 3D só após o diretor de arte), o app usa Lucide; só o símbolo feminino foi desenhado em SVG (arquivo `casca.jsx`, componente `Venus`) porque o Lucide desta versão não o tem.

| Onde | Modelo (pacote) | App antes | App agora |
|---|---|---|---|
| Filtro "Todas" | 4 quadradinhos coloridos 3D | sem ícone | `layout-grid` (novo) |
| Clínica Médica | estetoscópio 3D | ponto colorido | `stethoscope` (novo) |
| Cirurgia | bisturi 3D | ponto colorido (Diretrizes usava `activity` fora do filtro) | `scissors` (novo; o Lucide não tem bisturi) |
| Ginecologia e Obstetrícia | símbolo feminino rosa | ponto colorido | SVG próprio "Venus" (novo) |
| Pediatria | mamadeira 3D | ponto colorido | `baby` (novo) |
| Medicina de Família e Comunidade | casa com coração | ponto colorido | `house` (novo) |
| Saúde Coletiva / Preventiva | escudo com cruz | ponto colorido | `shield-plus` (novo) |
| Saúde Mental | cérebro 3D | ponto colorido | `brain` (novo) |
| Busca (3 telas) | lupa | `search` | `search` (igual) |
| "Como contamos" | `info` + seta para baixo | `chart-column` | `info` + `chevron-down` (trocado) |
| Abertura de Diretrizes | pasta/documento 3D | sem ícone | `file-pen-line` (novo) |
| "Ver o que mudou" | seta para a direita | `chevron-right` | `arrow-right` (trocado) |
| Lida (cartão) | caixa de seleção | texto "Lida" só quando lida | `square` / `square-check-big` (novo) |
| Linha no celular | seta `›` | n/a | `chevron-right` (igual ao padrão) |
| Mapas: ícone do tema no cartão | ícone 3D de cartão-modelo | imagem 3D do mapa no canto | a mesma imagem 3D do mapa, dentro do bloco (conteúdo mantido) |

## Diferenças deliberadas e limites

- "Lida" no cartão da lista é só indicação (caixa marcada/vazia); marcar continua no detalhe. O cartão inteiro é um botão, e caixa clicável dentro de botão é inválido para leitor de tela. Se o dono quiser marcar na lista, é preciso separar o cartão (próxima rodada).
- Aviso "Modelo de cartão" amarelo do pacote não existe no app (era só marcador). Contagens, "[n]" e nomes de exemplo não foram copiados.
- Celular = até 719 px (como o pacote). O resto do app usa `useMobile` (até 860 px) para o layout geral; na lista de Atualizações usei o limite de 719 px para o tablet (834 px) ter duas colunas como no modelo.
- Progresso no celular (Diretrizes) fica num cartão abaixo do texto de abertura, não ao lado do seletor de ano como no modelo.
- Mapas: "Aprofundado" fica desligado nos mapas sem conteúdo aprofundado.
- Cartão de tema (Temas) não segue o cartão-modelo vazio: continua o cartão com foto aprovado (conteúdo fixo).
- 3 testes de `updatesScreenVisual.test.tsx` já falhavam ANTES desta onda (item "ATLS" com ano 2020 some pelo filtro 2025/2026); não mexi.
