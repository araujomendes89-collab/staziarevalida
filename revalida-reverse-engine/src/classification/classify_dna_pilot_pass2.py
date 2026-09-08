import base64
import argparse
import json
import mimetypes
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from src.models.question_dna import QuestionDNA
from src.classification.dna_validator import (
    load_taxonomy,
    require_valid_question_dna,
    validate_question_dna,
)
from src.config.exams import (
    DEFAULT_EXAM_ID,
    PROJECT_ROOT,
    get_exam_config,
    load_exam_master,
)


ROOT = PROJECT_ROOT
DEFAULT_EXAM = get_exam_config(DEFAULT_EXAM_ID)
MODEL = "gpt-5.6-terra"


def configure_runtime():
    global MODEL
    load_dotenv(dotenv_path=ROOT / ".env")
    MODEL = os.getenv("OPENAI_DNA_MODEL", "gpt-5.6-terra")


SYSTEM_INSTRUCTIONS = """
Você atua como segundo classificador médico independente de questões
oficiais do Revalida INEP.

Analise cada questão DO ZERO.

Você não conhece, não deve procurar e não deve tentar reproduzir
qualquer classificação realizada anteriormente.

Seu objetivo é identificar o conhecimento médico central realmente
necessário para que um candidato resolva a questão.

REGRAS:

1. Utilize exclusivamente:
   - enunciado;
   - alternativas;
   - gabarito oficial;
   - imagem fornecida, quando existente;
   - taxonomia controlada fornecida.

2. O gabarito oficial é imutável.

3. Classifique pelo CONHECIMENTO CENTRAL AVALIADO, e não simplesmente:
   - pela idade do paciente;
   - pelo cenário de atendimento;
   - por uma doença mencionada incidentalmente;
   - pelo nome de um exame citado no texto.

4. primary_area deve obrigatoriamente pertencer à taxonomia.

5. primary_subarea deve obrigatoriamente pertencer à primary_area
   escolhida.

6. Em situações de sobreposição, utilize as classification_rules
   fornecidas pela taxonomia.

7. primary_competency e secondary_competencies devem conter
   exclusivamente códigos existentes em taxonomy.competencies.

8. cognitive_task deve conter exclusivamente um código existente em
   taxonomy.cognitive_tasks.

9. topic deve ser escrito em português do Brasil e representar o
   tema médico central da questão.

10. subtopic deve ser escrito em português do Brasil e representar
    uma granularidade mais específica que topic.

11. Nunca utilize códigos ALL_CAPS ou nomes em inglês nos campos
    topic e subtopic.

12. clinical_decision deve expressar a decisão clínica ou conceitual
    central necessária para responder à questão.

13. correct_answer_concept deve explicar o conteúdo da alternativa
    correta, não apenas repetir a letra do gabarito.

14. question_intent deve indicar precisamente o que o INEP está
    avaliando naquela questão.

15. key_concepts devem ser termos médicos normalizados úteis para
    comparação futura entre diferentes edições.

16. protocol_or_guideline_dependency deve ser true quando a resposta
    correta depender de protocolo, diretriz, calendário, rastreamento,
    vacinação, recomendação terapêutica ou conduta sujeita a mudança
    ao longo do tempo.

17. Não faça previsão de questões futuras.

18. Não utilize o número da questão ou edição como evidência clínica.

19. Não force confiança elevada. classification_confidence deve
    refletir a segurança real da classificação.

20. Use review_required=true quando houver ambiguidade relevante ou
    classification_confidence inferior a 0.85.

21. Para questões com imagem, considere a informação visual como parte
    integrante da questão.

22. Uma questão deve possuir um único eixo principal de área/subárea.
    Outras dimensões devem aparecer nos demais campos do DNA.


REGRA DE IDIOMA OBRIGATÓRIA:

Todos os campos de linguagem natural devem ser escritos exclusivamente
em português do Brasil, usando terminologia médica adequada.

Isso inclui obrigatoriamente:
- topic
- subtopic
- clinical_decision
- key_concepts
- diagnoses_or_conditions
- diagnostic_tests
- treatments_or_interventions
- correct_answer_concept
- question_intent
- protocol_topics
- review_reason

Somente os campos controlados pela taxonomia devem permanecer como
códigos em inglês, por exemplo:
CLINICAL_MEDICINE, NEUROLOGY, DIAGNOSIS, CHOOSE_NEXT_STEP.

Nunca responda "Migraine", "Preventive treatment", "Amitriptyline..."
ou outras descrições em inglês nos campos narrativos.

Produza somente um QuestionDNA estruturado.
"""


def image_to_data_url(path: Path) -> str:
    mime, _ = mimetypes.guess_type(
        path.name
    )

    if not mime:
        mime = "image/png"

    encoded = base64.b64encode(
        path.read_bytes()
    ).decode("ascii")

    return (
        f"data:{mime};base64,"
        f"{encoded}"
    )


def alternatives_text(question):
    alternatives = question.get("alternatives")

    if not alternatives:
        raise RuntimeError(
            f"Q{question['question_number']:03d}: "
            "campo alternatives ausente ou vazio."
        )

    output = []

    if isinstance(alternatives, dict):
        for label in ["A", "B", "C", "D"]:
            if label not in alternatives:
                raise RuntimeError(
                    f"Q{question['question_number']:03d}: "
                    f"alternativa {label} ausente."
                )

            value = alternatives[label]

            if isinstance(value, dict):
                text = (
                    value.get("text")
                    or value.get("content")
                    or value.get("value")
                    or value.get("alternative")
                    or value.get("answer")
                    or ""
                )
            else:
                text = str(value)

            text = text.strip()

            if not text:
                raise RuntimeError(
                    f"Q{question['question_number']:03d}: "
                    f"texto da alternativa {label} vazio."
                )

            output.append(
                f"{label}) {text}"
            )

    elif isinstance(alternatives, list):
        parsed = {}

        for item in alternatives:
            if not isinstance(item, dict):
                raise RuntimeError(
                    f"Q{question['question_number']:03d}: "
                    "formato inesperado em alternatives."
                )

            label = (
                item.get("label")
                or item.get("letter")
                or item.get("key")
                or item.get("id")
            )

            text = (
                item.get("text")
                or item.get("content")
                or item.get("value")
                or item.get("alternative")
                or item.get("answer")
                or ""
            )

            if label:
                parsed[
                    str(label).strip().upper()
                ] = str(text).strip()

        for label in ["A", "B", "C", "D"]:
            text = parsed.get(label, "")

            if not text:
                raise RuntimeError(
                    f"Q{question['question_number']:03d}: "
                    f"alternativa {label} ausente ou vazia."
                )

            output.append(
                f"{label}) {text}"
            )

    else:
        raise RuntimeError(
            f"Q{question['question_number']:03d}: "
            f"tipo não suportado: "
            f"{type(alternatives).__name__}"
        )

    if len(output) != 4:
        raise RuntimeError(
            f"Q{question['question_number']:03d}: "
            "não foram encontradas exatamente 4 alternativas."
        )

    return "\n".join(output)


def resolve_images(question, asset_dir=None, crop_dir=None):
    asset_dir = asset_dir or DEFAULT_EXAM.assets_dir(ROOT)
    crop_dir = crop_dir or DEFAULT_EXAM.crops_dir(ROOT)
    visual = question.get(
        "visual",
        {}
    )

    paths = []

    asset = visual.get(
        "asset"
    )

    if isinstance(asset, dict):
        raw = (
            asset.get("file")
            or asset.get("path")
            or asset.get("filename")
        )

        if raw:
            candidate = Path(raw)

            possibilities = [
                candidate,
                asset_dir / candidate.name,
            ]

            for path in possibilities:
                if path.exists():
                    paths.append(path)
                    break

    assets = visual.get(
        "assets",
        []
    )

    if isinstance(assets, list):
        for item in assets:
            if not isinstance(item, dict):
                continue

            raw = (
                item.get("file")
                or item.get("path")
                or item.get("filename")
            )

            if not raw:
                continue

            candidate = Path(raw)

            possibilities = [
                candidate,
                asset_dir / candidate.name,
            ]

            for path in possibilities:
                if path.exists():
                    if path not in paths:
                        paths.append(path)
                    break

    if not paths and visual.get(
        "has_specific_assets",
        False,
    ):
        number = question[
            "question_number"
        ]

        crop = (
            crop_dir
            / f"q{number:03d}_question.png"
        )

        if crop.exists():
            paths.append(crop)

    if not paths and visual.get("has_specific_assets", False):
        raise RuntimeError(
            f"Q{question['question_number']:03d}: imagem obrigatória não encontrada "
            f"em assets ({asset_dir}) nem em crops ({crop_dir})."
        )

    return paths


def build_prompt(
    question,
    taxonomy,
):
    stem = (
        question.get("clean_stem")
        or question.get("stem")
        or ""
    )

    return f"""
QUESTÃO:

{stem}

ALTERNATIVAS:

{alternatives_text(question)}

GABARITO OFICIAL:

{question.get("official_answer")}


TAXONOMIA CONTROLADA:

{json.dumps(
    taxonomy,
    ensure_ascii=False,
    indent=2
)}

Retorne exclusivamente o QuestionDNA estruturado.
""".strip()


def classify(
    client,
    question,
    taxonomy,
    asset_dir=None,
    crop_dir=None,
):
    number = question[
        "question_number"
    ]

    content = [
        {
            "type": "input_text",
            "text": build_prompt(
                question,
                taxonomy,
            ),
        }
    ]

    images = resolve_images(
        question,
        asset_dir=asset_dir,
        crop_dir=crop_dir,
    )

    for path in images:
        content.append(
            {
                "type": "input_image",
                "image_url":
                    image_to_data_url(
                        path
                    ),
            }
        )

    print()
    print(
        f"Classificando Q{number:03d}..."
    )

    if images:
        print(
            "  Imagem enviada:",
            ", ".join(
                p.name
                for p in images
            ),
        )

    response = client.responses.parse(
        model=MODEL,
        instructions=SYSTEM_INSTRUCTIONS,
        input=[
            {
                "role": "user",
                "content": content,
            }
        ],
        text_format=QuestionDNA,
        store=False,
    )

    dna = response.output_parsed

    if dna is None:
        raise RuntimeError(
            f"Q{number:03d}: "
            "nenhum QuestionDNA retornado."
        )

    # Número vem do dataset,
    # nunca da interpretação do modelo.
    dna.question_number = number

    if (
        dna.classification_confidence
        < 0.85
    ):
        dna.review_required = True

        if not dna.review_reason:
            dna.review_reason = (
                "Confiança da classificação inferior a 0,85."
            )

    errors = validate_question_dna(
        dna,
        taxonomy,
    )

    return dna, errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exam-id", default=DEFAULT_EXAM_ID)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()

    try:
        exam = get_exam_config(args.exam_id)
    except ValueError as exc:
        parser.error(str(exc))

    output_path = exam.pilot_output_path(ROOT, 2)

    try:
        master = load_exam_master(exam, ROOT)
    except RuntimeError as exc:
        parser.error(str(exc))

    taxonomy = load_taxonomy(
        exam.classification_taxonomy_path(ROOT),
        expected_version=exam.classification_taxonomy_version,
    )

    questions = [
        q
        for q in master["questions"]
        if 1
        <= q["question_number"]
        <= 5
    ]

    if len(questions) != 5:
        raise RuntimeError(
            f"Esperadas 5 questões, "
            f"encontradas {len(questions)}."
        )

    visual_questions = 0
    for question in questions:
        alternatives_text(question)
        if resolve_images(
            question,
            asset_dir=exam.assets_dir(ROOT),
            crop_dir=exam.crops_dir(ROOT),
        ):
            visual_questions += 1

    if args.validate_only:
        print(
            f"Piloto passe 2 validado: {len(questions)} questões, "
            f"{visual_questions} com imagem. API OpenAI: não acessada"
        )
        return

    configure_runtime()
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY não encontrada no .env")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    client = OpenAI(
        api_key=key,
        max_retries=exam.api_max_retries,
        timeout=exam.api_timeout_seconds,
    )

    results = []

    for question in questions:
        dna, errors = classify(
            client,
            question,
            taxonomy,
            asset_dir=exam.assets_dir(ROOT),
            crop_dir=exam.crops_dir(ROOT),
        )
        require_valid_question_dna(dna.question_number, errors)

        results.append(
            {
                "question_number":
                    dna.question_number,

                "dna":
                    dna.model_dump(),

                "validation_errors":
                    errors,
            }
        )

        print(
            f"  Área: {dna.primary_area}"
        )

        print(
            f"  Subárea: {dna.primary_subarea}"
        )

        print(
            f"  Tema: {dna.topic}"
        )

        print(
            f"  Subtema: {dna.subtopic}"
        )

        print(
            f"  Competência: "
            f"{dna.primary_competency}"
        )

        print(
            f"  Tarefa: {dna.cognitive_task}"
        )

        print(
            f"  Confiança: "
            f"{dna.classification_confidence:.2f}"
        )

        print(
            f"  Revisão: "
            f"{dna.review_required}"
        )

        if errors:
            print(
                f"  ERROS: {errors}"
            )

    output = {
        "exam_id":
            exam.exam_id,

        "source_dataset_version":
            exam.dataset_version,

        "taxonomy_version":
            taxonomy["version"],

        "question_dna_version":
            "1.0.0",

        "classification_pass":
            2,

        "classification_strategy":
            "INDEPENDENT_SECOND_PASS",

        "model":
            MODEL,

        "pilot_range": {
            "start": 1,
            "end": 5,
        },

        "questions":
            results,
    }

    output_path.write_text(
        json.dumps(
            output,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    invalid = [
        r
        for r in results
        if r["validation_errors"]
    ]

    reviews = [
        r
        for r in results
        if r["dna"]["review_required"]
    ]

    print()
    print("=" * 78)
    print(
        "QUESTION DNA — PILOTO Q1–Q5"
    )
    print("=" * 78)

    print(
        f"Modelo: {MODEL}"
    )

    print(
        f"Questões classificadas: "
        f"{len(results)}"
    )

    print(
        f"Classificações inválidas: "
        f"{len(invalid)}"
    )

    print(
        f"Revisão requerida: "
        f"{len(reviews)}"
    )

    print()

    if invalid:
        print(
            "STATUS: DNA_PILOT_HAS_ERRORS"
        )
    else:
        print(
            "STATUS: DNA_PILOT_READY_FOR_REVIEW"
        )

    print()
    print(
        f"Arquivo: {output_path}"
    )


if __name__ == "__main__":
    main()
