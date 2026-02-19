/**
 * lint-staged configuration.
 *
 * TypeScript full-project type-checking is intentionally NOT run here:
 * - The root tsconfig uses project references ("files": []) requiring built artifacts
 * - tsc cannot receive explicit file paths when --project is used (TS5042)
 * - Type-checking is handled by the CI pipeline (verificacion-basica.yml)
 *
 * ESLint with --max-warnings=0 provides fast, per-file quality gates pre-commit.
 */
const lintStagedConfig = {
  "*.{ts,tsx,js,mjs}": (filenames) =>
    `eslint --max-warnings=0 ${filenames.join(" ")}`,
  "*.{json,md}": (filenames) =>
    `prettier --write ${filenames.join(" ")}`,
};

export default lintStagedConfig;
