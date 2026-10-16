import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Local development talks to a deployed dev stack; set its URL in apps/web/.env.local.
  const { VITE_PROXY_TARGET: target } = loadEnv(mode, process.cwd(), '');
  const proxy = target
    ? Object.fromEntries(
        ['/api', '/search', '/covers', '/branding', '/config.json'].map((path) => [
          path,
          { target, changeOrigin: true },
        ]),
      )
    : undefined;

  return {
    plugins: [react(), tailwindcss()],
    server: { proxy },
  };
});
