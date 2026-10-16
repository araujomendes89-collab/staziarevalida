const leitores = new Map();

export function registrarLeitor(nomeDoNo, Componente) {
  if (leitores.has(nomeDoNo)) {
    throw new Error(`Leitor para '${nomeDoNo}' já registrado.`);
  }
  leitores.set(nomeDoNo, Componente);
}

export function leitorDe(nome) {
  return leitores.get(nome);
}
