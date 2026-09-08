import re
from dataclasses import dataclass

from src.extraction.pdf_reader import PageData, TextBlock


@dataclass
class ColumnLayout:
    left: list[TextBlock]
    right: list[TextBlock]


def normalize_text(text: str) -> str:
    return " ".join(text.split()).strip()


def is_noise_block(block: TextBlock) -> bool:
    """
    Remove elementos gráficos/editoriais que não pertencem
    ao conteúdo médico da questão.
    """

    text = normalize_text(block.text)

    if not text:
        return True

    # Número isolado da página
    if re.fullmatch(r"\d{1,3}", text):
        return True

    if text.upper() == "ÁREA LIVRE":
        return True

    if re.fullmatch(r"CADERNO\s+\d+", text, re.I):
        return True

    if re.fullmatch(r"REVALIDA\s+\d{4}/\d", text, re.I):
        return True

    return False


def classify_blocks(page: PageData) -> ColumnLayout:
    """
    Reconstrói a ordem de leitura em duas colunas.

    O caderno do Revalida usa aproximadamente:
    esquerda: x 42–290
    direita:  x 307–555
    """

    center = page.width / 2

    left: list[TextBlock] = []
    right: list[TextBlock] = []

    for block in page.blocks:

        if is_noise_block(block):
            continue

        # Alguns cadernos antigos possuem blocos de texto largos que começam
        # na coluna esquerda e atravessam o centro da página. A origem do
        # bloco é um sinal mais estável da coluna do que o seu ponto médio.
        if block.x0 < center - 20:
            left.append(block)
        else:
            right.append(block)

    def reading_order(blocks: list[TextBlock]) -> list[TextBlock]:
        """Ordena blocos por linha antes de avançar verticalmente.

        O OCR pode atribuir diferenças subpixel ao marcador ``(A)`` e ao
        texto da alternativa que está na mesma linha. A ordenação direta por
        ``y0`` invertia esses elementos em alguns cadernos do Enamed.
        """

        ordered: list[TextBlock] = []
        remaining = sorted(blocks, key=lambda b: (b.y0, b.x0))

        while remaining:
            first = remaining.pop(0)
            baseline = first.y0
            same_line = [first]

            while remaining and remaining[0].y0 - baseline <= 3.0:
                same_line.append(remaining.pop(0))

            ordered.extend(sorted(same_line, key=lambda b: b.x0))

        return ordered

    left = reading_order(left)
    right = reading_order(right)

    return ColumnLayout(
        left=left,
        right=right,
    )


def column_text(blocks: list[TextBlock]) -> str:
    return "\n".join(
        block.text.strip()
        for block in blocks
        if block.text.strip()
    )


def reconstruct_page(page: PageData) -> str:
    layout = classify_blocks(page)

    parts = []

    if layout.left:
        parts.append(column_text(layout.left))

    if layout.right:
        parts.append(column_text(layout.right))

    return "\n".join(parts)
