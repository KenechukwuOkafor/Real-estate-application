import { fileURLToPath } from "node:url";

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Rendered-page suites. Local only, run with `npm run test:rendered`.
 *
 * A separate config rather than a flag on the default run, and the suites live
 * outside `src/` so the default `include` cannot pick them up by accident.
 *
 * The reason is CI's zero-skipped assertion. These need a running application,
 * which CI has no server for, so under the default run they would skip — and a
 * skipped suite in CI reports success for work it never did, which is the exact
 * failure the pipeline's skip guard exists to catch. Keeping them out of that
 * run entirely means they never skip; they simply are not part of it.
 *
 * There is deliberately no CI job that builds and starts the app for these. See
 * test/helpers/rendered-page.ts.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // Explicit, unlike the default config, which gets `@/` from
      // vite-tsconfig-paths. That plugin only applies the alias to files the
      // tsconfig includes, and these suites live outside `src/`. The existing
      // helpers get away with `@/` imports because theirs are type-only and
      // erased before anything has to resolve them; this helper imports a real
      // value.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["test/rendered/**/*.rendered.test.ts"],
    // Each suite arranges fixtures in the shared local database, so two running
    // at once would fight over the same rows.
    fileParallelism: false,
    setupFiles: ["./test/setup-env.ts"],
    testTimeout: 30_000,
  },
});
