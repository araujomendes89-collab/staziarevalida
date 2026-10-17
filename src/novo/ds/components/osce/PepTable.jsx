import React from "react";
import { Icon } from "../core/Icon.jsx";
import { formatDecimal } from "../../format.js";

// Padrão esperado de procedimento (PEP) no formato do impresso do INEP (Room.jsx do pacote, linhas 1-50), com os tokens do app.
// A folha é branca nos dois temas (--pep-sheet / --pep-sheet-text), como o papel.
const LEVELS = [
  { grade: "incorrect", label: "Inadequado" },
  { grade: "partial", label: "Parcialmente adequado" },
  { grade: "correct", label: "Adequado" },
];
const PLURAL = new Intl.PluralRules("pt-BR");

function points(value) {
  return formatDecimal(value) + (PLURAL.select(value) === "one" ? " ponto" : " pontos");
}

// Níveis que o item tem (o parcial pode não existir), na ordem da folha.
function levelsOf(item) {
  return LEVELS.filter((l) => typeof item.levels?.[l.grade] === "number");
}

function ItemRow({ item, mark, canMark, onMark, onToggleSubitem }) {
  const present = levelsOf(item);
  const current = mark?.grade || null;
  const checked = Array.isArray(mark?.subitems) ? mark.subitems : [];
  // Foco móvel: o marcado, ou o primeiro nível; as setas mudam só o foco.
  const [focusGrade, setFocusGrade] = React.useState(null);
  const refs = React.useRef({});
  const tabGrade = present.some((l) => l.grade === focusGrade)
    ? focusGrade
    : present.some((l) => l.grade === current)
      ? current
      : present[0]?.grade;

  const choose = (grade) => {
    setFocusGrade(grade);
    if (canMark) onMark(item.id, current === grade ? null : grade);
  };
  const onKeyDown = (event, grade) => {
    const at = present.findIndex((l) => l.grade === grade);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = present[(at + step + present.length) % present.length];
      setFocusGrade(next.grade);
      refs.current[next.grade]?.focus();
    } else if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
      event.preventDefault(); // o clique do navegador não pode marcar duas vezes
      choose(grade);
    }
  };

  return (
    <div className={"sm-pep__row" + (current ? " sm-pep__row--done" : "")}>
      <div className="sm-pep__text">
        <div>
          <b className="sm-pep__num">{item.number}.</b> {item.text}
        </div>
        {item.subitems && item.subitems.length > 0 && (
          <div className="sm-pep__subs">
            {item.subitems.map((sub) => (
              <label key={sub.id} className={"sm-pep__sub" + (checked.includes(sub.id) ? " sm-pep__sub--on" : "")}>
                <input
                  type="checkbox"
                  checked={checked.includes(sub.id)}
                  disabled={!onToggleSubitem}
                  onChange={() => onToggleSubitem && onToggleSubitem(item.id, sub.id)}
                />
                {sub.text}
              </label>
            ))}
          </div>
        )}
        {item.criteria && item.criteria.length > 0 && (
          <div className="sm-pep__crit">
            {item.criteria.map((c) => (
              <div key={c.label}>
                <b>{c.label}</b>: {c.text}
              </div>
            ))}
          </div>
        )}
        {item.tip && (
          <div className="sm-pep__tip">
            <Icon name="info" size={13} />
            {item.tip}
          </div>
        )}
      </div>
      <div role="radiogroup" aria-label={"Item " + item.number} aria-readonly={canMark ? undefined : "true"} className="sm-pep__levels">
        {LEVELS.map((level) => {
          const value = item.levels?.[level.grade];
          if (typeof value !== "number") return <div key={level.grade} aria-hidden="true" className="sm-pep__cell sm-pep__cell--none" />;
          const on = current === level.grade;
          return (
            <button
              key={level.grade}
              ref={(node) => {
                refs.current[level.grade] = node;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={level.label + ", " + points(value)}
              tabIndex={tabGrade === level.grade ? 0 : -1}
              className="sm-pep__cell"
              data-readonly={canMark ? undefined : "true"}
              onClick={() => choose(level.grade)}
              onKeyDown={(e) => onKeyDown(e, level.grade)}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Spacebar") e.preventDefault();
              }}
            >
              {on && <Icon name="check" size={14} />}
              {formatDecimal(value)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PepTable({ stationNumber, area, items = [], marks = {}, onMark, onToggleSubitem, maxScore = 10 }) {
  const list = Array.isArray(items) ? items : [];
  const done = list.filter((item) => marks[item.id]?.grade).length;
  const score = list.reduce((sum, item) => {
    const grade = marks[item.id]?.grade;
    const value = grade ? item.levels?.[grade] : 0;
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
  const pct = maxScore > 0 ? Math.max(0, Math.min(100, (score / maxScore) * 100)) : 0;
  const hasNumber = typeof stationNumber === "number";

  return (
    <div className="sm-pep">
      <div className="sm-pep__head">
        <div className="sm-pep__top">
          {hasNumber && (
            <>
              <span className="sm-pep__station">ESTAÇÃO {stationNumber}</span>
              <span className="sm-pep__rule" aria-hidden="true" />
            </>
          )}
          <div className="sm-pep__title">
            <div className="sm-pep__title-main">PADRÃO ESPERADO DE PROCEDIMENTO</div>
            {area && <div className="sm-pep__title-area">Área: {area}</div>}
          </div>
          <div className="sm-pep__score">
            <div className="sm-pep__score-n">
              {formatDecimal(score)}
              <span> / {formatDecimal(maxScore)}</span>
            </div>
            <div className="sm-pep__score-done">
              {done} de {list.length} avaliados
            </div>
          </div>
        </div>
        <div className="sm-pep__double" aria-hidden="true" />
        <div className="sm-pep__bar" aria-hidden="true">
          <div style={{ width: pct + "%" }} />
        </div>
        <div className="sm-pep__cols">
          <div className="sm-pep__col-items">ITENS DE DESEMPENHO AVALIADOS</div>
          <div className="sm-pep__col-group">DESEMPENHO OBSERVADO</div>
          {LEVELS.map((l) => (
            <div key={l.grade} className="sm-pep__col-level">
              {l.label}
            </div>
          ))}
        </div>
      </div>
      {list.map((item, index) => (
        <React.Fragment key={item.id}>
          {item.section && item.section !== list[index - 1]?.section && <div className="sm-pep__section">{item.section}</div>}
          <ItemRow item={item} mark={marks[item.id]} canMark={typeof onMark === "function"} onMark={onMark} onToggleSubitem={onToggleSubitem} />
        </React.Fragment>
      ))}
      <div className="sm-pep__total">
        <span>TOTAL</span>
        <span>
          {formatDecimal(score)} / {formatDecimal(maxScore)}
        </span>
      </div>
    </div>
  );
}
