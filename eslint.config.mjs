import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import sonarjs from "eslint-plugin-sonarjs";

export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**", "**/playwright-report/**", "**/test-results/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" }
    },
    plugins: { "@typescript-eslint": tsPlugin, sonarjs },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // This codebase intentionally uses `any` in a few boundary layers (Next routes, tests, etc).
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports", disallowTypeAnnotations: false }],
      "@typescript-eslint/no-shadow": "error",
      "no-shadow": "off",
      "eqeqeq": ["error", "smart"],
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],
      "no-duplicate-imports": "error",
      "object-shorthand": ["error", "always"],
      "no-useless-rename": "error",
      "no-useless-concat": "error",
      // Keep logs out of core code; allow in tests, CLIs, and server entrypoints.
      "no-console": "error",
      // Duplication-ish signals (not perfect, but high-signal).
      "sonarjs/no-identical-functions": "warn",
      "sonarjs/no-duplicate-string": ["warn", { threshold: 10 }],
      "sonarjs/no-all-duplicated-branches": "warn",
      "sonarjs/no-collapsible-if": "warn",
      "sonarjs/no-inverted-boolean-check": "warn",
      "sonarjs/no-identical-expressions": "warn",
      "sonarjs/prefer-immediate-return": "warn",
      // Next.js uses this in `next-env.d.ts`; we don't lint it as a style problem.
      "@typescript-eslint/triple-slash-reference": "off",
      // TypeScript handles these better.
      "no-undef": "off",
      // Allow `catch {}` (common for best-effort cleanup/teardown).
      "no-empty": ["error", { allowEmptyCatch: true }]
    }
  },
  // Force refactoring: keep source files and functions reasonably small.
  {
    files: ["packages/*/src/**/*.{ts,tsx}", "apps/*/{app,lib,components}/**/*.{ts,tsx}"],
    ignores: ["**/*.d.ts"],
    rules: {
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 150, skipBlankLines: true, skipComments: true }]
    }
  },
  // Tests are allowed to be a bit larger.
  {
    files: ["**/test/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "no-console": "off",
      // Too noisy for tests; we enforce these primarily on source.
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/no-identical-functions": "off",
      "max-lines": ["warn", { max: 450, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 220, skipBlankLines: true, skipComments: true }],
      "complexity": "off"
    }
  },
  // CLI/server entrypoints may log.
  {
    files: ["packages/*/src/bin/**/*.{ts,tsx}", "packages/*/src/**/bin/**/*.{ts,tsx}"],
    rules: { "no-console": "off" }
  },
  // The logger implementation is allowed to emit to console (that’s its job).
  {
    files: ["packages/*/src/logging/**/*.{ts,tsx}"],
    rules: { "no-console": "off" }
  },
  // Node scripts may use process/console.
  {
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        console: "readonly",
        process: "readonly"
      }
    },
    rules: {
      "no-console": "off"
    }
  }
];


