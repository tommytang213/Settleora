import { describe, expect, it } from "vitest";
import { createInitialSessionBoundaryState, loadSessionBoundaryState } from "./authSession";

describe("auth session boundary", () => {
  it("starts auth-required when no web credential source is available", async () => {
    await expect(loadSessionBoundaryState({ accessToken: null })).resolves.toMatchObject({
      status: "auth_required"
    });
  });

  it("uses privacy-safe auth-required copy", () => {
    const state = createInitialSessionBoundaryState();

    expect(state.message).toContain("Sign in is required");
    expect(state.message).not.toMatch(/token|endpoint|generated|DTO|debug|stack/i);
  });
});
