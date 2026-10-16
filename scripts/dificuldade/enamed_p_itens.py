# Calcula p (proporção de acerto) por item do Enamed 2025 a partir dos microdados do Inep (dado não confiável até conferido).
# Uso: python3 -I enamed_p_itens.py <pasta DADOS> <saida.json>
import sys, json, csv, os
dados, saida = sys.argv[1], sys.argv[2]
par = {}
with open(os.path.join(dados, "microdados2025_parametros_itens.txt"), encoding="utf-8-sig") as f:
    for r in csv.DictReader(f, delimiter=";"):
        i1, i2 = int(r["NU_ITEM_PROVA_1"]), int(r["NU_ITEM_PROVA_2"])
        num = lambda v: float(v) if v not in ("", ".") else None
        par[i1] = dict(item_c1=i1, item_c2=i2, mantido=r["ITEM_MANTIDO"] == "1", b=num(r["PARAMETRO_B"]),
                       bisserial=num(r["COR_BISSERIAL"]), infit=num(r["INFIT"]), outfit=num(r["OUTFIT"]))
c2_to_c1 = {v["item_c2"]: k for k, v in par.items()}
def acumula(arq, tipo):
    cont = {}
    gab1 = None
    with open(arq, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            if r["TP_PRES"] != "555": continue
            cad = r["CO_CADERNO"]; ace = r["DS_VT_ACE_OBJ"]; gab = r["DS_VT_GAB_OBJ"]
            if cad == "1" and gab1 is None: gab1 = gab
            for pos, ch in enumerate(ace, start=1):
                item = pos if cad == "1" else c2_to_c1.get(pos) if cad == "2" else None
                if item is None or ch not in "01": continue
                c = cont.setdefault(item, [0, 0]); c[0] += ch == "1"; c[1] += 1
    return cont, gab1
conc, gab1 = acumula(os.path.join(dados, "Enade/microdados_enade_2025_arq3.txt"), "concluintes")
dem, _ = acumula(os.path.join(dados, "Demais Participantes/microdados_demais_part_2025_arq1.txt"), "demais")
out = []
for i in sorted(par):
    p = par[i]; a, n = conc.get(i, [0, 0]); ad, nd = dem.get(i, [0, 0])
    p.update(gabarito_c1=gab1[i - 1] if gab1 else None, p_concluintes=round(a / n, 4) if n else None, n_concluintes=n,
             p_demais=round(ad / nd, 4) if nd else None, n_demais=nd)
    out.append(p)
json.dump(out, open(saida, "w"), ensure_ascii=False, indent=1)
print("itens", len(out), "com p", sum(1 for o in out if o["p_concluintes"] is not None), "mantidos", sum(o["mantido"] for o in out))
