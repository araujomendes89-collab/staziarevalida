// Um campo com o editor profissional fora das aulas (Questões, Atualizações, Estações, Central...). Só na Administração; carrega
// o editor sob demanda. Entra e sai { texto, rico }: "texto" é o texto oficial do campo (texto + links, sem marcas de formatação) e
// "rico" é a formatação (envelope sdoc) ou null quando o texto já diz tudo. Ver src/shared/docRico/campos.ts.
// somenteTexto: sem formatação (ex.: fala de podcast, que vai para a voz) — o rico sai sempre null.
import React from "react";
import { campoDoDoc, docDoCampo } from "../../../shared/docRico/campos";

const EditorDocumento = React.lazy(() => import("./EditorDocumento.jsx"));

export function CampoRico({ texto, rico, onChange, label, hint, maxLength, disabled = false, somenteTexto = false, contexto, id }) {
  // documento inicial: recalcula só quando o valor muda por fora (Cancelar, outra questão)
  const ultimo = React.useRef(null);
  const chave = JSON.stringify([texto ?? "", rico ?? null]);
  const [valor, setValor] = React.useState(() => docDoCampo(texto, rico));
  React.useEffect(() => {
    if (ultimo.current === chave) return;
    ultimo.current = chave;
    setValor(docDoCampo(texto, rico));
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  const mudar = (doc) => {
    const c = campoDoDoc(doc);
    const saida = somenteTexto ? { texto: c.texto, rico: null } : c;
    ultimo.current = JSON.stringify([saida.texto, saida.rico]);
    onChange?.(saida);
  };
  const tamanho = String(texto ?? "").length;
  return (
    <div className="sm-field">
      {label && <span className="sm-field__label">{label}</span>}
      <React.Suspense fallback={<div className="sm-input" style={{ padding: "12px 16px", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{texto || "Carregando o editor…"}</div>}>
        <EditorDocumento valor={valor} aoMudar={mudar} somenteLeitura={disabled} somenteTexto={somenteTexto} compacto rotulo={label} id={id} contexto={contexto} />
      </React.Suspense>
      {(hint || (maxLength && tamanho > maxLength * 0.9)) && (
        <span className="sm-field__hint" style={maxLength && tamanho > maxLength ? { color: "var(--danger-text)" } : undefined}>
          {hint}
          {maxLength && tamanho > maxLength * 0.9 ? `${hint ? " · " : ""}${tamanho} de ${maxLength} caracteres` : ""}
        </span>
      )}
    </div>
  );
}

export default CampoRico;
