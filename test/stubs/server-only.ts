// The `server-only` package's real entry point is a bare `throw`, inert only
// under Next's `react-server` export condition, which Vitest does not supply.
// Vitest aliases the package to this empty module so that server modules can be
// imported under test. See vitest.config.ts.
export {};
