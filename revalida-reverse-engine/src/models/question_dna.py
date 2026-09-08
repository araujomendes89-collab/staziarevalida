from typing import Literal

from pydantic import BaseModel, Field


PrimaryArea = Literal[
    "CLINICAL_MEDICINE",
    "GENERAL_SURGERY",
    "PEDIATRICS",
    "OBSTETRICS_GYNECOLOGY",
    "FAMILY_COMMUNITY_PUBLIC_HEALTH",
]


PrimarySubarea = Literal[
    # Clínica Médica
    "CARDIOLOGY",
    "PULMONOLOGY",
    "ENDOCRINOLOGY",
    "INFECTIOUS_DISEASES",
    "NEPHROLOGY_ELECTROLYTES",
    "NEUROLOGY",
    "GASTROENTEROLOGY_HEPATOLOGY",
    "HEMATOLOGY_ONCOLOGY",
    "RHEUMATOLOGY",
    "DERMATOLOGY",
    "GERIATRICS",
    "CLINICAL_EMERGENCIES",
    "PSYCHIATRY",

    # Cirurgia Geral
    "TRAUMA_ATLS",
    "ACUTE_ABDOMEN",
    "HERNIAS",
    "PERIOPERATIVE_CARE",
    "UROLOGY",
    "BURNS",
    "COLOPROCTOLOGY",
    "VASCULAR_SURGERY",
    "ORTHOPEDICS_TRAUMA",

    # Pediatria
    "WELL_CHILD_CARE_GROWTH_DEVELOPMENT",
    "IMMUNIZATION",
    "NEONATOLOGY",
    "PEDIATRIC_RESPIRATORY",
    "PEDIATRIC_GASTRO_NUTRITION",
    "PEDIATRIC_INFECTIOUS_EXANTHEMS",
    "PEDIATRIC_NEUROLOGY",
    "PEDIATRIC_NEPHROLOGY",
    "PEDIATRIC_ENDOCRINOLOGY",
    "PEDIATRIC_HEMATOLOGY_ONCOLOGY",
    "PEDIATRIC_EMERGENCIES",

    # GO
    "OBSTETRICS",
    "GYNECOLOGY",

    # MFC / Saúde Coletiva
    "SUS_HEALTH_SYSTEM",
    "PRIMARY_CARE",
    "EPIDEMIOLOGY_BIOSTATISTICS",
    "HEALTH_SURVEILLANCE",
    "PREVENTION_SCREENING",
    "IMMUNIZATION_PUBLIC_HEALTH",
    "ETHICS_COMMUNICATION",
    "OCCUPATIONAL_HEALTH",
    "MENTAL_HEALTH_PRIMARY_CARE",
]


Competency = Literal[
    "DIAGNOSIS",
    "DIFFERENTIAL_DIAGNOSIS",
    "INITIAL_ASSESSMENT",
    "SELECT_DIAGNOSTIC_TEST",
    "INTERPRET_DIAGNOSTIC_TEST",
    "SELECT_TREATMENT",
    "PHARMACOLOGIC_TREATMENT",
    "NONPHARMACOLOGIC_TREATMENT",
    "EMERGENCY_STABILIZATION",
    "SURGICAL_MANAGEMENT",
    "PREVENTION",
    "SCREENING",
    "VACCINATION",
    "FOLLOW_UP",
    "REFERRAL",
    "RECOGNIZE_COMPLICATION",
    "PROGNOSIS",
    "RISK_STRATIFICATION",
    "EPIDEMIOLOGIC_REASONING",
    "PUBLIC_HEALTH_ACTION",
    "ETHICAL_LEGAL_DECISION",
    "CONTRAINDICATION_ASSESSMENT",
    "RISK_FACTOR_ASSESSMENT",
]


CognitiveTask = Literal[
    "IDENTIFY_DIAGNOSIS",
    "IDENTIFY_MOST_LIKELY_CAUSE",
    "CHOOSE_NEXT_STEP",
    "CHOOSE_BEST_TEST",
    "INTERPRET_RESULT",
    "CHOOSE_INITIAL_TREATMENT",
    "CHOOSE_DEFINITIVE_TREATMENT",
    "CHOOSE_EMERGENCY_CONDUCT",
    "IDENTIFY_COMPLICATION",
    "IDENTIFY_CONTRAINDICATION",
    "IDENTIFY_RISK_FACTOR",
    "APPLY_GUIDELINE",
    "CALCULATE_INTERPRET_EPIS",
    "PRIORITIZE_ACTION",
]


CareSetting = Literal[
    "PRIMARY_CARE",
    "OUTPATIENT_SPECIALTY",
    "EMERGENCY_DEPARTMENT",
    "HOSPITAL_WARD",
    "ICU",
    "OPERATING_ROOM",
    "MATERNITY",
    "DELIVERY_ROOM",
    "NEONATAL_UNIT",
    "COMMUNITY_PUBLIC_HEALTH",
    "UNSPECIFIED",
]


PatientGroup = Literal[
    "NEONATE",
    "INFANT",
    "CHILD",
    "ADOLESCENT",
    "ADULT",
    "OLDER_ADULT",
    "PREGNANT",
    "PUERPERAL",
    "GENERAL_POPULATION",
    "NOT_SPECIFIED",
]


UrgencyLevel = Literal[
    "ELECTIVE",
    "URGENT",
    "EMERGENCY",
    "NOT_APPLICABLE",
]


QuestionFormat = Literal[
    "CLINICAL_VIGNETTE",
    "DIRECT_CONCEPT",
    "IMAGE_BASED",
    "TABLE_BASED",
    "LAB_INTERPRETATION",
    "IMAGING_INTERPRETATION",
    "ECG_INTERPRETATION",
    "EPIDEMIOLOGY_CALCULATION",
    "PUBLIC_HEALTH_SCENARIO",
    "ETHICS_LEGAL_SCENARIO",
    "MULTIMODAL",
]


ReasoningType = Literal[
    "PATTERN_RECOGNITION",
    "CLINICAL_INTEGRATION",
    "PATHOPHYSIOLOGIC_REASONING",
    "GUIDELINE_APPLICATION",
    "RISK_BENEFIT_DECISION",
    "TEMPORAL_SEQUENCE",
    "TEST_INTERPRETATION",
    "EPIDEMIOLOGIC_REASONING",
]


DistractorPattern = Literal[
    "PLAUSIBLE_DIFFERENTIAL",
    "WRONG_TEST",
    "WRONG_TIMING",
    "WRONG_TREATMENT",
    "CONTRAINDICATED_TREATMENT",
    "OVERTREATMENT",
    "UNDERTREATMENT",
    "OVERTESTING",
    "OBSOLETE_PROTOCOL",
    "WRONG_DOSE_ROUTE",
    "WRONG_REFERRAL",
    "WRONG_SEQUENCE",
    "PARTIALLY_CORRECT",
    "UNRELATED_CONCEPT",
    "OTHER",
]


DifficultyEstimate = Literal[
    "LOW",
    "MODERATE",
    "HIGH",
]


class QuestionDNA(BaseModel):
    question_number: int = Field(
        ge=1,
    )

    primary_area: PrimaryArea
    primary_subarea: PrimarySubarea

    topic: str = Field(
        min_length=2
    )

    subtopic: str = Field(
        min_length=2
    )

    primary_competency: Competency

    secondary_competencies: list[
        Competency
    ] = Field(
        default_factory=list
    )

    cognitive_task: CognitiveTask

    care_setting: CareSetting
    patient_group: PatientGroup
    urgency_level: UrgencyLevel

    question_format: QuestionFormat

    reasoning_types: list[
        ReasoningType
    ] = Field(
        default_factory=list
    )

    clinical_decision: str = Field(
        min_length=5
    )

    key_concepts: list[str] = Field(
        default_factory=list
    )

    diagnoses_or_conditions: list[str] = Field(
        default_factory=list
    )

    diagnostic_tests: list[str] = Field(
        default_factory=list
    )

    treatments_or_interventions: list[str] = Field(
        default_factory=list
    )

    distractor_patterns: list[
        DistractorPattern
    ] = Field(
        default_factory=list
    )

    correct_answer_concept: str = Field(
        min_length=2
    )

    question_intent: str = Field(
        min_length=5
    )

    protocol_or_guideline_dependency: bool = False

    protocol_topics: list[str] = Field(
        default_factory=list
    )

    difficulty_estimate: DifficultyEstimate

    classification_confidence: float = Field(
        ge=0,
        le=1
    )

    review_required: bool = False

    review_reason: str | None = None
