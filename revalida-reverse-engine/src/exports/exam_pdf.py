"""Monta prova, gabarito e correção em PDF no layout do simulado."""

import json
from pathlib import Path


def _reportlab():
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            Image,
            KeepTogether,
            PageBreak,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError as exc:
        raise RuntimeError("Instale a dependência de PDF com: pip install reportlab pypdf") from exc
    return locals()


def _styles(rl):
    styles = rl["getSampleStyleSheet"]()
    styles.add(
        rl["ParagraphStyle"](
            name="CapaTitulo", parent=styles["Title"], fontName="Helvetica-Bold",
            fontSize=21, leading=25, alignment=rl["TA_CENTER"], textColor=rl["colors"].HexColor("#17365D"),
        )
    )
    styles.add(
        rl["ParagraphStyle"](
            name="Questao", parent=styles["BodyText"], fontName="Helvetica",
            fontSize=9.2, leading=12.2, alignment=rl["TA_JUSTIFY"], spaceAfter=5,
        )
    )
    styles.add(
        rl["ParagraphStyle"](
            name="Numero", parent=styles["Heading3"], fontName="Helvetica-Bold",
            fontSize=10.5, leading=13, textColor=rl["colors"].HexColor("#17365D"), spaceBefore=7, spaceAfter=5,
        )
    )
    styles.add(
        rl["ParagraphStyle"](
            name="Pequeno", parent=styles["BodyText"], fontSize=7.7, leading=9.5,
        )
    )
    styles.add(
        rl["ParagraphStyle"](
            name="TabelaCabecalho", parent=styles["BodyText"],
            fontName="Helvetica-Bold", fontSize=8, leading=10,
            textColor=rl["colors"].HexColor("#17365D"),
        )
    )
    styles.add(
        rl["ParagraphStyle"](
            name="TabelaCelula", parent=styles["BodyText"],
            fontName="Helvetica", fontSize=8, leading=10,
            splitLongWords=True,
        )
    )
    return styles


def _safe(value):
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _header_footer(canvas, document, title, draft):
    width, height = document.pagesize
    canvas.saveState()
    canvas.setFillColorRGB(0.09, 0.21, 0.36)
    canvas.rect(0, height - 18, width, 18, fill=1, stroke=0)
    canvas.setFillColorRGB(1, 1, 1)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(16, height - 12, title)
    if draft:
        canvas.setFillColorRGB(0.75, 0.1, 0.1)
        canvas.setFont("Helvetica-Bold", 7)
        canvas.drawRightString(width - 16, height - 12, "VERSÃO PARA REVISÃO")
    canvas.setFillColorRGB(0.25, 0.25, 0.25)
    canvas.setFont("Helvetica", 7)
    canvas.drawCentredString(width / 2, 10, f"Página {document.page}")
    canvas.restoreState()


def _question_story(record, rl, styles, correction=False):
    q = record["question"]
    number = record["slot"]
    story = [rl["Paragraph"](f"QUESTÃO {number:03d}", styles["Numero"])]
    story.append(rl["Paragraph"](_safe(q["stem"]), styles["Questao"]))
    if q["support_type"] in {"TABLE", "LAB_PANEL"} and q["support_rows"]:
        if q.get("support_title"):
            story.append(
                rl["Paragraph"](
                    f"<b>{_safe(q['support_title'])}</b>", styles["Pequeno"]
                )
            )
        # Strings simples em células do ReportLab não quebram linha. Usar
        # Paragraph em todas as células evita que textos longos invadam a
        # coluna vizinha e permite calcular corretamente a altura da linha.
        data = [[
            rl["Paragraph"]("Parâmetro", styles["TabelaCabecalho"]),
            rl["Paragraph"]("Resultado", styles["TabelaCabecalho"]),
        ]] + [
            [
                rl["Paragraph"](_safe(row["label"]), styles["TabelaCelula"]),
                rl["Paragraph"](_safe(row["value"]), styles["TabelaCelula"]),
            ]
            for row in q["support_rows"]
        ]
        table = rl["Table"](
            data,
            colWidths=[62 * rl["mm"], 106 * rl["mm"]],
            repeatRows=1,
            splitByRow=1,
            hAlign="LEFT",
        )
        table.setStyle(
            rl["TableStyle"](
                [
                    ("BACKGROUND", (0, 0), (-1, 0), rl["colors"].HexColor("#D9EAF7")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.35, rl["colors"].HexColor("#8A9BA8")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.extend([rl["Spacer"](1, 3), table, rl["Spacer"](1, 5)])
    elif q["support_type"] == "IMAGE_REQUEST":
        image_path = record.get("support_image_path")
        if image_path and Path(image_path).is_file():
            story.append(rl["Image"](image_path, width=110 * rl["mm"], height=70 * rl["mm"], kind="proportional"))
        else:
            story.append(
                rl["Paragraph"](
                    "<i>Imagem clínica prevista para revisão editorial: "
                    + _safe(q.get("image_description") or "descrição não informada")
                    + "</i>",
                    styles["Pequeno"],
                )
            )
    for letter, text in q["alternatives"].items():
        story.append(rl["Paragraph"](f"<b>({letter})</b> {_safe(text)}", styles["Questao"]))
    if correction:
        story.append(rl["Paragraph"](f"<b>Gabarito: {q['correct_answer']}</b>", styles["Numero"]))
        story.append(rl["Paragraph"](_safe(q["professor_explanation"]), styles["Questao"]))
        for letter, text in q["alternative_explanations"].items():
            story.append(rl["Paragraph"](f"<b>Alternativa {letter}:</b> {_safe(text)}", styles["Questao"]))
        sources = "; ".join(
            f"{item['source_file']}: {item['supported_claim']}" for item in q["source_citations"]
        )
        story.append(rl["Paragraph"]("<b>Fontes:</b> " + _safe(sources), styles["Pequeno"]))
        story.append(
            rl["Paragraph"](
                f"Alvo editorial Rasch: b={record['blueprint']['psychometric_target']['target_difficulty_b']:+.2f}; "
                "status: não calibrada.",
                styles["Pequeno"],
            )
        )
        if record.get("medical_review"):
            story.append(
                rl["Paragraph"](
                    f"Revisão médica: {record['medical_review']['verdict']} | "
                    f"Revisão pedagógica: {record['pedagogical_review']['verdict']}",
                    styles["Pequeno"],
                )
            )
    story.append(rl["Spacer"](1, 8))
    return story


def build_exam_pdfs(reviewed_exam_path: Path, output_dir: Path):
    rl = _reportlab()
    styles = _styles(rl)
    exam = json.loads(reviewed_exam_path.read_text(encoding="utf-8"))
    records = sorted(exam["questions"], key=lambda item: item["slot"])
    if not records:
        raise RuntimeError("A prova não contém questões.")
    output_dir.mkdir(parents=True, exist_ok=True)
    draft = any(record.get("status") != "APPROVED_FOR_PDF" for record in records)
    title = exam.get("title", "SIMULADO REVALIDA/ENAMED 2026.2")

    def document(path, story):
        doc = rl["SimpleDocTemplate"](
            str(path), pagesize=rl["A4"], rightMargin=17 * rl["mm"], leftMargin=17 * rl["mm"],
            topMargin=23 * rl["mm"], bottomMargin=17 * rl["mm"], title=title,
        )
        callback = lambda canvas, current: _header_footer(canvas, current, title, draft)
        doc.build(story, onFirstPage=callback, onLaterPages=callback)

    cover = [
        rl["Spacer"](1, 45 * rl["mm"]),
        rl["Paragraph"](title, styles["CapaTitulo"]),
        rl["Spacer"](1, 8 * rl["mm"]),
        rl["Paragraph"](
            f"Caderno com {len(records)} "
            + ("questão inédita" if len(records) == 1 else "questões inéditas"),
            styles["Heading2"],
        ),
        rl["Spacer"](1, 5 * rl["mm"]),
        rl["Paragraph"](
            "Itens planejados pela matriz institucional e por alvos editoriais Rasch. "
            "Os parâmetros de dificuldade ainda não são empíricos.", styles["Questao"]
        ),
        rl["PageBreak"](),
    ]
    exam_story = list(cover)
    for record in records:
        exam_story.extend(_question_story(record, rl, styles, correction=False))
    exam_pdf = output_dir / "prova.pdf"
    document(exam_pdf, exam_story)

    answers = [["Questão", "Resposta", "Questão", "Resposta"]]
    half = (len(records) + 1) // 2
    for index in range(half):
        left = records[index]
        right = records[index + half] if index + half < len(records) else None
        answers.append(
            [
                f"{left['slot']:03d}", left["question"]["correct_answer"],
                f"{right['slot']:03d}" if right else "", right["question"]["correct_answer"] if right else "",
            ]
        )
    answer_table = rl["Table"](answers, colWidths=[30 * rl["mm"]] * 4, repeatRows=1)
    answer_table.setStyle(
        rl["TableStyle"](
            [
                ("BACKGROUND", (0, 0), (-1, 0), rl["colors"].HexColor("#17365D")),
                ("TEXTCOLOR", (0, 0), (-1, 0), rl["colors"].white),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.4, rl["colors"].grey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
            ]
        )
    )
    answer_pdf = output_dir / "gabarito.pdf"
    document(
        answer_pdf,
        [rl["Spacer"](1, 20 * rl["mm"]), rl["Paragraph"]("GABARITO", styles["CapaTitulo"]), rl["Spacer"](1, 8 * rl["mm"]), answer_table],
    )

    correction_story = [rl["Paragraph"]("CORREÇÃO COMENTADA", styles["CapaTitulo"]), rl["PageBreak"]()]
    for record in records:
        correction_story.extend(_question_story(record, rl, styles, correction=True))
    correction_pdf = output_dir / "correcao_comentada.pdf"
    document(correction_pdf, correction_story)
    return exam_pdf, answer_pdf, correction_pdf
