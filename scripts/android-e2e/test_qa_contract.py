"""Unit tests for Android E2E assertions, locale, role copy and privacy."""
from __future__ import annotations

import json
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from qa_contract import (
    CaseStatus,
    build_report,
    evaluate_emission_flow,
    evaluate_navigation_case,
    evaluate_patient_detail,
    redact_text,
    redact_screenshot,
    write_report,
)

ROOT = Path(__file__).resolve().parents[2]


class PatientDetailAssertionsTest(unittest.TestCase):
    def test_visible_patient_detail_error_is_fail(self) -> None:
        result = evaluate_patient_detail(
            "No se pudo cargar la informacion del paciente",
            patient_data_rendered=False,
        )
        self.assertEqual(result.status, CaseStatus.FAIL)

    def test_patient_detail_pass_requires_real_rendered_data(self) -> None:
        result = evaluate_patient_detail(
            "Ficha del paciente\nHistorial de consultas",
            patient_data_rendered=True,
        )
        self.assertEqual(result.status, CaseStatus.PASS)


class IssuanceClassificationTest(unittest.TestCase):
    def test_recipe_and_certificate_selector_only_are_not_tested(self) -> None:
        for case_id in ("TC01C_Recipes", "TC01D_Certificates"):
            with self.subTest(case_id=case_id):
                result = evaluate_emission_flow(
                    case_id,
                    selector_opened=True,
                    submission_attempted=False,
                    persistence_verified=False,
                )
                self.assertEqual(result.status, CaseStatus.NOT_TESTED)

    def test_submission_without_persistence_fails(self) -> None:
        result = evaluate_emission_flow(
            "TC01C_Recipes",
            selector_opened=True,
            submission_attempted=True,
            persistence_verified=False,
        )
        self.assertEqual(result.status, CaseStatus.FAIL)

    def test_completed_and_persisted_issuance_passes(self) -> None:
        result = evaluate_emission_flow(
            "TC01D_Certificates",
            selector_opened=True,
            submission_attempted=True,
            persistence_verified=True,
        )
        self.assertEqual(result.status, CaseStatus.PASS)


class NavigationScopeTest(unittest.TestCase):
    def test_tab_navigation_is_not_a_performance_stress_test(self) -> None:
        result, performance_status = evaluate_navigation_case(
            ("Home", "Mensajes", "Agenda", "Pacientes", "Perfil")
        )
        self.assertEqual(result.case_id, "TC06_Repeated_Tab_Navigation")
        self.assertEqual(result.status, CaseStatus.PASS)
        self.assertEqual(performance_status, CaseStatus.NOT_TESTED)


class PrivacyAndReportTest(unittest.TestCase):
    def test_redacts_cpf_dni_phone_and_email(self) -> None:
        cpf = ".".join(("123", "456", "789")) + "-09"
        dni = "30" + "111" + "222"
        phone = "+54 9 11 " + "5555" + "-1234"
        email = "doctor" + "@example.com"
        redacted = redact_text(f"CPF: {cpf} DNI: {dni} teléfono: {phone} mail: {email}")
        for value in (cpf, dni, phone, email):
            self.assertNotIn(value, redacted)
        self.assertIn("[ID REDACTED]", redacted)
        self.assertIn("[EMAIL REDACTED]", redacted)

    def test_report_contains_required_metadata_and_masks_evidence(self) -> None:
        cpf = ".".join(("123", "456", "789")) + "-09"
        report = build_report(
            [evaluate_patient_detail(f"CPF: {cpf}", patient_data_rendered=True)],
            commit_sha="abcdef123",
            apk_version="1.2.27",
            device="Pixel 8",
            resolution="1080x2400",
            locale="pt-BR",
        )
        self.assertTrue(report["metadata"]["metadata_complete"])
        self.assertEqual(
            set(report["metadata"]) - {"metadata_complete"},
            {"commit_sha", "apk_version", "device", "resolution", "locale"},
        )
        self.assertNotIn(cpf, json.dumps(report))

    def test_report_writer_serializes_only_redacted_payload(self) -> None:
        email = "person" + "@example.com"
        report = build_report(
            [evaluate_patient_detail("mail " + email, patient_data_rendered=True)],
            commit_sha="sha",
            apk_version="1.0",
            device="emulator",
            resolution="1080x2400",
            locale="es-419",
        )
        with tempfile.TemporaryDirectory() as directory:
            output = write_report(report, Path(directory) / "e2e.json")
            content = output.read_text(encoding="utf-8")
        self.assertIn("[EMAIL REDACTED]", content)
        self.assertNotIn(email, content)

    def test_screenshot_redaction_blacks_out_sensitive_rectangle(self) -> None:
        from PIL import Image
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.png"
            output = Path(directory) / "redacted.png"
            Image.new("RGB", (20, 20), "white").save(source)
            redact_screenshot(source, [(2, 3, 10, 12)], output)
            with Image.open(output) as image:
                self.assertEqual(image.getpixel((5, 5)), (0, 0, 0))
                self.assertEqual(image.getpixel((15, 15)), (255, 255, 255))

    def test_all_required_statuses_exist(self) -> None:
        self.assertEqual(
            {status.value for status in CaseStatus},
            {"PASS", "FAIL", "WARN", "BLOCKED", "NOT_TESTED"},
        )


class LocaleAndRoleCopyTest(unittest.TestCase):
    def _resources(self, folder: str) -> dict[str, str]:
        path = ROOT / "apps/android/app/src/main/res" / folder / "strings_doctor.xml"
        root = ET.parse(path).getroot()
        return {item.attrib["name"]: item.text or "" for item in root.findall("string")}

    def test_doctor_dashboard_and_messages_copy_exists_for_all_locales(self) -> None:
        for folder in ("values", "values-pt-rBR", "values-b+es+419"):
            with self.subTest(locale=folder):
                resources = self._resources(folder)
                self.assertTrue(resources["doctor_chat_list_empty_title"])
                self.assertTrue(resources["doctor_chat_list_empty_subtitle"])
                self.assertTrue(resources["doctor_duty_connected"])
                self.assertTrue(resources["doctor_schedule_empty_state"])

    def test_doctor_messages_use_role_specific_copy(self) -> None:
        screen = (ROOT / "apps/android/app/src/main/java/com/autamedica/android/presentation/chat/ChatListScreen.kt").read_text()
        main = (ROOT / "apps/android/app/src/main/java/com/autamedica/android/presentation/main/MainScreen.kt").read_text()
        self.assertIn("if (isDoctor) R.string.doctor_chat_list_empty_title", screen)
        self.assertIn("if (isDoctor) R.string.doctor_chat_list_empty_subtitle", screen)
        self.assertIn("isDoctor = true", main)

    def test_home_and_profile_share_the_profile_name_source(self) -> None:
        vm = (ROOT / "apps/android/app/src/main/java/com/autamedica/android/presentation/dashboard/DoctorDashboardViewModel.kt").read_text()
        self.assertIn("profileRepository?.getProfile()", vm)

    def test_doctor_empty_inbox_cta_opens_patient_selection(self) -> None:
        screen = (ROOT / "apps/android/app/src/main/java/com/autamedica/android/presentation/chat/ChatListScreen.kt").read_text()
        main = (ROOT / "apps/android/app/src/main/java/com/autamedica/android/presentation/main/MainScreen.kt").read_text()
        self.assertIn("if (isDoctor)", screen)
        self.assertIn("doctor_chat_empty_choose_patient", screen)
        self.assertIn("onNavigateToPatients = { selectedTab = 3 }", main)
        for folder in ("values", "values-pt-rBR", "values-b+es+419"):
            resources = self._resources(folder)
            self.assertTrue(resources.get("doctor_chat_empty_choose_patient"))

    def test_anonymous_patient_rows_use_stable_record_ids_without_merging(self) -> None:
        screen = (ROOT / "apps/android/app/src/main/java/com/autamedica/android/presentation/patients/PatientsScreen.kt").read_text()
        helper = (ROOT / "apps/android/app/src/main/java/com/autamedica/android/presentation/patients/PatientReferenceSuffix.kt").read_text()
        self.assertIn("items(displayedPatients, key = { it.id })", screen)
        self.assertIn("patientReferenceSuffix(patient.id)", screen)
        self.assertIn("takeLast(4)", helper)

    def test_doctor_portal_primary_brand_uses_sky_palette(self) -> None:
        theme = (ROOT / "apps/android/app/src/main/java/com/autamedica/android/presentation/theme/Color.kt").read_text()
        self.assertIn("val PortalDoctors = Color(0xFF0EA5E9)", theme)
        self.assertIn("val Primary = Color(0xFF0EA5E9)", theme)


if __name__ == "__main__":
    unittest.main()
