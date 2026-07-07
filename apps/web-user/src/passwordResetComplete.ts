import {
  SettleoraApiClient,
  SettleoraApiError,
  type LocalPasswordResetCompleteRequest
} from "../../../packages/client-web/src/generated";

export const PASSWORD_RESET_PATH = "/auth/password-reset";
export const PASSWORD_RESET_INVALID_LINK_MESSAGE =
  "This reset link cannot be used. Request a new link to continue.";
export const PASSWORD_RESET_STRONGER_PASSWORD_MESSAGE = "Choose a stronger password.";

export type PasswordResetValidationStatus =
  | "valid"
  | "empty_password"
  | "empty_confirmation"
  | "mismatch"
  | "weak_password";

export interface PasswordResetValidationResult {
  status: PasswordResetValidationStatus;
  message?: string;
}

export interface PasswordResetCompleteClient {
  completeLocalPasswordReset(body: LocalPasswordResetCompleteRequest): Promise<void>;
}

export interface PasswordResetCompleteOptions {
  baseUrl?: string;
  client?: PasswordResetCompleteClient;
}

export type PasswordResetCompleteResult =
  | { status: "completed" }
  | { status: "invalid_link"; message: string };

export function isPasswordResetCompletePath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === PASSWORD_RESET_PATH;
}

export function parseResetMaterialFromHash(hash: string): string | null {
  const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;

  if (!rawHash || rawHash.startsWith("/")) {
    return null;
  }

  try {
    decodeURIComponent(rawHash.replace(/\+/g, "%20"));

    const parameters = new URLSearchParams(rawHash);
    const resetMaterial = parameters.get("resetMaterial")?.trim();

    return resetMaterial ? resetMaterial : null;
  } catch {
    return null;
  }
}

export function scrubPasswordResetFragment(location: Location, history: History): void {
  if (!location.hash) {
    return;
  }

  history.replaceState(null, document.title, `${location.pathname}${location.search}`);
}

export function validateNewPassword(
  newPassword: string,
  confirmPassword: string
): PasswordResetValidationResult {
  if (!newPassword) {
    return { status: "empty_password", message: "Enter a new password." };
  }

  if (!confirmPassword) {
    return { status: "empty_confirmation", message: "Confirm your new password." };
  }

  if (newPassword !== confirmPassword) {
    return { status: "mismatch", message: "The passwords do not match." };
  }

  if (newPassword.length < 8) {
    return { status: "weak_password", message: PASSWORD_RESET_STRONGER_PASSWORD_MESSAGE };
  }

  return { status: "valid" };
}

export async function completePasswordReset(
  resetMaterial: string,
  newPassword: string,
  options: PasswordResetCompleteOptions = {}
): Promise<PasswordResetCompleteResult> {
  const client =
    options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    await client.completeLocalPasswordReset({ resetMaterial, newPassword });

    return { status: "completed" };
  } catch (error) {
    return { status: "invalid_link", message: PASSWORD_RESET_INVALID_LINK_MESSAGE };
  }
}
