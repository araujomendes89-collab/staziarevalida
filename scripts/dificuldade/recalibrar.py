"""Recalibração da dificuldade na escala do Inep (pedido do dono, 16/10/2026).

1) MEDIDA: p (índice de facilidade) de cada item do Enamed 2025 a partir dos microdados do Inep (concluintes com
   presença válida, TP_PRES = 555), com o parâmetro b (Rasch) e a correlação bisserial publicados pelo Inep. Os itens do
   Revalida 2025/2 idênticos aos do Enamed 2025 (mesmo texto e gabarito) herdam a medida.
2) ESTIMADA: rubrica médica explícita (8 itens, pontuação cega) -> regressão ridge em logit(p), calibrada nas 90 questões
   medidas, com validação cruzada deixa-um-fora aninhada (o lambda é escolhido sem ver a questão testada). A previsão vira p
   estimado com intervalo de 80% e cai na mesma faixa do Inep.

Uso: pdfpython scripts/dificuldade/recalibrar.py <pasta-trabalho>
  <pasta-trabalho> deve ter: questoes.json, recalibracao/enamed2025_itens.json,   recalibracao/rubrica/mapa-idx.json e recalibracao/rubrica/saida/{A,B}-lote-XX.csv
Saídas: recalibracao/dificuldade-inep.csv (entrada do gerar-sql-dados.mjs) e recalibracao/relatorio.json
"""
import csv, glob, json, math, os, sys
import numpy as np

W = sys.argv[1]
R = os.path.join(W, "recalibracao")
FAIXAS = ["muito_facil", "facil", "medio", "dificil", "muito_dificil"]
NOME = {"muito_facil": "muito fácil", "facil": "fácil", "medio": "médio", "dificil": "difícil", "muito_dificil": "muito difícil"}
DIMS = ["cog", "passos", "raridade", "normativo", "distratores", "numerico", "imagem", "contra"]
AREAS = ["CIRURGIA_GERAL", "GINECOLOGIA_OBSTETRICIA", "MEDICINA_FAMILIA_COMUNIDADE", "PEDIATRIA"]  # base: CLINICA_MEDICA
FONTE_MEDIDA = "Inep, microdados Enamed 2025 (concluintes, TP_PRES=555); b Rasch e bisserial do arquivo microdados2025_parametros_itens"


def nivel(p):
    # igual ao check do banco: p com 4 casas; round(p, 2) arredonda metade para longe do zero
    k = int(f"{p:.4f}".replace("0.", "").replace("1.0000", "10000"))
    return 1 if k >= 8550 else 2 if k >= 6050 else 3 if k >= 4050 else 4 if k >= 1550 else 5


logit = lambda p: math.log(p / (1 - p))
expit = lambda x: 1 / (1 + math.exp(-x))

qs = {q["id"]: q for q in json.load(open(os.path.join(W, "questoes.json")))}
itens = {o["item_c1"]: o for o in json.load(open(os.path.join(R, "enamed2025_itens.json")))}
# questões de outras provas idênticas a um item do Enamed 2025 (Jaccard das palavras > 0,5 e mesmo gabarito)
import re
_tok = lambda q: set(re.findall(r"[a-zà-ú0-9]{4,}", (q["statement"] + " " + " ".join(str(o["text"]) for o in q["options"])).lower()))
_en = [q for q in qs.values() if q["exam"] == "enamed-2025"]; _T = {i: _tok(q) for i, q in qs.items()}
pares = {}
for i, q in qs.items():
    if q["exam"] == "enamed-2025":
        continue
    jac = lambda e: len(_T[i] & _T[e["id"]]) / max(1, len(_T[i] | _T[e["id"]]))
    melhor = max(_en, key=jac)
    if jac(melhor) > 0.5 and melhor["gabarito"] == q["gabarito"]:
        pares[i] = melhor["id"]

# ---------- rubrica (A e B; o lote 15 foi pontuado pelos dois: média e concordância)
mapa = json.load(open(os.path.join(R, "rubrica", "mapa-idx.json")))
notas = {}
for f in sorted(glob.glob(os.path.join(R, "rubrica", "saida", "*-lote-*.csv"))):
    for r in csv.DictReader(open(f, encoding="utf-8-sig")):
        idx = r["idx"].strip()
        if idx not in mapa:
            continue
        notas.setdefault(mapa[idx], []).append({d: float(r[d]) for d in DIMS})
faltam = [i for i in qs if i not in notas]
dupla = {i: v for i, v in notas.items() if len(v) >= 2}
concord = {}
for d in DIMS:
    a = np.array([v[0][d] for v in dupla.values()]); b = np.array([v[1][d] for v in dupla.values()])
    concord[d] = {"n": int(len(a)), "igual": round(float(np.mean(a == b)), 3), "dif_ate_1": round(float(np.mean(abs(a - b) <= 1)), 3),
                  "pearson": round(float(np.corrcoef(a, b)[0, 1]), 3) if len(a) > 2 and a.std() > 0 and b.std() > 0 else None}
rub = {i: {d: float(np.mean([x[d] for x in v])) for d in DIMS} for i, v in notas.items()}


# Classificação 1 a 5 já feita (Gemini Flash/Pro + conferência Claude, classificacao.csv): entra como mais um preditor
# cego, calibrado pela regressão (ela decide o peso). Se não ajudar na validação cruzada, o peso fica pequeno.
NOTA_AGENTES = {r["id"]: float(r["nota_final"]) for r in csv.DictReader(open(os.path.join(W, "classificacao.csv"), encoding="utf-8"))}
USAR_NOTA = os.environ.get("SEM_NOTA_AGENTES") != "1"


def X_de(i):
    r = rub[i]; q = qs[i]
    return [r[d] for d in DIMS] + [1.0 if q["area"] == a else 0.0 for a in AREAS] + ([NOTA_AGENTES[i]] if USAR_NOTA else [])


COLS = DIMS + ["area_" + a for a in AREAS] + (["nota_agentes"] if USAR_NOTA else [])

# ---------- medidas
medidas = {}
for i, q in qs.items():
    src = i if q["exam"] == "enamed-2025" else pares.get(i)
    if not src:
        continue
    o = itens.get(qs[src]["n"])
    if not o or not o["mantido"] or o["p_concluintes"] is None or o["gabarito_c1"] != q["gabarito"]:
        continue
    medidas[i] = {"p": o["p_concluintes"], "n": o["n_concluintes"], "b": o["b"], "pb": o["bisserial"], "item": o["item_c1"],
                  "herdada_de": None if src == i else src}
calib = [i for i in medidas if medidas[i]["herdada_de"] is None and i in rub]   # 90 itens únicos

# ---------- ridge em logit(p) com LOO aninhado
Xc = np.array([X_de(i) for i in calib]); yc = np.array([logit(medidas[i]["p"]) for i in calib])
LAMBDAS = [0.1, 0.3, 1, 3, 10, 30, 100]


def ajusta(X, y, lam):
    mu, sd = X.mean(0), X.std(0); sd[sd == 0] = 1
    Z = (X - mu) / sd
    A = Z.T @ Z + lam * np.eye(Z.shape[1])
    w = np.linalg.solve(A, Z.T @ (y - y.mean()))
    return lambda Xn: (np.atleast_2d(Xn) - mu) / sd @ w + y.mean(), w / sd


def loo(X, y, lam):
    pr = np.empty(len(y))
    for k in range(len(y)):
        m = np.arange(len(y)) != k
        pr[k] = ajusta(X[m], y[m], lam)[0](X[k])[0]
    return pr


def escolhe_lambda(X, y):
    return min(LAMBDAS, key=lambda l: np.mean((loo(X, y, l) - y) ** 2))


pred_cv = np.empty(len(yc)); lam_cv = []
for k in range(len(yc)):
    m = np.arange(len(yc)) != k
    lam = escolhe_lambda(Xc[m], yc[m]); lam_cv.append(lam)
    pred_cv[k] = ajusta(Xc[m], yc[m], lam)[0](Xc[k])[0]
lam_final = escolhe_lambda(Xc, yc)
modelo, pesos = ajusta(Xc, yc, lam_final)
res = yc - pred_cv
sd_res = float(np.sqrt(np.mean(res ** 2)))
p_real = np.array([expit(v) for v in yc]); p_cv = np.array([expit(v) for v in pred_cv])
niv_real = np.array([nivel(v) for v in p_real]); niv_cv = np.array([nivel(v) for v in p_cv])


def spearman(a, b):
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b)); return float(np.corrcoef(ra, rb)[0, 1])


base_p = float(np.mean(p_real))
metricas = {
    "n_calibracao": len(yc), "lambda_final": lam_final, "lambdas_cv": sorted(set(lam_cv)),
    "rmse_logit_cv": round(sd_res, 3),
    "mae_p_cv": round(float(np.mean(abs(p_cv - p_real))), 3),
    "mae_p_so_media": round(float(np.mean(abs(base_p - p_real))), 3),
    "spearman_cv": round(spearman(pred_cv, yc), 3),
    "faixa_exata_cv": round(float(np.mean(niv_cv == niv_real)), 3),
    "faixa_ate_1_cv": round(float(np.mean(abs(niv_cv - niv_real) <= 1)), 3),
    "faixa_exata_so_media": round(float(np.mean(niv_real == nivel(base_p))), 3),
    "cobertura_intervalo_80": round(float(np.mean(abs(res) <= 1.2816 * sd_res)), 3),
    "pesos_logit_por_ponto": {c: round(float(w), 3) for c, w in zip(COLS, pesos)},
}

# ---------- comparação (só relatório): opinião antiga do Gemini Flash (1 a 5) sozinha e somada à rubrica
def _cv(X):
    pr = np.empty(len(yc))
    for k in range(len(yc)):
        m = np.arange(len(yc)) != k
        pr[k] = ajusta(X[m], yc[m], escolhe_lambda(X[m], yc[m]))[0](X[k])[0]
    pp = np.array([expit(v) for v in pr])
    return {"mae_p_cv": round(float(np.mean(abs(pp - p_real))), 3), "spearman_cv": round(spearman(pr, yc), 3),
            "faixa_exata_cv": round(float(np.mean(np.array([nivel(v) for v in pp]) == niv_real)), 3)}
_fl = {}
for f in glob.glob(os.path.join(W, "gemini-flash", "lote-*.json")):
    for it in json.load(open(f))["itens"]:
        _fl[it["id"]] = it["nota"]
if all(i in _fl for i in calib):
    _g = np.array([[_fl[i]] for i in calib], dtype=float)
    metricas["comparacao"] = {"so_gemini_flash": _cv(_g), "rubrica_mais_gemini": _cv(np.hstack([Xc, _g]))}

# ---------- saída por questão
linhas = []
for i, q in sorted(qs.items()):
    if i in medidas:
        m = medidas[i]; p = m["p"]
        conf = "alta" if (m["pb"] or 0) >= 0.2 else "media"
        herd = f"; mesmo item do Enamed 2025 (questão {m['herdada_de']})" if m["herdada_de"] else ""
        motivo = (f"Medida: {p*100:.1f}% de acerto entre {m['n']} concluintes do Enamed 2025 (item {m['item']} do caderno 1){herd}; "
                  f"faixa do Inep: {NOME[FAIXAS[nivel(p)-1]]}; b Rasch = {m['b']:.2f}; bisserial = {m['pb']:.2f}.")
        linhas.append({"id": i, "p": f"{p:.4f}", "p_low": "", "p_high": "", "method": "medida", "source": FONTE_MEDIDA,
                       "n_respondents": m["n"], "irt_b": m["b"], "point_biserial": m["pb"], "confidence": conf,
                       "reason": motivo, "rubric": json.dumps(rub.get(i)) if i in rub else ""})
        continue
    if i not in rub:
        continue
    x = modelo(np.array(X_de(i)))[0]
    p = expit(x); lo = expit(x - 1.2816 * sd_res); hi = expit(x + 1.2816 * sd_res)
    largura = nivel(lo) - nivel(hi)
    r = rub[i]
    conf = "baixa" if (r["imagem"] >= 0.5 or largura >= 3 or (i in dupla and max(abs(dupla[i][0][d] - dupla[i][1][d]) for d in DIMS) >= 2)) else "media"
    motivo = (f"Estimada pela rubrica (cognitivo {r['cog']:g}, passos {r['passos']:g}, raridade {r['raridade']:g}, normativo {r['normativo']:g}, "
              f"distratores {r['distratores']:g}, numérico {r['numerico']:g}, imagem {r['imagem']:g}, contraintuitiva {r['contra']:g}"
              + (f"; nota prévia {NOTA_AGENTES[i]:g}" if USAR_NOTA else "") + "): "
              f"p previsto {p*100:.0f}% (intervalo 80%: {lo*100:.0f}% a {hi*100:.0f}%); faixa do Inep: {NOME[FAIXAS[nivel(p)-1]]}.")
    fonte = (f"Rubrica médica{' + nota prévia dos agentes' if USAR_NOTA else ''} calibrada contra {len(yc)} itens medidos do Enamed 2025 (ridge em logit(p), LOO aninhado: "
             f"erro médio {metricas['mae_p_cv']*100:.1f} pontos de p; faixa exata {metricas['faixa_exata_cv']*100:.0f}%)")
    linhas.append({"id": i, "p": f"{p:.4f}", "p_low": f"{lo:.4f}", "p_high": f"{hi:.4f}", "method": "estimada", "source": fonte,
                   "n_respondents": "", "irt_b": "", "point_biserial": "", "confidence": conf, "reason": motivo,
                   "rubric": json.dumps(r)})

cab = ["id", "p", "p_low", "p_high", "method", "source", "n_respondents", "irt_b", "point_biserial", "confidence", "reason", "rubric"]
with open(os.path.join(R, "dificuldade-inep.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cab); w.writeheader(); w.writerows(linhas)

dist = {}
for l in linhas:
    k = f"{l['method']}:{FAIXAS[nivel(float(l['p']))-1]}"; dist[k] = dist.get(k, 0) + 1
rel = {"metricas": metricas, "concordancia_avaliadores_lote15": concord, "faltam_rubrica": faltam,
       "n_medidas": len(medidas), "n_medidas_herdadas": sum(1 for m in medidas.values() if m["herdada_de"]),
       "n_saida": len(linhas), "distribuicao": dict(sorted(dist.items())),
       "faixas_reais_calibracao": {FAIXAS[k-1]: int((niv_real == k).sum()) for k in range(1, 6)},
       "faixas_previstas_cv_calibracao": {FAIXAS[k-1]: int((niv_cv == k).sum()) for k in range(1, 6)},
       "calibracao": [{"id": i, "p": round(float(a), 3), "p_cv": round(float(b), 3)} for i, a, b in zip(calib, p_real, p_cv)]}
json.dump(rel, open(os.path.join(R, "relatorio.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: rel[k] for k in ["metricas", "n_medidas", "n_medidas_herdadas", "n_saida", "distribuicao", "faltam_rubrica"]},
                 ensure_ascii=False, indent=1)[:4000])
