// Comandos de tabela que o TipTap não traz pronto: largura da coluna e cor de fundo das células selecionadas.
import { selectedRect, isInTable } from "@tiptap/pm/tables";

export const LARGURAS = [
  { valor: "", rotulo: "Largura: automática" },
  { valor: "60", rotulo: "Muito estreita (60)" },
  { valor: "100", rotulo: "Estreita (100)" },
  { valor: "140", rotulo: "Média (140)" },
  { valor: "200", rotulo: "Larga (200)" },
  { valor: "280", rotulo: "Muito larga (280)" },
  { valor: "400", rotulo: "Extra larga (400)" },
];

// Cores claras (boas para texto escuro por cima). Mesmo conjunto que o aluno e o PDF recebem (saneado como cor).
export const CORES_CELULA = [
  { valor: "", rotulo: "Cor da célula: nenhuma" },
  { valor: "#fde68a", rotulo: "Amarelo" },
  { valor: "#fecaca", rotulo: "Vermelho claro" },
  { valor: "#fed7aa", rotulo: "Laranja" },
  { valor: "#bbf7d0", rotulo: "Verde claro" },
  { valor: "#bfdbfe", rotulo: "Azul claro" },
  { valor: "#ddd6fe", rotulo: "Lilás" },
  { valor: "#e5e7eb", rotulo: "Cinza" },
];

/** Define (ou tira, com null) a largura em px de todas as colunas tocadas pela seleção. Só células sem mesclagem horizontal. */
export function definirLarguraColuna(editor, px) {
  const { state } = editor;
  if (!isInTable(state)) return false;
  const rect = selectedRect(state);
  const { map, tableStart } = rect;
  const tr = state.tr;
  const vistos = new Set();
  for (let col = rect.left; col < rect.right; col++) {
    for (let linha = 0; linha < map.height; linha++) {
      const pos = map.map[linha * map.width + col];
      if (vistos.has(pos)) continue;
      vistos.add(pos);
      const no = state.doc.nodeAt(tableStart + pos);
      if (!no || Number(no.attrs.colspan ?? 1) !== 1) continue;
      tr.setNodeMarkup(tableStart + pos, null, { ...no.attrs, largura: px ?? null });
    }
  }
  if (!tr.docChanged) return false;
  editor.view.dispatch(tr);
  return true;
}

/** Limites do que se pode pedir na janela "Inserir tabela". */
export const LIMITES = { linhas: [1, 30], colunas: [1, 10] };
export const limitar = (v, [min, max]) => Math.min(max, Math.max(min, Math.round(Number(v)) || min));
