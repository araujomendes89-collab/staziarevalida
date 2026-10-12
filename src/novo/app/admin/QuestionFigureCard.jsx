// Figura da questão (Q07, leva 3): a equipe toda envia, troca e tira a figura. Uma figura por questão, texto alternativo
// obrigatório, PNG ou JPG de até 5 MB. O arquivo vai para o depósito privado pelo servidor (/api/question-figures); o banco é
// quem confere de novo as regras. Fica dentro do formulário da questão, então Enter num campo daqui não envia a questão.
import React from "react";
import { Banner, Button, Card, Icon, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { FigureImage } from "../practice/QuestionFigures.jsx";
import { messageOf } from "./common.jsx";
import { FIGURE_MAX_BYTES, FIGURE_MAX_MB, figureErrorText, figureFileType, removeQuestionFigure, uploadQuestionFigure } from "./questionFiguresApi.js";

const ALT_MIN = 10;
const ALT_MAX = 300;

export function QuestionFigureCard({ question, isNew, onChanged }) {
  const { backend } = useSession();
  const images = question.images ?? [];
  const many = images.length > 1;
  const current = images.length === 1 ? images[0] : null;
  const [mode, setMode] = React.useState("view"); // view | send | confirm-remove
  const [file, setFile] = React.useState(null);
  const [alt, setAlt] = React.useState("");
  const [state, setState] = React.useState({ busy: false, error: null, note: null });
  const altText = alt.trim();
  const altOk = altText.length >= ALT_MIN && altText.length <= ALT_MAX;
  const sending = mode === "send" || (!current && !many);

  const pick = (event) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    if (!figureFileType(chosen)) return setState({ busy: false, error: "Envie a figura em PNG ou JPG.", note: null }), setFile(null);
    if (chosen.size > FIGURE_MAX_BYTES) return setState({ busy: false, error: `A figura pode ter no máximo ${FIGURE_MAX_MB} MB.`, note: null }), setFile(null);
    setFile(chosen);
    setState({ busy: false, error: null, note: null });
  };

  const send = async () => {
    if (!file || !altOk || state.busy) return;
    setState({ busy: true, error: null, note: null });
    try {
      const saved = await uploadQuestionFigure(backend, question.id, file, altText);
      setFile(null);
      setAlt("");
      setMode("view");
      setState({ busy: false, error: null, note: "Figura enviada." });
      onChanged(saved);
    } catch (error) {
      setState({ busy: false, error: figureErrorText(error), note: null });
    }
  };

  const remove = async () => {
    setState({ busy: true, error: null, note: null });
    try {
      const saved = await removeQuestionFigure(backend, question.id);
      setMode("view");
      setState({ busy: false, error: null, note: "Figura retirada." });
      onChanged(saved);
    } catch (error) {
      setState({ busy: false, error: figureErrorText(error) || messageOf(error), note: null });
    }
  };

  return (
    <section
      aria-label="Figura da questão"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target?.tagName === "INPUT") event.preventDefault();
      }}
    >
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Figura da questão</h3>
          {isNew ? (
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Salve a questão primeiro para enviar a figura.</div>
          ) : many ? (
            <>
              <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
                {`Esta questão tem ${images.length} figuras vindas do caderno oficial. O envio trabalha com uma figura por questão e não troca nem tira essas.`}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {images.map((image, i) => (
                  <div key={image.url ?? image.path ?? i} style={{ maxWidth: 220 }}>
                    <FigureImage questionId={question.id} image={image} index={i} style={{ maxHeight: 140 }} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {current && (
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ maxWidth: 240 }}>
                    <FigureImage questionId={question.id} image={current} index={0} style={{ maxHeight: 180 }} />
                  </div>
                  <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 4 }}>
                    <div className="sm-field__label">Texto alternativo</div>
                    <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{current.alt}</div>
                  </div>
                </div>
              )}
              {!current && (
                <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
                  {question.needs_image
                    ? "Esta questão ainda não tem figura. Ela cita uma figura, então fica fora dos treinos até a figura ser enviada."
                    : "Esta questão ainda não tem figura."}
                </div>
              )}
              {state.note && (
                <div role="status" style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>
                  {state.note}
                </div>
              )}
              {mode === "confirm-remove" && (
                <Banner tone="warning" title="Tirar a figura?">
                  {question.needs_image
                    ? "Esta questão cita uma figura: sem ela, a questão sai dos treinos até uma nova figura ser enviada."
                    : "A questão continua nos treinos, agora sem figura."}
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <Button size="sm" variant="danger" onClick={remove} loading={state.busy}>
                      Sim, tirar a figura
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setMode("view")} disabled={state.busy}>
                      Cancelar
                    </Button>
                  </div>
                </Banner>
              )}
              {sending ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <label className="sm-btn sm-btn--secondary sm-btn--sm" style={{ cursor: "pointer" }}>
                      <Icon name="image" size={16} /> {file ? "Escolher outro arquivo" : "Escolher figura"}
                      <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={pick} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} aria-label="Arquivo da figura" />
                    </label>
                    <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{file ? "Arquivo escolhido." : `PNG ou JPG, até ${FIGURE_MAX_MB} MB. O nome do arquivo não aparece para o aluno.`}</span>
                  </div>
                  <TextField
                    label="Texto alternativo da figura"
                    value={alt}
                    maxLength={ALT_MAX}
                    onChange={(e) => setAlt(e.target.value)}
                    hint={`Descreva a imagem para quem não a vê (de ${ALT_MIN} a ${ALT_MAX} letras). Aparece para leitores de tela e no lugar da imagem se ela não carregar.`}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button size="sm" onClick={send} loading={state.busy} disabled={!file || !altOk}>
                      Enviar figura
                    </Button>
                    {current && (
                      <Button size="sm" variant="ghost" onClick={() => (setMode("view"), setFile(null), setState({ busy: false, error: null, note: null }))} disabled={state.busy}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                mode === "view" &&
                current && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button size="sm" variant="secondary" onClick={() => (setAlt(current.alt ?? ""), setMode("send"), setState({ busy: false, error: null, note: null }))}>
                      Trocar figura
                    </Button>
                    <Button size="sm" variant="ghost" icon="trash-2" onClick={() => (setMode("confirm-remove"), setState({ busy: false, error: null, note: null }))}>
                      Tirar figura
                    </Button>
                  </div>
                )
              )}
              {state.error && <Banner tone="danger">{state.error}</Banner>}
            </>
          )}
        </div>
      </Card>
    </section>
  );
}
