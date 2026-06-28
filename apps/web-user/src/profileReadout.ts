import {
  SettleoraApiClient,
  SettleoraApiError,
  type PaymentDetailsVisibility,
  type SelfPaymentDetailsResponse,
  type SelfUserProfileResponse
} from "../../../packages/client-web/src/generated";
import { labelize } from "./billsReadout";

export type ProfileReadoutStatus =
  | "auth_required"
  | "loading"
  | "loaded"
  | "empty"
  | "session_expired"
  | "unavailable"
  | "error";

export interface ProfilePaymentReadoutState {
  status: ProfileReadoutStatus;
  message: string;
  profile?: SelfUserProfileResponse;
  paymentDetails?: SelfPaymentDetailsResponse;
  unavailableSections: string[];
}

export interface ProfilePaymentReadoutOptions {
  accessToken?: string | null;
  baseUrl?: string;
  client?: Pick<SettleoraApiClient, "getSelfUserProfile" | "getSelfPaymentDetails">;
}

export async function loadProfilePaymentReadout(
  options: ProfilePaymentReadoutOptions
): Promise<ProfilePaymentReadoutState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can show profile and payment details on the web.",
      unavailableSections: globalUnavailableSections
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    const [profile, paymentDetails] = await Promise.all([
      client.getSelfUserProfile({ accessToken }),
      client.getSelfPaymentDetails({ accessToken })
    ]);

    return {
      status: "loaded",
      message: paymentDetails.isConfigured
        ? "Profile and payment detail metadata loaded from Settleora."
        : "Profile loaded from Settleora. Payment details are not configured for this account.",
      profile,
      paymentDetails,
      unavailableSections: globalUnavailableSections
    };
  } catch (error) {
    return toProfilePaymentFailure(
      error,
      "Settleora could not load profile or payment details. No private account details were shown."
    );
  }
}

export function summarizePaymentConfiguration(
  paymentDetails: SelfPaymentDetailsResponse | undefined
): Array<{ label: string; value: string }> {
  if (!paymentDetails) {
    return [
      { label: "Payment details", value: "Not loaded" },
      { label: "QR metadata", value: "Not loaded" },
      { label: "Visibility", value: "Not loaded" }
    ];
  }

  return [
    { label: "Payment details", value: paymentDetails.isConfigured ? "Configured" : "Not configured" },
    { label: "QR metadata", value: paymentDetails.qrFile ? "Linked" : "Not linked" },
    { label: "Visibility", value: formatPaymentVisibility(paymentDetails.visibility) }
  ];
}

export function formatPaymentVisibility(visibility: PaymentDetailsVisibility): string {
  return labelize(visibility);
}

const globalUnavailableSections = [
  "Counterparty payment details require a settlement-scoped authorized route and are not loaded globally from Profile.",
  "QR/payment image bytes are outside this readout; only server-returned QR metadata is displayed when present.",
  "Profile and payment detail edits, visibility changes, uploads, removals, and storage-content reads require separate reviewed slices."
];

function toProfilePaymentFailure(error: unknown, fallback: string): ProfilePaymentReadoutState {
  const detail = classifyApiFailure(error, fallback);

  return {
    status: detail.status,
    message: detail.message,
    unavailableSections: globalUnavailableSections
  };
}

function classifyApiFailure(
  error: unknown,
  fallback: string
): { status: Exclude<ProfileReadoutStatus, "loading" | "loaded" | "empty">; message: string } {
  if (error instanceof SettleoraApiError && error.status === 401) {
    return {
      status: "session_expired",
      message: "Your session could not be verified. Sign in again before opening profile and payment details."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 403) {
    return {
      status: "unavailable",
      message: "This account cannot open the requested profile or payment detail information."
    };
  }

  return {
    status: "error",
    message: fallback
  };
}
