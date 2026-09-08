"""Adapter visual do gabarito preliminar Revalida 2020, caderno 02."""

import hashlib
from pathlib import Path

from src.answer_key.adapters.base import validate_answer_key_records


EXPECTED_SHA256 = "fcfb7de8437a10923e550a4cffb13bce28e570b42e3ed637b6d1136511c4509e"
ANSWERS = tuple(
    "C A C D A B D C B B A C B A D B B C C B C C C B A A A A B C B A A D C A B C B A B B C B C D C C D "
    "B D C C D A B A C D B D C B B C A B D A D D C D B C D A D A D B C C B D D B C D A C D B B D C C D A D".split()
)


class Revalida20202AnswerKeyAdapter:
    adapter_id = "revalida_2020_caderno_02_preliminary_visual_hash_v1"

    def parse(self, pdf_path: Path, question_count: int) -> list[dict]:
        if question_count != 100 or len(ANSWERS) != 100:
            raise RuntimeError("O adapter 2020/2 exige exatamente 100 questões.")
        if not pdf_path.is_file():
            raise RuntimeError(f"PDF do gabarito não encontrado: {pdf_path}")
        if hashlib.sha256(pdf_path.read_bytes()).hexdigest() != EXPECTED_SHA256:
            raise RuntimeError("O PDF não corresponde ao gabarito 2020/2 auditado.")
        records = [
            {
                "question_number": number,
                "official_answer": answer,
                "answer_status": "VALID",
                "answer_key_type": "PRELIMINARY",
                "source": "INEP",
                "source_page": 1 if number < 50 else 2,
                "verification_method": "VISUAL_TRANSCRIPTION_WITH_SHA256",
            }
            for number, answer in enumerate(ANSWERS, start=1)
        ]
        validate_answer_key_records(records, question_count)
        return records


ADAPTER = Revalida20202AnswerKeyAdapter()
