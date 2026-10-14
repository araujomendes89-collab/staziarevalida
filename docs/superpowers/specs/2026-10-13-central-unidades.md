# Central de Conteúdo › Unidades (13/10/2026)

Ferramenta da equipe para aulas como a GR-001. Migrações 9980 (unidades, materiais, ficha, aprovação) e 9981 (anotações do aluno).

## Regras no banco
- Aprovação médica: administrador ou revisor médico da área (decisão do dono). Editor, aluno, visitante e processamento nunca. Grava quem, quando, hash exato da versão, a ficha das decisões e o resumo. Mudança depois derruba a aprovação.
- A conferência de dose, via, tempo e frequência (CC12) passou a aceitar também o administrador.
- Publicar pela tela (`app_ch_unit_publish`): administrador + versão aprovada (médica e editorial, hash atual) + portão de atualidade em ordem (`ch_topic_freshness` = ok), qualquer que seja o modo do portão geral.
- PDF interativo, PDF da A4, card de feed, story e flashcards A6: só equipe (constraint `ch_unit_materials_so_equipe`). O aluno nunca baixa PDF.
- Texto do aluno sem referência (marca de citação, "Referências", "Trechos citados").
- Retirar material não apaga; histórico em `ch_audit` (ações `unit.material.*`, `review.*`, `approve.*`).

## Etapa futura registrada: envio de arquivo de áudio e vídeo
Hoje só por link de player (YouTube sem cookies ou Vimeo), dentro de `iframe` com `sandbox`. Falta: armazenamento protegido com leitura em pedaços (streaming, `Range`) servida só dentro do sistema, sem link direto para o arquivo e sem download; limite de tamanho (a Vercel recusa corpo acima de 4,5 MB, então o envio precisa ser direto ao depósito, como o envio de PDF); legenda em arquivo (.vtt). O formulário já mostra a opção "Arquivo enviado" desligada com essa explicação.

## Fora desta entrega
Tela do aluno (página da aula, Minhas anotações): só o banco (`lesson_notes`, `app_lesson_notes`, `app_lesson_notes_save`).
