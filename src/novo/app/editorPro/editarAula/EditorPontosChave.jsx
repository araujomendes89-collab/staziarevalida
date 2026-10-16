// Pontos-chave da tela Editar aula com o editor profissional (só Administração; migração 013160). Um parágrafo por ponto (Enter =
// ponto novo). Entra { pontos: texto com um ponto por linha, ricos: formatação alinhada aos pontos }; sai o mesmo par. O que o próprio
// editor mandou não recarrega o editor (o cursor não pula); valor trocado por fora (assistente de IA, outra aula) recarrega.
import React from "react";
import { CampoRico } from "../CampoRico.jsx";
import { campoDosPontos, pontosDoCampo } from "../../../../shared/aulas/camposRicos";

export default function EditorPontosChave({ pontos, ricos, aoMudar, label = "Pontos-chave para o Revalida (um por linha)", hint, disabled = false }) {
  const enviado = React.useRef(null);
  const campo = React.useMemo(() => {
    const e = enviado.current;
    if (e && e.pontos === (pontos ?? "") && e.ricos === ricos) return e.campo;
    return campoDosPontos(pontos ?? "", ricos);
  }, [pontos, ricos]);
  const mudar = (c) => {
    const r = pontosDoCampo(c);
    enviado.current = { pontos: r.pontos, ricos: r.ricos, campo: c };
    aoMudar?.(r);
  };
  return <CampoRico label={label} hint={hint ?? "Um ponto por parágrafo (Enter abre o próximo). Negrito, cor e destaque aparecem para o aluno."} texto={campo.texto} rico={campo.rico} onChange={mudar} disabled={disabled} />;
}
