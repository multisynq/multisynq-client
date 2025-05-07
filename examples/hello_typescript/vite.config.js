/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */

import { defineConfig } from 'vite';
import commonjs from 'vite-plugin-commonjs';

export default defineConfig({
    base: '',   // allow relative URLs
    plugins: [commonjs()],
});
