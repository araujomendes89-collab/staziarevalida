# Nexus · ElevenLabs somente como TTS

> **Tutor Nexus (2026-10-08) — estado atual; o resto deste documento é, em parte, histórico.**
> - **Professores:** três — **Tranquilo** (id técnico `acolhedor`, com o jeito do antigo Preguiçoso, nunca xinga), **Durona** e **Direto**.
>   Questionador e os demais ficam desligados. Conversas antigas do Acolhedor e de perfis desligados ficam só para leitura
>   ("Este professor mudou. Comece uma conversa nova."). Uma conversa nunca troca de professor.
> - **Tela:** `/tutor` é a Nexus (`src/novo/app/tutor/nexus/`): escolher o professor e o modo, "Começar", conversa em tela cheia (igual no
>   computador e no celular), resumo e histórico. De outras telas, a Nexus abre por cima (`TutorDrawer.jsx`) com o modo travado. O relatório
>   fica em `/analise` (`ReportScreen.jsx`). Saíram a tela antiga (`TutorScreen.jsx`), a voz do aparelho (`useVoice.js`) e os comandos de
>   voz antigos (`voiceCommands.js`).
> - **Jeitos da conversa:** **voz do professor** (ElevenLabs, uma voz por professor, só a versão aprovada no painel), **voz reserva** (a voz ao
>   vivo: Gemini, GPT-Live ou Realtime) e **por escrito**. Rotas: `GET /api/tutor/nexus`, `POST /api/tutor/voice/open` (escolhe o jeito),
>   `POST /api/tutor/voice/say` (o turno pelo motor, com trava de 60 s e `client_turn_id`), `POST /api/tutor/voice/transcribe` (áudio até
>   4 MB e 45 s, só na memória), `POST /api/tutor/speech` (fala um texto já gravado) e `GET /api/tutor/voice/sample/:personality`.
> - **Limites (painel do Tutor):** caracteres da voz do professor por dia (teste e pago; 900 caracteres ≈ 1 minuto), tetos da conta por dia e
>   por mês (dia e mês de Brasília), preço por mil caracteres e por minuto de transcrição. Cada fala reserva os caracteres antes de gerar e
>   devolve se a voz não sair; a voz do professor não gasta o tempo da voz ao vivo.
> - **Aprovação das vozes:** painel "Vozes do Nexus" (`/api/tutor/voices`): ouvir todos os cenários daquela versão da voz nas últimas 24 h;
>   aprovar e revogar só quem está em `TUTOR_VOICE_APPROVERS`; a "Apresentação" aprovada vai para o depósito `tutor-voice-samples` e toca
>   no "Ouvir" do aluno. Mudar a voz, o modelo, o formato, os cenários ou a direção cria uma versão nova (a aprovação cai sozinha).
> - **Variáveis:** novas `TUTOR_VOICE_APPROVERS`, `TUTOR_STT_ALLOW_EXTERNAL` e `TUTOR_STT_MODEL`. Saíram `TUTOR_VOICE_PROVIDER`,
>   `TUTOR_VOICE_MODEL`, `TUTOR_VOICE_DAILY_CHARS`, `TUTOR_VOICE_PRICE_PER_MIN` e `ELEVENLABS_PRICE_PER_MIN` (preços no painel).
> - **Banco:** migrações `20261003005500` a `20261003005800`. Desenho completo: `docs/superpowers/specs/2026-10-07-tutor-nexus-voz-design.md`.

## Situação desta implementação

Atualização de 07/10/2026: o Stazia Tutor expõe somente três professores: **Tranquilo** (com o comportamento pedagógico do antigo Preguiçoso), **Durona** (antigo Durão) e **Direto**. O catálogo ElevenLabs tem somente essas três vozes; quaisquer outros perfis/vozes ficam fora do produto e não são apagados de registros históricos nem da conta do fornecedor. O áudio gerado pela ElevenLabs é apenas a camada de síntese: personalidade, memória, dados, regras pedagógicas, emoção e resposta continuam no StaziaMed. A chave local foi rejeitada em uma única tentativa com HTTP 401; não repetir a chamada até substituir a credencial por uma válida. Não houve aprovação auditiva, liberação aos alunos nem deploy.

Implementado localmente: catálogo de três vozes, mapeamento central no servidor, adaptador TTS, direção de atuação determinística, audição autenticada para administradores, invalidação de aprovação quando a configuração muda e testes sem chamadas pagas. O avatar continua a esfera do Nexus.

## Limite de responsabilidade

Aluno → Stazia Tutor Engine → resposta validada e estado emocional persistido → direção de voz local → ElevenLabs TTS → áudio e esfera.

O motor já existente conserva raciocínio, conhecimento e validação médica, pedagogia, personalidade, memória, humor e autorização de palavrões. A integração não envia ferramentas, histórico completo, prontuário, prompt do tutor ou perfil do aluno como campos adicionais à ElevenLabs, que não decide a resposta. O próprio texto final pode conter informações do caso discutido; revisar consentimento e privacidade antes do uso real.

O `voice_id` vai no caminho do endpoint. O corpo contém somente o texto final, o identificador técnico do modelo, idioma quando suportado e parâmetros de voz. No v3, a direção emocional local é representada por tags de atuação de uma lista fechada. Colchetes existentes no texto são transformados em parênteses para não se tornarem tags arbitrárias. O adaptador não acrescenta palavrões, insultos ou conteúdo médico. Essas decisões continuam nas regras e validações do Stazia.

## 1. Conta Starter acessada; verificar licença e acesso à API

1. A conta do titular foi acessada em <https://elevenlabs.io/app>; o painel mostrou o plano Starter. Não houve contratação por esta implementação.
2. Confirmar na assinatura e nos termos aplicáveis a licença comercial e o acesso de TTS e Voice Design pela API antes de uso real. A documentação oficial informa que o plano gratuito não concede licença comercial.
3. O painel mostrou 40.000 créditos restantes e 0/10 vozes criadas antes das primeiras gerações. O saldo atual não foi reconsultado após as prévias.
4. Definir limite de créditos e alertas. Os testes e o Voice Design também podem consumir créditos. O custo no Stazia é estimativo, pelo preço por mil caracteres do painel do Tutor; preço zero quer dizer não preenchido, não gratuidade.

Fontes: [preços API](https://elevenlabs.io/pricing/api), [licença comercial](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform).

## 2. Chave exclusiva — pendente

No painel da ElevenLabs, abrir as configurações de API Keys e criar uma chave exclusiva, por exemplo `staziamed-nexus-tts-dev`. Aplicar limite de créditos e somente permissões necessárias: TTS para executar o tutor; leitura/edição de vozes e Voice Design durante a criação. Não habilitar ElevenAgents, ferramentas, conhecimento ou recursos de conversação.

Guardar diretamente em `.env.local`, arquivo ignorado pelo Git. Não colar a chave no chat, no código, em logs, em arquivo rastreado, no armazenamento do navegador ou em variável `VITE_*`. Depois da homologação, uma chave separada de produção com acesso mínimo é preferível. Não configurar produção nesta etapa.

Fonte: [gestão e restrição de chaves](https://elevenlabs.io/docs/overview/administration/workspaces/api-keys).

## 3. Variáveis somente do servidor

```dotenv
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_TRANQUILO=
ELEVENLABS_VOICE_DIRETO=
ELEVENLABS_VOICE_DURONA=
ELEVENLABS_VOICE_TRANQUILO=
ELEVENLABS_MODEL_ID=eleven_v3
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
TUTOR_VOICE_ALLOW_EXTERNAL=1
```

Desde 2026-10-08, `TUTOR_VOICE_PROVIDER` não decide mais a voz: a voz do professor é sempre a oficial (uma por professor), e quem libera cada voz para os alunos é a aprovação no painel "Vozes do Nexus", com a lista `TUTOR_VOICE_APPROVERS` do servidor. A integração oficial não usa `ELEVENLABS_VOICE_ID` genérico. O cérebro permanece no StaziaMed (`TUTOR_AI_PROVIDER` e Tutor Engine), dono de personalidade, memória, dados, regras e resposta.

`server/tutor/officialVoices.ts` resolve as variáveis de ambiente de cada voz e calcula a versão de cada uma (`voiceFingerprint`). O ID técnico estável `acolhedor` agora apresenta Tranquilo e carrega o comportamento do antigo `preguicoso`, para não quebrar preferências e sessões; os aliases antigos encaminham para a voz Tranquilo. `durona` usa a voz Durona e `direto` usa Direto. As variáveis antigas `ELEVENLABS_VOICE_DURAO` e `ELEVENLABS_VOICE_PREGUICOSO` continuam aceitas como fallback de migração. Perfis retirados ficam inativos para novos alunos; registros e sessões antigos são preservados.

## 4. Voice Design e escolha — três vozes vinculadas

Os três prompts e roteiros originais estão em `src/shared/tutor/officialVoices.ts`. São descrições de voz, não instruções pedagógicas. Nenhuma voz copia uma pessoa real. Usam português brasileiro padrão, sem imitação regional. A escolha final de gênero/timbre e sotaque deve ser feita ouvindo as prévias; o texto do prompt não garante o resultado.

Não gerar nem salvar outra voz para esta configuração. Tranquilo, Durona e Direto usam seus `voice_id` próprios no servidor. Vozes adicionais eventualmente existentes na conta do fornecedor ficam fora do catálogo StaziaMed. Nenhuma voz foi aprovada para alunos.

Alternativa via API, já preparada no projeto, executada somente por decisão explícita:

```sh
npx tsx scripts/tutor/elevenlabs-design.ts design tranquilo
# Ouvir .data/tutor-voices/tranquilo/previa-*.mp3 e escolher, por exemplo, a opção 2:
npx tsx scripts/tutor/elevenlabs-design.ts save tranquilo 2 --approve-design
```

O script aceita `tranquilo`, `durona` e `direto`, mas **não deve ser executado agora**, pois o titular escolheu reutilizar as vozes existentes. Ele não grava nem imprime a API Key. Não faz repetição automática após erros; o arquivo `.operation.lock` mantém a operação bloqueada até verificar no painel se houve criação/cobrança. Não apagar prévias nem locks sem essa verificação. Salvar o design **não aprova** o uso pelos alunos.

Fontes: [gerar prévias](https://elevenlabs.io/docs/api-reference/text-to-voice/design), [salvar voz escolhida](https://elevenlabs.io/docs/api-reference/text-to-voice/create).

## 5. Teste interno e aprovação

- Entrar com uma conta **administradora do StaziaMed**; o backend verifica o papel, independentemente do que a interface mostra.
- No laboratório `npm run dev:nexus`, acessar `http://127.0.0.1:4173/` e usar o painel de audição. No app completo, o painel fica em Administração → Vozes do Nexus (`/novo/admin?aba=vozes`). A conversa com microfone do laboratório continua usando a API atual da Vercel; não confundir essa conversa com a audição ElevenLabs local.
- Os botões são Tranquilo, Durona e Direto → **Testar voz**. Sem chave ou ID válido, permanecem indisponíveis com a pendência informada.
- Ouvir cada voz nos cinco cenários: apresentação, correção, erro repetido, acerto/recuperação e pronúncia. A rota aceita somente `{personality, scenario}`; não aceita texto livre, humor, prompts ou IDs de voz escolhidos pelo navegador.
- Conferir sotaque pt-BR, ritmo, números, termos médicos, impaciência/ironia, clareza e ausência de insultos. Conferir se a voz lê exatamente o conteúdo esperado; TTS generativo pode produzir diferenças. V3 permite emoção mais expressiva; o comportamento das tags precisa de audição, não apenas teste automatizado. V2 continua disponível para comparar, mas sem tags.
- Usar reprodução nativa se houver bloqueio de autoplay. Falha no preview não gera voz do aparelho nem finge sucesso. A esfera recebe o nível do áudio real.
- A aprovação é feita no painel "Vozes do Nexus": o servidor registra cada audição; com todos os cenários daquela versão ouvidos nas últimas 24 h, quem está em `TUTOR_VOICE_APPROVERS` aprova (a "Apresentação" vai para o depósito `tutor-voice-samples`) ou revoga. Nunca aprovar só porque um teste passou.

Exemplo de registro (substituir somente após aprovação real):

```ts
tranquilo: {
  fingerprint: "hash exibido pelo painel",
  approvedBy: "nome do responsável que ouviu e aprovou",
  approvedAt: "data/hora ISO da aprovação real",
}
```

O fingerprint vincula ID, modelo, formato, velocidade por perfil, roteiro e revisão da direção. Qualquer mudança nesses dados invalida a revisão. Ao alterar o algoritmo de direção, aumentar `VOICE_DIRECTION_REVISION`. A liberação normal exige os três registros válidos. O preview administrativo não exige aprovação justamente para permitir a homologação.

## 6. Segurança e operação

- Endpoint ElevenLabs fixo, sem redirect e sem URL arbitrária no navegador. Somente `/v1/text-to-speech/:voice_id` durante o uso do tutor.
- API Key apenas em `xi-api-key`, montado no servidor. Erros não incluem resposta bruta do fornecedor, chave ou texto médico.
- Timeout, texto limitado a 4.000 caracteres, validação do tipo e tamanho de áudio.
- Preview: autenticação + papel admin, uma geração concorrente por administrador e limite de 12 pedidos/minuto por processo; cache limitado aos roteiros fixos. Para múltiplas instâncias, complementar com limite distribuído e sempre usar a cota da chave ElevenLabs.
- A fala do aluno e o microfone não vão à ElevenLabs: a captura/transcrição continua no fluxo existente. ElevenLabs não é usada como agente de voz.
- A rota de fala já existente busca o texto validado, dono da sessão e personalidade no banco. Preserva os limites e o registro de uso.
- Retenção do fornecedor segue plano/configuração da conta. Não prometer zero retenção: `enable_logging=false` depende de elegibilidade empresarial segundo a documentação.

Fontes: [TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [direção de voz e limitações](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices).

## 7. Antes de qualquer deploy

- [ ] Conta do titular e plano comercial/API confirmados.
- [ ] Chave exclusiva configurada, com quota e permissões mínimas.
- [ ] As três vozes (Tranquilo, Durona, Direto) configuradas com IDs reais no ambiente.
- [ ] Todos os cenários ouvidos e cada voz aprovada explicitamente.
- [ ] Registros de aprovação correspondem ao ambiente de destino.
- [ ] Migração de direção de voz revisada/aplicada no ambiente autorizado; verificar versões duplicadas entre migrações pendentes antes de aplicar.
- [ ] Teste de conversa completa com microfone, respostas do motor, interrupção e esfera no ambiente de homologação.
- [ ] Revisão de custo, privacidade, latência e testes de regressão.
- [ ] Nova autorização explícita para publicar. **Este trabalho não executa deploy.**

## Verificações locais executadas em 07/10/2026

- 47 testes passaram em `tutorOfficialVoices`, `tutorOfficialVoicesPanel`, `tutorScreen`, `tutorRealtimePlayback` e `tutorVoiceLanguage`, com `--pool=threads --maxWorkers=1`. Usam áudio/respostas simulados, não chamadas à ElevenLabs.
- 55 testes do motor em `tutor.test.ts` passaram com `DETERMINISTIC_TUTOR=true`. Sem esse modo, a execução anterior apresentou uma falha na expectativa do humor inicial da Durona (`neutral` versus `impatient`); não foi alterada a lógica emocional para mascarar isso. Revisar o cenário aleatório antes de homologar produção.
- `npm run build` passou, mantendo os avisos de bundles grandes e `crypto` de um serviço de PDF já existente.
- A checagem TypeScript global ainda falha em outras áreas do projeto; a filtragem dos diagnósticos dos novos módulos e testes de vozes não retornou erros.
- O laboratório `/api/nexus-lab/voices` saiu (2026-10-08): a audição e a aprovação ficam em `/api/tutor/voices`, no servidor do Tutor (HTTP 401 sem login, `Cache-Control: no-store`).
- `git diff --check` passou na verificação inicial. Os IDs das três vozes estão configurados localmente; a tentativa única de síntese recebeu HTTP 401 e não foi repetida. Audição real, aprovação e teste integrado com microfone continuam pendentes.
