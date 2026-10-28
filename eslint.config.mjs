import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'linguatube-pro/**/*']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
