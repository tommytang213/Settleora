import {
  SettleoraApiClient,
  SettleoraApiError,
  type ExpenseBillArchiveState,
  type GroupBillListResponse,
  type GroupBillResponse,
  type GroupListResponse,
  type GroupMemberListResponse,
  type GroupMembershipStatus,
  type GroupResponse,
  type GroupRole
} from "../../../packages/client-web/src/generated";

export type GroupsReadoutStatus =
  | "auth_required"
  | "loading"
  | "loaded"
  | "empty"
  | "session_expired"
  | "unavailable"
  | "error";

export interface GroupsReadoutState {
  status: GroupsReadoutStatus;
  message: string;
  groups: GroupResponse[];
}

export interface GroupDetailReadoutState {
  status: GroupsReadoutStatus;
  message: string;
  group?: GroupResponse;
  members?: GroupMemberListResponse;
  bills?: GroupBillListResponse;
}

export interface GroupBillDetailReadoutState {
  status: GroupsReadoutStatus;
  message: string;
  bill?: GroupBillResponse;
}

export interface FriendsReadoutState {
  status: "unavailable";
  message: string;
  missingCoverage: string[];
}

export interface GroupsReadoutOptions {
  accessToken?: string | null;
  baseUrl?: string;
  client?: Pick<SettleoraApiClient, "listGroups" | "getGroup" | "listGroupMembers" | "listGroupBills" | "getGroupBill">;
}

export const groupBillsListQuery = {
  archiveState: "all" as ExpenseBillArchiveState,
  limit: 50
};

export async function loadGroupsReadout(options: GroupsReadoutOptions): Promise<GroupsReadoutState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can show your groups on the web.",
      groups: []
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    const response: GroupListResponse = await client.listGroups({ accessToken });

    if (response.groups.length === 0) {
      return {
        status: "empty",
        message: "No visible groups are available for this account yet.",
        groups: []
      };
    }

    return {
      status: "loaded",
      message: `${response.groups.length} visible group${response.groups.length === 1 ? "" : "s"} loaded from Settleora.`,
      groups: response.groups
    };
  } catch (error) {
    return toGroupsReadoutFailure(error, "Settleora could not load visible groups. No private group details were shown.");
  }
}

export async function loadGroupDetailReadout(
  options: GroupsReadoutOptions & { groupId: string }
): Promise<GroupDetailReadoutState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can show group details."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    const [group, members, bills] = await Promise.all([
      client.getGroup(options.groupId, { accessToken }),
      client.listGroupMembers(options.groupId, { accessToken }),
      client.listGroupBills(options.groupId, { accessToken }, groupBillsListQuery)
    ]);

    return {
      status: "loaded",
      message: "Group detail loaded from Settleora.",
      group,
      members,
      bills
    };
  } catch (error) {
    return toGroupsDetailFailure(error, "Settleora could not load this group detail. No private group details were shown.");
  }
}

export async function loadGroupBillDetailReadout(
  options: GroupsReadoutOptions & { groupId: string; billId: string }
): Promise<GroupBillDetailReadoutState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can show group bill details."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    const bill = await client.getGroupBill(options.groupId, options.billId, { accessToken });

    return {
      status: "loaded",
      message: "Group bill detail loaded from Settleora.",
      bill
    };
  } catch (error) {
    return toGroupsBillDetailFailure(
      error,
      "Settleora could not load this group bill detail. No private bill details were shown."
    );
  }
}

export function createFriendsUnavailableReadout(): FriendsReadoutState {
  return {
    status: "unavailable",
    message:
      "Friends, friend requests, and direct bill sharing are not available in the current generated web client.",
    missingCoverage: [
      "Friend discovery and relationship reads",
      "Inbound and outbound friend request reads",
      "Direct-sharing eligibility and relationship-state reads"
    ]
  };
}

export function filterGroupsForPresentation(groups: GroupResponse[], search: string): GroupResponse[] {
  const normalizedSearch = search.trim().toLowerCase();

  if (normalizedSearch.length === 0) {
    return groups;
  }

  return groups.filter(
    (group) =>
      group.name.toLowerCase().includes(normalizedSearch) ||
      group.currentUserRole.toLowerCase().includes(normalizedSearch) ||
      group.currentUserStatus.toLowerCase().includes(normalizedSearch)
  );
}

export function summarizeGroupRoles(groups: GroupResponse[]): Array<{ label: GroupRole; count: number }> {
  return countBy(groups.map((group) => group.currentUserRole)).map(([role, count]) => ({
    label: role as GroupRole,
    count
  }));
}

export function summarizeGroupStatuses(groups: GroupResponse[]): Array<{ label: GroupMembershipStatus; count: number }> {
  return countBy(groups.map((group) => group.currentUserStatus)).map(([status, count]) => ({
    label: status as GroupMembershipStatus,
    count
  }));
}

function countBy(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return Array.from(counts.entries()).sort((left, right) => left[0].localeCompare(right[0]));
}

function toGroupsReadoutFailure(error: unknown, fallback: string): GroupsReadoutState {
  const detail = classifyApiFailure(error, fallback);

  return {
    status: detail.status,
    message: detail.message,
    groups: []
  };
}

function toGroupsDetailFailure(error: unknown, fallback: string): GroupDetailReadoutState {
  return classifyApiFailure(error, fallback);
}

function toGroupsBillDetailFailure(error: unknown, fallback: string): GroupBillDetailReadoutState {
  return classifyApiFailure(error, fallback);
}

function classifyApiFailure(
  error: unknown,
  fallback: string
): { status: Exclude<GroupsReadoutStatus, "loading" | "loaded" | "empty">; message: string } {
  if (error instanceof SettleoraApiError && error.status === 401) {
    return {
      status: "session_expired",
      message: "Your session could not be verified. Sign in again before opening groups."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 403) {
    return {
      status: "unavailable",
      message: "This account cannot open the requested group information."
    };
  }

  return {
    status: "error",
    message: fallback
  };
}
