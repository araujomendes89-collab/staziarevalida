// Administração › Configurações › Convites diretos do radar (migração 013470). Só administrador.
// Três limites ainda a definir pelo dono (D9 de 12/10): convites por hora, por dia e espera para reconvidar a mesma pessoa depois
// de recusa ou vencimento. CAMPO VAZIO = SEM LIMITE. "1 convite pendente por vez" é fixo, por segurança. Nada aqui tem número
// de partida: os valores vêm do banco (app_settings.treino_dupla › convites) e começam vazios.
import React from "react";
import { Banner, Button, Card, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { dateTimeBR, LoadError, Loading, messageOf, useLoad } from "./common.jsx";

const toForm = (v) => ({
  por_hora: v?.por_hora != null ? String(v.por_hora) : "",
  por_dia: v?.por_dia != null ? String(v.por_dia) : "",
  espera_min: v?.espera_min != null ? String(v.espera_min) : "",
  pedidos_por_dia: v?.pedidos_por_dia != null ? String(v.pedidos_por_dia) : "",
});
const num = (s) => (String(s).trim() === "" ? null : Number(s));

export function AdminDuplaConvites() {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_dupla_radar"), [backend]);
  const [form, setForm] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  React.useEffect(() => {
    if (data) setForm(toForm(data.convites));
  }, [data]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!form) return <Loading />;
  const change = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setState((s) => ({ ...s, done: false }));
  };
  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null, done: false });
    try {
      const saved = await backend.rpc("app_admin_save_dupla_radar", {
        p_config: { convites: { por_hora: num(form.por_hora), por_dia: num(form.por_dia), espera_min: num(form.espera_min), pedidos_por_dia: num(form.pedidos_por_dia) } },
      });
      setForm(toForm(saved.convites));
      setState({ saving: false, error: null, done: true });
    } catch (err) {
      setState({ saving: false, error: messageOf(err), done: false });
    }
  };
  const semLimite = !form.por_hora.trim() && !form.por_dia.trim() && !form.espera_min.trim() && !form.pedidos_por_dia.trim();
  return (
    <form onSubmit={save} noValidate>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Convites diretos: limites</h3>
          <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            Cada aluno só pode ter 1 convite aguardando resposta por vez, e 1 pedido de treino pendente por colega (fixo). Os outros limites ficam em branco até você definir: campo vazio é sem limite.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <TextField label="Convites por hora (por aluno)" hint="1 a 60. Vazio: sem limite." type="number" inputMode="numeric" value={form.por_hora} onChange={(e) => change({ por_hora: e.target.value })} />
            <TextField label="Convites por dia (por aluno)" hint="1 a 200. Vazio: sem limite." type="number" inputMode="numeric" value={form.por_dia} onChange={(e) => change({ por_dia: e.target.value })} />
            <TextField
              label="Espera para reconvidar a mesma pessoa (minutos)"
              hint="Depois de recusa ou vencimento. 1 a 1440. Vazio: sem espera."
              type="number"
              inputMode="numeric"
              value={form.espera_min}
              onChange={(e) => change({ espera_min: e.target.value })}
            />
            <TextField
              label="Pedidos de treino por link, por dia (por aluno)"
              hint="Para colegas fora do ar. 1 a 200. Vazio: sem limite."
              type="number"
              inputMode="numeric"
              value={form.pedidos_por_dia}
              onChange={(e) => change({ pedidos_por_dia: e.target.value })}
            />
          </div>
          {semLimite && <Banner tone="warning">Hoje não há limite por hora, por dia, por espera nem de pedidos: só 1 convite pendente por vez.</Banner>}
          {state.error && <Banner tone="danger">{state.error}</Banner>}
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
            {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Configurações salvas.</span>}
            <Button type="submit" loading={state.saving}>
              Salvar limites dos convites
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}

/** Aba "Denúncias do chat" (equipe): as trocas de @ dos alunos, da mais nova para a mais antiga (quem, de, para, quando). Sem e-mail. */
export function AdminDuplaHandleLog() {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_dupla_handle_log", { p_limit: 50 }), [backend]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const items = Array.isArray(data.items) ? data.items : [];
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Trocas de @ no Treino em Dupla</h3>
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          O @ sorteado ao criar o perfil não aparece aqui: só as trocas feitas pelo aluno (no máximo uma a cada 15 dias).
        </p>
        {items.length === 0 ? (
          <span style={{ font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Nenhuma troca até agora.</span>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it) => (
              <li key={it.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline", font: "var(--type-body-sm)" }}>
                <b>{it.public_name}</b>
                <span style={{ fontFamily: "var(--font-mono)" }}>{`@${it.old_handle ?? "—"} → @${it.new_handle}`}</span>
                <span style={{ color: "var(--text-tertiary)" }}>{dateTimeBR(it.changed_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
