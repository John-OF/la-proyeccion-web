import { defineConfig } from 'vite';

// base './' produce rutas relativas en el build: requisito para que el mismo
// dist/ funcione tal cual en itch.io y en GitHub Pages (sin backend).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
});
