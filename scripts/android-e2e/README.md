# Android E2E quality contract

The Android UI runner must treat these helpers as the final assertion and reporting boundary.

## Assertions

- Call `evaluate_patient_detail(screen_text, patient_data_rendered=True)` after opening the patient record. Any detected visible error produces `FAIL`; data not verified produces `WARN`.
- Call `evaluate_emission_flow` for recipes and certificates. Opening the patient selector alone is `NOT_TESTED`; a submit without verified persistence is `FAIL`; only a completed, persisted emission is `PASS`.
- Name the tab exercise `TC06_Repeated_Tab_Navigation`. A five-tab loop measures navigation only. Its performance status remains `NOT_TESTED` until memory, CPU, ANR, crash and network measurements are supplied.

## Privacy and reporting

- Run captured text through `redact_text` before any log sink.
- Pass every PII rectangle from the UI hierarchy to `redact_screenshot` and attach only the redacted output to the report.
- Use `build_report` and `write_report` for the JSON output. The report always carries commit SHA, APK version, device, resolution and locale fields; missing metadata is explicitly marked as incomplete rather than guessed.
- The supported statuses are `PASS`, `FAIL`, `WARN`, `BLOCKED` and `NOT_TESTED`.

## Local contract tests

```bash
python -m pip install -r scripts/android-e2e/requirements.txt
python -m unittest discover -s scripts/android-e2e -p "test_*.py" -v
```

The package supplies the reusable contract and its tests. The externally supplied runner ZIP is not checked into this repository, so its device-specific capture steps must import these helpers rather than assuming an unavailable local runner implementation.
