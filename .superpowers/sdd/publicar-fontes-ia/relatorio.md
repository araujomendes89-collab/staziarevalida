# Relatório: dois consertos em publicar-fontes-ia

## Conserto 1: Registro (src/novo/app/admin/auditLog.js)
- Função "Busca de fontes oficiais" (busca_fontes) incluída na lista de IAs, igual à Central.
- Nomes em português para as 6 ações da migração 9610 (site oficial salvo, busca pedida/concluída, candidato editado/aprovado/rejeitado).
- source_domain, source_search e source_candidate entram na lista da Central de Conteúdo (ação sem nome cai em "Outra ação na Central de Conteúdo").
- Resumos em português só com os campos que a 9610 grava (conferidos um a um no SQL).
- registroAdministracao.test.ts: 26/26 (com casos novos para os 6 resumos).

## Conserto 2: busca_fontes não aceita o Gemini (principal nem reserva)
- Banco (9610, ch_worker_ai_save_function): recusa Gemini com a mensagem pedida. É a única função da 9610 que valida a configuração. Migração continua colável duas vezes (create or replace).
- Servidor: server/ai/config.ts (SEARCH_NO_GEMINI em refProblems, vale para salvar, conferência e bloqueio do espaço); server/ai/maestro.ts (configuração antiga já salva com Gemini, principal ou reserva: a função fica "Desligada" com aviso e nunca chama ninguém, nem a reserva); comentário do router.ts atualizado.
- Tela: FunctionEditor.jsx tira o Gemini da lista só na busca de fontes; texto de ajuda atualizado ("Claude e OpenAI").
- provider.ts: comentário em generateWithSearch; código mantido.
- A lógica de "função de busca" já era restrita a busca_fontes (isSearchFunction), então nenhuma outra função mudou.

## Testes (pela fila, --pool=threads --maxWorkers=2): 6 arquivos, 6 passaram, 283 testes
fontesOficiaisIA, fontesOficiaisBanco, aiCentral, aiCentralScreen, centralIasCorrecoes, registroAdministracao.
Provas: Gemini recusado no banco (principal e reserva), no servidor (refProblems, validate, rota PUT 400) e na tela; Claude e OpenAI aceitos; Ollama continua recusado; Gemini salvo por fora fica desligado e não chama IA; colar 2 vezes mantém a mesma função do banco.

## Riscos
- Se o dono já tiver escolhido Gemini para busca_fontes em outro lugar, a função fica desligada até ele trocar (a migração ainda não foi colada, então não há caso hoje).
- Os testes de rotas/telas das Fontes (fontesOficiaisRotas/Telas etc.) não foram rodados nesta passada (fora do escopo pedido).
