import re
from dataclasses import dataclass, asdict

from src.extraction.question_detector import RawQuestion


ALTERNATIVE_MARKER = re.compile(
    r"(?m)^[ \t]*(?:\(([A-D])\)|([A-D])(?:[.)])?)(?:[ \t]+|$)"
)
OCR_ALTERNATIVE_MARKER = re.compile(
    r"(?m)^[ \t]*(?:[A-D][.)]|[в©®•●](?:[.)])?)[ \t]+",
    re.IGNORECASE,
)


@dataclass
class ParsedQuestion:
    question_number: int
    page_start: int
    page_end: int

    item_code: str | None
    version_code: str | None

    stem: str
    alternatives: dict[str, str]

    structural_status: str
    parsing_status: str
    warnings: list[str]


def clean_text(text: str) -> str:
    return " ".join(text.split()).strip()


def remove_metadata_prefix(
    text: str,
    question_number: int,
    item_code: str | None,
    version_code: str | None,
) -> str:
    """
    Remove do início do texto:
    100. ITEM 170292 - V. 942435

    Também tolera:
    ITEM 170292 - V. 942435
    100 ITEM 170292 - V. 942435
    QUESTÃO 100 ITEM 170292 - V. 942435
    """

    text = text.strip()

    # Em 2021, um número editorial diferente do número da questão aparece
    # antes de "ITEM" (por exemplo, "3. ITEM 138269").
    text = re.sub(
        r"^\s*\d{1,3}\s*[.)]\s*(?=ITEM\b)",
        "",
        text,
        count=1,
        flags=re.IGNORECASE,
    )

    # Remove eventual marcador QUESTÃO 100
    text = re.sub(
        rf"^\s*QUEST[ÃA]O\s+{question_number}\s*",
        "",
        text,
        count=1,
        flags=re.IGNORECASE,
    )

    # Remove eventual "100." / "100)" / "100"
    text = re.sub(
        rf"^\s*{question_number}\s*[.)]?\s*",
        "",
        text,
        count=1,
    )

    # Remove ITEM específico já identificado pelo detector
    if item_code:
        item_pattern = re.escape(str(item_code))

        text = re.sub(
            rf"^\s*ITEM\s+{item_pattern}\s*",
            "",
            text,
            count=1,
            flags=re.IGNORECASE,
        )

    # Remove versão específica
    if version_code:
        version_pattern = re.escape(str(version_code))

        text = re.sub(
            rf"^\s*-\s*V\.\s*{version_pattern}\s*",
            "",
            text,
            count=1,
            flags=re.IGNORECASE,
        )

    return text.strip()


def parse_question(question: RawQuestion) -> ParsedQuestion:
    text = remove_metadata_prefix(
        text=question.raw_text,
        question_number=question.question_number,
        item_code=question.item_code,
        version_code=question.version_code,
    )

    warnings: list[str] = []
    alternatives: dict[str, str] = {}
    markers = [
        (match.group(1) or match.group(2), match.start(), match.end())
        for match in ALTERNATIVE_MARKER.finditer(text)
    ]
    sequence = None
    parenthesized = [
        (match.group(1), match.start(), match.end())
        for match in re.finditer(r"(?m)^[ \t]*\(([A-D])\)[ \t]*$", text)
    ]
    if [item[0] for item in parenthesized] == list("ABCD"):
        sequence = parenthesized
    for start in range(len(markers)):
        candidate = markers[start : start + 4]
        if sequence is None and [item[0] for item in candidate] == list("ABCD"):
            sequence = candidate
    if sequence is None:
        ocr_markers = [
            (letter, match.start(), match.end())
            for letter, match in zip("ABCD", OCR_ALTERNATIVE_MARKER.finditer(text))
        ]
        if len(ocr_markers) >= 4:
            sequence = [
                (letter, match.start(), match.end())
                for letter, match in zip(
                    "ABCD", list(OCR_ALTERNATIVE_MARKER.finditer(text))[-4:]
                )
            ]
    if sequence:
        stem = clean_text(text[: sequence[0][1]])
        for index, (letter, _, content_start) in enumerate(sequence):
            content_end = (
                sequence[index + 1][1] if index + 1 < len(sequence) else len(text)
            )
            alternatives[letter] = clean_text(text[content_start:content_end])
    else:
        stem = clean_text(text)

    expected = {"A", "B", "C", "D"}
    found = set(alternatives)

    missing = sorted(expected - found)

    if missing:
        warnings.append(
            f"Alternativas ausentes: {', '.join(missing)}"
        )

    if not stem:
        warnings.append("Enunciado vazio.")

    for letter, content in alternatives.items():
        if not content:
            warnings.append(
                f"Alternativa {letter} vazia."
            )

    # Auditoria: metadados não podem permanecer no stem
    if re.match(r"^\s*\d{1,3}\s*[.)]?\s*ITEM\b", stem, re.I):
        warnings.append(
            "Cabeçalho número/ITEM permaneceu no enunciado."
        )

    if re.match(r"^\s*ITEM\s+\d+", stem, re.I):
        warnings.append(
            "ITEM permaneceu no enunciado."
        )

    parsing_status = (
        "PARSED"
        if not warnings
        else "REVIEW"
    )

    return ParsedQuestion(
        question_number=question.question_number,
        page_start=question.page_start,
        page_end=question.page_end,
        item_code=question.item_code,
        version_code=question.version_code,
        stem=stem,
        alternatives=alternatives,
        structural_status=question.status,
        parsing_status=parsing_status,
        warnings=warnings,
    )


def questions_as_dict(
    questions: list[ParsedQuestion],
) -> list[dict]:
    return [
        asdict(question)
        for question in questions
    ]
