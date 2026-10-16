# -*- coding: utf-8 -*-
"""Monta os dossiês dos 100 Grandes Temas (proposta para a equipe conferir). SEM IA, SEM internet, SEM chaves.
Uso: pdfpython -I montar-dossies.py --catalogo CATALOGO.json --biblioteca PASTA_BIBLIOTECA --saida dossies-100.json
Entradas: ../grandes-temas/temas.json (copiado em temas-100.json), termos.json (palavras por tema, escritas à mão), catalogo-v2.json
(477 documentos verificados), biblioteca local (manifesto + sqlite com o texto das páginas).
REGRA: vínculo só com evidência real:
  - 'titulo'   : o termo do tema aparece no TÍTULO do documento do catálogo;
  - 'temas'    : o termo aparece nos temas que o catalogador anotou ao abrir o documento;
  - 'texto'    : o termo aparece em N páginas do texto do PDF baixado (lista as páginas; OCR marcado como baixa confiança).
Papel: principal = vigente + verificado + nível 1-3 + termo no título (termo específico); complementar = termo nos temas do catálogo
ou em >=5 páginas do texto; histórica = documento revogado/substituído ou versão antiga com o termo no título. Provas do Inep e
documentos com restrição de uso ('NÃO USAR') nunca entram. Documento sem evidência NÃO entra. Tema sem principal fica 'sem dossiê'."""
import argparse, json, os, re, sqlite3, unicodedata, collections

AQUI = os.path.dirname(os.path.abspath(__file__))

def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return " " + re.sub(r"[^a-z0-9]+", " ", s).strip() + " "

def tem(texto_norm, termo):
    t = norm(termo)
    return t in texto_norm

def url_norm(u):
    u = (u or "").strip().lower()
    u = re.sub(r"^https?://(www\.)?", "", u)
    return re.sub(r"[/#?]+$", "", u.split("#")[0])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalogo", required=True)
    ap.add_argument("--biblioteca", required=True)
    ap.add_argument("--saida", required=True)
    a = ap.parse_args()
    temas = json.load(open(os.path.join(AQUI, "temas-100.json"), encoding="utf-8"))["temas"]
    termos = json.load(open(os.path.join(AQUI, "termos.json"), encoding="utf-8"))
    cat = json.load(open(a.catalogo, encoding="utf-8"))
    man = {x["doc_id"]: x for x in json.load(open(os.path.join(a.biblioteca, "manifesto.json"), encoding="utf-8"))}
    con = sqlite3.connect("file:" + os.path.join(a.biblioteca, "biblioteca.sqlite") + "?mode=ro", uri=True)
    ocr = collections.defaultdict(set)
    for d, p in con.execute("select doc_id, pagina from paginas where ocr=1"):
        ocr[d].add(p)

    def usavel(c):
        if (c.get("restricao_uso") or "").upper().startswith("NÃO BAIXAR") or "NÃO USAR" in (c.get("restricao_uso") or "").upper():
            return False
        m = man.get(c["id"])
        if m and m["categoria"] == "oficial_exame":
            return False
        if re.search(r"prova|gabarito|edital|matriz de refer", c["titulo"], re.I) and (c.get("instituicao") or "").lower().startswith("inep"):
            return False
        return True

    base = [c for c in cat if usavel(c)]
    for c in base:
        c["_t"] = norm(c["titulo"])
        c["_m"] = norm(" ".join((c.get("temas") or [])[:3]))
        c["_vig"] = bool(c.get("vigente")) and c["status"] in ("verificado", "versao_a_confirmar") and not c.get("substituido_por")
        c["_ok"] = bool(c.get("vigente")) and c["status"] == "verificado" and not c.get("substituido_por") and int(c.get("nivel") or 9) <= 4 and bool(c.get("url"))
    por_id = {c["id"]: c for c in base}

    def fts(termo, doc):
        q = '"' + norm(termo).strip().replace('"', "") + '"'
        return [p for (p,) in con.execute("select pagina from busca where busca match ? and doc_id=? order by pagina", (q, doc))]

    AREA = {"cm": "CLINICA_MEDICA", "cir": "CIRURGIA_GERAL", "go": "GINECOLOGIA_OBSTETRICIA", "ped": "PEDIATRIA", "mfc": "MEDICINA_FAMILIA_COMUNIDADE", "sc": "TRANSVERSAL", "sm": "TRANSVERSAL"}
    ajustes = json.load(open(os.path.join(AQUI, "ajustes.json"), encoding="utf-8"))
    saida = []
    for t in temas:
        tm = termos[t["id"]]
        k = tm["k"]
        # termo amplo = casa em muitos documentos do catálogo: só vale como "complementar"
        freq = {x: sum(1 for c in base if tem(c["_t"], x)) for x in k}
        especifico = {x for x in k if freq[x] <= 12}
        achados = {}
        for c in base:
            ev = []
            for x in k:
                if tem(c["_t"], x):
                    ev.append({"tipo": "titulo", "termo": x, "amplo": x not in especifico})
                if tem(c["_m"], x):
                    ev.append({"tipo": "temas", "termo": x, "amplo": freq.get(x, 0) > 12})
            if ev:
                achados[c["id"]] = {"c": c, "ev": ev}
        # texto dos PDFs baixados (só para documentos vigentes baixados, termo específico)
        for c in base:
            m = man.get(c["id"])
            if not m or m["situacao"] != "baixado" or not c["_vig"]:
                continue
            for x in k:
                if x not in especifico or len(norm(x).strip()) < 5:
                    continue
                pg = fts(x, c["id"])
                if len(pg) >= max(5, int(0.08 * (m["paginas"] or 1))) or len(pg) >= 25:
                    o = achados.setdefault(c["id"], {"c": c, "ev": []})
                    if not any(e["tipo"] == "texto" and e["termo"] == x for e in o["ev"]):
                        o["ev"].append({"tipo": "texto", "termo": x, "paginas": len(pg), "exemplos": pg[:6],
                                        "paginas_ocr": sorted(set(pg) & ocr.get(c["id"], set()))[:6]})
        vinc = []
        for i, o in achados.items():
            c, ev = o["c"], o["ev"]
            forte = [e for e in ev if e["tipo"] == "titulo" and not e.get("amplo")]
            medio = [e for e in ev if e["tipo"] in ("temas",) and not e.get("amplo")] + [e for e in ev if e["tipo"] == "texto"]
            fraco = [e for e in ev if e.get("amplo")]
            if not c["_vig"]:
                if forte or any(e["tipo"] == "titulo" for e in ev):
                    papel = "historica"
                else:
                    continue
            elif forte and c["_ok"] and c["grande_area"] in (AREA[t["area"]], "TRANSVERSAL") and (any(e["tipo"] in ("temas", "texto") for e in ev) or (c["id"] in man and man[c["id"]]["situacao"] == "baixado")):
                papel = "principal"
            elif forte or medio:
                papel = "complementar"
            elif fraco and c["_ok"]:
                papel = "complementar"
            else:
                continue
            vinc.append({"id": i, "titulo": c["titulo"], "orgao": c["instituicao"], "ano": c["ano"], "versao": c["versao"], "url": c["url"], "nivel": c["nivel"],
                         "papel": papel, "fonte_primaria": c["fonte_primaria"], "evidencia": ev[:4], "situacao_catalogo": c["status"],
                         "baixado_na_biblioteca": bool(man.get(i) and man[i]["situacao"] == "baixado"),
                         "substituido_por": c.get("substituido_por") or None, "_score": (len(forte) * 10 + len(medio) * 3 + len(fraco), -int(c.get("nivel") or 9))})
        ordem = {"principal": 0, "complementar": 1, "historica": 2}
        vinc.sort(key=lambda v: (ordem[v["papel"]], tuple(-s for s in v["_score"])))
        lim = {"principal": 6, "complementar": 6, "historica": 4}
        cont = collections.Counter(); fin = []
        for v in vinc:
            if cont[v["papel"]] < lim[v["papel"]]:
                cont[v["papel"]] += 1; v.pop("_score"); fin.append(v)
        # versão antiga de um principal/complementar vira histórica (cadeia substitui/substituido_por)
        for v in list(fin):
            if v["papel"] == "principal":
                for ant in (por_id.get(v["id"]) or {}).get("substitui") or []:
                    if ant in por_id and not any(f["id"] == ant for f in fin):
                        cc = por_id[ant]
                        fin.append({"id": ant, "titulo": cc["titulo"], "orgao": cc["instituicao"], "ano": cc["ano"], "versao": cc["versao"], "url": cc["url"], "nivel": cc["nivel"],
                                    "papel": "historica", "fonte_primaria": cc["fonte_primaria"], "evidencia": [{"tipo": "versao_anterior_de", "id": v["id"]}],
                                    "situacao_catalogo": cc["status"], "baixado_na_biblioteca": False, "substituido_por": v["id"]})
        for f in fin:
            if f["papel"] == "principal" and not (f["url"] or "").startswith("https://"):
                f["papel"] = "complementar"; f["ajuste"] = "Link sem https no catálogo: não pode ser principal."
        aj = ajustes.get(t["id"], {})
        fin = [f for f in fin if f["id"] not in aj.get("remover", {})]
        for f in fin:
            if f["id"] in aj.get("promover", {}) and f["papel"] == "complementar":
                f["papel"] = "principal"; f["ajuste"] = aj["promover"][f["id"]]
            if f["id"] in aj.get("rebaixar", {}):
                f["papel"] = "complementar"; f["ajuste"] = aj["rebaixar"][f["id"]]
        palavras = []
        for w in k + tm["x"]:
            if w not in palavras and len(w) <= 60:
                palavras.append(w)
        saida.append({"tema": t["id"], "titulo": t["titulo"], "area": t["area"], "subarea": t["subarea"], "palavras": palavras[:50], "fontes": fin,
                      "situacao": "proposto" if any(f["papel"] == "principal" for f in fin) else "sem_dossie",
                      "termos_amplos": sorted(set(k) - especifico)})
    json.dump({"gerado_em": "2026-10-13", "metodo": "correspondencia-de-texto-com-evidencia (sem IA)", "temas": saida}, open(a.saida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("temas:", len(saida), "com principal:", sum(1 for s in saida if s["situacao"] == "proposto"), "sem dossiê:", [s["tema"] for s in saida if s["situacao"] == "sem_dossie"])

main()
