"""Configuração dos artefatos de cada edição do Revalida."""

import json
from dataclasses import asdict
from dataclasses import dataclass
from pathlib import Path


DEFAULT_EXAM_ID = "revalida_2026_1"
PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class ExamConfig:
    exam_id: str
    dataset_version: str
    question_count: int
    master_relative_path: Path
    assets_relative_dir: Path
    crops_relative_dir: Path
    classification_taxonomy_relative_path: Path
    classification_taxonomy_version: str
    canonical_taxonomy_relative_path: Path
    canonical_taxonomy_version: str
    answer_key_adapter: str
    exam_family: str = "REVALIDA"
    exam_name: str = ""
    exam_year: int = 0
    exam_edition: int = 0
    exam_stage: str = "FIRST_PHASE"
    booklet: int = 1
    question_pdf_relative_path: Path | None = None
    answer_key_pdf_relative_path: Path | None = None
    question_start_page: int = 3
    question_end_page: int = 26
    api_max_retries: int = 2
    api_timeout_seconds: float = 120.0
    excluded_question_numbers: tuple[int, ...] = ()
    statistically_excluded_question_numbers: tuple[int, ...] = ()
    expected_canonical_counts: tuple[int, int, int] | None = None

    @property
    def classifiable_question_numbers(self) -> tuple[int, ...]:
        excluded = set(self.excluded_question_numbers)
        return tuple(
            number
            for number in range(1, self.question_count + 1)
            if number not in excluded
        )

    def master_path(self, root: Path) -> Path:
        return root / self.master_relative_path

    def assets_dir(self, root: Path) -> Path:
        return root / self.assets_relative_dir

    def crops_dir(self, root: Path) -> Path:
        return root / self.crops_relative_dir

    def production_output_path(self, root: Path, pass_number: int) -> Path:
        return (
            root
            / "data/processed/dna/production"
            / f"{self.exam_id}_dna_v2_pass{pass_number}_final.json"
        )

    def production_dir(self, root: Path) -> Path:
        return root / "data/processed/dna/production"

    def agreement_report_path(self, root: Path) -> Path:
        return self.production_dir(root) / f"{self.exam_id}_dna_v2_agreement_final.json"

    def adjudication_queue_path(self, root: Path) -> Path:
        return self.production_dir(root) / f"{self.exam_id}_dna_v2_adjudication_queue.json"

    def manual_adjudications_path(self, root: Path) -> Path:
        return self.production_dir(root) / f"{self.exam_id}_dna_v2_1_manual_adjudications.json"

    def canonical_output_path(self, root: Path) -> Path:
        return self.production_dir(root) / f"{self.exam_id}_dna_canonical_v1.json"

    def divergence_inspection_path(self, root: Path) -> Path:
        return self.production_dir(root) / f"{self.exam_id}_dna_v2_divergence_inspection.json"

    def classification_taxonomy_path(self, root: Path) -> Path:
        return root / self.classification_taxonomy_relative_path

    def canonical_taxonomy_path(self, root: Path) -> Path:
        return root / self.canonical_taxonomy_relative_path

    def question_pdf_path(self, root: Path) -> Path:
        if self.question_pdf_relative_path is None:
            raise RuntimeError(f"PDF da prova não configurado para {self.exam_id}.")
        return root / self.question_pdf_relative_path

    def answer_key_pdf_path(self, root: Path) -> Path:
        if self.answer_key_pdf_relative_path is None:
            raise RuntimeError(f"PDF do gabarito não configurado para {self.exam_id}.")
        return root / self.answer_key_pdf_relative_path

    def pilot_output_path(self, root: Path, pass_number: int) -> Path:
        return (
            root
            / "data/processed/dna"
            / f"{self.exam_id}_dna_pilot_v2_pass{pass_number}_q001_q005.json"
        )

    def pilot_agreement_path(self, root: Path) -> Path:
        return (
            root
            / "data/processed/dna"
            / f"{self.exam_id}_dna_pilot_v2_agreement.json"
        )

    def matrix_dna_output_path(self, root: Path, pass_number: int) -> Path:
        return (
            root
            / "data/processed/dna/matrix_v1"
            / f"{self.exam_id}_matrix_dna_v1_pass{pass_number}.json"
        )


EXAMS = {
    DEFAULT_EXAM_ID: ExamConfig(
        exam_id=DEFAULT_EXAM_ID,
        dataset_version="1.2.0",
        question_count=100,
        master_relative_path=Path(
            "data/processed/revalida_2026_1_master_v1_2.json"
        ),
        assets_relative_dir=Path(
            "data/processed/visual_assets_v2/revalida_2026_1"
        ),
        crops_relative_dir=Path(
            "data/processed/question_crops/revalida_2026_1"
        ),
        classification_taxonomy_relative_path=Path(
            "data/taxonomy/revalida_taxonomy_v2.json"
        ),
        classification_taxonomy_version="2.0.0",
        canonical_taxonomy_relative_path=Path(
            "data/taxonomy/revalida_taxonomy_v2_1.json"
        ),
        canonical_taxonomy_version="2.1.0",
        answer_key_adapter="src.answer_key.adapters.revalida_2026_1",
        exam_name="Revalida INEP 2026/1",
        exam_year=2026,
        exam_edition=1,
        question_pdf_relative_path=Path(
            "data/raw/provas/revalida_2026_1_caderno_1.pdf"
        ),
        answer_key_pdf_relative_path=Path(
            "data/raw/gabaritos/2026_1_gabarito_definitivo_caderno1.pdf"
        ),
        expected_canonical_counts=(75, 25, 34),
    ),
    "revalida_2025_2": ExamConfig(
        exam_id="revalida_2025_2",
        dataset_version="1.0.0",
        question_count=100,
        master_relative_path=Path(
            "data/processed/revalida_2025_2_master_v1_0.json"
        ),
        assets_relative_dir=Path(
            "data/processed/visual_assets_v2/revalida_2025_2"
        ),
        crops_relative_dir=Path(
            "data/processed/question_crops/revalida_2025_2"
        ),
        classification_taxonomy_relative_path=Path(
            "data/taxonomy/revalida_taxonomy_v2.json"
        ),
        classification_taxonomy_version="2.0.0",
        canonical_taxonomy_relative_path=Path(
            "data/taxonomy/revalida_taxonomy_v2_1.json"
        ),
        canonical_taxonomy_version="2.1.0",
        answer_key_adapter="src.answer_key.adapters.revalida_2025_2",
        exam_name="Revalida INEP 2025/2",
        exam_year=2025,
        exam_edition=2,
        question_pdf_relative_path=Path(
            "data/raw/provas/revalida_2025_2_caderno_1.pdf"
        ),
        answer_key_pdf_relative_path=Path(
            "data/raw/gabaritos/revalida_2025_2_gabarito_caderno_1.pdf"
        ),
        excluded_question_numbers=(7, 9, 11, 43, 55, 85, 87),
    ),
}


DYNAMIC_EXAMS_DIR = Path("data/config/exams")


def _path_or_none(value):
    return Path(value) if value is not None else None


def exam_config_from_dict(data: dict) -> ExamConfig:
    required = {
        "exam_id",
        "dataset_version",
        "question_count",
        "master_relative_path",
        "assets_relative_dir",
        "crops_relative_dir",
        "classification_taxonomy_relative_path",
        "classification_taxonomy_version",
        "canonical_taxonomy_relative_path",
        "canonical_taxonomy_version",
        "answer_key_adapter",
    }
    missing = sorted(required - set(data))
    if missing:
        raise RuntimeError(
            "Configuração de edição incompleta; campos ausentes: "
            + ", ".join(missing)
        )

    values = dict(data)
    for field in (
        "master_relative_path",
        "assets_relative_dir",
        "crops_relative_dir",
        "classification_taxonomy_relative_path",
        "canonical_taxonomy_relative_path",
    ):
        values[field] = Path(values[field])
    for field in ("question_pdf_relative_path", "answer_key_pdf_relative_path"):
        values[field] = _path_or_none(values.get(field))
    values["excluded_question_numbers"] = tuple(
        values.get("excluded_question_numbers", ())
    )
    values["statistically_excluded_question_numbers"] = tuple(
        values.get("statistically_excluded_question_numbers", ())
    )
    expected_counts = values.get("expected_canonical_counts")
    if expected_counts is not None:
        values["expected_canonical_counts"] = tuple(expected_counts)
    return ExamConfig(**values)


def exam_config_to_dict(exam: ExamConfig) -> dict:
    data = asdict(exam)
    for key, value in tuple(data.items()):
        if isinstance(value, Path):
            data[key] = str(value)
        elif isinstance(value, tuple):
            data[key] = list(value)
    return data


def dynamic_exam_path(exam_id: str, root: Path = PROJECT_ROOT) -> Path:
    return root / DYNAMIC_EXAMS_DIR / f"{exam_id}.json"


def save_exam_config(exam: ExamConfig, root: Path = PROJECT_ROOT) -> Path:
    if exam.exam_id in EXAMS:
        raise RuntimeError(
            f"A edição interna {exam.exam_id} não pode ser sobrescrita."
        )
    path = dynamic_exam_path(exam.exam_id, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(exam_config_to_dict(exam), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(path)
    return path


def load_dynamic_exam_configs(root: Path = PROJECT_ROOT) -> dict[str, ExamConfig]:
    directory = root / DYNAMIC_EXAMS_DIR
    if not directory.is_dir():
        return {}
    configs = {}
    for path in sorted(directory.glob("*.json")):
        if path.name.startswith("._"):
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            exam = exam_config_from_dict(data)
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            raise RuntimeError(f"Configuração de edição inválida: {path}") from exc
        if exam.exam_id != path.stem:
            raise RuntimeError(f"{path}: exam_id deve corresponder ao nome do arquivo.")
        if exam.exam_id in EXAMS or exam.exam_id in configs:
            raise RuntimeError(f"Configuração duplicada para {exam.exam_id}.")
        configs[exam.exam_id] = exam
    return configs


def get_exam_config(exam_id: str, root: Path = PROJECT_ROOT) -> ExamConfig:
    if exam_id in EXAMS:
        return EXAMS[exam_id]
    dynamic = load_dynamic_exam_configs(root)
    if exam_id in dynamic:
        return dynamic[exam_id]
    available = ", ".join(sorted(set(EXAMS) | set(dynamic)))
    raise ValueError(
        f"Edição desconhecida: {exam_id!r}. "
        f"Edições configuradas: {available}."
    )


def list_exam_configs(root: Path = PROJECT_ROOT) -> tuple[ExamConfig, ...]:
    combined = dict(EXAMS)
    combined.update(load_dynamic_exam_configs(root))
    return tuple(combined[exam_id] for exam_id in sorted(combined))


def load_exam_master(exam: ExamConfig, root: Path = PROJECT_ROOT) -> dict:
    path = exam.master_path(root)
    if not path.is_file():
        raise RuntimeError(
            f"Dataset master não encontrado para {exam.exam_id}: {path}"
        )

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Dataset master contém JSON inválido: {path}") from exc

    metadata = data.get("exam")
    if not isinstance(metadata, dict):
        raise RuntimeError(f"{path}: metadados 'exam' ausentes ou inválidos.")
    if metadata.get("exam_id") != exam.exam_id:
        raise RuntimeError(f"{path}: exam_id incompatível.")
    if metadata.get("dataset_version") != exam.dataset_version:
        raise RuntimeError(f"{path}: versão do dataset incompatível.")
    if metadata.get("total_questions") != exam.question_count:
        raise RuntimeError(f"{path}: total_questions incompatível.")

    questions = data.get("questions")
    if not isinstance(questions, list):
        raise RuntimeError(f"{path}: lista 'questions' ausente ou inválida.")

    try:
        numbers = [int(question["question_number"]) for question in questions]
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError(f"{path}: question_number ausente ou inválido.") from exc

    expected = list(range(1, exam.question_count + 1))
    if sorted(numbers) != expected:
        raise RuntimeError(
            f"{path}: questões devem corresponder exatamente a "
            f"Q001–Q{exam.question_count:03d}, sem duplicações."
        )

    excluded = set(exam.excluded_question_numbers)
    statistically_excluded = set(exam.statistically_excluded_question_numbers)
    if not statistically_excluded.issubset(excluded):
        raise RuntimeError(
            f"{path}: exclusões estatísticas devem integrar excluded_question_numbers."
        )
    for question in questions:
        number = int(question["question_number"])
        answer = question.get("official_answer")
        status = question.get("answer_status")
        if number in excluded:
            expected_status = (
                "EXCLUDED_STATISTICAL"
                if number in statistically_excluded
                else "ANNULLED"
            )
            expected_answer = (
                "EXCLUÍDA" if number in statistically_excluded else "ANULADA"
            )
            if status != expected_status or answer != expected_answer:
                raise RuntimeError(
                    f"{path}: Q{number:03d} deveria estar marcada como "
                    f"{expected_status}."
                )
        elif status != "VALID" or answer not in {"A", "B", "C", "D"}:
            raise RuntimeError(
                f"{path}: Q{number:03d} não possui gabarito válido."
            )

    return data
