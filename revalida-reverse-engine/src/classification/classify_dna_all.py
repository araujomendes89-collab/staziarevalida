import argparse
import fcntl
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from openai import OpenAI

from src.config.exams import (
    DEFAULT_EXAM_ID,
    PROJECT_ROOT,
    get_exam_config,
    load_exam_master,
)
from src.classification.dna_validator import require_valid_question_dna
from src.classification.providers import OllamaClient


ROOT = PROJECT_ROOT


def acquire_output_lock(output_path):
    lock_path = output_path.with_suffix(output_path.suffix + ".lock")
    handle = lock_path.open("a+", encoding="utf-8")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        handle.close()
        raise RuntimeError(
            f"Outra execução já está usando este checkpoint: {output_path}"
        ) from exc
    return handle


def atomic_write_json(path, data):
    temp = path.with_suffix(
        path.suffix + ".tmp"
    )

    temp.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    temp.replace(path)


def load_existing(path, exam, pass_number, taxonomy_version):
    if not path.exists():
        return {}

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Checkpoint contém JSON inválido: {path}") from exc

    expected = {
        "exam_id": exam.exam_id,
        "source_dataset_version": exam.dataset_version,
        "taxonomy_version": taxonomy_version,
        "classification_pass": pass_number,
    }
    for field, expected_value in expected.items():
        if data.get(field) != expected_value:
            raise RuntimeError(
                f"Checkpoint incompatível em {field}: "
                f"esperado={expected_value!r}, encontrado={data.get(field)!r}."
            )

    questions = data.get("questions")
    if not isinstance(questions, list):
        raise RuntimeError(f"Checkpoint sem lista de questões válida: {path}")

    records = {
        record["question_number"]: record
        for record in questions
    }
    if len(records) != len(questions):
        raise RuntimeError(f"Checkpoint contém question_number duplicado: {path}")

    for number, record in records.items():
        if number not in exam.classifiable_question_numbers:
            raise RuntimeError(f"Checkpoint contém question_number inválido: {number!r}")
        dna = record.get("dna")
        if not isinstance(dna, dict) or dna.get("question_number") != number:
            raise RuntimeError(f"Q{number:03d}: número divergente dentro do DNA.")
        errors = record.get("validation_errors")
        if not isinstance(errors, list):
            raise RuntimeError(f"Q{number:03d}: validation_errors deve ser uma lista.")
        if errors:
            raise RuntimeError(
                f"Q{number:03d}: checkpoint contém classificação inválida: "
                + ", ".join(map(str, errors))
            )
    return records


def choose_engine(pass_number):
    if pass_number == 1:
        import src.classification.classify_dna_pilot as engine
        return engine

    if pass_number == 2:
        import src.classification.classify_dna_pilot_pass2 as engine
        return engine

    raise ValueError(
        "pass_number deve ser 1 ou 2."
    )


def validate_classification_inputs(engine, questions, exam):
    asset_dir = exam.assets_dir(ROOT)
    crop_dir = exam.crops_dir(ROOT)
    visual_questions = 0

    for question in questions:
        engine.alternatives_text(question)
        images = engine.resolve_images(
            question,
            asset_dir=asset_dir,
            crop_dir=crop_dir,
        )
        if images:
            visual_questions += 1

    return {
        "questions": len(questions),
        "visual_questions": visual_questions,
    }


def normalize_local_controlled_fields(dna, taxonomy):
    """Corrige apenas relações unívocas definidas pela taxonomia.

    O modelo local pode devolver uma subárea válida ligada à área errada.
    Como cada subárea pertence a exatamente uma área, a normalização não
    interpreta o caso clínico nem altera campos narrativos.
    """
    owner_by_subarea = {
        subarea: area
        for area, data in taxonomy["primary_areas"].items()
        for subarea in data["subareas"]
    }
    expected_area = owner_by_subarea.get(dna.primary_subarea)
    repairs = []
    if expected_area is not None and dna.primary_area != expected_area:
        repairs.append(
            {
                "field": "primary_area",
                "from": dna.primary_area,
                "to": expected_area,
                "reason": "SUBAREA_UNIQUE_TAXONOMY_OWNER",
            }
        )
        dna.primary_area = expected_area
    return repairs


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--exam-id",
        default=DEFAULT_EXAM_ID,
        help="Identificador da edição configurada.",
    )

    parser.add_argument(
        "--pass-number",
        type=int,
        choices=[1, 2],
        required=True,
    )

    parser.add_argument(
        "--start",
        type=int,
        default=1,
    )

    parser.add_argument(
        "--end",
        type=int,
        default=None,
    )

    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Valida entradas e checkpoint sem acessar a API.",
    )

    parser.add_argument(
        "--max-new-questions",
        type=int,
        default=None,
        help="Limite de novas chamadas nesta execução.",
    )

    parser.add_argument(
        "--backend",
        choices=("openai", "local", "hybrid"),
        default=os.getenv("REVALIDA_CLASSIFICATION_BACKEND", "openai"),
        help="Motor de classificação. O modo hybrid usa Ollama e revisa exceções na OpenAI.",
    )
    parser.add_argument(
        "--local-model",
        default=os.getenv("OLLAMA_DNA_MODEL", "qwen3:8b"),
    )
    parser.add_argument(
        "--local-vision-model",
        default=os.getenv("OLLAMA_VISION_MODEL", "qwen3-vl:8b-instruct"),
        help="Modelo Ollama usado somente nas questões com imagem.",
    )
    parser.add_argument(
        "--local-base-url",
        default=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
    )
    parser.add_argument(
        "--review-model",
        default=os.getenv("OPENAI_REVIEW_MODEL", "gpt-5.6-luna"),
    )
    parser.add_argument(
        "--review-confidence-threshold",
        type=float,
        default=float(os.getenv("REVALIDA_REVIEW_CONFIDENCE", "0.86")),
    )
    parser.add_argument(
        "--max-openai-reviews",
        type=int,
        default=int(os.getenv("REVALIDA_MAX_OPENAI_REVIEWS", "40")),
        help="Teto de chamadas pagas do Luna por execução híbrida.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Chamadas OpenAI simultâneas (1 a 8); modo local permanece serial.",
    )

    args = parser.parse_args()

    try:
        exam = get_exam_config(args.exam_id)
    except ValueError as exc:
        parser.error(str(exc))

    if args.end is None:
        args.end = exam.question_count

    output_path = exam.production_output_path(
        ROOT,
        args.pass_number,
    )

    # Esta validação precisa ocorrer antes de carregar credenciais,
    # instanciar o cliente ou executar qualquer chamada externa.
    try:
        master = load_exam_master(exam, ROOT)
    except RuntimeError as exc:
        parser.error(str(exc))

    if not (
        1 <= args.start
        <= args.end
        <= exam.question_count
    ):
        raise RuntimeError(
            "Intervalo inválido."
        )

    engine = choose_engine(args.pass_number)

    taxonomy = engine.load_taxonomy(
        exam.classification_taxonomy_path(ROOT),
        expected_version=exam.classification_taxonomy_version,
    )

    questions = [
        q
        for q in master["questions"]
        if (
            args.start
            <= q["question_number"]
            <= args.end
            and q["question_number"] in exam.classifiable_question_numbers
        )
    ]

    existing = load_existing(
        output_path,
        exam,
        args.pass_number,
        taxonomy["version"],
    )

    validation = validate_classification_inputs(engine, questions, exam)

    pending = [
        question for question in questions
        if question["question_number"] not in existing
    ]
    if args.max_new_questions is not None:
        if args.max_new_questions < 0:
            parser.error("--max-new-questions não pode ser negativo.")
        if len(pending) > args.max_new_questions:
            parser.error(
                f"A execução faria {len(pending)} novas classificações, acima do "
                f"limite de {args.max_new_questions}."
            )

    if not 0 <= args.review_confidence_threshold <= 1:
        parser.error("--review-confidence-threshold deve estar entre 0 e 1.")
    if args.max_openai_reviews < 0:
        parser.error("--max-openai-reviews não pode ser negativo.")
    if not 1 <= args.workers <= 8:
        parser.error("--workers deve estar entre 1 e 8.")
    if args.workers > 1 and args.backend != "openai":
        parser.error("--workers acima de 1 é permitido somente com --backend openai.")

    if args.validate_only:
        print()
        print("VALIDAÇÃO LOCAL CONCLUÍDA")
        print(f"Edição: {exam.exam_id}")
        print(f"Passe: {args.pass_number}")
        print(f"Taxonomia: {taxonomy['version']}")
        print(f"Questões verificadas: {validation['questions']}")
        print(f"Questões com imagem: {validation['visual_questions']}")
        print(f"Registros no checkpoint: {len(existing)}")
        print("API OpenAI: não acessada")
        return

    engine.configure_runtime()

    local_client = None
    openai_client = None
    if args.backend in {"local", "hybrid"}:
        local_client = OllamaClient(
            base_url=args.local_base_url,
            timeout=max(240.0, exam.api_timeout_seconds),
        )
        local_client.require_model(args.local_model)
        if validation["visual_questions"]:
            local_client.require_model(args.local_vision_model)
    if args.backend == "openai":
        key = os.getenv("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("OPENAI_API_KEY não encontrada.")
        openai_client = OpenAI(
            api_key=key,
            max_retries=exam.api_max_retries,
            timeout=exam.api_timeout_seconds,
        )

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    lock_handle = acquire_output_lock(output_path)

    print()
    print("=" * 78)
    print(
        f"QUESTION DNA — PRODUÇÃO — PASSE {args.pass_number}"
    )
    print("=" * 78)

    print(
        f"Motor: {args.backend}; local={args.local_model}; "
        f"visual={args.local_vision_model}; revisão={args.review_model}"
    )

    print(
        f"Taxonomia: {taxonomy['version']}"
    )

    print(
        f"Intervalo solicitado: "
        f"Q{args.start:03d}–Q{args.end:03d}"
    )

    print(
        f"Já existentes no checkpoint: "
        f"{len(existing)}"
    )

    openai_reviews = 0

    if args.backend == "openai" and args.workers > 1:
        engine.MODEL = os.getenv("OPENAI_DNA_MODEL", engine.MODEL)

        def classify_openai(question):
            dna, errors = engine.classify(
                openai_client,
                question,
                taxonomy,
                asset_dir=exam.assets_dir(ROOT),
                crop_dir=exam.crops_dir(ROOT),
            )
            require_valid_question_dna(question["question_number"], errors)
            return question["question_number"], dna, errors

        pending_questions = [
            question
            for question in questions
            if question["question_number"] not in existing
        ]
        failures = []
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {
                executor.submit(classify_openai, question): question["question_number"]
                for question in pending_questions
            }
            for future in as_completed(futures):
                number = futures[future]
                try:
                    number, dna, errors = future.result()
                except Exception as exc:
                    failures.append((number, exc))
                    continue
                existing[number] = {
                    "question_number": number,
                    "dna": dna.model_dump(),
                    "validation_errors": errors,
                    "classification_source": "OPENAI",
                    "local_model": None,
                    "review_model": None,
                    "review_trigger": None,
                    "deterministic_repairs": [],
                    "classified_at_utc": datetime.now(timezone.utc).isoformat(),
                }
                output = {
                    "exam_id": exam.exam_id,
                    "source_dataset_version": exam.dataset_version,
                    "taxonomy_version": taxonomy["version"],
                    "question_dna_version": "1.0.0",
                    "classification_pass": args.pass_number,
                    "classification_strategy": (
                        "INDEPENDENT_FIRST_PASS"
                        if args.pass_number == 1
                        else "INDEPENDENT_SECOND_PASS"
                    ),
                    "model": engine.MODEL,
                    "classification_backend": args.backend,
                    "questions": [existing[n] for n in sorted(existing)],
                }
                atomic_write_json(output_path, output)
                print(
                    f"Q{number:03d} → CHECKPOINT: {len(existing)}/"
                    f"{len(exam.classifiable_question_numbers)}"
                )
        if failures:
            details = "; ".join(
                f"Q{number:03d}: {exc}" for number, exc in failures
            )
            raise RuntimeError(
                "Falhas no lote paralelo; sucessos foram preservados. " + details
            )
        questions = []

    for question in questions:
        number = question[
            "question_number"
        ]

        if number in existing:
            print(
                f"Q{number:03d} → já classificada, pulando."
            )
            continue

        try:
            source = "OPENAI"
            review_reason = None
            images = engine.resolve_images(
                question,
                asset_dir=exam.assets_dir(ROOT),
                crop_dir=exam.crops_dir(ROOT),
            )
            if args.backend == "openai":
                engine.MODEL = os.getenv("OPENAI_DNA_MODEL", engine.MODEL)
                dna, errors = engine.classify(
                    openai_client, question, taxonomy,
                    asset_dir=exam.assets_dir(ROOT), crop_dir=exam.crops_dir(ROOT),
                )
            else:
                local_failure = None
                if args.backend == "hybrid" and images:
                    local_failure = "questão com imagem encaminhada à revisão multimodal"
                    dna, errors = None, ["LOCAL_VISUAL_REVIEW_REQUIRED"]
                else:
                    try:
                        selected_local_model = (
                            args.local_vision_model if images else args.local_model
                        )
                        engine.MODEL = selected_local_model
                        dna, errors = engine.classify(
                            local_client, question, taxonomy,
                            asset_dir=exam.assets_dir(ROOT), crop_dir=exam.crops_dir(ROOT),
                        )
                        controlled_repairs = normalize_local_controlled_fields(
                            dna, taxonomy
                        )
                        # Alguns modelos locais ignoram ``minItems`` no JSON
                        # Schema. Este preenchimento é determinístico e usa
                        # somente conceitos já produzidos pelo próprio DNA.
                        if dna is not None and not dna.key_concepts:
                            dna.key_concepts = list(dict.fromkeys(
                                value for value in (
                                    dna.topic,
                                    dna.subtopic,
                                    dna.correct_answer_concept,
                                )
                                if value and value.strip()
                            ))[:3]
                        errors = engine.validate_question_dna(dna, taxonomy)
                    except Exception as exc:
                        if args.backend == "local":
                            raise
                        local_failure = f"falha local: {exc}"
                        dna, errors = None, ["LOCAL_CLASSIFICATION_FAILED"]

                needs_review = bool(
                    local_failure
                    or errors
                    or dna.review_required
                    or dna.classification_confidence < args.review_confidence_threshold
                )
                if args.backend == "hybrid" and needs_review:
                    if openai_reviews >= args.max_openai_reviews:
                        raise RuntimeError(
                            "Limite econômico de revisões OpenAI atingido "
                            f"({args.max_openai_reviews}). O checkpoint foi preservado."
                        )
                    key = os.getenv("OPENAI_API_KEY")
                    if not key:
                        raise RuntimeError(
                            "OPENAI_API_KEY necessária para revisar uma classificação local."
                        )
                    if openai_client is None:
                        openai_client = OpenAI(
                            api_key=key,
                            max_retries=exam.api_max_retries,
                            timeout=exam.api_timeout_seconds,
                        )
                    if local_failure:
                        review_reason = local_failure
                    elif errors:
                        review_reason = "validação local: " + ", ".join(errors)
                    elif dna.review_required:
                        review_reason = dna.review_reason or "revisão solicitada pelo modelo local"
                    else:
                        review_reason = (
                            "confiança local abaixo do limiar: "
                            f"{dna.classification_confidence:.2f} < "
                            f"{args.review_confidence_threshold:.2f}"
                        )
                    engine.MODEL = args.review_model
                    dna, errors = engine.classify(
                        openai_client, question, taxonomy,
                        asset_dir=exam.assets_dir(ROOT), crop_dir=exam.crops_dir(ROOT),
                    )
                    openai_reviews += 1
                    source = "OPENAI_REVIEW"
                else:
                    source = "LOCAL"
            require_valid_question_dna(number, errors)

            record = {
                "question_number":
                    number,

                "dna":
                    dna.model_dump(),

                "validation_errors":
                    errors,

                "classification_source": source,

                "local_model": (
                    selected_local_model
                    if args.backend in {"local", "hybrid"}
                    and source == "LOCAL"
                    else None
                ),

                "review_model": (
                    args.review_model if source == "OPENAI_REVIEW" else None
                ),

                "review_trigger": review_reason,

                "deterministic_repairs": (
                    controlled_repairs
                    if args.backend in {"local", "hybrid"}
                    and source == "LOCAL"
                    else []
                ),

                "classified_at_utc":
                    datetime.now(
                        timezone.utc
                    ).isoformat(),
            }

            existing[number] = record

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
                    args.pass_number,

                "classification_strategy":
                    (
                        "INDEPENDENT_FIRST_PASS"
                        if args.pass_number == 1
                        else "INDEPENDENT_SECOND_PASS"
                    ),

                "model": (
                    engine.MODEL if args.backend == "openai"
                    else f"{args.backend}:{args.local_model}+{args.review_model}"
                ),

                "classification_backend": args.backend,

                "questions": [
                    existing[n]
                    for n in sorted(
                        existing
                    )
                ],
            }

            atomic_write_json(
                output_path,
                output,
            )

            print(
                f"  CHECKPOINT: "
                f"{len(existing)}/"
                f"{len(exam.classifiable_question_numbers)}"
            )

        except KeyboardInterrupt:
            print()
            print(
                "Execução interrompida pelo usuário."
            )
            print(
                "O último checkpoint foi preservado."
            )
            raise

        except Exception as exc:
            print()
            print("=" * 78)
            print(
                f"ERRO NA Q{number:03d}"
            )
            print("=" * 78)
            print(
                repr(exc)
            )
            print()
            print(
                "As questões anteriores permanecem salvas."
            )
            print(
                "Corrija o problema e execute "
                "o mesmo comando novamente."
            )
            raise

    final = load_existing(
        output_path,
        exam,
        args.pass_number,
        taxonomy["version"],
    )

    invalid = [
        record
        for record in final.values()
        if record[
            "validation_errors"
        ]
    ]

    reviews = [
        record
        for record in final.values()
        if record[
            "dna"
        ][
            "review_required"
        ]
    ]

    print()
    print("=" * 78)
    print(
        f"PASSE {args.pass_number} FINALIZADO"
    )
    print("=" * 78)

    print(
        f"Questões no arquivo: "
        f"{len(final)}"
    )

    print(
        f"Erros estruturais: "
        f"{len(invalid)}"
    )

    print(
        f"Marcadas para revisão: "
        f"{len(reviews)}"
    )

    print()
    print(
        f"Arquivo: {output_path}"
    )

    fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
    lock_handle.close()


if __name__ == "__main__":
    main()
