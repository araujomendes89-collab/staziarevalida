// Abre um arquivo protegido (que precisa ser baixado antes, com o token da sessão) numa aba nova SEM ser barrado como janela pop-up.
// O navegador só libera window.open feito direto no clique; depois de esperar a rede ele barra. Por isso a aba é aberta já no clique
// (em branco) e só depois recebe o endereço do arquivo. Se mesmo assim o navegador não abrir a aba, o arquivo é baixado.

/**
 * @param {() => Promise<string>} getUrl devolve o endereço (blob ou assinado) do arquivo; é chamado depois de a aba abrir
 * @param {string} [filename] nome do arquivo se for preciso baixar
 * @returns {Promise<"aberto" | "baixado">}
 */
export async function openFileInTab(getUrl, filename = "arquivo.pdf") {
  const win = window.open("about:blank", "_blank");
  if (win) win.opener = null;
  try {
    const url = await getUrl();
    if (win && !win.closed) {
      win.location.href = url;
      return "aberto";
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return "baixado";
  } catch (error) {
    if (win && !win.closed) win.close();
    throw error;
  }
}
