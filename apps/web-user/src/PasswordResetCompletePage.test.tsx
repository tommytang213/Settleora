import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordResetCompletePage } from "./PasswordResetCompletePage";
import { App } from "./App";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }

  root = null;
  container?.remove();
  container = null;
  window.history.pushState(null, "", "/");
  vi.restoreAllMocks();
});

describe("password reset complete page", () => {
  it("shows the generic invalid-link state when reset material is missing", async () => {
    window.history.pushState(null, "", "/auth/password-reset");

    await render(<PasswordResetCompletePage />);

    expect(document.body.textContent).toContain("Reset link unavailable");
    expect(document.body.textContent).toContain(
      "This reset link cannot be used. Request a new link to continue."
    );
    expect(document.body.textContent).toContain("Request a new link");
    expect(document.body.textContent).toContain("Back to sign in");
  });

  it("shows client validation without calling the API", async () => {
    const completeLocalPasswordReset = vi.fn().mockResolvedValue(undefined);
    window.history.pushState(null, "", "/auth/password-reset#resetMaterial=raw-material");

    await render(<PasswordResetCompletePage client={{ completeLocalPasswordReset }} />);
    await submitForm();

    expect(document.body.textContent).toContain("Enter a new password.");
    expect(completeLocalPasswordReset).not.toHaveBeenCalled();
  });

  it("rejects 8 through 11 character passwords before calling the API", async () => {
    const completeLocalPasswordReset = vi.fn().mockResolvedValue(undefined);

    for (const password of ["12345678", "123456789", "1234567890", "12345678901"]) {
      window.history.pushState(null, "", "/auth/password-reset#resetMaterial=raw-material");

      await render(<PasswordResetCompletePage client={{ completeLocalPasswordReset }} />);
      await fillPasswords(password, password);
      await submitForm();

      expect(document.body.textContent).toContain("Choose a stronger password.");
      expect(completeLocalPasswordReset).not.toHaveBeenCalled();

      await unmountRenderedPage();
    }
  });

  it("submits completion and shows the success state without rendering sensitive values", async () => {
    const resetMaterial = "raw-material-secret";
    const newPassword = "new-password-secret";
    const completeLocalPasswordReset = vi.fn().mockResolvedValue(undefined);
    window.history.pushState(null, "", `/auth/password-reset#resetMaterial=${resetMaterial}`);

    await render(<PasswordResetCompletePage client={{ completeLocalPasswordReset }} />);
    await fillPasswords(newPassword, newPassword);
    await submitForm();

    expect(completeLocalPasswordReset).toHaveBeenCalledWith({
      resetMaterial,
      newPassword
    });
    expect(document.body.textContent).toContain("Password updated");
    expect(document.body.textContent).toContain(
      "You can sign in with your new password. For your security, other sessions may have been ended."
    );
    expect(document.body.textContent).not.toContain(resetMaterial);
    expect(document.body.textContent).not.toContain(newPassword);
  });

  it("maps API problems to the generic invalid-link state", async () => {
    const resetMaterial = "raw-material-secret";
    const newPassword = "new-password-secret";
    const completeLocalPasswordReset = vi.fn().mockRejectedValue(new Error(resetMaterial));
    window.history.pushState(null, "", `/auth/password-reset#resetMaterial=${resetMaterial}`);

    await render(<PasswordResetCompletePage client={{ completeLocalPasswordReset }} />);
    await fillPasswords(newPassword, newPassword);
    await submitForm();

    expect(document.body.textContent).toContain("Reset link unavailable");
    expect(document.body.textContent).toContain(
      "This reset link cannot be used. Request a new link to continue."
    );
    expect(document.body.textContent).not.toContain(resetMaterial);
    expect(document.body.textContent).not.toContain(newPassword);
  });

  it("scrubs reset material from the visible URL after capture", async () => {
    window.history.pushState(null, "", "/auth/password-reset#resetMaterial=raw-material");

    await render(<PasswordResetCompletePage />);

    expect(window.location.pathname).toBe("/auth/password-reset");
    expect(window.location.hash).toBe("");
  });

  it("does not use browser storage or auth/session methods for reset completion", async () => {
    const completeLocalPasswordReset = vi.fn().mockResolvedValue(undefined);
    const getCurrentUser = vi.fn();
    const listCurrentAccountSessions = vi.fn();
    const storageSet = vi.spyOn(Storage.prototype, "setItem");
    window.history.pushState(null, "", "/auth/password-reset#resetMaterial=raw-material");

    await render(<PasswordResetCompletePage client={{ completeLocalPasswordReset }} />);
    await fillPasswords("strong-password", "strong-password");
    await submitForm();

    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(listCurrentAccountSessions).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
  });

  it("routes App to the public reset page before the protected shell hash router", async () => {
    window.history.pushState(null, "", "/auth/password-reset#resetMaterial=raw-material");

    await render(<App />);

    expect(document.body.textContent).toContain("Set a new password");
    expect(document.body.textContent).not.toContain("Checking whether a verified Settleora web session is available.");
  });
});

async function render(element: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(element);
  });
}

async function unmountRenderedPage() {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }

  root = null;
  container?.remove();
  container = null;
}

async function fillPasswords(newPassword: string, confirmPassword: string) {
  const inputs = Array.from(document.querySelectorAll("input"));

  await act(async () => {
    setNativeInputValue(inputs[0], newPassword);
    inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    setNativeInputValue(inputs[1], confirmPassword);
    inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitForm() {
  const form = document.querySelector("form");
  if (!form) {
    throw new Error("Expected password reset form to render.");
  }

  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  valueSetter?.call(input, value);
}
