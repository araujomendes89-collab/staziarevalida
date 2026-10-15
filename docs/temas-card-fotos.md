# Fotos realistas nos cartões dos Temas Essenciais: plano

Pedido do dono em 15/10/2026: uma imagem médica fotorrealista por tema, gerada por um modelo de imagens, com direção de arte.
Os itens 1 a 7 foram escritos de manhã, antes da geração começar (registro do levantamento e do plano); o item 0 é a
situação atual.

## 0. Situação em 15/10/2026 (tarde): fotos em uso

- O dono escolheu as fotos realistas no lugar das ilustrações em vidro. As imagens estão sendo geradas pelo Nano Banana
  (modelo `gemini-3-pro-image`, 16:9, 2K) fora do repositório, em `/Volumes/StaziaMed/.tmp-aulas/imagens-temas/img/`, com
  os prompts, o tipo (anatomia em vidro, objeto médico, cena clínica, paisagem de saúde) e o risco médico em `prompts.json`.
  Este ramo **não gera imagem** e não usa nenhuma chave: só converte e associa o que já foi gerado.
- `pdfpython scripts/sincronizar-fotos-temas.py` converte cada PNG para WebP 1280 × 720 (qualidade 80, no máximo 180 KB),
  grava em `public/temas/foto/` e atualiza `src/novo/app/study/fotos-temas.json` (arquivo, tipo, risco médico, estado,
  impressão do PNG, tamanho). Toda foto nova ou trocada entra como **"pendente de revisão médica"**; foto **"aprovada"**
  nunca é sobrescrita; "reprovada" não aparece no cartão. Ninguém aprova pelo script: a aprovação é trocar o estado no
  manifesto depois da revisão humana (até existir a tabela do item 3).
- O cartão só mostra foto de tema que está no manifesto. Tema ainda sem foto: cartão limpo, sem ilustração.
- Temas de **risco médico alto** (revisão humana obrigatória antes de liberar a alunos de verdade): GR-032, 033, 036, 038,
  043, 049, 050, 051, 056, 061 e 076.

## 1. Levantamento da manhã (conferido no código e neste computador)

| Caminho | Gera foto? | Gasta crédito? | Observação |
|---|---|---|---|
| Modelos de imagem do Google pelo Vertex (`gemini-3-pro-image`, `gemini-3.1-flash-image`, `gemini-2.5-flash-image`, listados em `server/ai/models.ts`) | sim | **sim, usa a chave do sistema** (`VERTEX_API_KEY`) | nenhuma tela ou rota do sistema chama esses modelos para gerar imagem hoje; o Imagen está fora da lista da Central de IAs |
| Materiais visuais da Central (`server/contentHub/visual/render.ts`) | não | não | monta cartões e A4 a partir de HTML no Chromium; não faz foto |
| Ollama neste Mac (`qwen2.5-coder:7b`, `qwen3:8b`, `qwen3-vl:8b-instruct`) | não | não | o `qwen3-vl` **enxerga** imagem: serve para a auditoria estética local, sem custo |
| Python do ambiente de PDF (torch 2.14 com aceleração Apple) | não hoje | não | gerar no próprio Mac pediria instalar a biblioteca de difusão e baixar um modelo de 7 a 24 GB; há 7,5 GB livres no SSD e 2,5 GB no disco interno |
| Ferramentas externas (Figma, Lovable) | sim | sim (crédito da conta) | fora da regra desta etapa |

**Conclusão:** hoje não há caminho que gere foto sem gastar crédito. A escolha fica com o dono (item 7).

## 2. O caminho de cada foto

tema → conceito visual → prompt → geração → auditoria estética → coerência médica → otimização → armazenamento → associação

1. **Conceito visual** (diretor de arte): o que mostrar, o enquadramento (varia por tema: órgão em close, corte anatômico,
   cena clínica, objeto) e a cor dominante (a família de cor da área do tema, escrita em palavras, nunca em código).
2. **Prompt**: modelo do item 4, preenchido pelo conceito. Fica gravado, junto com o prompt de restrições e a semente.
3. **Geração**: 2 a 3 tentativas por tema, 16:9, 1600 × 900 ou maior. Registro: modelo, data, custo de cada tentativa.
4. **Auditoria estética** (automática e local, sem custo: `qwen3-vl` + conferências de arquivo): sem texto, letra, logotipo,
   marca d'água ou interface; assunto no lado direito; metade esquerda limpa; nitidez; sem sangue explícito; sem rosto
   identificável; proporção 16:9. Resultado: "estética aprovada" ou "estética reprovada (motivo)".
5. **Coerência médica**: lista de pontos de dúvida por tema (item 4). Uma IA de outra empresa pode apontar suspeitas, mas a
   decisão é de um revisor humano. **Separado da estética:** uma foto bonita pode estar errada. A tela nunca diz "validado
   por médico" sem o nome e a data do revisor na ficha; sem isso, o estado é "aguardando revisão humana".
6. **Otimização**: WebP (qualidade ~80) e AVIF, 1600 e 800 px de largura, corte 16:9, foco horizontal anotado (0 a 100).
7. **Armazenamento** e **associação**: itens 3 e 5.

## 3. Banco e armazenamento (proposta; SQL NÃO aplicado)

Tabela `tema_fotos` (uma linha por versão):

| Campo | Para quê |
|---|---|
| `id`, `tema_id`, `versao` | qual tema e qual versão |
| `estado` | `rascunho`, `auditada`, `pendente_revisao_medica`, `aprovada`, `reprovada`, `substituida` (padrão do diretor de arte) |
| `conceito`, `enquadramento` | direção de arte |
| `modelo`, `prompt`, `prompt_restricoes`, `semente`, `custo_usd`, `gerada_em`, `gerada_por` | registro da geração (ou `origem = 'envio_manual'` quando a equipe sobe a imagem) |
| `auditoria_estetica` (jsonb) | o que a auditoria conferiu e o resultado |
| `duvida_clinica` (texto) | o que precisa de olhar humano |
| `revisao` (jsonb) | revisor, data, decisão e observação (só humano) |
| `arquivo_webp`, `arquivo_avif`, `largura`, `altura`, `foco` | arquivos prontos |
| `sintetica`, `licenca` (jsonb) | imagem gerada é sempre marcada como sintética; imagem da internet só com autor, licença (CC BY, CC BY-SA, CC0 ou domínio público) e endereço registrados |
| `ativa` | a que aparece ao aluno |

Regras no banco:
- só uma foto ativa por tema; só pode ficar ativa a que está `aprovada`;
- trocar a ativa só acontece quando a nova já está `aprovada`: **uma foto aprovada nunca é trocada por uma não validada**;
- a antiga vira `substituida` (fica guardada para voltar atrás);
- o aluno não lê a tabela. A função `app_grandes_temas` passa a devolver, em cada tema, só `foto: { webp, avif, foco }`
  da ativa (ou nada).

Armazenamento: depósito privado `temas-fotos-rascunho` (equipe vê tudo) e depósito `temas-fotos` só com os arquivos
aprovados (nome com código único, cache longo). Assim, nada que não foi aprovado chega perto do aluno.

Administração (só equipe, nunca o aluno): na Central de Conteúdo, por tema: versões lado a lado, resultado da estética,
dúvida clínica, aprovar, reprovar, subir uma imagem própria e trocar a ativa.

## 4. Direção de arte

Regras para todas:
- 16:9; assunto ocupando o terço direito (60 % a 95 % da largura); metade esquerda vazia, fundo claro branco-azulado,
  para o texto e o degradê do cartão;
- luz suave de estúdio, profundidade de campo rasa, aparência de fotografia médica editorial ou de renderização anatômica
  realista;
- cor dominante da área (Clínica Médica verde-azulado, Cirurgia azul-petróleo, Ginecologia e Obstetrícia coral suave,
  Pediatria azul, Medicina de Família índigo, Saúde Coletiva rosa-ameixa, Saúde Mental violeta);
- nunca: texto, números, letras, logotipo, marca d'água, interface, sangue explícito, ferida aberta, rosto identificável,
  criança em sofrimento, símbolos oficiais (SUS, ministérios), marcas de equipamento.

Restrições comuns (vão junto de todo prompt): "sem texto, sem letras, sem logotipos, sem marca d'água, sem interface, sem
moldura, sem sangue, sem rosto reconhecível, sem símbolos oficiais, sem deformações de mãos, dedos ou equipamentos, sem
aparência de desenho animado ou plástico".
Estilo: fotorrealismo editorial (câmera profissional, luz natural ou cinematográfica suave, profundidade de campo); para
órgãos, visualização anatômica em vidro translúcido, no padrão dos desenhos já aprovados. Enquadramento sempre variado.

Prompts-modelo dos 5 exemplos do dono:

1. **Tuberculose pulmonar** (close anatômico; alternativa: médica avaliando uma radiografia de tórax em negatoscópio)
   "Renderização médica fotorrealista de pulmões humanos translúcidos com traqueia e árvore brônquica, pequenas áreas
   rosadas de inflamação no ápice do pulmão direito, tons verde-azulados e brancos, fundo claro branco-azulado, luz suave
   de estúdio, assunto no lado direito, metade esquerda vazia, 16:9."
   Dúvida clínica a conferir: lesão em ápice/segmento posterior (padrão de reativação); não sugerir câncer nem derrame.
2. **Apendicite aguda** (região ileocecal em vidro)
   "Visualização médica fotorrealista da região ileocecal e do intestino grosso em vista frontal com o apêndice no ceco, na fossa ilíaca direita,
   levemente inflamado e avermelhado, intestino delgado translúcido ao redor, tons azul-petróleo suaves, fundo claro,
   assunto à direita, esquerda vazia, 16:9."
   Dúvida clínica: lado do apêndice (direito do paciente, que aparece à esquerda de quem olha em vista frontal); ceco e
   íleo terminal no lugar certo.
3. **Assistência ao pré-natal** (cena de consulta)
   "Fotografia editorial de uma consulta obstétrica moderna com luz natural: gestante no terceiro trimestre sentada, de
   perfil, rosto pouco visível, profissional com estetoscópio de Pinard ou sonar (doppler) sobre a barriga, consultório
   claro e desfocado ao fundo, tons coral suaves, assunto à direita, esquerda vazia, 16:9."
   Dúvida clínica: posição e uso do sonar/Pinard; evitar fita métrica ou telas com números (texto).
4. **Reanimação neonatal na sala de parto** (cena clínica, cuidado redobrado)
   "Fotografia médica realista em sala de parto: recém-nascido em berço de calor radiante sob luz suave, mãos enluvadas da equipe
   segurando uma máscara de ventilação neonatal transparente sobre boca e nariz, bolsa de ventilação azul, pescoço em
   posição neutra, ambiente limpo, tons azuis suaves, assunto à direita, esquerda vazia, 16:9."
   Dúvida clínica: máscara do tamanho certo cobrindo boca e nariz sem tocar os olhos; cabeça em posição neutra (sem
   hiperextensão); sem sinais de sofrimento exagerado. **Revisão humana obrigatória.**
5. **Estratégia Saúde da Família e territorialização** (visita domiciliar)
   "Fotografia editorial de uma visita domiciliar em comunidade brasileira: agente comunitária de saúde com prancheta,
   colete claro sem inscrições, conversando na porta de uma casa simples e bem cuidada, luz de fim de tarde, pessoas sem
   rosto em destaque, sem estereótipos, tons índigo e lavanda suaves, assunto à direita, esquerda vazia, 16:9."
   Dúvida clínica: nenhuma; conferir ausência de logotipos e de textos em placas e roupas.

Cada imagem gerada recebe o parecer no formato do diretor de arte:

```
Tema: <nome>  |  Conceito visual: ...
Prompt: ...  |  Modelo/custo/data: ...
Auditoria estética: aprovada | ajustes | rejeitada (motivos)
Coerência médica: ok | dúvida (qual) -> precisa de revisão humana
Estado: rascunho | auditada | pendente de revisão médica | aprovada
```

Arquivos grandes de trabalho (tentativas, originais) ficam em `/Volumes/StaziaMed/.tmp-aulas/`, nunca no disco interno.

## 5. Custo estimado (a confirmar na página de preços no dia da decisão)

- Volume: 100 temas × até 3 tentativas = até 300 imagens.
- Preço por imagem dos modelos de imagem do Google: de cerca de US$ 0,02 (modelos rápidos) a cerca de US$ 0,14 (modelos
  "pro"), conforme o modelo e a resolução. **Estimativa, não conferida hoje.**
- Total estimado: de cerca de US$ 6 a US$ 42 para os 100 temas. Auditoria estética local e conferências por agentes do
  Claude Code: sem custo de chave.

## 6. O que já está pronto no cartão

- Foto à direita a partir do manifesto (`fotosTemas.js`), `<img>` WebP com carregamento preguiçoso, decorativa (texto
  alternativo vazio), sem arrastar.
- Esmaecimento só por CSS: máscara que some para a esquerda e para baixo; no claro a foto se funde ao branco do cartão; com a
  barra de progresso, a foto termina antes da linha do "% concluído".
- Escuro: anatomia em vidro com a luz invertida e a cor preservada (o fundo claro some); cenas, objetos e paisagens mais
  escuras e esmaecidas.
- Se a foto não carregar, o cartão fica limpo. Endereço fora de `/temas/foto/GR-xxx.webp` é ignorado.
- Testes: `src/__tests__/temasCartaoFotos.test.tsx` (cartão com e sem foto, falha da foto, manifesto real: arquivo existe,
  é WebP, até 180 KB, estado e risco válidos, nenhum WebP solto).

## 7. O que o dono precisa decidir ou liberar

1. **De onde vem a geração** (a regra atual impede todas as pagas):
   a) uma chave separada só para imagens, com teto de gasto, fora das chaves do sistema; ou
   b) uma exceção pontual com teto (ex.: até US$ 20) usando o Vertex; ou
   c) gerar neste Mac sem custo de chave: liberar a instalação da biblioteca de difusão e uns 15 a 25 GB de disco
      (qualidade abaixo dos modelos do Google, mais lento); ou
   d) imagens de banco de imagens com licença, sem geração.
2. Qual modelo e qual teto de gasto.
3. Quem faz a revisão humana da coerência médica (obrigatória em Reanimação neonatal e em cenas com pessoas).
4. Liberar o SQL da tabela e do depósito (vai como migração nova, colada pelo dono, só quando for a hora).
5. Se a foto substitui o desenho quando existir (proposta) ou se os dois convivem (por exemplo, desenho no celular).
