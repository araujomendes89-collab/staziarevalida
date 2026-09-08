"""Adapter visual do gabarito preliminar Revalida 2020, caderno 01."""

import hashlib
from pathlib import Path

from src.answer_key.adapters.base import validate_answer_key_records


EXPECTED_SHA256 = "e9b877cdeb5e963f6dfc4fd058ec65aa1da8a748ce3ad565cd2ba699fe616c73"
ANSWERS = tuple(
    "A C C A B D C D A C B B D B B A C C B C B C C B A A A A B B C A A C D C B A B B B A B C D C C C B "
    "D D C C A B D C A B D C D B B A B C D D D A D C C B A D A D B C D C B D D C B A D D C B B C D D C D A".split()
)


class Revalida20201AnswerKeyAdapter:
    adapter_id = "revalida_2020_caderno_01_preliminary_visual_hash_v1"

    def parse(self, pdf_path: Path, question_count: int) -> list[dict]:
        if question_count != 100 or len(ANSWERS) != 100:
            raise RuntimeError("O adapter 2020/1 exige exatamente 100 questões.")
        if not pdf_path.is_file():
            raise RuntimeError(f"PDF do gabarito não encontrado: {pdf_path}")
        if hashlib.sha256(pdf_path.read_bytes()).hexdigest() != EXPECTED_SHA256:
            raise RuntimeError("O PDF não corresponde ao gabarito 2020/1 auditado.")
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


ADAPTER = Revalida20201AnswerKeyAdapter()
