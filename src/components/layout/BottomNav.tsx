import React from "react";
import { Home, HelpCircle, Target, Calendar, BarChart2 } from "lucide-react";
import { useApp, NavTab } from "../../context/AppContext";

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();

  const navItems: { id: NavTab; label: string; icon: React.ElementType }[] = [
    { id: "home", label: "Início", icon: Home },
    { id: "praticar-questoes", label: "Questões", icon: HelpCircle },
    { id: "estudar-grandes-temas", label: "Temas", icon: Target },
    { id: "planejamento", label: "Planos", icon: Calendar },
    { id: "desempenho", label: "Métricas", icon: BarChart2 },
  ];

  return (
    <nav
      id="mobile-bottom-navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B192C]/95 backdrop-blur-md border-t border-slate-800/80 px-1 pt-1.5 flex justify-around items-center shadow-lg mobile-safe-bottom"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          (item.id === "home" && activeTab === "home") ||
          (item.id === "praticar-questoes" &&
            (activeTab === "praticar-questoes" ||
              activeTab === "praticar" ||
              activeTab === "questions" ||
              activeTab === "ineditas" ||
              activeTab === "questoes-ia" ||
              activeTab === "praticar-simulados" ||
              activeTab === "praticar-provas")) ||
          (item.id === "estudar-grandes-temas" &&
            (activeTab === "estudar-grandes-temas" ||
              activeTab === "grandes-temas" ||
              activeTab === "estudar" ||
              activeTab === "estudar-aulas" ||
              activeTab === "estudar-materiais" ||
              activeTab === "estudar-plano-hoje" ||
              activeTab === "official-search")) ||
          (item.id === "planejamento" &&
            (activeTab.startsWith("planejamento") ||
              activeTab === "calendario-inteligente" ||
              activeTab === "calendar")) ||
          (item.id === "desempenho" &&
            (activeTab.startsWith("desempenho") ||
              activeTab === "progress" ||
              activeTab === "pattern-engine" ||
              activeTab === "matrix"));

        return (
          <button
            key={item.id}
            id={`mobile-bottom-${item.id}`}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl text-[10px] font-medium transition-all cursor-pointer min-h-[44px] flex-1 max-w-[76px] ${
              isActive
                ? "text-teal-300 bg-teal-500/10 font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon className={`w-5 h-5 mb-0.5 ${isActive ? "text-teal-400" : "text-slate-400"}`} />
            <span className="truncate w-full text-center">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};


