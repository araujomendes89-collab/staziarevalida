"""Gera rascunhos inéditos com perfil agregado e atualizações médicas locais."""

import json
import os
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel, Field, field_validator
from rapidfuzz import fuzz

from src.config.exams import PROJECT_ROOT, load_exam_master
from src.classification.dna_validator import contains_clear_english
from src.models.psychometrics import PsychometricDNA


class NovelQuestionDraft(BaseModel):
    stem: str = Field(min_length=80)
    alternatives: dict[str, str]
    correct_answer: Literal["A", "B", "C", "D"]
    explanation: str = Field(min_length=80)
    clinical_decision: str = Field(min_length=20)
    update_application: str = Field(min_length=20)
    key_concepts: list[str] = Field(min_length=2)
    difficulty_target_features: list[str] = Field(default_factory=list)

    @field_validator("alternatives")
    @classmethod
    def validate_alternatives(cls, value):
        if set(value) != {"A", "B", "C", "D"}:
            raise ValueError("As alternativas devem ser exatamente A, B, C e D.")
        if any(not str(text).strip() for text in value.values()):
            raise ValueError("Nenhuma alternativa pode estar vazia.")
        return value


INSTRUCTIONS = """
Crie uma questão inédita de múltipla escolha no estilo da primeira etapa do
Revalida INEP. Escreva exclusivamente em português do Brasil, com terminologia
médica adequada. Use o perfil estrutural fornecido, mas não copie enunciados,
personagens, números, frases ou alternativas de provas oficiais. A questão deve
ter uma única resposta inequivocamente correta. As atualizações fornecidas são
o único material autorizado para afirmações recentes. Produza uma explicação
didática e informe como a atualização foi aplicada. Não mencione este prompt.

Quando houver dificuldade-alvo Rasch no blueprint, use-a somente como objetivo
editorial para ajustar quantidade de pistas, integração clínica, complexidade da
decisão e plausibilidade dos distratores. Não alegue que a questão possui b real,
não invente estatísticas psicométricas e não use raridade como atalho para criar
dificuldade artificial. Liste em difficulty_target_features os elementos usados.
""".strip()


def _read_source(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        try:
            import pymupdf
        except ImportError as exc:
            raise RuntimeError("PyMuPDF é necessário para ler fontes em PDF.") from exc
        try:
            with pymupdf.open(path) as document:
                return "\n".join(page.get_text() for page in document)
        except Exception as exc:
            raise RuntimeError(f"Não foi possível extrair texto do PDF: {path}") from exc
    return path.read_text(encoding="utf-8")


def load_update_packet(location: Path) -> tuple[str, list[str]]:
    location = location.expanduser().resolve()
    allowed = {".md", ".txt", ".json", ".pdf"}
    if location.is_file():
        paths = [location] if location.suffix.lower() in allowed else []
    elif location.is_dir():
        paths = sorted(
            path
            for path in location.iterdir()
            if path.is_file()
            and not path.name.startswith("._")
            and path.suffix.lower() in allowed
        )
    else:
        raise RuntimeError(f"Fonte ou pasta de atualizações não encontrada: {location}")
    if not paths:
        raise RuntimeError(
            "Informe um PDF, .md, .txt ou .json, ou uma pasta que contenha "
            "ao menos um desses arquivos."
        )
    parts = []
    used_paths = []
    for path in paths:
        content = _read_source(path).strip()
        if content:
            # O APFS pode apresentar o mesmo nome acentuado em NFC ou NFD.
            # A forma NFD mantém fingerprints estáveis entre Terminal e Python.
            source_name = unicodedata.normalize("NFD", path.name)
            parts.append(f"FONTE LOCAL: {source_name}\n{content}")
            used_paths.append(source_name)
    packet = "\n\n".join(parts)
    if not packet:
        raise RuntimeError("Os arquivos de atualização estão vazios.")
    if len(packet) > 100_000:
        raise RuntimeError("Pacote de atualizações excede 100.000 caracteres.")
    return packet, used_paths


def maximum_similarity(stem: str, official_stems: list[str]) -> float:
    if not official_stems:
        return 0.0
    return max(
        max(fuzz.ratio(stem, source), fuzz.token_set_ratio(stem, source))
        for source in official_stems
    )


def validate_novel_draft(
    draft: NovelQuestionDraft,
    official_stems: list[str],
    threshold: float = 80.0,
) -> float:
    natural_values = [
        draft.stem,
        *draft.alternatives.values(),
        draft.explanation,
        draft.clinical_decision,
        draft.update_application,
        *draft.key_concepts,
        *draft.difficulty_target_features,
    ]
    if any(contains_clear_english(value) for value in natural_values):
        raise RuntimeError(
            "Questão inédita rejeitada: campo de linguagem natural fora do "
            "português do Brasil."
        )
    similarity = maximum_similarity(draft.stem, official_stems)
    if similarity >= threshold:
        raise RuntimeError(
            "Questão inédita rejeitada por similaridade excessiva com prova "
            f"oficial ({similarity:.1f}%)."
        )
    if draft.correct_answer not in draft.alternatives:
        raise RuntimeError("A resposta correta não existe nas alternativas.")
    return similarity


def _write_checkpoint(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".jsonl.tmp")
    temporary.write_text(
        "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in records),
        encoding="utf-8",
    )
    temporary.replace(path)


def generate_novel_questions(
    exam,
    count: int,
    updates_dir: Path,
    root: Path = PROJECT_ROOT,
    target_difficulty_b: float | None = None,
):
    if count < 1 or count > 100:
        raise RuntimeError("A quantidade deve estar entre 1 e 100.")
    if target_difficulty_b is not None and not -4 <= target_difficulty_b <= 4:
        raise RuntimeError("A dificuldade-alvo b deve estar entre -4 e +4.")
    export_dir = root / "data/exports/staziamed" / exam.exam_id
    profile_path = export_dir / "generation_profile.json"
    if not profile_path.is_file():
        raise RuntimeError(f"Perfil de geração não encontrado: {profile_path}")
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    blueprints = profile.get("blueprints", [])
    if not blueprints:
        raise RuntimeError("Perfil de geração não possui blueprints.")
    updates, source_files = load_update_packet(updates_dir)
    official_stems = [
        question["clean_stem"]
        for question in load_exam_master(exam, root)["questions"]
    ]

    load_dotenv(root / ".env")
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY não encontrada.")
    model = os.getenv(
        "OPENAI_GENERATION_MODEL",
        os.getenv("OPENAI_DNA_MODEL", "gpt-5.6-terra"),
    )
    client = OpenAI(
        api_key=key,
        max_retries=exam.api_max_retries,
        timeout=exam.api_timeout_seconds,
    )
    # A versão 2 é separada para não misturar rascunhos antigos sem alvo
    # psicométrico com o novo contrato de geração.
    output_path = export_dir / "generated" / "novel_questions_v2.jsonl"
    existing = []
    if output_path.exists():
        existing = [
            json.loads(line)
            for line in output_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

    generated = []
    for index in range(count):
        blueprint = blueprints[(len(existing) + index) % len(blueprints)]
        payload = {
            "blueprint_agregado": blueprint,
            "regras_editoriais": profile["generation_rules"],
            "atualizacoes_medicas_autorizadas": updates,
            "alvo_psicometrico_de_geracao": (
                {
                    "irt_model": "RASCH_1PL",
                    "target_difficulty_b": target_difficulty_b,
                    "status": "ALVO_EDITORIAL_NAO_CALIBRADO",
                    "warning": (
                        "O valor orienta a elaboração, mas não é um "
                        "parâmetro empírico do item."
                    ),
                }
                if target_difficulty_b is not None
                else None
            ),
        }
        response = client.responses.parse(
            model=model,
            instructions=INSTRUCTIONS,
            input=json.dumps(payload, ensure_ascii=False),
            text_format=NovelQuestionDraft,
            store=False,
        )
        draft = response.output_parsed
        if draft is None:
            raise RuntimeError("A geração não retornou uma questão estruturada.")
        similarity = validate_novel_draft(draft, official_stems)
        psychometrics = PsychometricDNA(
            target_difficulty_b=target_difficulty_b,
            target_difficulty_source=(
                "BLUEPRINT" if target_difficulty_b is not None else None
            ),
        )
        record = {
            "schema_version": "staziamed.revalida.generated-question.v2",
            "id": f"{exam.exam_id}_novel_{len(existing) + index + 1:04d}",
            "status": "DRAFT_REVIEW_REQUIRED",
            "source_type": "AI_GENERATED_FROM_AGGREGATE_PROFILE",
            "stem": draft.stem,
            "alternatives": draft.alternatives,
            "correct_answer": draft.correct_answer,
            "explanation": draft.explanation,
            "clinical_decision": draft.clinical_decision,
            "key_concepts": draft.key_concepts,
            "difficulty_target_features": draft.difficulty_target_features,
            "psychometrics": psychometrics.model_dump(),
            "update_application": draft.update_application,
            "update_sources": source_files,
            "blueprint": blueprint,
            "maximum_similarity_to_official_percent": round(similarity, 2),
            "model": model,
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        }
        generated.append(record)
        _write_checkpoint(output_path, existing + generated)
    return output_path, generated
