import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import src.generation.novel_questions as novel
from src.config.exams import get_exam_config


class NovelQuestionGenerationTests(unittest.TestCase):
    def test_generator_sends_only_aggregate_profile_and_updates(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            exam = replace(
                get_exam_config("revalida_2025_2"),
                exam_id="revalida_teste_2098_1",
                dataset_version="0.1.0",
                question_count=1,
                master_relative_path=Path("data/processed/master.json"),
                excluded_question_numbers=(),
            )
            official_stem = (
                "Enunciado oficial reservado que não pode ser enviado ao serviço "
                "de geração durante a criação de uma questão inédita de teste."
            )
            master_path = exam.master_path(root)
            master_path.parent.mkdir(parents=True)
            master_path.write_text(
                json.dumps(
                    {
                        "exam": {
                            "exam_id": exam.exam_id,
                            "dataset_version": exam.dataset_version,
                            "total_questions": 1,
                        },
                        "questions": [
                            {
                                "question_number": 1,
                                "clean_stem": official_stem,
                                "official_answer": "A",
                                "answer_status": "VALID",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            export_dir = root / "data/exports/staziamed" / exam.exam_id
            export_dir.mkdir(parents=True)
            (export_dir / "generation_profile.json").write_text(
                json.dumps(
                    {
                        "blueprints": [
                            {
                                "primary_area": "CLINICAL_MEDICINE",
                                "primary_subarea": "CARDIOLOGY",
                                "primary_competency": "DIAGNOSIS",
                                "cognitive_task": "IDENTIFY_DIAGNOSIS",
                            }
                        ],
                        "generation_rules": {
                            "language": "português do Brasil",
                            "must_be_original": True,
                        },
                    }
                ),
                encoding="utf-8",
            )
            updates_dir = root / "atualizacoes"
            updates_dir.mkdir()
            (updates_dir / "nota.md").write_text(
                "Atualização clínica autorizada para este teste.", encoding="utf-8"
            )

            draft = novel.NovelQuestionDraft(
                stem=(
                    "Mulher adulta apresenta palpitações episódicas e procura a "
                    "unidade de saúde para investigação clínica inicial do quadro."
                ),
                alternatives={
                    "A": "Solicitar o exame indicado pela atualização.",
                    "B": "Prescrever tratamento sem avaliação clínica.",
                    "C": "Desconsiderar os sintomas apresentados.",
                    "D": "Adiar indefinidamente a investigação.",
                },
                correct_answer="A",
                explanation=(
                    "A alternativa A aplica a recomendação atualizada e permite "
                    "investigação clínica segura, proporcional e bem indicada."
                ),
                clinical_decision="Selecionar a investigação inicial adequada.",
                update_application="A recomendação atualizada definiu o exame inicial.",
                key_concepts=["palpitações", "investigação clínica"],
            )
            captured = {}

            class FakeResponses:
                def parse(self, **kwargs):
                    captured.update(kwargs)
                    return SimpleNamespace(output_parsed=draft)

            client = SimpleNamespace(responses=FakeResponses())
            with (
                patch.object(novel, "OpenAI", return_value=client),
                patch.dict("os.environ", {"OPENAI_API_KEY": "chave-de-teste"}),
            ):
                output_path, generated = novel.generate_novel_questions(
                    exam,
                    1,
                    updates_dir,
                    root,
                    target_difficulty_b=-0.4,
                )

            self.assertEqual(len(generated), 1)
            self.assertTrue(output_path.is_file())
            self.assertNotIn(official_stem, captured["input"])
            self.assertIn("Atualização clínica autorizada", captured["input"])
            self.assertEqual(generated[0]["status"], "DRAFT_REVIEW_REQUIRED")
            self.assertEqual(
                generated[0]["psychometrics"]["target_difficulty_b"], -0.4
            )
            self.assertEqual(
                generated[0]["psychometrics"]["calibration"]["calibration_status"],
                "UNCALIBRATED",
            )
            self.assertIn("ALVO_EDITORIAL_NAO_CALIBRADO", captured["input"])
            self.assertEqual(output_path.name, "novel_questions_v2.jsonl")


if __name__ == "__main__":
    unittest.main()
