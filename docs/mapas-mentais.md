# Mapas Mentais (app do aluno)

Resumos visuais por tema, desenhados em código (SVG/HTML/CSS, sem imagens), no estilo do mapa de referência (Tuberculose pulmonar):
cartão central azul-marinho com emblema em vidro, ramos coloridos com ícone redondo, fios curvos, painéis Pontos-chave e Atenção, rodapé "MAPA MENTAL · STAZIAMED".

## Onde está
- Componente: `src/novo/app/mapas/MapaMental.jsx` (estilo em `mapas.css`, ícones e emblemas em `icones.jsx`, regras em `mapas.js`).
- Tela do menu: `src/novo/app/mapas/MapasScreen.jsx` (rota `/mapas`, grupo Aprender, abaixo de "Diretrizes e Atualizações"; filtro por área, busca, cor do tema).
- Ponto de integração com Temas Essenciais: `src/novo/app/mapas/MapaDoTema.jsx`.
- Dados: `src/novo/app/mapas/dados/GR-xxx.json` (um por tema com aula publicada).
- Menu: `Shell.jsx` (GROUPS; o "Mais" do celular usa a mesma lista), `App.jsx` (TITLES, CONNECTED, rota), `AppIcons.jsx` (ícone `network`).
- Testes: `src/__tests__/mapasMentais.test.tsx` (e `menuCelularMais.test.tsx` atualizado).

## Dois níveis
- **Revisão**: uma tela, 6 a 8 ramos, textos curtos (leitura < 3 min). Desktop: desenho horizontal com fios curvos (a partir de 960 px de largura do quadro). Celular: ramos empilhados.
- **Aprofundado**: cada ramo ganha o botão "Aprofundar" (e "Abrir tudo"), que abre os blocos de `aprofundado`.

Cores: azul = diagnóstico, verde = conduta, laranja = atenção, vermelho = alerta/erro. Itens com `tom` ganham cor própria; `fluxo` desenha a sequência de conduta com setas.

## Como adicionar um mapa
1. Só para tema com aula publicada (sem aula: nenhum mapa; a tela mostra "Mapa em preparação").
2. Criar `src/novo/app/mapas/dados/GR-xxx.json` lendo o conteúdo da aula revisada. Nada inventado: número, dose e prazo só do que a aula diz; o que não confirmou, omitir e registrar em `revisao.pendencias`.
3. Rodar `bash ../vaga-de-teste.sh npx vitest run src/__tests__/mapasMentais.test.tsx`: o teste valida 6 a 8 ramos, ícones, status e que o aluno não vê código, link ou página.
4. O mapa entra sozinho na lista (importação automática de `dados/GR-*.json`).

## Esquema do JSON
```
esquema: 1
slug: "tuberculose-pulmonar"      endereço do mapa (nunca o código GR)
codigo: "GR-001"                  só nos dados; a tela nunca mostra
area: cm|cir|ped|go|mfc|sc|sm
titulo, subtitulo, emblema: pulmao|coracao|gota|cruz
revisao: { status: "pre-revisado por agente", origem, gerado_em, aprovacao_humana: null, pendencias: [] }
ramos[6..8]: {
  id, titulo,
  cor: azul|azul-forte|ciano|verde|laranja|vermelho|roxo|amarelo,
  icone: (ver NOMES_ICONES em icones.jsx),
  lado: "centro" | "topo" | "esq" | "dir"    (opcional; centro = abaixo do cartão central; sem lado, o equilíbrio é automático)
  cabecalho: "solido"|"suave"                 (opcional)
  revisao: { itens[], linhas[{rotulo,itens[]}], fluxo[], faixas[{rotulo,chip,texto}] },
  aprofundado: [{ titulo, itens[], fluxo[] }],
  claims: ["TB01", ...]                       ids das afirmações da aula (rastreabilidade; não aparece)
}
pontos_chave[], atencao[]
```
Item ou passo de fluxo: texto ou `{ "t": "texto", "tom": "alerta|atencao|conduta|diag" }`.
O último ramo é sempre "Revalida INEP: decisões e pegadinhas" (vermelho).

## Pôster realista (visual principal)
O visual principal é a imagem 3:2 gerada por IA a partir da referência do dono (`public/mapas-mentais/poster-<nome-do-tema>.webp`), campo `poster { webp, estado, ressalvas, origem }` do JSON. O aluno nunca vê `estado`, `ressalvas` nem `origem` (ficam nos dados/Central; todas "pendente de revisão médica"). A tela tem "Pôster" | "Aprofundado": o Pôster mostra a imagem com Ampliar (tela cheia com zoom + e −, rolagem e pinça) e "Baixar imagem"; o texto do JSON vira descrição longa para leitor de tela; o Aprofundado é o mapa em código (texto pesquisável). Se a imagem falhar, cai no mapa em código. O bloco de cartões curtos do mapa em código passou a se chamar `cartoes`.

## Pôster em código (reserva) — bloco `cartoes`
O modo Revisão desenha um pôster 3:2 com os oito cartões da referência, definidos no bloco `poster` do JSON: `conceito`, `quadro`, `fatores`, `diagnostico` (tabela de 3 linhas com ícone), `exames` (tabela de 4 linhas rótulo+texto), `conduta` (tabela de 3 linhas), `objetivos` (marcadores verdes) e `tratamento` (2 faixas com chip + até 3 itens). Cada cartão: `titulo`, `icone`, `cor`, `claims`. Os títulos mudam por tema conforme a aula (ex.: o cartão `fatores` pode virar "Cinemática do impacto"). Sem bloco `poster`, o mapa só aparece empilhado. No celular o padrão é o empilhado; o pôster tem rolagem lateral e zoom do navegador. O Aprofundado é sempre empilhado. A figura redonda do Conceito e a imagem central usam o campo `foto`.

## Formato de `faixas` e o gerador de pôster
No cartão `cartoes.tratamento`, `faixas` é uma lista de `{ "rotulo": "...", "chip": "...", "texto": "..." }` (ex.: `{ "rotulo": "Fase intensiva (2 meses)", "chip": "RHZE", "texto": "Quatro fármacos" }`), desenhada como linha com chip no pôster em código. O gerador de imagem lia só `itens` e `linhas` e por isso perdia as faixas. Regra a partir de 15/10: **todo conteúdo clínico essencial do cartão de tratamento fica em `itens` (texto completo, uma frase por item)**; `faixas` só é usada quando o chip acrescenta algo (hoje, só na Tuberculose) e o gerador deve ler `cartoes.<cartão>.faixas[].rotulo/chip/texto` além de `itens` e `linhas`. Nos outros 11 mapas as faixas foram convertidas em itens.

## Imagem central (opcional)
O JSON aceita, no mesmo formato do cartão de Temas Essenciais (`docs/temas-card-fotos.md`), `foto: { "webp": "...", "avif": "...", "foco": "50% 30%", "alt": "..." }` no mapa (imagem central) e, opcional, em cada ramo (figura redonda pequena no cabeçalho). Imagem sem texto nem logo; brilho e vidro por CSS. Sem imagem, ou se ela falhar ao carregar, aparece o emblema em SVG (`emblema`: pulmao, coracao, gota, cruz), desenhado em código. Nenhuma imagem foi gerada por API paga. As imagens serão geradas depois, com liberação de custo pelo dono (diretor de arte); o SVG é só reserva simples. Estética e validação científica são separadas: a ilustração é estética; qualquer dúvida anatômica/clínica vai para revisão humana (não se diz que médico validou).

## Rastreabilidade e revisão
Fonte, versão, data e status ficam só nos dados (`revisao`, `claims`, `codigo`). O aluno nunca vê referências, códigos GR, links, páginas ou códigos de cor. Mapas gerados por agente levam `pre-revisado por agente`; aprovação humana fica `null` (a skill revisor-medico define o padrão). Nada foi gravado no banco.
Alternativa futura: mover os JSON para uma tabela no banco (uma linha por tema com o mesmo JSON, publicada por revisão), trocando `mapas.js` por uma chamada de leitura; o componente não muda.

## Integração em Temas Essenciais (para depois do ramo temas-card)
Não foi editado `ThemesScreen.jsx` nem `temas.css` (o ramo `temas-card` está redesenhando o cartão). Quando ele entrar no `origin/main`:
```jsx
import { BotaoMapaMental } from "../mapas/MapaDoTema.jsx";
// dentro do cartão do tema (onde ficam os botões de aula/treino), usando o código interno que o cartão já tem:
<BotaoMapaMental codigo={t.codigo} go={go} />          // botão "Mapa mental"; some se o tema não tem mapa
<BotaoMapaMental codigo={t.codigo} go={go} compacto />  // só o ícone, para espaço curto
```
O botão abre `/mapas?tema=<slug>`. Para uma aba dentro do tema: `<MapaDoTema codigo={t.codigo} />` (mostra o mapa ou "Mapa em preparação"). `temMapa(codigo)` diz se existe.

## Pendências
- BPaLM: a frase "incorporado em 06/10/2026 pelo MS" NÃO foi verificada. O mapa de Tuberculose usa só o que a aula traz (documento oficial de 24/08/2026) e não cita a data de 06/10.
- "PT e IGRA não diagnosticam doença ativa" (pedido do dono) está coerente com a aula (afastar TB ativa antes de tratar ILTB), mas a frase literal não consta nas afirmações: conferir com o revisor.
- Revisão humana de todos os mapas; pendências específicas por tema em `revisao.pendencias` de cada JSON.
- Temas com pacote pronto mas fora da lista pedida (ex.: GR-044, 063, 069, 079, 081, 085, 087, 089, 094, 095) só ganham mapa quando a aula for publicada.
- Conferir o visual com o dono (composição horizontal do desktop é generalizada para qualquer tema, não uma imagem fixa).
