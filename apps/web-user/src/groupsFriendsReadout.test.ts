import { describe, expect, it, vi } from "vitest";
import {
  createFriendsUnavailableReadout,
  filterGroupsForPresentation,
  groupBillsListQuery,
  loadGroupBillDetailReadout,
  loadGroupDetailReadout,
  loadGroupsReadout,
  summarizeGroupRoles,
  type GroupsReadoutOptions
} from "./groupsFriendsReadout";
import { SettleoraApiError, type GroupBillResponse, type GroupMemberResponse, type GroupResponse } from "../../../packages/client-web/src/generated";

const visibleGroup: GroupResponse = {
  id: "group-1",
  name: "Weekend House",
  currentUserRole: "owner",
  currentUserStatus: "active",
  createdAtUtc: "2026-06-28T10:00:00Z",
  updatedAtUtc: "2026-06-28T10:00:00Z"
};

const visibleMember: GroupMemberResponse = {
  userProfileId: "profile-1",
  displayName: "Tommy",
  role: "owner",
  status: "active",
  joinedAtUtc: "2026-06-28T10:00:00Z",
  updatedAtUtc: "2026-06-28T10:00:00Z"
};

const visibleGroupBill: GroupBillResponse = {
  id: "group-bill-1",
  groupId: visibleGroup.id,
  merchantName: "Harbour Market",
  billDate: "2026-06-28",
  status: "confirmed",
  reconciliation: {
    status: "unreconciled",
    updatedAtUtc: null,
    updatedByUserProfileId: null,
    reconciledAtUtc: null,
    note: null
  },
  revisionCreationActions: {
    canCreateRevision: false
  },
  totalAmount: "128.50",
  totalCurrency: "HKD",
  createdAtUtc: "2026-06-28T10:00:00Z",
  updatedAtUtc: "2026-06-28T10:00:00Z",
  items: [],
  participants: [],
  payers: [],
  adjustments: [],
  calculatedAdjustmentAllocations: []
};

describe("groups and friends readout adapter", () => {
  it("does not call generated group methods without a verified credential", async () => {
    const client = {
      listGroups: vi.fn()
    };

    await expect(
      loadGroupsReadout({ accessToken: null, client: client as unknown as GroupsReadoutOptions["client"] })
    ).resolves.toMatchObject({
      status: "auth_required",
      groups: []
    });
    expect(client.listGroups).not.toHaveBeenCalled();
  });

  it("loads groups through the generated client read method", async () => {
    const client = {
      listGroups: vi.fn().mockResolvedValue({ groups: [visibleGroup] })
    };

    await expect(
      loadGroupsReadout({ accessToken: "session-token", client: client as unknown as GroupsReadoutOptions["client"] })
    ).resolves.toMatchObject({
      status: "loaded",
      groups: [visibleGroup]
    });
    expect(client.listGroups).toHaveBeenCalledWith({ accessToken: "session-token" });
  });

  it("loads group detail, members, and group bills through generated client read methods", async () => {
    const client = {
      getGroup: vi.fn().mockResolvedValue(visibleGroup),
      listGroupMembers: vi.fn().mockResolvedValue({ members: [visibleMember] }),
      listGroupBills: vi.fn().mockResolvedValue({ bills: [visibleGroupBill] })
    };

    await expect(
      loadGroupDetailReadout({
        accessToken: "session-token",
        groupId: visibleGroup.id,
        client: client as unknown as GroupsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "loaded",
      group: visibleGroup,
      members: { members: [visibleMember] },
      bills: { bills: [visibleGroupBill] }
    });
    expect(client.getGroup).toHaveBeenCalledWith(visibleGroup.id, { accessToken: "session-token" });
    expect(client.listGroupMembers).toHaveBeenCalledWith(visibleGroup.id, { accessToken: "session-token" });
    expect(client.listGroupBills).toHaveBeenCalledWith(
      visibleGroup.id,
      { accessToken: "session-token" },
      groupBillsListQuery
    );
  });

  it("does not call group bill detail without a verified credential", async () => {
    const client = {
      getGroupBill: vi.fn()
    };

    await expect(
      loadGroupBillDetailReadout({
        accessToken: null,
        groupId: visibleGroup.id,
        billId: visibleGroupBill.id,
        client: client as unknown as GroupsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "auth_required"
    });
    expect(client.getGroupBill).not.toHaveBeenCalled();
  });

  it("loads group bill detail through the group-scoped generated client read method", async () => {
    const client = {
      getGroupBill: vi.fn().mockResolvedValue(visibleGroupBill)
    };

    await expect(
      loadGroupBillDetailReadout({
        accessToken: "session-token",
        groupId: visibleGroup.id,
        billId: visibleGroupBill.id,
        client: client as unknown as GroupsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "loaded",
      bill: visibleGroupBill
    });
    expect(client.getGroupBill).toHaveBeenCalledWith(visibleGroup.id, visibleGroupBill.id, {
      accessToken: "session-token"
    });
  });

  it("reports empty, unavailable, and error states without fake group bill data", async () => {
    await expect(
      loadGroupDetailReadout({
        accessToken: "session-token",
        groupId: visibleGroup.id,
        client: {
          getGroup: vi.fn().mockResolvedValue(visibleGroup),
          listGroupMembers: vi.fn().mockResolvedValue({ members: [] }),
          listGroupBills: vi.fn().mockResolvedValue({ bills: [] })
        } as unknown as GroupsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "loaded",
      bills: { bills: [] }
    });

    await expect(
      loadGroupBillDetailReadout({
        accessToken: "session-token",
        groupId: visibleGroup.id,
        billId: visibleGroupBill.id,
        client: {
          getGroupBill: vi.fn().mockRejectedValue(new SettleoraApiError(403, "Forbidden", {}))
        } as unknown as GroupsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "unavailable"
    });

    await expect(
      loadGroupBillDetailReadout({
        accessToken: "session-token",
        groupId: visibleGroup.id,
        billId: visibleGroupBill.id,
        client: {
          getGroupBill: vi.fn().mockRejectedValue(new Error("network"))
        } as unknown as GroupsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "error"
    });
  });

  it("filters only loaded presentation group rows", () => {
    expect(filterGroupsForPresentation([visibleGroup], "weekend")).toEqual([visibleGroup]);
    expect(filterGroupsForPresentation([visibleGroup], "missing")).toEqual([]);
    expect(summarizeGroupRoles([visibleGroup])).toEqual([{ label: "owner", count: 1 }]);
  });

  it("keeps friends and direct sharing explicitly unavailable without generated reads", () => {
    expect(createFriendsUnavailableReadout()).toMatchObject({
      status: "unavailable",
      missingCoverage: expect.arrayContaining(["Friend discovery and relationship reads"])
    });
  });
});
