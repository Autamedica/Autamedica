#!/usr/bin/env python3
"""Offline-only checks for vendor-confirmed AutaMedica TEST payload identifiers.

No API calls, credentials, mutation, or communication with Farmalink.
"""
import unittest

from alta_demo_smoke import demo_payload


class FarmalinkHomologationContractTests(unittest.TestCase):
    def test_assigned_organization_and_no_emitter(self):
        request = demo_payload()["altaRecetaElectRq"]
        self.assertEqual(request["infoCabeceraRq"]["idOrganizacion"], "182")
        self.assertNotIn("puntoEmisor", request)

    def test_farmalink_assigned_test_affiliate(self):
        affiliate = demo_payload()["altaRecetaElectRq"]["recElectronica"]["afiliado"]
        self.assertEqual(affiliate["credencial"]["codEntidad"], 7110)
        self.assertEqual(affiliate["credencial"]["pan"], "20123456786")
        self.assertEqual(affiliate["numeroDocumento"], 12345678)

    def test_requires_reconciliation_before_live_alta(self):
        import os
        from unittest.mock import patch
        from alta_demo_smoke import main
        with patch.dict(os.environ, {"FARMALINK_DEMO_RECONCILED": ""}):
            self.assertEqual(main(), 6)


if __name__ == "__main__":
    unittest.main()
