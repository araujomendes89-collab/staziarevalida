"""Contrato comum para parsers de gabarito por edição."""

import importlib
from pathlib import Path
from typing import Protocol, runtime_checkable


@runtime_checkable
class AnswerKeyAdapter(Protocol):
    adapter_id: str

    def parse(self, pdf_path: Path, question_count: int) -> list[dict]: ...


def validate_answer_key_records(records: list[dict], question_count: int) -> None:
    if not isinstance(records, list):
        raise RuntimeError("O adapter deve retornar uma lista de respostas.")

    numbers = []
    for record in records:
        if not isinstance(record, dict):
            raise RuntimeError("O adapter retornou um registro que não é objeto.")
        number = record.get("question_number")
        answer = record.get("official_answer")
        if not isinstance(number, int):
            raise RuntimeError("Gabarito contém question_number inválido.")
        if answer not in {"A", "B", "C", "D", "ANULADA", "EXCLUÍDA"}:
            raise RuntimeError(f"Q{number:03d}: resposta oficial inválida: {answer!r}.")
        numbers.append(number)

    expected = list(range(1, question_count + 1))
    if sorted(numbers) != expected:
        raise RuntimeError(
            f"Gabarito deve conter exatamente Q001–Q{question_count:03d}, "
            "sem ausências ou duplicações."
        )


def load_answer_key_adapter(module_path: str) -> AnswerKeyAdapter:
    try:
        module = importlib.import_module(module_path)
    except (ImportError, ModuleNotFoundError) as exc:
        raise RuntimeError(f"Não foi possível importar o adapter {module_path!r}.") from exc

    adapter = getattr(module, "ADAPTER", None)
    if adapter is None or not isinstance(adapter, AnswerKeyAdapter):
        raise RuntimeError(
            f"O módulo {module_path!r} não expõe ADAPTER compatível."
        )
    return adapter
