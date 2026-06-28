import { describe, expect, it, vi } from "vitest";
import {
  createFriendsUnavailableReadout,
  filterGroupsForPresentation,
  loadGroupDetailReadout,
  loadGroupsReadout,
  summarizeGroupRoles,
  type GroupsReadoutOptions
} from "./groupsFriendsReadout";
import type { GroupMemberResponse, GroupResponse } from "../../../packages/client-web/src/generated";

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

  it("loads group detail and members through generated client read methods", async () => {
    const client = {
      getGroup: vi.fn().mockResolvedValue(visibleGroup),
      listGroupMembers: vi.fn().mockResolvedValue({ members: [visibleMember] })
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
      members: { members: [visibleMember] }
    });
    expect(client.getGroup).toHaveBeenCalledWith(visibleGroup.id, { accessToken: "session-token" });
    expect(client.listGroupMembers).toHaveBeenCalledWith(visibleGroup.id, { accessToken: "session-token" });
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
