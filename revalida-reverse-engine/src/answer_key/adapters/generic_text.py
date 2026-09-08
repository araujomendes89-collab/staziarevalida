"""Adapter conservador para gabaritos textuais de novas edições."""

import re
from pathlib import Path

from src.answer_key.adapters.base import validate_answer_key_records


ANSWER = r"A|B|C|D|X|ANULADA"
NUMBER = r"[1-9]|[1-9][0-9]|[1-9][0-9]{2}"


class GenericTextAnswerKeyAdapter:
    adapter_id = "generic_text_verified_v1"

    @staticmethod
    def _records(pairs, page_number, method):
        records = []
        for number, answer in pairs:
            normalized = answer.upper()
            if normalized in {"X", "-", "–", "—"}:
                normalized = "ANULADA"
            records.append(
                {
                "question_number": int(number),
                "official_answer": normalized,
                "answer_status": (
                    "ANNULLED" if normalized == "ANULADA" else "VALID"
                ),
                "answer_key_type": "DEFINITIVE",
                "source": "INEP",
                "source_page": page_number,
                "verification_method": method,
                }
            )
        return records

    def parse(self, pdf_path: Path, question_count: int) -> list[dict]:
        import pymupdf

        if not pdf_path.is_file():
            raise RuntimeError(f"PDF do gabarito não encontrado: {pdf_path}")

        candidates: dict[str, list[dict]] = {
            "adjacent_lines_internal": [],
            "adjacent_lines_visual": [],
            "row_regex_internal": [],
            "row_regex_visual": [],
            "table_words": [],
            "paired_table_rows": [],
        }
        document = pymupdf.open(pdf_path)
        try:
            for page_number, page in enumerate(document, start=1):
                ordered_lines: list[list[tuple]] = []
                for word in sorted(
                    page.get_text("words", sort=True), key=lambda item: (item[1], item[0])
                ):
                    if (
                        not ordered_lines
                        or abs(word[1] - ordered_lines[-1][0][1]) > 2.0
                    ):
                        ordered_lines.append([word])
                    else:
                        ordered_lines[-1].append(word)
                for index, line in enumerate(ordered_lines):
                    line_text = " ".join(word[4] for word in sorted(line, key=lambda word: word[0]))
                    tokens = re.findall(
                        r"\b(?:ANULADA|[ABCDX]|\d{1,3})\b",
                        line_text.upper(),
                    )
                    row_pairs = []
                    token_index = 0
                    while token_index + 1 < len(tokens):
                        if tokens[token_index].isdigit() and re.fullmatch(
                            ANSWER, tokens[token_index + 1], re.IGNORECASE
                        ):
                            row_pairs.append(
                                (tokens[token_index], tokens[token_index + 1])
                            )
                            token_index += 2
                        else:
                            token_index += 1
                    if row_pairs:
                        candidates["paired_table_rows"].extend(
                            self._records(
                                row_pairs, page_number, "PAIRED_TABLE_ROWS"
                            )
                        )
                    if "QUESTÃO" not in line_text.upper() and "QUESTAO" not in line_text.upper():
                        continue
                    numbers = [
                        token
                        for token in re.findall(r"\b\d{1,3}\b", line_text)
                        if 1 <= int(token) <= question_count
                    ]
                    for answer_line in ordered_lines[index + 1 : index + 4]:
                        answer_text = " ".join(
                            word[4] for word in sorted(answer_line, key=lambda word: word[0])
                        )
                        if "GABARITO" not in answer_text.upper():
                            continue
                        payload = re.sub(
                            r"^.*?GABARITO", "", answer_text, count=1, flags=re.IGNORECASE
                        )
                        answers = re.findall(r"[ABCD]|[-–—]", payload.upper())
                        if len(numbers) == len(answers):
                            pairs = [
                                (number, "ANULADA" if answer in "-–—" else answer)
                                for number, answer in zip(numbers, answers)
                            ]
                            candidates["table_words"].extend(
                                self._records(pairs, page_number, "TABLE_WORDS")
                            )
                        break
                for ordering, text in (
                    ("internal", page.get_text("text")),
                    ("visual", page.get_text("text", sort=True)),
                ):
                    lines = [
                        line.strip() for line in text.splitlines() if line.strip()
                    ]
                    adjacent = []
                    for index, line in enumerate(lines[:-1]):
                        if re.fullmatch(NUMBER, line) and re.fullmatch(
                            ANSWER, lines[index + 1], re.IGNORECASE
                        ):
                            adjacent.append((line, lines[index + 1]))
                    candidates[f"adjacent_lines_{ordering}"].extend(
                        self._records(
                            adjacent,
                            page_number,
                            f"ADJACENT_LINES_{ordering.upper()}",
                        )
                    )

                    row_pairs = re.findall(
                        rf"(?m)^\s*({NUMBER})\s+(?:[-–—:]\s*)({ANSWER})\s*$",
                        text,
                        re.IGNORECASE,
                    )
                    candidates[f"row_regex_{ordering}"].extend(
                        self._records(
                            row_pairs,
                            page_number,
                            f"ROW_REGEX_{ordering.upper()}",
                        )
                    )
        finally:
            document.close()

        valid = {}
        for method, records in candidates.items():
            try:
                validate_answer_key_records(records, question_count)
            except RuntimeError:
                continue
            valid[method] = records

        if not valid:
            counts = {method: len(records) for method, records in candidates.items()}
            raise RuntimeError(
                "Não foi possível extrair um gabarito completo e sequencial. "
                f"Candidatos encontrados: {counts}. Crie um adapter específico."
            )

        signatures = {
            method: tuple(
                (record["question_number"], record["official_answer"])
                for record in sorted(
                    records, key=lambda item: item["question_number"]
                )
            )
            for method, records in valid.items()
        }
        if len(set(signatures.values())) > 1:
            methods = sorted(signatures)
            baseline = signatures[methods[0]]
            differences = []
            for method in methods[1:]:
                other = signatures[method]
                first = next(
                    (
                        (left, right)
                        for left, right in zip(baseline, other)
                        if left != right
                    ),
                    None,
                )
                if first:
                    differences.append(f"{methods[0]} x {method}: {first}")
            raise RuntimeError(
                "Métodos independentes de leitura do gabarito produziram respostas "
                "diferentes; processamento interrompido para evitar correção incorreta. "
                + "; ".join(differences)
            )

        method = sorted(valid)[0]
        return sorted(valid[method], key=lambda item: item["question_number"])


ADAPTER = GenericTextAnswerKeyAdapter()
