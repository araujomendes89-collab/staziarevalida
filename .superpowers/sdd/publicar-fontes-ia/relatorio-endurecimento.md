# Endurecimento da busca de fontes com IA (OpenAI e recusas)

Ramo publicar-fontes-ia, a partir do commit eef035b. Sem push, sem chamada real de API (só provedores e `fetch` falsos).

## O que mudou

**Conserto 1 (tempo esgotado da OpenAI com busca)**
- A chamada com busca da OpenAI (`/responses`) passa a usar o mesmo tempo máximo da Claude com busca: 420 s. A constante `SEARCH_TIMEOUT_MS` estava no maestro; foi movida para `server/contentHub/ai/provider.ts` (exportada) e o maestro a importa. Nenhum número novo.
- `AiTimeout` (o erro que o maestro já trata, em português) também foi movido para `provider.ts` e exportado; o maestro o importa.
- Novo `timeoutError` em `server/contentHub/ai/webSearch.ts`: se o limite PRÓPRIO do fetch estourar (`TimeoutError`/`AbortError`) e quem pediu não cancelou, vira `AiTimeout` ("Tempo esgotado (420 s): o pedido foi cancelado."). Vale na chamada de busca e na conversão curta depois da busca (180 s, com o gasto da busca somado por `withUsage`).
- Efeito no maestro: `shouldRetrySame` já devolve falso para "tempo esgotado", então a mesma busca paga não é repetida; o registro grava o pior caso de custo conhecido (e o gasto parcial, no caso da conversão) em vez de US$ 0.
- Como a Claude trata: não tem limite próprio menor, quem corta é o maestro (420 s, `AiTimeout`). Agora a OpenAI com busca fica igual. O cancelamento de quem pediu (maestro) continua virando "Chamada cancelada." e não vira `AiTimeout` dentro do provedor.
- O caminho sem busca da OpenAI continua com 180 s, sem mudança.

**Conserto 2 (recusa na busca)**
- Claude (`stop_reason` "refusal") e OpenAI (parte `refusal` da mensagem) na busca agora lançam `AiRefused` com a frase fixa "O provedor recusou a solicitação." (a categoria, em inglês, fica só no log do servidor, como no caminho sem busca). O gasto parcial (tokens e buscas) entra uma vez só pelo `withUsage` do catch. O maestro não repete a mesma IA e segue para a reserva.

## Arquivos
- server/contentHub/ai/provider.ts (SEARCH_TIMEOUT_MS, FETCH_TIMEOUT_MS exportados, AiTimeout, recusa da Claude na busca)
- server/contentHub/ai/openai.ts (limite da busca, timeoutError, recusa)
- server/contentHub/ai/webSearch.ts (timeoutError)
- server/ai/maestro.ts (importa as duas coisas movidas; sem mudança de comportamento)
- src/__tests__/fontesOficiaisIA.test.ts (testes novos e um ajustado)

## Testes
Novos (7), todos falham sem o conserto e passam com ele:
- Provedores: recusa na busca (Claude e OpenAI) vira AiRefused com gasto parcial e sem repetição; recusa sem busca segue igual; estouro de tempo da OpenAI com busca vira AiTimeout (limite de 420 s verificado), AbortError idem, erro de rede comum não muda; conversão que estoura vira AiTimeout com o gasto da busca, e cancelamento de quem pediu não vira tempo esgotado; sem busca o limite segue 180 s.
- Central (com banco, falsos): OpenAI com busca que estoura é chamada 1 vez só, grava pior caso de custo (> 0) e vai para a reserva; conversão que estoura grava tokens e buscas da busca; recusa na busca (Claude e OpenAI) não repete, vai à reserva e grava o gasto parcial.
- Ajustado: o teste "Claude: recusa e corte..." esperava a categoria no texto; agora espera AiRefused com a frase fixa.

Resultado: fontesOficiaisIA 76/76. Conjunto ligado (28 arquivos existentes, 28 rodaram), 686 testes passaram, pela fila com --pool=threads --maxWorkers=2: todos os arquivos de src/__tests__ que citam contentHub/ai/openai, provider, webSearch ou ai/maestro, mais fontesOficiaisIA, fontesOficiaisBusca, aiCentral e centralIasCorrecoes (inclui recusaVaiParaReserva, tempoEsgotadoCancela, tempoGeminiLimiteNode, reservaDentroDoPrazo, conferenciaOutraEmpresa, contentLabFoundation, podcasts, lessonAssist e outros).

## Riscos
- Mensagem de recusa na busca perdeu o detalhe (categoria / texto da recusa) na tela; fica só a frase fixa, igual ao caminho sem busca (a categoria da Claude segue no log do servidor; o texto da recusa da OpenAI não é mais registrado).
- Quem estoura primeiro, o maestro ou o fetch (ambos 420 s)? Qualquer um dos dois resulta em AiTimeout; só muda se há gasto parcial a somar (o do maestro soma o que o erro levar).
- `tsc --noEmit` do projeto tem erros antigos em server/editorial e server.ts, nenhum nos arquivos alterados.
