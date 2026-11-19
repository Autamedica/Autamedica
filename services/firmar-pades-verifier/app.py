"""Isolated, fail-closed PAdES verification service for FirmAR.

This is NOT deployed by AutaMedica and does not authorize production signing.
Run only with a reviewed Argentine CA trust root, revocation egress restrictions,
a private HTTPS front end, and an independently approved timestamp policy.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import io
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from pyhanko.keys import load_cert_from_pemder
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.sign.validation.status import SignatureCoverageLevel
from pyhanko_certvalidator import ValidationContext

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
MAX_PDF = 8 * 1024 * 1024
MAX_B64 = ((MAX_PDF + 2) // 3) * 4


class VerifyInput(BaseModel):
    signedPdfBase64: str = Field(max_length=MAX_B64)
    originalPdfBase64: str = Field(max_length=MAX_B64)
    expectedOriginalSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    expectedSignerCuil: str = Field(pattern=r"^[0-9]{11}$")


def _decode(value: str) -> bytes:
    try:
        data = base64.b64decode(value, validate=True)
    except (ValueError, base64.binascii.Error):
        raise ValueError("invalid_base64") from None
    if not 5 <= len(data) <= MAX_PDF or not data.startswith(b"%PDF-"):
        raise ValueError("invalid_pdf")
    return data


def _trust_root():
    filename = os.environ.get("FIRMAR_AR_TRUST_ROOT_FILE")
    expected = os.environ.get("FIRMAR_AR_TRUST_ROOT_SHA256", "").lower()
    if not filename or not re.fullmatch(r"[a-f0-9]{64}", expected):
        raise ValueError("trust_root_not_configured")
    raw = Path(filename).read_bytes()
    if not hmac.compare_digest(hashlib.sha256(raw).hexdigest(), expected):
        raise ValueError("trust_root_fingerprint_mismatch")
    return load_cert_from_pemder(filename)


def verify_pades_document(request: VerifyInput) -> dict:
    original = _decode(request.originalPdfBase64)
    signed = _decode(request.signedPdfBase64)
    if hashlib.sha256(original).hexdigest() != request.expectedOriginalSha256:
        raise ValueError("source_hash_mismatch")

    # Strict policy: only incremental PDF signing is accepted. FirmAR must
    # preserve *every byte* of the reviewed original clinical document.
    if len(signed) <= len(original) or not signed.startswith(original):
        raise ValueError("source_revision_not_preserved")

    reader = PdfFileReader(io.BytesIO(signed))
    if len(reader.embedded_signatures) != 1:
        raise ValueError("expected_single_pdf_signature")
    signature = reader.embedded_signatures[0]

    # A custom Argentine trust root is mandatory: never silently use OS trust.
    # Enforce hard-fail revocation checks. Deployment MUST restrict outgoing
    # OCSP/CRL requests to vetted official hosts to prevent certificate SSRF.
    vc = ValidationContext(
        trust_roots=[_trust_root()],
        allow_fetching=True,
        revocation_mode="hard-fail",
    )
    status = validate_pdf_signature(signature, signer_validation_context=vc,
                                    ts_validation_context=vc, skip_diff=False)
    if not (status.bottom_line and status.intact and status.valid):
        raise ValueError("signature_not_valid")
    if status.trust_problem_indic is not None or status.coverage != SignatureCoverageLevel.ENTIRE_FILE:
        raise ValueError("signature_not_trusted_or_incomplete")
    if status.docmdp_ok is False or status.seed_value_constraint_error is not None:
        raise ValueError("pdf_modification_policy_failed")

    subject = status.signing_cert.subject.native
    serial = subject.get("serial_number", "")
    signer_cuil = re.sub(r"\D", "", str(serial))
    if not hmac.compare_digest(signer_cuil, request.expectedSignerCuil):
        raise ValueError("signer_cuil_mismatch")

    # Do NOT mistake an untrusted PDF /M or CMS signingTime for an
    # independently attested timestamp. If FirmAR does not provide a trusted
    # timestamp, its policy needs separate review before loosening this gate.
    ts = status.timestamp_validity
    if not ts or not ts.bottom_line or not isinstance(ts.timestamp, datetime):
        raise ValueError("trusted_timestamp_required")
    signed_at = ts.timestamp.astimezone(timezone.utc)
    now = datetime.now(timezone.utc)
    if abs((now - signed_at).total_seconds()) > 15 * 60:
        raise ValueError("signing_timestamp_outside_active_session")

    cert_expiry = status.signing_cert["tbs_certificate"]["validity"]["not_after"].native
    if cert_expiry.astimezone(timezone.utc) <= signed_at:
        raise ValueError("signer_certificate_expired_at_signing")

    return {
        "cryptographicallyValid": True,
        "trustedArgentineIssuer": True,
        "certificateNotRevoked": True,
        "certificateNotExpired": True,
        "matchedOriginalDocument": True,
        "signerCuil": signer_cuil,
        "certificateFingerprintSha256": hashlib.sha256(status.signing_cert.dump()).hexdigest(),
        "signedAt": signed_at.isoformat(),
        "signedPdfSha256": hashlib.sha256(signed).hexdigest(),
        "originalPdfSha256": hashlib.sha256(original).hexdigest(),
    }


@app.post("/verify-pades")
def verify_pades(request: VerifyInput, authorization: str | None = Header(default=None)):
    secret = os.environ.get("FIRMAR_PADES_INTERNAL_TOKEN", "")
    if len(secret) < 32 or not authorization or not hmac.compare_digest(
        authorization, "Bearer " + secret
    ):
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        return verify_pades_document(request)
    except Exception:
        # Deliberately no clinical content or PKI details returned in responses.
        raise HTTPException(status_code=422, detail="pades_validation_failed") from None
