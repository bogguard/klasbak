// Bundles each Lambda into services/api/dist/<name>/handler.mjs; `sam deploy` uploads those folders.
// We bundle ourselves (instead of SAM's esbuild builder) because SAM runs `npm install` inside
// the workspace, which removes the monorepo's dev dependencies.
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

const functions = {
  catalog: 'services/api/src/catalog/handler.ts',
  'search-indexer': 'services/api/src/search-indexer/handler.ts',
  readers: 'services/api/src/readers/handler.ts',
  circulation: 'services/api/src/circulation/handler.ts',
  retention: 'services/api/src/retention/handler.ts',
  staff: 'services/api/src/staff/handler.ts',
};

await rm('services/api/dist', { recursive: true, force: true });

await Promise.all(
  Object.entries(functions).map(([name, entry]) =>
    build({
      entryPoints: [entry],
      outfile: `services/api/dist/${name}/handler.mjs`,
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'esm',
      minify: true,
      sourcemap: true,
      // Some CommonJS dependencies still call require(); make it available in ESM output.
      banner: {
        js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
      logLevel: 'warning',
    }),
  ),
);

console.log(`Built ${Object.keys(functions).length} functions into services/api/dist`);
