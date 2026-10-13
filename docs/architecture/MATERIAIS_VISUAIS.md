# Materiais visuais (Central de Conteúdo › Materiais visuais)

Escrito para: o dono do produto (o que existe e como usar) e quem for manter o código.

## O pedido
Em 2026-10-06 o dono enviou o pacote "StaziaMed Revalida — Modelos educacionais", com o PDF e o HTML de 8 pranchas:
- card de feed;
- página A4;
- story;
- sistema visual;
- flashcard digital frente e verso;
- flashcard A6 frente e verso.

O pacote também trazia o `tokens-especialidades.json` e as instruções de implantação. O pedido foi a função
**Novo material visual** em Administração › Central de Conteúdo, para gerar essas peças a partir de um formulário ou
de um comando.

## Onde fica e quem usa
- **No painel:** Administração › Central de Conteúdo › aba **Materiais visuais**, botão **Novo material visual**.
- **Quem usa:** a equipe (administrador ou editor). Aluno e revisor médico não veem a aba. O banco também recusa,
  não só a tela.
- **No terminal:** o comando `scripts/content-hub/material-visual.ts`, descrito mais abaixo.

## Como funciona
1. A equipe escolhe o modelo e a especialidade, preenche o conteúdo (ou cola um comando) e vê a **prévia ao vivo**.
2. Salvar grava uma **versão**. Cada edição cria a versão seguinte, e as anteriores continuam guardadas com os seus
   arquivos.
3. Gerar põe a versão na **fila da Central** (`ch_jobs`, etapa `visual_render`).
4. O processamento gera PNG e PDF com o Chromium e **confere o resultado**. Em produção, ele roda na tarefa do Google
   Cloud Run, a cada 10 minutos. No desenvolvimento, roda no próprio servidor, em segundos.
5. Os arquivos vão para o depósito privado `content-hub` (pasta `visual/`) e saem só pela rota do servidor, para a
   equipe.

A prévia do painel, a geração e o comando usam o **mesmo HTML e a mesma conferência** (`src/shared/visualMaterials`).
Por isso, o que aparece na prévia é o que sai no arquivo.

**Nada de conteúdo clínico é escrito pelo sistema.** Não há IA nesta função: o texto é sempre o que a equipe forneceu.

## Modelo visual "criativo-1" (padrão desde 2026-10-13)
O dono pediu todos os cards no estilo do modelo de referência dele (prancha de tuberculose de 2026-10-13):
- cabeçalho azul-marinho com ilustração vetorial e brilho; título enorme em fonte condensada, em branco e na cor de
  destaque (a parte depois dos dois-pontos, ou a 2ª metade das palavras);
- três selos (especialidade, selo da prova e "Atualizado"), faixa verde da mensagem-chave (`resumo`);
- cartão principal com ícone grande, dado-chave e parágrafo; painel de pontos-chave com ícones; "post-it" amarelo
  inclinado ("Tome nota!");
- seção numerada com tabela de linhas coloridas (cor da especialidade, vermelho de alerta, azul e cinza) e ícones;
- caixa vermelha "Pegadinha de prova!"; faixa de passos numerados (`bloco`, ex.: "Depois de confirmar");
- rodapé azul-marinho com a marca e a linha de fonte pequena.

Mesmos campos, mesmo comando e mesma conferência do clássico. O clássico (`visual-1.0`) continua disponível por
`BuildOptions.template` / `RenderOptions.template`. Código: `src/shared/visualMaterials/criativo.ts`.

**Kit de ilustrações** (`src/shared/visualMaterials/kit/`): tudo em SVG desenhado à mão, sem IA de imagem e sem
texto dentro do desenho.
- `spots.ts`: ícones pequenos (tosse, microscópio, cápsulas, pessoas, lupa, gota, placa de cultura, documento,
  calendário, lâmpada, triângulo de alerta, selos coloridos…). O ícone de cada ponto-chave e de cada passo é escolhido
  pelo texto (`SPOT_KEYWORDS`), só como decoração.
- `scenes.ts`: cenas do cabeçalho. Prontas: **pulmão** (com bacilos brilhantes e lupa), **coração** e **bebê**.
  Planejada: útero/gestação. Sem cena própria, o tema usa a cena genérica (círculo de luz com o ícone).
- `index.ts` (`THEMES`): liga o ícone do formulário (`ilustracao.icone`) à cena e ao ícone grande do cartão. Para um
  tema novo: desenhar a cena, registrar em `THEMES` e acrescentar o ícone em `ILLUSTRATION_ICONS`.
- Flashcards: `ilustracao.icone` (opcional) escolhe a cena do cabeçalho.

## Modelos
| Modelo | Tamanho | Arquivos |
|---|---|---|
| Card para feed | 1080 × 1350 px | PNG e PDF |
| Página A4 | 210 × 297 mm (prancha de 794 × 1123 px) | PDF e PNG (1588 × 2246 px) |
| Story | 1080 × 1920 px | PNG e PDF |
| Flashcard digital | 1080 × 1350 px, frente e verso | PNG da frente, PNG do verso, PDF de 2 páginas |
| Flashcard A6 para impressão | 105 × 148 mm (1240 × 1748 px a 300 dpi), frente e verso | só o PDF de 2 páginas |

Regras visuais aplicadas pelo HTML e conferidas na geração:
- **Cores por especialidade:** vêm de `tokens-especialidades.json`, cuja cópia exata está no repositório; um teste
  confere que `tokens.ts` é igual a ela.
  - Ginecologia: rosa `#D95C82`.
  - Pediatria: azul `#3A7BD5`.
  - Clínica Médica: verde `#2E9B67`.
  - Cirurgia: vermelho `#D94A4A`.
  - Preventiva/MFC: roxo `#7B5DB7`.
  - Qualquer outra especialidade: turquesa/petróleo (`fallback`), com o nome escrito por extenso.
- **Vermelho de alerta:** `#C8102E` é exclusivo de pegadinhas e da linha de alerta da tabela, em qualquer
  especialidade, inclusive Cirurgia. Todo alerta leva o triângulo e o rótulo escrito.
- **Especialidade escrita:** aparece por extenso no selo. A cor nunca é o único identificador.
- **Story:** a faixa azul-marinho cobre a zona segura de 190 px do topo, e os selos ficam logo abaixo dela. O rodapé
  reserva os 150 px da base.
  - Diferença em relação à prancha: na referência, os selos ficavam dentro dos 190 px. Aqui a faixa ganhou 74 px para
    os selos ficarem fora da zona segura.
- **A6:**
  - o conteúdo fica a 7 mm da borda (a margem segura é de 5 mm);
  - o PDF tem 3 mm de sangria, e o filete da especialidade se estende até a borda;
  - TrimBox e BleedBox são marcadas no PDF;
  - frente e verso saem em sequência, para virar no eixo longo; a identificação é espelhada como na prancha.
- **Guias** (zona segura, corte, margens): só existem na prévia. A geração final nunca as inclui.
- **Campo vazio some da peça.** Nunca sai texto de exemplo como "[TÍTULO DO TEMA]".
- **Fontes:** Barlow, Barlow Condensed e Caveat, em `server/contentHub/fonts/visual`, sob licença OFL.
  - O Caveat usado é estático, porque a fonte variável sai como Type3 no PDF (ver `LEIA-ME.txt`).
  - As fontes cobrem os acentos e os símbolos ≤ ≥ ± × ≈ ≠ µ °. **Setas e letras gregas não existem nelas.**

## Campos
Os nomes são os mesmos no formulário, no comando e na API.
- **Peças (feed, A4, story):**
  - `titulo`, `subtitulo`, `selo_prova`, `atualizacao`, `paginacao`;
  - `resumo` (a faixa) e `resumo_paragrafo` (só no A4);
  - `dado_chave`;
  - `pontos_chave`: até 3, ou 4 no A4. No A4, "Destaque — detalhe" deixa o destaque em negrito;
  - `tabela`: 2 ou 3 colunas, até 2 linhas no feed, 3 no story e 4 no A4. Cada linha pode ser normal, destaque ou
    alerta;
  - `ilustracao`: ícone, imagem enviada ou nenhuma, mais uma legenda;
  - `pegadinha`, `tome_nota`, `fonte`;
  - só no A4: `bloco` (lista) e `mnemonico`.
- **Flashcards:**
  - `card_id`: vazio, o sistema cria (ex.: `CIR-0012`);
  - `ordem`, `lote`, `nivel`, `tema`;
  - `pergunta`, que vai só na frente;
  - `resposta`, a resposta curta;
  - `explicacao`, só no digital;
  - `como_lembrar` e `referencia`, só no A6;
  - `pegadinha`, `fonte`, `atualizacao`.
- **Especialidade:** `especialidade` aceita a chave ou o nome por extenso. Use `especialidade_nome` para uma
  especialidade sem cor própria.

## Par frente e verso
- **Juntos sempre:** frente e verso são gerados no mesmo trabalho e gravados de uma vez por
  `ch_worker_visual_save_files`. O banco recusa um conjunto incompleto e também recusa arquivo com `card_id`,
  `specialty_key` ou ordem diferente da do material.
- **Identificação fixa:** o `card_id` é único e não muda entre versões. Duplicar cria um material novo, com um ID novo.
- **A6:** não existe arquivo de um lado só, apenas o PDF com as duas páginas.
- **Dentro do PDF:** o `card_id` aparece escrito nas duas páginas e também nas palavras-chave
  (`card_id=…; specialty_key=…; order=…`).

## Conferência automática (cada geração)
- **No navegador:**
  - linhas por campo e texto cortado;
  - sobreposição entre blocos;
  - zonas seguras (story e A6);
  - fontes carregadas e caracteres que as fontes não têm;
  - vermelho de alerta na pegadinha e especialidade escrita;
  - mesmo `card_id` nos dois lados.
- **Encaixe automático:** antes de acusar problema, o texto pode diminuir até um mínimo por campo. O título, por
  exemplo, pode chegar a 70% do tamanho da prancha.
- **No PDF (PyMuPDF):**
  - número de páginas e página vazia;
  - todo o texto da peça presente;
  - só as fontes do modelo, e embutidas;
  - tamanho exato da página;
  - no A6, corte de 105 × 148 mm e sangria de pelo menos 3 mm.
- **No PNG:** o tamanho exato.
- **Resultado:**
  - reprovado: a versão fica "Reprovado na conferência", com os motivos, e os arquivos não podem ser baixados;
  - erro de geração: a versão fica "Falhou", com o motivo;
  - nos dois casos, o conteúdo continua salvo.

## Comando do administrador
```
npx tsx scripts/content-hub/material-visual.ts --autor EMAIL --modelo flashcard_a6 --especialidade cirurgia \
    --campo tema="…" --campo pergunta="…" --campo resposta="…" --gerar --saida ./materiais
npx tsx scripts/content-hub/material-visual.ts --autor EMAIL --arquivo conteudo.txt --gerar --saida ./materiais
npx tsx scripts/content-hub/material-visual.ts --autor EMAIL --material ID --arquivo novo.txt --gerar   # versão nova
npx tsx scripts/content-hub/material-visual.ts --autor EMAIL --material ID --duplicar
npx tsx scripts/content-hub/material-visual.ts --autor EMAIL --material ID --regenerar --saida ./materiais
npx tsx scripts/content-hub/material-visual.ts --validar --arquivo conteudo.txt --previa ./pasta   # sem banco
```
- **Formato do texto:** `--arquivo` aceita o mesmo texto do campo "Colar comando" do formulário: `campo: valor`, listas
  com `-` e tabela com `|`. Também aceita JSON. Uma linha só com `---` separa materiais de um lote, e a ordem vira 1,
  2, 3…
- **Quem assina:** `--autor` é uma conta da equipe.
- **Banco do site:** quando o `.env` aponta para o Supabase, o comando para e pede `--producao`.
- **Geração:** com `--gerar` e o Chromium no computador, gera na hora pelo mesmo caminho do processamento (o mesmo
  `runJob` da etapa `visual_render`). Sem o Chromium, deixa na fila.

## Banco, rotas e arquivos
- **Migração `20261003005100_materiais_visuais.sql`:**
  - tabelas `ch_visual_materials`, `ch_visual_versions`, `ch_visual_files` e `ch_visual_assets`, todas com RLS e com
    leitura só para a equipe;
  - etapa `visual_render` na fila;
  - PNG, JPEG e WebP liberados no depósito `content-hub`.
- **Funções do servidor (`ch_worker_visual_*`, só a chave de serviço):** `save`, `duplicate`, `regenerate`,
  `register_asset`, `job`, `status`, `save_files`, `claim`, `files`, `actor`.
- **Funções do painel (com o token da pessoa):** `app_ch_visual_list`, `app_ch_visual_material`, `app_ch_visual_file`,
  `app_ch_visual_asset`.
- **Rotas `/api/content-hub/visual`:**
  - `POST /materials`, `PUT /materials/:id`, `POST /materials/:id/duplicate`, `POST /materials/:id/regenerate`;
  - `POST /assets` (imagem conferida pela assinatura do arquivo, até 4 MB) e `GET /assets/:name`;
  - `GET /files/:id`.
- **Código:**
  - `src/shared/visualMaterials`: modelos, validação, comando e HTML;
  - `server/contentHub/visual`: geração, serviço e rotas;
  - `src/novo/app/admin/content/visual`: a tela;
  - `scripts/content-hub/visual_pdf.py`: finalização e conferência do PDF.

## Implantação (ordem obrigatória)
1. Aplicar a migração `…5100` no Supabase. Se a busca por significado ainda não estiver aplicada, a `…5000` vem antes.
2. Atualizar a imagem do processamento no Cloud Run (`scripts/cloudrun/deploy-pdf-worker.sh`).
   - A imagem precisa do código novo, das fontes em `server/contentHub/fonts/visual` e de
     `scripts/content-hub/visual_pdf.py`. A `Dockerfile` atual já copia esses caminhos.
   - Sem isso, a tarefa antiga não conhece a etapa e os trabalhos falham depois de 3 tentativas. Eles podem ser
     gerados de novo depois.
3. Publicar o site (`git push`, Vercel).

## Testes
- **`visualMaterials.test.ts`:**
  - tokens, especialidade e fallback;
  - validação e comando;
  - HTML;
  - banco: versões, duplicação, fila e par;
  - rotas;
  - geração real com Chromium e PyMuPDF dos 5 formatos e das 5 especialidades;
  - par digital, par A6 e fallback;
  - cor da pegadinha em Cirurgia;
  - texto que não cabe e caractere fora das fontes;
  - comportamento sem gerador.
- **`visualMaterialsScreen.test.tsx`:** a tela (lista, formulário, colar comando, página do material).

## Limites conhecidos
- **Tempo de geração:** em produção, a geração espera a próxima rodada do Cloud Run, que acontece a cada 10 minutos. A
  prévia é imediata.
- **Lote no painel:** a tela cria um material por vez. Lote, com ordem 1, 2, 3…, só pelo comando. Também não existe PDF
  de impressão juntando vários cards numa folha.
- **Sem exclusão:** materiais não são apagados pelo painel; versões e arquivos ficam guardados.
- **Download pela Vercel:** os arquivos passam pelo servidor, e a Vercel limita a resposta a 4,5 MB. Os exemplos de
  validação ficaram bem abaixo disso: PDF de 72 a 96 KB e PNG de 76 a 328 KB. Uma imagem de ilustração muito grande pode
  aumentar o PNG.
- **Caracteres:** setas (→) e letras gregas (α, β) não existem nas fontes do modelo. A prévia e a geração avisam.
