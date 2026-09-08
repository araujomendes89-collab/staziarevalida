"""Reanalisa itens pela matriz de competências sem tocar no DNA congelado."""

import argparse
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from dotenv import load_dotenv
from openai import OpenAI

from src.classification.classify_dna_all import (
    acquire_output_lock,
    atomic_write_json,
)
from src.classification.classify_dna_pilot import (
    alternatives_text,
    image_to_data_url,
    resolve_images,
)
from src.classification.dna_validator import contains_clear_english
from src.classification.providers import OllamaClient
from src.config.exams import DEFAULT_EXAM_ID, PROJECT_ROOT, get_exam_config, load_exam_master
from src.models.question_matrix_dna import QuestionMatrixDNA


SCHEMA_VERSION = "revalida.question-matrix-dna.v1"

INSTRUCTIONS = """
Você analisa uma questão oficial do Revalida/Enamed pela nova matriz de
competências. Trabalhe do zero e use somente enunciado, alternativas, gabarito
e imagem fornecidos. Não consulte nem tente reproduzir classificações anteriores.

Identifique o que a questão pede, o estágio do raciocínio diagnóstico e da
conduta, as pistas clínicas, as pistas realmente discriminadoras, sinais de
alarme e o erro representado por cada alternativa incorreta. Use escalas de 0
a 5 para competency_over_knowledge_score e generalist_relevance.

difficulty_estimate, dificuldade editorial ou dificuldade-alvo não são
parâmetros TRI. Nunca invente dificuldade b, p-valor, correlação bisserial,
infit, outfit, informação do item, theta ou tamanho de amostra. guideline_year
só pode ser informado quando o ano estiver sustentado pelo material recebido.

Todos os campos narrativos devem ser escritos exclusivamente em português do
Brasil, com terminologia médica adequada. Campos controlados permanecem nos
códigos definidos pelo esquema. Retorne somente o JSON estruturado solicitado.
""".strip()


def build_prompt(question: dict) -> str:
    stem = question.get("clean_stem") or question.get("stem") or ""
    if not stem.strip():
        raise RuntimeError(
            f"Q{question['question_number']:03d}: enunciado ausente ou vazio."
        )
    return f"""
ENUNCIADO:
{stem}

ALTERNATIVAS:
{alternatives_text(question)}

GABARITO OFICIAL IMUTÁVEL:
{question.get('official_answer')}

Descreva modelos de erro somente para as alternativas incorretas.
""".strip()


def validate_matrix_dna(dna: QuestionMatrixDNA, official_answer: str) -> list[str]:
    errors = []
    expected = {"A", "B", "C", "D"} - {official_answer}
    actual = {item.alternative for item in dna.distractor_error_models}
    if actual != expected:
        errors.append(
            "DISTRACTOR_KEYS_MISMATCH:esperadas="
            + ",".join(sorted(expected))
            + ";recebidas="
            + ",".join(sorted(actual))
        )
    narrative = [
        *dna.clinical_clues,
        *dna.discriminating_clues,
        *dna.red_flags,
        *(item.error_model for item in dna.distractor_error_models),
        dna.review_reason,
    ]
    if any(contains_clear_english(value) for value in narrative if value):
        errors.append("NATURAL_LANGUAGE_NOT_PT_BR")
    return errors


def load_existing(path, exam, pass_number: int) -> dict[int, dict]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Checkpoint inválido: {path}") from exc
    expected = {
        "schema_version": SCHEMA_VERSION,
        "exam_id": exam.exam_id,
        "source_dataset_version": exam.dataset_version,
        "analysis_pass": pass_number,
    }
    for field, value in expected.items():
        if data.get(field) != value:
            raise RuntimeError(
                f"Checkpoint incompatível em {field}: esperado={value!r}, "
                f"encontrado={data.get(field)!r}."
            )
    records = {item["question_number"]: item for item in data.get("questions", [])}
    if len(records) != len(data.get("questions", [])):
        raise RuntimeError("Checkpoint contém números de questão duplicados.")
    for number, record in records.items():
        QuestionMatrixDNA.model_validate(record.get("matrix_dna"))
        if record.get("validation_errors"):
            raise RuntimeError(f"Q{number:03d}: checkpoint contém erros.")
    return records


def classify(client, model: str, question: dict, exam) -> tuple[QuestionMatrixDNA, list[str]]:
    content = [{"type": "input_text", "text": build_prompt(question)}]
    images = resolve_images(
        question,
        asset_dir=exam.assets_dir(PROJECT_ROOT),
        crop_dir=exam.crops_dir(PROJECT_ROOT),
    )
    for path in images:
        content.append({"type": "input_image", "image_url": image_to_data_url(path)})
    response = client.responses.parse(
        model=model,
        instructions=INSTRUCTIONS,
        input=[{"role": "user", "content": content}],
        text_format=QuestionMatrixDNA,
        store=False,
    )
    dna = response.output_parsed
    if dna is None:
        raise RuntimeError("O modelo local não retornou a análise estruturada.")
    dna.question_number = question["question_number"]
    return dna, validate_matrix_dna(dna, question["official_answer"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exam-id", default=DEFAULT_EXAM_ID)
    parser.add_argument("--pass-number", type=int, choices=(1, 2), required=True)
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--end", type=int)
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--max-new-questions", type=int)
    parser.add_argument(
        "--backend",
        choices=("openai", "local"),
        default=os.getenv("REVALIDA_MATRIX_BACKEND", "local"),
    )
    parser.add_argument(
        "--openai-model",
        default=os.getenv("OPENAI_MATRIX_MODEL", "gpt-5.6-luna"),
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Chamadas OpenAI simultâneas (1 a 8); o modo local é serial.",
    )
    parser.add_argument("--local-model", default=os.getenv("OLLAMA_DNA_MODEL", "qwen3:8b"))
    parser.add_argument(
        "--local-vision-model",
        default=os.getenv("OLLAMA_VISION_MODEL", "qwen3-vl:8b-instruct"),
    )
    parser.add_argument(
        "--local-base-url",
        default=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
    )
    args = parser.parse_args()

    try:
        exam = get_exam_config(args.exam_id)
        master = load_exam_master(exam, PROJECT_ROOT)
    except (ValueError, RuntimeError) as exc:
        parser.error(str(exc))
    end = args.end or exam.question_count
    if not 1 <= args.start <= end <= exam.question_count:
        parser.error("Intervalo inválido.")

    questions = [
        question
        for question in master["questions"]
        if args.start <= question["question_number"] <= end
        and question["question_number"] in exam.classifiable_question_numbers
    ]
    output_path = exam.matrix_dna_output_path(PROJECT_ROOT, args.pass_number)
    existing = load_existing(output_path, exam, args.pass_number)
    pending = [q for q in questions if q["question_number"] not in existing]
    if args.max_new_questions is not None and args.max_new_questions < 0:
        parser.error("--max-new-questions não pode ser negativo.")
    if args.max_new_questions is not None and len(pending) > args.max_new_questions:
        parser.error(
            f"A execução faria {len(pending)} novas análises, acima do limite "
            f"de {args.max_new_questions}."
        )
    if not 1 <= args.workers <= 8:
        parser.error("--workers deve estar entre 1 e 8.")
    if args.backend == "local" and args.workers != 1:
        parser.error("--workers acima de 1 é permitido somente com --backend openai.")

    visual_count = 0
    for question in questions:
        alternatives_text(question)
        if resolve_images(
            question,
            asset_dir=exam.assets_dir(PROJECT_ROOT),
            crop_dir=exam.crops_dir(PROJECT_ROOT),
        ):
            visual_count += 1

    if args.validate_only:
        print("VALIDAÇÃO LOCAL DA NOVA MATRIZ CONCLUÍDA")
        print(f"Edição: {exam.exam_id}")
        print(f"Questões verificadas: {len(questions)}")
        print(f"Questões com imagem: {visual_count}")
        print(f"Registros no checkpoint: {len(existing)}")
        print("OpenAI API: não acessada")
        return

    if args.backend == "openai":
        load_dotenv(dotenv_path=PROJECT_ROOT / ".env")
        key = os.getenv("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("OPENAI_API_KEY não encontrada.")
        client = OpenAI(
            api_key=key,
            max_retries=exam.api_max_retries,
            timeout=exam.api_timeout_seconds,
        )
    else:
        client = OllamaClient(base_url=args.local_base_url, timeout=300.0)
        client.require_model(args.local_model)
        if visual_count:
            client.require_model(args.local_vision_model)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    lock_handle = acquire_output_lock(output_path)
    try:
        def process(question):
            images = resolve_images(
                question,
                asset_dir=exam.assets_dir(PROJECT_ROOT),
                crop_dir=exam.crops_dir(PROJECT_ROOT),
            )
            model = (
                args.openai_model
                if args.backend == "openai"
                else (args.local_vision_model if images else args.local_model)
            )
            dna, errors = classify(client, model, question, exam)
            if errors:
                raise RuntimeError(
                    f"Q{question['question_number']:03d}: " + ", ".join(errors)
                )
            return question["question_number"], model, dna, errors

        def checkpoint(number, model, dna, errors):
            existing[number] = {
                "question_number": number,
                "matrix_dna": dna.model_dump(),
                "validation_errors": errors,
                "classification_source": args.backend.upper(),
                "model": model,
                "classified_at_utc": datetime.now(timezone.utc).isoformat(),
            }
            atomic_write_json(
                output_path,
                {
                    "schema_version": SCHEMA_VERSION,
                    "exam_id": exam.exam_id,
                    "source_dataset_version": exam.dataset_version,
                    "analysis_pass": args.pass_number,
                    "analysis_strategy": "INDEPENDENT_MATRIX_PASS",
                    "classification_backend": args.backend,
                    "psychometric_parameters_inferred": False,
                    "questions": [existing[n] for n in sorted(existing)],
                },
            )
            print(f"Q{number:03d}: checkpoint {len(existing)}")

        if args.backend == "openai" and args.workers > 1:
            failures = []
            with ThreadPoolExecutor(max_workers=args.workers) as executor:
                futures = {executor.submit(process, q): q["question_number"] for q in pending}
                for future in as_completed(futures):
                    number = futures[future]
                    try:
                        checkpoint(*future.result())
                    except Exception as exc:
                        failures.append((number, exc))
            if failures:
                details = "; ".join(
                    f"Q{number:03d}: {exc}" for number, exc in failures
                )
                raise RuntimeError(
                    "Falhas no lote paralelo; sucessos foram preservados. " + details
                )
        else:
            for question in pending:
                checkpoint(*process(question))
    finally:
        lock_handle.close()


if __name__ == "__main__":
    main()
