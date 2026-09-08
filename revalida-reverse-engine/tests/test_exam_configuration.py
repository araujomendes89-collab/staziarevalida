import io
import json
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from src.config.exams import (
    DEFAULT_EXAM_ID,
    get_exam_config,
    load_exam_master,
    save_exam_config,
)
from src.classification.classify_dna_pilot import resolve_images
import src.classification.classify_dna_pilot as pilot1
import src.classification.classify_dna_pilot_pass2 as pilot2
from src.classification.classify_dna_all import (
    acquire_output_lock,
    load_existing,
    main as classification_main,
)
from src.classification.dna_validator import load_taxonomy, validate_natural_language_pt_br
from src.models.question_dna import QuestionDNA
from src.ingestion.build_canonical_dna import load_pass as load_canonical_pass
from src.verification.compare_dna_production import load as load_comparison_pass
from src.cli.main import validate_exam_resources
from src.answer_key.adapters import load_answer_key_adapter, validate_answer_key_records
from src.verification.adjudications import set_adjudication
from src.answer_key.adapters.generic_text import GenericTextAnswerKeyAdapter
from src.exports.staziamed import _resolve_visual_source, validate_staziamed_package
from src.verification.auto_adjudicate import _choose_pass
from src.generation.novel_questions import (
    NovelQuestionDraft,
    load_update_packet,
    validate_novel_draft,
)
from src.automation.intake import infer_exam_identity
from src.extraction.question_detector import RawQuestion
from src.extraction.question_parser import parse_question
import src.automation.runner as automation_runner


class ExamConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.exam = get_exam_config(DEFAULT_EXAM_ID)

    def test_legacy_output_names_are_preserved(self):
        root = Path("/projeto")
        self.assertEqual(
            self.exam.production_output_path(root, 1).name,
            "revalida_2026_1_dna_v2_pass1_final.json",
        )
        self.assertEqual(
            self.exam.pilot_output_path(root, 1).name,
            "revalida_2026_1_dna_pilot_v2_pass1_q001_q005.json",
        )

    def test_unknown_exam_has_clear_error(self):
        with self.assertRaisesRegex(ValueError, "Edição desconhecida"):
            get_exam_config("revalida_inexistente")

    def test_identity_can_be_inferred_from_legacy_folder_name(self):
        exam_id, year, edition = infer_exam_identity(
            (Path("prova.pdf"), Path("gabarito.pdf")),
            Path("Revalida 2020:2"),
        )
        self.assertEqual((exam_id, year, edition), ("revalida_2020_2", 2020, 2))

    def test_plain_letter_alternatives_are_parsed(self):
        raw = RawQuestion(
            question_number=1,
            page_start=1,
            page_end=1,
            item_code=None,
            version_code=None,
            raw_text=(
                "Uma pessoa procura atendimento. A avaliação clínica é necessária.\n"
                "A primeira conduta.\nB segunda conduta.\n"
                "C terceira conduta.\nD quarta conduta."
            ),
            alternatives_found=[],
            structural_confidence=0.5,
            status="REVIEW",
        )
        parsed = parse_question(raw)
        self.assertEqual(parsed.alternatives["A"], "primeira conduta.")
        self.assertEqual(parsed.alternatives["D"], "quarta conduta.")
        self.assertEqual(parsed.warnings, [])

    def test_taxonomy_loader_rejects_wrong_version(self):
        root = Path(__file__).resolve().parents[1]
        taxonomy = json.loads(
            self.exam.classification_taxonomy_path(root).read_text(encoding="utf-8")
        )
        taxonomy["version"] = "versao_errada"
        path = self._json_file(taxonomy)
        with self.assertRaisesRegex(RuntimeError, "Taxonomia incompatível"):
            load_taxonomy(path, expected_version="2.0.0")

    def test_configured_taxonomies_have_declared_versions(self):
        root = Path(__file__).resolve().parents[1]
        classification = load_taxonomy(
            self.exam.classification_taxonomy_path(root),
            expected_version=self.exam.classification_taxonomy_version,
        )
        canonical = load_taxonomy(
            self.exam.canonical_taxonomy_path(root),
            expected_version=self.exam.canonical_taxonomy_version,
        )
        self.assertEqual(classification["version"], "2.0.0")
        self.assertEqual(canonical["version"], "2.1.0")

    def test_frozen_exam_resources_are_ready(self):
        self.assertEqual(validate_exam_resources(self.exam), [])

    def test_resource_validation_skips_officially_excluded_questions(self):
        exam = replace(
            self.exam,
            question_count=2,
            excluded_question_numbers=(2,),
            statistically_excluded_question_numbers=(),
        )
        master = {
            "questions": [
                {"question_number": 1, "alternatives": {letter: letter for letter in "ABCD"}},
                {"question_number": 2, "alternatives": {}},
            ]
        }
        with (
            patch("src.cli.main.load_exam_master", return_value=master),
            patch("src.cli.main.load_taxonomy", return_value={}),
            patch("src.cli.main.load_answer_key_adapter", return_value=object()),
            patch("src.cli.main.alternatives_text") as alternatives,
            patch("src.cli.main.resolve_images"),
        ):
            self.assertEqual(validate_exam_resources(exam), [])
        alternatives.assert_called_once_with(master["questions"][0])

    def test_2025_2_resources_are_ready(self):
        exam = get_exam_config("revalida_2025_2")
        self.assertEqual(validate_exam_resources(exam), [])

        master = load_exam_master(exam)
        self.assertEqual(len(master["questions"]), 100)
        self.assertEqual(len(exam.classifiable_question_numbers), 93)
        self.assertEqual(
            exam.excluded_question_numbers,
            (7, 9, 11, 43, 55, 85, 87),
        )

    def test_2025_2_answer_key_adapter_preserves_annulments(self):
        exam = get_exam_config("revalida_2025_2")
        adapter = load_answer_key_adapter(exam.answer_key_adapter)
        records = adapter.parse(
            exam.answer_key_pdf_path(Path(__file__).resolve().parents[1]),
            100,
        )

        self.assertEqual(len(records), 100)
        self.assertEqual(
            tuple(
                record["question_number"]
                for record in records
                if record["answer_status"] == "ANNULLED"
            ),
            exam.excluded_question_numbers,
        )

    def test_generic_answer_key_adapter_reads_2025_2(self):
        exam = get_exam_config("revalida_2025_2")
        records = GenericTextAnswerKeyAdapter().parse(
            exam.answer_key_pdf_path(Path(__file__).resolve().parents[1]),
            exam.question_count,
        )
        self.assertEqual(len(records), 100)
        self.assertEqual(records[0]["question_number"], 1)
        self.assertEqual(records[-1]["question_number"], 100)

    def test_dynamic_exam_configuration_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            configured = replace(
                self.exam,
                exam_id="revalida_2099_1",
                exam_year=2099,
                expected_canonical_counts=None,
            )
            save_exam_config(configured, root)
            loaded = get_exam_config(configured.exam_id, root)
            self.assertEqual(loaded, configured)

    def test_2025_2_staziamed_export_is_valid(self):
        root = Path(__file__).resolve().parents[1]
        result = validate_staziamed_package(
            root / "data/exports/staziamed/revalida_2025_2"
        )
        self.assertEqual(result["active_questions"], 93)
        self.assertEqual(result["all_questions"], 100)

    def test_export_resolves_legacy_bare_visual_filename(self):
        root = Path(__file__).resolve().parents[1]
        source = _resolve_visual_source(
            "q005_clinical_image_01.png",
            self.exam,
            root,
        )
        self.assertEqual(source.parent, self.exam.assets_dir(root))

    def test_local_auto_adjudicator_prefers_non_reviewed_pass(self):
        selected, reason = _choose_pass(
            {
                "pass1": {
                    "review_required": True,
                    "classification_confidence": 0.99,
                },
                "pass2": {
                    "review_required": False,
                    "classification_confidence": 0.90,
                },
            }
        )
        self.assertEqual(selected, "pass2")
        self.assertIn("sem sinalização", reason)

    def test_update_packet_accepts_text_and_pdf_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            import pymupdf

            path = Path(directory)
            (path / "diretriz.md").write_text(
                "Atualização clínica revisada.", encoding="utf-8"
            )
            pdf_path = path / "diretriz.pdf"
            document = pymupdf.open()
            page = document.new_page()
            page.insert_text((72, 72), "Recomendacao complementar em PDF.")
            document.save(pdf_path)
            document.close()
            packet, sources = load_update_packet(path)
        self.assertIn("Atualização clínica revisada", packet)
        self.assertIn("Recomendacao complementar em PDF", packet)
        self.assertEqual(sources, ["diretriz.md", "diretriz.pdf"])

    def test_novel_question_rejects_copy_of_official_stem(self):
        stem = (
            "Paciente adulto comparece ao serviço de emergência com quadro "
            "clínico progressivo e necessita da melhor conduta inicial disponível."
        )
        draft = NovelQuestionDraft(
            stem=stem,
            alternatives={
                "A": "Realizar a primeira conduta proposta.",
                "B": "Realizar a segunda conduta proposta.",
                "C": "Realizar a terceira conduta proposta.",
                "D": "Realizar a quarta conduta proposta.",
            },
            correct_answer="A",
            explanation=(
                "A primeira conduta é indicada porque atende ao risco clínico "
                "descrito e permite tratamento seguro e oportuno do paciente."
            ),
            clinical_decision="Selecionar a conduta inicial mais segura.",
            update_application="Aplicação direta da atualização clínica fornecida.",
            key_concepts=["avaliação clínica", "conduta inicial"],
        )
        with self.assertRaisesRegex(RuntimeError, "similaridade excessiva"):
            validate_novel_draft(draft, [stem])

    def test_automated_runner_executes_all_stages_without_real_api(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_dir = root / "entrada"
            input_dir.mkdir()
            report = {"exam_id": self.exam.exam_id}
            output_dir = root / "export"
            calls = []

            with (
                patch.object(
                    automation_runner,
                    "prepare_exam_folder",
                    return_value=(self.exam, report),
                ),
                patch.object(
                    automation_runner,
                    "_run_module",
                    side_effect=lambda module, arguments, project_root: calls.append(
                        (module, arguments, project_root)
                    ),
                ),
                patch.object(
                    automation_runner,
                    "export_staziamed_package",
                    return_value=(output_dir, {"active_questions": 100}),
                ),
            ):
                _, state, returned_dir = automation_runner.run_automated_pipeline(
                    input_dir,
                    root,
                    allow_openai=True,
                )

            self.assertEqual(len(calls), 6)
            self.assertEqual(state["status"], "PIPELINE_COMPLETED")
            self.assertEqual(returned_dir, output_dir)

    def test_local_validation_preserves_completed_pipeline_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_dir = root / "entrada"
            input_dir.mkdir()
            state_path = root / "data/runs" / f"{self.exam.exam_id}_pipeline.json"
            state_path.parent.mkdir(parents=True)
            state_path.write_text(
                json.dumps(
                    {
                        "exam_id": self.exam.exam_id,
                        "status": "PIPELINE_COMPLETED",
                        "stages": {
                            "intake": "COMPLETED",
                            "classify_pass1": "COMPLETED",
                            "staziamed_export": "COMPLETED",
                        },
                        "staziamed_output": "/tmp/export",
                    }
                ),
                encoding="utf-8",
            )

            with patch.object(
                automation_runner,
                "prepare_exam_folder",
                return_value=(self.exam, {"exam_id": self.exam.exam_id}),
            ):
                _, state, returned_dir = automation_runner.run_automated_pipeline(
                    input_dir,
                    root,
                    allow_openai=False,
                )

            self.assertEqual(state["status"], "PIPELINE_COMPLETED")
            self.assertEqual(state["stages"]["classify_pass1"], "COMPLETED")
            self.assertEqual(state["stages"]["staziamed_export"], "COMPLETED")
            self.assertNotIn("next_command", state)
            self.assertIsNone(returned_dir)

    def test_exam_resources_reject_missing_adapter(self):
        configured = replace(
            self.exam,
            answer_key_adapter="src.answer_key.adapter_inexistente",
        )
        errors = validate_exam_resources(configured)
        self.assertTrue(any("adapter" in error.lower() for error in errors))

    def test_configured_answer_key_adapter_implements_protocol(self):
        adapter = load_answer_key_adapter(self.exam.answer_key_adapter)
        self.assertTrue(adapter.adapter_id.startswith("revalida_2026_1"))

    def test_answer_key_contract_rejects_duplicates(self):
        records = [
            {"question_number": 1, "official_answer": "A"},
            {"question_number": 1, "official_answer": "B"},
        ]
        with self.assertRaisesRegex(RuntimeError, "sem ausências ou duplicações"):
            validate_answer_key_records(records, 2)

    def test_adjudication_dry_run_does_not_modify_frozen_file(self):
        root = Path(__file__).resolve().parents[1]
        path = self.exam.manual_adjudications_path(root)
        before = path.read_bytes()
        returned_path, output = set_adjudication(
            self.exam,
            root,
            1,
            "cognitive_task",
            "CHOOSE_INITIAL_TREATMENT",
            dry_run=True,
        )
        self.assertEqual(returned_path, path)
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(
            output["questions"]["1"]["cognitive_task"],
            "CHOOSE_INITIAL_TREATMENT",
        )

    def test_comparison_rejects_wrong_exam_metadata(self):
        path = self._json_file(
            {
                "exam_id": "outra_edicao",
                "source_dataset_version": self.exam.dataset_version,
                "classification_pass": 1,
                "questions": [],
            }
        )
        with self.assertRaisesRegex(RuntimeError, "exam_id incompatível"):
            load_comparison_pass(path, self.exam, 1)

    def test_checkpoint_rejects_wrong_pass(self):
        path = self._json_file(
            {
                "exam_id": self.exam.exam_id,
                "source_dataset_version": self.exam.dataset_version,
                "taxonomy_version": self.exam.canonical_taxonomy_version,
                "classification_pass": 2,
                "questions": [],
            }
        )
        with self.assertRaisesRegex(RuntimeError, "classification_pass"):
            load_existing(
                path,
                self.exam,
                1,
                self.exam.canonical_taxonomy_version,
            )

    def test_checkpoint_lock_rejects_concurrent_writer(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "checkpoint.json"
            first = acquire_output_lock(output)
            try:
                with self.assertRaisesRegex(RuntimeError, "Outra execução"):
                    acquire_output_lock(output)
            finally:
                first.close()

    def test_checkpoint_rejects_invalid_saved_record(self):
        dna = self._frozen_dna().model_dump()
        path = self._json_file(
            {
                "exam_id": self.exam.exam_id,
                "source_dataset_version": self.exam.dataset_version,
                "taxonomy_version": "2.0.0",
                "classification_pass": 1,
                "questions": [
                    {
                        "question_number": 1,
                        "dna": dna,
                        "validation_errors": ["NATURAL_LANGUAGE_NOT_PT_BR:topic"],
                    }
                ],
            }
        )
        with self.assertRaisesRegex(RuntimeError, "classificação inválida"):
            load_existing(path, self.exam, 1, "2.0.0")

    def test_validate_only_never_creates_openai_client(self):
        argv = [
            "classify_dna_all",
            "--exam-id",
            self.exam.exam_id,
            "--pass-number",
            "1",
            "--validate-only",
        ]
        with (
            patch.object(sys, "argv", argv),
            patch("src.classification.classify_dna_all.OpenAI") as client,
            patch.dict("os.environ", {}, clear=True),
            patch("sys.stdout", new_callable=io.StringIO) as stdout,
        ):
            classification_main()

        client.assert_not_called()
        self.assertIn("API OpenAI: não acessada", stdout.getvalue())

    def test_pilot_validation_never_loads_env_or_creates_client(self):
        for module in (pilot1, pilot2):
            with self.subTest(module=module.__name__):
                argv = [
                    module.__name__,
                    "--exam-id",
                    self.exam.exam_id,
                    "--validate-only",
                ]
                with (
                    patch.object(sys, "argv", argv),
                    patch.object(module, "load_dotenv") as dotenv,
                    patch.object(module, "OpenAI") as client,
                    patch("sys.stdout", new_callable=io.StringIO) as stdout,
                ):
                    module.main()

                dotenv.assert_not_called()
                client.assert_not_called()
                self.assertIn("API OpenAI: não acessada", stdout.getvalue())

    def test_question_dna_has_no_global_upper_number_limit(self):
        data = self._frozen_dna().model_dump()
        data["question_number"] = 101
        self.assertEqual(QuestionDNA.model_validate(data).question_number, 101)

    def test_canonical_builder_rejects_duplicate_questions(self):
        record = {"question_number": 1, "dna": {}}
        path = self._json_file(
            {
                "exam_id": self.exam.exam_id,
                "source_dataset_version": self.exam.dataset_version,
                "taxonomy_version": self.exam.classification_taxonomy_version,
                "classification_pass": 1,
                "questions": [record, record],
            }
        )
        with self.assertRaisesRegex(RuntimeError, "duplicados"):
            load_canonical_pass(path, self.exam, 1)

    def test_master_loader_validates_complete_numbering(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        relative_path = Path("master.json")
        configured = replace(
            self.exam,
            question_count=2,
            master_relative_path=relative_path,
        )
        (root / relative_path).write_text(
            json.dumps(
                {
                    "exam": {
                        "exam_id": configured.exam_id,
                        "dataset_version": configured.dataset_version,
                        "total_questions": 2,
                    },
                    "questions": [
                        {"question_number": 1},
                        {"question_number": 1},
                    ],
                }
            ),
            encoding="utf-8",
        )
        with self.assertRaisesRegex(RuntimeError, "sem duplicações"):
            load_exam_master(configured, root)

    def test_master_loader_accepts_frozen_exam(self):
        master = load_exam_master(self.exam)
        self.assertEqual(len(master["questions"]), self.exam.question_count)

    def test_required_image_must_exist(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / "ausente"
            question = {
                "question_number": 5,
                "visual": {"has_specific_assets": True},
            }
            with self.assertRaisesRegex(RuntimeError, "imagem obrigatória"):
                resolve_images(question, missing, missing)

    def test_all_frozen_required_images_resolve(self):
        master = load_exam_master(self.exam)
        required = [
            question
            for question in master["questions"]
            if question.get("visual", {}).get("has_specific_assets")
        ]
        self.assertTrue(required)
        for question in required:
            self.assertTrue(
                resolve_images(
                    question,
                    self.exam.assets_dir(Path(__file__).resolve().parents[1]),
                    self.exam.crops_dir(Path(__file__).resolve().parents[1]),
                )
            )

    def test_language_validator_rejects_clear_english(self):
        dna = self._frozen_dna().model_copy(
            update={
                "topic": "Migraine",
                "subtopic": "Preventive treatment",
            }
        )
        self.assertEqual(
            validate_natural_language_pt_br(dna),
            [
                "NATURAL_LANGUAGE_NOT_PT_BR:topic",
                "NATURAL_LANGUAGE_NOT_PT_BR:subtopic",
            ],
        )

    def test_language_validator_accepts_frozen_production(self):
        for pass_number in (1, 2):
            data = json.loads(
                self.exam.production_output_path(
                    Path(__file__).resolve().parents[1], pass_number
                ).read_text(encoding="utf-8")
            )
            for record in data["questions"]:
                dna = QuestionDNA.model_validate(record["dna"])
                self.assertEqual(validate_natural_language_pt_br(dna), [])

    def _frozen_dna(self):
        path = self.exam.production_output_path(
            Path(__file__).resolve().parents[1], 1
        )
        data = json.loads(path.read_text(encoding="utf-8"))
        return QuestionDNA.model_validate(data["questions"][0]["dna"])

    def _json_file(self, data):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "fixture.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path


if __name__ == "__main__":
    unittest.main()
