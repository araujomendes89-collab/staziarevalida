# Radar de Evidências StaziaMed (MVP em modo ensaio)

Estado: script local e lógica testada. Nada foi gravado em banco, nada foi publicado, nenhum conteúdo do aluno foi tocado. A migração está só PROPOSTA em `supabase/propostas/20261003010100_radar_evidencias.sql`.

## O que o radar faz

1. Vigia fontes oficiais (PDF local da biblioteca e URL oficial): hash e data.
2. Detecta mudança: bytes diferentes e texto igual = só metadados (não revalida nada).
3. Mostra EXATAMENTE o que mudou: diff por frase, com página antiga e página nova e o menor trecho alterado.
4. Classifica a referência: `vigente | proposta | revogada | evidencia_complementar | desconhecido`, mais `proibida_samu`. Recomendação de sociedade ou OMS, mesmo recente, nunca vira "norma do SUS" (`norma_sus = false`).
5. Acha as questões, aulas e atualizações que usam a fonte e as marca `revalidar` (fila do revisor).
6. A IA (Gemini pelo Vertex) só lê o diff e explica em português simples. Ela nunca altera gabarito, aula ou questão; toda análise sai com `precisa_revisao_medica = true`.

Regras fixas: gabarito do Inep nunca muda (`gabarito_inep_imutavel`); versão histórica só serve para explicar a prova (`uso_permitido = historico`); protocolos do SAMU são fonte proibida (marcados `proibida_samu`, `uso_permitido = nenhum`, e excluídos das comparações e das consultas na internet); o aluno nunca vê fonte ou código.

## Arquitetura

```
biblioteca local (SQLite, 578 docs, texto por página)          dossies-100.json + ligacao-questoes.json
        |                                                                  |
        v                                                                  v
scripts/radar/vigia.mjs ---- lib.mjs (hash, diff, classificação, mapa fonte->usos; SEM IA, SEM rede)
        |  \--- extrair-pdf.py (PyMuPDF via pdfpython, só quando um PDF online mudou)
        |  \--- Gemini (só se houve mudança; teto de chamadas)
        v
/Volumes/StaziaMed/.tmp-aulas/radar/AAAAMMDD-HHMM/relatorio.{md,json} + estado.json
```

Reaproveitado, não duplicado: a vigilância que já roda na produção (`ch_source_watch`, `ch_source_changes`, `ch_source_diffs`, `ch_vigilance_items`, vigia de 159 fontes, painel de vigilância, dossiês por tema `ch_topic_*`, portão de atualidade `ch_gt_*`, vínculo questão-trecho `question_source_links`). Os tipos de diferença usam os mesmos rótulos de `ch_source_diff_items` (UNCHANGED, EDITORIAL, MINOR_WORDING, NUMERIC, NEGATION, SUBSTANTIVE, REMOVED, ADDED). O que a produção ainda NÃO tem e o radar traz: classificação da referência com `esfera`/`norma_sus`, diff por página/trecho com o texto exato, e o mapa fonte -> usos ligado a "revalidar".

## Parte determinística (lib.mjs, testada)

- `sha256Hex`, `normalizar`, `esqueleto`: comparação sem acento, caixa ou pontuação.
- `compararVersoes`: pareia frases (igual exato, depois melhor semelhança por termos raros), classifica cada par e devolve `{resumo, itens}` com página de cada lado. Números em algarismo e por extenso contam (seis x nove meses); numeração de parágrafo no começo da frase ("6º") não conta; negação só vale em frase curta e parecida (blocos de tabela colados pelo PDF são ruído).
- `classificarReferencia`, `esferaDaFonte`, `ehFonteProibida`: regras conservadoras; na dúvida, `desconhecido`. PCDT aprovado por portaria não vira "proposta" só porque cita a consulta pública do histórico.
- `familiasDeVersoes`, `duplicatasExatas`: edições do mesmo título (volume diferente é outro documento); mesmo sha256 em dois cadastros.
- `decidirMudanca`: igual, metadados_apenas, conteudo_diferente, sem_base, fora_do_ar.
- `montarMapaUsos`/`itensAfetados`: fonte -> temas -> aulas (uma por Grande Tema) e questões válidas (anulada e sem tema ficam de fora; nada inventado). Atualizações entram por `extras.atualizacoesPorTema` quando houver fonte local desses dados.
- `textoDeHtml`, `decodificarBytes`: HTML oficial (latin1, entidades) comparado pelo texto, não pelos bytes.
- Testes: `src/__tests__/radarEvidencias.test.ts` (26).

## Como rodar

```
TMPDIR=/Volumes/StaziaMed/.tmp-aulas node scripts/radar/vigia.mjs \
  --max-remoto 25 --max-pares 3 --max-ia 3 \
  --pares "pcdt-hepatite-b-2023:pcdt-hepatite-b-2026-preliminar"
```
Opções: `--sem-rede`, `--sem-ia`, `--sem-hash-local`, `--modelo`, `--biblioteca`, `--saida`, `--env`. A chave `VERTEX_API_KEY` é lida do `.env` do projeto e nunca é impressa nem gravada. Testes: `TMPDIR=/Volumes/StaziaMed/.tmp-aulas bash ../vaga-de-teste.sh npx vitest run src/__tests__/radarEvidencias.test.ts --pool=threads --maxWorkers=1`.

## Tabelas propostas (não aplicadas)

- `radar_fontes`: uma linha por fonte; campos separados `vigencia_normativa`, `data_edicao`, `ultima_conferencia`, `tema_clinico`, `status_revisao`, mais `referencia`, `esfera`, `norma_sus`, `uso_permitido`; constraint: SAMU nunca tem uso.
- `radar_eventos`: cada mudança, com `resumo`, `itens` (diff por página/trecho), `analise_ia` (constraint exige `precisa_revisao_medica = true`), modelo e custo; liga a `ch_vigilance_items` para cair na fila de auditoria que já existe.
- `radar_afetados`: questão/aula/atualização/flashcard com ação única `revalidar`.
- Funções: `radar_registrar_evento` (só chave de serviço) e `app_admin_radar_pendencias` (equipe). RLS só equipe; aluno e anônimo nunca leem. A migração não toca em `questions`, gabarito nem aulas.
- Não foi executada em nenhum banco (nem em dev): precisa de ensaio em banco de desenvolvimento antes de colar.

## Custo

Modelo `gemini-2.5-flash` (texto, sem raciocínio). Cada análise: cerca de 1.300 tokens de entrada e 1.000 a 1.500 de saída, ou US$ 0,003 a US$ 0,005 por mudança (preço de tabela US$ 0,30/M entrada e US$ 2,50/M saída; estimativa, conferir na fatura do Google Cloud). Sem mudança, custo zero. Teto por rodada: `--max-ia` (padrão 3). Uma rodada diária com 20 mudanças custaria cerca de US$ 0,10.

## Resultado do ensaio de 15/10/2026

Ver `/Volumes/StaziaMed/.tmp-aulas/radar/*/relatorio.md`. Resumo:
- 578 documentos classificados: 266 vigentes, 186 evidência complementar, 79 desconhecidos, 30 revogados/históricos, 12 propostas, 5 SAMU proibidos.
- Integridade: 342 de 342 PDFs locais iguais ao hash do catálogo.
- 8 grupos de duplicatas exatas (mesmo arquivo cadastrado duas vezes), incluindo `cab34-saude-mental-2013` = `cab-34-saude-mental-2013` e os PCDT de AVC e de transmissão vertical.
- Internet: 25 URLs oficiais conferidas; 19 iguais, 4 com texto diferente (portarias compiladas do bvsms, p.ex. Rede Alyne PRT 5350/2024, que ganhou o § 5º; podem ser atualizações reais ou diferenças de moldura do site, precisa de olho humano), 2 falhas de certificado TLS (Inep).
- Versões: HIV adultos M1, Portaria 56/2023 -> edição 2024: 20% das frases iguais, 532 diferenças críticas por regra; a IA resumiu como mudança de redação ("má adesão" -> "não adesão"), nova nota sobre darunavir (não disponível em coformulação, p.47) e renumeração de quadros. Afeta 4 aulas e 36 questões marcadas "revalidar".

## Limites conhecidos

- O diff é lexical: reescrita grande, PDFs com texto colado de tabelas e diferença de diagramação geram ruído (por isso o relatório diz `certeza` e a IA pode responder "nenhuma recomendação clara"). Comparar documentos distintos de títulos parecidos não é diff de versão (o script sinaliza pela porcentagem de trechos em comum).
- PDFs sem camada de texto não são lidos (o radar não faz OCR; sinaliza). 1.432 páginas da biblioteca vieram de OCR de baixa confiança.
- A conferência na internet usa só `url_pdf` do catálogo. Não cobre ainda: Febrasgo via wp-json, páginas-índice (Conitec/PCDT, DOU, gov.br/saude, calendário de vacinação). Essa descoberta de documento NOVO já existe no banco (`ch_index_pages`, 9960); falta o radar ler esses eventos.
- O mapa fonte -> usos vem dos 100 Grandes Temas (aulas e questões ligadas por tema); `question_source_links` (trecho exato por questão) ainda não foi lido, e flashcards e atualizações não têm mapa local. Por isso "revalidar" é por tema, não por trecho.
- Classificação por regras sobre o catálogo; 79 fontes ficam `desconhecido` até alguém conferir.

## Pendências e decisões do dono

1. Aprovar a migração proposta e a ordem: ensaio em banco de dev, depois produção.
2. Frequência da vigia (hoje 30 dias na produção) e quem recebe os alertas.
3. Se o "revalidar" bloqueia a publicação do item (portão) ou só avisa.
4. Quem resolve a fila (os 2 agentes com skill revisor-medico ou revisores humanos) e qual o prazo.
5. Autorizar a leitura de `question_source_links`/`ch_sources` em produção (somente leitura) para trocar o mapa por tema pelo mapa por trecho.
6. Liberar adaptadores para Febrasgo (wp-json), Conitec, DOU e calendário de vacinação.
7. Orçamento mensal do Gemini para a análise (sugestão: teto de US$ 5).
