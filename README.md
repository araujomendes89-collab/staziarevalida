# StaziaMed Revalida

Plataforma de estudo para o Revalida (INEP): questões oficiais, simulados, flashcards com repetição espaçada (FSRS), planejamento, tutor com IA e área administrativa.

## Stack

- **Frontend:** React 19, Vite 6, Tailwind 4, React Router 7
- **Backend:** Express (`server.ts` + `server/`)
- **Dados:** Firebase (Firestore, Storage, Auth, Hosting). Banco: `staziamed-revalida-prod`
- **IA:** SDKs da Anthropic e do Google GenAI
- **Testes:** Vitest (`src/__tests__/`)

## Como rodar

Requer Node.js.

```bash
npm install
cp .env.example .env     # preencha as variáveis; nunca versione o .env
npm run dev              # servidor + frontend, porta 3000 por padrão (PORT)
```

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe o servidor de desenvolvimento |
| `npm run build` | Build do frontend e do servidor em `dist/` |
| `npm start` | Executa o build (`dist/server.cjs`) |
| `npm test` | Roda os testes (Vitest) |
| `npm run lint` | `tsc --noEmit` (hoje reporta erros preexistentes, sobretudo em `src/data/`) |
| `npm run revalida:validate-package` | Valida o pacote exportado pelo motor de extração |
| `npm run revalida:import` | Importa o pacote para o Firestore |
| `npm run revalida:upload-assets` | Envia as imagens das questões |

## Estrutura

```text
src/                     Frontend (components, services, context, data, __tests__)
server/                  Backend por domínio (auth, ai, ocr, editorial, contentEngine, designClone, ...)
server.ts                Entrada do servidor Express
scripts/                 Importação e administração do Firestore
  ops/                   Utilitários operacionais (deploy de regras, smoke test, usuários)
  legacy/                Scripts antigos de carga, mantidos apenas como referência
revalida-reverse-engine/ Motor em Python que extrai e classifica as provas (ver o README dele)
docs/                    Documentação do projeto
firestore.rules          Regras de segurança do Firestore
storage.rules            Regras de segurança do Storage
```

## Documentação (`docs/`)

- `architecture/`: visão geral do sistema (`ORGANOGRAMA_SISTEMA.md`) e integração com o motor de extração.
- `contracts/`: contratos de taxonomia de questões e política de versão do timing.
- `audits/`: auditorias de arquitetura, Firestore, flashcards, FSRS, navegação etc.
- `reports/`: relatórios de cada etapa de implementação e refinamento.
- `testing/`: linha de base de testes e smoke tests de autenticação em produção.

## Pipeline de conteúdo

1. Coloque a prova e o gabarito em PDF em `revalida-reverse-engine/entrada/<edição>/`.
2. Rode `./revalida automate "entrada/<edição>"` dentro de `revalida-reverse-engine/`.
3. Valide e importe com `npm run revalida:validate-package` e `npm run revalida:import`.

Detalhes em `revalida-reverse-engine/README.md`.
