import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "dist/**", ".astro/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    settings: { react: { version: "detect" } },
    plugins: { react, "react-hooks": hooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  }
);
