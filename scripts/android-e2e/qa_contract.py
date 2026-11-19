"""Assertions, result classification, metadata and PII redaction for Android E2E."""
from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


class CaseStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    WARN = "WARN"
    BLOCKED = "BLOCKED"
    NOT_TESTED = "NOT_TESTED"


@dataclass(frozen=True)
class CaseResult:
    case_id: str
    status: CaseStatus
    summary: str
    evidence: str = ""


class VisibleUiError(AssertionError):
    pass


ERROR_PATTERNS = (
    re.compile(r"(?i)\bno se pudo (?:cargar|obtener|guardar|validar|abrir)\b"),
    re.compile(r"(?i)\bno fue posible\b"),
    re.compile(r"(?i)\b(?:error|erro)\s*[:：-]"),
    re.compile(r"(?i)\b(?:failed to|unable to load|request failed|load failed)\b"),
    re.compile(r"(?i)\b(?:erro ao|não foi possível|falha ao|permissão negada|acesso negado)\b"),
    re.compile(r"(?i)\b(?:access denied|permission denied|could not load)\b"),
)


def visible_ui_errors(screen_text: str) -> list[str]:
    return [
        redact_text(line.strip())
        for line in screen_text.splitlines()
        if line.strip() and any(pattern.search(line) for pattern in ERROR_PATTERNS)
    ]


def assert_no_visible_error(screen_text: str) -> None:
    errors = visible_ui_errors(screen_text)
    if errors:
        raise VisibleUiError("Visible UI error: " + " | ".join(errors))


def evaluate_patient_detail(screen_text: str, patient_data_rendered: bool) -> CaseResult:
    evidence = redact_text(screen_text)
    try:
        assert_no_visible_error(screen_text)
    except VisibleUiError as error:
        return CaseResult(
            "TC04B_Patient_Detail_2x",
            CaseStatus.FAIL,
            str(error),
            evidence=evidence,
        )
    if not patient_data_rendered:
        return CaseResult(
            "TC04B_Patient_Detail_2x",
            CaseStatus.WARN,
            "No visible error, but authorized patient data was not verified.",
            evidence=evidence,
        )
    return CaseResult(
        "TC04B_Patient_Detail_2x",
        CaseStatus.PASS,
        "Patient detail rendered and no visible UI error was found.",
        evidence=evidence,
    )


def evaluate_emission_flow(
    case_id: str,
    *,
    selector_opened: bool,
    submission_attempted: bool,
    persistence_verified: bool,
) -> CaseResult:
    if submission_attempted and persistence_verified:
        return CaseResult(case_id, CaseStatus.PASS, "Emission and persistence verified.")
    if submission_attempted:
        return CaseResult(case_id, CaseStatus.FAIL, "Submission attempted but persistence was not verified.")
    if selector_opened:
        return CaseResult(
            case_id,
            CaseStatus.NOT_TESTED,
            "Patient selector opened; issuance and persistence were not tested.",
        )
    return CaseResult(case_id, CaseStatus.BLOCKED, "The issuance flow could not be entered.")


def evaluate_navigation_case(
    visited_tabs: Sequence[str],
    *,
    required_tabs: Sequence[str] = ("Home", "Mensajes", "Agenda", "Pacientes", "Perfil"),
    performance_metrics: Mapping[str, Any] | None = None,
) -> tuple[CaseResult, CaseStatus]:
    case_id = "TC06_Repeated_Tab_Navigation"
    missing = [tab for tab in required_tabs if tab not in visited_tabs]
    result = (
        CaseResult(case_id, CaseStatus.FAIL, "Tabs not reached: " + ", ".join(missing))
        if missing
        else CaseResult(
            case_id,
            CaseStatus.PASS,
            "Repeated navigation across five tabs completed; this is not a performance stress test.",
        )
    )
    required_metrics = ("memory_mb", "cpu_percent", "anr_count", "crash_count", "network_errors")
    metrics_verified = bool(performance_metrics) and all(key in performance_metrics for key in required_metrics)
    return result, CaseStatus.PASS if metrics_verified else CaseStatus.NOT_TESTED


def collect_metadata(
    *,
    commit_sha: str | None = None,
    apk_version: str | None = None,
    device: str | None = None,
    resolution: str | None = None,
    locale: str | None = None,
) -> dict[str, str | bool]:
    values = {
        "commit_sha": commit_sha or os.getenv("GITHUB_SHA") or "unknown",
        "apk_version": apk_version or os.getenv("APK_VERSION") or "unknown",
        "device": device or os.getenv("ANDROID_DEVICE_MODEL") or "unknown",
        "resolution": resolution or os.getenv("ANDROID_RESOLUTION") or "unknown",
        "locale": locale or os.getenv("ANDROID_LOCALE") or "unknown",
    }
    return {**values, "metadata_complete": all(value != "unknown" for value in values.values())}


_EMAIL_RE = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
_CPF_RE = re.compile(r"(?<!\d)\d{3}[.\s]?\d{3}[.\s]?\d{3}-?\d{2}(?!\d)")
_LABELLED_ID_RE = re.compile(r"(?i)\b(cpf|dni|documento|rg)\s*[:=#-]?\s*([0-9][0-9./-]{5,13})")
_LABELLED_PHONE_RE = re.compile(r"(?i)\b(phone|tel[eé]fono|telefone|tel)\s*[:=]\s*([+()0-9][0-9() .-]{5,})")
_PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})[ .-]?\d{4,5}[ .-]?\d{4}(?!\w)")
_LONG_DIGITS_RE = re.compile(r"(?<!\d)\d{10,13}(?!\d)")


def redact_text(value: str) -> str:
    text = _EMAIL_RE.sub("[EMAIL REDACTED]", value)
    text = _LABELLED_ID_RE.sub(lambda match: f"{match.group(1)}: [ID REDACTED]", text)
    text = _LABELLED_PHONE_RE.sub(lambda match: f"{match.group(1)}: [PHONE REDACTED]", text)
    text = _CPF_RE.sub("[CPF REDACTED]", text)
    text = _PHONE_RE.sub("[PHONE REDACTED]", text)
    return _LONG_DIGITS_RE.sub("[PHONE/ID REDACTED]", text)


def redact_payload(value: Any) -> Any:
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, Mapping):
        return {str(key): redact_payload(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [redact_payload(item) for item in value]
    return value


def redact_screenshot(
    image_path: str | Path,
    sensitive_regions: Iterable[tuple[int, int, int, int]],
    output_path: str | Path | None = None,
) -> Path:
    """Permanently black out PII rectangles before exporting runner screenshots."""
    try:
        from PIL import Image, ImageDraw
    except ImportError as error:
        raise RuntimeError("Install scripts/android-e2e/requirements.txt to redact screenshots.") from error

    source = Path(image_path)
    destination = Path(output_path) if output_path else source.with_name(source.stem + ".redacted" + source.suffix)
    with Image.open(source) as opened:
        image = opened.convert("RGB")
        draw = ImageDraw.Draw(image)
        width, height = image.size
        for left, top, right, bottom in sensitive_regions:
            x1, y1 = max(0, left), max(0, top)
            x2, y2 = min(width, right), min(height, bottom)
            if x2 > x1 and y2 > y1:
                draw.rectangle((x1, y1, x2, y2), fill="black")
        image.save(destination)
    return destination


def build_report(
    cases: Sequence[CaseResult],
    *,
    commit_sha: str | None = None,
    apk_version: str | None = None,
    device: str | None = None,
    resolution: str | None = None,
    locale: str | None = None,
) -> dict[str, Any]:
    report = {
        "metadata": collect_metadata(
            commit_sha=commit_sha,
            apk_version=apk_version,
            device=device,
            resolution=resolution,
            locale=locale,
        ),
        "cases": [asdict(case) for case in cases],
        "allowed_statuses": [status.value for status in CaseStatus],
    }
    return redact_payload(report)


def write_report(report: Mapping[str, Any], path: str | Path) -> Path:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(redact_payload(report), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return destination
