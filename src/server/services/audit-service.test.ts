import { describe, expect, it } from "vitest";

describe("vitest harness", () => {
  it("resolves the @/ path alias and the server-only stub", async () => {
    const auditService = await import("@/server/services/audit-service");

    expect(typeof auditService.writeAuditLog).toBe("function");
  });
});
