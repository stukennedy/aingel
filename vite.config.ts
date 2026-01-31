import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import ssrPlugin from 'vite-ssr-components/plugin';
import path from 'path';

export default defineConfig({
  plugins: [cloudflare(), ssrPlugin()],
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@client': path.resolve(__dirname, './src/client'),
    },
  },
});
