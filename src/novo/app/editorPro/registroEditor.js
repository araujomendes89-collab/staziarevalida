export const ABAS = [
  { id: "inicio", rotulo: "Página inicial" },
  { id: "inserir", rotulo: "Inserir" },
  { id: "layout", rotulo: "Layout" },
  { id: "revisao", rotulo: "Revisão" },
  { id: "exibir", rotulo: "Exibir" },
  { id: "ia", rotulo: "IA" }
];

// Nome que aparece embaixo de cada grupo de botões. Módulo com grupo novo pode mandar "rotuloGrupo" no botão.
export const ROTULOS_GRUPO = { historico: "Desfazer", fonte: "Fonte", paragrafo: "Parágrafo", tabela: "Tabela" };

const registros = {
  extensoes: [], // Array of functions: (ctx) => Extension[]
  botoes: [],    // Array of objects
  paineis: []    // Array of objects
};

const modulosCarregados = new Set();
const botoesAbaMap = new Map(); // abaId -> []

export function registrarModuloEditor(m) {
  if (modulosCarregados.has(m.id)) {
    throw new Error(`Módulo do editor profissional '${m.id}' já registrado.`);
  }
  modulosCarregados.add(m.id);

  if (m.extensoes) {
    const fn = (ctx) => m.extensoes(ctx);
    fn.modulo = m.id;
    registros.extensoes.push(fn);
  }

  if (m.botoes) {
    for (const b of m.botoes) {
      if (!ABAS.find(a => a.id === b.aba)) {
        throw new Error(`Aba '${b.aba}' inválida no módulo '${m.id}'.`);
      }
      if (b.rotuloGrupo && !ROTULOS_GRUPO[b.grupo]) ROTULOS_GRUPO[b.grupo] = b.rotuloGrupo;
      if (!botoesAbaMap.has(b.aba)) {
        botoesAbaMap.set(b.aba, []);
      }
      botoesAbaMap.get(b.aba).push({ ...b, modulo: m.id });
    }
  }

  if (m.paineis) {
    for (const p of m.paineis) {
      registros.paineis.push({ ...p, modulo: m.id });
    }
  }
}

export function modulosEditor() {
  return Array.from(modulosCarregados);
}

// semModulos: ids de módulos que este editor não carrega (ex.: campo de questão sem imagens, ver CampoRico.jsx)
export function extensoesDe(ctx, semModulos = []) {
  return registros.extensoes.filter(fn => !semModulos.includes(fn.modulo)).flatMap(fn => fn(ctx));
}

export function botoesDaAba(abaId) {
  const arr = botoesAbaMap.get(abaId) || [];
  return [...arr].sort((a, b) => {
    if (a.ordem !== b.ordem) return a.ordem - b.ordem;
    return a.id.localeCompare(b.id);
  });
}

export function paineis() {
  return registros.paineis;
}
