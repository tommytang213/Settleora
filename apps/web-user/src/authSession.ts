import {
  SettleoraApiClient,
  SettleoraApiError,
  type CurrentUserResponse,
  type SessionListResponse
} from "../../../packages/client-web/src/generated";

export type SessionBoundaryStatus =
  | "auth_required"
  | "checking"
  | "authenticated"
  | "session_expired"
  | "unavailable"
  | "error";

export interface SessionBoundaryState {
  status: SessionBoundaryStatus;
  currentUser?: CurrentUserResponse;
  sessions?: SessionListResponse;
  accessToken?: string;
  message: string;
}

export interface SessionBoundaryOptions {
  baseUrl?: string;
  accessToken?: string | null;
}

export function createInitialSessionBoundaryState(): SessionBoundaryState {
  return {
    status: "auth_required",
    message:
      "Sign in is required before Settleora can show personal bills, groups, settlements, reports, or account details on the web."
  };
}

export async function loadSessionBoundaryState(
  options: SessionBoundaryOptions
): Promise<SessionBoundaryState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return createInitialSessionBoundaryState();
  }

  const client = new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    const [currentUser, sessions] = await Promise.all([
      client.getCurrentUser({ accessToken }),
      client.listCurrentAccountSessions({ accessToken })
    ]);

    return {
      status: "authenticated",
      currentUser,
      sessions,
      accessToken,
      message: "Session verified by Settleora."
    };
  } catch (error) {
    if (error instanceof SettleoraApiError && error.status === 401) {
      return {
        status: "session_expired",
        message: "Your session could not be verified. Sign in again before opening protected information."
      };
    }

    if (error instanceof SettleoraApiError && error.status === 403) {
      return {
        status: "unavailable",
        message: "This account cannot open the requested Settleora web area."
      };
    }

    return {
      status: "error",
      message: "Settleora could not confirm the current session. Try again when the server is reachable."
    };
  }
}
