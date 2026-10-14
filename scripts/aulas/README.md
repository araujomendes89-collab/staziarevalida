# Aulas prontas → Central de Conteúdo

Leva uma aula escrita fora do processamento de documentos (os temas do roteiro, ex.: GR-001) para a Central de Conteúdo,
na fila **Aguardando revisão** de Unidades e revisão. Nada é aprovado nem publicado: isso continua sendo do revisor médico da
área, da revisão editorial e do administrador.

## Passos

1. `node scripts/aulas/gerar-sql-importacao.mjs --pasta aulas-piloto/GR-001 [--catalogo catalogo-v2.json]`
   lê `final-v2/` (se existir), senão `final/`, senão a pasta da aula; confere e grava em
   `~/Downloads/publicacao-staziamed-2026-10-13-aula-gr001/`: `1-Importar-aula.sql` (migração 9950 + a aula),
   `0-CONFERIR.sql`, `LEIA-ME.txt` e `pacote-GR-001.json` (o mesmo pacote, para o botão "Importar aula pronta").
   Problema no pacote = nada é gerado, com a lista do que falta.
2. O dono cola `1-Importar-aula.sql` no editor SQL do Supabase e confere com `0-CONFERIR.sql` (colar de novo não muda nada).
3. Arquivos (imagens e PDF): `npx tsx scripts/aulas/subir-arquivos.mjs --pacote <pacote-GR-001.json> --pasta aulas-piloto/GR-001`
   só simula; `--enviar` só com autorização do dono.
4. O processamento gera sozinho o arquivo final conferido da aula (etapa "render" só da versão importada, sem IA).

## Formato do pacote (`staziamed.aula-pronta.v1`)

```
codigo, titulo, escopo
tema        { area: "CLINICA_MEDICA", subarea: "Infectologia", tema: "Tuberculose" }   ← precisa existir na taxonomia publicada
             (o tema de cada aula do roteiro fica em temas-central.json)
fontes      [{ ref, url, titulo, versao }]           ← achadas na biblioteca pelo endereço oficial normalizado
afirmacoes  [{ id, texto, tipo, fonte (ref), pagina (do PDF), pagina_impressa, citacao (literal),
               leitura: "texto_digital" | "ocr", conferencia: { ok: true, por, em }, tipos_criticos: [] }]
aula        { label, sections: [{ heading, paragraphs: [{ text, clinical, claim_ids: ["TB01"] }] }] }
resumo      { items: [{ text, claim_ids }] }                     (pontos-chave)
flashcards  { cards: [{ front, back, card_id, claim_ids }] }
questoes    { items: [{ number, dimension, stem, options: [{id, text}] ×4, correct, comments: [{id, text}], claim_ids }] }
visuais     { cards?: [{ text, claim_ids }], comandos: [{ modelo, comando, claim_ids }] }
arquivos    [{ caminho: "aulas-prontas/<código>/...", sha256, bytes, tipo, texto_alternativo, material }]
```

## Regras (no banco, em `app_ch_import_lesson_package`)

- Só administrador ou editor.
- Recusa (nada é gravado): tema fora da taxonomia, fonte fora da biblioteca ou substituída, afirmação sem citação literal
  conferida, número da afirmação que não está no trecho, parágrafo clínico sem afirmação, material que cita afirmação fora do
  texto da aula, número dos pontos-chave/flashcards sem sustentação, arquivo sem sha256, imagem sem texto alternativo, e qualquer
  referência no texto do aluno ("[1]", seção "Referências", "Trechos citados").
- Negação ou condição da afirmação ("sem", "não", "apenas"...) que não está no trecho: a evidência entra "insuficiente" (como no
  processamento) com aviso ao revisor; a publicação fica travada até corrigir.
- Afirmações com dose, tempo, via, frequência ou contraindicação (regra do sistema) precisam da conferência do revisor da área.
- O aluno não recebe referência nenhuma da aula importada; fontes e trechos ficam na Central para a equipe e o revisor.
- Mesmo pacote de novo: nada muda. Pacote diferente: atualiza a versão importada ainda não aprovada (as aprovações deixam de
  valer) ou cria versão nova candidata se a anterior já foi aprovada ou publicada.
