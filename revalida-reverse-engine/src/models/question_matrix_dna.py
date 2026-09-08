"""DNA de competências da nova matriz, isolado do QuestionDNA congelado."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


DiagnosticStage = Literal[
    "NOT_APPLICABLE",
    "INITIAL_PRESENTATION",
    "DIFFERENTIAL_FORMULATION",
    "DIAGNOSTIC_CONFIRMATION",
    "STAGING_RISK_STRATIFICATION",
    "FOLLOW_UP_REASSESSMENT",
]

ManagementStage = Literal[
    "NOT_APPLICABLE",
    "PREVENTION_SCREENING",
    "INITIAL_STABILIZATION",
    "INITIAL_MANAGEMENT",
    "DEFINITIVE_MANAGEMENT",
    "FOLLOW_UP_LONGITUDINAL_CARE",
    "REFERRAL_CARE_COORDINATION",
]

AsksFor = Literal[
    "DIAGNOSIS",
    "ETIOLOGY",
    "NEXT_STEP",
    "DIAGNOSTIC_TEST",
    "INTERPRETATION",
    "INITIAL_TREATMENT",
    "DEFINITIVE_TREATMENT",
    "SCREENING",
    "PREVENTION",
    "REFERRAL",
    "EMERGENCY_MANAGEMENT",
    "COMPLICATION",
    "PROGNOSIS",
    "RISK_FACTOR",
    "PUBLIC_HEALTH_ACTION",
    "ETHICAL_LEGAL_DECISION",
]

KnowledgeDepth = Literal[
    "FACTUAL_RECALL",
    "APPLIED_KNOWLEDGE",
    "INTEGRATED_REASONING",
    "CONTEXTUALIZED_CLINICAL_DECISION",
]

DecisionComplexity = Literal["LOW", "MODERATE", "HIGH"]


class DistractorErrorModel(BaseModel):
    alternative: Literal["A", "B", "C", "D"]
    error_model: str = Field(min_length=1)


class QuestionMatrixDNA(BaseModel):
    """Camada editorial complementar; não contém parâmetros TRI."""

    question_number: int = Field(ge=1)
    diagnostic_stage: DiagnosticStage
    management_stage: ManagementStage
    asks_for: AsksFor
    protocol_dependency: bool
    sus_dependency: bool
    clinical_clues: list[str] = Field(min_length=1, max_length=8)
    discriminating_clues: list[str] = Field(min_length=1, max_length=5)
    red_flags: list[str] = Field(max_length=5)
    distractor_error_models: list[DistractorErrorModel] = Field(
        min_length=3,
        max_length=3,
    )
    knowledge_depth: KnowledgeDepth
    decision_complexity: DecisionComplexity
    guideline_year: int | None = Field(ge=1900, le=2100)
    competency_over_knowledge_score: int = Field(ge=0, le=5)
    generalist_relevance: int = Field(ge=0, le=5)
    analysis_confidence: float = Field(ge=0, le=1)
    review_required: bool
    review_reason: str | None

    @field_validator(
        "clinical_clues",
        "discriminating_clues",
        "red_flags",
    )
    @classmethod
    def reject_empty_list_values(cls, values):
        if any(not value.strip() for value in values):
            raise ValueError("Listas narrativas não podem conter texto vazio.")
        return values

    @field_validator("distractor_error_models")
    @classmethod
    def validate_distractor_keys(cls, value):
        alternatives = [item.alternative for item in value]
        if len(set(alternatives)) != len(alternatives):
            raise ValueError("As alternativas dos distratores não podem se repetir.")
        return value

    @model_validator(mode="after")
    def enforce_review_threshold(self):
        if self.analysis_confidence < 0.85:
            self.review_required = True
            if not self.review_reason:
                self.review_reason = "Confiança da análise inferior a 0,85."
        if self.guideline_year is not None and not self.protocol_dependency:
            raise ValueError(
                "guideline_year exige protocol_dependency=true."
            )
        return self
