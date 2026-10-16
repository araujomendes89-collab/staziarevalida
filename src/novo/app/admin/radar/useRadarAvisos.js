// Número de mudanças GRAVES que esperam o dono: alimenta a aba, o menu da Administração e a faixa do Início.
// Só o administrador chama (o banco devolve zero para qualquer outro papel). Se a migração ainda não estiver no banco, o erro é
// engolido e nada aparece (sem número, sem faixa).
import React from "react";
import { useSession } from "../../session.jsx";

export const RADAR_MUDOU = "radar-avisos-mudou";
export const avisarRadarMudou = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RADAR_MUDOU));
};
const VAZIO = { graves: 0, vencidas: 0, itens: [] };
const CINCO_MIN = 5 * 60_000;

export function useRadarAvisos(enabled) {
  const { backend } = useSession();
  const [avisos, setAvisos] = React.useState(VAZIO);
  React.useEffect(() => {
    if (!enabled || !backend) {
      setAvisos(VAZIO);
      return undefined;
    }
    let alive = true;
    const load = () =>
      Promise.resolve()
        .then(() => backend.rpc("app_admin_radar_avisos"))
        .then((r) => alive && setAvisos({ graves: Number(r?.graves_pendentes) || 0, vencidas: Number(r?.vencidas) || 0, itens: r?.itens ?? [] }))
        .catch(() => alive && setAvisos(VAZIO));
    load();
    const timer = setInterval(load, CINCO_MIN);
    window.addEventListener(RADAR_MUDOU, load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(RADAR_MUDOU, load);
    };
  }, [enabled, backend]);
  return avisos;
}
