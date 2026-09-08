"""Constrói um master normalizado usando a configuração da edição."""

import json
from collections import defaultdict

from src.answer_key.adapters import load_answer_key_adapter
from src.config.exams import PROJECT_ROOT
from src.extraction.pdf_reader import read_pdf
from src.extraction.question_detector import detect_questions
from src.extraction.question_parser import parse_question


def build_exam_master(exam, root=PROJECT_ROOT):
    question_pdf = exam.question_pdf_path(root)
    answer_key_pdf = exam.answer_key_pdf_path(root)
    for label, path in (("Prova", question_pdf), ("Gabarito", answer_key_pdf)):
        if not path.is_file():
            raise RuntimeError(f"{label} não encontrado: {path}")

    pdf_data = read_pdf(question_pdf)
    raw_questions = detect_questions(
        pdf_data,
        start_page=exam.question_start_page,
        end_page=exam.question_end_page,
    )
    parsed = [parse_question(question) for question in raw_questions]
    numbers = [question.question_number for question in parsed]
    expected = list(range(1, exam.question_count + 1))
    if numbers != expected:
        raise RuntimeError(
            f"Questões extraídas não correspondem a Q001–Q{exam.question_count:03d}."
        )

    adapter = load_answer_key_adapter(exam.answer_key_adapter)
    answers = adapter.parse(answer_key_pdf, exam.question_count)
    answer_map = {record["question_number"]: record for record in answers}
    excluded = tuple(
        record["question_number"]
        for record in answers
        if record["answer_status"] != "VALID"
    )
    if excluded != exam.excluded_question_numbers:
        raise RuntimeError(
            "Questões anuladas/excluídas divergem da configuração: "
            f"configuradas={exam.excluded_question_numbers}, extraídas={excluded}."
        )

    assets_by_question = defaultdict(list)
    manifest_path = exam.assets_dir(root) / "visual_assets_manifest.json"
    if manifest_path.is_file():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for asset in manifest:
            assets_by_question[asset["question_number"]].append(asset)

    questions = []
    for parsed_question in parsed:
        number = parsed_question.question_number
        answer = answer_map[number]
        assets = []
        for item in assets_by_question.get(number, []):
            assets.append(
                {
                    "file": str(exam.assets_dir(root) / item["asset"]),
                    "type": item.get("type", "image"),
                    "source_page": item.get("source_page"),
                    "bbox": item.get("bbox"),
                }
            )

        questions.append(
            {
                "exam_id": exam.exam_id,
                "exam_year": exam.exam_year,
                "exam_edition": exam.exam_edition,
                "exam_stage": exam.exam_stage,
                "booklet": exam.booklet,
                "question_number": number,
                "item_code": parsed_question.item_code,
                "version_code": parsed_question.version_code,
                "page_start": parsed_question.page_start,
                "page_end": parsed_question.page_end,
                "stem": parsed_question.stem,
                "clean_stem": parsed_question.stem,
                "alternatives": {
                    letter: parsed_question.alternatives.get(letter, "")
                    for letter in "ABCD"
                },
                "official_answer": answer["official_answer"],
                "answer_status": answer["answer_status"],
                "answer_key_type": answer["answer_key_type"],
                "visual": {
                    "question_crop": None,
                    "has_specific_assets": bool(assets),
                    "assets": assets,
                },
                "verification": {
                    "structure": True,
                    "answer_key": "ANSWER_KEY_VERIFIED",
                    "status": "DATASET_READY",
                },
                "source": {
                    "exam_pdf": str(question_pdf),
                    "answer_key_pdf": str(answer_key_pdf),
                    "institution": "INEP",
                },
            }
        )

    dataset = {
        "exam": {
            "exam_id": exam.exam_id,
            "name": exam.exam_name,
            "year": exam.exam_year,
            "edition": exam.exam_edition,
            "stage": exam.exam_stage,
            "booklet": exam.booklet,
            "total_questions": exam.question_count,
            "dataset_version": exam.dataset_version,
        },
        "verification": {
            "question_count": len(questions),
            "answer_key_verified": True,
            "dataset_status": "DATASET_READY",
            "specific_visual_questions": sum(
                bool(assets) for assets in assets_by_question.values()
            ),
            "excluded_questions": list(exam.excluded_question_numbers),
            "statistically_excluded_questions": list(
                exam.statistically_excluded_question_numbers
            ),
        },
        "questions": questions,
    }
    return dataset


def write_exam_master(exam, root=PROJECT_ROOT):
    dataset = build_exam_master(exam, root)
    output_path = exam.master_path(root)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(dataset, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(output_path)
    return output_path, dataset
