import React, { useState, useEffect } from "react";
import {
  HelpCircle,
  FileText,
  BookOpen,
  Brain,
  Sparkles,
  Layers,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { QuestionsView } from "./QuestionsView";
import { SimuladosHubView } from "./SimuladosHubView";
import { QuestoesIAView } from "./QuestoesIAView";
import { ProvasCompletasView } from "./ProvasCompletasView";
import { UnifiedOsceView } from "../osce/UnifiedOsceView";

export type PraticarSubTab = "QUESTOES" | "SIMULADOS" | "PROVAS" | "QUESTOES_IA" | "CHECKLISTS";

interface PraticarViewProps {
  initialSubTab?: PraticarSubTab;
}

export const PraticarView: React.FC<PraticarViewProps> = ({ initialSubTab = "QUESTOES" }) => {
  const { activeTab, setActiveTab, setQuestionMode } = useApp();
  const [currentSubTab, setCurrentSubTab] = useState<PraticarSubTab>(initialSubTab);

  useEffect(() => {
    if (activeTab === "praticar-simulados" || activeTab === "ineditas") {
      setCurrentSubTab("SIMULADOS");
    } else if (activeTab === "praticar-provas") {
      setCurrentSubTab("PROVAS");
    } else if (activeTab === "praticar-questoes-ia" || activeTab === "questoes-ia") {
      setCurrentSubTab("QUESTOES_IA");
    } else if (activeTab === "praticar-checklists" || activeTab === "osce" || activeTab === "checklists") {
      setCurrentSubTab("CHECKLISTS");
    } else if (activeTab === "praticar-questoes" || activeTab === "questions") {
      setCurrentSubTab("QUESTOES");
    }
  }, [activeTab]);

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">

      {/* SUBVIEWS */}
      {/* 1. BANCO AVULSO DE QUESTÕES */}
      {currentSubTab === "QUESTOES" && <QuestionsView />}

      {/* 2. SIMULADOS (TELA PRÓPRIA COM 3 ABAS) */}
      {currentSubTab === "SIMULADOS" && <SimuladosHubView />}

      {/* 3. PROVAS COMPLETAS */}
      {currentSubTab === "PROVAS" && <ProvasCompletasView />}

      {/* 4. QUESTÕES IA */}
      {currentSubTab === "QUESTOES_IA" && <QuestoesIAView />}

      {/* 5. BANCO DE CHECKLISTS (OSCE) */}
      {currentSubTab === "CHECKLISTS" && <UnifiedOsceView />}
    </div>
  );
};
