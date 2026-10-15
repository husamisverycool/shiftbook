import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Money and time are integers (SPEC §5). In pay/billing code, decimal literals, the "/" operator
// and float helpers are forbidden; the only division lives in packages/rules/src/int.ts.
const MONEY_CODE = [
  "packages/rules/src/**/*.ts",
  "src/exports/**/*.ts",
  "src/billing/**/*.ts",
  "src/pay/**/*.ts",
];
const MONEY_EXEMPT = ["packages/rules/src/int.ts", "**/*.test.ts"];

const noFloatRules = {
  "no-restricted-syntax": [
    "error",
    {
      // Numeric literals only (their source text starts with a digit or a dot; strings start with a quote).
      selector: "Literal[raw=/^(\\d*\\.\\d|\\d+[eE])/]",
      message: "No decimal or exponent number literals in pay/billing code (SPEC §5): use integer cents/minutes.",
    },
    {
      selector: "BinaryExpression[operator='/']",
      message: "No '/' in pay/billing code: use the integer helpers in packages/rules/src/int.ts.",
    },
    {
      selector: "AssignmentExpression[operator='/=']",
      message: "No '/=' in pay/billing code: use the integer helpers in packages/rules/src/int.ts.",
    },
  ],
  "no-restricted-properties": [
    "error",
    { object: "Math", property: "round", message: "Use roundDiv from int.ts." },
    { object: "Math", property: "floor", message: "Use floorDiv from int.ts." },
    { object: "Math", property: "ceil", message: "Use int.ts helpers." },
    { object: "Math", property: "trunc", message: "Use int.ts helpers." },
    { object: "Math", property: "random", message: "Pay/billing code must be deterministic." },
    { object: "Number", property: "parseFloat", message: "No floats in pay/billing code." },
    { property: "toFixed", message: "Format money with the formatting helpers, never toFixed." },
  ],
  "no-restricted-globals": [
    "error",
    { name: "parseFloat", message: "No floats in pay/billing code." },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: MONEY_CODE,
    ignores: MONEY_EXEMPT,
    rules: noFloatRules,
  },
  {
    // The rules engine is a pure package: no I/O, no clock, no randomness, no outside imports.
    files: ["packages/rules/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\.{1,2}/)",
              message: "packages/rules is pure: only relative imports inside the package.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "parseFloat", message: "No floats in pay/billing code." },
        { name: "process", message: "packages/rules has no I/O or environment access." },
        { name: "fetch", message: "packages/rules has no I/O." },
        { name: "Date", message: "packages/rules works on ISO date strings via its own civil-date helpers." },
        { name: "setTimeout", message: "packages/rules is synchronous and pure." },
        { name: "console", message: "packages/rules does not log." },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "demo/samples/**",
    ".pgdata/**",
    ".storage/**",
    "drizzle/**",
  ]),
]);

export default eslintConfig;
