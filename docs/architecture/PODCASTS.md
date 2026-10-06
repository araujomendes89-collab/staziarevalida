# Podcasts (Ana e Bruno) e assistente de IA da aula

Pedido de 2026-10-06: encaixar no painel administrativo o fluxo "administrador envia PDF, DOCX, texto ou link → extração →
trechos → IA escolhe os trechos → roteiro de dois apresentadores → voz com dois locutores → áudio no depósito → publicação",
sem tirar nada do que existe, e criar na "Nova aula" um agente de IA (Gemini, OpenAI ou Claude) para auxiliar.

## 1. Mapeamento do que já existia (nada foi retirado)

| Já existia | Como o podcast se encaixa |
|---|---|
| **Aulas** (`lessons`, `lesson_materials`, depósito privado `lessons`, rotas `/api/lessons`) com o slot "Áudio Flashcast (MP3)" | O episódio pode ser ligado a uma aula, usar a aula como fonte e virar o Flashcast dela ("Usar como Flashcast da aula"). O envio manual de MP3 continua igual. |
| **Central de Conteúdo** (PDF com PyMuPDF/OCR no processamento, provedores de IA `server/contentHub/ai/provider.ts`, autorização `CONTENT_HUB_AI_ALLOW_EXTERNAL`) | Mesma camada de provedores (Claude, Gemini, OpenAI) e a mesma autorização de envio de conteúdo a provedor externo. PDF escaneado (sem texto) é recusado com o aviso de passar pela Central (OCR). |
| **Tutor** (`ai_usage_ledger`, voz do Gemini em `server/tutor/speech.ts`) | O custo do roteiro, da voz e do assistente entra no mesmo livro-caixa (`podcast_script`, `podcast_tts`, `lesson_assist`), sem contar como interação do aluno. |
| **Papéis** (`is_staff`, `assert_staff`, `assert_admin`, `admin_log`) | Equipe (administrador ou editor) monta, revisa e aprova; só o administrador publica e apaga. Tudo no registro da administração. |
| **Tela de Aulas do aluno** | Ganhou a seção "Podcasts" (só episódios publicados). O menu ficou exatamente como o usuário pediu. |

## 2. Fluxo

1. **Episódio** (Administração › Podcasts › Novo episódio): título, tema, área, aula ligada (opcional), duração (3 a 30 min),
   idioma (português do Brasil) e formato (dois apresentadores: Ana, professora; Bruno, estudante avançado).
2. **Fontes**: PDF ou DOCX (até 30 MB; com o Supabase o arquivo vai direto ao depósito "podcasts" por envio assinado), texto
   colado (até 400 mil caracteres), link https (sem rede interna, até 8 MB, no máximo 3 redirecionamentos) ou uma aula (resumo,
   pontos-chave e o PDF complementar). O servidor extrai o texto por página (unpdf; DOCX com mammoth) e divide em trechos de até
   1.200 caracteres, cada um com o documento e a página.
3. **Roteiro**: a IA escolhida recebe só os trechos (no máximo ~120 mil caracteres, os mais ligados ao tema) com a instrução
   "use somente as fontes". Cada fala aponta os trechos usados `[T…]`; o que as fontes não esclarecem vai para "missing" e a fala
   diz isso. O servidor confere: trecho citado tem que existir e número com unidade (dose, corte, prazo) tem que aparecer inteiro
   no trecho citado. Se houver problema, pede uma segunda versão à IA; o que sobrar vira aviso na tela. O roteiro entra **para
   revisão**: a IA nunca aprova.
4. **Revisão humana**: a equipe vê cada fala com os trechos citados (documento, página e o texto do trecho), corrige, tira ou
   acrescenta falas. Editar tira a aprovação e o áudio; a conferência roda de novo no servidor. **Aprovar** exige escrever o que
   foi conferido (mínimo 10 caracteres) e registra quem aprovou e quando.
5. **Áudio** (só de roteiro aprovado): Gemini TTS com as duas vozes na mesma chamada (estilo por fala) ou OpenAI (uma voz por
   fala). O roteiro vai em partes de até ~1.400 caracteres, uma chamada por parte (cabe nos 300 s da função da Vercel); cada parte
   vira MP3 (64 kbps, mono, 24 kHz) e o final junta as partes. Se o roteiro mudar durante a geração, ela para (409).
6. **Publicação**: só o administrador, e só com roteiro aprovado e áudio pronto (também garantido por restrição no banco).
   Despublicar volta para "Áudio pronto".
7. **Aluno**: Aulas › Podcasts mostra os publicados (filtrados pela área escolhida), com o player, a transcrição (Ana e Bruno)
   e as fontes com as páginas usadas. O áudio vem por link assinado de 6 horas.

## 3. Banco (`supabase/migrations/20261003004700_podcasts.sql`)

- Tabelas `podcasts` (status `draft → script_ready → approved → audio_ready → published`), `podcast_sources` e `podcast_chunks`,
  com RLS só de leitura para a equipe; escrita só pelas funções.
- Depósito privado `podcasts` (PDF, DOCX, MP3 e os arquivos de controle da geração em partes).
- Aluno: `app_podcasts(p_area)`, `app_podcast(p_id)` (só publicados).
- Equipe: `app_admin_podcasts`, `app_admin_podcast`, `app_admin_save_podcast`, `app_admin_podcast_remove_source`,
  `app_admin_podcast_save_script`, `app_admin_podcast_approve`; administrador: `app_admin_podcast_publish`, `app_admin_delete_podcast`.
- Servidor (chave de serviço; conferem a equipe pelo usuário com `user_is_staff`, da migração …4600):
  `ch_worker_podcast_add_source`, `_material`, `_set_script`, `_audio_job`, `_set_audio`, `_audio_path`, `_lesson`, `_flashcast`.
- `ai_usage_ledger.feature` aceita `podcast_script`, `podcast_tts` e `lesson_assist`.

## 4. Servidor

`server/podcasts/` — `extract.ts` (PDF, DOCX, HTML, links seguros, trechos), `script.ts` (prompt, esquema, seleção de trechos,
conferência, simulação), `audio.ts` (Gemini e OpenAI, WAV→PCM→MP3, vozes permitidas, custo) e `router.ts` (`/api/podcasts`):

| Rota | Para quê |
|---|---|
| `GET /providers` | IAs do roteiro e vozes prontas no servidor, com o motivo das que faltam |
| `POST /:id/sources/upload` → `/confirm` | PDF/DOCX por envio assinado (Supabase) |
| `POST /:id/sources/file` | PDF/DOCX pelo servidor (banco de desenvolvimento) |
| `POST /:id/sources/text`, `/link`, `/lesson`; `DELETE /:id/sources/:sourceId` | demais fontes; tirar fonte (apaga o arquivo) |
| `POST /:id/script`; `GET /:id/script/check` | gerar roteiro; conferir de novo depois de editar |
| `POST /:id/audio/start`, `/part`, `/finish` | áudio em partes |
| `GET /:id/audio/link`, `/audio/file` | ouvir (aluno: só publicado) |
| `POST /:id/flashcast` | copiar o MP3 aprovado para a aula ligada |
| `DELETE /:id` | apagar episódio e arquivos (administrador) |

## 5. Assistente de IA da "Nova aula"

Em Administração › Aulas › Nova aula (e ao editar), o painel "Assistente de IA da aula" (`LessonAssistant.jsx`):

- **IA**: Gemini, Claude ou OpenAI (as que estiverem prontas no servidor; as outras aparecem com o motivo).
- **Material**: o PDF da aula (o escolhido no formulário ou o já salvo), outro PDF, texto colado ou link. O PDF é lido no próprio
  navegador (texto por página), então não esbarra no limite de 4,5 MB da Vercel.
- **Sugestões**: título, tema, área, "Resumo & racionalidade clínica" e pontos-chave, cada um com as páginas de origem; o que o
  material não esclarece; avisos de número fora do trecho citado. Cada sugestão tem "Usar"; nada muda na aula até a pessoa salvar.
- **Criar podcast desta aula**: cria o episódio ligado à aula, com a aula como fonte, e abre a aba Podcasts nele.
- Rotas: `GET /api/lessons/assist/providers`, `POST /api/lessons/assist` (só equipe; custo em `lesson_assist`).

## 6. Configuração (só no servidor; nada de chave no navegador)

| Variável | Uso |
|---|---|
| `CONTENT_HUB_AI_ALLOW_EXTERNAL=1` | autoriza mandar trechos dos documentos a provedor externo (já ligada na Vercel) |
| `ANTHROPIC_API_KEY` | Claude no roteiro e no assistente (já configurada na Vercel) |
| `OPENAI_API_KEY` + `CONTENT_HUB_OPENAI_MODEL` | OpenAI no roteiro e no assistente (o modelo de texto precisa ser escolhido) |
| `OPENAI_API_KEY` | voz da OpenAI (`PODCAST_TTS_OPENAI_MODEL`, padrão `gpt-4o-mini-tts`) |
| `GEMINI_API_KEY` ou `GOOGLE_GEMINI_API_KEY` | Gemini no roteiro, no assistente e na voz (**ainda não configurada na Vercel nem no `.env` local**) |
| `PODCAST_TTS_GEMINI_MODEL` | modelo de voz do Gemini (padrão `gemini-3.8-flash-tts`) |
| `PODCAST_GEMINI_MODEL`, `PODCAST_ANTHROPIC_MODEL`, `PODCAST_OPENAI_MODEL` | modelo do roteiro por provedor (opcional) |
| `LESSON_ASSIST_<PROVEDOR>_MODEL` | modelo do assistente por provedor (opcional; senão usa o do podcast) |
| `PODCAST_TTS_PRICE_PER_MIN` | preço por minuto de voz para a estimativa de custo (padrão 0,0135 Gemini; 0,015 OpenAI) |
| `PODCASTS_STORAGE_DIR` | pasta dos arquivos no desenvolvimento (padrão `.data/podcasts`) |

`GOOGLE_TTS_API_KEY` também é aceita para a voz do Gemini. Banco vetorial não foi usado: a seleção de trechos é por relevância ao
tema dentro de um limite de tamanho, suficiente para os materiais de uma aula.

## 7. Segurança e confiabilidade

- A IA só vê os trechos; instrução que apareça dentro de um documento é tratada como dado.
- Toda fala de conteúdo cita trechos; número fora do trecho e trecho inexistente viram aviso; a revisão humana é obrigatória
  para gerar áudio; publicar é do administrador; o banco recusa publicar sem aprovação e áudio.
- Links: só https, sem endereço interno (inclusive depois de redirecionar), tamanho limitado.
- Arquivos em depósito privado; aluno só recebe link assinado de episódio publicado.
- Simulação (roteiro e voz sem IA) só fora de produção, para testar o fluxo sem custo.

## 8. Testes

`podcasts.test.ts` (fluxo inteiro com banco de desenvolvimento, IA e voz simuladas, Gemini com rede simulada, permissões,
isolamento), `lessonAssist.test.ts` (assistente), `podcastsTelas.test.tsx` (telas da equipe, do assistente e do aluno).

## 9. Pendências

- Configurar a chave do Gemini no servidor para usar Gemini no roteiro, no assistente e na voz de dois locutores (hoje, com as
  chaves da Vercel, funcionam Claude no roteiro e no assistente; a voz precisa do Gemini ou de `OPENAI_API_KEY`, que existe).
- Para usar OpenAI no texto, definir `CONTENT_HUB_OPENAI_MODEL`.
- Aplicar as migrações …4300 a …4700 no Supabase antes de publicar o código (o depósito "podcasts" é criado pela …4700).
