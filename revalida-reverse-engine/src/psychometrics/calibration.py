"""Coleta respostas e estima Rasch 1PL somente com dados empíricos."""

import csv
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from src.models.psychometrics import RaschItemCalibration, enrich_cut_metrics


RESPONSE_FIELDS = (
    "candidate_id",
    "item_id",
    "response",
    "response_time_seconds",
    "confidence",
    "exposure_count",
)


def create_response_template(question_bank: Path, output: Path) -> Path:
    bank = json.loads(question_bank.read_text(encoding="utf-8"))
    questions = bank.get("questions", bank if isinstance(bank, list) else [])
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=RESPONSE_FIELDS)
        writer.writeheader()
        for item in questions:
            writer.writerow(
                {
                    "candidate_id": "",
                    "item_id": item["id"],
                    "response": "",
                    "response_time_seconds": "",
                    "confidence": "",
                    "exposure_count": 1,
                }
            )
    return output


def _logit(value: float) -> float:
    value = min(max(value, 0.01), 0.99)
    return math.log(value / (1 - value))


def _rasch_fit(matrix: np.ndarray, iterations: int = 80):
    persons, items = matrix.shape
    theta = np.array([_logit(row.mean()) for row in matrix], dtype=float)
    difficulty = np.array([-_logit(matrix[:, index].mean()) for index in range(items)])
    difficulty -= difficulty.mean()
    for _ in range(iterations):
        probability = 1 / (1 + np.exp(np.clip(difficulty[None, :] - theta[:, None], -30, 30)))
        variance = np.maximum(probability * (1 - probability), 1e-5)
        theta += (matrix - probability).sum(axis=1) / variance.sum(axis=1)
        theta = np.clip(theta, -6, 6)
        probability = 1 / (1 + np.exp(np.clip(difficulty[None, :] - theta[:, None], -30, 30)))
        variance = np.maximum(probability * (1 - probability), 1e-5)
        difficulty -= (matrix - probability).sum(axis=0) / variance.sum(axis=0)
        difficulty -= difficulty.mean()
        difficulty = np.clip(difficulty, -6, 6)
    probability = 1 / (1 + np.exp(np.clip(difficulty[None, :] - theta[:, None], -30, 30)))
    return theta, difficulty, probability


def calibrate_responses(
    question_bank: Path,
    responses_csv: Path,
    output: Path,
    cut_theta: float = -0.40,
    minimum_sample: int = 200,
) -> dict:
    bank = json.loads(question_bank.read_text(encoding="utf-8"))
    questions = bank.get("questions", bank if isinstance(bank, list) else [])
    answers = {
        item["id"]: (
            item.get("correct_answer")
            or item.get("official_answer")
            or item.get("question", {}).get("correct_answer")
        )
        for item in questions
    }
    if len(answers) < 3 or any(answer not in {"A", "B", "C", "D"} for answer in answers.values()):
        raise RuntimeError("O banco precisa conter ao menos três itens com gabarito A-D.")
    with responses_csv.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        if tuple(reader.fieldnames or ()) != RESPONSE_FIELDS:
            raise RuntimeError(
                "Cabeçalho inválido. Use o CSV criado pelo comando response-template."
            )
        rows = list(reader)
    by_candidate = defaultdict(dict)
    for row in rows:
        candidate = row.get("candidate_id", "").strip()
        item_id = row.get("item_id", "").strip()
        response = row.get("response", "").strip().upper()
        try:
            response_time = float(row.get("response_time_seconds") or 0)
            confidence = int(row.get("confidence") or 0)
            exposure = int(row.get("exposure_count") or 1)
        except ValueError as exc:
            raise RuntimeError("Tempo, confiança ou exposição inválidos no CSV.") from exc
        if response_time <= 0 or confidence not in range(1, 6) or exposure < 1:
            raise RuntimeError("Tempo deve ser positivo, confiança 1-5 e exposição >= 1.")
        if exposure != 1:
            continue
        if not candidate or item_id not in answers or response not in {"A", "B", "C", "D"}:
            raise RuntimeError("Resposta inválida ou incompleta no CSV.")
        if item_id in by_candidate[candidate]:
            raise RuntimeError(f"Resposta duplicada: {candidate} / {item_id}.")
        by_candidate[candidate][item_id] = int(response == answers[item_id])
    item_ids = sorted(answers)
    complete = {
        candidate: values
        for candidate, values in by_candidate.items()
        if set(values) == set(item_ids)
    }
    sample_n = len(complete)
    if sample_n < minimum_sample:
        raise RuntimeError(
            f"Amostra insuficiente: {sample_n}; mínimo para calibração provisória: {minimum_sample}."
        )
    matrix = np.array(
        [[complete[candidate][item_id] for item_id in item_ids] for candidate in sorted(complete)],
        dtype=float,
    )
    theta, difficulty, probability = _rasch_fit(matrix)
    total_scores = matrix.sum(axis=1)
    status = "CALIBRATED" if sample_n >= 500 else "PROVISIONAL"
    calibrations = []
    for index, item_id in enumerate(item_ids):
        residual = matrix[:, index] - probability[:, index]
        variance = np.maximum(probability[:, index] * (1 - probability[:, index]), 1e-8)
        infit = float((residual**2).sum() / variance.sum())
        outfit = float(np.mean((residual**2) / variance))
        corrected = total_scores - matrix[:, index]
        point_biserial = (
            float(np.corrcoef(matrix[:, index], corrected)[0, 1])
            if np.std(matrix[:, index]) > 0 and np.std(corrected) > 0
            else 0.0
        )
        validity = (
            "VALID"
            if 0.7 <= infit <= 1.3 and 0.7 <= outfit <= 1.3 and point_biserial >= 0.15
            else "REVIEW_REQUIRED"
        )
        calibration = RaschItemCalibration(
            calibration_status=status,
            irt_difficulty_b=float(difficulty[index]),
            irt_difficulty_source=str(responses_csv),
            irt_difficulty_confidence=min(1.0, sample_n / 1000),
            empirical_p_value=float(matrix[:, index].mean()),
            point_biserial=point_biserial,
            rasch_infit=infit,
            rasch_outfit=outfit,
            calibration_sample_n=sample_n,
            calibration_population="Candidatos identificados no arquivo de respostas",
            calibration_year=datetime.now(timezone.utc).year,
            item_validity_status=validity,
        )
        calibration = enrich_cut_metrics(calibration, cut_theta)
        calibrations.append({"item_id": item_id, **calibration.model_dump()})
    result = {
        "schema_version": "staziamed.rasch-calibration.v1",
        "model": "RASCH_1PL",
        "sample_n": sample_n,
        "first_exposure_only": True,
        "cut_theta": cut_theta,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "items": calibrations,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result
