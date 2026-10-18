// Contas pequenas da tela de compra (sem rede). A conferência que vale é a do servidor (server/billing/period.ts: cleanDocument);
// esta só avisa antes, para o aluno corrigir o CPF sem esperar.

/** CPF com os dígitos verificadores certos (11 dígitos; todos iguais não vale). */
export function cpfValido(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Máscara enquanto digita: 000.000.000-00. */
export function formatarCpf(raw) {
  const d = String(raw ?? "").replace(/\D/g, "").slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

/** CPF escondido no resumo: ***.385.446-** */
export function mascararCpf(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "";
}

/** A mesma data daqui a N meses (dia 31 vira o último dia do mês), como a renovação conta. */
export function proximaData(base, meses) {
  const b = new Date(base);
  const alvo = new Date(b.getFullYear(), b.getMonth() + meses, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(b.getDate(), ultimo), 12);
}
