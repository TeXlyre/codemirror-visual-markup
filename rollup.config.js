import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

export default [
  {
    input: 'src/index.ts',
    output: {
      format: 'es',
      file: 'dist/index.js',
      sourcemap: true
    },
    external: [
      'mathlive',
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
    ],
    plugins: [typescript()]
  },
  {
    input: 'src/index.ts',
    output: {
      format: 'es',
      file: 'dist/index.d.ts'
    },
    plugins: [dts()]
  }
];