"""Biblioteca local de fontes médicas com recuperação de trechos por questão."""

from __future__ import annotations

import hashlib
import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from pathlib import Path


ALLOWED_SUFFIXES = {".pdf", ".md", ".txt", ".json"}
STOPWORDS = {
    "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos",
    "e", "em", "entre", "essa", "esse", "esta", "este", "foi", "mais", "na",
    "nas", "no", "nos", "o", "os", "ou", "para", "pela", "pelo", "por", "que",
    "qual", "se", "sem", "ser", "sua", "um", "uma", "paciente", "questao",
}


def _normalized_name(path: Path) -> str:
    return unicodedata.normalize("NFD", path.name)


def _tokens(text: str) -> list[str]:
    normalized = unicodedata.normalize("NFKD", text.casefold())
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    return [
        token for token in re.findall(r"[a-z0-9]{3,}", normalized)
        if token not in STOPWORDS
    ]


def _source_paths(location: Path) -> list[Path]:
    location = location.expanduser().resolve()
    if location.is_file():
        paths = [location] if location.suffix.lower() in ALLOWED_SUFFIXES else []
    elif location.is_dir():
        paths = sorted(
            path for path in location.iterdir()
            if path.is_file()
            and not path.name.startswith("._")
            and path.suffix.lower() in ALLOWED_SUFFIXES
        )
    else:
        raise RuntimeError(f"Biblioteca médica não encontrada: {location}")
    if not paths:
        raise RuntimeError("A biblioteca não contém PDF, .md, .txt ou .json legível.")
    return paths


@dataclass(frozen=True)
class SourceChunk:
    source_file: str
    locator: str
    text: str
    term_counts: Counter


class MedicalSourceLibrary:
    """Índice em memória que envia ao modelo somente páginas pertinentes."""

    def __init__(self, location: Path):
        self.paths = _source_paths(location)
        self.chunks: list[SourceChunk] = []
        manifest = []
        for path in self.paths:
            raw = path.read_bytes()
            manifest.append(
                {
                    "source_file": _normalized_name(path),
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "size": len(raw),
                }
            )
            self.chunks.extend(self._read_chunks(path))
        if not self.chunks:
            raise RuntimeError("Não foi possível extrair texto das fontes médicas.")
        payload = repr(sorted(manifest, key=lambda item: item["source_file"])).encode()
        self.fingerprint = hashlib.sha256(payload).hexdigest()
        self.source_files = [item["source_file"] for item in manifest]
        document_frequency = Counter()
        for chunk in self.chunks:
            document_frequency.update(chunk.term_counts.keys())
        total = len(self.chunks)
        self.idf = {
            term: math.log((total + 1) / (frequency + 1)) + 1
            for term, frequency in document_frequency.items()
        }

    @staticmethod
    def _read_chunks(path: Path) -> list[SourceChunk]:
        name = _normalized_name(path)
        if path.suffix.lower() == ".pdf":
            try:
                import pymupdf
            except ImportError as exc:
                raise RuntimeError("PyMuPDF é necessário para indexar as apostilas.") from exc
            with pymupdf.open(path) as document:
                units = [
                    (f"página {index + 1}", page.get_text().strip())
                    for index, page in enumerate(document)
                ]
        else:
            units = [("arquivo completo", path.read_text(encoding="utf-8").strip())]
        chunks = []
        for locator, text in units:
            if not text:
                continue
            # Limita páginas excepcionalmente densas sem separar uma frase no meio.
            pieces = [text[i:i + 7_000] for i in range(0, len(text), 7_000)]
            for part_index, piece in enumerate(pieces, 1):
                suffix = f", trecho {part_index}" if len(pieces) > 1 else ""
                chunks.append(
                    SourceChunk(name, locator + suffix, piece, Counter(_tokens(piece)))
                )
        return chunks

    def retrieve(self, query: str, max_chunks: int = 4, max_chars: int = 22_000):
        query_counts = Counter(_tokens(query))
        scored = []
        for index, chunk in enumerate(self.chunks):
            score = sum(
                min(count, chunk.term_counts.get(term, 0)) * self.idf.get(term, 1.0)
                for term, count in query_counts.items()
            )
            if score:
                scored.append((score, index, chunk))
        scored.sort(key=lambda item: (-item[0], item[1]))
        selected = []
        used = 0
        for _, _, chunk in scored:
            rendered = (
                f"FONTE LOCAL: {chunk.source_file} ({chunk.locator})\n{chunk.text}"
            )
            if selected and used + len(rendered) > max_chars:
                continue
            selected.append(chunk)
            used += len(rendered)
            if len(selected) >= max_chunks:
                break
        if not selected:
            raise RuntimeError("Nenhum trecho pertinente foi recuperado para a questão.")
        packet = "\n\n".join(
            f"FONTE LOCAL: {chunk.source_file} ({chunk.locator})\n{chunk.text}"
            for chunk in selected
        )
        files = list(dict.fromkeys(chunk.source_file for chunk in selected))
        return packet, files
