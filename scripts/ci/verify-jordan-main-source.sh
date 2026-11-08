#!/usr/bin/env bash
# Gate 1: prove checkout and CircleCI configuration refer to the same reviewed main SHA.
# GitHub App integration is required because CircleCI exposes config source SHA.
# This script must run before any expensive Jordan release job.
set -euo pipefail

die() { printf 'NO-GO Jordan CI source: %s\n' "$*" >&2; exit 42; }

for name in JORDAN_CI_CHECKOUT_SHA JORDAN_CI_CONFIG_SHA \
            JORDAN_CI_CHECKOUT_BRANCH JORDAN_CI_CONFIG_REF \
            JORDAN_CI_CONFIG_REPO JORDAN_CI_CHECKOUT_REPO; do
  [[ -n "${!name:-}" ]] || die "Missing ${name} (wrong pipeline source?)"
done

[[ "$JORDAN_CI_CHECKOUT_BRANCH" == "main" ]] || die "Checkout branch is not main"
[[ "$JORDAN_CI_CONFIG_REF" == "refs/heads/main" ]] || die "Config source is not main"
[[ "$JORDAN_CI_CONFIG_REPO" == "ecucondorSA/Autamedica" ]] || die "Wrong config repository"
[[ "$JORDAN_CI_CHECKOUT_REPO" == "ecucondorSA/Autamedica" ]] || die "Wrong checkout repository"
[[ "$JORDAN_CI_CHECKOUT_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || die "Invalid checkout SHA"
[[ "$JORDAN_CI_CONFIG_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || die "Missing valid config SHA: use GitHub App integration"
[[ "$JORDAN_CI_CHECKOUT_SHA" == "$JORDAN_CI_CONFIG_SHA" ]] || die "Config SHA does not equal checkout SHA"

head_sha="$(git rev-parse HEAD)" || die "Git checkout not available"
[[ "$head_sha" == "$JORDAN_CI_CHECKOUT_SHA" ]] || die "On-disk HEAD differs from CircleCI SHA"

printf 'Jordan reviewed source SHA: %s\n' "$head_sha"
printf '%s\n' "PASS: Git checkout, config source and main branch exactly match."
