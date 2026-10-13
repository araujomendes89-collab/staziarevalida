# Carga das explicações: gerador do pacote SQL

Transforma o que os agentes Professor e Auditor escreveram (pasta `revisao-questoes/`) no pacote que o dono cola no editor SQL do
Supabase. Não conecta em banco e não usa chave de IA. Precisa da migração `20261003009920_carga_explicacoes.sql` (vai no pacote como
`1-Estrutura-carga-das-explicacoes.sql`).

```bash
node scripts/carga-explicacoes/gerar-sql.mjs [--pasta <revisao-questoes>] [--saida <pasta do pacote>] [--decisoes <decisoes-divergencias.json>] [--sem-pacote]
```

## O que lê

- `final/<prova>.json` (quando existe, manda): o Professor com as correções do Auditor já aplicadas, o veredito do Auditor e o estado.
- Sem o arquivo final: `prof-NN.json`, `prof-anuladas.json`, `aud-NN.json`, `aud-anuladas.json`. Auditoria mais velha que o arquivo do
  Professor conta como "auditoria antiga" (não entra).
- `corrigidas-todas.json`: a questão como o Professor a leu (gabarito, situação, enunciado e alternativas).

## Onde cada campo vai no banco

| Agente | Banco | Aluno vê |
|---|---|---|
| `explicacao.A..D` | `questions.options[].explanation` | depois do revisor médico |
| `conduta_esperada` | `questions.expected_conduct` | depois do revisor médico |
| `o_que_a_questao_avalia` | `questions.inep_intent` | depois do revisor médico |
| `tema`, `subtema` | `questions.topic`, `questions.subtopic` | na hora (o antigo fica no histórico) |
| `nota_atualizacao` | `question_update_notes` | só aprovada por pessoa, sem repetir a das Fontes vinculadas |
| `aviso_aluno` (anuladas) | não é gravado: a tela usa o texto exato | sim, com as explicações de estudo |
| problemas do Auditor, `pontos_de_atencao`, `precisa_conferir_diretriz`, `divergencia_gabarito`, `confianca` | `questions.comment_review.carga` (só equipe e revisor) | nunca |
| `perfil` | não vai por aqui: `perfis-para-similaridade.json` (ramo similaridade-banco) | nunca |
| `motivo_provavel_anulacao` | não vai ao banco | nunca |

Tema e subtema continuam texto livre. A Taxonomia Médica oficial vai reclassificar depois com ids estáveis (no ramo da similaridade,
`question_profiles.taxonomy_node_id`); o texto de antes de cada questão fica em `question_change_log` (motivo "Carga das explicações …").

## Regras do gerador

- Divergente: fica FORA e vai para `divergencias-para-o-dono.json` (formato da tela de divergências). Só com `--decisoes` e a decisão
  A, B ou C do dono ela entra (sempre em revisão; com B sem a nota de atualização); D fica fora.
- Texto do aluno com aviso interno ("revisão médica", "divergência sinalizada", "nota interna", hipótese da anulação…) ou com a
  estrutura errada ("Correta." fora do gabarito; anulada sem "Defensável."/"Incorreta."): fica fora e aparece no relatório.
- Citação de portaria/lei/nota técnica: entra, mas nunca direto (alerta para o revisor).
- Regra B (arquivo opcional): só Auditor "ok", sem pedido de revisão médica, sem suspeita de gabarito, sem "conferir diretriz", sem nota,
  confiança ≥ 80, sem alerta, fora da prova de gabarito preliminar (2026/2) e sem decisão do dono. O banco confere de novo na hora.

## Saídas

Pacote: `1-Estrutura…`, `2-Prova-NN-<prova>.sql`, `3-OPCIONAL-regra-B-liberar-direto.sql`, `0-CONFERIR.sql`, `LEIA-ME.txt`.
Na pasta de revisão: `carga-explicacoes-relatorio.md`, `divergencias-para-o-dono.json`, `perfis-para-similaridade.json`.
Ensaio do pacote com a carga real das 1.200 questões: `npx tsx .superpowers/sdd/carga-explicacoes/simular.ts <pasta do pacote>`.
