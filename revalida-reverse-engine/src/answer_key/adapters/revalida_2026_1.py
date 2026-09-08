"""Adapter congelado para o layout do gabarito Revalida 2026/1."""

from pathlib import Path

from src.answer_key.adapters.base import validate_answer_key_records


class Revalida20261AnswerKeyAdapter:
    adapter_id = "revalida_2026_1_definitive_v1"

    def parse(self, pdf_path: Path, question_count: int) -> list[dict]:
        import pymupdf

        from src.answer_key.answer_key_parser import parse_page

        if question_count != 100:
            raise RuntimeError(
                "O adapter congelado de 2026/1 exige exatamente 100 questões."
            )
        if not pdf_path.is_file():
            raise RuntimeError(f"PDF do gabarito não encontrado: {pdf_path}")

        document = pymupdf.open(pdf_path)
        records = []
        try:
            for page_number, page in enumerate(document, start=1):
                records.extend(parse_page(page, page_number))
        finally:
            document.close()

        records.sort(key=lambda item: item["question_number"])
        validate_answer_key_records(records, question_count)
        return records


ADAPTER = Revalida20261AnswerKeyAdapter()
