# Termo de Aceite e Uso obrigatório, cadastro novo e aceite dos Tutores — especificação

Escrito para: o dono do produto (o que vai mudar) e quem for implementar e manter.
Data: 2026-10-07. Estado: desenho aprovado em conversa; aguarda revisão desta especificação.

## 1. O pedido
O dono enviou o **Termo de Aceite e Uso da plataforma StaziaMed Revalida, versão 1.0 (outubro de 2026)**, com 35 seções,
e pediu: **o usuário deve obrigatoriamente aceitar para se cadastrar no aplicativo**. Pediu também o cadastro com:
- Nome completo, E-mail, Telefone/WhatsApp, Senha, Conferir senha, aceite obrigatório do termo;
- ou criar conta com Google, também com o aceite obrigatório;

e a tela **Minha conta** ("Seus dados pessoais e a aparência do app") com Nome completo, e-mail do cadastro e WhatsApp.

O texto do termo deve ir para o app **sem mudar nenhuma palavra**. A cópia fiel está guardada fora do repositório e entra
no repositório na implementação (seção 4).

## 2. Decisões do dono (2026-10-07)
| Assunto | Decisão |
|---|---|
| App antigo (endereço principal sem `/novo`, contas no Firebase) | Levar todos ao app novo. O cadastro do app antigo fecha. Um só lugar com o aceite e uma só prova. Contas que só existem no app antigo precisam criar conta nova no app novo (levar essas contas é outro projeto). |
| Contas que já existem no app novo | Só **alunos** aceitam no próximo acesso. Administrador, editor e revisores ficam dispensados. |
| WhatsApp | Obrigatório. Aceita Brasil e outros países, com código do país (começa em +55). |
| Google sem WhatsApp | O WhatsApp é pedido na primeira entrada, na tela de aceite. |
| Aceite específico dos Tutores (§34) | Sim, antes do primeiro uso (texto e voz). Sem aceitar, o Tutor não abre. |
| Conta apagada | A prova do aceite fica: versão, data e hora e o e-mail em código (não dá para ler, só para conferir). |
| Prova | Caminho A: o banco é a fonte da verdade, gravado só por funções do servidor. Sem guardar endereço de internet (IP). |
| Visual do cadastro | O mesmo da nova tela de login (`src/novo/app/auth/login.css`). |
| Ordem | Central de IAs + 2ª Fase "Em breve" (publicar) → este trabalho → Questões Inéditas → etapas 2 a 5 das IAs. |

## 3. Fora desta etapa
- Levar as contas do app antigo (Firebase) para o app novo.
- Guardar endereço de internet (IP) ou localização no aceite.
- Retirar o aceite do Tutor pela tela (pode vir depois).
- Mostrar WhatsApp e aceites em Administração › Usuários (pode vir depois).
- Trancar no servidor todas as funções do app para aluno sem aceite: o bloqueio do app é a tela de aceite; no servidor,
  só o Tutor é trancado nesta etapa (seção 8).
- Mudar o texto do termo ou da Política de Privacidade (o texto vem do dono; nada é inventado).

## 4. Os documentos e as versões
- **Termo de Aceite e Uso v1.0** (`termo_uso`, versão `1.0`): o texto inteiro, como o dono enviou, num arquivo do
  repositório lido pela página e pela tela de aceite. Identificação no fim do texto: STAZIA TECNOLOGIA E EDUCACAO LTDA,
  CNPJ 64.964.213/0001-16, suporte@staziamed.com.br.
- **Aceite dos Tutores de IA v1.0** (`tutor_ia`, versão `1.0`): a frase do §34, igual ao termo: "Estou ciente de que os
  Tutores do StaziaMed Revalida utilizam Inteligência Artificial e podem cometer erros. Entendo que alguns perfis possuem
  linguagem informal, humor, ironia, cobrança e, quando selecionados por mim, podem utilizar expressões mais intensas ou
  palavrões dentro do contexto educacional." com a caixa "Li e concordo".
- **Política de Privacidade**: a atual, sem mudanças (hoje em `src/components/legal/PrivacyPolicyView.tsx`, do app antigo,
  com a data que ela já tem). O texto é trazido para o app novo como está.
- **Frase de aceite do cadastro** (§33): "Declaro que li e compreendi os Termos de Aceite e Uso e a Política de
  Privacidade do StaziaMed Revalida e concordo com suas condições."
- **Versão vigente num lugar só** (banco, seção 9). Quando sair uma versão nova (ex.: 1.1), troca-se ali e os alunos
  aceitam de novo no próximo acesso.

## 5. Cadastro com e-mail (app novo)
Tela "Criar conta", com o visual da nova tela de login:
1. **Nome completo** — de 2 a 120 caracteres (regra de hoje).
2. **E-mail** — formato de hoje.
3. **WhatsApp** — código do país + número:
   - código do país num seletor que começa em **+55 (Brasil)**, com a lista: Brasil +55, Argentina +54, Bolívia +591,
     Chile +56, Colômbia +57, Cuba +53, Equador +593, Espanha +34, Estados Unidos +1, Paraguai +595, Peru +51,
     Portugal +351, Uruguai +598, Venezuela +58 e "Outro" (a pessoa digita o código);
   - Brasil: DDD (2 dígitos) + número de 8 ou 9 dígitos; outros países: de 6 a 13 dígitos depois do código;
   - guardado no formato internacional, só com o sinal de mais e números (ex.: `+5541999998888`), entre 8 e 15 dígitos;
   - aceita espaços, parênteses e traços na digitação e limpa ao guardar; no Brasil, um zero digitado antes do DDD
     (ex.: 041) é retirado.
4. **Senha** — mínimo de 8 caracteres (regra de hoje).
5. **Conferir senha** — igual à senha.
6. **Caixa obrigatória** com a frase do §33. "Termos de Aceite e Uso" e "Política de Privacidade" são links que abrem o
   documento numa janela por cima (o que foi digitado não se perde) e também existem como página (seção 7).
7. **"Criar conta"** só funciona com tudo válido e a caixa marcada; cada erro aparece no próprio campo.
8. **"Criar conta com Google"** fica nesta tela e só funciona com a caixa marcada (seção 6).
- A frase passiva de hoje ("Ao continuar, você concorda…") sai.
- O aceite é registrado no momento em que a conta nasce, com a data e hora do servidor, mesmo que o Supabase peça
  confirmação do e-mail antes do primeiro acesso.

## 6. Google
- **Pelo cadastro:** a caixa precisa estar marcada para o botão funcionar. O app guarda no próprio navegador que a pessoa
  marcou a caixa (versão e hora). Quando o Google devolve a pessoa, se a conta ainda não tem aceite e esse registro tem
  menos de 30 minutos e é da versão vigente, o aceite é gravado no servidor com a origem `google`. Depois aparece a tela de
  aceite só para pedir o WhatsApp (seção 7).
- **Pela tela de login:** o botão "Continuar com Google" continua para quem já tem conta. Se for uma conta nova (ou um
  aluno sem aceite), a tela de aceite aparece antes de entrar no app.

## 7. Tela de aceite, páginas públicas e Minha conta
**Tela de aceite** (cobre tudo o que não passou pelo cadastro com e-mail):
- Aparece para **aluno** quando falta o aceite da versão vigente do termo **ou** falta o WhatsApp. "Aluno" aqui é quem
  tem o papel `student` **e não tem área de revisão médica** cadastrada (`ch_reviewer_areas`). Não aparece para
  administrador ou editor (papéis `admin` e `editor`) nem para revisor médico. A regra é calculada pelo servidor a cada
  abertura do app: se o papel mudar depois (ex.: um editor volta a ser aluno), a tela passa a valer para a pessoa.
- Mostra: título "Termo de Aceite e Uso", a versão, o texto inteiro para ler (rolagem), o campo WhatsApp quando faltar, a
  caixa com a frase do §33 (quando faltar o aceite), "Aceitar e continuar" (só funciona com tudo preenchido) e "Sair".
- Fica antes de todas as telas do app novo, inclusive as da equipe e as de sessão. As páginas públicas continuam abertas.
- "Sair" encerra a sessão. A conta continua existindo, sem acesso ao app até aceitar.

**Páginas públicas** (abrem com ou sem login):
- `/novo/termos` — o Termo v1.0 inteiro, com a versão e a identificação da empresa.
- `/novo/privacidade` — a Política de Privacidade atual, como está.
- Os links "Termos" e "Privacidade" da tela de login e do cadastro passam a apontar para elas.

**Minha conta** (Conta › Minha conta, "Seus dados pessoais e a aparência do app"):
- Nome completo (editável), E-mail do cadastro (só leitura, como hoje), **WhatsApp** (editável, mesmas regras do
  cadastro), Aparência.
- O resumo da seção no menu da Conta passa a dizer "Nome, e-mail, WhatsApp e aparência".
- Em **Privacidade e dados**: "Termo de Aceite e Uso v1.0 — aceito em dd/mm/aaaa às hh:mm" e "Aceite dos Tutores de
  IA v1.0 — aceito em …" ou "ainda não aceito", com links para as páginas. A exportação dos dados (LGPD) passa a incluir
  os aceites da pessoa.

## 8. Tutores de IA (§34)
- Na primeira vez que o aluno abre o Tutor — pela tela do Tutor (texto ou "Conversar com o Tutor" por voz) ou pelos botões
  que abrem o Tutor em outras telas (correção, caderno de erros, flashcards, temas, desempenho) — aparece um cartão com a
  frase do §34, a caixa "Li e concordo" e "Continuar". Só depois o Tutor começa (nenhuma sessão é criada antes).
- O aceite é gravado com a origem `tutor`. Administrador, editor e revisor médico ficam dispensados (mesma regra de
  "aluno" da seção 7).
- **No servidor:** sem o aceite da versão vigente, as funções do Tutor (começar sessão, turno, voz, sessões antigas)
  recusam com a situação "aceite do Tutor pendente", e a tela mostra o cartão de aceite (não a mensagem de plano pago).

## 9. Dados e regras (migração nova, depois da `…5200`)
- **`profiles.phone`**: texto no formato internacional (`+` e de 8 a 15 dígitos, primeiro dígito de 1 a 9). Pode ficar
  vazio no banco (contas antigas e equipe); a tela de aceite exige para alunos. Gravado pelo cadastro, pela tela de aceite
  e pela Minha conta (função de atualizar o perfil aceita o campo, com a mesma validação).
- **Versões vigentes** numa tabela pequena (`termo_uso` → `1.0`, `tutor_ia` → `1.0`), lida pelas funções do servidor.
- **Tabela de aceites**: documento, versão, data e hora do servidor, origem (`cadastro`, `google`, `tela_aceite`, `tutor`),
  navegador (até 300 caracteres), a pessoa e o e-mail em código (resumo SHA-256 do e-mail em minúsculas, calculado no
  servidor). O código não mostra o e-mail, mas quem já tiver um e-mail consegue conferir se é o mesmo — é para isso que
  ele serve como prova; por isso a tabela só é lida pelo servidor e pela própria pessoa. Um aceite por pessoa, documento e
  versão. A pessoa só lê os próprios; ninguém grava pelo navegador; só
  funções do servidor gravam. Se a conta for apagada, a ligação com a pessoa some e ficam versão, data, origem e o e-mail
  em código.
- **Criação da conta** (gatilho que já cria perfil, papel e período de teste): passa também a guardar o WhatsApp vindo do
  cadastro e, se o cadastro trouxe a versão vigente do termo, a gravar o aceite com origem `cadastro`. Qualquer problema
  nessa parte nova **não pode impedir** a criação da conta (nesse caso, a tela de aceite pede depois).
- **Função de aceite** (chamada pela tela de aceite, pelo retorno do Google e pelo Tutor): exige login; aceita só a versão
  vigente; grava o WhatsApp quando vier (com validação); grava o aceite (repetir não duplica); devolve os dados de
  abertura do app atualizados.
- **Dados de abertura do app** (função que a tela lê ao entrar) passam a trazer, para cada documento: a versão vigente, a
  versão aceita e a data; e se a tela de aceite é obrigatória para a pessoa. A nova versão dessa função parte da última
  existente, sem perder campos.
- **Banco de desenvolvimento**: a mesma migração vale lá; o cadastro de desenvolvimento aceita os campos novos.

## 10. App antigo
- O endereço principal e os endereços do app antigo passam a levar ao app novo. Continuam funcionando como estão: `/novo`
  e tudo abaixo dele, os arquivos do app novo (ex.: `/novo-assets`) e as rotas `/api`.
- `/termos-de-uso` leva a `/novo/termos` e `/politica-de-privacidade` leva a `/novo/privacidade` (inclusive para o link de
  privacidade usado na tela de consentimento do login com Google).
- O código do app antigo continua no repositório, mas o cadastro dele deixa de ser alcançável no site publicado.

## 11. Falhas e mensagens (português do Brasil)
- Campo inválido: mensagem no próprio campo (ex.: "Informe o WhatsApp com DDD.", "As senhas não são iguais.").
- Caixa não marcada: "Para criar a conta, é preciso aceitar o Termo de Aceite e Uso e a Política de Privacidade."
- Versão desatualizada na hora de aceitar (o termo mudou com a tela aberta): a tela recarrega o texto novo e pede o
  aceite de novo.
- Falha de rede ao aceitar: a pessoa continua na tela de aceite, com aviso, e pode tentar de novo.
- Cadastro pelo Google em outro aparelho ou depois de 30 minutos: sem o registro do navegador, a tela de aceite pede a
  caixa do §33 normalmente.
- Conta apagada e criada de novo com o mesmo e-mail: a conta nova aceita de novo; a prova antiga continua guardada.
- Acessibilidade: caixas e campos com rótulo, foco no primeiro erro, texto do termo navegável por teclado e leitor de
  tela, rolagem confortável no celular.

## 12. Testes
- Banco: aceite gravado na criação da conta com a versão vigente; versão errada não grava; o gatilho não falha com dados
  ruins; função de aceite (login, versão, WhatsApp, repetição); dados de abertura com o estado certo para aluno e equipe;
  conta apagada mantém a prova; Tutor recusa sem aceite e libera depois; exportação inclui os aceites.
- Telas: cadastro (cada campo, conferir senha, caixa obrigatória, Google só com a caixa); tela de aceite (aluno sem aceite,
  aluno sem WhatsApp, equipe não vê, "Sair"); páginas públicas sem login; Minha conta com WhatsApp; cartão do Tutor na tela
  e no painel lateral; links de Termos e Privacidade.
- Texto fiel: o arquivo do termo no repositório é igual, palavra por palavra, ao enviado pelo dono.
- Conferência no navegador com servidor temporário isolado (computador e celular).

## 13. Publicação (só com ordem do dono)
1. Supabase: a migração nova (depois da `…5200` da Central de IAs).
2. Site (GitHub → Vercel), com os redirecionamentos do app antigo.
3. Conferir no ar: cadastro com e-mail, cadastro com Google, tela de aceite de um aluno antigo, Tutor.

## 14. Riscos
- Mexer no gatilho de criação de conta afeta todos os cadastros: a parte nova é protegida para nunca impedir a criação.
- O Google cria a conta antes de qualquer tela do app: por isso a tela de aceite existe e tranca o app.
- Confirmação de e-mail ligada no Supabase: não há sessão logo depois do cadastro; o aceite vai junto com a criação da
  conta e é registrado pelo servidor.
- O texto do termo é longo: precisa de rolagem confortável no celular.
- Contas que só existem no app antigo deixam de ter acesso ao app antigo publicado e precisam criar conta nova.
