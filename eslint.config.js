import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Base JavaScript rules
  js.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommended,

  // React hooks rules (Next.js app)
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // Project-wide rule overrides
  {
    rules: {
      // Allow unused vars prefixed with _ (common pattern for intentionally unused params)
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Allow explicit `any` with a warning (too strict for a project in active dev)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow empty interfaces/types (useful for placeholder types during development)
      '@typescript-eslint/no-empty-object-type': 'off',
      // Allow require() imports (needed for some config files)
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Ignore build artifacts and generated files
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/target/**',
      '**/gen/**',
      '**/*.config.js',
      '**/*.config.ts',
      '**/drizzle/migrations/**',
    ],
  },
);
