import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
  ...nextVitals,
  ...nextTypescript,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // The financial domain layer stays pure: no UI, framework or database imports, no floats for money.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-*", "next", "next/*", "@supabase/*", "@/*"],
              message: "src/domain must stay framework- and database-independent.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "parseFloat", message: "Parse money with parseAmountInput." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Number", property: "parseFloat", message: "Parse money with parseAmountInput." },
        { property: "toFixed", message: "Format money with formatMoney / paiseToDecimalString." },
      ],
    },
  },
];

export default config;
