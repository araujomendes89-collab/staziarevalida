import React, { useEffect, useState } from "react";
import { ArrowLeft, Shield, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const PRIVACY_SECTIONS = [
  { id: "finalidade", num: 1, title: "Finalidade" },
  { id: "dados-que-podem-ser-tratados", num: 2, title: "Dados que Podem Ser Tratados" },
  { id: "dados-relacionados-a-inteligencia-artificial", num: 3, title: "Dados Relacionados a Inteligência Artificial" },
  { id: "dados-de-pacientes-e-dados-sensiveis", num: 4, title: "Dados de Pacientes e Dados Sensíveis" },
  { id: "como-os-dados-sao-coletados", num: 5, title: "Como os Dados São Coletados" },
  { id: "como-utilizamos-os-dados", num: 6, title: "Como Utilizamos os Dados" },
  { id: "bases-legais-para-o-tratamento", num: 7, title: "Bases Legais para o Tratamento" },
  { id: "personalizacao-e-decisoes-automatizadas", num: 8, title: "Personalização e Decisões Automatizadas" },
  { id: "cookies-e-tecnologias-semelhantes", num: 9, title: "Cookies e Tecnologias Semelhantes" },
  { id: "compartilhamento-de-dados", num: 10, title: "Compartilhamento de Dados" },
  { id: "transferencia-internacional-de-dados", num: 11, title: "Transferência Internacional de Dados" },
  { id: "armazenamento-e-retencao", num: 12, title: "Armazenamento e Retenção" },
  { id: "seguranca", num: 13, title: "Segurança" },
  { id: "direitos-do-titular", num: 14, title: "Direitos do Titular" },
  { id: "exclusao-da-conta", num: 15, title: "Exclusão da Conta" },
  { id: "dados-anonimizados-e-estatisticas", num: 16, title: "Dados Anonimizados e Estatísticas" },
  { id: "comunicacoes", num: 17, title: "Comunicações" },
  { id: "criancas-e-adolescentes", num: 18, title: "Crianças e Adolescentes" },
  { id: "canal-de-privacidade", num: 19, title: "Canal de Privacidade" },
  { id: "alteracoes-desta-politica", num: 20, title: "Alterações desta Política" },
  { id: "legislacao-aplicavel", num: 21, title: "Legislação Aplicável" },
];

export const PrivacyPolicyView: React.FC = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<string>("finalidade");

  useEffect(() => {
    window.scrollTo(0, 0);

    const handleScroll = () => {
      const scrollPos = window.scrollY + 160;
      for (const section of PRIVACY_SECTIONS) {
        const el = document.getElementById(section.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleExit = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen w-full font-sans bg-[#F8FAFC] text-slate-800 selection:bg-teal-500/20 selection:text-teal-900 transition-colors duration-200">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 border-b border-slate-200/90 backdrop-blur-md px-4 sm:px-8 py-3.5 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Left: Sair & Logo */}
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              type="button"
              onClick={handleExit}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-[#0A1C3E] flex items-center gap-2 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              aria-label="Sair da página jurídica"
            >
              <ArrowLeft className="w-4 h-4 text-slate-600" />
              <span>Sair</span>
            </button>

            <div className="flex items-center">
              <img
                src="/brand/horizontal-480w.png"
                alt="StaziaMed Revalida"
                className="h-8 sm:h-9 w-auto object-contain"
                loading="eager"
              />
            </div>
          </div>

          {/* Right: Quick Link to Terms of Use */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              id="btn-switch-to-terms"
              onClick={() => navigate("/termos-de-uso")}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-teal-50/60 border border-slate-200 text-slate-700 hover:text-teal-900 flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <FileText className="w-3.5 h-3.5 text-teal-600" />
              <span className="hidden sm:inline">Termos de Uso</span>
              <span className="sm:hidden">Termos</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Document Layout */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Sticky Table of Contents (Desktop Only) */}
          <aside className="hidden lg:block lg:col-span-4">
            <div className="sticky top-24 p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
              <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-200">
                <Shield className="w-4 h-4 text-[#00D2B4]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#0A1C3E]">
                  Sumário da Política
                </h2>
              </div>
              <nav className="space-y-1 max-h-[calc(100vh-220px)] overflow-y-auto pr-1 text-xs">
                {PRIVACY_SECTIONS.map((sec) => {
                  const isActive = activeSection === sec.id;
                  return (
                    <a
                      key={sec.id}
                      href={`#${sec.id}`}
                      className={`block py-1.5 px-2.5 rounded-lg transition-colors leading-snug ${
                        isActive
                          ? "bg-teal-50 text-teal-900 font-bold border-l-2 border-[#00D2B4]"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-[10px] opacity-60 mr-1.5">{sec.num}.</span>
                      {sec.title}
                    </a>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Legal Document Content Body (Max reading width 800-900px) */}
          <main className="lg:col-span-8 space-y-8 max-w-3xl">
            {/* Document Header Box */}
            <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/90 shadow-xs">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00D2B4]/10 text-[#00A896] text-[11px] font-bold tracking-wide uppercase mb-3">
                <Shield className="w-3.5 h-3.5" />
                Documento Oficial de Privacidade
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#0A1C3E]">
                POLÍTICA DE PRIVACIDADE
              </h1>

              <p className="text-sm sm:text-base font-semibold mt-1.5 text-[#00A896]">
                STAZIAMED REVALIDA
              </p>

              <div className="mt-4 pt-4 border-t border-slate-200 text-xs flex flex-wrap items-center gap-y-2 gap-x-6 text-slate-500">
                <div>
                  <span className="font-semibold text-slate-700">
                    Última atualização:
                  </span>{" "}
                  04 de setembro de 2026
                </div>
                <div>
                  <span className="font-semibold text-slate-700">
                    Versão:
                  </span>{" "}
                  Vigente a partir de 04/09/2026
                </div>
              </div>

              {/* Informações do Controlador */}
              <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1.5 leading-relaxed text-slate-700">
                <div className="font-bold text-[#0A1C3E] tracking-wide uppercase text-[10.5px]">
                  INFORMAÇÕES DO CONTROLADOR
                </div>
                <div>
                  <strong>Razão Social:</strong> 5C CONSULTORIA EM GESTÃO E DESENVOLVIMENTO LTDA
                </div>
                <div>
                  <strong>CNPJ:</strong> 64.964.213/0001-16
                </div>
                <div>
                  <strong>Marca/Plataforma:</strong> StaziaMed Revalida
                </div>
                <div>
                  <strong>Endereço:</strong> Rua Visconde do Rio Branco, nº 1488, Conj. 909, Andar 09, Cond. Universe Life Square, Bloco Comercial, Centro, Curitiba/PR, CEP 80.420-210.
                </div>
                <div className="pt-2 text-slate-600">
                  Para fins da Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais (“LGPD”) — a <strong>5C CONSULTORIA EM GESTÃO E DESENVOLVIMENTO LTDA</strong> atua como controladora dos dados pessoais tratados no âmbito da plataforma <strong>StaziaMed Revalida</strong>, ressalvadas as situações em que terceiros atuem como controladores independentes.
                </div>
              </div>
            </div>

            {/* SECTIONS */}
            <div className="space-y-8 text-sm sm:text-base leading-relaxed text-slate-700">
              {/* 1. FINALIDADE */}
              <section id="finalidade" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">1.</span> FINALIDADE
                </h2>
                <p>
                  Esta Política de Privacidade explica como os dados pessoais dos usuários da StaziaMed Revalida podem ser coletados, utilizados, armazenados, compartilhados, protegidos e eliminados durante a utilização da plataforma, do site, do aplicativo, da área do usuário e de seus recursos educacionais.
                </p>
                <p>
                  O tratamento de dados pessoais observará os princípios previstos na LGPD, especialmente finalidade, adequação, necessidade, livre acesso, qualidade dos dados, transparência, segurança, prevenção, não discriminação e responsabilização.
                </p>
              </section>

              {/* 2. DADOS QUE PODEM SER TRATADOS */}
              <section id="dados-que-podem-ser-tratados" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">2.</span> DADOS QUE PODEM SER TRATADOS
                </h2>
                <p>Dependendo das funcionalidades utilizadas, a StaziaMed Revalida poderá tratar:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>nome;</li>
                  <li>endereço de e-mail;</li>
                  <li>fotografia ou imagem de perfil;</li>
                  <li>identificadores de conta;</li>
                  <li>informações fornecidas por serviços de autenticação;</li>
                  <li>dados de cadastro;</li>
                  <li>histórico de acesso;</li>
                  <li>questões respondidas;</li>
                  <li>alternativas selecionadas;</li>
                  <li>número de acertos e erros;</li>
                  <li>percentual de desempenho;</li>
                  <li>tempo de resolução;</li>
                  <li>simulados realizados;</li>
                  <li>conteúdos estudados;</li>
                  <li>flashcards;</li>
                  <li>revisões;</li>
                  <li>metas;</li>
                  <li>calendário e planejamento de estudos;</li>
                  <li>preferências de aprendizagem;</li>
                  <li>histórico de treinamentos;</li>
                  <li>interações com recursos educacionais;</li>
                  <li>registros de atendimento e suporte;</li>
                  <li>informações técnicas do dispositivo;</li>
                  <li>endereço IP;</li>
                  <li>navegador;</li>
                  <li>sistema operacional;</li>
                  <li>data e horário de acesso;</li>
                  <li>registros de autenticação;</li>
                  <li>logs de erro;</li>
                  <li>eventos de segurança;</li>
                  <li>identificadores técnicos necessários ao funcionamento da plataforma.</li>
                </ul>
                <p className="pt-2">
                  Caso sejam disponibilizados serviços pagos, também poderão ser tratados dados relacionados à contratação, status de pagamento, informações fiscais e registros da transação.
                </p>
                <p>
                  Dados de cartão ou outros dados financeiros sensíveis poderão ser processados diretamente por provedores especializados de pagamento, conforme o meio de pagamento disponibilizado.
                </p>
              </section>

              {/* 3. DADOS RELACIONADOS A INTELIGÊNCIA ARTIFICIAL */}
              <section id="dados-relacionados-a-inteligencia-artificial" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">3.</span> DADOS RELACIONADOS A INTELIGÊNCIA ARTIFICIAL
                </h2>
                <p>
                  A StaziaMed Revalida poderá utilizar recursos de inteligência artificial para personalização de estudos, geração de questões, flashcards, explicações, revisões, planos de estudo, recomendações e outros recursos educacionais.
                </p>
                <p>Para executar essas funcionalidades, poderão ser processados:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>comandos e solicitações enviados pelo usuário;</li>
                  <li>respostas fornecidas pelo usuário;</li>
                  <li>histórico de desempenho;</li>
                  <li>temas estudados;</li>
                  <li>dificuldades identificadas;</li>
                  <li>preferências educacionais;</li>
                  <li>informações necessárias para personalização da experiência.</li>
                </ul>
                <p>
                  Os dados serão utilizados apenas dentro das finalidades compatíveis com a prestação e melhoria dos serviços da plataforma.
                </p>
              </section>

              {/* 4. DADOS DE PACIENTES E DADOS SENSÍVEIS */}
              <section id="dados-de-pacientes-e-dados-sensiveis" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">4.</span> DADOS DE PACIENTES E DADOS SENSÍVEIS
                </h2>
                <p>
                  A StaziaMed Revalida possui finalidade educacional e não foi desenvolvida para armazenar prontuários médicos ou informações clínicas identificáveis de pacientes reais.
                </p>
                <p>
                  O usuário não deverá inserir nos campos da plataforma, recursos de inteligência artificial, anotações, questões ou outras funcionalidades dados que permitam identificar pacientes reais, incluindo:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>nome;</li>
                  <li>CPF;</li>
                  <li>RG;</li>
                  <li>telefone;</li>
                  <li>endereço;</li>
                  <li>fotografia identificável;</li>
                  <li>número de prontuário;</li>
                  <li>exames identificáveis;</li>
                  <li>dados de contato;</li>
                  <li>qualquer outra informação protegida por sigilo médico ou profissional.</li>
                </ul>
                <p>
                  Casos clínicos utilizados para estudo deverão ser fictícios, provenientes de materiais autorizados ou adequadamente anonimizados.
                </p>
              </section>

              {/* 5. COMO OS DADOS SÃO COLETADOS */}
              <section id="como-os-dados-sao-coletados" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">5.</span> COMO OS DADOS SÃO COLETADOS
                </h2>
                <p>Os dados poderão ser coletados:</p>
                <div className="space-y-3 pl-2">
                  <div>
                    <h3 className="font-bold text-[#0A1C3E] text-sm">5.1. Diretamente do usuário</h3>
                    <p className="text-sm">
                      Durante o cadastro, autenticação, preenchimento de perfil, realização de questões, simulados, treinamentos, uso de ferramentas de estudo ou contato com o suporte.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-bold text-[#0A1C3E] text-sm">5.2. Automaticamente</h3>
                    <p className="text-sm">
                      Durante a utilização da plataforma, por meio de registros técnicos, logs, cookies, identificadores, armazenamento local e tecnologias semelhantes.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-bold text-[#0A1C3E] text-sm">5.3. Por terceiros autorizados</h3>
                    <p className="text-sm">
                      Quando o usuário optar por utilizar serviços de terceiros para autenticação, pagamento ou integração com a plataforma.
                    </p>
                  </div>
                </div>
              </section>

              {/* 6. COMO UTILIZAMOS OS DADOS */}
              <section id="como-utilizamos-os-dados" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">6.</span> COMO UTILIZAMOS OS DADOS
                </h2>
                <p>Os dados pessoais poderão ser utilizados para:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>criar e manter contas de usuário;</li>
                  <li>realizar autenticação;</li>
                  <li>permitir acesso às funcionalidades;</li>
                  <li>sincronizar o progresso;</li>
                  <li>registrar histórico de estudos;</li>
                  <li>gerar simulados e treinamentos;</li>
                  <li>personalizar conteúdos;</li>
                  <li>calcular desempenho;</li>
                  <li>identificar áreas com maior incidência de erros;</li>
                  <li>recomendar revisões;</li>
                  <li>organizar planos e calendários de estudo;</li>
                  <li>fornecer recursos de inteligência artificial;</li>
                  <li>prestar suporte;</li>
                  <li>enviar comunicações operacionais;</li>
                  <li>prevenir fraude;</li>
                  <li>proteger a segurança da plataforma;</li>
                  <li>detectar uso indevido;</li>
                  <li>cumprir obrigações legais e regulatórias;</li>
                  <li>emitir documentos fiscais;</li>
                  <li>exercer regularmente direitos;</li>
                  <li>melhorar funcionalidades;</li>
                  <li>produzir estatísticas;</li>
                  <li>analisar desempenho técnico;</li>
                  <li>desenvolver novos recursos educacionais.</li>
                </ul>
              </section>

              {/* 7. BASES LEGAIS PARA O TRATAMENTO */}
              <section id="bases-legais-para-o-tratamento" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">7.</span> BASES LEGAIS PARA O TRATAMENTO
                </h2>
                <p>
                  O tratamento de dados pessoais poderá ocorrer com fundamento nas bases legais previstas na LGPD, conforme aplicável a cada situação, incluindo:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>execução de contrato ou procedimentos preliminares relacionados ao contrato;</li>
                  <li>cumprimento de obrigação legal ou regulatória;</li>
                  <li>exercício regular de direitos;</li>
                  <li>legítimo interesse;</li>
                  <li>consentimento do titular, quando necessário.</li>
                </ul>
                <p>
                  O consentimento não será utilizado como fundamento quando outra base legal for mais adequada.
                </p>
                <p>
                  Quando determinado tratamento depender de consentimento, o usuário poderá revogá-lo nos termos da legislação aplicável.
                </p>
              </section>

              {/* 8. PERSONALIZAÇÃO E DECISÕES AUTOMATIZADAS */}
              <section id="personalizacao-e-decisoes-automatizadas" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">8.</span> PERSONALIZAÇÃO E DECISÕES AUTOMATIZADAS
                </h2>
                <p>
                  A StaziaMed Revalida poderá utilizar algoritmos e inteligência artificial para analisar informações acadêmicas e apresentar recomendações personalizadas.
                </p>
                <p>Esses recursos poderão:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>identificar temas com maior índice de erro;</li>
                  <li>sugerir conteúdos para revisão;</li>
                  <li>recomendar questões;</li>
                  <li>montar sequências de treinamento;</li>
                  <li>elaborar planos de estudo;</li>
                  <li>gerar explicações ou materiais educacionais.</li>
                </ul>
                <p>
                  Essas análises possuem finalidade educacional e, em regra, não produzem efeitos jurídicos sobre o usuário.
                </p>
                <p>
                  Quando houver decisão exclusivamente automatizada que se enquadre nas hipóteses previstas na legislação, serão observados os direitos aplicáveis ao titular.
                </p>
              </section>

              {/* 9. COOKIES E TECNOLOGIAS SEMELHANTES */}
              <section id="cookies-e-tecnologias-semelhantes" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">9.</span> COOKIES E TECNOLOGIAS SEMELHANTES
                </h2>
                <p>
                  A StaziaMed Revalida poderá utilizar cookies, armazenamento local e tecnologias semelhantes para:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>manter o usuário autenticado;</li>
                  <li>proteger sessões;</li>
                  <li>lembrar preferências;</li>
                  <li>melhorar o funcionamento do sistema;</li>
                  <li>identificar erros;</li>
                  <li>produzir métricas;</li>
                  <li>reforçar a segurança;</li>
                  <li>analisar a utilização da plataforma.</li>
                </ul>
                <p>
                  Cookies estritamente necessários poderão ser utilizados independentemente de consentimento quando essenciais ao funcionamento do serviço.
                </p>
                <p>
                  Quando forem utilizados cookies opcionais que dependam de consentimento, o usuário poderá gerenciar suas preferências pelos mecanismos disponibilizados pela plataforma.
                </p>
              </section>

              {/* 10. COMPARTILHAMENTO DE DADOS */}
              <section id="compartilhamento-de-dados" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">10.</span> COMPARTILHAMENTO DE DADOS
                </h2>
                <p>
                  Os dados poderão ser compartilhados, quando necessário, com fornecedores responsáveis por:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>hospedagem;</li>
                  <li>infraestrutura em nuvem;</li>
                  <li>banco de dados;</li>
                  <li>autenticação;</li>
                  <li>armazenamento;</li>
                  <li>segurança;</li>
                  <li>processamento de pagamentos;</li>
                  <li>envio de e-mails;</li>
                  <li>monitoramento técnico;</li>
                  <li>analytics;</li>
                  <li>atendimento ao usuário;</li>
                  <li>inteligência artificial;</li>
                  <li>ferramentas tecnológicas necessárias ao funcionamento do serviço.</li>
                </ul>
                <p>
                  O compartilhamento ocorrerá apenas na medida necessária para a prestação dos serviços.
                </p>
                <p>Os dados também poderão ser compartilhados quando necessário para:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>cumprimento de obrigação legal;</li>
                  <li>atendimento de ordem judicial ou administrativa válida;</li>
                  <li>prevenção de fraude;</li>
                  <li>investigação de incidentes;</li>
                  <li>proteção dos direitos da empresa;</li>
                  <li>proteção dos direitos e segurança dos usuários.</li>
                </ul>
                <p className="font-semibold text-teal-700">
                  A StaziaMed Revalida não comercializa listas de dados pessoais dos usuários.
                </p>
              </section>

              {/* 11. TRANSFERÊNCIA INTERNACIONAL DE DADOS */}
              <section id="transferencia-internacional-de-dados" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">11.</span> TRANSFERÊNCIA INTERNACIONAL DE DADOS
                </h2>
                <p>
                  Alguns fornecedores utilizados pela plataforma poderão possuir servidores ou infraestrutura fora do Brasil.
                </p>
                <p>
                  Nessas situações, poderá ocorrer transferência internacional de dados pessoais, observando-se os requisitos da LGPD e da regulamentação da Autoridade Nacional de Proteção de Dados — ANPD.
                </p>
                <p>
                  Sempre que aplicável, serão adotadas salvaguardas contratuais, organizacionais e técnicas adequadas.
                </p>
              </section>

              {/* 12. ARMAZENAMENTO E RETENÇÃO */}
              <section id="armazenamento-e-retencao" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">12.</span> ARMAZENAMENTO E RETENÇÃO
                </h2>
                <p>
                  Os dados pessoais serão mantidos pelo período necessário para cumprir as finalidades para as quais foram coletados.
                </p>
                <p>Também poderão ser mantidos enquanto necessários para:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>cumprimento de obrigações legais;</li>
                  <li>obrigações fiscais;</li>
                  <li>prevenção de fraude;</li>
                  <li>segurança;</li>
                  <li>auditoria;</li>
                  <li>defesa judicial ou administrativa;</li>
                  <li>exercício regular de direitos;</li>
                  <li>cumprimento de contratos.</li>
                </ul>
                <p>
                  Após o encerramento das finalidades, os dados poderão ser eliminados ou anonimizados, salvo quando sua conservação for permitida ou exigida pela legislação.
                </p>
              </section>

              {/* 13. SEGURANÇA */}
              <section id="seguranca" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">13.</span> SEGURANÇA
                </h2>
                <p>
                  A StaziaMed Revalida adotará medidas técnicas e administrativas razoáveis para proteger os dados contra:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>acessos não autorizados;</li>
                  <li>destruição;</li>
                  <li>perda;</li>
                  <li>alteração;</li>
                  <li>divulgação;</li>
                  <li>vazamento;</li>
                  <li>tratamento inadequado ou ilícito.</li>
                </ul>
                <p>Entre as medidas poderão ser utilizados:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>autenticação;</li>
                  <li>controle de acesso;</li>
                  <li>segregação de permissões;</li>
                  <li>registros de atividades;</li>
                  <li>monitoramento;</li>
                  <li>backups;</li>
                  <li>proteção da infraestrutura;</li>
                  <li>mecanismos antifraude;</li>
                  <li>registros de auditoria.</li>
                </ul>
                <p>Nenhum sistema é absolutamente imune a incidentes de segurança.</p>
                <p>
                  Caso ocorra incidente que possa causar risco ou dano relevante aos titulares, serão adotadas as providências exigidas pela legislação aplicável.
                </p>
              </section>

              {/* 14. DIREITOS DO TITULAR */}
              <section id="direitos-do-titular" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">14.</span> DIREITOS DO TITULAR
                </h2>
                <p>Nos termos da LGPD, o titular poderá solicitar, quando aplicável:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>confirmação da existência de tratamento;</li>
                  <li>acesso aos dados;</li>
                  <li>correção de dados incompletos, inexatos ou desatualizados;</li>
                  <li>anonimização de dados;</li>
                  <li>bloqueio;</li>
                  <li>eliminação de dados desnecessários ou tratados irregularmente;</li>
                  <li>portabilidade, observada a regulamentação;</li>
                  <li>informações sobre compartilhamento;</li>
                  <li>revogação de consentimento;</li>
                  <li>eliminação de dados tratados com base em consentimento, observadas as exceções legais;</li>
                  <li>oposição a tratamentos realizados em determinadas hipóteses;</li>
                  <li>demais direitos previstos na legislação.</li>
                </ul>
                <p>
                  Para proteção contra fraude e acesso indevido, poderá ser solicitado procedimento de confirmação da identidade do titular antes do atendimento da solicitação.
                </p>
              </section>

              {/* 15. EXCLUSÃO DA CONTA */}
              <section id="exclusao-da-conta" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">15.</span> EXCLUSÃO DA CONTA
                </h2>
                <p>
                  O usuário poderá realizar ou solicitar a exclusão da própria conta pelos mecanismos disponibilizados na plataforma.
                </p>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 font-semibold text-xs text-[#0A1C3E]">
                  Quando essa funcionalidade estiver disponível diretamente no sistema: <br />
                  <span className="text-teal-700 font-bold">
                    Perfil → Excluir conta → confirmação da exclusão.
                  </span>
                </div>
                <p>
                  A plataforma poderá solicitar confirmação adicional para evitar exclusões acidentais ou realizadas por terceiros.
                </p>
                <p>Após a exclusão:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>o acesso à conta poderá ser encerrado;</li>
                  <li>o usuário poderá perder acesso ao histórico de estudos;</li>
                  <li>treinamentos vinculados à conta poderão ficar indisponíveis;</li>
                  <li>recursos personalizados poderão deixar de funcionar;</li>
                  <li>dados que não precisem ser mantidos poderão ser eliminados ou anonimizados.</li>
                </ul>
                <p>
                  A exclusão da conta não significa necessariamente eliminação imediata de todos os dados.
                </p>
                <p>
                  Determinadas informações poderão ser mantidas durante o período necessário quando sua conservação for autorizada ou exigida por lei, inclusive registros fiscais, financeiros, de segurança, auditoria, prevenção de fraude e exercício regular de direitos.
                </p>
              </section>

              {/* 16. DADOS ANONIMIZADOS E ESTATÍSTICAS */}
              <section id="dados-anonimizados-e-estatisticas" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">16.</span> DADOS ANONIMIZADOS E ESTATÍSTICAS
                </h2>
                <p>A StaziaMed Revalida poderá utilizar informações anonimizadas ou dados agregados para:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>gerar estatísticas;</li>
                  <li>analisar desempenho dos usuários de forma coletiva;</li>
                  <li>melhorar conteúdos;</li>
                  <li>aperfeiçoar algoritmos;</li>
                  <li>desenvolver funcionalidades;</li>
                  <li>identificar temas de maior dificuldade;</li>
                  <li>realizar análises educacionais.</li>
                </ul>
                <p>
                  Quando os dados forem efetivamente anonimizados e não permitirem a identificação do titular por meios razoáveis, serão tratados conforme a legislação aplicável.
                </p>
              </section>

              {/* 17. COMUNICAÇÕES */}
              <section id="comunicacoes" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">17.</span> COMUNICAÇÕES
                </h2>
                <p>A plataforma poderá enviar mensagens necessárias ao funcionamento do serviço, como:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>confirmações de cadastro;</li>
                  <li>recuperação de senha;</li>
                  <li>avisos de segurança;</li>
                  <li>informações relacionadas à conta;</li>
                  <li>avisos sobre assinatura;</li>
                  <li>alterações relevantes no serviço;</li>
                  <li>comunicações operacionais.</li>
                </ul>
                <p>
                  Comunicações promocionais, quando realizadas, observarão a legislação aplicável e oferecerão mecanismos adequados para gerenciamento das preferências do usuário.
                </p>
              </section>

              {/* 18. CRIANÇAS E ADOLESCENTES */}
              <section id="criancas-e-adolescentes" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">18.</span> CRIANÇAS E ADOLESCENTES
                </h2>
                <p>
                  A StaziaMed Revalida é voltada predominantemente a estudantes e profissionais da área médica.
                </p>
                <p>A plataforma não possui como finalidade direcionar seus serviços a crianças.</p>
                <p>
                  Caso seja identificado tratamento de dados sujeito às regras específicas aplicáveis a crianças ou adolescentes, deverão ser observados os requisitos legais e o princípio do melhor interesse.
                </p>
              </section>

              {/* 19. CANAL DE PRIVACIDADE */}
              <section id="canal-de-privacidade" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">19.</span> CANAL DE PRIVACIDADE
                </h2>
                <p>
                  Solicitações relacionadas à privacidade, proteção de dados pessoais ou exercício dos direitos previstos na LGPD poderão ser encaminhadas ao canal oficial de atendimento disponibilizado no site ou aplicativo da <strong>StaziaMed Revalida</strong>.
                </p>
                <p>
                  A empresa poderá disponibilizar endereço eletrônico específico para assuntos relacionados à proteção de dados.
                </p>
              </section>

              {/* 20. ALTERAÇÕES DESTA POLÍTICA */}
              <section id="alteracoes-desta-politica" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">20.</span> ALTERAÇÕES DESTA POLÍTICA
                </h2>
                <p>Esta Política de Privacidade poderá ser atualizada periodicamente para refletir:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  <li>alterações legislativas;</li>
                  <li>novas regulamentações;</li>
                  <li>mudanças tecnológicas;</li>
                  <li>inclusão de novas funcionalidades;</li>
                  <li>alteração de fornecedores;</li>
                  <li>melhorias nas práticas de privacidade.</li>
                </ul>
                <p>A versão vigente será aquela disponibilizada na plataforma no momento do acesso.</p>
                <p>Alterações relevantes poderão ser comunicadas aos usuários pelos canais disponíveis.</p>
              </section>

              {/* 21. LEGISLAÇÃO APLICÁVEL */}
              <section id="legislacao-aplicavel" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">21.</span> LEGISLAÇÃO APLICÁVEL
                </h2>
                <p>Esta Política será interpretada de acordo com a legislação brasileira, especialmente:</p>
                <p className="font-semibold text-[#0A1C3E]">
                  Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais — LGPD, suas alterações e regulamentações emitidas pela Autoridade Nacional de Proteção de Dados.
                </p>
              </section>
            </div>

            {/* Document Signature & Legal Footer */}
            <div className="mt-12 p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/90 text-center space-y-3 shadow-xs">
              <div className="font-extrabold tracking-wide text-[#0A1C3E] text-base">
                5C CONSULTORIA EM GESTÃO E DESENVOLVIMENTO LTDA
              </div>
              <div className="text-xs text-slate-500">
                CNPJ: 64.964.213/0001-16 • STAZIAMED REVALIDA
              </div>
              <div className="text-xs font-semibold text-teal-700 pt-2 border-t border-slate-200">
                Versão vigente a partir de 04 de setembro de 2026.
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
