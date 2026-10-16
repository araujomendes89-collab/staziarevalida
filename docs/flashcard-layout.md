# Layout padrão dos flashcards em texto (15/10/2026)

Pedido do dono: todos os flashcards seguem o padrão visual dos cartões ilustrados das aulas, mesmo fora do Grande Tema; o cartão criado pelo aluno também ganha o layout e fica só para ele.

## O que é

Componente único: `src/novo/app/review/CartaoFlashcard.jsx` (+ `cartaoFlashcard.css`). Sem imagem, só CSS/JSX.

- Faixa azul-marinho com selos: área; "Essencial"; "Atualizado mm/aaaa"; "Meu cartão" (cada selo só aparece quando existe).
- Título do tema (o `topic` do cartão) e ícone da área (cartão do aluno: caderno).
- Corpo claro: caixa branca com o rótulo PERGUNTA e o texto em fonte condensada (Barlow Condensed); traço na cor do tema; "toque para virar".
- Verso: caixa colorida (escura → principal do tema) com o rótulo RESPOSTA.
- Rodapé azul-marinho com a logo nova (`/brand/horizontal-escuro-320w.png`), como fundo de CSS (decorativa).
- Cor: variáveis `--gt-p/--gt-e/--gt-c/--gt-b` da paleta v2 (tema da atualização, ou área; sem área, a cor padrão). Nenhum código de cor aparece na tela.
- Claro e escuro (o modo escuro troca só o corpo), celular primeiro, mesma proporção do ilustrado (4:5, até 420 px).
- Texto longo (até 2000 na frente e 4000 no verso): a letra diminui por faixas (curto em maiúsculas condensadas; longo na fonte de leitura) e o texto rola dentro do cartão; quando passa da caixa aparece "role o texto para ler tudo". Nada é cortado.
- Acessível: o cartão é um botão (foco visível, espaço/Enter viram, setas e Page Up/Down rolam o texto do lado visível); o lado escondido sai da leitura de tela; a pergunta/resposta visível é a descrição do botão.

## Onde vale

| Tela | Cartão |
|---|---|
| Flashcards (baralho/revisão) | todo cartão sem imagem ilustrada: da plataforma e do próprio aluno (com "Meu cartão"). Cartão com imagem continua com a imagem (sem mudança). |
| Atualizações, aba Flashcards | cor do Grande Tema ligado (slug `...-gr-0XX`) ou da área; "Essencial" quando a prioridade é muito alta (1); "Atualizado mm/aaaa" pela data da conferência médica (ou, sem ela, da última atualização). |
| Novo flashcard (tela Flashcards) | prévia ao vivo ao lado do formulário, com "Meu cartão" e a cor da área escolhida. |
| Criar flashcard da correção | a mesma prévia, recolhida em "Ver como o cartão vai ficar". |

Não mudou: agendamento (FSRS), avaliações, filtros, contagens, fila e o cartão ilustrado.

## Privacidade do cartão do aluno (conferida, banco NÃO alterado)

Lido: `20261003000200_content.sql` (tabela e RLS), `20261003001000_flashcards_api.sql` (funções), `20261003000300_study.sql` (agenda e revisões), `20261003009993_flashcard_ilustrado_no_baralho.sql` e as demais funções que tocam `public.flashcards`. Teste: `src/__tests__/flashcardPrivacidade.test.ts` (todas as migrações no PGlite, RLS valendo).

Confirmado:

- O cartão criado nasce com `owner_id` = o aluno, não publicado e sem revisão; o aluno não consegue criar em nome de outro nem publicar o próprio.
- Outro aluno não vê o cartão na fila (`app_flashcards`), não lê pela tabela, não muda, não apaga e não revisa.
- Visitante sem login não lê cartão nenhum.
- A função das imagens ilustradas nunca devolve cartão pessoal.
- Agenda (`flashcard_states`) e revisões (`flashcard_reviews`) de um aluno não aparecem para outro.
- Cartão da plataforma: `owner_id` nulo e só aparece publicado.
- Administração mostra só a CONTAGEM de cartões de um aluno, não o conteúdo.

Pontos para o dono decidir (não mexi no banco):

1. **Equipe lê o cartão pessoal.** A regra de leitura da tabela é `(owner_id is null and published) or owner_id = auth.uid() or public.is_staff()`. Quem tem papel editor ou admin consegue ler o texto dos cartões pessoais de qualquer aluno por acesso direto à tabela (não aparece em nenhuma tela hoje; a fila da própria equipe não mostra esses cartões). Se a regra for "ninguém mais lê", trocar a regra para tirar `is_staff()` dos cartões com dono (ex.: `(owner_id is null and (published or public.is_staff())) or owner_id = auth.uid()`), numa migração nova, depois de aprovada. Por isso a prévia diz "outros alunos não veem", e não "ninguém vê".
2. **Agenda com cartão alheio (baixo risco).** A regra de inserção em `flashcard_states` só confere o `user_id`; um aluno poderia gravar uma agenda apontando para o id de um cartão que não vê (precisaria adivinhar o identificador aleatório). Não revela conteúdo; a função `app_review_flashcard` já recusa. Opcional: exigir na regra que o cartão seja visível.

## Fora deste trabalho

- Os flashcards em texto dentro da aula do Grande Tema (`TemaAula.jsx`, classe `.al-flip-txt`) continuam com o visual da aula; não foram trocados.
- A fila do baralho não traz o Grande Tema nem a data de cada cartão da plataforma; por isso, no baralho, o cartão da plataforma sem imagem mostra só o selo da área e usa a cor da área (não a do tema). Para "Essencial"/"Atualizado" no baralho seria preciso a função `app_flashcards` devolver esses dados (mudança de banco).
- O protótipo (`src/novo/prototype`) e o componente antigo `Flashcard` do design system ficaram como estavam.
