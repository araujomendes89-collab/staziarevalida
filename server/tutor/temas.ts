// A memória do aluno (tutor_learning_memory) traz as subáreas pelo código do motor ("NEONATOLOGY"). Antes de virar contexto da IA
// do Tutor, tudo passa para o nome em português; código sem nome sai da lista (a IA não recebe nem fala o código).
import { subareaParaIA } from "../../src/shared/questions/taxonomia";

interface Memoria {
  weak_subareas?: { subarea: string }[] | null;
  profile?: { strongest_topics?: string[] | null; weak_topics?: string[] | null } | null;
}

const nomes = (lista: unknown): string[] => (Array.isArray(lista) ? lista.map(subareaParaIA).filter((x): x is string => Boolean(x)) : []);

export function temasParaIA<T extends Memoria>(mem: T | null | undefined): T | null {
  if (!mem) return null;
  const out: T = { ...mem };
  if (Array.isArray(mem.weak_subareas)) {
    out.weak_subareas = mem.weak_subareas
      .map((w) => ({ ...w, subarea: subareaParaIA(w?.subarea) }))
      .filter((w): w is typeof w & { subarea: string } => Boolean(w.subarea));
  }
  if (mem.profile && typeof mem.profile === "object") {
    out.profile = { ...mem.profile, strongest_topics: nomes(mem.profile.strongest_topics), weak_topics: nomes(mem.profile.weak_topics) };
  }
  return out;
}
