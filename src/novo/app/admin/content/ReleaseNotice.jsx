// Aviso nas Análises de questões: com o modo sombra ligado (ou a publicação desligada) o que o revisor aprova fica guardado e o
// aluno ainda não recebe (CC19). Some quando o administrador libera nas chaves da Configuração.
import React from "react";
import { Banner } from "../../../ds";
import { useSession } from "../../session.jsx";
import { useLoad } from "../common.jsx";

export function ReleaseNotice() {
  const { backend } = useSession();
  const { data } = useLoad(() => backend.rpc("app_ch_flags").catch(() => null), [backend]);
  if (!data || (!data.shadow_mode && data.publish_enabled)) return null;
  return (
    <Banner tone="info" icon="eye" title="O aluno ainda não recebe estas análises">
      {data.shadow_mode ? "O modo sombra está ligado" : "A publicação está desligada"}: as análises e as atualizações que o revisor médico aprova ficam guardadas e não aparecem para o aluno (na correção, no Tutor e na linha do tempo da questão). Elas passam a aparecer quando o administrador desligar o modo sombra e ligar a publicação, em Configuração e custos.
    </Banner>
  );
}
