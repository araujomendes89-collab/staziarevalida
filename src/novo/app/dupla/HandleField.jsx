// Treino em Dupla · campo "Nome de usuário (@)" do perfil de estudo (migrações 014000/014010). O servidor sorteia um @ neutro
// ("revalida.k7m2") ao criar o perfil; a pessoa pode trocar. Enquanto digita, a tela pergunta ao servidor e mostra "Disponível." ou o
// motivo ("Esse @ já está em uso." etc.). No máximo 1 troca a cada 15 dias; o @ sorteado não conta. Trocar o @ NÃO muda o nome
// público nem nada que dependa da conta.
import React from "react";
import { TextField } from "../../ds";
import { useSession } from "../session.jsx";

const clean = (v) => String(v ?? "").replace(/^@+/, "").trim().toLowerCase();

/**
 * @param {{ saved: string, value: string, onChange(v: string): void, hasProfile: boolean }} p
 *   saved: o @ gravado ("" sem perfil); value: o que está no campo; o aviso de espera vem do servidor.
 */
export function HandleField({ saved, value, onChange, hasProfile }) {
  const { backend } = useSession();
  const [info, setInfo] = React.useState(null); // resposta de app_dupla_handle_check para `value`
  const [wait, setWait] = React.useState(null); // { message } quando a troca está travada pelos 15 dias
  const v = clean(value);
  const same = v === clean(saved);

  // Quando a pessoa poderá trocar: pergunta uma vez pelo @ atual.
  React.useEffect(() => {
    let alive = true;
    if (!hasProfile || !saved) return undefined;
    Promise.resolve(backend.rpc("app_dupla_handle_check", { p_handle: saved }))
      .then((r) => alive && setWait(r?.next_change_at ? { message: r.next_change_message ?? "" } : null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [backend, hasProfile, saved]);

  // "Disponível" ou o motivo, enquanto digita (espera 400 ms depois da última tecla).
  React.useEffect(() => {
    let alive = true;
    setInfo(null);
    if (same || !v) return undefined;
    const timer = setTimeout(() => {
      Promise.resolve(backend.rpc("app_dupla_handle_check", { p_handle: v }))
        .then((r) => alive && setInfo(r ?? null))
        .catch(() => {});
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [backend, v, same]);

  const locked = Boolean(wait) && hasProfile;
  const status = same ? null : info;
  const hint = locked
    ? wait.message
    : status?.ok
      ? "Disponível."
      : same
        ? hasProfile
          ? "Seu @ atual. Você pode trocar a cada 15 dias."
          : "Esse @ foi sorteado para você. Pode trocar depois de salvar o perfil, a cada 15 dias."
        : undefined;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <TextField
        label="Nome de usuário (@)"
        icon="at-sign"
        value={locked ? clean(saved) : value}
        maxLength={21}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        disabled={locked}
        onChange={(e) => onChange(clean(e.target.value.replace(/\s+/g, "")))}
        placeholder={hasProfile ? "ex.: ana.cirurgia" : "Será sorteado ao salvar; você pode escolher o seu"}
        error={!locked && status && !status.ok ? status.message : undefined}
        hint={hint}
      />
      <span style={{ font: "12px/1.45 var(--font-sans)", color: "var(--text-tertiary)" }}>
        De 3 a 20 caracteres: letras minúsculas, números, ponto ou sublinhado. Trocar o @ não muda seu nome.
      </span>
    </div>
  );
}
