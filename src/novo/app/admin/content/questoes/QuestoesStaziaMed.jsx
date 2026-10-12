// Central de Conteúdo › Questões StaziaMed (antes "Questões inéditas"): gerar com custo à vista, conferir, buscar fonte oficial,
// revisar (revisor médico da área), publicar e recolher (administrador). Nunca é questão oficial do Inep.
import React from "react";
import { Banner, Button } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { LoadError, Loading, useLoad } from "../../common.jsx";
import { DraftList } from "./DraftList.jsx";
import { GeneratePanel } from "./GeneratePanel.jsx";

export function QuestoesStaziaMed({ isAdmin, isStaff, reviewerAreas, go }) {
  const { backend } = useSession();
  const [version, setVersion] = React.useState(0);
  const head = useLoad(() => backend.rpc("app_draft_questions", { p_limit: 1 }), [backend, version]);
  if (head.error) return <LoadError error={head.error} retry={head.reload} />;
  if (!head.data) return <Loading />;
  const acervo = Number(head.data.acervo ?? 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner tone="info" icon="shield-check" title="Questões StaziaMed: não são questões oficiais do Inep">
        Escritas pela StaziaMed só a partir de trechos de fontes oficiais e revisadas por médico. Nenhuma está no treino do aluno antes da aprovação do revisor da área e da publicação do administrador. A "revisão automática" abaixo é apontamento de IA e não vale como aprovação.
      </Banner>
      {acervo > 0 ? (
        <div style={{ font: "var(--type-body-sm)" }}>
          <strong>{acervo}</strong> {acervo === 1 ? "fonte oficial com trechos" : "fontes oficiais com trechos"} no acervo.
        </div>
      ) : (
        <Banner
          tone="warning"
          icon="library"
          title="Cadastre fontes oficiais na Central de Conteúdo"
          action={
            <Button size="sm" variant="secondary" onClick={() => go?.("fontes")}>
              Ir para Fontes oficiais
            </Button>
          }
        >
          Sem fonte oficial com trechos (nível A a D, em vigor), "Gerar" e "Buscar fonte oficial" não produzem nada e não gastam nada.
        </Banner>
      )}
      {isStaff && <GeneratePanel acervo={acervo} onCreated={() => setVersion((v) => v + 1)} />}
      <DraftList isAdmin={isAdmin} isStaff={isStaff} reviewerAreas={reviewerAreas} />
    </div>
  );
}
