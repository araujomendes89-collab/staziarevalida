"""Auditoria local da etapa 2, sem chamadas externas."""

import argparse
import hashlib
import json

from src.classification.classify_matrix_dna import (
    SCHEMA_VERSION,
    validate_matrix_dna,
)
from src.config.exams import PROJECT_ROOT, get_exam_config, load_exam_master
from src.models.question_matrix_dna import QuestionMatrixDNA


def _sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--exam-id",
        action="append",
        dest="exam_ids",
        help="Pode ser repetido; padrão: Revalida 2026/1 e Enamed 2025.",
    )
    parser.add_argument("--expected-model", default=None)
    args = parser.parse_args()
    exam_ids = args.exam_ids or ["revalida_2026_1", "enamed_2025"]
    total = 0
    hashes = {}

    for exam_id in exam_ids:
        exam = get_exam_config(exam_id)
        master = load_exam_master(exam, PROJECT_ROOT)
        questions = {item["question_number"]: item for item in master["questions"]}
        expected = set(exam.classifiable_question_numbers)
        for pass_number in (1, 2):
            path = exam.matrix_dna_output_path(PROJECT_ROOT, pass_number)
            if not path.is_file():
                raise RuntimeError(f"Passe ausente: {path}")
            data = json.loads(path.read_text(encoding="utf-8"))
            metadata = {
                "schema_version": SCHEMA_VERSION,
                "exam_id": exam.exam_id,
                "source_dataset_version": exam.dataset_version,
                "analysis_pass": pass_number,
                "psychometric_parameters_inferred": False,
            }
            for field, expected_value in metadata.items():
                if data.get(field) != expected_value:
                    raise RuntimeError(
                        f"{path}: {field} incompatível; esperado={expected_value!r}."
                    )
            records = data.get("questions", [])
            numbers = [record.get("question_number") for record in records]
            if set(numbers) != expected or len(numbers) != len(expected):
                raise RuntimeError(f"{path}: cobertura ou unicidade inválida.")
            for record in records:
                number = record["question_number"]
                if record.get("validation_errors"):
                    raise RuntimeError(f"Q{number:03d}: erros gravados no checkpoint.")
                if args.expected_model and record.get("model") != args.expected_model:
                    raise RuntimeError(
                        f"Q{number:03d}: modelo divergente de {args.expected_model}."
                    )
                dna = QuestionMatrixDNA.model_validate(record["matrix_dna"])
                errors = validate_matrix_dna(dna, questions[number]["official_answer"])
                if errors:
                    raise RuntimeError(f"Q{number:03d}: " + ", ".join(errors))
            total += len(records)
            hashes[f"{exam_id}_pass{pass_number}"] = _sha256(path)
            print(f"{exam_id} passe {pass_number}: {len(records)} itens válidos")

    manifest_path = (
        PROJECT_ROOT / "data/processed/reports/new_matrix_stage2_manifest.json"
    )
    if manifest_path.is_file():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for key, digest in hashes.items():
            if manifest.get("inputs_sha256", {}).get(key) != digest:
                raise RuntimeError(f"Manifesto possui hash divergente para {key}.")
        if manifest.get("psychometric_parameters_inferred") is not False:
            raise RuntimeError("Manifesto não preserva a separação psicométrica.")

    print(f"Total auditado: {total}")
    print("OpenAI API: não acessada")
    print("Parâmetros TRI inferidos: não")
    print("STATUS: NEW_MATRIX_VERIFIED")


if __name__ == "__main__":
    main()
