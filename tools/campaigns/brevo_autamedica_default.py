import json
import re
import urllib.error
import urllib.request
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

BREVO_URL = "https://api.brevo.com/v3/smtp/email"
AUTAMEDICA_BREVO_TEMPLATE_ID = 8
DEFAULT_SENDER = {
    "name": "Eduardo Marques - AutaMedica",
    "email": "contacto@autamedica.com",
}
DEFAULT_REPLY_TO = {
    "name": "AutaMedica",
    "email": "contacto@autamedica.com",
}


def read_brevo_api_key() -> str:
    candidates = [
        Path("/home/edu/send_test_email.py"),
        Path("/home/edu/send_test_email_v5.py"),
    ]
    for path in candidates:
        if not path.exists():
            continue
        match = re.search(r"(?:api_key|API_KEY)\s*=\s*[\"']([^\"']+)[\"']", path.read_text())
        if match:
            return match.group(1)
    raise RuntimeError("No se pudo leer el API key de Brevo desde los scripts locales")


def paragraph_body(*paragraphs: str) -> str:
    return "\n\n".join(paragraph.strip() for paragraph in paragraphs if paragraph.strip())


class _PlainTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        if data.strip():
            self.parts.append(data.strip())

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"p", "br", "div", "li", "tr"} and self.parts and self.parts[-1] != "\n":
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"p", "div", "li", "tr"}:
            self.parts.append("\n")


def html_to_plain_text(html: str) -> str:
    parser = _PlainTextParser()
    parser.feed(html)
    text = "".join(parser.parts)
    text = re.sub(r"\s*\n\s*", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def send_autamedica_email(
    *,
    to: list[dict[str, str]],
    subject: str,
    title: str,
    body_html: str,
    subtitle: str = "",
    cta_url: str = "https://autamedica.com",
    cta_label: str = "autamedica.com",
    secondary_url: str = "mailto:contacto@autamedica.com",
    secondary_label: str = "contacto@autamedica.com",
    signature_name: str = "Eduardo Marques",
    sender: dict[str, str] | None = None,
    reply_to: dict[str, str] | None = None,
    template_id: int = AUTAMEDICA_BREVO_TEMPLATE_ID,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "sender": sender or DEFAULT_SENDER,
        "replyTo": reply_to or DEFAULT_REPLY_TO,
        "to": to,
        "templateId": template_id,
        "params": {
            "subject": subject,
            "title": title,
            "subtitle": subtitle,
            "body_html": body_html,
            "cta_url": cta_url,
            "cta_label": cta_label,
            "secondary_url": secondary_url,
            "secondary_label": secondary_label,
            "signature_name": signature_name,
        },
    }

    request = urllib.request.Request(
        BREVO_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "api-key": read_brevo_api_key(),
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read().decode()
            parsed = json.loads(raw) if raw else {}
            return {"status": response.status, **parsed}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        raise RuntimeError(f"Brevo error {exc.code}: {raw}") from exc
