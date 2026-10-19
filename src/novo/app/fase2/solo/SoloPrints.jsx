// Impressos do treino sozinho. O servidor manda a lista inteira (nome e número), mas o TEXTO só dos já abertos e do inicial
// (relato do caso). "Pedir impresso" abre um (e registra a hora); a imagem, quando existe, vem pela rota assinada do treino.
import React from "react";
import { Badge, Button, Card, Icon, PrintImage } from "../../../ds";
import { messageOf } from "../../admin/common.jsx";

/** Imagem do impresso pela rota do treino; sem imagem (ou sem servidor) não mostra nada. */
function PrintPicture({ api, attemptId, pressing }) {
  const [src, setSrc] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    if (!pressing.has_image) return undefined;
    Promise.resolve()
      .then(() => api.printUrl(attemptId, pressing.id))
      .then(
        (url) => alive && setSrc(url || null),
        () => alive && setSrc(null)
      );
    return () => {
      alive = false;
    };
  }, [api, attemptId, pressing.id, pressing.has_image]);
  if (!src) return null;
  return <PrintImage src={src} alt={`Imagem do impresso: ${pressing.name}`} canHide />;
}

/** Texto do impresso (quebras de linha como foram gravadas) e a imagem, se houver. */
export function PrintBody({ api, attemptId, pressing }) {
  return (
    <div className="f2-solo-print__body">
      {pressing.content ? <div className="f2-solo-print__text">{pressing.content}</div> : null}
      <PrintPicture api={api} attemptId={attemptId} pressing={pressing} />
    </div>
  );
}

/** Relato do caso (impresso inicial): já vem aberto, sem pedir. */
export function InitialPrint({ api, attemptId, pressing }) {
  return (
    <Card padding={20} style={{ borderRadius: "var(--radius-xl)" }}>
      <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
        {pressing.name || "Relato do caso"}
      </span>
      <PrintBody api={api} attemptId={attemptId} pressing={pressing} />
    </Card>
  );
}

function PrintRow({ api, attemptId, pressing, onOpen }) {
  const [show, setShow] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const label = `Impresso ${pressing.number} · ${pressing.name}`;

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      await onOpen(pressing.id);
    } catch (err) {
      setError(messageOf(err, "Não foi possível abrir o impresso. Tente de novo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="f2-solo-print" data-opened={pressing.opened ? "true" : "false"}>
      <div className="f2-solo-print__head">
        <Icon name={pressing.opened ? "lock-open" : "lock"} size={16} />
        <span className="f2-solo-print__name">{label}</span>
        {pressing.opened ? (
          <>
            <Badge tone="success" size="sm" icon="check">
              Impresso aberto
            </Badge>
            <button
              type="button"
              className="f2-solo-print__toggle"
              aria-expanded={show}
              aria-label={`${show ? "Ocultar" : "Mostrar"} ${label}`}
              onClick={() => setShow(!show)}
            >
              <Icon name={show ? "chevron-up" : "chevron-down"} size={18} />
            </button>
          </>
        ) : (
          <Button size="sm" variant="secondary" icon="eye" loading={busy} onClick={request} aria-label={`Pedir impresso ${pressing.number}: ${pressing.name}`}>
            Pedir impresso
          </Button>
        )}
      </div>
      {error && (
        <div role="alert" className="f2-solo-print__error">
          {error}
        </div>
      )}
      {pressing.opened && show && <PrintBody api={api} attemptId={attemptId} pressing={pressing} />}
    </li>
  );
}

/** Lista "Impressos": só os pedidos pela pessoa (o relato do caso fica junto do enunciado). */
export function PrintList({ api, attemptId, pressings, onOpen }) {
  const requestable = pressings.filter((p) => !p.initial);
  const opened = requestable.filter((p) => p.opened).length;
  return (
    <Card padding={16} style={{ borderRadius: "var(--radius-xl)" }}>
      <div className="f2-solo-prints-head">
        <h2>Impressos</h2>
        {requestable.length > 0 && (
          <Badge size="sm" tone="brand">{`${opened}/${requestable.length} abertos`}</Badge>
        )}
      </div>
      {requestable.length === 0 ? (
        <p className="f2-solo-muted">Esta estação não tem impressos para pedir.</p>
      ) : (
        <ul className="f2-solo-print-list">
          {requestable.map((p) => (
            <PrintRow key={p.id} api={api} attemptId={attemptId} pressing={p} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </Card>
  );
}
