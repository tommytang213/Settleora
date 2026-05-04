using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.SignIn;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class GroupMemberManagementEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string GroupsPath = "/api/v1/groups";
    private const string WrongRawToken = "visible-wrong-group-member-session-token";
    private const string HiddenIdentifier = "hidden.member@example.test";
    private const string GroupMemberAddedAction = "group_member.added";
    private const string GroupMemberRoleUpdatedAction = "group_member.role_updated";
    private const string GroupMemberRemovedAction = "group_member.removed";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 5, 9, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 5, 9, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 5, 9, 30, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public GroupMemberManagementEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    public static TheoryData<string> UnavailableProfileStates => new()
    {
        "missing",
        "deleted-profile",
        "missing-account",
        "deleted-account",
        "disabled-account"
    };

    [Fact]
    public async Task ActiveGroupOwnerCanListMembers()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Owner Member");
        var member = await SeedAccountAsync(testFactory, "Active Member", InitialTimestamp.AddMinutes(1));
        var removed = await SeedAccountAsync(testFactory, "Removed Member", InitialTimestamp.AddMinutes(2));
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Listable Group",
            InitialTimestamp,
            null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active, InitialTimestamp),
            new MembershipSeed(member.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active, InitialTimestamp.AddMinutes(1)),
            new MembershipSeed(removed.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed, InitialTimestamp.AddMinutes(2)));
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            MembersPath(groupId),
            ownerSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        var members = await ReadMemberListPayloadAsync(response);
        Assert.Equal([ownerSession.UserProfileId, member.UserProfileId], members.Select(member => member.UserProfileId).ToArray());
        Assert.Equal(["Owner Member", "Active Member"], members.Select(member => member.DisplayName).ToArray());
        Assert.Equal([GroupMembershipRoles.Owner, GroupMembershipRoles.Member], members.Select(member => member.Role).ToArray());
        Assert.All(members, member => Assert.Equal(GroupMembershipStatuses.Active, member.Status));
    }

    [Fact]
    public async Task ActiveGroupMemberCanListMembers()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var memberSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Member Actor");
        var owner = await SeedAccountAsync(testFactory, "Owner Actor", InitialTimestamp);
        var groupId = await SeedGroupAsync(
            testFactory,
            owner.UserProfileId,
            "Member Visible Group",
            InitialTimestamp,
            null,
            new MembershipSeed(owner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(memberSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            MembersPath(groupId),
            memberSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var members = await ReadMemberListPayloadAsync(response);
        Assert.Equal(2, members.Count);
    }

    [Fact]
    public async Task UnrelatedUserGetsSafeNotFoundOnList()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var owner = await SeedAccountAsync(testFactory, "Group Owner", InitialTimestamp);
        var unrelatedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Unrelated User");
        var groupId = await SeedGroupAsync(
            testFactory,
            owner.UserProfileId,
            "Hidden Group",
            InitialTimestamp,
            null,
            new MembershipSeed(owner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            MembersPath(groupId),
            unrelatedSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertGroupMemberUnavailableProblemAsync(response);
    }

    [Theory]
    [InlineData(GroupMembershipRoles.Member)]
    [InlineData(GroupMembershipRoles.Owner)]
    public async Task OwnerCanAddExistingUserWithRequestedRole(string role)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Owner Actor");
        var target = await SeedAccountAsync(testFactory, "Target Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupWithOwnerAsync(testFactory, ownerSession.UserProfileId);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            MembersPath(groupId),
            ownerSession.RawSessionToken,
            CreateAddMemberContent(target.UserProfileId, role));

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal($"/api/v1/groups/{groupId:D}/members/{target.UserProfileId:D}", response.Headers.Location?.OriginalString);

        var payload = await ReadMemberPayloadAsync(response);
        Assert.Equal(target.UserProfileId, payload.UserProfileId);
        Assert.Equal("Target Member", payload.DisplayName);
        Assert.Equal(role, payload.Role);
        Assert.Equal(GroupMembershipStatuses.Active, payload.Status);
        Assert.Equal(WriteTimestamp, payload.JoinedAtUtc);
        Assert.Equal(WriteTimestamp, payload.UpdatedAtUtc);

        var membership = await ReadMembershipAsync(testFactory, groupId, target.UserProfileId);
        Assert.Equal(role, membership.Role);
        Assert.Equal(GroupMembershipStatuses.Active, membership.Status);

        var auditEvent = await AssertSingleGroupMembershipAuditEventAsync(
            testFactory,
            GroupMemberAddedAction,
            ownerSession.AuthAccountId,
            target.AuthAccountId,
            WriteTimestamp);
        AssertGroupMembershipAuditMetadata(
            auditEvent,
            groupId,
            target.UserProfileId,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["newRole"] = role
            });
    }

    [Fact]
    public async Task AddDefaultsToMemberRole()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Owner Actor");
        var target = await SeedAccountAsync(testFactory, "Default Role User", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupWithOwnerAsync(testFactory, ownerSession.UserProfileId);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            MembersPath(groupId),
            ownerSession.RawSessionToken,
            CreateAddMemberContent(target.UserProfileId, role: null));

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var payload = await ReadMemberPayloadAsync(response);
        Assert.Equal(GroupMembershipRoles.Member, payload.Role);
    }

    [Theory]
    [MemberData(nameof(UnavailableProfileStates))]
    public async Task AddRejectsMissingDeletedOrUnavailableProfile(string state)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Owner Actor");
        var targetProfileId = await SeedUnavailableProfileAsync(testFactory, state);
        var groupId = await SeedGroupWithOwnerAsync(testFactory, ownerSession.UserProfileId);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            MembersPath(groupId),
            ownerSession.RawSessionToken,
            CreateAddMemberContent(targetProfileId, GroupMembershipRoles.Member));

        using var response = await client.SendAsync(request);

        await AssertGroupMemberUnavailableProblemAsync(response);
        Assert.Equal(0, await CountMembershipsAsync(testFactory, groupId, targetProfileId));
    }

    [Fact]
    public async Task AddRejectsDuplicateActiveMembership()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Owner Actor");
        var target = await SeedAccountAsync(testFactory, "Already Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Duplicate Group",
            InitialTimestamp,
            null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(target.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            MembersPath(groupId),
            ownerSession.RawSessionToken,
            CreateAddMemberContent(target.UserProfileId, GroupMembershipRoles.Member));

        using var response = await client.SendAsync(request);

        await AssertGroupMemberConflictProblemAsync(response);
        Assert.Equal(1, await CountMembershipsAsync(testFactory, groupId, target.UserProfileId));
        await AssertNoGroupMembershipAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task AddRejectsRemovedExistingMembership()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Owner Actor");
        var target = await SeedAccountAsync(testFactory, "Removed Existing Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Removed Duplicate Group",
            InitialTimestamp,
            null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(target.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            MembersPath(groupId),
            ownerSession.RawSessionToken,
            CreateAddMemberContent(target.UserProfileId, GroupMembershipRoles.Member));

        using var response = await client.SendAsync(request);

        await AssertGroupMemberConflictProblemAsync(response);
        var membership = await ReadMembershipAsync(testFactory, groupId, target.UserProfileId);
        Assert.Equal(GroupMembershipStatuses.Removed, membership.Status);
        await AssertNoGroupMembershipAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task AddRejectsInvalidRole()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Owner Actor");
        var target = await SeedAccountAsync(testFactory, "Target Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupWithOwnerAsync(testFactory, ownerSession.UserProfileId);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            MembersPath(groupId),
            ownerSession.RawSessionToken,
            JsonSerializer.Serialize(new { userProfileId = target.UserProfileId, role = "admin" }));

        using var response = await client.SendAsync(request);

        await AssertInvalidGroupMemberRequestProblemAsync(response);
        Assert.Equal(0, await CountMembershipsAsync(testFactory, groupId, target.UserProfileId));
        await AssertNoGroupMembershipAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task ActiveMemberCannotAddMember()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var memberSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Member Actor");
        var owner = await SeedAccountAsync(testFactory, "Owner Actor", InitialTimestamp);
        var target = await SeedAccountAsync(testFactory, "Target Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            owner.UserProfileId,
            "Member Cannot Add",
            InitialTimestamp,
            null,
            new MembershipSeed(owner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(memberSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            MembersPath(groupId),
            memberSession.RawSessionToken,
            CreateAddMemberContent(target.UserProfileId, GroupMembershipRoles.Member));

        using var response = await client.SendAsync(request);

        await AssertGroupMemberPermissionDeniedProblemAsync(response);
        Assert.Equal(0, await CountMembershipsAsync(testFactory, groupId, target.UserProfileId));
        await AssertNoGroupMembershipAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task OwnerCanUpdateMemberRole()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Owner Actor");
        var target = await SeedAccountAsync(testFactory, "Target Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Role Update Group",
            InitialTimestamp,
            null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(target.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Patch,
            MemberPath(groupId, target.UserProfileId),
            ownerSession.RawSessionToken,
            JsonSerializer.Serialize(new { role = GroupMembershipRoles.Owner }));

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await ReadMemberPayloadAsync(response);
        Assert.Equal(target.UserProfileId, payload.UserProfileId);
        Assert.Equal(GroupMembershipRoles.Owner, payload.Role);
        Assert.Equal(WriteTimestamp, payload.UpdatedAtUtc);

        var membership = await ReadMembershipAsync(testFactory, groupId, target.UserProfileId);
        Assert.Equal(GroupMembershipRoles.Owner, membership.Role);
        Assert.Equal(WriteTimestamp, membership.UpdatedAtUtc);

        var auditEvent = await AssertSingleGroupMembershipAuditEventAsync(
            testFactory,
            GroupMemberRoleUpdatedAction,
            ownerSession.AuthAccountId,
            target.AuthAccountId,
            WriteTimestamp);
        AssertGroupMembershipAuditMetadata(
            auditEvent,
            groupId,
            target.UserProfileId,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["previousRole"] = GroupMembershipRoles.Member,
                ["newRole"] = GroupMembershipRoles.Owner
            });
    }

    [Fact]
    public async Task ActiveMemberCannotUpdateRoles()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var memberSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Member Actor");
        var owner = await SeedAccountAsync(testFactory, "Owner Actor", InitialTimestamp);
        var target = await SeedAccountAsync(testFactory, "Target Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            owner.UserProfileId,
            "Member Cannot Update",
            InitialTimestamp,
            null,
            new MembershipSeed(owner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(memberSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(target.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Patch,
            MemberPath(groupId, target.UserProfileId),
            memberSession.RawSessionToken,
            JsonSerializer.Serialize(new { role = GroupMembershipRoles.Owner }));

        using var response = await client.SendAsync(request);

        await AssertGroupMemberPermissionDeniedProblemAsync(response);
        var membership = await ReadMembershipAsync(testFactory, groupId, target.UserProfileId);
        Assert.Equal(GroupMembershipRoles.Member, membership.Role);
    }

    [Fact]
    public async Task CannotDemoteLastActiveOwner()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Only Owner");
        var groupId = await SeedGroupWithOwnerAsync(testFactory, ownerSession.UserProfileId);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Patch,
            MemberPath(groupId, ownerSession.UserProfileId),
            ownerSession.RawSessionToken,
            JsonSerializer.Serialize(new { role = GroupMembershipRoles.Member }));

        using var response = await client.SendAsync(request);

        await AssertGroupMemberConflictProblemAsync(response);
        var membership = await ReadMembershipAsync(testFactory, groupId, ownerSession.UserProfileId);
        Assert.Equal(GroupMembershipRoles.Owner, membership.Role);
        await AssertNoGroupMembershipAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task OwnerCanRemoveMemberWithoutHardDelete()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Owner Actor");
        var target = await SeedAccountAsync(testFactory, "Target Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Removal Group",
            InitialTimestamp,
            null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(target.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Delete,
            MemberPath(groupId, target.UserProfileId),
            ownerSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var membership = await ReadMembershipAsync(testFactory, groupId, target.UserProfileId);
        Assert.Equal(GroupMembershipStatuses.Removed, membership.Status);
        Assert.Equal(WriteTimestamp, membership.UpdatedAtUtc);
        Assert.Equal(1, await CountMembershipsAsync(testFactory, groupId, target.UserProfileId));

        var auditEvent = await AssertSingleGroupMembershipAuditEventAsync(
            testFactory,
            GroupMemberRemovedAction,
            ownerSession.AuthAccountId,
            target.AuthAccountId,
            WriteTimestamp);
        AssertGroupMembershipAuditMetadata(
            auditEvent,
            groupId,
            target.UserProfileId,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["previousStatus"] = GroupMembershipStatuses.Active,
                ["newStatus"] = GroupMembershipStatuses.Removed
            });
    }

    [Fact]
    public async Task CannotRemoveLastActiveOwner()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Only Owner");
        var groupId = await SeedGroupWithOwnerAsync(testFactory, ownerSession.UserProfileId);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Delete,
            MemberPath(groupId, ownerSession.UserProfileId),
            ownerSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertGroupMemberConflictProblemAsync(response);
        var membership = await ReadMembershipAsync(testFactory, groupId, ownerSession.UserProfileId);
        Assert.Equal(GroupMembershipStatuses.Active, membership.Status);
        await AssertNoGroupMembershipAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task GroupMembershipAuditMetadataExcludesSecretsIdentifiersRequestBodiesAndUnrelatedProfileData()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Owner Actor");
        var target = await SeedAccountAsync(
            testFactory,
            "Sensitive Target Display",
            InitialTimestamp.AddMinutes(1),
            providerSubject: HiddenIdentifier);
        var unrelated = await SeedAccountAsync(testFactory, "Unrelated Profile Data", InitialTimestamp.AddMinutes(2));
        var groupId = await SeedGroupWithOwnerAsync(testFactory, ownerSession.UserProfileId);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, ownerSession.AuthSessionId);
        var requestBody = CreateAddMemberContent(target.UserProfileId, GroupMembershipRoles.Member);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            MembersPath(groupId),
            ownerSession.RawSessionToken,
            requestBody);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var auditEvent = await AssertSingleGroupMembershipAuditEventAsync(
            testFactory,
            GroupMemberAddedAction,
            ownerSession.AuthAccountId,
            target.AuthAccountId,
            WriteTimestamp);
        AssertGroupMembershipAuditMetadata(
            auditEvent,
            groupId,
            target.UserProfileId,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["newRole"] = GroupMembershipRoles.Member
            });
        AssertSafeGroupMembershipAuditContent(
            auditEvent,
            ownerSession.RawSessionToken,
            sessionTokenHash,
            HiddenIdentifier,
            "Sensitive Target Display",
            "Unrelated Profile Data",
            unrelated.AuthAccountId.ToString("D"),
            unrelated.UserProfileId.ToString("D"),
            ownerSession.AuthAccountId.ToString("D"),
            target.AuthAccountId.ToString("D"),
            requestBody);
    }

    [Fact]
    public async Task RemovedMembershipCannotAccessGroupMemberList()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var removedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Removed Actor");
        var owner = await SeedAccountAsync(testFactory, "Owner Actor", InitialTimestamp);
        var groupId = await SeedGroupAsync(
            testFactory,
            owner.UserProfileId,
            "Removed Actor Group",
            InitialTimestamp,
            null,
            new MembershipSeed(owner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(removedSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            MembersPath(groupId),
            removedSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertGroupMemberUnavailableProblemAsync(response);
    }

    [Fact]
    public async Task RemovedMembershipIsExcludedFromMemberList()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Owner Actor");
        var removed = await SeedAccountAsync(testFactory, "Removed Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Removed Excluded Group",
            InitialTimestamp,
            null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(removed.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            MembersPath(groupId),
            ownerSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var members = await ReadMemberListPayloadAsync(response);
        Assert.DoesNotContain(members, member => member.UserProfileId == removed.UserProfileId);
        Assert.Single(members);
    }

    [Fact]
    public async Task MissingOrInvalidSessionReturnsUniformUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Owner Actor");
        var groupId = await SeedGroupWithOwnerAsync(testFactory, ownerSession.UserProfileId);
        using var client = testFactory.CreateClient();

        using var missingResponse = await client.GetAsync(MembersPath(groupId));
        await AssertUnauthenticatedProblemAsync(missingResponse);

        using var invalidRequest = CreateBearerRequest(HttpMethod.Get, MembersPath(groupId), WrongRawToken);
        using var invalidResponse = await client.SendAsync(invalidRequest);
        await AssertUnauthenticatedProblemAsync(invalidResponse, WrongRawToken);
    }

    [Fact]
    public async Task ResponsesExcludeAuthCredentialsTokensProviderAuditStorageAndUnrelatedUsers()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Owner Actor");
        var target = await SeedAccountAsync(
            testFactory,
            "Safe Listed Member",
            InitialTimestamp.AddMinutes(1),
            providerSubject: HiddenIdentifier);
        var unrelated = await SeedAccountAsync(testFactory, "Unrelated User", InitialTimestamp.AddMinutes(2));
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Safe Response Group",
            InitialTimestamp,
            null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(target.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, ownerSession.AuthSessionId);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            MembersPath(groupId),
            ownerSession.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafeGroupMemberResponseContent(content);
        Assert.DoesNotContain(ownerSession.RawSessionToken, content);
        Assert.DoesNotContain(sessionTokenHash, content);
        Assert.DoesNotContain(ownerSession.AuthAccountId.ToString("D"), content);
        Assert.DoesNotContain(target.AuthAccountId.ToString("D"), content);
        Assert.DoesNotContain(unrelated.AuthAccountId.ToString("D"), content);
        Assert.DoesNotContain(HiddenIdentifier, content);
        Assert.DoesNotContain("Unrelated User", content);
    }

    [Fact]
    public void OpenApiContractDefinesGuardedGroupMemberManagementFoundation()
    {
        var openApiPath = FindRepoFile("packages/contracts/openapi/settleora.v1.yaml");
        var openApi = File.ReadAllText(openApiPath);
        var collectionPathBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/groups/{groupId}/members:");
        var memberPathBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/groups/{groupId}/members/{userProfileId}:");
        var addRequestSchema = ExtractOpenApiSchemaBlock(openApi, "AddGroupMemberRequest:");
        var updateRequestSchema = ExtractOpenApiSchemaBlock(openApi, "UpdateGroupMemberRequest:");
        var memberResponseSchema = ExtractOpenApiSchemaBlock(openApi, "GroupMemberResponse:");

        Assert.Contains("operationId: listGroupMembers", collectionPathBlock);
        Assert.Contains("operationId: addGroupMember", collectionPathBlock);
        Assert.Contains("operationId: updateGroupMember", memberPathBlock);
        Assert.Contains("operationId: removeGroupMember", memberPathBlock);
        Assert.Contains("SessionBearerAuth", collectionPathBlock);
        Assert.Contains("SessionBearerAuth", memberPathBlock);
        Assert.Contains("GroupMemberListResponse", collectionPathBlock);
        Assert.Contains("GroupMemberResponse", collectionPathBlock);
        Assert.Contains("GroupMemberResponse", memberPathBlock);
        Assert.Contains("GroupRole", addRequestSchema);
        Assert.Contains("GroupRole", updateRequestSchema);
        Assert.Contains("GroupMembershipStatus", memberResponseSchema);
        Assert.DoesNotContain("authAccountId:", memberResponseSchema);
        Assert.DoesNotContain("identifier:", memberResponseSchema);
        Assert.DoesNotContain("token:", memberResponseSchema);
        Assert.DoesNotContain("credential:", memberResponseSchema);
        Assert.DoesNotContain("storagePath:", memberResponseSchema);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new GroupMemberTestTimeProvider(InitialTimestamp);
        var testFactory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<SettleoraDbContext>();
                services.RemoveAll<DbContextOptions>();
                services.RemoveAll<DbContextOptions<SettleoraDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<SettleoraDbContext>>();
                services.AddDbContext<SettleoraDbContext>(options =>
                {
                    options.UseInMemoryDatabase(databaseName);
                });

                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(timeProvider);
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        GroupMemberTestTimeProvider timeProvider,
        string displayName)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
        var account = await SeedAccountAsync(testFactory, displayName, InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Group member endpoint test",
                UserAgentSummary: "Group member endpoint test user agent",
                NetworkAddressHash: "group-member-endpoint-test-network",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededSession(
            account.AuthAccountId,
            account.UserProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            sessionCreationResult.SessionExpiresAtUtc.Value);
    }

    private static async Task<SeededAccount> SeedAccountAsync(
        WebApplicationFactory<Program> testFactory,
        string displayName,
        DateTimeOffset createdAtUtc,
        string status = AuthAccountStatuses.Active,
        DateTimeOffset? deletedProfileAtUtc = null,
        DateTimeOffset? deletedAccountAtUtc = null,
        string? providerSubject = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
            DefaultCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            DeletedAtUtc = deletedProfileAtUtc
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = status,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            DeletedAtUtc = deletedAccountAtUtc
        });
        dbContext.Set<AuthIdentity>().Add(new AuthIdentity
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            ProviderType = AuthIdentityProviderTypes.Local,
            ProviderName = LocalSignInService.LocalProviderName,
            ProviderSubject = providerSubject ?? $"{authAccountId:D}@example.test",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
        return new SeededAccount(authAccountId, userProfileId);
    }

    private static async Task<Guid> SeedUnavailableProfileAsync(
        WebApplicationFactory<Program> testFactory,
        string state)
    {
        if (state == "missing")
        {
            return Guid.NewGuid();
        }

        if (state == "missing-account")
        {
            using var scope = testFactory.Services.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
            var userProfileId = Guid.NewGuid();
            dbContext.Set<UserProfile>().Add(new UserProfile
            {
                Id = userProfileId,
                DisplayName = "Profile Without Account",
                DefaultCurrency = "USD",
                CreatedAtUtc = InitialTimestamp,
                UpdatedAtUtc = InitialTimestamp
            });

            await dbContext.SaveChangesAsync();
            return userProfileId;
        }

        var account = await SeedAccountAsync(
            testFactory,
            "Unavailable Profile",
            InitialTimestamp,
            status: state == "disabled-account" ? AuthAccountStatuses.Disabled : AuthAccountStatuses.Active,
            deletedProfileAtUtc: state == "deleted-profile" ? ValidationTimestamp : null,
            deletedAccountAtUtc: state == "deleted-account" ? ValidationTimestamp : null);

        return account.UserProfileId;
    }

    private static async Task<Guid> SeedGroupWithOwnerAsync(
        WebApplicationFactory<Program> testFactory,
        Guid ownerProfileId)
    {
        return await SeedGroupAsync(
            testFactory,
            ownerProfileId,
            "Managed Group",
            InitialTimestamp,
            null,
            new MembershipSeed(ownerProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
    }

    private static async Task<Guid> SeedGroupAsync(
        WebApplicationFactory<Program> testFactory,
        Guid creatorProfileId,
        string name,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? deletedAtUtc,
        params MembershipSeed[] memberships)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var groupId = Guid.NewGuid();

        dbContext.Set<UserGroup>().Add(new UserGroup
        {
            Id = groupId,
            Name = name,
            CreatedByUserProfileId = creatorProfileId,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            DeletedAtUtc = deletedAtUtc
        });

        foreach (var membership in memberships)
        {
            var membershipCreatedAtUtc = membership.CreatedAtUtc ?? createdAtUtc;
            dbContext.Set<GroupMembership>().Add(new GroupMembership
            {
                GroupId = groupId,
                UserProfileId = membership.UserProfileId,
                Role = membership.Role,
                Status = membership.Status,
                CreatedAtUtc = membershipCreatedAtUtc,
                UpdatedAtUtc = membership.UpdatedAtUtc ?? membershipCreatedAtUtc
            });
        }

        await dbContext.SaveChangesAsync();
        return groupId;
    }

    private static async Task<GroupMembership> ReadMembershipAsync(
        WebApplicationFactory<Program> testFactory,
        Guid groupId,
        Guid userProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<GroupMembership>().SingleAsync(
            membership => membership.GroupId == groupId
                && membership.UserProfileId == userProfileId);
    }

    private static async Task<int> CountMembershipsAsync(
        WebApplicationFactory<Program> testFactory,
        Guid groupId,
        Guid userProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<GroupMembership>().CountAsync(
            membership => membership.GroupId == groupId
                && membership.UserProfileId == userProfileId);
    }

    private static async Task<string> ReadSessionTokenHashAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthSession>()
            .Where(session => session.Id == authSessionId)
            .Select(session => session.SessionTokenHash)
            .SingleAsync();
    }

    private static async Task<AuthAuditEvent> AssertSingleGroupMembershipAuditEventAsync(
        WebApplicationFactory<Program> testFactory,
        string expectedAction,
        Guid expectedActorAuthAccountId,
        Guid? expectedSubjectAuthAccountId,
        DateTimeOffset expectedOccurredAtUtc)
    {
        var auditEvent = Assert.Single(await ReadGroupMembershipAuditEventsAsync(testFactory));

        Assert.Equal(expectedActorAuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.Equal(expectedSubjectAuthAccountId, auditEvent.SubjectAuthAccountId);
        Assert.Equal(expectedAction, auditEvent.Action);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.Equal(expectedOccurredAtUtc, auditEvent.OccurredAtUtc);
        Assert.Null(auditEvent.CorrelationId);
        Assert.Null(auditEvent.RequestId);

        return auditEvent;
    }

    private static async Task AssertNoGroupMembershipAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        Assert.Empty(await ReadGroupMembershipAuditEventsAsync(testFactory));
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadGroupMembershipAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action == GroupMemberAddedAction
                || auditEvent.Action == GroupMemberRoleUpdatedAction
                || auditEvent.Action == GroupMemberRemovedAction)
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Action)
            .ToArrayAsync();
    }

    private static void AssertGroupMembershipAuditMetadata(
        AuthAuditEvent auditEvent,
        Guid expectedGroupId,
        Guid expectedTargetUserProfileId,
        IReadOnlyDictionary<string, string> expectedAdditionalValues)
    {
        Assert.NotNull(auditEvent.SafeMetadataJson);
        Assert.True(auditEvent.SafeMetadataJson!.Length <= 4096);

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);
        var propertyNames = metadata.RootElement
            .EnumerateObject()
            .Select(property => property.Name)
            .OrderBy(propertyName => propertyName, StringComparer.Ordinal)
            .ToArray();
        var expectedPropertyNames = new[] { "workflowName", "groupId", "targetUserProfileId" }
            .Concat(expectedAdditionalValues.Keys)
            .OrderBy(propertyName => propertyName, StringComparer.Ordinal)
            .ToArray();

        Assert.Equal(expectedPropertyNames, propertyNames);
        Assert.Equal(
            "group_member_management",
            metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(
            expectedGroupId.ToString("D"),
            metadata.RootElement.GetProperty("groupId").GetString());
        Assert.Equal(
            expectedTargetUserProfileId.ToString("D"),
            metadata.RootElement.GetProperty("targetUserProfileId").GetString());

        foreach (var expectedValue in expectedAdditionalValues)
        {
            Assert.Equal(
                expectedValue.Value,
                metadata.RootElement.GetProperty(expectedValue.Key).GetString());
        }

        foreach (var property in metadata.RootElement.EnumerateObject())
        {
            var value = property.Value.GetString();
            Assert.NotNull(value);
            Assert.InRange(value!.Length, 1, 120);
        }
    }

    private static void AssertSafeGroupMembershipAuditContent(
        AuthAuditEvent auditEvent,
        params string[] forbiddenValues)
    {
        var auditText = string.Join(
            "\n",
            auditEvent.Action,
            auditEvent.Outcome,
            auditEvent.SafeMetadataJson ?? string.Empty);
        var lowerAuditText = auditText.ToLowerInvariant();

        foreach (var forbiddenValue in forbiddenValues)
        {
            Assert.DoesNotContain(forbiddenValue, auditText);
        }

        Assert.DoesNotContain("token", lowerAuditText);
        Assert.DoesNotContain("hash", lowerAuditText);
        Assert.DoesNotContain("password", lowerAuditText);
        Assert.DoesNotContain("credential", lowerAuditText);
        Assert.DoesNotContain("verifier", lowerAuditText);
        Assert.DoesNotContain("identifier", lowerAuditText);
        Assert.DoesNotContain("email", lowerAuditText);
        Assert.DoesNotContain("provider", lowerAuditText);
        Assert.DoesNotContain("payload", lowerAuditText);
        Assert.DoesNotContain("request", lowerAuditText);
        Assert.DoesNotContain("body", lowerAuditText);
        Assert.DoesNotContain("storage", lowerAuditText);
        Assert.DoesNotContain("path", lowerAuditText);
    }

    private static string MembersPath(Guid groupId)
    {
        return $"{GroupsPath}/{groupId:D}/members";
    }

    private static string MemberPath(Guid groupId, Guid userProfileId)
    {
        return $"{MembersPath(groupId)}/{userProfileId:D}";
    }

    private static string CreateAddMemberContent(
        Guid userProfileId,
        string? role)
    {
        return role is null
            ? JsonSerializer.Serialize(new { userProfileId })
            : JsonSerializer.Serialize(new { userProfileId, role });
    }

    private static HttpRequestMessage CreateBearerRequest(
        HttpMethod method,
        string path,
        string rawSessionToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreateJsonRequest(
        HttpMethod method,
        string path,
        string rawSessionToken,
        string json)
    {
        var request = CreateBearerRequest(method, path, rawSessionToken);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        return request;
    }

    private static async Task<IReadOnlyList<GroupMemberPayload>> ReadMemberListPayloadAsync(HttpResponseMessage response)
    {
        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);

        return payload.RootElement.GetProperty("members")
            .EnumerateArray()
            .Select(ReadMemberPayload)
            .ToArray();
    }

    private static async Task<GroupMemberPayload> ReadMemberPayloadAsync(HttpResponseMessage response)
    {
        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);

        return ReadMemberPayload(payload.RootElement);
    }

    private static GroupMemberPayload ReadMemberPayload(JsonElement root)
    {
        Assert.Equal(6, root.EnumerateObject().Count());

        return new GroupMemberPayload(
            root.GetProperty("userProfileId").GetGuid(),
            root.GetProperty("displayName").GetString()!,
            root.GetProperty("role").GetString()!,
            root.GetProperty("status").GetString()!,
            root.GetProperty("joinedAtUtc").GetDateTimeOffset(),
            root.GetProperty("updatedAtUtc").GetDateTimeOffset());
    }

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
        if (unexpectedResponseText is not null)
        {
            Assert.DoesNotContain(unexpectedResponseText, content);
        }

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Authentication is required to access this resource.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertGroupMemberUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Group member unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested group member is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertGroupMemberPermissionDeniedProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Group member permission denied", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(403, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The authenticated actor cannot manage group members.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertInvalidGroupMemberRequestProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid group member request", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted group member request is invalid.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertGroupMemberConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Group member conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted group membership change conflicts with current group membership state.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static void AssertSafeProblemContent(string content)
    {
        var lowerContent = content.ToLowerInvariant();

        Assert.DoesNotContain(WrongRawToken, content);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("metadata", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
    }

    private static void AssertSafeGroupMemberResponseContent(string content)
    {
        var lowerContent = content.ToLowerInvariant();

        Assert.DoesNotContain("auth", lowerContent);
        Assert.DoesNotContain("account", lowerContent);
        Assert.DoesNotContain("identifier", lowerContent);
        Assert.DoesNotContain("email", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("metadata", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
    }

    private static string FindRepoFile(string relativePath)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, relativePath);
            if (File.Exists(candidate))
            {
                return candidate;
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException($"Could not find {relativePath} from {AppContext.BaseDirectory}.");
    }

    private static string ExtractOpenApiPathBlock(string openApi, string pathHeader)
    {
        var start = openApi.IndexOf(pathHeader, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Could not find OpenAPI path block {pathHeader}.");

        var nextPath = openApi.IndexOf("\n  /", start + pathHeader.Length, StringComparison.Ordinal);
        return nextPath < 0
            ? openApi[start..]
            : openApi[start..nextPath];
    }

    private static string ExtractOpenApiSchemaBlock(string openApi, string schemaHeader)
    {
        var start = openApi.IndexOf($"    {schemaHeader}", StringComparison.Ordinal);
        Assert.True(start >= 0, $"Could not find OpenAPI schema block {schemaHeader}.");

        var nextSchema = openApi.IndexOf("\n    ", start + schemaHeader.Length + 4, StringComparison.Ordinal);
        while (nextSchema >= 0
            && openApi.Length > nextSchema + 5
            && openApi[nextSchema + 5] is ' ')
        {
            nextSchema = openApi.IndexOf("\n    ", nextSchema + 1, StringComparison.Ordinal);
        }

        return nextSchema < 0
            ? openApi[start..]
            : openApi[start..nextSchema];
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        GroupMemberTestTimeProvider TimeProvider);

    private sealed record SeededAccount(
        Guid AuthAccountId,
        Guid UserProfileId);

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset SessionExpiresAtUtc);

    private sealed record MembershipSeed(
        Guid UserProfileId,
        string Role,
        string Status,
        DateTimeOffset? CreatedAtUtc = null,
        DateTimeOffset? UpdatedAtUtc = null);

    private sealed record GroupMemberPayload(
        Guid UserProfileId,
        string DisplayName,
        string Role,
        string Status,
        DateTimeOffset JoinedAtUtc,
        DateTimeOffset UpdatedAtUtc);

    private sealed class GroupMemberTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public GroupMemberTestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }

        public void SetUtcNow(DateTimeOffset value)
        {
            utcNow = value;
        }
    }
}
