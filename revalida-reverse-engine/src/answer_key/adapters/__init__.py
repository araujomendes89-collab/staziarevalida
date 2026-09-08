"""Adapters de gabarito específicos por edição."""

from src.answer_key.adapters.base import (
    AnswerKeyAdapter,
    load_answer_key_adapter,
    validate_answer_key_records,
)

__all__ = [
    "AnswerKeyAdapter",
    "load_answer_key_adapter",
    "validate_answer_key_records",
]
