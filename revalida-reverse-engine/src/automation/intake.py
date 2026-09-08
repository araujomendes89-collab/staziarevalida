"""Descoberta, validação e instalação segura de uma nova edição."""

import hashlib
import json
import re
import shutil
from pathlib import Path

import pymupdf

from src.answer_key.adapters import load_answer_key_adapter
from src.answer_key.adapters.generic_text import GenericTextAnswerKeyAdapter
from src.config.exams import (
    PROJECT_ROOT,
    ExamConfig,
    get_exam_config,
    save_exam_config,
)
from src.extraction.pdf_reader import read_pdf
from src.extraction.question_detector import detect_questions
from src.extraction.question_parser import parse_question
from src.extraction.visual_asset_extractor import extract_visual_assets
from src.ingestion.build_exam_master import write_exam_master


KNOWN_ANSWER_KEY_ADAPTERS = {
    "revalida_2020_1": "src.answer_key.adapters.revalida_2020_1",
    "revalida_2020_2": "src.answer_key.adapters.revalida_2020_2",
    "revalida_2024_1": "src.answer_key.adapters.revalida_2024_1",
    "enamed_2025": "src.answer_key.adapters.enamed_2025",
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _pdf_preview(path: Path, pages: int = 4) -> str:
    document = pymupdf.open(path)
    try:
        return "\n".join(
            document[index].get_text("text", sort=True)
            for index in range(min(pages, len(document)))
        )
    finally:
        document.close()


def discover_exam_pdfs(input_dir: Path) -> tuple[Path, Path]:
    input_dir = input_dir.expanduser().resolve()
    if not input_dir.is_dir():
        raise RuntimeError(f"Pasta de entrada não encontrada: {input_dir}")
    pdfs = sorted(
        path for path in input_dir.glob("*.pdf") if not path.name.startswith("._")
    )
    if len(pdfs) != 2:
        raise RuntimeError(
            f"A pasta deve conter exatamente dois PDFs; encontrados: {len(pdfs)}."
        )

    scored = []
    for path in pdfs:
        preview = _pdf_preview(path)
        normalized = f"{path.name}\n{preview}".upper()
        answer_score = 4 * normalized.count("GABARITO")
        answer_score += 2 * normalized.count("ANULADA")
        proof_score = normalized.count("QUESTÃO") + normalized.count("QUESTAO")
        scored.append((path, answer_score, proof_score))

    answer_key = max(scored, key=lambda item: (item[1], -item[2]))[0]
    question_pdf = max(scored, key=lambda item: (item[2], -item[1]))[0]
    if answer_key == question_pdf:
        answer_key = next(path for path in pdfs if path != question_pdf)
    if max(item[1] for item in scored) == 0:
        raise RuntimeError("Não foi possível identificar com segurança o gabarito.")
    if max(item[2] for item in scored) == 0:
        raise RuntimeError("Não foi possível identificar com segurança a prova.")
    return question_pdf, answer_key


def infer_exam_identity(
    paths: tuple[Path, Path], input_dir: Path | None = None
) -> tuple[str, int, int]:
    identity_text = " ".join(
        [input_dir.name if input_dir is not None else ""]
        + [path.name for path in paths]
    )
    if re.search(r"\bENAMED\b", identity_text, re.IGNORECASE):
        years = re.findall(r"(?<!\d)(20\d{2})(?!\d)", identity_text)
        if not years:
            raise RuntimeError("Não foi possível inferir o ano da prova Enamed.")
        year = int(years[0])
        return f"enamed_{year}", year, 1
    if input_dir is not None:
        folder_match = re.search(
            r"(?<!\d)(20\d{2})(?:\s*[/_:\-.]\s*([12]))?(?!\d)",
            input_dir.name,
        )
        if folder_match:
            year = int(folder_match.group(1))
            edition = int(folder_match.group(2) or 1)
            return f"revalida_{year}_{edition}", year, edition
    text = " ".join(
        f"{path.name} {_pdf_preview(path, pages=2)}" for path in paths
    )
    matches = re.findall(r"(?<!\d)(20\d{2})\s*[/_:\-.]\s*([12])(?!\d)", text)
    identities = {(int(year), int(edition)) for year, edition in matches}
    if len(identities) != 1:
        raise RuntimeError(
            "Não foi possível inferir uma única edição pelos nomes dos PDFs. "
            "Use nomes contendo ano e edição, por exemplo 2027_1_prova.pdf e "
            "2027_1_gabarito.pdf."
        )
    year, edition = identities.pop()
    return f"revalida_{year}_{edition}", year, edition


def inspect_questions(
    question_pdf: Path,
    allowed_warning_numbers: tuple[int, ...] = (),
):
    pdf_data = read_pdf(question_pdf)
    raw = detect_questions(
        pdf_data,
        start_page=1,
        end_page=pdf_data.page_count,
        max_questions=200,
    )
    parsed = [parse_question(question) for question in raw]
    if not parsed:
        raise RuntimeError("Nenhuma questão foi detectada na prova.")
    numbers = [question.question_number for question in parsed]
    expected = list(range(1, len(parsed) + 1))
    if numbers != expected:
        raise RuntimeError("A numeração das questões não é contínua a partir da Q001.")
    problems = {
        question.question_number: question.warnings
        for question in parsed
        if question.warnings
        and question.question_number not in allowed_warning_numbers
    }
    if problems:
        sample = "; ".join(
            f"Q{number:03d}: {', '.join(warnings)}"
            for number, warnings in list(problems.items())[:10]
        )
        raise RuntimeError(f"Questões com falhas estruturais: {sample}")
    return parsed, parsed[0].page_start, parsed[-1].page_end


def _copy_verified(source: Path, destination: Path, force: bool) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if _sha256(source) == _sha256(destination):
            return
        if not force:
            raise RuntimeError(
                f"O destino já existe com conteúdo diferente: {destination}. "
                "Use --force apenas após conferir a edição."
            )
    shutil.copy2(source, destination)


def prepare_exam_folder(
    input_dir: Path,
    root: Path = PROJECT_ROOT,
    force: bool = False,
) -> tuple[ExamConfig, dict]:
    question_source, answer_source = discover_exam_pdfs(input_dir)
    exam_id, year, edition = infer_exam_identity(
        (question_source, answer_source), input_dir
    )

    try:
        existing_exam = get_exam_config(exam_id, root)
    except ValueError:
        existing_exam = None
    adapter_path = (
        existing_exam.answer_key_adapter
        if existing_exam is not None
        else KNOWN_ANSWER_KEY_ADAPTERS.get(exam_id)
    )
    adapter = (
        load_answer_key_adapter(adapter_path)
        if adapter_path is not None
        else GenericTextAnswerKeyAdapter()
    )
    if existing_exam is not None:
        provisional_answers = adapter.parse(
            answer_source, existing_exam.question_count
        )
        allowed_warning_numbers = tuple(
            record["question_number"]
            for record in provisional_answers
            if record["answer_status"] != "VALID"
        )
    else:
        allowed_warning_numbers = ()
    parsed, start_page, end_page = inspect_questions(
        question_source,
        allowed_warning_numbers=allowed_warning_numbers,
    )
    question_count = len(parsed)
    answers = adapter.parse(answer_source, question_count)
    excluded = tuple(
        record["question_number"]
        for record in answers
        if record["answer_status"] != "VALID"
    )
    statistically_excluded = tuple(
        record["question_number"]
        for record in answers
        if record["answer_status"] == "EXCLUDED_STATISTICAL"
    )

    if existing_exam is not None:
        exam = existing_exam
        if exam.question_count != question_count:
            raise RuntimeError(
                f"{exam_id}: a prova contém {question_count} questões, mas a "
                f"configuração existente declara {exam.question_count}."
            )
        if exam.excluded_question_numbers != excluded:
            raise RuntimeError(
                f"{exam_id}: questões anuladas divergentes da configuração; "
                f"esperadas={exam.excluded_question_numbers}, extraídas={excluded}."
            )
        if exam.statistically_excluded_question_numbers != statistically_excluded:
            raise RuntimeError(
                f"{exam_id}: exclusões estatísticas divergentes da configuração; "
                f"esperadas={exam.statistically_excluded_question_numbers}, "
                f"extraídas={statistically_excluded}."
            )
    else:
        exam = ExamConfig(
            exam_id=exam_id,
            dataset_version="1.0.0",
            question_count=question_count,
            master_relative_path=Path(
                f"data/processed/{exam_id}_master_v1_0.json"
            ),
            assets_relative_dir=Path(
                f"data/processed/visual_assets_v2/{exam_id}"
            ),
            crops_relative_dir=Path(
                f"data/processed/question_crops/{exam_id}"
            ),
            classification_taxonomy_relative_path=Path(
                "data/taxonomy/revalida_taxonomy_v2.json"
            ),
            classification_taxonomy_version="2.0.0",
            canonical_taxonomy_relative_path=Path(
                "data/taxonomy/revalida_taxonomy_v2_1.json"
            ),
            canonical_taxonomy_version="2.1.0",
            answer_key_adapter=(
                adapter_path or "src.answer_key.adapters.generic_text"
            ),
            exam_name=f"Revalida INEP {year}/{edition}",
            exam_year=year,
            exam_edition=edition,
            question_pdf_relative_path=Path(
                f"data/raw/provas/{exam_id}_caderno_1.pdf"
            ),
            answer_key_pdf_relative_path=Path(
                f"data/raw/gabaritos/{exam_id}_gabarito.pdf"
            ),
            question_start_page=start_page,
            question_end_page=end_page,
            excluded_question_numbers=excluded,
            statistically_excluded_question_numbers=statistically_excluded,
        )

    question_destination = exam.question_pdf_path(root)
    answer_destination = exam.answer_key_pdf_path(root)
    _copy_verified(question_source, question_destination, force)
    _copy_verified(answer_source, answer_destination, force)
    if existing_exam is None:
        save_exam_config(exam, root)

    manifest = extract_visual_assets(question_destination, exam.assets_dir(root))
    master_path, master = write_exam_master(exam, root)

    report = {
        "exam_id": exam.exam_id,
        "status": "LOCAL_DATASET_READY",
        "question_pdf": str(question_destination),
        "answer_key_pdf": str(answer_destination),
        "question_pdf_sha256": _sha256(question_destination),
        "answer_key_pdf_sha256": _sha256(answer_destination),
        "master_path": str(master_path),
        "question_count": question_count,
        "classifiable_question_count": len(exam.classifiable_question_numbers),
        "excluded_question_numbers": list(excluded),
        "statistically_excluded_question_numbers": list(statistically_excluded),
        "visual_assets": len(manifest),
        "question_page_range": [start_page, end_page],
        "answer_key_adapter": exam.answer_key_adapter,
        "master_status": master["verification"]["dataset_status"],
    }
    report_path = root / "data/processed/intake" / f"{exam.exam_id}_intake.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = report_path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    temporary.replace(report_path)
    return exam, report
