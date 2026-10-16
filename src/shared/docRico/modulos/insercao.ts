// Módulo inserção do editor profissional (M4): símbolos, data e hora e janela de hiperlink.
// Nada novo no formato do documento: símbolos e data entram como texto comum e o link usa a marca "link" do núcleo
// (só https, saneada pelo registro). Este arquivo guarda as regras puras, testáveis sem o editor.
import { hrefValido } from "../../textoRico";

/** Normaliza o que o usuário digitou na janela de link. Devolve o endereço https válido ou null (e o motivo). */
export function normalizarLink(entrada: string): { href: string } | { erro: string } {
  let s = String(entrada ?? "").trim();
  if (!s) return { erro: "Digite o endereço do link." };
  if (!/^https:\/\//i.test(s)) {
    // qualquer outro esquema (http:, javascript:, mailto:...) é recusado; "exemplo.com.br" vira https://exemplo.com.br
    if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) return { erro: "Só são aceitos endereços que começam com https://" };
    s = `https://${s.replace(/^\/\//, "")}`;
  }
  if (!hrefValido(s)) return { erro: "Endereço inválido. Confira se não há espaços e se começa com https://" };
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || !u.hostname.includes(".")) return { erro: "Endereço inválido. Confira o site." };
  } catch {
    return { erro: "Endereço inválido." };
  }
  return { href: s };
}

export const GRUPOS_SIMBOLOS: { id: string; rotulo: string; itens: string[] }[] = [
  { id: "medida", rotulo: "Unidades e medidas", itens: ["µ", "°", "′", "″", "‰", "%", "±", "×", "÷", "≈", "≠", "≤", "≥", "<", ">", "∞", "√", "²", "³", "¹", "⁰", "⁺", "⁻", "½", "¼", "¾", "Ω", "℃", "℉"] },
  { id: "setas", rotulo: "Setas", itens: ["→", "←", "↑", "↓", "↔", "⇒", "⇐", "⇔", "↗", "↘", "↑↓", "↺"] },
  { id: "gregas", rotulo: "Letras gregas", itens: ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "κ", "λ", "μ", "π", "ρ", "σ", "τ", "φ", "χ", "ψ", "ω", "Δ", "Σ", "Φ", "Ψ", "Ω"] },
  { id: "texto", rotulo: "Texto", itens: ["•", "·", "–", "—", "…", "§", "¶", "©", "®", "™", "«", "»", "“", "”", "‘", "’", "†", "‡", "✓", "✗", "※", "№"] },
];

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const p2 = (n: number) => String(n).padStart(2, "0");

export type FormatoData = "curta" | "longa" | "hora" | "dataHora";
export const FORMATOS_DATA: { id: FormatoData; rotulo: string }[] = [
  { id: "curta", rotulo: "Data curta" },
  { id: "longa", rotulo: "Data por extenso" },
  { id: "hora", rotulo: "Hora" },
  { id: "dataHora", rotulo: "Data e hora" },
];

/** Texto de data/hora em português do Brasil, no horário local. Não usa Intl para dar o mesmo resultado em qualquer máquina. */
export function formatarDataHora(d: Date, formato: FormatoData): string {
  const curta = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
  const longa = `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  const hora = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  if (formato === "longa") return longa;
  if (formato === "hora") return hora;
  if (formato === "dataHora") return `${curta} ${hora}`;
  return curta;
}
