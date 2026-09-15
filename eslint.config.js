import js from '@eslint/js';
import globals from 'globals';
export default [{ ignores: ['**/dist/**','**/node_modules/**','**/target/**'] }, js.configs.recommended, { files: ['**/*.js','**/*.jsx'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser }, parserOptions: { ecmaFeatures: { jsx: true } } }, rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z]', argsIgnorePattern: '^_' }] } }];
