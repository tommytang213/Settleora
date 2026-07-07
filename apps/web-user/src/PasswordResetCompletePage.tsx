import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  completePasswordReset,
  parseResetMaterialFromHash,
  scrubPasswordResetFragment,
  validateNewPassword,
  PASSWORD_RESET_INVALID_LINK_MESSAGE,
  type PasswordResetCompleteClient
} from "./passwordResetComplete";

type ResetCompleteViewState = "form" | "submitting" | "success" | "invalid_link";

export interface PasswordResetCompletePageProps {
  client?: PasswordResetCompleteClient;
}

export function PasswordResetCompletePage({ client }: PasswordResetCompletePageProps) {
  const resetMaterial = useMemo(() => parseResetMaterialFromHash(window.location.hash), []);
  const [viewState, setViewState] = useState<ResetCompleteViewState>(() =>
    resetMaterial ? "form" : "invalid_link"
  );
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    resetMaterial ? null : PASSWORD_RESET_INVALID_LINK_MESSAGE
  );

  useEffect(() => {
    scrubPasswordResetFragment(window.location, window.history);
  }, []);

  const returnToSignIn = () => {
    window.location.assign("/");
  };

  const requestNewLink = () => {
    window.location.assign("/");
  };

  const submitReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!resetMaterial || viewState === "submitting") {
      return;
    }

    const validation = validateNewPassword(newPassword, confirmPassword);
    if (validation.status !== "valid") {
      setErrorMessage(validation.message ?? null);
      return;
    }

    setViewState("submitting");
    setErrorMessage(null);

    const result = await completePasswordReset(resetMaterial, newPassword, { client });

    if (result.status === "completed") {
      setNewPassword("");
      setConfirmPassword("");
      setViewState("success");
      return;
    }

    setErrorMessage(result.message);
    setViewState("invalid_link");
  };

  return (
    <main className="reset-page" aria-labelledby="reset-title">
      <section className="reset-panel" aria-live="polite">
        <div className="brand-lockup reset-brand">
          <div className="brand-mark" aria-hidden="true">
            S
          </div>
          <div>
            <p className="eyebrow">Settleora</p>
            <h1 id="reset-title">{titleForState(viewState)}</h1>
          </div>
        </div>

        {viewState === "success" ? (
          <ResetStateBody
            body="You can sign in with your new password. For your security, other sessions may have been ended."
            primaryLabel="Back to sign in"
            onPrimary={returnToSignIn}
          />
        ) : viewState === "invalid_link" ? (
          <ResetStateBody
            body="This reset link cannot be used. Request a new link to continue."
            primaryLabel="Request a new link"
            secondaryLabel="Back to sign in"
            onPrimary={requestNewLink}
            onSecondary={returnToSignIn}
          />
        ) : (
          <form className="reset-form" onSubmit={submitReset}>
            <p className="reset-copy">Choose a new password for your Settleora account.</p>

            <label className="form-field">
              <span>New password</span>
              <input
                autoComplete="new-password"
                disabled={viewState === "submitting"}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                value={newPassword}
              />
            </label>

            <label className="form-field">
              <span>Confirm new password</span>
              <input
                autoComplete="new-password"
                disabled={viewState === "submitting"}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                value={confirmPassword}
              />
            </label>

            {errorMessage ? (
              <p className="form-error" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <div className="reset-actions">
              <button className="primary-button" disabled={viewState === "submitting"} type="submit">
                {viewState === "submitting" ? "Setting password" : "Set new password"}
              </button>
              <button className="secondary-button" onClick={returnToSignIn} type="button">
                Back to sign in
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

interface ResetStateBodyProps {
  body: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
}

function ResetStateBody({
  body,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary
}: ResetStateBodyProps) {
  return (
    <div className="reset-state-body">
      <p className="reset-copy">{body}</p>
      <div className="reset-actions">
        <button className="primary-button" onClick={onPrimary} type="button">
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary ? (
          <button className="secondary-button" onClick={onSecondary} type="button">
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function titleForState(viewState: ResetCompleteViewState): string {
  if (viewState === "success") {
    return "Password updated";
  }

  if (viewState === "invalid_link") {
    return "Reset link unavailable";
  }

  return "Set a new password";
}
