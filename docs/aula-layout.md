# Padrão visual da aula do Grande Tema (tela do aluno)

Vale para **todas** as aulas (GR-001 a GR-100). Uma aula nunca ganha layout próprio: o que muda de uma para outra é só o
texto e a **cor do tema**. Código: `src/novo/app/study/TemaAula.jsx` (tela), `aulaPadrao.js` (regras de cada bloco),
`aula.css` (aparência), `AulaImagem.jsx` (imagens protegidas), `temaCores.js` (paleta v2). Testes: `src/__tests__/aulaLayoutPadrao.test.tsx`.

Referências que o padrão segue: a prévia aprovada da aula (14/10), o visual novo das Atualizações (`atualizacoes.css`) e as
peças feed/story/A4 (títulos em Barlow Condensed, caixa "Pegadinha de prova!" em vermelho).

## 1. Ordem da página (hierarquia)

1. **Barra fixa no topo**: "Voltar aos temas" (no celular aparece só "Temas"), nome do tema, a parte que está na tela agora e o botão **Índice** (celular e tela média).
2. **Capa** na cor do tema: selo do tema (área · subárea, com ponto na cor do tema), "Material StaziaMed", "Atualizado MM/AAAA",
   título (a parte depois dos dois-pontos vira subtítulo em cor de brilho), tempo de leitura estimado, número de seções,
   questões e flashcards, **progresso** (seções estudadas e anotações) e "Como usar esta aula" (fechado, abre ao tocar).
3. **Ações**: Treinar este tema (na cor do tema), Me teste, Estudar meus flashcards.
4. **Duas colunas no computador largo** (a partir de 1240 px de janela): índice fixo à esquerda (248 px) e leitura à direita.
   Abaixo disso, uma coluna; o índice abre como folha que sobe do rodapé.
5. **Em resumo**: o resumo (quando é longo demais para a capa) e os pontos-chave com marca de conferido.
6. **Minhas anotações de antes** (só se existir anotação antiga).
7. **As seções da aula**, cada uma num cartão: número no círculo na cor do tema, sobretítulo ("Bloco 1", "Para começar",
   "Atualização", "Revisão para a prova", "Resposta do caso"), título, conteúdo e o **rodapé da seção** (anotação da seção,
   "Marcar esta seção como estudada" e "Próxima").
8. **Questões de fixação**, **Flashcards ilustrados**, **Revisão da Aula** (imagem A4).
9. **Fim da aula**: progresso, Treinar este tema, Voltar ao início da aula, Escolher outro tema; rodapé "Não é material oficial do Inep".

## 2. Tipos de bloco

| Bloco | Como é reconhecido | Como aparece |
|---|---|---|
| Parágrafo | padrão | texto de leitura (ver §4) |
| Caso clínico | seção "Caso clínico…" (ou estilo `caso`) | cartão em fundo suave do tema, ícone de estetoscópio |
| Voltando ao caso | seção "Voltando ao caso" | cartão cinza claro com filete na cor do tema e ícone de conferido (antes era post-it em letra cursiva, difícil de ler em textos de 900+ caracteres) |
| Pegadinha | estilo `alerta:Pegadinha…` ou texto que começa com "Pegadinha"/"Armadilha" | caixa vermelha de alerta, título "Pegadinha de prova!" (o vermelho é exclusivo de pegadinha e da linha de alerta da tabela) |
| Atenção | estilo `alerta:Atenção…` (o título vem do próprio estilo, ex. "Atenção: sigilo") ou texto que começa com "Atenção"/"Cuidado" | caixa âmbar com filete à esquerda |
| Tome nota | estilo `tome_nota` ou texto que começa com "Tome nota"/"Dica" | caixa na cor do tema com lâmpada |
| O que mudou desde a prova | seção "O que mudou…" (ou todos os parágrafos com estilo `mudou`) | um cartão por mudança, filete superior na cor do tema; um rótulo curto no começo ("Vacina contra o VSR na gestante: …", até 10 palavras e sem começar por artigo) vira o título do cartão; **antes × agora** em duas colunas só quando o próprio texto traz "Antes:" e "Agora:"/"Hoje:" |
| Erros frequentes | seção "Erros frequentes…" | lista para marcar ("Marque os que você já sabe evitar", contador). Quando vem um parágrafo só, ele é dividido nas frases que já tem (nenhuma palavra muda) |
| Tabela | material `tabela` da Central (posição = número da seção) | título em faixa suave, cabeçalho na cor escura do tema, linhas zebradas; célula que começa com `!alerta` destaca a linha em vermelho (a marca não aparece). **Celular**: cada linha vira um cartão com o nome da coluna acima de cada valor (sem rolagem lateral) |
| Vídeo / áudio | material `video`/`audio` | figura com legenda (título · tipo · duração) e "Ler a transcrição" |
| Questão de fixação | material `questoes_fixacao` | enunciado, alternativas com letra em círculo; ao tocar: certa em verde, errada em vermelho, explicação das duas, "Tentar de novo" e placar |
| Flashcards | material `flashcards_ilustrados` | **um cartão por vez** (tamanho 4:5, até 420 px): virar, anterior, próximo, bolinhas numeradas e setas do teclado; cartão só com texto usa a cor escura do tema na frente e o fundo suave no verso |
| Revisão da Aula | material `revisao_aula` | imagem A4 com legenda "O resumo da aula em uma página" |

**Nada é inventado**: o padrão só escolhe a caixa, separa um rótulo que já está no texto ou divide a lista nas frases que já existem.

## 3. Cores por tema

- O tema entra só como variáveis CSS na raiz da aula (`temaVars`): `--gt-p` principal, `--gt-e` escura, `--gt-c` fundo suave, `--gt-b` brilho.
- `aula.css` traduz em `--al-c` (cor de destaque), `--al-ink` (texto sobre fundo suave), `--al-soft` (fundo suave), `--al-on` (texto sobre a cor de destaque).
- Modo escuro: destaque e texto passam para o **brilho** (`--gt-b`), fundo suave = 12% do brilho sobre o cartão, texto sobre destaque em azul-marinho.
- Cores fixas (iguais em todos os temas): vermelho de alerta (Pegadinha e linha de alerta), âmbar (Atenção), verde/vermelho do sistema (certo/errado na fixação).
- **Nenhum código de cor aparece na tela** (testado).

## 4. Tipografia e espaços

- Títulos: Barlow Condensed (como nas peças), caixa alta. Capa 30–52 px; título da seção 25 px (21 px no celular).
- Texto de leitura: fonte do sistema (Plus Jakarta Sans), **16,5 px / entrelinha 1,7** no computador e 16 px / 1,65 no celular,
  **largura máxima de 68 caracteres** (≈ 65 por linha).
- Sobretítulos e rótulos: 12 px, caixa alta, espaçamento 0,08 em, na cor `--al-ink`.
- Cartões: raio 22 px (18 no celular), respiro interno 26/30 px (20/16 no celular); 18 px entre cartões; caixas com raio 16 px.
- Gutter da página no celular: o do Shell (18 px de cada lado). Nada passa da largura da tela (conferido nas capturas).

## 5. Índice e progresso

- Índice ("Nesta aula") com: Em resumo, as seções numeradas, Questões de fixação, Flashcards, Revisão da Aula.
  Círculo vazio = seção ainda não estudada; círculo cheio com ✓ = estudada; ícone de caderno = tem anotação.
- **Acompanha a rolagem**: a parte que está na tela fica destacada (`aria-current`) e o nome dela aparece na barra fixa.
- Computador largo: índice fixo na coluna da esquerda, com o progresso embaixo. Celular/tela média: botão **Índice** na barra
  abre a folha (fecha com Esc, com o X, tocando fora ou escolhendo um item; o foco vai para o primeiro item e volta ao botão).
- Progresso = seções marcadas como estudadas (`sec-N` em `app_lesson_checks_save`) e anotações com texto; aparece na capa,
  no índice e no fim da aula, como barra com `role="progressbar"`.

## 6. Acessibilidade e teclado

- Tudo é botão ou caixa de marcar de verdade; foco visível em todos (contorno de 3 px na cor de foco do sistema).
- Alvos de toque de 40–44 px (itens do índice, marcar seção, botões da aula).
- Cada seção é uma região com nome (`aria-label` = título); caixas especiais são `role="note"`; a correção da fixação é `role="status"`.
- Flashcards: o cartão vira com Enter/Espaço; setas ← → trocam de cartão; bolinhas com `aria-current`.
- Movimento reduzido: rolagem e giro do cartão sem animação quando o sistema pede.
- Textos só para leitor de tela: "(estudada)", "(com anotação)".

## 7. Regras que continuam valendo

- O aluno **nunca** vê referências, páginas, trechos citados, código GR, endereço de arquivo nem link (testado).
- Imagens vêm do servidor como bytes, sem arrastar, sem menu e sem baixar; a faixa PROVISÓRIA cobre o código do rodapé das
  imagens prontas (na A4 cobre só os 32% da direita, porque nas peças novas o logotipo fica no centro).
- Estados: carregando (esqueleto), erro (com "Tentar de novo"), aula retirada (aviso e botão de voltar), anotações que não
  carregaram ou não salvaram (aviso e "Não salvo" na caixa).
- Anotação por seção grava sozinha depois de uma pausa, ao sair da caixa e ao sair da aula; "Marcar esta seção como estudada"
  grava junto com as caixas de erros.

## 8. Pendência fora da tela: o estilo de cada parágrafo não chega ao aluno

Os pacotes das aulas marcam cada parágrafo (`pdf_estilo`: 68 "Pegadinha de prova!", 46 "Atenção…", `caso`, `mudou`,
`lista_erros`, `figura_depois`), mas a importação (`scripts/aulas/gerar-sql-importacao.mjs`) guarda só o texto e
`app_tema_aula` devolve só o texto. Como o texto dessas caixas **não começa** com "Pegadinha"/"Atenção", hoje elas aparecem
como parágrafo comum. A tela já está pronta para receber `estilos` (uma lista por seção, na mesma ordem dos parágrafos).
Para ligar, falta (não feito aqui, porque mexe em banco e na importação):

1. Importação: guardar o estilo no parágrafo, ex. `{ text, clinical, claim_ids, style: p.pdf_estilo ?? "normal" }`, e reimportar as aulas.
2. Migração nova em `app_tema_aula`, dentro de cada seção, ao lado de `paragrafos`:

```sql
'estilos', (select coalesce(jsonb_agg(coalesce(nullif(p ->> 'style', ''), 'normal')), '[]'::jsonb)
              from jsonb_array_elements(coalesce(s -> 'paragraphs', '[]'::jsonb)) p
             where btrim(coalesce(p ->> 'text', '')) <> '')
```

Sem isso, o padrão continua funcionando (caixas pelo começo do texto, seções pelo título).
