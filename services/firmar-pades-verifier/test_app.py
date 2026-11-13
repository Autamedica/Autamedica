"""Offline fail-closed tests. Real signed-PDF vectors require PFDR homologation."""
import base64
import hashlib

import pytest

from app import VerifyInput, verify_pades_document


ORIGINAL = b"%PDF-1.7\nOriginal approved snapshot"
ORIGINAL_B64 = base64.b64encode(ORIGINAL).decode("ascii")
SIGNED = ORIGINAL + b"\n% incremental mock (unsigned)"


def request_for(signed: bytes, original=ORIGINAL, **kwargs) -> VerifyInput:
    return VerifyInput(
        signedPdfBase64=base64.b64encode(signed).decode("ascii"),
        originalPdfBase64=base64.b64encode(original).decode("ascii"),
        expectedOriginalSha256=kwargs.get(
            "source_hash", hashlib.sha256(original).hexdigest()
        ),
        expectedSignerCuil=kwargs.get("cuil", "20123456786"),
    )


def test_rejects_mismatched_source_sha256_before_pdf_processing():
    req = request_for(SIGNED, source_hash="0" * 64)
    with pytest.raises(ValueError, match="source_hash_mismatch"):
        verify_pades_document(req)


def test_rejects_rewritten_clinical_document_before_pdf_processing():
    req = request_for(b"%PDF-1.7\nOther document")
    with pytest.raises(ValueError, match="source_revision_not_preserved"):
        verify_pades_document(req)


def test_rejects_truncated_pdf_before_pdf_processing():
    req = request_for(b"%PDF-", original=ORIGINAL)
    with pytest.raises(ValueError, match="invalid_pdf"):
        verify_pades_document(req)
