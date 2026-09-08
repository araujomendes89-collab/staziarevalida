"""Modelos e cálculos Rasch separados da classificação editorial.

Este módulo nunca transforma a dificuldade estimada por IA em parâmetro TRI.
Uma calibração empírica exige respostas de candidatos e proveniência da amostra.
"""

from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, Field, model_validator


CalibrationStatus = Literal[
    "UNCALIBRATED",
    "PROVISIONAL",
    "CALIBRATED",
    "REJECTED",
]

ItemValidityStatus = Literal[
    "NOT_EVALUATED",
    "VALID",
    "REVIEW_REQUIRED",
    "EXCLUDED_STATISTICAL",
]


class RaschItemCalibration(BaseModel):
    """Metadados empíricos de um item no modelo Rasch/1PL."""

    irt_model: Literal["RASCH_1PL"] = "RASCH_1PL"
    calibration_status: CalibrationStatus = "UNCALIBRATED"
    irt_difficulty_b: float | None = None
    irt_difficulty_source: str | None = None
    irt_difficulty_confidence: float | None = Field(default=None, ge=0, le=1)
    empirical_p_value: float | None = Field(default=None, ge=0, le=1)
    point_biserial: float | None = Field(default=None, ge=-1, le=1)
    rasch_infit: float | None = Field(default=None, gt=0)
    rasch_outfit: float | None = Field(default=None, gt=0)
    item_information_at_cut: float | None = Field(default=None, ge=0)
    cut_theta: float | None = None
    cut_proximity: float | None = Field(default=None, ge=0)
    calibration_sample_n: int | None = Field(default=None, ge=1)
    calibration_population: str | None = None
    calibration_year: int | None = Field(default=None, ge=1900, le=2100)
    item_validity_status: ItemValidityStatus = "NOT_EVALUATED"

    @model_validator(mode="after")
    def require_empirical_provenance(self):
        if self.calibration_status in {"PROVISIONAL", "CALIBRATED"}:
            missing = []
            if self.irt_difficulty_b is None:
                missing.append("irt_difficulty_b")
            if not self.irt_difficulty_source:
                missing.append("irt_difficulty_source")
            if self.calibration_sample_n is None:
                missing.append("calibration_sample_n")
            if not self.calibration_population:
                missing.append("calibration_population")
            if missing:
                raise ValueError(
                    "Calibração empírica sem proveniência obrigatória: "
                    + ", ".join(missing)
                )
        if self.calibration_status == "UNCALIBRATED" and any(
            value is not None
            for value in (
                self.irt_difficulty_b,
                self.empirical_p_value,
                self.point_biserial,
                self.rasch_infit,
                self.rasch_outfit,
            )
        ):
            raise ValueError(
                "Item não calibrado não pode conter parâmetros empíricos."
            )
        return self


class PsychometricDNA(BaseModel):
    """Camada psicométrica independente do DNA clínico."""

    target_difficulty_b: float | None = None
    target_difficulty_source: Literal[
        "EDITORIAL_JUDGMENT",
        "AI_ESTIMATE",
        "BLUEPRINT",
    ] | None = None
    calibration: RaschItemCalibration = Field(
        default_factory=RaschItemCalibration
    )

    @model_validator(mode="after")
    def require_target_source(self):
        if (
            self.target_difficulty_b is None
        ) != (
            self.target_difficulty_source is None
        ):
            raise ValueError(
                "Dificuldade-alvo e sua fonte devem ser informadas juntas."
            )
        return self


def rasch_probability(theta: float, difficulty_b: float) -> float:
    """Probabilidade de acerto no Rasch, com proteção numérica."""

    delta = theta - difficulty_b
    if delta >= 0:
        return 1.0 / (1.0 + math.exp(-min(delta, 709.0)))
    exp_delta = math.exp(max(delta, -709.0))
    return exp_delta / (1.0 + exp_delta)


def rasch_item_information(theta: float, difficulty_b: float) -> float:
    probability = rasch_probability(theta, difficulty_b)
    return probability * (1.0 - probability)


def enrich_cut_metrics(
    calibration: RaschItemCalibration,
    cut_theta: float,
) -> RaschItemCalibration:
    """Calcula métricas no corte somente quando `b` é empírico."""

    if calibration.irt_difficulty_b is None:
        raise ValueError(
            "Não é possível calcular informação no corte sem b empírico."
        )
    return calibration.model_copy(
        update={
            "cut_theta": cut_theta,
            "cut_proximity": abs(calibration.irt_difficulty_b - cut_theta),
            "item_information_at_cut": rasch_item_information(
                cut_theta, calibration.irt_difficulty_b
            ),
        }
    )
