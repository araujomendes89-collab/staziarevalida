// @vitest-environment node
/**
 * Treinamento em Dupla · etapa 1 · tarefa 1: a base visual e de texto do módulo.
 *  - cores novas em src/novo/ds/tokens/dupla.css, escritas por extenso (dia e noite), sem tocar nos tokens do app;
 *  - contraste mínimo de 4,5:1 do texto novo nos dois temas (inclui os selos brancos de Cirurgia e Pediatria, decisão R3);
 *  - o tema guardado é aplicado pelo novo.html antes da primeira pintura (e gravado pelo App);
 *  - formato de número e de tempo, áreas, rótulos e origem da estação.
 * Os valores esperados vêm da especificação (pacote de design, tokens/colors.css:18-32,53); o teste lê os arquivos reais.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { Badge } from "../novo/ds/components/core/Badge.jsx";
import { formatDecimal, formatDuration } from "../novo/ds/format.js";
import { AREAS, areaByCode, areaByLabel, areaVars } from "../novo/ds/areas.js";
import * as labels from "../novo/app/dupla/labels.js";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ---------- leitura dos tokens (CSS real) ----------
type Vars = Record<string, string>;

/** Blocos `seletor { --nome: valor; … }` de um CSS simples (sem aninhamento), sem os comentários. */
function blocks(css: string): Array<{ selector: string; vars: Vars }> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Array<{ selector: string; vars: Vars }> = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const vars: Vars = {};
    for (const decl of m[2].split(";")) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      const name = decl.slice(0, i).trim();
      if (name.startsWith("--")) vars[name] = decl.slice(i + 1).trim();
    }
    out.push({ selector: m[1].trim(), vars });
  }
  return out;
}

const TOKEN_FILES = ["src/novo/ds/tokens/colors.css", "src/novo/ds/tokens/semantic.css", "src/novo/ds/tokens/dupla.css"];

/** Tokens de um tema, como o navegador calcula: `:root` (dia) e, na noite, `[data-theme="dark"]` por cima. */
function themeVars(files: string[], dark: boolean): Vars {
  const all = files.flatMap((f) => blocks(read(f)));
  const vars: Vars = {};
  for (const b of all) if (b.selector === ":root") Object.assign(vars, b.vars);
  if (dark) for (const b of all) if (b.selector === '[data-theme="dark"]') Object.assign(vars, b.vars);
  return vars;
}

/** Valor final de um token (segue `var(--outro)` até chegar à cor). */
function resolve(vars: Vars, name: string, depth = 0): string {
  const raw = vars[name];
  if (raw === undefined) throw new Error(`token ${name} não está definido`);
  const ref = raw.match(/^var\((--[\w-]+)\)$/);
  if (!ref) return raw.toUpperCase();
  if (depth > 8) throw new Error(`token ${name} tem referência circular`);
  return resolve(vars, ref[1], depth + 1);
}

// ---------- contraste WCAG ----------
function luminance(hex: string): number {
  const m = hex.match(/^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i);
  if (!m) throw new Error(`cor inválida: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;
const AREA_TOKENS = ["clinica", "cirurgia", "go", "pediatria", "preventiva"] as const;
const ROLE_TOKENS = ["candidate", "actor"] as const;

describe("Treino em dupla · tokens novos (dupla.css)", () => {
  // Valores do pacote por extenso (README e tokens/colors.css:18-32,53); o --blue-600 do pacote não é o do app.
  const DAY: Vars = {
    "--area-clinica-soft": "#E5ECFF", "--area-clinica-ink": "#1D3FA6",
    "--area-cirurgia-soft": "#FFEAD8", "--area-cirurgia-ink": "#9A4100",
    "--area-go-soft": "#FDE2EC", "--area-go-ink": "#99194A",
    "--area-pediatria-soft": "#DAF5E5", "--area-pediatria-ink": "#0B6B34",
    "--area-preventiva-soft": "#EEE6FF", "--area-preventiva-ink": "#5A2CC0",
    "--role-candidate": "#2E68A6", "--role-candidate-soft": "#EEF4FA", "--role-candidate-ink": "#24558A",
    "--role-actor": "#9A5631", "--role-actor-soft": "#F9F1EB", "--role-actor-ink": "#7E4524",
    "--score-full": "#2C7F49", "--score-partial": "#D08C1A", "--score-none": "#BD4332", "--score-pending": "#BCC5C4",
    "--inep-blue-900": "#1F3864", "--inep-blue-700": "#2F5496", "--inep-blue-500": "#4472C4", "--inep-blue-300": "#8EAADB",
    "--inep-blue-200": "#B4C7E7", "--inep-blue-100": "#D9E2F3", "--inep-blue-50": "#EEF3FA",
    "--pep-sheet": "#FFFFFF", "--pep-sheet-text": "#111111",
  };
  // Só estes mudam à noite; o resto (pontuação, azul do INEP, folha do PEP) é igual nos dois temas.
  const NIGHT: Vars = {
    "--area-clinica-soft": "#16223F", "--area-clinica-ink": "#A3BBFF",
    "--area-cirurgia-soft": "#36220F", "--area-cirurgia-ink": "#FFB57D",
    "--area-go-soft": "#371424", "--area-go-ink": "#FFA0C2",
    "--area-pediatria-soft": "#112D1D", "--area-pediatria-ink": "#86E3AB",
    "--area-preventiva-soft": "#241A42", "--area-preventiva-ink": "#C7AFFF",
    "--role-candidate-soft": "#122136", "--role-candidate-ink": "#8EB8E8",
    "--role-actor-soft": "#2A1F18", "--role-actor-ink": "#E6B08C",
  };
  it("dupla.css traz os valores do pacote por extenso, no dia e na noite, e não redefine token do app", () => {
    const css = read("src/novo/ds/tokens/dupla.css");
    const dupla = blocks(css);
    const rootBlock = dupla.find((b) => b.selector === ":root");
    const darkBlock = dupla.find((b) => b.selector === '[data-theme="dark"]');
    expect(rootBlock, "bloco :root").toBeDefined();
    expect(darkBlock, 'bloco [data-theme="dark"]').toBeDefined();
    // a noite vem depois do dia: os dois seletores pesam o mesmo, então a ordem decide
    expect(css.indexOf(":root")).toBeLessThan(css.indexOf('[data-theme="dark"]'));

    // dia: cada valor escrito por extenso (hexadecimal), não por referência
    for (const [name, value] of Object.entries(DAY)) {
      expect(rootBlock!.vars[name]?.toUpperCase(), `${name} (dia)`).toBe(value);
    }
    // noite: o que muda está no bloco da noite; o que não muda continua o do dia
    for (const [name, value] of Object.entries(NIGHT)) {
      expect(darkBlock!.vars[name]?.toUpperCase(), `${name} (noite)`).toBe(value);
    }
    const night = themeVars(["src/novo/ds/tokens/dupla.css"], true);
    for (const name of Object.keys(DAY)) {
      expect(night[name]?.toUpperCase(), `${name} (noite, valor final)`).toBe(NIGHT[name] ?? DAY[name]);
    }

    // nenhum nome de colors.css ou semantic.css reaparece em dupla.css; nada do --blue-600 (nem de outro azul) do app
    const appNames = new Set(
      ["src/novo/ds/tokens/colors.css", "src/novo/ds/tokens/semantic.css"].flatMap((f) => blocks(read(f)).flatMap((b) => Object.keys(b.vars))),
    );
    const duplaNames = dupla.flatMap((b) => Object.keys(b.vars));
    expect(duplaNames).toEqual(expect.arrayContaining(Object.keys(DAY)));
    expect(duplaNames.filter((n) => appNames.has(n))).toEqual([]);
    expect(css).not.toContain("--blue-600");
    expect(css).not.toMatch(/var\(--blue-/);
  });

  it("selo de área: o tom escuro vale só para Cirurgia e Pediatria no dia (as cores do app não mudam)", () => {
    // Decisão R3: texto branco sobre o laranja de Cirurgia e o verde de Pediatria não chega a 4,5:1; o selo usa um tom
    // mais escuro (--area-*-solid) e a cor base --area-* continua a do app, nas barras, textos e gráficos.
    const day = themeVars(TOKEN_FILES, false);
    const night = themeVars(TOKEN_FILES, true);
    for (const t of AREA_TOKENS) {
      const base = resolve(day, `--area-${t}`);
      const solid = resolve(day, `--area-${t}-solid`);
      if (t === "cirurgia" || t === "pediatria") {
        expect(luminance(solid), `${t} (dia): mais escuro que a base`).toBeLessThan(luminance(base));
        expect(solid).not.toBe(base);
      } else {
        expect(solid, `${t} (dia): a base já serve`).toBe(base);
      }
      // à noite a base é clara e o texto do selo é escuro: o selo usa a própria base
      expect(resolve(night, `--area-${t}-solid`), `${t} (noite)`).toBe(resolve(night, `--area-${t}`));
    }
    // a base do app segue como estava
    expect(resolve(day, "--area-cirurgia")).toBe("#D9650A");
    expect(resolve(day, "--area-pediatria")).toBe("#0E8A5F");
  });

  it("contraste AA (≥ 4,5) do texto novo nos dois temas", () => {
    for (const dark of [false, true]) {
      const v = themeVars(TOKEN_FILES, dark);
      const tema = dark ? "noite" : "dia";
      // texto de cada área e de cada papel sobre o fundo claro dele
      for (const t of AREA_TOKENS) {
        const ratio = contrast(resolve(v, `--area-${t}-ink`), resolve(v, `--area-${t}-soft`));
        expect(ratio, `área ${t} (${tema})`).toBeGreaterThanOrEqual(AA);
      }
      for (const r of ROLE_TOKENS) {
        const ratio = contrast(resolve(v, `--role-${r}-ink`), resolve(v, `--role-${r}-soft`));
        expect(ratio, `papel ${r} (${tema})`).toBeGreaterThanOrEqual(AA);
      }
      // folha do PEP: azul do INEP e texto sobre a folha (branca nos dois temas, como o papel do INEP)
      const sheet = resolve(v, "--pep-sheet");
      expect(contrast(resolve(v, "--inep-blue-700"), sheet), `azul 700 na folha (${tema})`).toBeGreaterThanOrEqual(AA);
      expect(contrast(resolve(v, "--inep-blue-500"), sheet), `azul 500 na folha (${tema})`).toBeGreaterThanOrEqual(AA);
      expect(contrast(resolve(v, "--pep-sheet-text"), sheet), `texto na folha (${tema})`).toBeGreaterThanOrEqual(AA);
      // selos e números de área: texto --surface-card (branco de dia, escuro à noite) sobre o fundo do selo (R3)
      for (const t of AREA_TOKENS) {
        const ratio = contrast(resolve(v, "--surface-card"), resolve(v, `--area-${t}-solid`));
        expect(ratio, `selo da área ${t} (${tema})`).toBeGreaterThanOrEqual(AA);
      }
    }
    // pontuação: branco sobre Adequado e Inadequado; --navy-950 sobre Parcial (branco daria 2,8:1)
    const v = themeVars(TOKEN_FILES, false);
    expect(resolve(v, "--navy-950")).toBe("#08122B");
    expect(contrast("#FFFFFF", resolve(v, "--score-full"))).toBeGreaterThanOrEqual(AA);
    expect(contrast("#FFFFFF", resolve(v, "--score-none"))).toBeGreaterThanOrEqual(AA);
    expect(contrast("#FFFFFF", resolve(v, "--inep-blue-700"))).toBeGreaterThanOrEqual(AA);
    expect(contrast(resolve(v, "--navy-950"), resolve(v, "--score-partial"))).toBeGreaterThanOrEqual(AA);
    expect(contrast("#FFFFFF", resolve(v, "--score-partial"))).toBeLessThan(AA);
  });

  it("nenhuma cor hexadecimal fora de dupla.css nos arquivos desta tarefa (só tokens)", () => {
    for (const file of ["src/novo/ds/areas.js", "src/novo/ds/format.js", "src/novo/app/dupla/labels.js", "src/novo/ds/components/core/Badge.jsx"]) {
      expect(read(file), file).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  it("styles.css importa dupla.css logo depois de semantic.css", () => {
    const imports = [...read("src/novo/ds/styles.css").matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(imports.indexOf("./tokens/semantic.css")).toBeGreaterThanOrEqual(0);
    expect(imports.indexOf("./tokens/dupla.css")).toBe(imports.indexOf("./tokens/semantic.css") + 1);
  });

  it("Badge: tons candidate e actor usam os tokens do papel", () => {
    const badge = Badge as unknown as (p: Record<string, unknown>) => { props: { style: Record<string, string> } };
    expect(badge({ tone: "candidate", children: "Candidato" }).props.style).toMatchObject({
      background: "var(--role-candidate-soft)",
      color: "var(--role-candidate-ink)",
    });
    expect(badge({ tone: "actor", children: "Ator/Avaliador" }).props.style).toMatchObject({
      background: "var(--role-actor-soft)",
      color: "var(--role-actor-ink)",
    });
    const tones = read("src/novo/ds/components/core/Badge.d.ts").match(/tone\?:([^;]+);/)?.[1] ?? "";
    expect(tones).toContain("'candidate'");
    expect(tones).toContain("'actor'");
  });
});

describe("Treino em dupla · tema antes da primeira pintura", () => {
  const SCRIPT =
    '<script>try{var t=localStorage.getItem("smn-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}</script>';

  it("novo.html aplica o tema guardado antes do script do app", () => {
    const html = read("novo.html");
    expect(html).toContain(SCRIPT);
    const at = html.indexOf(SCRIPT);
    // no <head>, antes de qualquer outro script e do script do app
    expect(at).toBeGreaterThan(html.indexOf("<head>"));
    expect(at).toBeLessThan(html.indexOf("</head>"));
    expect(at).toBe(html.indexOf("<script"));
    expect(at).toBeLessThan(html.indexOf("/src/novo/main.jsx"));
  });

  it("o script usa só dark/light guardado e ignora o resto, inclusive armazenamento bloqueado", () => {
    const code = SCRIPT.replace(/^<script>/, "").replace(/<\/script>$/, "");
    const run = (stored: unknown, blocked = false) => {
      const dataset: Record<string, string> = {};
      const reads: string[] = [];
      vm.runInNewContext(code, {
        document: { documentElement: { dataset } },
        localStorage: {
          getItem: (key: string) => {
            reads.push(key);
            if (blocked) throw new Error("armazenamento bloqueado");
            return stored;
          },
        },
      });
      expect(reads).toEqual(["smn-theme"]);
      return dataset.theme;
    };
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
    expect(run("system")).toBeUndefined();
    expect(run(null)).toBeUndefined();
    expect(run("<img src=x>")).toBeUndefined();
    expect(run("dark", true)).toBeUndefined();
  });

  it("App.jsx grava o tema resolvido em smn-theme, dentro de try/catch", () => {
    // o efeito do tema: do `React.useEffect(() => {` que antecede `dataset.theme = theme` até o `}, [theme]);` que o fecha
    const src = read("src/novo/app/App.jsx");
    const at = src.indexOf("dataset.theme = theme");
    const open = "React.useEffect(() => {";
    const from = src.lastIndexOf(open, at);
    const to = src.indexOf("}, [theme]);", at);
    expect(at, "dataset.theme = theme em App.jsx").toBeGreaterThan(-1);
    expect(from, "início do efeito do tema").toBeGreaterThan(-1);
    expect(to, "fim do efeito do tema").toBeGreaterThan(at);
    const body = src.slice(from + open.length, to);
    const run = (setItem: (k: string, v: string) => void) => {
      const documentElement = { dataset: {} as Record<string, string> };
      new Function("document", "localStorage", "theme", body)({ documentElement }, { setItem }, "dark");
      return documentElement.dataset.theme;
    };
    const stored: Record<string, string> = {};
    expect(run((k, v) => void (stored[k] = v))).toBe("dark");
    expect(stored).toEqual({ "smn-theme": "dark" });
    // armazenamento bloqueado (janela privada): o tema do app continua valendo e nada quebra
    expect(run(() => { throw new Error("cota"); })).toBe("dark");
  });
});

describe("Treino em dupla · formato, áreas e rótulos", () => {
  it("formatDecimal e formatDuration", () => {
    expect(formatDecimal(7.25)).toBe("7,25");
    expect(formatDecimal(10)).toBe("10,00");
    expect(formatDecimal(61.4, 1)).toBe("61,4");
    expect(formatDecimal(72, 0)).toBe("72");
    expect(formatDecimal(0)).toBe("0,00");
    // zero nunca aparece com sinal ("-0,00"), nem quando o arredondamento zera um valor negativo pequeno
    expect(formatDecimal(-0)).toBe("0,00");
    expect(formatDecimal(-0.001)).toBe("0,00");
    expect(formatDecimal(-0.4, 0)).toBe("0");
    expect(formatDecimal(-1.5)).toBe("-1,50");
    expect(formatDecimal(1234.5)).toBe("1.234,50");
    // sem número não se inventa zero
    expect(formatDecimal(null as unknown as number)).toBe("—");
    expect(formatDecimal(undefined as unknown as number)).toBe("—");
    expect(formatDecimal(Number.NaN)).toBe("—");

    expect(formatDuration(452000)).toBe("7 min 32 s");
    expect(formatDuration(600000)).toBe("10 min");
    expect(formatDuration(45000)).toBe("45 s");
    expect(formatDuration(0)).toBe("0 s");
    expect(formatDuration(60000)).toBe("1 min");
    expect(formatDuration(59600)).toBe("1 min"); // arredonda ao segundo mais próximo e depois separa os minutos
    expect(formatDuration(null as unknown as number)).toBe("—");
  });

  it("áreas, rótulos e origem", () => {
    // as 5 áreas, na ordem do protótipo: área do banco, cartão (StationCard.jsx:3), chip do perfil (Profile.jsx:13)
    expect(AREAS).toEqual([
      { code: "CM", label: "Clínica Médica", card: "Clínica Médica", chip: "Clínica Médica", token: "clinica" },
      { code: "CR", label: "Cirurgia Geral", card: "Cirurgia", chip: "Cirurgia", token: "cirurgia" },
      { code: "GO", label: "Ginecologia e Obstetrícia", card: "Ginecologia e Obstetrícia", chip: "GO", token: "go" },
      { code: "PED", label: "Pediatria", card: "Pediatria", chip: "Pediatria", token: "pediatria" },
      { code: "MFC", label: "Medicina de Família e Comunidade", card: "Medicina de Família", chip: "MFC", token: "preventiva" },
    ]);
    expect(areaByLabel("Cirurgia Geral")).toMatchObject({ code: "CR", card: "Cirurgia", chip: "Cirurgia", token: "cirurgia" });
    expect(areaByCode("PED")?.label).toBe("Pediatria");
    expect(areaByLabel("Astrologia")).toBeNull();
    expect(areaByCode("XX")).toBeNull();

    expect(areaVars("MFC").soft).toBe("var(--area-preventiva-soft)");
    expect(areaVars("MFC")).toEqual({
      base: "var(--area-preventiva)",
      soft: "var(--area-preventiva-soft)",
      ink: "var(--area-preventiva-ink)",
      solid: "var(--area-preventiva-solid)",
    });
    expect(areaVars("CR").solid).toBe("var(--area-cirurgia-solid)");
    // área desconhecida não derruba a tela: tons neutros do app
    expect(areaVars("XX")).toEqual({
      base: "var(--text-tertiary)",
      soft: "var(--surface-sunken)",
      ink: "var(--text-secondary)",
      solid: "var(--text-secondary)",
    });
    // todo token de área citado existe de verdade nos CSS
    const day = themeVars(TOKEN_FILES, false);
    for (const a of AREAS) for (const v of Object.values(areaVars(a.code))) {
      expect(day[v.replace(/^var\(|\)$/g, "")], v).toBeDefined();
    }

    // o arquivo de rótulos reexporta as áreas
    expect(labels.AREAS).toBe(AREAS);
    expect(labels.areaVars).toBe(areaVars);
    expect(labels.ROLE_PREF_LABEL).toEqual({ med: "Médico(a)", ator: "Ator / avaliador", any: "Qualquer papel" });
    expect(labels.ROLE_PREF_SHORT).toEqual({ med: "quer ser médico(a)", ator: "quer ser ator/avaliador", any: "topa qualquer papel" });
    expect(labels.ROOM_ROLE_LABEL).toEqual({ candidate: "Candidato", evaluator: "Ator/Avaliador" });
    expect(labels.PACE_LABEL).toEqual({ livre: "Treino livre", cronometrado: "Cronometrado", simulacao: "Simulação de prova" });
    expect(labels.DAYS).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
    expect(labels.SHIFTS).toEqual(["Manhã", "Tarde", "Noite"]);

    const { sourceLabel } = labels;
    expect(sourceLabel({ edition: "2020", reapplication: false, institution: "INEP" })).toBe("Revalida 2020 · INEP");
    expect(sourceLabel({ edition: "2022/1", reapplication: true, institution: "INEP" })).toBe("Revalida 2022/1 (reaplicação) · INEP");
    // estação autoral (sem instituição): nenhuma origem
    expect(sourceLabel({ edition: "2020", reapplication: false, institution: null })).toBeNull();
    expect(sourceLabel({ edition: null, reapplication: false, institution: null })).toBeNull();
    expect(sourceLabel({ edition: "2020", reapplication: false, institution: "  " })).toBeNull();
    // instituição sem edição conhecida: só a instituição, sem inventar prova nem ano
    expect(sourceLabel({ edition: null, reapplication: false, institution: "INEP" })).toBe("INEP");
    // sala ainda sem estação escolhida
    expect(sourceLabel(null)).toBeNull();
    expect(sourceLabel(undefined)).toBeNull();
  });
});
