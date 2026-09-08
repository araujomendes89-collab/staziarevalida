import unittest
import json
from pathlib import Path

from pydantic import ValidationError

from src.models.psychometrics import (
    PsychometricDNA,
    RaschItemCalibration,
    enrich_cut_metrics,
    rasch_item_information,
    rasch_probability,
)
from src.models.question_matrix_dna import QuestionMatrixDNA
from src.models.question_dna import QuestionDNA
from src.analysis.build_institutional_blueprint import _largest_remainder


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class NewMatrixTests(unittest.TestCase):
    def test_blueprint_allocation_has_exactly_one_hundred_slots(self):
        allocation = _largest_remainder(
            {"CLINICAL_MEDICINE": 0.33, "PEDIATRICS": 0.22, "OTHER": 0.45},
            100,
        )
        self.assertEqual(sum(allocation.values()), 100)
        self.assertEqual(allocation["CLINICAL_MEDICINE"], 33)

    def _valid(self):
        return {
            "question_number": 1,
            "diagnostic_stage": "DIAGNOSTIC_CONFIRMATION",
            "management_stage": "INITIAL_MANAGEMENT",
            "asks_for": "NEXT_STEP",
            "protocol_dependency": True,
            "sus_dependency": False,
            "clinical_clues": ["hipertensão grave", "cefaleia"],
            "discriminating_clues": ["pressão arterial de 164 por 112 mmHg"],
            "red_flags": ["escotomas"],
            "distractor_error_models": [
                {"alternative": "A", "error_model": "subtratamento e seguimento inseguro"},
                {"alternative": "C", "error_model": "posterga uma emergência obstétrica"},
                {"alternative": "D", "error_model": "omite prevenção de convulsões"},
            ],
            "knowledge_depth": "CONTEXTUALIZED_CLINICAL_DECISION",
            "decision_complexity": "HIGH",
            "guideline_year": 2025,
            "competency_over_knowledge_score": 5,
            "generalist_relevance": 5,
            "analysis_confidence": 0.91,
            "review_required": False,
            "review_reason": None,
        }

    def test_matrix_dna_accepts_complete_record(self):
        dna = QuestionMatrixDNA.model_validate(self._valid())
        self.assertEqual(dna.asks_for, "NEXT_STEP")

    def test_low_confidence_forces_review(self):
        data = self._valid()
        data["analysis_confidence"] = 0.7
        dna = QuestionMatrixDNA.model_validate(data)
        self.assertTrue(dna.review_required)
        self.assertIn("0,85", dna.review_reason)

    def test_guideline_year_requires_protocol_dependency(self):
        data = self._valid()
        data["protocol_dependency"] = False
        with self.assertRaises(ValidationError):
            QuestionMatrixDNA.model_validate(data)

    def test_frozen_question_dna_schema_does_not_gain_matrix_fields(self):
        fixture = json.loads(
            (
                PROJECT_ROOT
                / "data/processed/dna/production/"
                "revalida_2026_1_dna_v2_pass1_final.json"
            ).read_text(encoding="utf-8")
        )["questions"][0]["dna"]
        dumped = QuestionDNA.model_validate(fixture).model_dump()
        self.assertNotIn("asks_for", dumped)
        self.assertNotIn("irt_difficulty_b", dumped)


class PsychometricTests(unittest.TestCase):
    def test_rasch_probability_and_information(self):
        self.assertAlmostEqual(rasch_probability(0.0, 0.0), 0.5)
        self.assertAlmostEqual(rasch_item_information(0.0, 0.0), 0.25)

    def test_uncalibrated_item_rejects_invented_b(self):
        with self.assertRaises(ValidationError):
            RaschItemCalibration(irt_difficulty_b=-0.4)

    def test_calibration_requires_provenance(self):
        with self.assertRaises(ValidationError):
            RaschItemCalibration(
                calibration_status="CALIBRATED",
                irt_difficulty_b=-0.4,
            )

    def test_empirical_item_can_be_enriched_at_cut(self):
        item = RaschItemCalibration(
            calibration_status="CALIBRATED",
            irt_difficulty_b=-0.4,
            irt_difficulty_source="Amostra piloto StaziaMed",
            calibration_sample_n=600,
            calibration_population="Candidatos ao Revalida",
            calibration_year=2026,
        )
        enriched = enrich_cut_metrics(item, -0.4)
        self.assertAlmostEqual(enriched.item_information_at_cut, 0.25)
        self.assertEqual(enriched.cut_proximity, 0.0)

    def test_target_difficulty_is_separate_from_empirical_calibration(self):
        metadata = PsychometricDNA(
            target_difficulty_b=-0.4,
            target_difficulty_source="BLUEPRINT",
        )
        self.assertEqual(metadata.calibration.calibration_status, "UNCALIBRATED")
        self.assertIsNone(metadata.calibration.irt_difficulty_b)


if __name__ == "__main__":
    unittest.main()
