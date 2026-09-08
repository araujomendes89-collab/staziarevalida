"""Adapter do gabarito definitivo do Enamed 2025, caderno 01."""

import re
import unicodedata
from pathlib import Path

import pymupdf

from src.answer_key.adapters.base import validate_answer_key_records


def _normalize(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char))


class Enamed2025AnswerKeyAdapter:
    adapter_id = "enamed_2025_definitive_booklet_01_v1"

    def parse(self, pdf_path: Path, question_count: int) -> list[dict]:
        if question_count != 100:
            raise RuntimeError("O adapter do Enamed 2025 exige exatamente 100 questões.")
        if not pdf_path.is_file():
            raise RuntimeError(f"PDF do gabarito não encontrado: {pdf_path}")

        records = {}
        document = pymupdf.open(pdf_path)
        try:
            for page_number, page in enumerate(document, start=1):
                words = page.get_text("words", sort=True)
                answer_words = []
                for word in words:
                    token = _normalize(word[4]).upper().rstrip("*")
                    if token in {"A", "B", "C", "D", "ANULADA", "EXCLUIDA"}:
                        answer_words.append((*word[:4], token))

                for word in words:
                    raw_number = word[4].strip()
                    if not re.fullmatch(r"\d{1,3}", raw_number):
                        continue
                    number = int(raw_number)
                    if not 1 <= number <= question_count:
                        continue
                    y = (word[1] + word[3]) / 2
                    candidates = [
                        answer
                        for answer in answer_words
                        if answer[0] > word[2]
                        and answer[0] - word[2] < 130
                        and abs(((answer[1] + answer[3]) / 2) - y) < 18
                    ]
                    if not candidates:
                        continue
                    token = min(candidates, key=lambda item: item[0])[4]
                    if token == "ANULADA":
                        official_answer = "ANULADA"
                        status = "ANNULLED"
                    elif token == "EXCLUIDA":
                        official_answer = "EXCLUÍDA"
                        status = "EXCLUDED_STATISTICAL"
                    else:
                        official_answer = token
                        status = "VALID"
                    records[number] = {
                        "question_number": number,
                        "official_answer": official_answer,
                        "answer_status": status,
                        "answer_key_type": "DEFINITIVE",
                        "source": "INEP_ENAMED",
                        "source_page": page_number,
                        "verification_method": "ENAMED_2025_POSITIONAL_TABLE",
                    }
        finally:
            document.close()

        output = [records[number] for number in sorted(records)]
        validate_answer_key_records(output, question_count)
        return output


ADAPTER = Enamed2025AnswerKeyAdapter()
