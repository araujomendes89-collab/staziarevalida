// Administração › Usuários › (uma pessoa) › "Plano por fase (regra nova)" (migração …013690, etapa 3 dos planos).
// Só o administrador. Dá PRO, PRÁTICA ou ELITE até uma data, com motivo (fica no histórico), ou tira o plano dado pela equipe.
// Vale na regra nova (direitos por fase): com os cadeados desligados, só aparece no diagnóstico; ligados, passa a valer.
// O PRÁTICA não existe no plano antigo (acima): é dado só por aqui. Sem a migração no banco, o bloco não aparece.
import React from "react";
import {
  Badge,
  Banner,
  Button,
  Card,
  SelectField,
  TextField,
} from "../../../ds";
import { useSession } from "../../session.jsx";
import { fromDateInput, messageOf } from "../common.jsx";

const SEM_FUNCAO =
  /could not find the function|schema cache|does not exist|PGRST202|42883/i;
const PERFIL = {
  elite: "ELITE",
  pro: "PRO",
  pratica: "PRÁTICA",
  teste: "Em teste grátis",
  vencido: "Vencido (amostra)",
  sem_acesso: "Sem acesso",
  equipe: "Equipe ou revisor",
};

export function PlanoPorFaseUsuario({ email }) {
  const { backend } = useSession();
  const [info, setInfo] = React.useState({
    loading: true,
    data: null,
    missing: false,
    error: null,
  });
  const [form, setForm] = React.useState({
    plano: "pratica",
    ate: "",
    motivo: "",
  });
  const [st, setSt] = React.useState({
    saving: false,
    error: null,
    aviso: null,
  });
  React.useEffect(() => {
    let vivo = true;
    backend
      .rpc("app_admin_direitos_aluno", { p_busca: email })
      .then(
        (data) =>
          vivo &&
          setInfo({ loading: false, data, missing: false, error: null }),
      )
      .catch(
        (error) =>
          vivo &&
          setInfo({
            loading: false,
            data: null,
            missing: SEM_FUNCAO.test(String(error?.message ?? error)),
            error: messageOf(error),
          }),
      );
    return () => {
      vivo = false;
    };
  }, [backend, email]);
  // sem a migração no banco, ou quem não é administrador (o banco recusa): o bloco não aparece
  if (info.loading || info.missing || !info.data) return null;
  const fases = info.data?.regra_nova?.fases ?? {};
  const daEquipe = ["teoria", "pratica"].filter(
    (f) => fases[f]?.origem === "equipe",
  );
  const agir = async (fn, args) => {
    setSt({ saving: true, error: null, aviso: null });
    try {
      const data = await backend.rpc(fn, args);
      setInfo({ loading: false, data, missing: false, error: null });
      setSt({ saving: false, error: null, aviso: data?.aviso ?? null });
    } catch (error) {
      setSt({ saving: false, error: messageOf(error), aviso: null });
    }
  };
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="sm-field__label">Plano por fase (regra nova)</div>
        {info.error && <Banner tone="danger">{info.error}</Banner>}
        {info.data && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Badge tone="brand">
              {PERFIL[info.data.regra_nova.perfil] ??
                info.data.regra_nova.perfil}
            </Badge>
            <Badge>
              {info.data.regra_nova.modo === "ligado"
                ? "Cadeados ligados"
                : "Modo sombra (ainda não vale)"}
            </Badge>
            {daEquipe.length > 0 && (
              <Badge tone="warning">Plano dado pela equipe</Badge>
            )}
          </div>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            gap: 12,
          }}
        >
          <SelectField
            label="Plano"
            value={form.plano}
            onChange={(e) => setForm({ ...form, plano: e.target.value })}
            options={[
              { value: "pro", label: "PRO (1ª fase)" },
              { value: "pratica", label: "PRÁTICA (2ª fase)" },
              { value: "elite", label: "ELITE (as duas)" },
            ]}
          />
          <TextField
            label="Até"
            type="date"
            value={form.ate}
            onChange={(e) => setForm({ ...form, ate: e.target.value })}
          />
          <TextField
            label="Motivo (obrigatório)"
            value={form.motivo}
            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
          />
        </div>
        <div
          style={{
            font: "var(--type-body-sm)",
            color: "var(--text-secondary)",
          }}
        >
          O PRÁTICA só pode ser dado por aqui. Enquanto a 2ª fase estiver
          fechada, a pessoa só verá a prática quando ela abrir. Nada é cobrado.
        </div>
        {st.error && <Banner tone="danger">{st.error}</Banner>}
        {st.aviso && <Banner tone="warning">{st.aviso}</Banner>}
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
        >
          {daEquipe.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              loading={st.saving}
              onClick={() => {
                const motivo = window.prompt(
                  "Motivo para tirar o plano dado pela equipe:",
                );
                if (motivo)
                  agir("app_admin_direitos_tirar_plano", {
                    p_busca: email,
                    p_motivo: motivo,
                  });
              }}
            >
              Tirar plano dado pela equipe
            </Button>
          )}
          <Button
            size="sm"
            loading={st.saving}
            onClick={() =>
              agir("app_admin_direitos_dar_plano", {
                p_busca: email,
                p_plano: form.plano,
                p_ate: fromDateInput(form.ate),
                p_motivo: form.motivo,
              })
            }
          >
            Dar plano por fase
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * Administração › Planos › "Testes com verificação pedida" (alerta de IP da etapa 3): muitos testes do mesmo IP em poucos dias.
 * O teste da pessoa vale normalmente (nunca bloqueia); a equipe confere e marca como verificado. Sem a migração, não aparece.
 */
export function TestesComAlerta() {
  const { backend } = useSession();
  const [st, setSt] = React.useState({ loading: true, lista: null, error: null });
  const carregar = React.useCallback(() => {
    backend
      .rpc("app_admin_testes_alerta")
      .then((lista) => setSt({ loading: false, lista, error: null }))
      .catch((error) => setSt({ loading: false, lista: null, error: SEM_FUNCAO.test(String(error?.message ?? error)) ? null : messageOf(error) }));
  }, [backend]);
  React.useEffect(() => carregar(), [carregar]);
  if (st.loading || (!st.lista && !st.error)) return null;
  const verificar = async (email) => {
    try {
      setSt({ loading: false, lista: await backend.rpc("app_admin_teste_verificado", { p_busca: email }), error: null });
    } catch (error) {
      setSt((s) => ({ ...s, error: messageOf(error) }));
    }
  };
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Testes com verificação pedida</h3>
        <p style={{ margin: 0, color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>
          Muitos testes do mesmo IP em poucos dias. O teste vale normalmente (nunca é bloqueado); só guardamos um código do IP, por 90 dias.
        </p>
        {st.error && <Banner tone="danger">{st.error}</Banner>}
        {st.lista?.length === 0 && <span style={{ font: "var(--type-body-sm)" }}>Nenhum nos últimos 90 dias.</span>}
        {st.lista?.map((t) => (
          <div key={t.email} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", font: "var(--type-body-sm)" }}>
            <span>{t.email}</span>
            <Badge size="sm" tone={t.verificacao === "feita" ? "success" : "warning"}>{t.verificacao === "feita" ? "Verificado" : "Verificação pedida"}</Badge>
            {t.verificacao === "pedida" && (
              <Button size="sm" variant="ghost" onClick={() => verificar(t.email)}>
                Marcar como verificado
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
