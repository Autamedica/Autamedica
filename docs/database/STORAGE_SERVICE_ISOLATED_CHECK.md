# Storage service recovery: isolated functional checks

## Evidence status (2026-11-03)

The retained recovery #38 was successfully decrypted and restored into a
disposable **offline database** in a user-controlled Codespace. Its independent
report verified 228 tables and byte-for-byte hashes for 359 Storage objects.
The report intentionally states:

- retained_database_restore_verified: true
- retained_storage_bytes_verified: true
- storage_service_restore_verified: false
- vault_and_external_configuration_restored: false

**Neither a matching SQL snapshot nor matching Storage bytes prove that a
restarted Storage API can serve recovered private documents with the original
authorization policies.**

## Implemented: synthetic local Storage API smoke

The standalone script
[scripts/db/test_storage_api_isolated.py](../../scripts/db/test_storage_api_isolated.py)
starts a new local CLI stack, creates *two synthetic* users and a private
bucket, installs narrow synthetic folder-owner RLS policies, then checks:

1. Owner downloads the synthetic object with exact SHA-256.
2. Another authenticated user cannot download it.
3. Anonymous request cannot download it.
4. Public URL cannot reveal the object from the private bucket.
5. Second user cannot upload into the first user's folder.

The script rejects production credentials from the environment, allows only
loopback HTTP, disables HTTP redirects, requests no real object or clinical
identity, and destroys the disposable stack and files. It does not depend on
the recovery key or on the #38 encrypted archive. It does **not** modify
the AutaMedica database or production Storage policies.

### Run on Codespaces (synthetic test; no escrow material required)

Open a fresh terminal. From repository root:

    cd /workspaces/Autamedica
    export PATH="$HOME/recovery-38/tools/node_modules/.bin:$PATH"
    PYTHONPATH="$PWD/scripts/db" python3 -m unittest -v test_storage_api_isolated_unit
    python3 scripts/db/test_storage_api_isolated.py

The standalone program fails closed if standard local CLI ports are already
occupied or if any production credential variable is populated; do not bypass
these guards. Only run this on a trusted Codespace that contains *no other
active local Supabase stack*. The smoke test can also be run in the dedicated
GitHub Actions workflow; that workflow uses synthetic data and no secrets.

The success report contains:

    "synthetic_storage_api_verified": true
    "synthetic_owner_download_sha256_verified": true
    "synthetic_other_patient_denied": true
    "synthetic_anonymous_denied": true
    "synthetic_public_url_denied": true
    "synthetic_cross_patient_upload_denied": true
    "production_recovery_accredited": false
    "storage_service_restore_verified": false

Do not claim production Storage recovery from these results.

## Still required to close real service recovery (NOT implemented)

A separate approved offline drill needs to:

1. Decrypt a retained copy in a protected environment that never routes
   production credentials, inbound public traffic, webhooks, emails, or
   clinical data off-host. The existing reader deliberately destroys its
   disposable database and reconstructed bytes on exit.
2. Rehydrate the **real** 359 binaries into a compatible Storage backend.
   Preserve object-to-blob identity, bucket privacy, version and storage
   metadata. Never convert a private bucket to public as a workaround.
3. Start a Storage API against the recovered DB and storage backend with
   isolated local authentication, not a service_role bypass. First ensure
   no service or endpoint is exposed via GitHub Codespaces forwarded ports.
4. Select **approved test identities and documents** to check an authorized
   patient or clinician can fetch an eligible file, a different identity
   cannot, and an anonymous caller cannot. Do not fabricate expected
   authorization from raw object owners: the existing clinical policy may
   use different table relationships, country rules, or roles.
5. Compare downloaded bytes against manifest SHA-256 values. Verify API
   authorization and absence of cross-BR/AR access; test relevant object
   operations and signed URL limits.
6. Destroy all plaintext, temporary tokens and disposable containers;
   separately confirm no residual working copies. Retain only redacted
   status evidence.

Only after these checks pass may
storage_service_restore_verified be reported **true**. It remains **false**
in the production retained-copy script for now.

Vault, external configurations, offsite escrow, clinical workflows and
observation gates remain separate Level 4 requirements.


## New: retained object byte replay through local Storage API

See [Retained Storage API byte replay](RETAINED_STORAGE_API_REPLAY.md).
The new standalone script decrypts retained ciphertext privately, checks
manifest integrity, rehydrates captured bytes via a *fresh local* Storage API
with all test buckets private, and verifies downloaded hashes plus synthetic
authorization denials. It runs **synthetic only in CI**; real ciphertext and
escrow are allowed only on a separately approved private machine. It does not
replay the original object versions/owners or original clinical RLS policies.
Therefore it **does not** change storage_service_restore_verified=false.
