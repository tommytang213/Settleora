using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class SettlementCandidatePreviewEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WrongRawToken = "visible-wrong-settlement-candidate-session-token";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 8, 9, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 8, 9, 15, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public SettlementCandidatePreviewEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PersonalConfirmedBillReturnsOnlyCurrentActorCandidatesFromPayerRelationship()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal Candidate Payer");
        var creator = await SeedAccountAsync(testFactory, "Personal Candidate Creator", InitialTimestamp.AddMinutes(1));
        var debtorOne = await SeedAccountAsync(testFactory, "Personal Candidate Debtor One", InitialTimestamp.AddMinutes(2));
        var debtorTwo = await SeedAccountAsync(testFactory, "Personal Candidate Debtor Two", InitialTimestamp.AddMinutes(3));
        var billId = await SeedBillAsync(
            testFactory,
            creator.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorOne.UserProfileId, 30m),
                new ParticipantSeed(debtorTwo.UserProfileId, 30m)
            ],
            [new PayerSeed(actorSession.UserProfileId, 60m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Personal Candidate Merchant",
            InitialTimestamp);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, actorSession.AuthSessionId);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            PersonalCandidatesPath(billId),
            actorSession.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        AssertSafePreviewResponseContent(
            content,
            actorSession.RawSessionToken,
            sessionTokenHash,
            creator.UserProfileId.ToString("D"),
            "Hidden Personal Candidate Merchant");

        using var payload = JsonDocument.Parse(content);
        var candidates = payload.RootElement.GetProperty("candidates").EnumerateArray().ToArray();
        Assert.Equal(2, candidates.Length);
        Assert.All(
            candidates,
            candidate =>
            {
                Assert.Equal(billId, candidate.GetProperty("sourceExpenseBillId").GetGuid());
                Assert.Equal(JsonValueKind.Null, candidate.GetProperty("groupId").ValueKind);
                Assert.Equal(actorSession.UserProfileId, candidate.GetProperty("creditorUserProfileId").GetGuid());
                Assert.Contains(
                    candidate.GetProperty("debtorUserProfileId").GetGuid(),
                    new[] { debtorOne.UserProfileId, debtorTwo.UserProfileId });
                Assert.Equal("30", candidate.GetProperty("amount").GetString());
                Assert.Equal("USD", candidate.GetProperty("currency").GetString());
                Assert.Equal("confirmed_bill_net_position_v1", candidate.GetProperty("basis").GetString());
            });
        Assert.Equal([0, 1], candidates.Select(candidate => candidate.GetProperty("allocationOrder").GetInt32()).Order().ToArray());
    }

    [Fact]
    public async Task GroupConfirmedBillReturnsOnlyCurrentActorCandidatesAndHidesUnrelatedPairs()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Candidate Actor");
        var otherDebtor = await SeedAccountAsync(testFactory, "Group Candidate Other Debtor", InitialTimestamp.AddMinutes(1));
        var firstCreditor = await SeedAccountAsync(testFactory, "Group Candidate First Creditor", InitialTimestamp.AddMinutes(2));
        var secondCreditor = await SeedAccountAsync(testFactory, "Group Candidate Second Creditor", InitialTimestamp.AddMinutes(3));
        var groupId = await SeedGroupAsync(
            testFactory,
            firstCreditor.UserProfileId,
            "Hidden Candidate Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(otherDebtor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(firstCreditor.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(secondCreditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            firstCreditor.UserProfileId,
            groupId,
            [
                new ParticipantSeed(actorSession.UserProfileId, 20m),
                new ParticipantSeed(otherDebtor.UserProfileId, 20m),
                new ParticipantSeed(firstCreditor.UserProfileId, 20m),
                new ParticipantSeed(secondCreditor.UserProfileId, 20m)
            ],
            [
                new PayerSeed(firstCreditor.UserProfileId, 40m),
                new PayerSeed(secondCreditor.UserProfileId, 40m)
            ],
            ExpenseBillStatuses.Confirmed,
            "Hidden Group Candidate Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            GroupCandidatesPath(groupId, billId),
            actorSession.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafePreviewResponseContent(content, otherDebtor.UserProfileId.ToString("D"), "Hidden Group Candidate Merchant");

        using var payload = JsonDocument.Parse(content);
        var candidate = Assert.Single(payload.RootElement.GetProperty("candidates").EnumerateArray());
        Assert.Equal(billId, candidate.GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal(groupId, candidate.GetProperty("groupId").GetGuid());
        Assert.Equal(actorSession.UserProfileId, candidate.GetProperty("debtorUserProfileId").GetGuid());
        Assert.Contains(
            candidate.GetProperty("creditorUserProfileId").GetGuid(),
            new[] { firstCreditor.UserProfileId, secondCreditor.UserProfileId });
        Assert.Equal("20", candidate.GetProperty("amount").GetString());
        Assert.Equal("USD", candidate.GetProperty("currency").GetString());
    }

    [Fact]
    public async Task AuthorizedPersonalActorWithNoCandidateGetsEmptyListWithoutLeakingUnrelatedCandidates()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Balanced Personal Actor");
        var debtor = await SeedAccountAsync(testFactory, "Hidden Personal Debtor", InitialTimestamp.AddMinutes(1));
        var creditor = await SeedAccountAsync(testFactory, "Hidden Personal Creditor", InitialTimestamp.AddMinutes(2));
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 10m),
                new ParticipantSeed(debtor.UserProfileId, 50m),
                new ParticipantSeed(creditor.UserProfileId, 40m)
            ],
            [
                new PayerSeed(actorSession.UserProfileId, 10m),
                new PayerSeed(creditor.UserProfileId, 90m)
            ],
            ExpenseBillStatuses.Confirmed,
            "Hidden Unrelated Candidate Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            PersonalCandidatesPath(billId),
            actorSession.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafePreviewResponseContent(
            content,
            debtor.UserProfileId.ToString("D"),
            creditor.UserProfileId.ToString("D"),
            "Hidden Unrelated Candidate Merchant");
        using var payload = JsonDocument.Parse(content);
        Assert.Empty(payload.RootElement.GetProperty("candidates").EnumerateArray());
    }

    [Fact]
    public async Task ConfirmedBillWithNoSettlementCandidatesMapsToEmptyList()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "No Candidate Actor");
        var other = await SeedAccountAsync(testFactory, "No Candidate Other", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 50m),
                new ParticipantSeed(other.UserProfileId, 50m)
            ],
            [
                new PayerSeed(actorSession.UserProfileId, 50m),
                new PayerSeed(other.UserProfileId, 50m)
            ],
            ExpenseBillStatuses.Confirmed,
            "Hidden Balanced Candidate Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            PersonalCandidatesPath(billId),
            actorSession.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        Assert.Empty(payload.RootElement.GetProperty("candidates").EnumerateArray());
    }

    [Theory]
    [InlineData(ExpenseBillStatuses.Draft)]
    [InlineData(ExpenseBillStatuses.PendingConfirmation)]
    [InlineData(ExpenseBillStatuses.Rejected)]
    [InlineData(ExpenseBillStatuses.Cancelled)]
    [InlineData(ExpenseBillStatuses.Finalized)]
    public async Task VisibleNonConfirmedPersonalBillsMapToConflict(string status)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Conflict Actor {status}");
        var other = await SeedAccountAsync(testFactory, $"Conflict Other {status}", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 50m),
                new ParticipantSeed(other.UserProfileId, 50m)
            ],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            status,
            "Hidden Conflict Candidate Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            PersonalCandidatesPath(billId),
            actorSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertSettlementCandidateConflictProblemAsync(response);
    }

    [Fact]
    public async Task PersonalUnavailableCasesFailClosedWithNotFound()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal Fail Closed Actor");
        var other = await SeedAccountAsync(testFactory, "Personal Fail Closed Other", InitialTimestamp.AddMinutes(1));
        var deletedCreator = await SeedAccountAsync(
            testFactory,
            "Personal Deleted Creator",
            InitialTimestamp.AddMinutes(2),
            deletedAtUtc: InitialTimestamp.AddMinutes(30));
        var deletedCounterparty = await SeedAccountAsync(
            testFactory,
            "Personal Deleted Counterparty",
            InitialTimestamp.AddMinutes(3),
            deletedAtUtc: InitialTimestamp.AddMinutes(31));
        var groupBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: Guid.NewGuid(),
            [new ParticipantSeed(actorSession.UserProfileId, 100m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Group Mismatch Merchant",
            InitialTimestamp);
        var archivedBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 100m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Archived Merchant",
            InitialTimestamp,
            archivedAtUtc: InitialTimestamp.AddMinutes(40));
        var archivedStatusBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 100m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Archived,
            "Hidden Archived Status Merchant",
            InitialTimestamp);
        var unrelatedBillId = await SeedBillAsync(
            testFactory,
            other.UserProfileId,
            groupId: null,
            [new ParticipantSeed(other.UserProfileId, 100m)],
            [new PayerSeed(other.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Unrelated Merchant",
            InitialTimestamp);
        var deletedCreatorBillId = await SeedBillAsync(
            testFactory,
            deletedCreator.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 50m), new ParticipantSeed(deletedCreator.UserProfileId, 50m)],
            [new PayerSeed(deletedCreator.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Deleted Creator Merchant",
            InitialTimestamp);
        var deletedCounterpartyBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 50m), new ParticipantSeed(deletedCounterparty.UserProfileId, 50m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Deleted Counterparty Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        var unavailablePaths = new[]
        {
            PersonalCandidatesPath(Guid.NewGuid()),
            PersonalCandidatesPath(groupBillId),
            PersonalCandidatesPath(archivedBillId),
            PersonalCandidatesPath(archivedStatusBillId),
            PersonalCandidatesPath(unrelatedBillId),
            PersonalCandidatesPath(deletedCreatorBillId),
            PersonalCandidatesPath(deletedCounterpartyBillId)
        };

        foreach (var path in unavailablePaths)
        {
            using var request = CreateBearerRequest(HttpMethod.Get, path, actorSession.RawSessionToken);
            using var response = await client.SendAsync(request);

            await AssertBillUnavailableProblemAsync(response);
        }
    }

    [Fact]
    public async Task GroupUnavailableCasesFailClosedWithNotFound()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Fail Closed Actor");
        var other = await SeedAccountAsync(testFactory, "Group Fail Closed Other", InitialTimestamp.AddMinutes(1));
        var deletedCounterparty = await SeedAccountAsync(
            testFactory,
            "Group Deleted Counterparty",
            InitialTimestamp.AddMinutes(2),
            deletedAtUtc: InitialTimestamp.AddMinutes(31));
        var removedCounterparty = await SeedAccountAsync(
            testFactory,
            "Group Removed Counterparty",
            InitialTimestamp.AddMinutes(3));
        var activeGroupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Active Fail Closed Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(other.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var wrongGroupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Wrong Route Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var deletedGroupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Deleted Fail Closed Group",
            InitialTimestamp,
            deletedAtUtc: InitialTimestamp.AddMinutes(30),
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var removedGroupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Removed Fail Closed Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        var inactiveCounterpartyGroupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Inactive Counterparty Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(deletedCounterparty.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(removedCounterparty.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        var archivedBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            activeGroupId,
            [new ParticipantSeed(actorSession.UserProfileId, 100m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Archived Group Bill",
            InitialTimestamp,
            archivedAtUtc: InitialTimestamp.AddMinutes(40));
        var archivedStatusBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            activeGroupId,
            [new ParticipantSeed(actorSession.UserProfileId, 100m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Archived,
            "Hidden Archived Group Status Bill",
            InitialTimestamp);
        var wrongRouteBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            activeGroupId,
            [new ParticipantSeed(actorSession.UserProfileId, 100m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Wrong Route Merchant",
            InitialTimestamp);
        var personalBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 100m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Personal Route Merchant",
            InitialTimestamp);
        var membershipOnlyBillId = await SeedBillAsync(
            testFactory,
            other.UserProfileId,
            activeGroupId,
            [new ParticipantSeed(other.UserProfileId, 100m)],
            [new PayerSeed(other.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Membership Only Merchant",
            InitialTimestamp);
        var deletedGroupBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            deletedGroupId,
            [new ParticipantSeed(actorSession.UserProfileId, 100m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Deleted Group Merchant",
            InitialTimestamp);
        var removedMemberBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            removedGroupId,
            [new ParticipantSeed(actorSession.UserProfileId, 100m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Removed Member Merchant",
            InitialTimestamp);
        var deletedCounterpartyBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            inactiveCounterpartyGroupId,
            [new ParticipantSeed(actorSession.UserProfileId, 50m), new ParticipantSeed(deletedCounterparty.UserProfileId, 50m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Deleted Group Counterparty Merchant",
            InitialTimestamp);
        var removedCounterpartyBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            inactiveCounterpartyGroupId,
            [new ParticipantSeed(actorSession.UserProfileId, 50m), new ParticipantSeed(removedCounterparty.UserProfileId, 50m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Removed Group Counterparty Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        var unavailablePaths = new[]
        {
            GroupCandidatesPath(activeGroupId, Guid.NewGuid()),
            GroupCandidatesPath(activeGroupId, archivedBillId),
            GroupCandidatesPath(activeGroupId, archivedStatusBillId),
            GroupCandidatesPath(wrongGroupId, wrongRouteBillId),
            GroupCandidatesPath(activeGroupId, personalBillId),
            GroupCandidatesPath(activeGroupId, membershipOnlyBillId),
            GroupCandidatesPath(deletedGroupId, deletedGroupBillId),
            GroupCandidatesPath(removedGroupId, removedMemberBillId),
            GroupCandidatesPath(inactiveCounterpartyGroupId, deletedCounterpartyBillId),
            GroupCandidatesPath(inactiveCounterpartyGroupId, removedCounterpartyBillId)
        };

        foreach (var path in unavailablePaths)
        {
            using var request = CreateBearerRequest(HttpMethod.Get, path, actorSession.RawSessionToken);
            using var response = await client.SendAsync(request);

            await AssertGroupBillUnavailableProblemAsync(response);
        }
    }

    [Fact]
    public async Task MissingOrInvalidSessionReturnsUniformUnauthorized()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var missingPersonalRequest = new HttpRequestMessage(HttpMethod.Get, PersonalCandidatesPath(Guid.NewGuid()));
        using var missingPersonalResponse = await client.SendAsync(missingPersonalRequest);
        await AssertUnauthenticatedProblemAsync(missingPersonalResponse);

        using var invalidPersonalRequest = CreateBearerRequest(
            HttpMethod.Get,
            PersonalCandidatesPath(Guid.NewGuid()),
            WrongRawToken);
        using var invalidPersonalResponse = await client.SendAsync(invalidPersonalRequest);
        await AssertUnauthenticatedProblemAsync(invalidPersonalResponse, WrongRawToken);

        using var missingGroupRequest = new HttpRequestMessage(HttpMethod.Get, GroupCandidatesPath(Guid.NewGuid(), Guid.NewGuid()));
        using var missingGroupResponse = await client.SendAsync(missingGroupRequest);
        await AssertUnauthenticatedProblemAsync(missingGroupResponse);

        using var invalidGroupRequest = CreateBearerRequest(
            HttpMethod.Get,
            GroupCandidatesPath(Guid.NewGuid(), Guid.NewGuid()),
            WrongRawToken);
        using var invalidGroupResponse = await client.SendAsync(invalidGroupRequest);
        await AssertUnauthenticatedProblemAsync(invalidGroupResponse, WrongRawToken);
    }

    [Fact]
    public async Task PreviewEndpointDoesNotCreateSettlementPaymentProofFilePaymentProfileAuditOrBillRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Read Only Preview Actor");
        var payer = await SeedAccountAsync(testFactory, "Read Only Preview Payer", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 50m),
                new ParticipantSeed(payer.UserProfileId, 50m)
            ],
            [new PayerSeed(payer.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            "Hidden Read Only Merchant",
            InitialTimestamp);
        var beforeCounts = await ReadPreviewSideEffectCountsAsync(testFactory);
        var beforeUpdatedAt = await ReadBillUpdatedAtAsync(testFactory, billId);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            PersonalCandidatesPath(billId),
            actorSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(beforeCounts, await ReadPreviewSideEffectCountsAsync(testFactory));
        Assert.Equal(beforeUpdatedAt, await ReadBillUpdatedAtAsync(testFactory, billId));
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new SettlementCandidatePreviewTestTimeProvider(InitialTimestamp);
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
        SettlementCandidatePreviewTestTimeProvider timeProvider,
        string displayName)
    {
        var account = await SeedAccountAsync(testFactory, displayName, InitialTimestamp);
        return await SeedSessionForAccountAsync(testFactory, timeProvider, account);
    }

    private static async Task<SeededAccount> SeedAccountAsync(
        WebApplicationFactory<Program> testFactory,
        string displayName,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? deletedAtUtc = null)
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
            DeletedAtUtc = deletedAtUtc
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
        return new SeededAccount(authAccountId, userProfileId);
    }

    private static async Task<SeededSession> SeedSessionForAccountAsync(
        WebApplicationFactory<Program> testFactory,
        SettlementCandidatePreviewTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Settlement candidate preview endpoint test",
                UserAgentSummary: "Settlement candidate preview endpoint test user agent",
                NetworkAddressHash: "settlement-candidate-preview-endpoint-test-network",
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

    private static async Task<Guid> SeedGroupAsync(
        WebApplicationFactory<Program> testFactory,
        Guid creatorUserProfileId,
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
            CreatedByUserProfileId = creatorUserProfileId,
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

    private static async Task<Guid> SeedBillAsync(
        WebApplicationFactory<Program> testFactory,
        Guid creatorProfileId,
        Guid? groupId,
        IReadOnlyList<ParticipantSeed> participants,
        IReadOnlyList<PayerSeed> payers,
        string status,
        string merchantName,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? archivedAtUtc = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var billId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var totalAmount = participants.Sum(participant => participant.ResolvedShareAmount);
        var bill = new ExpenseBill
        {
            Id = billId,
            CreatedByUserProfileId = creatorProfileId,
            GroupId = groupId,
            MerchantName = merchantName,
            BillDate = DateOnly.FromDateTime(createdAtUtc.UtcDateTime),
            Status = status,
            TotalAmount = totalAmount,
            TotalCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            ArchivedAtUtc = archivedAtUtc
        };

        var item = new ExpenseBillItem
        {
            Id = itemId,
            ExpenseBillId = billId,
            Name = "Hidden Seeded Settlement Candidate Item",
            Amount = totalAmount,
            Currency = "USD",
            SortOrder = 0,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };

        for (var index = 0; index < participants.Count; index++)
        {
            var participant = participants[index];
            bill.Participants.Add(new ExpenseBillParticipant
            {
                ExpenseBillId = billId,
                UserProfileId = participant.UserProfileId,
                Status = participant.Status,
                ResolvedShareAmount = participant.ResolvedShareAmount,
                ResolvedShareCurrency = "USD",
                AcceptedAtUtc = participant.AcceptedAtUtc,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
            item.Splits.Add(new ExpenseBillItemSplit
            {
                Id = Guid.NewGuid(),
                ExpenseBillItemId = itemId,
                UserProfileId = participant.UserProfileId,
                SplitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                BasisValue = participant.ResolvedShareAmount,
                ResolvedAmount = participant.ResolvedShareAmount,
                ResolvedCurrency = "USD",
                AllocationOrder = index,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        bill.Items.Add(item);
        foreach (var payer in payers)
        {
            bill.Payers.Add(new ExpenseBillPayer
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = billId,
                UserProfileId = payer.UserProfileId,
                Amount = payer.Amount,
                Currency = "USD",
                PaymentMethodLabelSnapshot = "Hidden payment method label",
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        dbContext.Set<ExpenseBill>().Add(bill);
        await dbContext.SaveChangesAsync();
        return billId;
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

    private static async Task<DateTimeOffset> ReadBillUpdatedAtAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBill>()
            .Where(bill => bill.Id == billId)
            .Select(bill => bill.UpdatedAtUtc)
            .SingleAsync();
    }

    private static async Task<PreviewSideEffectCounts> ReadPreviewSideEffectCountsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new PreviewSideEffectCounts(
            await dbContext.Set<ExpenseBill>().CountAsync(),
            await dbContext.Set<SettlementRequest>().CountAsync(),
            await dbContext.Set<SettlementPayment>().CountAsync(),
            await dbContext.Set<SettlementProofAttachment>().CountAsync(),
            await dbContext.Set<UserPaymentProfile>().CountAsync(),
            await dbContext.Set<FileObject>().CountAsync(),
            await dbContext.Set<AuthAuditEvent>().CountAsync(auditEvent =>
                auditEvent.Action != "session.created"
                && auditEvent.Action != "session.validated"
                && auditEvent.Action != "session.validation_failed"
                && auditEvent.Action != "session.revoked"));
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

    private static string PersonalCandidatesPath(Guid billId)
    {
        return $"/api/v1/bills/{billId:D}/settlement-candidates";
    }

    private static string GroupCandidatesPath(Guid groupId, Guid billId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/settlement-candidates";
    }

    private static void AssertSafePreviewResponseContent(
        string content,
        params string[] forbiddenValues)
    {
        var lowerContent = content.ToLowerInvariant();

        foreach (var forbiddenValue in forbiddenValues)
        {
            Assert.DoesNotContain(forbiddenValue, content);
        }

        Assert.DoesNotContain("auth", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("storageobject", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("object_key", lowerContent);
        Assert.DoesNotContain("vault", lowerContent);
        Assert.DoesNotContain("paymentprofile", lowerContent);
        Assert.DoesNotContain("payment_profile", lowerContent);
        Assert.DoesNotContain("paymenthandle", lowerContent);
        Assert.DoesNotContain("payment_handle", lowerContent);
        Assert.DoesNotContain("paymentnote", lowerContent);
        Assert.DoesNotContain("payment_note", lowerContent);
        Assert.DoesNotContain("methodlabel", lowerContent);
        Assert.DoesNotContain("proof", lowerContent);
        Assert.DoesNotContain("requestbody", lowerContent);
        Assert.DoesNotContain("request_body", lowerContent);
        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("ocr", lowerContent);
    }

    private static async Task AssertSettlementCandidateConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement candidate preview conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Settlement candidates cannot be previewed for the current bill state.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertBillUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bill unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested bill is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertGroupBillUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Group bill unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested group bill is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
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
        SettlementCandidatePreviewTestTimeProvider TimeProvider);

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
        string Status);

    private sealed record ParticipantSeed(
        Guid UserProfileId,
        decimal ResolvedShareAmount,
        string Status = ExpenseBillParticipantStatuses.Accepted,
        DateTimeOffset? AcceptedAtUtc = null);

    private sealed record PayerSeed(
        Guid UserProfileId,
        decimal Amount);

    private sealed record PreviewSideEffectCounts(
        int ExpenseBillCount,
        int SettlementRequestCount,
        int SettlementPaymentCount,
        int SettlementProofAttachmentCount,
        int UserPaymentProfileCount,
        int FileObjectCount,
        int NonSessionAuditEventCount);

    private sealed class SettlementCandidatePreviewTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public SettlementCandidatePreviewTestTimeProvider(DateTimeOffset utcNow)
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
