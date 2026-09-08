import json
import re
import unicodedata
from pathlib import Path

from src.models.question_dna import QuestionDNA


TAXONOMY_PATH = Path(
    "data/taxonomy/revalida_taxonomy_v2_1.json"
)

NATURAL_LANGUAGE_FIELDS = (
    "topic",
    "subtopic",
    "clinical_decision",
    "key_concepts",
    "diagnoses_or_conditions",
    "diagnostic_tests",
    "treatments_or_interventions",
    "correct_answer_concept",
    "question_intent",
    "protocol_topics",
    "review_reason",
)

# Marcadores deliberadamente conservadores: detectam saídas claramente em
# inglês sem tentar inferir o idioma de termos médicos curtos ou epônimos.
ENGLISH_LANGUAGE_MARKERS = {
    "assessment",
    "clinical decision",
    "diagnosis",
    "disease",
    "follow up",
    "guideline",
    "management",
    "migraine",
    "most likely",
    "next step",
    "patient",
    "preventive treatment",
    "risk factor",
    "screening",
    "treatment",
    "vaccination",
}


def load_taxonomy(path=None, expected_version=None):
    taxonomy_path = Path(path) if path is not None else TAXONOMY_PATH
    if not taxonomy_path.is_file():
        raise RuntimeError(f"Taxonomia não encontrada: {taxonomy_path}")
    try:
        taxonomy = json.loads(taxonomy_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Taxonomia contém JSON inválido: {taxonomy_path}") from exc

    required = {
        "version",
        "primary_areas",
        "competencies",
        "cognitive_tasks",
        "care_settings",
        "patient_groups",
        "urgency_levels",
        "question_formats",
        "reasoning_types",
        "distractor_patterns",
    }
    missing = sorted(required - taxonomy.keys())
    if missing:
        raise RuntimeError(
            f"Taxonomia incompleta em {taxonomy_path}: campos ausentes {missing}."
        )
    if expected_version is not None and taxonomy["version"] != expected_version:
        raise RuntimeError(
            f"Taxonomia incompatível em {taxonomy_path}: "
            f"esperada={expected_version!r}, encontrada={taxonomy['version']!r}."
        )
    return taxonomy


def allowed_subareas(taxonomy):
    result = {}

    for area, data in taxonomy[
        "primary_areas"
    ].items():

        for subarea in data[
            "subareas"
        ]:
            result[subarea] = area

    return result


def _normalized_language_text(value) -> str:
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return " ".join(text.split())


def contains_clear_english(value) -> bool:
    original = str(value).strip()
    if not original:
        return False
    normalized = _normalized_language_text(original)
    padded = f" {normalized} "
    if re.fullmatch(r"[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+", original):
        return True
    return any(f" {marker} " in padded for marker in ENGLISH_LANGUAGE_MARKERS)


def validate_natural_language_pt_br(dna: QuestionDNA) -> list[str]:
    errors = []

    for field in NATURAL_LANGUAGE_FIELDS:
        raw = getattr(dna, field)
        values = raw if isinstance(raw, list) else [raw]

        invalid = False
        for value in values:
            if value is None or not str(value).strip():
                continue

            if contains_clear_english(value):
                invalid = True

            if invalid:
                break

        if invalid:
            errors.append(f"NATURAL_LANGUAGE_NOT_PT_BR:{field}")

    return errors


def require_valid_question_dna(question_number: int, errors: list[str]) -> None:
    if errors:
        raise RuntimeError(
            f"Q{question_number:03d}: QuestionDNA inválido: "
            + ", ".join(errors)
        )


def validate_question_dna(
    dna: QuestionDNA,
    taxonomy: dict,
):
    errors = []

    areas = taxonomy[
        "primary_areas"
    ]

    if dna.primary_area not in areas:
        errors.append(
            "INVALID_PRIMARY_AREA"
        )

    subareas = allowed_subareas(
        taxonomy
    )

    if dna.primary_subarea not in subareas:
        errors.append(
            "INVALID_PRIMARY_SUBAREA"
        )

    elif (
        subareas[
            dna.primary_subarea
        ]
        != dna.primary_area
    ):
        errors.append(
            "SUBAREA_AREA_MISMATCH"
        )

    if (
        dna.primary_competency
        not in taxonomy[
            "competencies"
        ]
    ):
        errors.append(
            "INVALID_PRIMARY_COMPETENCY"
        )

    for value in dna.secondary_competencies:
        if value not in taxonomy[
            "competencies"
        ]:
            errors.append(
                f"INVALID_SECONDARY_COMPETENCY:{value}"
            )

    if (
        dna.cognitive_task
        not in taxonomy[
            "cognitive_tasks"
        ]
    ):
        errors.append(
            "INVALID_COGNITIVE_TASK"
        )

    if (
        dna.care_setting
        not in taxonomy[
            "care_settings"
        ]
    ):
        errors.append(
            "INVALID_CARE_SETTING"
        )

    if (
        dna.patient_group
        not in taxonomy[
            "patient_groups"
        ]
    ):
        errors.append(
            "INVALID_PATIENT_GROUP"
        )

    if (
        dna.urgency_level
        not in taxonomy[
            "urgency_levels"
        ]
    ):
        errors.append(
            "INVALID_URGENCY_LEVEL"
        )

    if (
        dna.question_format
        not in taxonomy[
            "question_formats"
        ]
    ):
        errors.append(
            "INVALID_QUESTION_FORMAT"
        )

    for value in dna.reasoning_types:
        if value not in taxonomy[
            "reasoning_types"
        ]:
            errors.append(
                f"INVALID_REASONING_TYPE:{value}"
            )

    for value in dna.distractor_patterns:
        if value not in taxonomy[
            "distractor_patterns"
        ]:
            errors.append(
                f"INVALID_DISTRACTOR_PATTERN:{value}"
            )

    if not dna.key_concepts:
        errors.append(
            "NO_KEY_CONCEPTS"
        )

    errors.extend(validate_natural_language_pt_br(dna))

    return errors


def main():
    taxonomy = load_taxonomy()

    subareas = allowed_subareas(
        taxonomy
    )

    print()
    print("=" * 78)
    print("QUESTION DNA VALIDATOR")
    print("=" * 78)

    print(
        f"Áreas: "
        f"{len(taxonomy['primary_areas'])}"
    )

    print(
        f"Subáreas: "
        f"{len(subareas)}"
    )

    print(
        f"Competências: "
        f"{len(taxonomy['competencies'])}"
    )

    print(
        f"Tarefas cognitivas: "
        f"{len(taxonomy['cognitive_tasks'])}"
    )

    print()
    print(
        "STATUS: DNA_SCHEMA_READY"
    )


if __name__ == "__main__":
    main()
