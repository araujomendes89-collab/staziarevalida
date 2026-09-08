"""Configurações compartilhadas do projeto."""

from src.config.exams import (
    PROJECT_ROOT,
    ExamConfig,
    exam_config_from_dict,
    exam_config_to_dict,
    get_exam_config,
    list_exam_configs,
    load_exam_master,
    save_exam_config,
)

__all__ = [
    "PROJECT_ROOT",
    "ExamConfig",
    "exam_config_from_dict",
    "exam_config_to_dict",
    "get_exam_config",
    "list_exam_configs",
    "load_exam_master",
    "save_exam_config",
]
