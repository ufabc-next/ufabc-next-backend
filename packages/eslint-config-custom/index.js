module.exports = {
  root: true,
  env: {
    'vitest-globals/env': 'true',
  },
  extends: [
    'turbo',
    'plugin:vitest-globals/recommended',
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:prettier/recommended',
  ],
  plugins: ['@typescript-eslint', 'prettier', 'import'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    // eslint-disable-next-line
    tsconfigRootDir: __dirname,
    project: true,
  },
  rules: {
    'import/no-default-export': 'error',
    'no-console': 'error',
    'no-redeclare': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/require-await': 'off',
    '@typescript-eslint/no-floating-promises': [
      'error',
      {
        ignoreVoid: true,
      },
    ],
  },
  overrides: [
    {
      files: ['src/plugins/**/*', 'src/modules/user/**'],
      rules: {
        'import/no-default-export': 'off',
      },
    },
    {
      files: ['src/app.ts', 'src/server.ts'],
      rules: {
        '@typescript-eslint/no-floating-promises': 'off',
      },
    },
  ],
};
