using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class GroupFoundationEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string GroupsPath = "/api/v1/groups";
    private const string WrongRawToken = "visible-wrong-group-session-token";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 4, 11, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 4, 11, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 4, 11, 30, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public GroupFoundationEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    public static TheoryData<string> InvalidCreateBodies => new()
    {
        "{\"name\":\"   \"}",
        $"{{\"name\":\"{new string('g', UserGroupConstraints.NameMaxLength + 1)}\"}}",
        "{\"name\":\"Valid Group\",\"createdByUserProfileId\":\"00000000-0000-0000-0000-000000000001\"}",
        "{}"
    };

    public static TheoryData<string> InvalidUpdateBodies => new()
    {
        "{\"name\":\"   \"}",
        $"{{\"name\":\"{new string('g', UserGroupConstraints.NameMaxLength + 1)}\"}}",
        "{\"createdByUserProfileId\":\"00000000-0000-0000-0000-000000000001\"}",
        "{\"name\":\"Valid Group\",\"unexpected\":\"value\"}",
        "{}"
    };

    [Fact]
    public async Task PostGroupCreatesGroupAndActiveOwnerMembershipForCurrentActor()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            GroupsPath,
            seededSession.RawSessionToken,
            "{\"name\":\"  Household  \"}");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        var payload = await ReadGroupPayloadAsync(response);
        Assert.Equal("Household", payload.Name);
        Assert.Equal(GroupMembershipRoles.Owner, payload.CurrentUserRole);
        Assert.Equal(GroupMembershipStatuses.Active, payload.CurrentUserStatus);
        Assert.Equal(WriteTimestamp, payload.CreatedAtUtc);
        Assert.Equal(WriteTimestamp, payload.UpdatedAtUtc);
        Assert.Equal($"/api/v1/groups/{payload.Id:D}", response.Headers.Location?.OriginalString);

        var group = await ReadGroupAsync(testFactory, payload.Id);
        var membership = await ReadMembershipAsync(testFactory, payload.Id, seededSession.UserProfileId);
        Assert.Equal("Household", group.Name);
        Assert.Equal(seededSession.UserProfileId, group.CreatedByUserProfileId);
        Assert.Equal(WriteTimestamp, group.CreatedAtUtc);
        Assert.Equal(WriteTimestamp, group.UpdatedAtUtc);
        Assert.Equal(GroupMembershipRoles.Owner, membership.Role);
        Assert.Equal(GroupMembershipStatuses.Active, membership.Status);
        Assert.Equal(WriteTimestamp, membership.CreatedAtUtc);
        Assert.Equal(WriteTimestamp, membership.UpdatedAtUtc);
    }

    [Fact]
    public async Task PostGroupResponseDoesNotExposeAuthSessionCredentialTokenOrInternalData()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, seededSession.AuthSessionId);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            GroupsPath,
            seededSession.RawSessionToken,
            "{\"name\":\"Private Group\"}");

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        var lowerContent = content.ToLowerInvariant();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.DoesNotContain(seededSession.RawSessionToken, content);
        Assert.DoesNotContain(sessionTokenHash, content);
        Assert.DoesNotContain("auth", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("createdBy", content);
        Assert.DoesNotContain("profile", lowerContent);
        Assert.DoesNotContain("account", lowerContent);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal(6, payload.RootElement.EnumerateObject().Count());
    }

    [Theory]
    [MemberData(nameof(InvalidCreateBodies))]
    public async Task PostGroupRejectsInvalidRequestBody(string body)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            GroupsPath,
            seededSession.RawSessionToken,
            body);

        using var response = await client.SendAsync(request);

        await AssertInvalidGroupRequestProblemAsync(response);
        await AssertNoGroupsCreatedByAsync(testFactory, seededSession.UserProfileId);
    }

    [Fact]
    public async Task GetGroupListReturnsOnlyActiveMembershipsForCurrentActor()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var otherProfileId = await SeedProfileAsync(testFactory, "Other Group User");
        var olderGroupId = await SeedGroupAsync(
            testFactory,
            seededSession.UserProfileId,
            "Older Active Owner",
            InitialTimestamp.AddMinutes(1),
            null,
            new MembershipSeed(seededSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var newerGroupId = await SeedGroupAsync(
            testFactory,
            otherProfileId,
            "Newer Active Member",
            InitialTimestamp.AddMinutes(2),
            null,
            new MembershipSeed(seededSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        await SeedGroupAsync(
            testFactory,
            seededSession.UserProfileId,
            "Removed Membership",
            InitialTimestamp.AddMinutes(3),
            null,
            new MembershipSeed(seededSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Removed));
        await SeedGroupAsync(
            testFactory,
            seededSession.UserProfileId,
            "Deleted Group",
            InitialTimestamp.AddMinutes(4),
            ValidationTimestamp,
            new MembershipSeed(seededSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        await SeedGroupAsync(
            testFactory,
            otherProfileId,
            "Unrelated Group",
            InitialTimestamp.AddMinutes(5),
            null,
            new MembershipSeed(otherProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, GroupsPath, seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var groups = payload.RootElement.GetProperty("groups")
            .EnumerateArray()
            .Select(ReadGroupPayload)
            .ToArray();

        Assert.Equal(new[] { olderGroupId, newerGroupId }, groups.Select(group => group.Id).ToArray());
        Assert.Equal(
            new[] { "Older Active Owner", "Newer Active Member" },
            groups.Select(group => group.Name).ToArray());
        Assert.Equal(
            new[] { GroupMembershipRoles.Owner, GroupMembershipRoles.Member },
            groups.Select(group => group.CurrentUserRole).ToArray());
        Assert.All(groups, group => Assert.Equal(GroupMembershipStatuses.Active, group.CurrentUserStatus));
    }

    [Theory]
    [InlineData(GroupMembershipRoles.Owner)]
    [InlineData(GroupMembershipRoles.Member)]
    public async Task GetGroupByIdSucceedsForActiveOwnerOrMember(string role)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var groupId = await SeedGroupAsync(
            testFactory,
            seededSession.UserProfileId,
            "Visible Group",
            InitialTimestamp,
            null,
            new MembershipSeed(seededSession.UserProfileId, role, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            $"{GroupsPath}/{groupId:D}",
            seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await ReadGroupPayloadAsync(response);
        Assert.Equal(groupId, payload.Id);
        Assert.Equal(role, payload.CurrentUserRole);
        Assert.Equal(GroupMembershipStatuses.Active, payload.CurrentUserStatus);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("unrelated")]
    [InlineData("deleted")]
    [InlineData("removed")]
    public async Task GetGroupByIdFailsClosedForUnavailableGroup(string state)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var groupId = await SeedUnavailableGroupAsync(testFactory, seededSession.UserProfileId, state);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            $"{GroupsPath}/{groupId:D}",
            seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertGroupUnavailableProblemAsync(response);
    }

    [Fact]
    public async Task PatchGroupNameSucceedsForActiveOwnerAndUpdatesTimestamp()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var groupId = await SeedGroupAsync(
            testFactory,
            seededSession.UserProfileId,
            "Original Group",
            InitialTimestamp,
            null,
            new MembershipSeed(seededSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Patch,
            $"{GroupsPath}/{groupId:D}",
            seededSession.RawSessionToken,
            "{\"name\":\"  Updated Group  \"}");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await ReadGroupPayloadAsync(response);
        Assert.Equal("Updated Group", payload.Name);
        Assert.Equal(GroupMembershipRoles.Owner, payload.CurrentUserRole);
        Assert.Equal(InitialTimestamp, payload.CreatedAtUtc);
        Assert.Equal(WriteTimestamp, payload.UpdatedAtUtc);

        var group = await ReadGroupAsync(testFactory, groupId);
        Assert.Equal("Updated Group", group.Name);
        Assert.Equal(WriteTimestamp, group.UpdatedAtUtc);
    }

    [Theory]
    [MemberData(nameof(InvalidUpdateBodies))]
    public async Task PatchGroupRejectsInvalidRequestBody(string body)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var groupId = await SeedGroupAsync(
            testFactory,
            seededSession.UserProfileId,
            "Original Group",
            InitialTimestamp,
            null,
            new MembershipSeed(seededSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Patch,
            $"{GroupsPath}/{groupId:D}",
            seededSession.RawSessionToken,
            body);

        using var response = await client.SendAsync(request);

        await AssertInvalidGroupRequestProblemAsync(response);
        await AssertGroupUnchangedAsync(testFactory, groupId, "Original Group", InitialTimestamp);
    }

    [Fact]
    public async Task PatchGroupDeniesActiveMemberWithForbidden()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var groupId = await SeedGroupAsync(
            testFactory,
            seededSession.UserProfileId,
            "Member Group",
            InitialTimestamp,
            null,
            new MembershipSeed(seededSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Patch,
            $"{GroupsPath}/{groupId:D}",
            seededSession.RawSessionToken,
            "{\"name\":\"Forbidden Update\"}");

        using var response = await client.SendAsync(request);

        await AssertGroupPermissionDeniedProblemAsync(response);
        await AssertGroupUnchangedAsync(testFactory, groupId, "Member Group", InitialTimestamp);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("unrelated")]
    [InlineData("deleted")]
    [InlineData("removed")]
    public async Task PatchGroupFailsClosedForUnavailableGroup(string state)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var groupId = await SeedUnavailableGroupAsync(testFactory, seededSession.UserProfileId, state);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Patch,
            $"{GroupsPath}/{groupId:D}",
            seededSession.RawSessionToken,
            "{\"name\":\"Should Not Apply\"}");

        using var response = await client.SendAsync(request);

        await AssertGroupUnavailableProblemAsync(response);
    }

    [Fact]
    public async Task MissingOrInvalidSessionReturnsUniformUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();

        using var missingResponse = await client.GetAsync(GroupsPath);
        await AssertUnauthenticatedProblemAsync(missingResponse);

        using var invalidRequest = CreateBearerRequest(HttpMethod.Get, GroupsPath, WrongRawToken);
        using var invalidResponse = await client.SendAsync(invalidRequest);
        await AssertUnauthenticatedProblemAsync(invalidResponse, WrongRawToken);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new GroupTestTimeProvider(InitialTimestamp);
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

    private static async Task<SeededGroupSession> SeedValidSessionAsync(
        WebApplicationFactory<Program> testFactory,
        GroupTestTimeProvider timeProvider)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Group Endpoint Test User",
            DefaultCurrency = "USD",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });

        await dbContext.SaveChangesAsync();

        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                authAccountId,
                DeviceLabel: "Group endpoint test",
                UserAgentSummary: "Group endpoint test user agent",
                NetworkAddressHash: "group-endpoint-test-network",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededGroupSession(
            authAccountId,
            userProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            sessionCreationResult.SessionExpiresAtUtc.Value);
    }

    private static async Task<Guid> SeedProfileAsync(
        WebApplicationFactory<Program> testFactory,
        string displayName)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var profileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = profileId,
            DisplayName = displayName,
            DefaultCurrency = "USD",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });

        await dbContext.SaveChangesAsync();
        return profileId;
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
            dbContext.Set<GroupMembership>().Add(new GroupMembership
            {
                GroupId = groupId,
                UserProfileId = membership.UserProfileId,
                Role = membership.Role,
                Status = membership.Status,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        await dbContext.SaveChangesAsync();
        return groupId;
    }

    private static async Task<Guid> SeedUnavailableGroupAsync(
        WebApplicationFactory<Program> testFactory,
        Guid actorProfileId,
        string state)
    {
        if (state == "missing")
        {
            return Guid.NewGuid();
        }

        var otherProfileId = await SeedProfileAsync(testFactory, "Unavailable Group Other User");

        return state switch
        {
            "unrelated" => await SeedGroupAsync(
                testFactory,
                otherProfileId,
                "Unrelated Group",
                InitialTimestamp,
                null,
                new MembershipSeed(otherProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active)),
            "deleted" => await SeedGroupAsync(
                testFactory,
                actorProfileId,
                "Deleted Group",
                InitialTimestamp,
                ValidationTimestamp,
                new MembershipSeed(actorProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active)),
            "removed" => await SeedGroupAsync(
                testFactory,
                actorProfileId,
                "Removed Membership Group",
                InitialTimestamp,
                null,
                new MembershipSeed(actorProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Removed)),
            _ => throw new ArgumentOutOfRangeException(nameof(state), state, "Unsupported group state.")
        };
    }

    private static async Task<UserGroup> ReadGroupAsync(
        WebApplicationFactory<Program> testFactory,
        Guid groupId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<UserGroup>().SingleAsync(group => group.Id == groupId);
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

    private static async Task AssertNoGroupsCreatedByAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var groupCount = await dbContext.Set<UserGroup>()
            .CountAsync(group => group.CreatedByUserProfileId == userProfileId);

        Assert.Equal(0, groupCount);
    }

    private static async Task AssertGroupUnchangedAsync(
        WebApplicationFactory<Program> testFactory,
        Guid groupId,
        string expectedName,
        DateTimeOffset expectedUpdatedAtUtc)
    {
        var group = await ReadGroupAsync(testFactory, groupId);
        Assert.Equal(expectedName, group.Name);
        Assert.Equal(expectedUpdatedAtUtc, group.UpdatedAtUtc);
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

    private static async Task<GroupPayload> ReadGroupPayloadAsync(HttpResponseMessage response)
    {
        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);

        return ReadGroupPayload(payload.RootElement);
    }

    private static GroupPayload ReadGroupPayload(JsonElement root)
    {
        Assert.Equal(6, root.EnumerateObject().Count());

        return new GroupPayload(
            root.GetProperty("id").GetGuid(),
            root.GetProperty("name").GetString()!,
            root.GetProperty("currentUserRole").GetString()!,
            root.GetProperty("currentUserStatus").GetString()!,
            root.GetProperty("createdAtUtc").GetDateTimeOffset(),
            root.GetProperty("updatedAtUtc").GetDateTimeOffset());
    }

    private static async Task AssertInvalidGroupRequestProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid group request", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted group request is invalid.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertGroupUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Group unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested group is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertGroupPermissionDeniedProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Group permission denied", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(403, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The authenticated actor cannot manage this group.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(WrongRawToken, content);
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

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        GroupTestTimeProvider TimeProvider);

    private sealed record SeededGroupSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset SessionExpiresAtUtc);

    private sealed record MembershipSeed(
        Guid UserProfileId,
        string Role,
        string Status);

    private sealed record GroupPayload(
        Guid Id,
        string Name,
        string CurrentUserRole,
        string CurrentUserStatus,
        DateTimeOffset CreatedAtUtc,
        DateTimeOffset UpdatedAtUtc);

    private sealed class GroupTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public GroupTestTimeProvider(DateTimeOffset utcNow)
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
