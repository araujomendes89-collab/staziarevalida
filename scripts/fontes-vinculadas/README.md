# Fontes vinculadas: gerador do SQL

Transforma uma lista de vínculos (questão → documento oficial → trecho) num arquivo SQL para colar no editor SQL do Supabase.
Precisa da migração `20261003009900_fontes_vinculadas.sql` já colada. Não conecta no banco e não usa chave nenhuma.

## 1. Exporte a lista de fontes do banco

No editor SQL do Supabase, rode (só lê) e baixe o resultado em CSV (ou copie como JSON):

```sql
select id, url, version, title, organ, status, audience, kind, editorial_approved
from public.ch_sources where url is not null order by title, version;
```

## 2. Escreva o arquivo de vínculos (JSON)

```json
[
  {
    "question_code": "REV-2024.1-Q045",
    "conferencia": "confirmada",
    "nota": "Trecho conferido no PDF oficial.",
    "conferido_em": "2026-10-12",
    "vinculos": [
      { "url_fonte": "https://www.gov.br/.../pcdt.pdf", "versao": "2024", "temporal": "vigente", "papel": "conduta",
        "pagina": 34, "rotulo_pagina": "p. 34", "secao": "6.2 Tratamento", "citacao": "trecho literal curto", "ato": "Portaria ..." },
      { "url_fonte": "https://www.gov.br/.../pcdt-2019.pdf", "versao": "2019", "temporal": "historica", "papel": "conduta",
        "pagina": 20, "citacao": "trecho da versão que valia na prova" }
    ]
  },
  { "question_id": "revalida_2023_2_q010", "conferencia": "nao_confirmada", "nota": "Nenhum trecho oficial sustenta a resposta.", "vinculos": [] }
]
```

- `question_code` (ex.: `REV-2024.1-Q045`) **ou** `question_id`.
- `conferencia`: `confirmada` (achou o trecho na versão vigente; precisa de pelo menos um vínculo `vigente`) ou `nao_confirmada`
  (o aluno vê "Fonte não confirmada"; aqui só vale vínculo `historica`). Questão que não aparece no arquivo continua "ainda não conferida".
- `nota` (opcional, até 1000 caracteres) e `conferido_em` (opcional, AAAA-MM-DD; sem ela vale o dia em que o SQL for colado).
- Cada vínculo: `url_fonte` (link da fonte como está no banco), `versao` (opcional; obrigatória se o mesmo link tiver mais de uma
  versão no banco), `temporal` (`vigente` = referência atual; `historica` = versão da época da prova, só histórico),
  `papel` (`diagnostico`, `conduta`, `exame`, `tratamento`, `prevencao`, `conceito`, `outro`), `citacao` (literal, até 400
  caracteres) e a página (`pagina` e/ou `rotulo_pagina`, até 40) ou a `secao` (até 200). `ato` é opcional (até 200).

### Formato do agente Vinculador (também aceito)

`[{ "question_id", "code", "conferencia", "nota", "vinculos": [{ "doc_id", "titulo", "versao", "url_fonte", "temporal", "papel",
"pagina", "rotulo_pagina", "secao", "citacao", "forca", "validado", "divergencia", "observacao" }] }]`

- `question_id` manda; sem ele vale `code` (ou `question_code`). `doc_id` e `titulo` só ajudam a ler o relatório: a fonte é achada
  pelo `url_fonte` normalizado (e pela `versao`).
- `forca`: `forte` ou `media` entram; `fraca` **não entra** (aparece no relatório). `validado: false` também não entra.
- `divergencia: true`: o vínculo entra **"em revisão"**, com a `observacao` como motivo (até 500 caracteres); o aluno não vê até a
  equipe clicar "Confirmar". Numa conferência `confirmada`, a conferência só é gravada se houver referência atual sem divergência.
  Numa conferência `nao_confirmada`, referência atual só entra se tiver divergência (fica para a equipe conferir).
- `nota_atualizacao_proposta` (só na referência atual, até 1000 caracteres): o texto do bloco "O que mudou desde a prova". O vínculo
  entra **"em revisão"** e a nota só aparece ao aluno depois que a equipe clica "Confirmar". O gabarito oficial não muda. O começo
  "O que mudou desde a prova:" é tirado (é o título do bloco na tela).

## 3. Gere o SQL

```bash
node scripts/fontes-vinculadas/gerar-sql.mjs vinculos.json --fontes fontes-do-banco.csv [--saida arquivo.sql] [--em-revisao]
```

- Fonte que não está no banco (pelo link normalizado e, se vier, pela versão), fonte complementar, fonte substituída usada como
  referência atual e vínculo com formato errado: o script **lista** e **não gera** aquele vínculo.
- `--em-revisao`: os vínculos entram "em revisão" e a equipe confirma um a um em Administração › Questões (botão "Confirmar").
- O SQL pode ser colado de novo sem mudar nada. No fim ele mostra `OK: ...` ou `FALTA: ...` (o que não entrou).
- Colar um SQL antigo de novo volta os vínculos dele (inclusive um que a equipe tenha tirado depois).
