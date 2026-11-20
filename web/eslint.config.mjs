import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored beui.dev components, kept as published.
    "components/motion/**",
    "lib/hooks/**",
    "lib/{ease,focusable,i18n,presence-gate,touch}.ts*",
  ]),
]);

export default eslintConfig;
