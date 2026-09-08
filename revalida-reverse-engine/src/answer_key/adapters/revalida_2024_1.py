"""Adapter do gabarito definitivo Revalida 2024/1.

O PDF usa cores para destacar alterações e sua camada textual omite justamente
alguns desses glifos. Por isso, este adapter é vinculado ao hash do documento
oficial e preserva a transcrição visual auditada da tabela.
"""

import hashlib
from pathlib import Path

from src.answer_key.adapters.base import validate_answer_key_records


EXPECTED_SHA256 = "e1b169df124e78c45e96bdde799d100616aaa4adbde1a654742c65b1ef71ea51"
ANSWERS = tuple(
    "A A C D A D ANULADA C B D D A A D C A ANULADA D D D "
    "B D A B C D A B C B C D B C B D C B A A "
    "D A ANULADA B D C D D C ANULADA A B B B A C A A D A "
    "D C B D A A C D C D C A A B B C B D B B "
    "C B ANULADA A A B C B B C A D A D C A C B C A".split()
)


class Revalida20241AnswerKeyAdapter:
    adapter_id = "revalida_2024_1_definitive_visual_hash_v1"

    def parse(self, pdf_path: Path, question_count: int) -> list[dict]:
        if question_count != 100 or len(ANSWERS) != 100:
            raise RuntimeError("O adapter 2024/1 exige exatamente 100 questões.")
        if not pdf_path.is_file():
            raise RuntimeError(f"PDF do gabarito não encontrado: {pdf_path}")
        digest = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
        if digest != EXPECTED_SHA256:
            raise RuntimeError(
                "O PDF informado não corresponde ao gabarito 2024/1 auditado."
            )
        records = [
            {
                "question_number": number,
                "official_answer": answer,
                "answer_status": "ANNULLED" if answer == "ANULADA" else "VALID",
                "answer_key_type": "DEFINITIVE",
                "source": "INEP",
                "source_page": 1,
                "verification_method": "VISUAL_TRANSCRIPTION_WITH_SHA256",
            }
            for number, answer in enumerate(ANSWERS, start=1)
        ]
        validate_answer_key_records(records, question_count)
        return records


ADAPTER = Revalida20241AnswerKeyAdapter()
