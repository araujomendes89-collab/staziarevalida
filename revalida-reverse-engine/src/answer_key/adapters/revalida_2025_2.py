"""Adapter do gabarito definitivo Revalida 2025/2, caderno 1."""

import re
from pathlib import Path

from src.answer_key.adapters.base import validate_answer_key_records


class Revalida20252AnswerKeyAdapter:
    adapter_id = "revalida_2025_2_definitive_v1"

    def parse(self, pdf_path: Path, question_count: int) -> list[dict]:
        import pymupdf

        if not pdf_path.is_file():
            raise RuntimeError(f"PDF do gabarito não encontrado: {pdf_path}")

        document = pymupdf.open(pdf_path)
        records = []
        try:
            for page_number, page in enumerate(document, start=1):
                lines = [line.strip() for line in page.get_text("text").splitlines()]
                for index, line in enumerate(lines[:-1]):
                    if not re.fullmatch(r"(?:[1-9]|[1-9][0-9]|100)", line):
                        continue
                    answer = lines[index + 1].strip().upper()
                    if answer not in {"A", "B", "C", "D", "ANULADA"}:
                        continue
                    records.append(
                        {
                            "question_number": int(line),
                            "official_answer": answer,
                            "answer_status": "ANNULLED" if answer == "ANULADA" else "VALID",
                            "answer_key_type": "DEFINITIVE",
                            "source": "INEP",
                            "source_page": page_number,
                        }
                    )
        finally:
            document.close()

        records.sort(key=lambda item: item["question_number"])
        validate_answer_key_records(records, question_count)
        return records


ADAPTER = Revalida20252AnswerKeyAdapter()
