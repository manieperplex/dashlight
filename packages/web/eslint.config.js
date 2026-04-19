import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "src/routeTree.gen.ts"] },
  ...tseslint.configs.recommended,
  {
    // Config files at the package root are not covered by tsconfig — disable
    // type-aware rules so the parser doesn't require a project reference.
    files: ["*.config.{js,ts}"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        project: ["./tsconfig.json", "./tsconfig.test.json"],
      },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }
)
