import csv
import json
import tempfile
import unittest
from collections import Counter
from pathlib import Path

from pypdf import PdfReader

from src.analysis.find_twin_questions import find_twins
from src.analysis.topic_recurrence import build_recurrence_report
from src.exports.exam_pdf import build_exam_pdfs
from src.generation.full_exam import (
    FullQuestionDraft,
    load_blueprint,
    select_slots,
    _validate_draft,
)
from src.generation.source_library import MedicalSourceLibrary
from src.automation.full_exam import validate_complete_exam
from src.psychometrics.calibration import calibrate_responses, create_response_template
from src.automation.dashboard import build_progress_dashboard
from src.exports.staziamed_import import (
    build_staziamed_import_package,
    validate_staziamed_import_package,
)


class OperationalFeaturesTests(unittest.TestCase):
    def test_source_library_retrieves_relevant_material_without_loading_everything(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "cardiologia.txt").write_text(
                "Hipertensão arterial: diagnóstico, metas pressóricas e tratamento.",
                encoding="utf-8",
            )
            (root / "pediatria.txt").write_text(
                "Vacinação infantil: calendário, doses e reforços da meningocócica.",
                encoding="utf-8",
            )
            library = MedicalSourceLibrary(root)
            packet, files = library.retrieve("criança com reforço da vacina meningocócica")
            self.assertEqual(files, ["pediatria.txt"])
            self.assertIn("Vacinação infantil", packet)
            self.assertNotIn("metas pressóricas", packet)

    def test_full_blueprint_and_filters(self):
        blueprint = load_blueprint()
        slots = select_slots(blueprint, 100)
        self.assertEqual([item["slot"] for item in slots], list(range(1, 101)))
        self.assertEqual(
            Counter(item["primary_area"] for item in slots),
            Counter(blueprint["suggested_100_item_area_slots"]),
        )
        difficult = select_slots(blueprint, 5, level="difícil")
        self.assertTrue(
            all(item["psychometric_target"]["target_difficulty_b"] == 0.8 for item in difficult)
        )

    def test_validate_complete_exam_does_not_start_model(self):
        with tempfile.TemporaryDirectory() as directory:
            updates = Path(directory)
            (updates / "diretriz.md").write_text(
                "Recomendação clínica atualizada para apoio à elaboração.",
                encoding="utf-8",
            )
            result = validate_complete_exam(
                updates, "teste_validacao", count=2, theme="pediatria"
            )
            self.assertEqual(result["question_count"], 2)
            self.assertEqual(result["source_count"], 1)
            self.assertFalse(result["uses_openai_api"])
            self.assertFalse(result["starts_local_model"])

    def test_full_exam_rejects_duplicate_generated_stem(self):
        stem = (
            "Paciente adulto procura atendimento por sintomas progressivos e apresenta "
            "achados clínicos que exigem a escolha da conduta inicial mais segura."
        )
        draft = FullQuestionDraft(
            title="Escolha da conduta clínica",
            stem=stem,
            support_type="NONE",
            support_title=None,
            support_rows=[],
            image_description=None,
            alternatives={letter: f"Conduta clínica correspondente à opção {letter}." for letter in "ABCD"},
            correct_answer="A",
            professor_explanation=(
                "A primeira alternativa integra os achados apresentados e prioriza uma "
                "abordagem segura, proporcional e adequada ao cenário clínico descrito."
            ),
            alternative_explanations={
                letter: (
                    f"A alternativa {letter} deve ser avaliada quanto à indicação, "
                    "segurança e oportunidade diante dos dados clínicos apresentados."
                )
                for letter in "ABCD"
            },
            clinical_decision="Selecionar a conduta clínica inicial mais segura.",
            key_concepts=["avaliação clínica", "conduta inicial"],
            update_application="A fonte local sustenta a escolha clínica indicada.",
            source_citations=[
                {"source_file": "fonte.md", "supported_claim": "Conduta inicial segura."}
            ],
            difficulty_target_features=["integração de pistas clínicas"],
        )
        with self.assertRaisesRegex(RuntimeError, "outra questão deste simulado"):
            _validate_draft(draft, ["fonte.md"], [], [stem])

    def test_twins_are_cross_edition(self):
        pairs, candidates = find_twins(theme="cardiologia", threshold=0.60, limit=5)
        self.assertGreater(candidates, 0)
        self.assertTrue(pairs)
        self.assertTrue(all(item["left"]["exam_id"] != item["right"]["exam_id"] for item in pairs))
        self.assertTrue(
            all(
                item["relationship_type"]
                in {
                    "REPETICAO_QUASE_LITERAL",
                    "CASO_CLINICO_SEMELHANTE",
                    "GEMEA_TEMATICA",
                }
                for item in pairs
            )
        )

    def test_topic_recurrence_uses_all_historical_questions_without_tri(self):
        report = build_recurrence_report(limit=20)
        self.assertEqual(report["source_exam_count"], 13)
        self.assertEqual(report["source_question_count"], 1217)
        self.assertFalse(report["tri_applied_to_historical_items"])
        self.assertTrue(report["themes"])
        self.assertTrue(report["primary_subareas"])
        self.assertTrue(
            all(item["distinct_exam_count"] >= 1 for item in report["themes"])
        )

    def test_response_template_and_empirical_calibration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bank_path = root / "bank.json"
            bank = {
                "questions": [
                    {"id": "q001", "correct_answer": "A"},
                    {"id": "q002", "correct_answer": "B"},
                    {"id": "q003", "correct_answer": "C"},
                ]
            }
            bank_path.write_text(json.dumps(bank), encoding="utf-8")
            template = create_response_template(bank_path, root / "template.csv")
            self.assertTrue(template.is_file())
            responses = root / "responses.csv"
            with responses.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(
                    stream,
                    fieldnames=(
                        "candidate_id", "item_id", "response",
                        "response_time_seconds", "confidence", "exposure_count",
                    ),
                )
                writer.writeheader()
                for candidate in range(200):
                    patterns = (candidate % 5 != 0, candidate % 2 == 0, candidate % 3 == 0)
                    for item_id, correct, answer in zip(
                        ("q001", "q002", "q003"), patterns, ("A", "B", "C"), strict=True
                    ):
                        writer.writerow(
                            {
                                "candidate_id": f"c{candidate:03d}",
                                "item_id": item_id,
                                "response": answer if correct else "D",
                                "response_time_seconds": 90,
                                "confidence": 3,
                                "exposure_count": 1,
                            }
                        )
            result = calibrate_responses(
                bank_path, responses, root / "calibration.json", minimum_sample=200
            )
            self.assertEqual(result["sample_n"], 200)
            self.assertEqual(len(result["items"]), 3)
            self.assertTrue(all(item["irt_difficulty_b"] is not None for item in result["items"]))

    def test_three_pdfs_are_created_and_readable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            reviewed = root / "reviewed.json"
            question = {
                "title": "Conduta clínica",
                "stem": "Paciente procura atendimento com quadro clínico progressivo e sinais que exigem avaliação cuidadosa para escolha da melhor conduta inicial disponível.",
                "support_type": "LAB_PANEL",
                "support_title": "Exames",
                "support_rows": [
                    {
                        "label": "Hemoglobina e observações do laboratório",
                        "value": (
                            "10 g/dL; resultado acompanhado de uma observação clínica "
                            "deliberadamente longa para confirmar a quebra automática "
                            "de linha sem sobreposição entre as colunas da tabela."
                        ),
                    }
                ],
                "image_description": None,
                "alternatives": {letter: f"Conduta correspondente à alternativa {letter}." for letter in "ABCD"},
                "correct_answer": "A",
                "professor_explanation": "A alternativa A representa a melhor conduta porque integra os dados clínicos, prioriza segurança e responde diretamente ao problema apresentado no enunciado.",
                "alternative_explanations": {letter: f"A alternativa {letter} deve ser analisada conforme a segurança, oportunidade e coerência com o quadro clínico descrito." for letter in "ABCD"},
                "clinical_decision": "Selecionar a conduta clínica inicial mais segura.",
                "key_concepts": ["avaliação clínica", "conduta inicial"],
                "update_application": "A conduta segue o material clínico fornecido.",
                "source_citations": [{"source_file": "fonte.md", "supported_claim": "Conduta inicial segura."}],
                "difficulty_target_features": ["pistas clínicas integradas"],
            }
            reviewed.write_text(
                json.dumps(
                    {
                        "title": "SIMULADO REVALIDA/ENAMED 2026.2",
                        "questions": [
                            {
                                "slot": 1,
                                "status": "APPROVED_FOR_PDF",
                                "question": question,
                                "blueprint": {"psychometric_target": {"target_difficulty_b": -0.4}},
                                "medical_review": {"verdict": "APPROVED"},
                                "pedagogical_review": {"verdict": "APPROVED"},
                            }
                        ],
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            paths = build_exam_pdfs(reviewed, root / "pdf")
            self.assertEqual(len(paths), 3)
            self.assertTrue(all(len(PdfReader(path).pages) >= 1 for path in paths))

    def test_dashboard_and_consolidated_staziamed_import(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            html_path, json_path, dashboard = build_progress_dashboard(
                output / "dashboard"
            )
            self.assertTrue(html_path.is_file())
            self.assertTrue(json_path.is_file())
            self.assertEqual(dashboard["summary"]["exam_count"], 13)
            package_dir, manifest = build_staziamed_import_package(
                output / "import"
            )
            validated = validate_staziamed_import_package(package_dir)
            self.assertEqual(manifest["active_question_count"], 1217)
            self.assertEqual(manifest["all_question_count"], 1300)
            self.assertEqual(validated["status"], "READY_FOR_STAZIAMED_IMPORT")


if __name__ == "__main__":
    unittest.main()
