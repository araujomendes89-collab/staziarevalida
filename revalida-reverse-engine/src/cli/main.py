import json
import subprocess
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from src.classification.classify_dna_pilot import alternatives_text, resolve_images
from src.answer_key.adapters import load_answer_key_adapter
from src.classification.dna_validator import load_taxonomy
from src.config.exams import (
    PROJECT_ROOT,
    get_exam_config,
    list_exam_configs,
    load_exam_master,
)
from src.verification.adjudications import set_adjudication
from src.ingestion.build_exam_master import write_exam_master
from src.automation.intake import prepare_exam_folder
from src.automation.runner import run_automated_pipeline
from src.automation.status import reconcile_pipeline_state
from src.exports.staziamed import export_staziamed_package
from src.verification.auto_adjudicate import auto_adjudicate
from src.generation.novel_questions import generate_novel_questions
from src.analysis.find_twin_questions import find_twins
from src.analysis.topic_recurrence import write_recurrence_report
from src.automation.full_exam import run_complete_exam, validate_complete_exam
from src.exports.exam_pdf import build_exam_pdfs
from src.generation.full_exam import (
    run_full_exam_generation,
    run_library_reviews,
    run_parallel_full_exam_generation,
)
from src.psychometrics.calibration import create_response_template, calibrate_responses
from src.automation.dashboard import build_progress_dashboard
from src.automation.finalize import finalize_operation


app = typer.Typer(
    help="Revalida Reverse Engine"
)

console = Console()


def validate_exam_resources(exam):
    errors = []

    try:
        master = load_exam_master(exam, PROJECT_ROOT)
    except RuntimeError as exc:
        return [str(exc)]

    for path, version in (
        (
            exam.classification_taxonomy_path(PROJECT_ROOT),
            exam.classification_taxonomy_version,
        ),
        (
            exam.canonical_taxonomy_path(PROJECT_ROOT),
            exam.canonical_taxonomy_version,
        ),
    ):
        try:
            load_taxonomy(path, expected_version=version)
        except RuntimeError as exc:
            errors.append(str(exc))

    try:
        load_answer_key_adapter(exam.answer_key_adapter)
    except RuntimeError as exc:
        errors.append(str(exc))

    classifiable = set(exam.classifiable_question_numbers)
    for question in master["questions"]:
        if question["question_number"] not in classifiable:
            continue
        try:
            alternatives_text(question)
            resolve_images(
                question,
                asset_dir=exam.assets_dir(PROJECT_ROOT),
                crop_dir=exam.crops_dir(PROJECT_ROOT),
            )
        except RuntimeError as exc:
            errors.append(str(exc))

    return errors


@app.command("exams")
def exams():
    """Lista as edições configuradas e seus componentes."""
    table = Table(title="Edições configuradas")
    table.add_column("exam_id")
    table.add_column("Dataset")
    table.add_column("Questões", justify="right")
    table.add_column("Adapter de gabarito")

    for exam in list_exam_configs():
        table.add_row(
            exam.exam_id,
            exam.dataset_version,
            str(exam.question_count),
            exam.answer_key_adapter,
        )

    console.print(table)


@app.command("validate-exam")
def validate_exam(
    exam_id: str = typer.Argument(..., help="Identificador da edição"),
):
    """Valida a prontidão local de uma edição sem acessar APIs."""
    try:
        exam = get_exam_config(exam_id)
    except ValueError as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=2)

    errors = validate_exam_resources(exam)
    if errors:
        console.print(f"[bold red]Edição inválida:[/bold red] {exam.exam_id}")
        for error in errors:
            console.print(f"- {error}")
        raise typer.Exit(code=1)

    console.print(f"[bold green]Edição pronta:[/bold green] {exam.exam_id}")
    console.print(f"Questões: {exam.question_count}")
    console.print(f"Taxonomia de classificação: {exam.classification_taxonomy_version}")
    console.print(f"Taxonomia canônica: {exam.canonical_taxonomy_version}")
    console.print("API OpenAI: não acessada")


@app.command("extract-answer-key")
def extract_answer_key(
    exam_id: str = typer.Argument(..., help="Identificador da edição"),
    pdf: Path = typer.Argument(..., help="PDF oficial do gabarito"),
    output: Path = typer.Option(..., "--output", "-o", help="JSON de saída"),
):
    """Executa o adapter configurado para extrair um gabarito."""
    try:
        exam = get_exam_config(exam_id)
        adapter = load_answer_key_adapter(exam.answer_key_adapter)
        records = adapter.parse(pdf, exam.question_count)
    except (ValueError, RuntimeError) as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(
        json.dumps(records, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(output)
    console.print(f"[bold green]Gabarito extraído:[/bold green] {output}")
    console.print(f"Registros: {len(records)}")


@app.command("adjudicate")
def adjudicate(
    exam_id: str = typer.Argument(..., help="Identificador da edição"),
    question_number: int = typer.Argument(..., help="Número da questão"),
    field: str = typer.Argument(..., help="Campo controlado divergente"),
    value: str = typer.Argument(..., help="Valor canônico escolhido"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Valida sem gravar"),
):
    """Registra uma decisão manual validada contra fila e taxonomia."""
    try:
        exam = get_exam_config(exam_id)
        path, _ = set_adjudication(
            exam,
            PROJECT_ROOT,
            question_number,
            field,
            value,
            dry_run=dry_run,
        )
    except (ValueError, RuntimeError) as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)

    action = "validada sem gravação" if dry_run else "gravada"
    console.print(f"[bold green]Adjudicação {action}:[/bold green] Q{question_number:03d}")
    console.print(f"{field} = {value}")
    console.print(f"Arquivo: {path}")


@app.command("build-master")
def build_master(
    exam_id: str = typer.Argument(..., help="Identificador da edição"),
):
    """Constrói o master da edição a partir da prova e do adapter."""
    try:
        exam = get_exam_config(exam_id)
        path, dataset = write_exam_master(exam, PROJECT_ROOT)
    except (ValueError, RuntimeError) as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)

    console.print(f"[bold green]Master construído:[/bold green] {path}")
    console.print(f"Questões: {len(dataset['questions'])}")
    console.print(f"Excluídas: {dataset['verification']['excluded_questions']}")


@app.command("prepare-folder")
def prepare_folder(
    input_dir: Path = typer.Argument(..., help="Pasta contendo prova e gabarito"),
    force: bool = typer.Option(False, "--force", help="Substitui PDFs divergentes"),
):
    """Importa e verifica localmente uma pasta com dois PDFs."""
    try:
        exam, report = prepare_exam_folder(input_dir, PROJECT_ROOT, force=force)
    except RuntimeError as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)
    console.print(f"[bold green]Edição preparada:[/bold green] {exam.exam_id}")
    console.print(f"Questões: {report['question_count']}")
    console.print(f"Classificáveis: {report['classifiable_question_count']}")
    console.print(f"Anuladas: {report['excluded_question_numbers']}")
    console.print(f"Imagens: {report['visual_assets']}")
    console.print("API OpenAI: não acessada")


@app.command("auto-adjudicate")
def auto_adjudicate_command(
    exam_id: str = typer.Argument(..., help="Identificador da edição"),
    overwrite: bool = typer.Option(False, "--overwrite"),
):
    """Resolve localmente divergências ainda não adjudicadas."""
    try:
        exam = get_exam_config(exam_id)
        output, audit, decisions = auto_adjudicate(
            exam, PROJECT_ROOT, overwrite=overwrite
        )
    except (ValueError, RuntimeError) as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)
    console.print(f"[bold green]Adjudicação concluída:[/bold green] {len(decisions)}")
    console.print(f"Decisões: {output}")
    console.print(f"Auditoria: {audit}")


@app.command("export-staziamed")
def export_staziamed(
    exam_id: str = typer.Argument(..., help="Identificador da edição"),
):
    """Separa questões, correções e perfis para o StaziaMed."""
    try:
        exam = get_exam_config(exam_id)
        output_dir, manifest = export_staziamed_package(exam, PROJECT_ROOT)
    except (ValueError, RuntimeError) as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)
    console.print(f"[bold green]Pacote StaziaMed pronto:[/bold green] {output_dir}")
    console.print(f"Questões ativas: {manifest['active_questions']}")
    console.print(f"Questões anuladas: {manifest['annulled_questions']}")


@app.command("reconcile-status")
def reconcile_status(
    exam_id: str | None = typer.Option(
        None,
        "--exam-id",
        help="Edição específica; sem a opção, verifica todas as edições",
    ),
):
    """Valida produtos finais e corrige estados operacionais antigos."""
    try:
        exams_to_check = (
            (get_exam_config(exam_id),) if exam_id else list_exam_configs()
        )
        for exam in exams_to_check:
            path, state = reconcile_pipeline_state(exam, PROJECT_ROOT)
            active = state["staziamed_manifest"]["active_questions"]
            console.print(
                f"[bold green]Concluída:[/bold green] {exam.exam_id} "
                f"({active} questões ativas) — {path}"
            )
    except (ValueError, RuntimeError) as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)


@app.command("progress-dashboard")
def progress_dashboard_command():
    """Atualiza o painel local de progresso e retomada."""
    html_path, json_path, payload = build_progress_dashboard(
        PROJECT_ROOT / "data/processed/dashboard", PROJECT_ROOT
    )
    console.print(
        f"[bold green]Painel atualizado:[/bold green] "
        f"{payload['summary']['completed_exam_count']}/{payload['summary']['exam_count']} edições concluídas"
    )
    console.print(f"HTML: {html_path}")
    console.print(f"JSON: {json_path}")


@app.command("finalize-operation")
def finalize_operation_command():
    """Reconcilia estados e prepara painel e importação StaziaMed."""
    try:
        result = finalize_operation(PROJECT_ROOT)
    except (RuntimeError, OSError, json.JSONDecodeError) as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)
    summary = result["dashboard_summary"]
    manifest = result["import_manifest"]
    console.print(
        f"[bold green]Operação finalizada:[/bold green] "
        f"{summary['completed_exam_count']}/{summary['exam_count']} edições"
    )
    console.print(
        f"Pacote StaziaMed: {result['import_dir']} "
        f"({manifest['active_question_count']} questões ativas)"
    )
    console.print(f"Painel: {result['dashboard_html']}")


@app.command("automate")
def automate(
    input_dir: Path = typer.Argument(..., help="Pasta contendo prova e gabarito"),
    allow_openai: bool = typer.Option(
        False,
        "--allow-openai",
        help="Autoriza o envio das questões à OpenAI para os dois passes",
    ),
    force: bool = typer.Option(False, "--force", help="Substitui PDFs divergentes"),
    generate_count: int = typer.Option(
        0,
        "--generate-count",
        min=0,
        max=100,
        help="Quantidade de rascunhos inéditos a gerar",
    ),
    updates_dir: Path | None = typer.Option(
        None,
        "--updates-dir",
        help="Pasta com atualizações médicas .md, .txt ou .json",
    ),
    generation_target_b: float | None = typer.Option(
        None,
        "--generation-target-b",
        help="Dificuldade Rasch-alvo apenas para questões inéditas geradas",
    ),
    backend: str = typer.Option(
        "hybrid",
        "--backend",
        help="Motor: openai, local ou hybrid (padrão econômico)",
    ),
    local_model: str = typer.Option(
        "qwen3:8b",
        "--local-model",
        help="Modelo instalado no Ollama",
    ),
    local_vision_model: str = typer.Option(
        "qwen3-vl:8b-instruct",
        "--local-vision-model",
        help="Modelo Ollama usado somente nas questões com imagem",
    ),
    review_model: str = typer.Option(
        "gpt-5.6-luna",
        "--review-model",
        help="Modelo OpenAI usado somente na revisão híbrida",
    ),
    max_openai_reviews: int = typer.Option(
        40,
        "--max-openai-reviews",
        min=0,
        help="Teto de revisões pagas por execução",
    ),
):
    """Executa todo o pipeline reiniciável a partir de dois PDFs."""
    try:
        exam, state, output_dir = run_automated_pipeline(
            input_dir,
            PROJECT_ROOT,
            allow_openai=allow_openai,
            force=force,
            generate_count=generate_count,
            updates_dir=updates_dir,
            generation_target_b=generation_target_b,
            classification_backend=backend,
            local_model=local_model,
            local_vision_model=local_vision_model,
            review_model=review_model,
            max_openai_reviews=max_openai_reviews,
        )
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
        console.print(f"[bold red]Pipeline interrompido:[/bold red] {exc}")
        console.print("Os checkpoints foram preservados; repita o mesmo comando.")
        raise typer.Exit(code=1)
    console.print(f"Edição: {exam.exam_id}")
    console.print(f"Status: {state['status']}")
    if output_dir is not None:
        console.print(f"[bold green]Saída StaziaMed:[/bold green] {output_dir}")


@app.command("generate-questions")
def generate_questions(
    exam_id: str = typer.Argument(..., help="Edição usada como perfil da banca"),
    count: int = typer.Option(..., "--count", min=1, max=100),
    updates_dir: Path = typer.Option(..., "--updates-dir"),
    target_b: float | None = typer.Option(
        None,
        "--target-b",
        help="Dificuldade Rasch-alvo editorial; não é calibração empírica",
    ),
    allow_openai: bool = typer.Option(
        False,
        "--allow-openai",
        help="Autoriza enviar perfil agregado e atualizações à OpenAI",
    ),
):
    """Gera rascunhos inéditos, atualizados e separados para revisão."""
    if not allow_openai:
        console.print(
            "[bold red]Erro:[/bold red] use --allow-openai para autorizar "
            "o envio do perfil agregado e das atualizações."
        )
        raise typer.Exit(code=2)
    try:
        exam = get_exam_config(exam_id)
        path, generated = generate_novel_questions(
            exam,
            count,
            updates_dir,
            PROJECT_ROOT,
            target_difficulty_b=target_b,
        )
    except (ValueError, RuntimeError) as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)
    console.print(f"[bold green]Rascunhos gerados:[/bold green] {len(generated)}")
    console.print(f"Arquivo: {path}")


@app.command("find-twins")
def find_twins_command(
    theme: str | None = typer.Option(None, "--theme", help="Tema ou subárea"),
    threshold: float = typer.Option(0.68, "--threshold", min=0.0, max=1.0),
    limit: int = typer.Option(200, "--limit", min=1),
    output: Path = typer.Option(
        PROJECT_ROOT / "data/processed/reports/twin_questions.json", "--output"
    ),
):
    """Localiza questões gêmeas entre edições, sem acessar APIs."""
    pairs, candidates = find_twins(theme, threshold, limit)
    payload = {
        "schema_version": "revalida.twin-questions.v1",
        "historical_usage": "COMPARISON_AND_REVERSE_ENGINEERING_ONLY",
        "theme_filter": theme,
        "threshold": threshold,
        "candidate_questions": candidates,
        "pairs": pairs,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    console.print(f"[bold green]Pares encontrados:[/bold green] {len(pairs)}")
    console.print(f"Arquivo: {output}")


@app.command("topic-recurrence")
def topic_recurrence_command(
    limit: int = typer.Option(100, "--limit", min=1),
    output_dir: Path = typer.Option(
        PROJECT_ROOT / "data/processed/reports", "--output-dir"
    ),
):
    """Calcula recorrência de áreas, temas e conceitos entre edições."""
    try:
        paths = write_recurrence_report(output_dir, PROJECT_ROOT, limit)
    except (RuntimeError, OSError, json.JSONDecodeError) as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)
    json_path, csv_path, markdown_path, report = paths
    console.print(
        f"[bold green]Recorrência calculada:[/bold green] "
        f"{report['source_question_count']} questões / {report['source_exam_count']} edições"
    )
    console.print(f"JSON: {json_path}")
    console.print(f"CSV: {csv_path}")
    console.print(f"Relatório: {markdown_path}")


@app.command("generate-full-exam")
def generate_full_exam_command(
    updates_dir: Path = typer.Option(
        ...,
        "--updates-dir",
        help="PDF ou pasta com fontes médicas locais atualizadas",
    ),
    output_name: str = typer.Option("simulado_001", "--output-name"),
    count: int = typer.Option(100, "--count", min=1, max=100),
    theme: str | None = typer.Option(None, "--theme"),
    level: str | None = typer.Option(None, "--level"),
    local_model: str = typer.Option("qwen3:8b", "--local-model"),
    local_base_url: str = typer.Option("http://127.0.0.1:11434", "--local-base-url"),
    generation_backend: str = typer.Option("local", "--generation-backend"),
    generation_model: str | None = typer.Option(None, "--generation-model"),
    review_backend: str = typer.Option("local", "--review-backend"),
    review_model: str | None = typer.Option(None, "--full-review-model"),
    review_workers: int = typer.Option(
        1, "--review-workers", min=1, max=8,
        help="Revisões simultâneas; use 1 no modelo local e até 4 na Luna",
    ),
    allow_openai: bool = typer.Option(
        False,
        "--allow-openai",
        help="Autoriza o envio do blueprint e das fontes à Luna",
    ),
    validate_only: bool = typer.Option(
        False,
        "--validate-only",
        help="Valida blueprint, filtros e fontes sem iniciar o modelo",
    ),
):
    """Gera, revisa e monta os três PDFs em um único comando local."""
    try:
        if validate_only:
            validation = validate_complete_exam(
                updates_dir,
                output_name,
                count=count,
                theme=theme,
                level=level,
                local_model=local_model,
                generation_backend=generation_backend,
                generation_model=generation_model,
                root=PROJECT_ROOT,
            )
            console.print("[bold green]Entrada válida.[/bold green]")
            console.print(f"Questões planejadas: {validation['question_count']}")
            console.print(f"Fontes locais: {validation['source_count']}")
            console.print(f"Saída prevista: {validation['output_dir']}")
            console.print("Modelo local: não iniciado")
            console.print("API OpenAI: não acessada")
            return
        output, manifest = run_complete_exam(
            updates_dir,
            output_name,
            count=count,
            theme=theme,
            level=level,
            local_model=local_model,
            local_base_url=local_base_url,
            generation_backend=generation_backend,
            generation_model=generation_model,
            review_backend=review_backend,
            review_model=review_model,
            review_workers=review_workers,
            allow_openai=allow_openai,
            root=PROJECT_ROOT,
        )
    except RuntimeError as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)
    console.print(f"[bold green]Simulado processado:[/bold green] {output}")
    console.print(f"Status: {manifest['status']}")


@app.command("review-with-library")
def review_with_library_command(
    reviewed_exam: Path = typer.Argument(..., help="reviewed_exam.json do simulado"),
    sources_dir: Path = typer.Option(..., "--sources-dir", help="Pasta com apostilas e atualizações"),
    output_dir: Path | None = typer.Option(None, "--output-dir"),
    model: str = typer.Option("gpt-5.6-luna", "--model"),
    backend: str = typer.Option("openai", "--backend"),
    workers: int = typer.Option(4, "--workers", min=1, max=8),
    all_questions: bool = typer.Option(False, "--all-questions"),
    allow_openai: bool = typer.Option(False, "--allow-openai"),
):
    """Revisa itens pendentes usando recuperação seletiva das apostilas."""
    if backend == "openai" and not allow_openai:
        console.print("[bold red]Erro:[/bold red] Use --allow-openai para autorizar o envio dos trechos recuperados.")
        raise typer.Exit(code=1)
    output_dir = output_dir or reviewed_exam.parent / "revisao_com_apostilas"
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        reviewed_path, result = run_library_reviews(
            reviewed_exam,
            sources_dir,
            output_path=output_dir / "reviewed_exam.json",
            model=model,
            backend=backend,
            root=PROJECT_ROOT,
            workers=workers,
            pending_only=not all_questions,
        )
        pdfs = build_exam_pdfs(reviewed_path, output_dir)
        status = (
            "READY_FOR_HUMAN_APPROVAL"
            if result["summary"]["revision_required"] == 0
            else "REVISION_REQUIRED"
        )
        manifest = {
            "schema_version": "staziamed.library-review-manifest.v1",
            "status": status,
            "source_library_files": result["source_library_files"],
            "review_summary": result["summary"],
            "reviewed_exam": str(reviewed_path),
            "pdfs": [str(path) for path in pdfs],
        }
        (output_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except (RuntimeError, OSError, json.JSONDecodeError) as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)
    console.print(f"[bold green]Revisão com apostilas concluída:[/bold green] {output_dir}")
    console.print(f"Aprovadas: {result['summary']['approved_for_pdf']}")
    console.print(f"Pendentes: {result['summary']['revision_required']}")
    console.print(f"Status: {status}")


@app.command("generate-exam-draft")
def generate_exam_draft_command(
    sources: Path = typer.Option(..., "--sources", help="Fonte compacta de atualizações"),
    output_name: str = typer.Option(..., "--output-name"),
    count: int = typer.Option(100, "--count", min=1, max=100),
    model: str = typer.Option("gpt-5.6-luna", "--model"),
    backend: str = typer.Option("openai", "--backend"),
    workers: int = typer.Option(1, "--workers", min=1, max=8),
    allow_openai: bool = typer.Option(False, "--allow-openai"),
):
    """Gera somente o rascunho; a revisão pode usar a biblioteca completa."""
    if backend == "openai" and not allow_openai:
        console.print("[bold red]Erro:[/bold red] Use --allow-openai para autorizar o envio da fonte.")
        raise typer.Exit(code=1)
    output_dir = (
        PROJECT_ROOT / "data/exports/generated/revalida_enamed_2026_2" / output_name
    )
    try:
        path, exam = run_parallel_full_exam_generation(
            sources,
            output_dir,
            count=count,
            model=model,
            backend=backend,
            root=PROJECT_ROOT,
            workers=workers,
        )
    except (RuntimeError, OSError, json.JSONDecodeError) as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)
    console.print(f"[bold green]Rascunho concluído:[/bold green] {path}")
    console.print(f"Questões: {len(exam['questions'])}")


@app.command("build-exam-pdfs")
def build_exam_pdfs_command(
    reviewed_exam: Path = typer.Argument(...),
    output_dir: Path = typer.Option(..., "--output-dir"),
):
    """Monta prova, gabarito e correção a partir de uma prova revisada."""
    try:
        paths = build_exam_pdfs(reviewed_exam, output_dir)
    except RuntimeError as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)
    for path in paths:
        console.print(f"[bold green]PDF:[/bold green] {path}")


@app.command("response-template")
def response_template_command(
    question_bank: Path = typer.Argument(...),
    output: Path = typer.Option(..., "--output"),
):
    """Cria o CSV padrão para importar respostas de candidatos."""
    try:
        path = create_response_template(question_bank, output)
    except (RuntimeError, OSError, json.JSONDecodeError) as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)
    console.print(f"[bold green]Modelo de respostas:[/bold green] {path}")


@app.command("calibrate-rasch")
def calibrate_rasch_command(
    question_bank: Path = typer.Argument(...),
    responses: Path = typer.Argument(...),
    output: Path = typer.Option(..., "--output"),
    cut_theta: float = typer.Option(-0.40, "--cut-theta"),
    minimum_sample: int = typer.Option(200, "--minimum-sample", min=30),
):
    """Calcula b, ajuste e informação Rasch usando respostas reais."""
    try:
        result = calibrate_responses(
            question_bank, responses, output, cut_theta, minimum_sample
        )
    except (RuntimeError, OSError, json.JSONDecodeError, ValueError) as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)
    console.print(f"[bold green]Calibração concluída:[/bold green] {output}")
    console.print(f"Amostra: {result['sample_n']}")


@app.command()
def inspect(
    pdf: Path = typer.Argument(
        ...,
        help="Caminho do PDF a ser analisado"
    )
):
    """
    Inspeciona a estrutura básica de um PDF.
    """
    from src.extraction.pdf_reader import read_pdf

    try:
        data = read_pdf(pdf)
    except Exception as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)

    console.print()
    console.print(
        f"[bold green]PDF carregado com sucesso[/bold green]"
    )

    console.print(f"Arquivo: {data.filename}")
    console.print(f"Páginas: {data.page_count}")
    console.print(
        f"Caracteres extraídos: {data.total_characters:,}"
    )
    console.print(f"Imagens detectadas: {data.total_images}")

    table = Table(title="Análise por página")

    table.add_column("Página", justify="right")
    table.add_column("Caracteres", justify="right")
    table.add_column("Imagens", justify="right")

    for page in data.pages:
        table.add_row(
            str(page.page_number),
            str(page.char_count),
            str(page.image_count),
        )

    console.print(table)


@app.command("dump-pages")
def dump_pages(
    pdf: Path = typer.Argument(
        ...,
        help="Caminho do PDF"
    ),
    output: Path = typer.Option(
        Path("data/processed/pages.json"),
        "--output",
        "-o",
        help="Arquivo JSON de saída"
    ),
):
    """
    Extrai todas as páginas preservando página, texto e imagens.
    """
    from src.extraction.pdf_reader import read_pdf

    try:
        data = read_pdf(pdf)
    except Exception as exc:
        console.print(f"[bold red]Erro:[/bold red] {exc}")
        raise typer.Exit(code=1)

    output.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with output.open(
        "w",
        encoding="utf-8"
    ) as file:
        json.dump(
            data.model_dump(),
            file,
            ensure_ascii=False,
            indent=2,
        )

    console.print(
        f"[bold green]Extração concluída[/bold green]"
    )
    console.print(f"Arquivo gerado: {output}")


if __name__ == "__main__":
    app()
