#!/usr/bin/env bash
# Candidate CI is intentionally NOT release CI. It only accepts the exact
# non-main PR branch, config source commit and checked-out source commit.
set -euo pipefail

deny() { printf 'NO-GO candidate CI provenance: %s\n' "$*" >&2; exit 42; }
for key in JORDAN_CI_CHECKOUT_SHA JORDAN_CI_CONFIG_SHA \
  JORDAN_CI_CHECKOUT_BRANCH JORDAN_CI_CONFIG_REF \
  JORDAN_CI_CONFIG_REPO JORDAN_CI_CHECKOUT_REPO; do
  [[ -n "${!key:-}" ]] || deny "Missing ${key} (GitHub App source required)"
done
[[ "$JORDAN_CI_CHECKOUT_REPO" == "ecucondorSA/Autamedica" ]] || deny "Wrong code repository"
# pipeline.config.repository.name returns the full owner/repo for GitHub App API triggers
# but only the short repo name for webhook pushes. Accept both forms.
[[ "$JORDAN_CI_CONFIG_REPO" == "ecucondorSA/Autamedica" || "$JORDAN_CI_CONFIG_REPO" == "Autamedica" ]] || deny "Wrong configuration repository"
[[ "$JORDAN_CI_CHECKOUT_BRANCH" != "main" ]] || deny "Candidate workflow must not substitute for main release proof"
[[ "$JORDAN_CI_CHECKOUT_BRANCH" =~ ^[A-Za-z0-9._/-]{1,200}$ ]] || deny "Invalid branch"
[[ "$JORDAN_CI_CONFIG_REF" == "refs/heads/${JORDAN_CI_CHECKOUT_BRANCH}" ]] || deny "Config is not from the candidate branch"
[[ "$JORDAN_CI_CHECKOUT_SHA" =~ ^[0-9a-f]{40}$ ]] || deny "Invalid checkout SHA"
[[ "$JORDAN_CI_CONFIG_SHA" =~ ^[0-9a-f]{40}$ ]] || deny "Invalid config SHA"
[[ "$JORDAN_CI_CHECKOUT_SHA" == "$JORDAN_CI_CONFIG_SHA" ]] || deny "Code/config SHAs differ"
[[ "$(git rev-parse HEAD)" == "$JORDAN_CI_CHECKOUT_SHA" ]] || deny "Git HEAD does not match pipeline SHA"
printf 'PASS candidate-only source provenance: %s %s\n' "$JORDAN_CI_CHECKOUT_BRANCH" "$JORDAN_CI_CHECKOUT_SHA"
printf '%s\n' "This is not a Jordan go-live gate. SQL replay, PSP TEST and device QA still required."
