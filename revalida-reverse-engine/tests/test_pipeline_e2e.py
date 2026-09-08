import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import src.classification.classify_dna_all as classify_all
import src.ingestion.build_canonical_dna as canonical_builder
import src.verification.audit_canonical_dna as canonical_audit
import src.verification.compare_dna_production as production_comparison
from src.config.exams import EXAMS, PROJECT_ROOT, ExamConfig
from src.models.question_dna import QuestionDNA


class FakeEngine:
    MODEL = "modelo-local-sem-rede"
    taxonomy = None
    dna_template = None

    @classmethod
    def configure_runtime(cls):
        return None

    @classmethod
    def load_taxonomy(cls, path, expected_version=None):
        taxonomy = json.loads(Path(path).read_text(encoding="utf-8"))
        if expected_version is not None:
            assert taxonomy["version"] == expected_version
        cls.taxonomy = taxonomy
        return taxonomy

    @staticmethod
    def alternatives_text(question):
        alternatives = question["alternatives"]
        return "\n".join(f"{letter}) {alternatives[letter]}" for letter in "ABCD")

    @staticmethod
    def resolve_images(question, asset_dir=None, crop_dir=None):
        return []

    @classmethod
    def classify(cls, client, question, taxonomy, asset_dir=None, crop_dir=None):
        dna = cls.dna_template.model_copy(
            deep=True,
            update={"question_number": question["question_number"]},
        )
        return dna, []


class PipelineEndToEndTests(unittest.TestCase):
    def test_local_subarea_owner_is_repaired_deterministically(self):
        taxonomy = json.loads(
            (
                PROJECT_ROOT / "data/taxonomy/revalida_taxonomy_v2.json"
            ).read_text(encoding="utf-8")
        )
        fixture = json.loads(
            (
                PROJECT_ROOT / "data/processed/dna/production/"
                "revalida_2026_1_dna_v2_pass1_final.json"
            ).read_text(encoding="utf-8")
        )["questions"][0]["dna"]
        dna = QuestionDNA.model_validate(fixture)
        dna.primary_area = "GENERAL_SURGERY"
        dna.primary_subarea = "CARDIOLOGY"
        repairs = classify_all.normalize_local_controlled_fields(dna, taxonomy)
        self.assertEqual(dna.primary_area, "CLINICAL_MEDICINE")
        self.assertEqual(repairs[0]["reason"], "SUBAREA_UNIQUE_TAXONOMY_OWNER")

    def test_two_pass_pipeline_without_network(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            exam = self._prepare_exam(root)
            calls = []

            def fake_client(**kwargs):
                calls.append(kwargs)
                return object()

            with patch.dict(EXAMS, {exam.exam_id: exam}, clear=False):
                for pass_number in (1, 2):
                    argv = [
                        "classify_dna_all",
                        "--exam-id",
                        exam.exam_id,
                        "--pass-number",
                        str(pass_number),
                    ]
                    with (
                        patch.object(classify_all, "ROOT", root),
                        patch.object(classify_all, "choose_engine", return_value=FakeEngine),
                        patch.object(classify_all, "OpenAI", side_effect=fake_client),
                        patch.dict("os.environ", {"OPENAI_API_KEY": "chave-falsa"}),
                        patch.object(sys, "argv", argv),
                        patch("sys.stdout", new_callable=io.StringIO),
                    ):
                        classify_all.main()

                self._run_comparison(root, exam)
                queue = json.loads(
                    exam.adjudication_queue_path(root).read_text(encoding="utf-8")
                )
                self.assertEqual(
                    queue["source_dataset_version"],
                    exam.dataset_version,
                )
                self._write_empty_adjudications(root, exam)
                self._run_canonical_builder(root, exam)
                self._run_canonical_audit(root, exam)

            self.assertEqual(len(calls), 2)
            canonical = json.loads(
                exam.canonical_output_path(root).read_text(encoding="utf-8")
            )
            self.assertEqual(canonical["exam_id"], exam.exam_id)
            self.assertEqual(canonical["summary"]["total_questions"], 2)
            self.assertEqual(canonical["summary"]["automatic_questions"], 2)
            self.assertEqual(canonical["summary"]["adjudicated_questions"], 0)

    def _prepare_exam(self, root):
        fixture = json.loads(
            (PROJECT_ROOT / "data/processed/dna/production/"
             "revalida_2026_1_dna_v2_pass1_final.json").read_text(encoding="utf-8")
        )
        FakeEngine.dna_template = QuestionDNA.model_validate(
            fixture["questions"][0]["dna"]
        )

        taxonomy_dir = root / "data/taxonomy"
        taxonomy_dir.mkdir(parents=True)
        for name in ("classification.json", "canonical.json"):
            source = (
                PROJECT_ROOT / "data/taxonomy/revalida_taxonomy_v2.json"
                if name == "classification.json"
                else PROJECT_ROOT / "data/taxonomy/revalida_taxonomy_v2_1.json"
            )
            (taxonomy_dir / name).write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

        exam = ExamConfig(
            exam_id="revalida_teste_2099_1",
            dataset_version="0.1.0",
            question_count=2,
            master_relative_path=Path("data/processed/master.json"),
            assets_relative_dir=Path("data/processed/assets"),
            crops_relative_dir=Path("data/processed/crops"),
            classification_taxonomy_relative_path=Path("data/taxonomy/classification.json"),
            classification_taxonomy_version="2.0.0",
            canonical_taxonomy_relative_path=Path("data/taxonomy/canonical.json"),
            canonical_taxonomy_version="2.1.0",
            answer_key_adapter="src.answer_key.answer_key_parser",
        )
        master_path = exam.master_path(root)
        master_path.parent.mkdir(parents=True)
        questions = []
        for number in (1, 2):
            questions.append(
                {
                    "exam_id": exam.exam_id,
                    "question_number": number,
                    "stem": f"Questão sintética {number}",
                    "alternatives": {letter: f"Alternativa {letter}" for letter in "ABCD"},
                    "official_answer": "A",
                    "answer_status": "VALID",
                    "visual": {"has_specific_assets": False},
                }
            )
        master_path.write_text(
            json.dumps(
                {
                    "exam": {
                        "exam_id": exam.exam_id,
                        "dataset_version": exam.dataset_version,
                        "total_questions": exam.question_count,
                    },
                    "questions": questions,
                }
            ),
            encoding="utf-8",
        )
        return exam

    def _run_comparison(self, root, exam):
        argv = ["compare_dna_production", "--exam-id", exam.exam_id]
        with (
            patch.object(production_comparison, "ROOT", root),
            patch.object(sys, "argv", argv),
            patch("sys.stdout", new_callable=io.StringIO),
        ):
            production_comparison.main()

    def _write_empty_adjudications(self, root, exam):
        path = exam.manual_adjudications_path(root)
        path.write_text(
            json.dumps(
                {
                    "exam_id": exam.exam_id,
                    "source_taxonomy_version": exam.classification_taxonomy_version,
                    "canonical_taxonomy_version": exam.canonical_taxonomy_version,
                    "method": "HUMAN_RULE_BASED_ADJUDICATION",
                    "questions": {},
                }
            ),
            encoding="utf-8",
        )

    def _run_canonical_builder(self, root, exam):
        argv = ["build_canonical_dna", "--exam-id", exam.exam_id]
        with (
            patch.object(canonical_builder, "ROOT", root),
            patch.object(sys, "argv", argv),
            patch("sys.stdout", new_callable=io.StringIO),
        ):
            canonical_builder.main()

    def _run_canonical_audit(self, root, exam):
        argv = ["audit_canonical_dna", "--exam-id", exam.exam_id]
        with (
            patch.object(canonical_audit, "PROJECT_ROOT", root),
            patch.object(sys, "argv", argv),
            patch("sys.stdout", new_callable=io.StringIO),
        ):
            canonical_audit.main()


if __name__ == "__main__":
    unittest.main()
