/*
 * Política de Privacidade que acompanha o Termo 2.0 (Tutor de voz). AINDA NÃO está em vigor: aparece só quando o banco diz que o
 * Termo vigente é o 2.0 (supabase/ativar/20261003011500_termo_v2.ativar.sql). Decisões do dono e riscos conhecidos em
 * docs/voice-tutor/04-termo-voz.md. Mesma forma de privacidade.js; as seções 1, 3 e 4 mudam, as demais são iguais.
 * "atualizada": trocar pela data do dia da ativação, se for outra.
 */
export const PRIVACIDADE_V2 = {
  "atualizada": "16 de outubro de 2026",
  "blocos": [
    {
      "tipo": "controlador",
      "titulo": "CONTROLADORA DOS DADOS",
      "linhas": [
        "STAZIA TECNOLOGIA E EDUCAÇÃO LTDA - CNPJ 64.964.213/0001-16",
        "Rua Visconde do Rio Branco, 1488, Conj. 909, Andar 09, Centro, Curitiba/PR, CEP 80.420-210.",
        "StaziaMed Revalida é um produto licenciado da Stazia."
      ]
    },
    {
      "tipo": "secao",
      "id": "dados",
      "num": 1,
      "titulo": "Dados tratados",
      "itens": [
        {
          "tipo": "p",
          "texto": "Podemos tratar dados de cadastro e autenticação, perfil, plano, pagamentos, dispositivo, IP, registros de acesso, suporte e dados de aprendizagem, como respostas, desempenho, metas, histórico e interações com o tutor."
        },
        {
          "tipo": "p",
          "texto": "Guardamos também as declarações feitas no aceite do Termo (ter 18 anos ou mais e ser médico ou médica com a graduação em Medicina concluída), com a data, a hora e a versão do Termo, como prova do aceite."
        },
        {
          "tipo": "p",
          "texto": "Quando você usa o microfone do tutor, tratamos o áudio da sua voz e o texto da sua fala (transcrição), como explicado na seção 3."
        }
      ]
    },
    {
      "tipo": "secao",
      "id": "uso",
      "num": 2,
      "titulo": "Como usamos os dados",
      "itens": [
        {
          "tipo": "p",
          "texto": "Usamos os dados para criar e proteger sua conta, prestar o serviço, personalizar estudos, processar pagamentos, atender solicitações, prevenir fraudes, cumprir obrigações legais e melhorar a plataforma. As bases legais incluem execução de contrato, consentimento quando aplicável, obrigação legal e legítimo interesse avaliado nos termos da Lei nº 13.709/2018 - Lei Geral de Proteção de Dados Pessoais (LGPD)."
        }
      ]
    },
    {
      "tipo": "secao",
      "id": "ia",
      "num": 3,
      "titulo": "IA, voz e personalização",
      "itens": [
        {
          "tipo": "p",
          "texto": "Interações com recursos de IA e voz podem ser processadas para responder, sintetizar áudio e adaptar a experiência. Fornecedores de IA recebem somente o necessário para executar a solicitação. Não envie dados reais de pacientes, prontuários ou informações sujeitas a sigilo."
        },
        {
          "tipo": "p",
          "texto": "**Fornecedores dos Tutores de IA.** Anthropic (Claude) escreve as respostas a partir do texto da conversa. Google Cloud (Vertex AI, modelos Gemini) e OpenAI fazem a conversa por voz ao vivo e a transcrição da fala. ElevenLabs gera a voz do professor a partir do texto da resposta e não recebe a sua voz."
        },
        {
          "tipo": "p",
          "texto": "**Áudio da sua voz.** O microfone é opcional. Quando você o liga, o áudio é enviado ao fornecedor só para ser transformado em texto ou respondido na hora. O StaziaMed não grava o áudio, não usa a sua voz para identificar você, não cria cópia da sua voz e não a usa para treinar modelos. A base legal é o seu consentimento, que você pode retirar deixando de usar o microfone ou pedindo pelo suporte."
        },
        {
          "tipo": "p",
          "texto": "**Transcrição.** O texto das falas da conversa por voz pode ficar no histórico da conversa por até 7 dias e depois é apagado automaticamente. As conversas por escrito ficam no histórico enquanto a conta existir."
        },
        {
          "tipo": "p",
          "texto": "**Retenção nos fornecedores.** Cada fornecedor pode manter registros do que recebeu por um período limitado, conforme as próprias regras (por exemplo, para segurança e prevenção de abuso), e alguns processam dados fora do Brasil. A conversa por voz ao vivo com o Google usa o Google Cloud (Vertex AI), serviço profissional pago no qual, segundo as regras do Google, os dados não são usados para treinar modelos sem autorização."
        },
        {
          "tipo": "p",
          "texto": "**Palavrões e humor adulto.** Vêm ligados por padrão (Durona e nível Explosiva) e podem ser desligados a qualquer momento nas preferências do tutor."
        }
      ]
    },
    {
      "tipo": "secao",
      "id": "compartilhamento",
      "num": 4,
      "titulo": "Compartilhamento",
      "itens": [
        {
          "tipo": "p",
          "texto": "Dados podem ser compartilhados com fornecedores de hospedagem, banco de dados, autenticação, pagamentos, análise, suporte, IA e voz, sob obrigações de segurança. Os fornecedores de IA e voz dos tutores estão nomeados na seção 3. Também poderá haver compartilhamento por exigência legal ou proteção de direitos. Alguns fornecedores podem processar dados fora do Brasil com salvaguardas adequadas."
        }
      ]
    },
    {
      "tipo": "secao",
      "id": "retencao",
      "num": 5,
      "titulo": "Retenção e segurança",
      "itens": [
        {
          "tipo": "p",
          "texto": "Mantemos os dados pelo tempo necessário ao serviço e às obrigações legais, fiscais, contratuais e de segurança. Aplicamos controles técnicos e organizacionais, mas nenhum sistema é totalmente imune a incidentes."
        }
      ]
    },
    {
      "tipo": "secao",
      "id": "direitos",
      "num": 6,
      "titulo": "Seus direitos",
      "itens": [
        {
          "tipo": "p",
          "texto": "Nos termos da LGPD, você pode solicitar confirmação, acesso, correção, portabilidade quando aplicável, informação sobre compartilhamento, revisão, oposição, anonimização ou exclusão. A exclusão pode preservar dados que a lei ou a defesa de direitos exijam manter."
        }
      ]
    },
    {
      "tipo": "secao",
      "id": "cookies",
      "num": 7,
      "titulo": "Cookies",
      "itens": [
        {
          "tipo": "p",
          "texto": "Utilizamos armazenamento local, cookies essenciais e tecnologias semelhantes para sessão, segurança, preferências e funcionamento. Cookies não essenciais, quando usados, observarão as escolhas disponíveis ao usuário."
        }
      ]
    },
    {
      "tipo": "secao",
      "id": "alteracoes",
      "num": 8,
      "titulo": "Alterações e contato",
      "itens": [
        {
          "tipo": "p",
          "texto": "Esta Política pode ser atualizada para refletir mudanças legais ou do produto. Solicitações de privacidade podem ser feitas pelos canais de suporte disponibilizados na plataforma. Aplicam-se a LGPD e as demais leis brasileiras."
        }
      ]
    }
  ],
  "rodape": "© 2026 Stazia. StaziaMed Revalida é um produto licenciado da Stazia. Todos os direitos reservados."
};
