import re
from dataclasses import dataclass, asdict

from src.extraction.pdf_reader import PDFData
from src.extraction.layout_reader import classify_blocks


QUESTION_HEADER = re.compile(
    r"^\s*[^\dA-Za-zÀ-ÿ]{0,3}(?:A\s+)?QUEST[ÃA]O\s*[,.:|]?\s*(\d{1,3})\b",
    re.IGNORECASE
)

ITEM_PATTERN = re.compile(
    r"\bITEM\s+(\d+)(?:\s*-\s*V\.\s*([\d.]+))?",
    re.IGNORECASE
)

ALTERNATIVE_PATTERN = re.compile(
    r"\(([A-D])\)"
)


@dataclass
class ReadingBlock:
    page_number: int
    column: str
    x0: float
    y0: float
    text: str


@dataclass
class RawQuestion:
    question_number: int
    page_start: int
    page_end: int

    item_code: str | None
    version_code: str | None

    raw_text: str

    alternatives_found: list[str]

    structural_confidence: float

    status: str


def build_reading_stream(
    pdf: PDFData,
    start_page: int = 3,
    end_page: int | None = None,
) -> list[ReadingBlock]:

    stream: list[ReadingBlock] = []

    for page in pdf.pages:

        if page.page_number < start_page:
            continue

        if end_page is not None and page.page_number > end_page:
            continue

        layout = classify_blocks(page)

        # Ordem real do caderno:
        # coluna esquerda inteira → coluna direita inteira
        for column_name, blocks in (
            ("left", layout.left),
            ("right", layout.right),
        ):

            for block in blocks:

                stream.append(
                    ReadingBlock(
                        page_number=page.page_number,
                        column=column_name,
                        x0=block.x0,
                        y0=block.y0,
                        text=block.text.strip(),
                    )
                )

    return stream


def calculate_confidence(
    question_number: int,
    text: str,
    item_code: str | None,
) -> tuple[float, list[str]]:

    alternatives = sorted(
        set(ALTERNATIVE_PATTERN.findall(text))
    )

    score = 0.0

    # Número da questão reconhecido
    score += 0.30

    # Quatro alternativas
    if alternatives == ["A", "B", "C", "D"]:
        score += 0.35

    # Código ITEM
    if item_code:
        score += 0.20

    # Conteúdo mínimo razoável
    if len(text) >= 100:
        score += 0.10

    # Número válido
    if 1 <= question_number <= 100:
        score += 0.05

    return min(score, 1.0), alternatives


def finalize_question(
    number: int,
    blocks: list[ReadingBlock],
) -> RawQuestion:

    raw_text = "\n".join(
        block.text
        for block in blocks
    ).strip()

    item_match = ITEM_PATTERN.search(raw_text)

    item_code = None
    version_code = None

    if item_match:
        item_code = item_match.group(1)
        version_code = item_match.group(2)

    page_start = blocks[0].page_number if blocks else 0
    page_end = blocks[-1].page_number if blocks else page_start

    confidence, alternatives = calculate_confidence(
        question_number=number,
        text=raw_text,
        item_code=item_code,
    )

    if confidence >= 0.90:
        status = "VERIFIED_STRUCTURALLY"
    elif confidence >= 0.75:
        status = "CHECK"
    else:
        status = "REVIEW"

    return RawQuestion(
        question_number=number,
        page_start=page_start,
        page_end=page_end,
        item_code=item_code,
        version_code=version_code,
        raw_text=raw_text,
        alternatives_found=alternatives,
        structural_confidence=round(confidence, 3),
        status=status,
    )


def detect_questions(
    pdf: PDFData,
    start_page: int = 3,
    end_page: int | None = None,
    max_questions: int = 100,
) -> list[RawQuestion]:

    stream = build_reading_stream(
        pdf,
        start_page=start_page,
        end_page=end_page,
    )

    questions: list[RawQuestion] = []

    current_number: int | None = None
    current_blocks: list[ReadingBlock] = []
    pending_number: int | None = None
    pending_blocks: list[ReadingBlock] = []

    expected_number = 1

    for block in stream:

        header = QUESTION_HEADER.match(block.text)

        if header:

            detected_number = int(header.group(1))

            # Só aceitamos progressão sequencial.
            if detected_number == expected_number:

                if current_number is not None:

                    questions.append(
                        finalize_question(
                            current_number,
                            current_blocks,
                        )
                    )

                current_number = detected_number
                current_blocks = []

                expected_number += 1

                if detected_number > max_questions:
                    break

                continue

            # Algumas edições encerram a página com uma questão em largura
            # total abaixo de duas colunas. Na ordem geométrica, esse cabeçalho
            # pode aparecer antes da questão ainda pendente na coluna direita.
            if detected_number > expected_number and pending_number is None:
                pending_number = detected_number
                pending_blocks = []
                continue

            # Depois da questão 100, qualquer nova
            # "QUESTÃO 1" pertence a outra seção.
            if (
                current_number == max_questions
                and detected_number != expected_number
            ):
                break

        if pending_number is not None and current_number is not None:
            # Enquanto a questão esperada ainda não apareceu, os blocos após o
            # cabeçalho futuro pertencem à questão em largura total.
            if expected_number < pending_number:
                pending_blocks.append(block)
                continue

        if current_number is not None:
            current_blocks.append(block)

    # Finaliza a última questão
    if (
        current_number is not None
        and current_number <= max_questions
    ):
        questions.append(
            finalize_question(
                current_number,
                current_blocks,
            )
        )

    if (
        pending_number is not None
        and pending_number <= max_questions
        and (not questions or pending_number == questions[-1].question_number + 1)
    ):
        questions.append(finalize_question(pending_number, pending_blocks))

    # Evita qualquer elemento além da questão 100
    return [
        q for q in questions
        if 1 <= q.question_number <= max_questions
    ]


def questions_as_dict(
    questions: list[RawQuestion],
) -> list[dict]:

    return [
        asdict(question)
        for question in questions
    ]
