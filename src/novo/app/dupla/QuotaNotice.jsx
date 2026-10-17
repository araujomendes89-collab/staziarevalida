// Treino em Dupla · "Sua cota de matches acabou". Só informa: sem botão de pagar, sem preço, sem link de compra.
import React from "react";
import { Banner, Button, Dialog } from "../../ds";
import { QUOTA_CLOSE, QUOTA_NOTE, QUOTA_TEXT, QUOTA_TITLE } from "./credits.js";

export function QuotaNotice({ open, onClose }) {
  if (!open) return null;
  return (
    <Dialog
      title={QUOTA_TITLE}
      description={QUOTA_TEXT}
      onClose={onClose}
      actions={
        <Button variant="secondary" onClick={onClose}>
          {QUOTA_CLOSE}
        </Button>
      }
    >
      <Banner tone="info">{QUOTA_NOTE}</Banner>
    </Dialog>
  );
}
