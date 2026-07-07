import { describe, expect, it, vi } from "vitest";
import { SettleoraApiError } from "../../../packages/client-web/src/generated";
import {
  completePasswordReset,
  isPasswordResetCompletePath,
  parseResetMaterialFromHash,
  scrubPasswordResetFragment,
  validateNewPassword
} from "./passwordResetComplete";

describe("password reset complete helpers", () => {
  it("detects only the approved public reset-complete path", () => {
    expect(isPasswordResetCompletePath("/auth/password-reset")).toBe(true);
    expect(isPasswordResetCompletePath("/auth/password-reset/")).toBe(true);
    expect(isPasswordResetCompletePath("/")).toBe(false);
    expect(isPasswordResetCompletePath("/api/v1/auth/password-reset/complete")).toBe(false);
  });

  it("parses reset material from the backend email fragment shape", () => {
    expect(parseResetMaterialFromHash("#resetMaterial=raw-reset-material")).toBe(
      "raw-reset-material"
    );
    expect(parseResetMaterialFromHash("#resetMaterial=raw%20material%2Bvalue")).toBe(
      "raw material+value"
    );
  });

  it("treats missing empty and malformed fragments as unusable", () => {
    expect(parseResetMaterialFromHash("")).toBeNull();
    expect(parseResetMaterialFromHash("#resetMaterial=")).toBeNull();
    expect(parseResetMaterialFromHash("#/home")).toBeNull();
    expect(parseResetMaterialFromHash("#notResetMaterial=value")).toBeNull();
    expect(parseResetMaterialFromHash("#resetMaterial=%E0%A4%A")).toBeNull();
  });

  it("scrubs the reset fragment without changing the path or query", () => {
    window.history.pushState(null, "", "/auth/password-reset?source=email#resetMaterial=secret");

    scrubPasswordResetFragment(window.location, window.history);

    expect(window.location.pathname).toBe("/auth/password-reset");
    expect(window.location.search).toBe("?source=email");
    expect(window.location.hash).toBe("");
  });

  it("validates password and confirmation copy", () => {
    expect(validateNewPassword("", "")).toMatchObject({
      status: "empty_password",
      message: "Enter a new password."
    });
    expect(validateNewPassword("new-password", "")).toMatchObject({
      status: "empty_confirmation",
      message: "Confirm your new password."
    });
    expect(validateNewPassword("new-password", "different-password")).toMatchObject({
      status: "mismatch",
      message: "The passwords do not match."
    });
    expect(validateNewPassword("short", "short")).toMatchObject({
      status: "weak_password",
      message: "Choose a stronger password."
    });
    expect(validateNewPassword("12345678901", "12345678901")).toMatchObject({
      status: "weak_password",
      message: "Choose a stronger password."
    });
    expect(validateNewPassword("123456789012", "123456789012")).toMatchObject({
      status: "valid"
    });
    expect(validateNewPassword("strong-password", "strong-password")).toMatchObject({
      status: "valid"
    });
  });

  it("calls generated completion with only reset material and new password", async () => {
    const completeLocalPasswordReset = vi.fn().mockResolvedValue(undefined);

    await expect(
      completePasswordReset("raw-material", "strong-password", {
        client: { completeLocalPasswordReset }
      })
    ).resolves.toEqual({ status: "completed" });

    expect(completeLocalPasswordReset).toHaveBeenCalledTimes(1);
    expect(completeLocalPasswordReset).toHaveBeenCalledWith({
      resetMaterial: "raw-material",
      newPassword: "strong-password"
    });
    expect(Object.keys(completeLocalPasswordReset.mock.calls[0][0]).sort()).toEqual([
      "newPassword",
      "resetMaterial"
    ]);
  });

  it("maps API 400 responses to generic invalid-link copy because reset and password failures share one safe shape", async () => {
    const completeLocalPasswordReset = vi
      .fn()
      .mockRejectedValue(new SettleoraApiError(400, "Bad Request", {}));

    await expect(
      completePasswordReset("raw-material", "rejected-password", {
        client: { completeLocalPasswordReset }
      })
    ).resolves.toEqual({
      status: "invalid_link",
      message: "This reset link cannot be used. Request a new link to continue."
    });
  });

  it("maps problem responses to the generic invalid-link family without echoing secrets", async () => {
    const resetMaterial = "raw-material-secret";
    const newPassword = "new-password-secret";
    const completeLocalPasswordReset = vi
      .fn()
      .mockRejectedValue(new SettleoraApiError(410, "Gone", { detail: resetMaterial }));

    const result = await completePasswordReset(resetMaterial, newPassword, {
      client: { completeLocalPasswordReset }
    });

    expect(result).toEqual({
      status: "invalid_link",
      message: "This reset link cannot be used. Request a new link to continue."
    });
    expect(JSON.stringify(result)).not.toContain(resetMaterial);
    expect(JSON.stringify(result)).not.toContain(newPassword);
    expect(JSON.stringify(result)).not.toMatch(/expired|consumed|replay|revoked|token/i);
  });
});
