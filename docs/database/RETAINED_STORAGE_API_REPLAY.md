# Retained #38 Storage API byte-replay drill

## Scope and status

The previous offline retained restore #38 independently verified 228 database
tables and hashes for 359 Storage objects. The synthetic Storage test in
PR #665 independently passed API authorization checks using invented users.

This drill decrypts the **real retained ciphertext** from independent escrow and
rehydrates its verified object bytes through a **disposable local Supabase
Storage API** into a fresh database, then re-downloads every object and
compares its SHA-256.

All local replay buckets are forcibly PRIVATE, including those that were
public on the original system. Original RLS policies, object versions, UUIDs,
owner IDs, bucket public flags, app authorization and exact Storage catalog
metadata are **not** replayed. This is a functional byte-level replay into fresh
metadata, NOT an accredited restore of the original Storage service.
Even if all 359/359 pass, storage_service_restore_verified stays false.

## CI: synthetic only

The GitHub Actions workflow "Storage API isolated smoke (synthetic only)" runs
unit tests and a two-file synthetic rehearsal of the same streaming
upload/download logic. Never supply real keys or patient data to CI.

## Prerequisites for a REAL replay

- Private reviewed recovery machine. In Codespaces: inspect the Ports panel
  and disable forwarding or ensure ALL forwarded ports are Private.
  Binding 127.0.0.1 alone does not rule out Codespaces port forwarding.
- No real production database/API environment variables, no other local
  Supabase stack on 54321-54323, and no publicly reachable endpoints.
- GnuPG, Docker and Supabase CLI 2.122.0, with at least 4 GiB free.
- Encrypted backup and checksum under ~/recovery-38.
- Escrowed private key and passphrase OUTSIDE the Git repository, with
  restrictive permissions. Never commit, paste or print their contents.

## Run only in a private recovery environment

    cd /workspaces/Autamedica
    export PATH="$HOME/recovery-38/tools/node_modules/.bin:$PATH"
    umask 077

    (cd "$HOME/recovery-38" && sha256sum -c SHA256SUMS)

    python3 scripts/db/test_retained_storage_api.py \
      --bundle "$HOME/recovery-38/recovery.tar.gz.gpg" \
      --sha256 "$(awk '$2=="recovery.tar.gz.gpg" {print $1}' "$HOME/recovery-38/SHA256SUMS")" \
      --key-file "$HOME/recovery-38/escrow/recovery-private.asc" \
      --key-passphrase-file "$HOME/recovery-38/escrow/recovery-passphrase.txt" \
      --expected-objects 359 \
      --confirm REPLAY-STORAGE-API-qxjjrpksmwwrmubhvjew

Expected success fields:
- retained_objects_served_with_sha256: 359
- retained_api_bytes_verified: true
- retained_replay_anonymous_denied: true
- retained_replay_other_user_denied: true
- retained_original_metadata_exact: false
- retained_original_rls_verified: false
- storage_service_restore_verified: false
- temporary_private_copy_destroyed: true

Only object counts and redacted verification booleans are printed; no file
names, patient identifiers, PDF bytes, credentials or raw error response bodies
should be logged. The standalone procedure does not contact production or
perform any remote write.

## Remaining gate: original service recovery

A separately reviewed procedure is still required to attach the exact
restored **real** DB plus original object backend, restore matching metadata
and object versions, and exercise original patient/doctor RLS rules,
including cross-BR/AR authorization, in a fully isolated environment.
Do not call a service-role download an authorization test: it bypasses RLS.
Never "repair" an offline test by weakening policies or making private buckets
public.

Supabase references:
https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3
https://supabase.com/docs/guides/storage/schema/design

Clean up the temporary stack and working plaintext. Original escrow files
remain in their original secure location until independent custody is proved;
remove Codespaces copies and rotate exposed keys for future backups thereafter.
