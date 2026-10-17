// "Avisar a equipe que a avaliação errou": observação opcional (e, se quiser, o item) e o envio para a equipe.
import React from "react";
import { Banner, Button, Dialog, SelectField, Textarea } from "../../../ds";
import { messageOf } from "../../admin/common.jsx";

export const REPORT_NOTE_MAX = 500;

/** `items`: itens da avaliação ({ order, content }); `onSend(order | null, nota)` devolve uma promessa e falha com o erro do servidor. */
export function ReportIaDialog({ items, onSend, onClose }) {
  const [order, setOrder] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSend(order === "" ? null : Number(order), note.trim());
      setSent(true);
    } catch (err) {
      setError(messageOf(err, "Não foi possível enviar o aviso agora. Tente de novo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Avisar a equipe que a avaliação errou"
      description={sent ? undefined : "Conte o que você achou errado. A observação é opcional."}
      onClose={onClose}
      actions={
        sent ? (
          <Button onClick={onClose}>Fechar</Button>
        ) : (
          <>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              Voltar
            </Button>
            <Button icon="send" loading={busy} onClick={send}>
              Enviar aviso
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <Banner tone="success">Aviso enviado.</Banner>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          {error && <Banner tone="danger">{error}</Banner>}
          <SelectField
            label="Sobre qual item?"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            options={[{ value: "", label: "A avaliação inteira" }, ...items.map((item) => ({ value: String(item.order), label: `Item ${item.order}` }))]}
          />
          <Textarea
            label="Observação (opcional)"
            rows={4}
            maxLength={REPORT_NOTE_MAX}
            showCount
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}
    </Dialog>
  );
}
