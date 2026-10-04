// Limpeza de sobras de rodapé e de páginas vizinhas que a extração dos PDFs deixou no fim das
// alternativas (ex.: "… cirurgia. 2023 PRIMEIRA EDIÇÃO", "… Espaço livre Revalida 2022") e a
// pesquisa de satisfação que a última questão de cada prova arrastou.
//
// Regras estreitas e explícitas: só sai o que casa com um padrão conhecido de rodapé, e tudo o
// que sai é devolvido em `removed` para ser registrado (nada some em silêncio). Número de ano
// solto só é rodapé quando vem logo depois de um ponto final.

export interface CleanResult {
  text: string;
  removed: { rule: string; text: string }[];
}

const SURVEY = /\s*QUESTION[ÁA]RIO DE PERCEP[ÇC][ÃA]O\b[\s\S]*$/;

const FOOTERS: { rule: string; pattern: RegExp }[] = [
  {
    rule: "rodape-prova-edicao",
    pattern: /\s+(?:Espa[çc]o livre\s+)?(?:(?:REVALIDA|Revalida)\s+)?20\d\d(?:\s+(?:PRIMEIRA|SEGUNDA)\s+EDI[ÇC][ÃA]O|\s+EDI[ÇC][ÃA]O\s+20\d\d\/[12])?(?:\s+20\d\d)?\s*$/,
  },
  { rule: "rodape-edicao", pattern: /\s+(?:PRIMEIRA|SEGUNDA)\s+EDI[ÇC][ÃA]O\s*$/ },
  { rule: "rodape-enamed", pattern: /\s+(?:Espa[çc]o livre\s+)?enamed\s+Exame Nacional de Avalia[çc][ãa]o da Forma[çc][ãa]o M[ée]dica\s*$/i },
  { rule: "espaco-livre", pattern: /\s+Espa[çc]o livre\s*$/ },
];

// "REVALIDA 2020", "Revalida 2022" e "2023 PRIMEIRA EDIÇÃO" sempre são rodapé; "2020" sozinho só
// depois de ponto final, para não cortar uma resposta que de fato termina num ano.
const BARE_YEAR = /(?<=[.;?!])\s+20\d\d\s*$/;

// Cabeçalho de página que caiu no meio do texto ("… ECG Admissão 2024 SEGUNDA EDIÇÃO ECG após …").
const MID_HEADER = /\s+20\d\d\s+(?:(?:PRIMEIRA|SEGUNDA)\s+EDI[ÇC][ÃA]O|EDI[ÇC][ÃA]O\s+20\d\d\/[12])(?=\s)/g;

export function cleanQuestionText(input: string): CleanResult {
  let text = String(input ?? "");
  const removed: CleanResult["removed"] = [];

  text = text.replace(MID_HEADER, (m) => {
    removed.push({ rule: "cabecalho-no-meio", text: m.trim() });
    return "";
  });

  const survey = text.match(SURVEY);
  if (survey) {
    removed.push({ rule: "questionario-de-percepcao", text: survey[0].trim() });
    text = text.slice(0, survey.index);
  }

  for (let guard = 0; guard < 4; guard++) {
    let hit = false;
    for (const { rule, pattern } of FOOTERS) {
      const m = text.match(pattern);
      if (!m) continue;
      // "2020" sozinho (sem palavra de rodapé) exige ponto final antes
      const onlyYear = /^\s+20\d\d\s*$/.test(m[0]);
      if (onlyYear && !BARE_YEAR.test(text)) continue;
      removed.unshift({ rule: onlyYear ? "rodape-ano" : rule, text: m[0].trim() });
      text = text.slice(0, m.index);
      hit = true;
      break;
    }
    if (!hit) {
      const y = text.match(BARE_YEAR);
      if (y) {
        removed.unshift({ rule: "rodape-ano", text: y[0].trim() });
        text = text.slice(0, y.index);
        hit = true;
      }
    }
    if (!hit) break;
  }
  return { text: text.trimEnd(), removed };
}
