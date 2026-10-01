# Integracao do Revalida Reverse Engine

Este projeto agora consegue consumir o pacote exportado pelo diretório
`revalida-reverse-engine/` sem depender de importação manual de JSON avulso.

## Origem esperada

O pacote padrão fica em:

```text
revalida-reverse-engine/data/exports/staziamed_import_ready/v1
```

Também é possível apontar para outro pacote definindo
`REVERSE_ENGINE_PACKAGE_ROOT`.

## O que é validado antes do import

Os scripts de integração validam automaticamente:

- schema do `manifest.json`
- hashes dos arquivos declarados no manifest
- total de questões
- total de questões ativas
- total de assets
- IDs duplicados
- existência de todos os assets referenciados

## Comandos

Validar o pacote sem gravar nada:

```bash
npm run revalida:validate-package
```

Ensaiar o import das questões e edições sem gravar no Firebase:

```bash
npx tsx scripts/import_reverse_engine_parallel.ts --dry-run
```

Ensaiar o upload e vínculo dos assets sem gravar no Firebase:

```bash
npx tsx scripts/upload_reverse_engine_assets.ts --dry-run
```

Importar questões e edições para `questions_v2` e `editions_v2`:

```bash
npm run revalida:import
```

Enviar os assets e vincular imagens nas questões importadas:

```bash
npm run revalida:upload-assets
```

## Colecoes afetadas

- Firestore: `questions_v2`
- Firestore: `editions_v2`
- Storage: `questions-images/revalida-import-v1`

## Observacoes

- O app passou a ler o catálogo ativo a partir de `questions_v2`.
- O diretório `revalida-reverse-engine/` contém um `.git` próprio; isso ainda
  precisa de decisão de versionamento antes de commit do conteúdo inteiro.
