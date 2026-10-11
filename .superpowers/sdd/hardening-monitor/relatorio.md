# Endurecimento do monitor de fontes (ramo hardening-monitor, partida 8d3b517)

## O que mudou
O monitor de fontes (`checkSources` em `server/contentHub/worker.ts`) deixou de usar `fetch(url, { redirect: "follow" })` e
`arrayBuffer()` sem limite. Agora usa o mesmo downloader das Fontes oficiais (`fetchBytes` de `server/podcasts/extract.ts`),
sem a lista de sites oficiais (só as proteções de rede):

1. Endereço interno/privado/loopback/link-local bloqueado (IPv4 e IPv6, incluindo IPv4 mapeado em IPv6, decimal, hexa, octal,
   `localhost`, `*.local`, `*.internal`), pela função `privateAddress` que já existia (nenhuma checagem de IP duplicada).
2. Cada redirecionamento (máx. 3) é conferido de novo: só https, porta 443, sem usuário e senha (`linkProblem`, já existente).
3. Conexão ao IP já conferido (`pinnedFetch`, anti DNS rebinding), usado automaticamente quando o fetch é o real.
4. Corpo limitado a 50 MB (`OFFICIAL_FETCH.maxBytes`) e 30 s para tudo (saltos + corpo, como antes).
5. Corpo lido em pedaços e cortado ao passar do limite (também se o servidor não declara o tamanho).

Endereço bloqueado/lento/grande vira `unreachable` com log em português (ex.: `[central] fonte inacessível (https://127.0.0.1/x): Endereço interno não é aceito.`)
e o laço segue para os outros endereços.

## Mudanças pequenas no código compartilhado (`server/podcasts/extract.ts`)
Duas opções novas e opcionais em `FetchBytesOptions`; sem elas o comportamento é idêntico ao anterior:
- `acceptAnyType`: o monitor aceita qualquer tipo de conteúdo (como antes; o downloader oficial só aceita PDF/HTML/texto).
- `statusMessage`: o monitor mantém a mensagem de log `HTTP 404` (o downloader oficial diz "O link respondeu 404.").

## Opções só de teste em `WorkerOptions`
`resolver` e `checkHost` (no uso real nunca são informados). Os 3 testes existentes que usam `fetchImpl` falso com
`https://exemplo.invalid/...` passaram a informar `resolver` falso (senão o DNS real seria consultado).

## Arquivos
- server/contentHub/worker.ts
- server/podcasts/extract.ts
- src/__tests__/monitorFontesRede.test.ts (novo, 46 testes)
- src/__tests__/contentHubPipeline.test.ts, sourceDiff.test.ts, sqieClosing.test.ts (só passam `resolver` falso)

## Testes
Pela fila, `--pool=threads --maxWorkers=2`, 16 arquivos (os que citam worker/officialDomains/extract/verify/search + o novo; 16 existem, 16 rodaram):
16 arquivos passaram, 397 testes passaram. `npx tsc --noEmit`: nenhum erro nos arquivos alterados (o projeto tem erros antigos em outros arquivos, principalmente `src/data`).
Cobertos: https normal (hash e snapshot iguais aos de antes, HTML e PDF, tipo json), HTTP 404 mantém a mensagem; recusados 127.0.0.1, [::1],
169.254.169.254, 10.0.0.5, [::ffff:169.254.169.254], [::ffff:a9fe:a9fe], 2130706433, 0x7f000001, 0177.0.0.1, 127.1, 192.168.x, 172.16.x,
fd00::, fe80::, localhost, *.internal, http://, porta 8443, usuário:senha (nenhuma requisição feita); nome que resolve para IP interno;
redirecionamento para host interno/http/porta/usuário/nome interno recusado (destino nunca buscado); 3 redirecionamentos passam, 4 recusados;
corpo sem tamanho declarado cortado em 50 MB (leu menos de 60 pedaços de 1 MB de 500) e tamanho declarado de 60 MB recusado; endereço ruim
não impede os outros da rodada.

## Riscos / observações
- Em produção o monitor agora envia `User-Agent: StaziaMed-Fontes/1.0` e um `Accept` de HTML/PDF (antes: padrão do fetch do Node). Um site que
  trate o cabeçalho de outro jeito pode responder diferente; é o mesmo que as Fontes oficiais já enviam.
- A conexão real passa por `https.request` (`pinnedFetch`), como nas Fontes oficiais, não pelo `fetch` do Node: proxy de ambiente (HTTP(S)_PROXY) não é usado; o Cloud Run não usa.
- Um redirecionamento 3xx sem `Location` agora dá "O link redireciona para lugar nenhum." (antes o fetch devolvia a resposta e dava HTTP 3xx).
- O teste do "pinning" real (conexão ao IP conferido) não foi repetido aqui: já é coberto por `fontesOficiaisRede.test.ts`, que continua passando.

## NÃO foi feito
Nada de push, de Supabase/GCP/Vercel, migrações ou funções novas. Não foi rodada a suíte inteira nem teste com rede real.
