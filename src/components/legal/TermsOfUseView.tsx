import React, { useEffect, useState } from "react";
import { ArrowLeft, Scale, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const TERMS_SECTIONS = [
  { id: "objeto", num: 1, title: "Objeto" },
  { id: "aceite-dos-termos", num: 2, title: "Aceite dos Termos" },
  { id: "cadastro-e-autenticacao", num: 3, title: "Cadastro e Autenticação" },
  { id: "finalidade-educacional", num: 4, title: "Finalidade Educacional" },
  { id: "ausencia-de-garantia-de-aprovacao", num: 5, title: "Ausência de Garantia de Aprovação" },
  { id: "conteudo-medico-e-atualizacoes-de-protocolos", num: 6, title: "Conteúdo Médico e Atualizações de Protocolos" },
  { id: "nao-utilizacao-para-decisoes-clinicas", num: 7, title: "Não Utilização para Decisões Clínicas" },
  { id: "inteligencia-artificial", num: 8, title: "Inteligência Artificial" },
  { id: "dados-de-pacientes-e-sigilo-profissional", num: 9, title: "Dados de Pacientes e Sigilo Profissional" },
  { id: "uso-permitido", num: 10, title: "Uso Permitido" },
  { id: "condutas-proibidas", num: 11, title: "Condutas Proibidas" },
  { id: "propriedade-intelectual", num: 12, title: "Propriedade Intelectual" },
  { id: "provas-questoes-e-documentos-publicos", num: 13, title: "Provas, Questões e Documentos Públicos" },
  { id: "conteudo-inserido-pelo-usuario", num: 14, title: "Conteúdo Inserido pelo Usuário" },
  { id: "planos-assinaturas-e-pagamentos", num: 15, title: "Planos, Assinaturas e Pagamentos" },
  { id: "alteracao-de-planos-e-funcionalidades", num: 16, title: "Alteração de Planos e Funcionalidades" },
  { id: "disponibilidade-do-servico", num: 17, title: "Disponibilidade do Serviço" },
  { id: "servicos-de-terceiros", num: 18, title: "Serviços de Terceiros" },
  { id: "seguranca-e-uso-indevido", num: 19, title: "Segurança e Uso Indevido" },
  { id: "suspensao-ou-encerramento-pela-empresa", num: 20, title: "Suspensão ou Encerramento pela Empresa" },
  { id: "exclusao-da-conta-pelo-usuario", num: 21, title: "Exclusão da Conta pelo Usuário" },
  { id: "protecao-de-dados-pessoais", num: 22, title: "Proteção de Dados Pessoais" },
  { id: "limites-de-responsabilidade", num: 23, title: "Limites de Responsabilidade" },
  { id: "alteracoes-dos-termos", num: 24, title: "Alterações dos Termos" },
  { id: "comunicacoes-e-suporte", num: 25, title: "Comunicações e Suporte" },
  { id: "legislacao-e-foro", num: 26, title: "Legislação e Foro" },
  { id: "disposicoes-finais", num: 27, title: "Disposições Finais" },
];

export const TermsOfUseView: React.FC = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<string>("objeto");

  useEffect(() => {
    window.scrollTo(0, 0);

    const handleScroll = () => {
      const scrollPos = window.scrollY + 160;
      for (const section of TERMS_SECTIONS) {
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

          {/* Right: Quick Link to Privacy Policy */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              id="btn-switch-to-privacy"
              onClick={() => navigate("/politica-de-privacidade")}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-teal-50/60 border border-slate-200 text-slate-700 hover:text-teal-900 flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <Shield className="w-3.5 h-3.5 text-teal-600" />
              <span className="hidden sm:inline">Política de Privacidade</span>
              <span className="sm:hidden">Privacidade</span>
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
                <Scale className="w-4 h-4 text-[#00D2B4]" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#0A1C3E]">
                  Sumário dos Termos
                </h2>
              </div>
              <nav className="space-y-1 max-h-[calc(100vh-220px)] overflow-y-auto pr-1 text-xs">
                {TERMS_SECTIONS.map((sec) => {
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
                <Scale className="w-3.5 h-3.5" />
                Documento Jurídico Oficial
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#0A1C3E]">
                TERMOS DE USO
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

              {/* Informações da Empresa */}
              <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1.5 leading-relaxed text-slate-700">
                <div className="font-bold text-[#0A1C3E] tracking-wide uppercase text-[10.5px]">
                  INFORMAÇÕES DA EMPRESA
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
              </div>
            </div>

            {/* SECTIONS */}
            <div className="space-y-8 text-sm sm:text-base leading-relaxed text-slate-700">
              {/* 1. OBJETO */}
              <section id="objeto" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">1.</span> OBJETO
                </h2>
                <p>
                  Estes Termos de Uso regulam o acesso e a utilização da plataforma <strong>StaziaMed Revalida</strong>, operada pela <strong>5C CONSULTORIA EM GESTÃO E DESENVOLVIMENTO LTDA</strong>, destinada ao apoio educacional de estudantes e profissionais que estejam se preparando para exames, avaliações e processos relacionados à revalidação de diplomas médicos e educação médica.
                </p>
                <p>
                  A plataforma poderá disponibilizar banco de questões, simulados, flashcards, materiais teóricos, análises de desempenho, calendários de estudo, revisões, recursos de inteligência artificial, geração de questões, ferramentas de organização acadêmica e outras funcionalidades educacionais.
                </p>
              </section>

              {/* 2. ACEITE DOS TERMOS */}
              <section id="aceite-dos-termos" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">2.</span> ACEITE DOS TERMOS
                </h2>
                <p>
                  Ao criar uma conta, acessar ou utilizar a StaziaMed Revalida, o usuário declara ter lido e compreendido estes Termos de Uso e a Política de Privacidade vigente.
                </p>
                <p>
                  Caso não concorde com as condições apresentadas, deverá deixar de utilizar os serviços.
                </p>
              </section>

              {/* 3. CADASTRO E AUTENTICAÇÃO */}
              <section id="cadastro-e-autenticacao" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">3.</span> CADASTRO E AUTENTICAÇÃO
                </h2>
                <p>
                  O acesso a determinadas funcionalidades poderá exigir cadastro ou autenticação por meio de provedor externo, como uma conta Google.
                </p>
                <p>
                  O usuário é responsável por manter a segurança de suas credenciais e por todas as atividades realizadas regularmente em sua conta.
                </p>
                <p>A conta é pessoal e individual.</p>
                <p>
                  Não é permitido compartilhar acesso com terceiros, vender, alugar, emprestar ou disponibilizar credenciais de forma que permita a utilização indevida de uma mesma conta por pessoas diferentes.
                </p>
                <p>
                  A StaziaMed Revalida poderá utilizar mecanismos técnicos destinados a identificar compartilhamento abusivo, fraude, automações não autorizadas ou outras violações destes Termos, observada a legislação aplicável.
                </p>
              </section>

              {/* 4. FINALIDADE EDUCACIONAL */}
              <section id="finalidade-educacional" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">4.</span> FINALIDADE EDUCACIONAL
                </h2>
                <p>
                  Os conteúdos disponibilizados possuem finalidade exclusivamente educacional e de preparação acadêmica.
                </p>
                <p>
                  A plataforma <strong>não representa, não integra e não possui vínculo institucional com o Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira — INEP, Ministério da Educação — MEC, Ministério da Saúde ou qualquer outra entidade pública responsável pelo Revalida</strong>, salvo quando eventual parceria for expressamente anunciada e comprovada.
                </p>
                <p>
                  Referências ao Revalida, INEP, SUS, Ministério da Saúde, instituições, protocolos, provas ou diretrizes destinam-se à identificação do contexto educacional e das fontes estudadas.
                </p>
              </section>

              {/* 5. AUSÊNCIA DE GARANTIA DE APROVAÇÃO */}
              <section id="ausencia-de-garantia-de-aprovacao" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">5.</span> AUSÊNCIA DE GARANTIA DE APROVAÇÃO
                </h2>
                <p>
                  A utilização da StaziaMed Revalida não representa promessa ou garantia de aprovação em qualquer etapa do Revalida, ENAMED, exame acadêmico, processo seletivo ou procedimento de reconhecimento de diploma.
                </p>
                <p>
                  O resultado do usuário depende de diversos fatores individuais e externos, incluindo conhecimento prévio, rotina de estudo, desempenho no exame, critérios da banca examinadora e eventuais mudanças nas regras das avaliações.
                </p>
                <p>
                  Indicadores, probabilidades, rankings, percentuais de domínio ou estimativas produzidos pela plataforma têm finalidade educacional e não constituem garantia de resultado.
                </p>
              </section>

              {/* 6. CONTEÚDO MÉDICO E ATUALIZAÇÕES DE PROTOCOLOS */}
              <section id="conteudo-medico-e-atualizacoes-de-protocolos" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">6.</span> CONTEÚDO MÉDICO E ATUALIZAÇÕES DE PROTOCOLOS
                </h2>
                <p>
                  A StaziaMed Revalida poderá utilizar provas anteriores, diretrizes, protocolos, legislação, documentos públicos e referências técnico-científicas para fins educacionais, observados os direitos aplicáveis.
                </p>
                <p>
                  A medicina e as normas de saúde passam por atualizações frequentes. Uma questão historicamente correta segundo o protocolo existente na época da prova pode não refletir uma recomendação clínica posterior.
                </p>
                <p>
                  Quando tecnicamente possível, a plataforma poderá manter o gabarito histórico da prova e indicar separadamente a existência de atualização relevante.
                </p>
                <p>
                  O usuário deverá considerar a data do material e consultar as fontes oficiais e diretrizes vigentes quando a informação for utilizada fora do contexto específico de preparação para provas.
                </p>
              </section>

              {/* 7. NÃO UTILIZAÇÃO PARA DECISÕES CLÍNICAS */}
              <section id="nao-utilizacao-para-decisoes-clinicas" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">7.</span> NÃO UTILIZAÇÃO PARA DECISÕES CLÍNICAS
                </h2>
                <p>
                  A StaziaMed Revalida não é prontuário eletrônico, sistema de prescrição, plataforma de telemedicina ou ferramenta destinada à assistência direta a pacientes.
                </p>
                <p>
                  Os conteúdos e respostas apresentados não substituem avaliação clínica, julgamento profissional, protocolos assistenciais vigentes ou consulta a fontes oficiais.
                </p>
                <p>
                  É proibido utilizar respostas geradas pela plataforma como única base para diagnóstico, prescrição, tratamento ou tomada de decisão relacionada a paciente real.
                </p>
              </section>

              {/* 8. INTELIGÊNCIA ARTIFICIAL */}
              <section id="inteligencia-artificial" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">8.</span> INTELIGÊNCIA ARTIFICIAL
                </h2>
                <p>
                  Determinadas funcionalidades poderão utilizar inteligência artificial para geração, adaptação, classificação, recomendação ou explicação de conteúdos educacionais.
                </p>
                <p>
                  Sistemas de inteligência artificial podem produzir respostas incompletas, desatualizadas, imprecisas ou incorretas.
                </p>
                <p>
                  A StaziaMed Revalida poderá utilizar mecanismos de validação e revisão para reduzir erros, mas o usuário reconhece que nenhum recurso automatizado deve ser considerado infalível.
                </p>
                <p>
                  Quando houver conflito entre material gerado automaticamente e fonte normativa, edital, protocolo ou documento oficial vigente, deverá prevalecer a fonte oficial aplicável.
                </p>
              </section>

              {/* 9. DADOS DE PACIENTES E SIGILO PROFISSIONAL */}
              <section id="dados-de-pacientes-e-sigilo-profissional" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">9.</span> DADOS DE PACIENTES E SIGILO PROFISSIONAL
                </h2>
                <p>
                  É expressamente proibido inserir na plataforma dados identificáveis de pacientes reais ou informações protegidas por sigilo médico ou profissional.
                </p>
                <p>
                  O usuário não deverá inserir nome, CPF, documento, telefone, endereço, fotografia identificável, número de prontuário, exames identificáveis ou outros elementos que permitam reconhecer paciente real em chats, ferramentas de inteligência artificial, simulados, anotações ou qualquer outro recurso.
                </p>
                <p>
                  Casos clínicos utilizados para fins de estudo deverão ser fictícios, provenientes de materiais autorizados ou adequadamente anonimizados.
                </p>
              </section>

              {/* 10. USO PERMITIDO */}
              <section id="uso-permitido" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">10.</span> USO PERMITIDO
                </h2>
                <p>
                  O usuário recebe uma licença pessoal, limitada, revogável, não exclusiva e intransferível para acessar os conteúdos e funcionalidades disponibilizados durante o período em que possuir direito de acesso ao serviço.
                </p>
                <p>
                  Essa licença não transfere ao usuário qualquer direito de propriedade sobre a plataforma ou seus conteúdos.
                </p>
                <p>
                  O material deverá ser utilizado exclusivamente para estudo e desenvolvimento educacional pessoal.
                </p>
              </section>

              {/* 11. CONDUTAS PROIBIDAS */}
              <section id="condutas-proibidas" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">11.</span> CONDUTAS PROIBIDAS
                </h2>
                <p>
                  Não é permitido copiar substancialmente bancos de questões ou materiais; extrair conteúdo de forma automatizada; utilizar robôs, scrapers ou ferramentas semelhantes sem autorização; revender ou redistribuir materiais; compartilhar arquivos protegidos; reproduzir conteúdos com finalidade comercial; burlar limites de acesso; explorar vulnerabilidades; tentar acessar contas ou áreas restritas; interferir na infraestrutura; usar a plataforma para fraude; fornecer acesso a terceiros de forma não autorizada; remover identificações de autoria ou propriedade; ou utilizar conteúdos e funcionalidades de maneira ilícita.
                </p>
                <p>
                  Também é proibida a utilização sistemática da plataforma para construir banco de dados concorrente mediante extração não autorizada de seus conteúdos proprietários.
                </p>
              </section>

              {/* 12. PROPRIEDADE INTELECTUAL */}
              <section id="propriedade-intelectual" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">12.</span> PROPRIEDADE INTELECTUAL
                </h2>
                <p>
                  A marca StaziaMed Revalida, identidade visual, design, software, código próprio, estruturas de organização, conteúdos autorais, resumos, comentários, análises, questões inéditas, flashcards, ilustrações, ferramentas, recursos educacionais, bancos estruturados e demais materiais próprios são protegidos pela legislação aplicável.
                </p>
                <p>
                  Conteúdos de terceiros permanecem sujeitos aos direitos de seus respectivos titulares.
                </p>
                <p>
                  A existência de determinado conteúdo na plataforma não implica transferência ou renúncia de direitos de propriedade intelectual.
                </p>
              </section>

              {/* 13. PROVAS, QUESTÕES E DOCUMENTOS PÚBLICOS */}
              <section id="provas-questoes-e-documentos-publicos" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">13.</span> PROVAS, QUESTÕES E DOCUMENTOS PÚBLICOS
                </h2>
                <p>
                  Materiais provenientes de provas, editais, atos normativos, protocolos ou documentos públicos poderão ser utilizados para fins educacionais dentro dos limites permitidos pela legislação aplicável.
                </p>
                <p>
                  Quando houver conteúdo pertencente a terceiros, deverão ser respeitados os respectivos direitos autorais, licenças, atribuições e limitações de uso.
                </p>
                <p>
                  Questões inéditas produzidas especificamente pela StaziaMed Revalida, bem como comentários, explicações, classificações, mapas educacionais e materiais autorais próprios, poderão constituir conteúdo protegido da plataforma.
                </p>
              </section>

              {/* 14. CONTEÚDO INSERIDO PELO USUÁRIO */}
              <section id="conteudo-inserido-pelo-usuario" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">14.</span> CONTEÚDO INSERIDO PELO USUÁRIO
                </h2>
                <p>
                  O usuário continua responsável pelos conteúdos que voluntariamente inserir na plataforma.
                </p>
                <p>
                  Ao utilizar funcionalidades que exijam processamento dessas informações, o usuário autoriza tecnicamente seu armazenamento, processamento e transformação na medida necessária para execução da funcionalidade solicitada, de acordo com a Política de Privacidade.
                </p>
                <p>
                  O usuário declara possuir os direitos e autorizações necessários sobre o conteúdo que inserir.
                </p>
              </section>

              {/* 15. PLANOS, ASSINATURAS E PAGAMENTOS */}
              <section id="planos-assinaturas-e-pagamentos" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">15.</span> PLANOS, ASSINATURAS E PAGAMENTOS
                </h2>
                <p>
                  Quando houver planos pagos, os valores, período de acesso, forma de cobrança, renovação, funcionalidades incluídas e condições comerciais serão apresentados ao usuário antes da contratação.
                </p>
                <p>
                  As condições exibidas na oferta ou checkout vigente no momento da compra integrarão a relação contratual.
                </p>
                <p>
                  Cobranças poderão ser processadas por provedores especializados de pagamento.
                </p>
                <p>
                  Direitos previstos na legislação de defesa do consumidor, inclusive eventual direito de arrependimento quando legalmente aplicável, serão respeitados e não são afastados por estes Termos.
                </p>
              </section>

              {/* 16. ALTERAÇÃO DE PLANOS E FUNCIONALIDADES */}
              <section id="alteracao-de-planos-e-funcionalidades" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">16.</span> ALTERAÇÃO DE PLANOS E FUNCIONALIDADES
                </h2>
                <p>
                  A StaziaMed Revalida poderá desenvolver, substituir, modificar, incluir ou remover funcionalidades para evolução tecnológica, segurança, adequação regulatória ou melhoria do serviço.
                </p>
                <p>
                  Alterações relevantes que prejudiquem direito já adquirido pelo usuário durante período contratado deverão observar a legislação aplicável e as condições da oferta originalmente realizada.
                </p>
              </section>

              {/* 17. DISPONIBILIDADE DO SERVIÇO */}
              <section id="disponibilidade-do-servico" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">17.</span> DISPONIBILIDADE DO SERVIÇO
                </h2>
                <p>
                  A empresa adotará esforços razoáveis para manter a plataforma estável e segura.
                </p>
                <p>
                  Entretanto, poderão ocorrer interrupções relacionadas a manutenção, atualização, falhas de infraestrutura, provedores externos, indisponibilidade de internet, problemas de segurança, eventos de força maior ou circunstâncias técnicas fora do controle razoável da empresa.
                </p>
                <p>
                  Manutenções e atualizações poderão resultar em indisponibilidade temporária.
                </p>
              </section>

              {/* 18. SERVIÇOS DE TERCEIROS */}
              <section id="servicos-de-terceiros" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">18.</span> SERVIÇOS DE TERCEIROS
                </h2>
                <p>
                  Algumas funcionalidades poderão depender de serviços de terceiros, como autenticação, infraestrutura em nuvem, processamento de pagamentos, comunicações, inteligência artificial ou outras integrações tecnológicas.
                </p>
                <p>
                  Esses serviços poderão estar sujeitos também às condições e políticas próprias dos respectivos fornecedores.
                </p>
                <p>
                  A StaziaMed Revalida não controla indisponibilidades exclusivamente atribuíveis a sistemas de terceiros, sem prejuízo das responsabilidades que lhe sejam impostas pela legislação aplicável.
                </p>
              </section>

              {/* 19. SEGURANÇA E USO INDEVIDO */}
              <section id="seguranca-e-uso-indevido" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">19.</span> SEGURANÇA E USO INDEVIDO
                </h2>
                <p>
                  A empresa poderá aplicar medidas de prevenção e segurança quando identificar indícios razoáveis de fraude, tentativa de invasão, exploração de vulnerabilidades, extração automatizada, compartilhamento irregular de conta ou outras condutas incompatíveis com estes Termos.
                </p>
                <p>
                  As medidas poderão incluir solicitação de nova autenticação, encerramento de sessões, restrição temporária de funcionalidades, bloqueio preventivo ou suspensão de acesso, de forma proporcional à ocorrência identificada.
                </p>
              </section>

              {/* 20. SUSPENSÃO OU ENCERRAMENTO PELA EMPRESA */}
              <section id="suspensao-ou-encerramento-pela-empresa" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">20.</span> SUSPENSÃO OU ENCERRAMENTO PELA EMPRESA
                </h2>
                <p>
                  O acesso poderá ser suspenso ou encerrado em caso de violação relevante destes Termos, fraude, compartilhamento comercial de conta, tentativa de invasão, distribuição não autorizada de conteúdos, utilização ilícita ou comportamento que represente risco à segurança da plataforma ou de terceiros.
                </p>
                <p>
                  Sempre que razoavelmente possível e compatível com a gravidade do caso, poderão ser adotadas medidas gradativas antes do encerramento definitivo.
                </p>
                <p>
                  Direitos assegurados por lei ao consumidor permanecerão preservados.
                </p>
              </section>

              {/* 21. EXCLUSÃO DA CONTA PELO USUÁRIO */}
              <section id="exclusao-da-conta-pelo-usuario" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">21.</span> EXCLUSÃO DA CONTA PELO USUÁRIO
                </h2>
                <p>
                  O usuário poderá solicitar ou realizar a exclusão da própria conta pelos recursos disponibilizados na plataforma.
                </p>
                <p>
                  Quando disponível, o procedimento poderá ser realizado acessando <strong>Perfil → Excluir conta</strong> e seguindo as etapas de confirmação apresentadas pelo sistema.
                </p>
                <p>
                  Após a exclusão, a conta será desativada ou encerrada e o usuário poderá perder acesso ao histórico, treinamentos, ferramentas personalizadas e demais funcionalidades vinculadas à conta.
                </p>
                <p>
                  A exclusão da conta não significa necessariamente eliminação instantânea de todos os dados pessoais. Informações cuja conservação seja necessária para cumprimento de obrigação legal, registros financeiros, segurança, prevenção a fraude ou exercício regular de direitos poderão ser preservadas pelo período necessário, nos termos da LGPD.
                </p>
              </section>

              {/* 22. PROTEÇÃO DE DADOS PESSOAIS */}
              <section id="protecao-de-dados-pessoais" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">22.</span> PROTEÇÃO DE DADOS PESSOAIS
                </h2>
                <p>
                  O tratamento de dados pessoais relacionado à utilização da plataforma é disciplinado pela <strong>Política de Privacidade da StaziaMed Revalida</strong>, que integra estes Termos de Uso.
                </p>
                <p>
                  A LGPD garante ao titular direitos relacionados ao acesso, correção, eliminação em determinadas situações, informações sobre compartilhamento, revogação de consentimento e demais direitos previstos em lei.
                </p>
              </section>

              {/* 23. LIMITES DE RESPONSABILIDADE */}
              <section id="limites-de-responsabilidade" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">23.</span> LIMITES DE RESPONSABILIDADE
                </h2>
                <p>
                  Nada nestes Termos pretende excluir ou restringir responsabilidade que não possa ser legalmente afastada.
                </p>
                <p>
                  A StaziaMed Revalida não será responsável por resultado individual em exames, interpretação incorreta realizada exclusivamente pelo usuário, utilização dos conteúdos fora de sua finalidade educacional ou decisão clínica tomada em desacordo com as advertências expressamente apresentadas nestes Termos, sem prejuízo das responsabilidades previstas na legislação aplicável.
                </p>
              </section>

              {/* 24. ALTERAÇÕES DOS TERMOS */}
              <section id="alteracoes-dos-termos" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">24.</span> ALTERAÇÕES DOS TERMOS
                </h2>
                <p>
                  Estes Termos poderão ser atualizados para refletir mudanças legislativas, regulatórias, tecnológicas, operacionais ou relacionadas às funcionalidades da plataforma.
                </p>
                <p>
                  Alterações substanciais poderão ser comunicadas ao usuário pelos canais disponíveis.
                </p>
                <p>
                  Quando a alteração depender de novo consentimento ou aceite por determinação legal, a plataforma poderá solicitar nova manifestação do usuário.
                </p>
              </section>

              {/* 25. COMUNICAÇÕES E SUPORTE */}
              <section id="comunicacoes-e-suporte" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">25.</span> COMUNICAÇÕES E SUPORTE
                </h2>
                <p>
                  Comunicações oficiais relacionadas à conta poderão ser realizadas pela própria plataforma ou pelos dados de contato cadastrados pelo usuário.
                </p>
                <p>
                  Solicitações de suporte poderão ser realizadas pelos canais oficiais disponibilizados no site ou aplicativo da StaziaMed Revalida.
                </p>
                <p>
                  Assuntos relativos a dados pessoais deverão ser encaminhados ao Canal de Privacidade indicado na Política de Privacidade.
                </p>
              </section>

              {/* 26. LEGISLAÇÃO E FORO */}
              <section id="legislacao-e-foro" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">26.</span> LEGISLAÇÃO E FORO
                </h2>
                <p>
                  Estes Termos são regidos pelas leis da República Federativa do Brasil.
                </p>
                <p>
                  Nas relações sujeitas à legislação de defesa do consumidor serão preservadas integralmente as garantias legais do usuário, inclusive quanto ao foro competente do seu domicílio quando assim assegurado pela legislação aplicável.
                </p>
                <p>
                  Qualquer disposição destes Termos considerada inválida ou inexequível não afetará a validade das demais disposições.
                </p>
              </section>

              {/* 27. DISPOSIÇÕES FINAIS */}
              <section id="disposicoes-finais" className="scroll-mt-24 space-y-3 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-lg sm:text-xl font-bold text-[#0A1C3E] flex items-center gap-2 border-b pb-2 border-slate-200">
                  <span className="text-[#00D2B4]">27.</span> DISPOSIÇÕES FINAIS
                </h2>
                <p>
                  A eventual tolerância quanto ao descumprimento de determinada disposição não constituirá renúncia definitiva ao direito de exigir seu cumprimento posteriormente.
                </p>
                <p>
                  Estes Termos, em conjunto com a Política de Privacidade e as condições comerciais apresentadas no momento de eventual contratação, constituem os principais instrumentos que regulam a relação entre o usuário e a plataforma StaziaMed Revalida.
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
