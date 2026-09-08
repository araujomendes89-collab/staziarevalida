from typing import Literal
from pydantic import BaseModel, Field


class Alternative(BaseModel):
    letter: Literal["A", "B", "C", "D"]
    text: str


class Question(BaseModel):
    exam_id: str
    question_number: int = Field(gt=0)

    page_start: int = Field(gt=0)
    page_end: int = Field(gt=0)

    item_code: str | None = None

    clinical_case: str = ""
    command: str = ""

    alternatives: list[Alternative] = []

    official_answer: Literal["A", "B", "C", "D"] | None = None

    answer_status: Literal[
        "unknown",
        "valid",
        "annulled",
        "changed"
    ] = "unknown"

    extraction_confidence: float | None = Field(
        default=None,
        ge=0,
        le=1
    )

    verification_status: Literal[
        "pending",
        "confirmed",
        "review_required"
    ] = "pending"
