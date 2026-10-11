# Podcasts: voz da OpenAI por enquanto — plano

**Spec:** docs/superpowers/specs/2026-10-09-podcasts-openai-design.md

## Global Constraints
- Testes pela fila: bash "/Volumes/Samsung/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/vaga-de-teste.sh" npx vitest run <arquivos> --pool=threads --maxWorkers=1
- Commits em portugues sem acentos, git add com caminhos explicitos, linha final: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- Nunca abrir .env; nunca push; nada publicado sem ordem do dono; nenhuma chamada real a OpenAI/Google (rede simulada).

### Tarefa 1: Voz da OpenAI como padrão e Gemini desligada por variável
Leia a spec (é o requisito), server/podcasts/audio.ts (ttsStatus, geminiKey, geração), server/podcasts/router.ts (escolha da voz) e a
tela de Podcasts em src/novo/app (seletor de voz). TDD: testes primeiro em src/__tests__/podcasts*.test.* (os existentes como
modelo), veja falhar, implemente, veja passar; rode todos os testes de podcasts pela fila e o build:vercel pela fila no fim.
