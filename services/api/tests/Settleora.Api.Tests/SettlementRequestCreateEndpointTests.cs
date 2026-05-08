using System.Globalization;
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
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class SettlementRequestCreateEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WrongRawToken = "visible-wrong-settlement-request-session-token";
    private const string HiddenMerchantName = "Hidden Settlement Request Merchant";
    private const string HiddenItemName = "Hidden Seeded Settlement Request Item";
    private const string HiddenPaymentMethodLabel = "Hidden settlement payment method label";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 8, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 8, 10, 15, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public SettlementRequestCreateEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PersonalConfirmedBillCandidateCreatesRequestedSettlementWithBoundedResponseAuditAndNoProofOrPaymentRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal Settlement Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Personal Settlement Creditor", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 50m),
                new ParticipantSeed(creditor.UserProfileId, 50m)
            ],
            [new PayerSeed(creditor.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var candidateKey = CandidateKey(billId, debtorSession.UserProfileId, creditor.UserProfileId, 50m);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, debtorSession.AuthSessionId);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalSettlementRequestsPath(billId),
            debtorSession.RawSessionToken,
            $$"""{"candidateKey":"{{candidateKey}}"}""");

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeCreateResponseContent(
            content,
            debtorSession.RawSessionToken,
            sessionTokenHash,
            HiddenMerchantName,
            HiddenItemName,
            HiddenPaymentMethodLabel);

        using var payload = JsonDocument.Parse(content);
        AssertSettlementRequestResponseShape(payload.RootElement);
        Assert.NotEqual(Guid.Empty, payload.RootElement.GetProperty("id").GetGuid());
        Assert.Equal(billId, payload.RootElement.GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal(JsonValueKind.Null, payload.RootElement.GetProperty("groupId").ValueKind);
        Assert.Equal(debtorSession.UserProfileId, payload.RootElement.GetProperty("debtorUserProfileId").GetGuid());
        Assert.Equal(creditor.UserProfileId, payload.RootElement.GetProperty("creditorUserProfileId").GetGuid());
        Assert.Equal("50", payload.RootElement.GetProperty("amount").GetString());
        Assert.Equal("USD", payload.RootElement.GetProperty("currency").GetString());
        Assert.Equal(SettlementRequestStatuses.Requested, payload.RootElement.GetProperty("status").GetString());
        Assert.Equal(debtorSession.UserProfileId, payload.RootElement.GetProperty("requestedByUserProfileId").GetGuid());
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("requestedAtUtc").GetDateTimeOffset());
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("createdAtUtc").GetDateTimeOffset());
        Assert.Equal(ValidationTimestamp, payload.RootElement.GetProperty("updatedAtUtc").GetDateTimeOffset());

        var persisted = await ReadSettlementStateAsync(testFactory);
        var settlementRequest = Assert.Single(persisted.Requests);
        Assert.Equal(payload.RootElement.GetProperty("id").GetGuid(), settlementRequest.Id);
        Assert.Equal(billId, settlementRequest.SourceExpenseBillId);
        Assert.Null(settlementRequest.GroupId);
        Assert.Equal(debtorSession.UserProfileId, settlementRequest.DebtorUserProfileId);
        Assert.Equal(creditor.UserProfileId, settlementRequest.CreditorUserProfileId);
        Assert.Equal(50m, settlementRequest.Amount);
        Assert.Equal("USD", settlementRequest.Currency);
        Assert.Equal(SettlementRequestStatuses.Requested, settlementRequest.Status);
        Assert.Equal(debtorSession.UserProfileId, settlementRequest.RequestedByUserProfileId);
        Assert.Equal(ValidationTimestamp, settlementRequest.RequestedAtUtc);
        Assert.Empty(persisted.Payments);
        Assert.Empty(persisted.ProofAttachments);

        var auditEvent = Assert.Single(persisted.SettlementAuditEvents);
        Assert.Equal("settlement.request_created", auditEvent.Action);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.Equal(debtorSession.AuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.Equal(debtorSession.AuthAccountId, auditEvent.SubjectAuthAccountId);
        AssertBoundedAuditMetadata(
            auditEvent.SafeMetadataJson,
            settlementRequest.Id,
            billId,
            groupId: null,
            "personal",
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            "50",
            "USD");
    }

    [Fact]
    public async Task GroupConfirmedBillCandidateCreatesRequestedSettlement()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creditorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Settlement Creditor");
        var debtor = await SeedAccountAsync(testFactory, "Group Settlement Debtor", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            creditorSession.UserProfileId,
            "Hidden Settlement Request Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(creditorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(debtor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            creditorSession.UserProfileId,
            groupId,
            [
                new ParticipantSeed(debtor.UserProfileId, 40m),
                new ParticipantSeed(creditorSession.UserProfileId, 40m)
            ],
            [new PayerSeed(creditorSession.UserProfileId, 80m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var candidateKey = CandidateKey(billId, debtor.UserProfileId, creditorSession.UserProfileId, 40m);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            GroupSettlementRequestsPath(groupId, billId),
            creditorSession.RawSessionToken,
            $$"""{"candidateKey":"{{candidateKey}}"}""");

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        AssertSettlementRequestResponseShape(payload.RootElement);
        Assert.Equal(groupId, payload.RootElement.GetProperty("groupId").GetGuid());
        Assert.Equal(debtor.UserProfileId, payload.RootElement.GetProperty("debtorUserProfileId").GetGuid());
        Assert.Equal(creditorSession.UserProfileId, payload.RootElement.GetProperty("creditorUserProfileId").GetGuid());
        Assert.Equal("40", payload.RootElement.GetProperty("amount").GetString());

        var persisted = await ReadSettlementStateAsync(testFactory);
        var settlementRequest = Assert.Single(persisted.Requests);
        Assert.Equal(groupId, settlementRequest.GroupId);
        Assert.Empty(persisted.Payments);
        Assert.Empty(persisted.ProofAttachments);
        var auditEvent = Assert.Single(persisted.SettlementAuditEvents);
        AssertBoundedAuditMetadata(
            auditEvent.SafeMetadataJson,
            settlementRequest.Id,
            billId,
            groupId,
            "group",
            debtor.UserProfileId,
            creditorSession.UserProfileId,
            "40",
            "USD");
    }

    [Fact]
    public async Task ActorMustBeDebtorOrCreditorForSubmittedCandidate()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Visible Non Party Creator");
        var debtor = await SeedAccountAsync(testFactory, "Visible Non Party Debtor", InitialTimestamp.AddMinutes(1));
        var creditor = await SeedAccountAsync(testFactory, "Visible Non Party Creditor", InitialTimestamp.AddMinutes(2));
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtor.UserProfileId, 30m),
                new ParticipantSeed(creditor.UserProfileId, 30m)
            ],
            [new PayerSeed(creditor.UserProfileId, 60m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var candidateKey = CandidateKey(billId, debtor.UserProfileId, creditor.UserProfileId, 30m);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalSettlementRequestsPath(billId),
            creatorSession.RawSessionToken,
            $$"""{"candidateKey":"{{candidateKey}}"}""");

        using var response = await client.SendAsync(request);

        await AssertSettlementRequestConflictProblemAsync(response);
        await AssertNoSettlementSideEffectsAsync(testFactory);
    }

    [Fact]
    public async Task GroupMembershipAloneDoesNotAllowUnrelatedCandidateCreation()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var memberSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Membership Only Actor");
        var debtor = await SeedAccountAsync(testFactory, "Membership Only Debtor", InitialTimestamp.AddMinutes(1));
        var creditor = await SeedAccountAsync(testFactory, "Membership Only Creditor", InitialTimestamp.AddMinutes(2));
        var groupId = await SeedGroupAsync(
            testFactory,
            creditor.UserProfileId,
            "Hidden Membership Only Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(memberSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(debtor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId,
            [
                new ParticipantSeed(debtor.UserProfileId, 60m),
                new ParticipantSeed(creditor.UserProfileId, 60m)
            ],
            [new PayerSeed(creditor.UserProfileId, 120m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var candidateKey = CandidateKey(billId, debtor.UserProfileId, creditor.UserProfileId, 60m);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            GroupSettlementRequestsPath(groupId, billId),
            memberSession.RawSessionToken,
            $$"""{"candidateKey":"{{candidateKey}}"}""");

        using var response = await client.SendAsync(request);

        await AssertGroupBillUnavailableProblemAsync(response);
        await AssertNoSettlementSideEffectsAsync(testFactory);
    }

    [Fact]
    public async Task DeletedPersonalBillCounterpartyFailsClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Deleted Personal Actor");
        var deletedCounterparty = await SeedAccountAsync(
            testFactory,
            "Deleted Personal Counterparty",
            InitialTimestamp.AddMinutes(1),
            deletedAtUtc: InitialTimestamp.AddMinutes(30));
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 50m),
                new ParticipantSeed(deletedCounterparty.UserProfileId, 50m)
            ],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var candidateKey = CandidateKey(billId, deletedCounterparty.UserProfileId, actorSession.UserProfileId, 50m);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalSettlementRequestsPath(billId),
            actorSession.RawSessionToken,
            $$"""{"candidateKey":"{{candidateKey}}"}""");

        using var response = await client.SendAsync(request);

        await AssertBillUnavailableProblemAsync(response);
        await AssertNoSettlementSideEffectsAsync(testFactory);
    }

    [Fact]
    public async Task DeletedOrRemovedGroupBillCounterpartyFailsClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Counterparty Actor");
        var deletedCounterparty = await SeedAccountAsync(
            testFactory,
            "Deleted Group Counterparty",
            InitialTimestamp.AddMinutes(1),
            deletedAtUtc: InitialTimestamp.AddMinutes(30));
        var removedCounterparty = await SeedAccountAsync(testFactory, "Removed Group Counterparty", InitialTimestamp.AddMinutes(2));
        var deletedCounterpartyGroupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Deleted Counterparty Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(deletedCounterparty.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var removedCounterpartyGroupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Removed Counterparty Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(removedCounterparty.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        var deletedCounterpartyBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            deletedCounterpartyGroupId,
            [
                new ParticipantSeed(actorSession.UserProfileId, 50m),
                new ParticipantSeed(deletedCounterparty.UserProfileId, 50m)
            ],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var removedCounterpartyBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            removedCounterpartyGroupId,
            [
                new ParticipantSeed(actorSession.UserProfileId, 50m),
                new ParticipantSeed(removedCounterparty.UserProfileId, 50m)
            ],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var deletedRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            GroupSettlementRequestsPath(deletedCounterpartyGroupId, deletedCounterpartyBillId),
            actorSession.RawSessionToken,
            $$"""{"candidateKey":"{{CandidateKey(deletedCounterpartyBillId, deletedCounterparty.UserProfileId, actorSession.UserProfileId, 50m)}}"}""");
        using var deletedResponse = await client.SendAsync(deletedRequest);
        await AssertGroupBillUnavailableProblemAsync(deletedResponse);

        using var removedRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            GroupSettlementRequestsPath(removedCounterpartyGroupId, removedCounterpartyBillId),
            actorSession.RawSessionToken,
            $$"""{"candidateKey":"{{CandidateKey(removedCounterpartyBillId, removedCounterparty.UserProfileId, actorSession.UserProfileId, 50m)}}"}""");
        using var removedResponse = await client.SendAsync(removedRequest);
        await AssertGroupBillUnavailableProblemAsync(removedResponse);

        await AssertNoSettlementSideEffectsAsync(testFactory);
    }

    [Fact]
    public async Task UnknownCandidateKeyReturnsBoundedConflictWithoutSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Unknown Candidate Actor");
        var creditor = await SeedAccountAsync(testFactory, "Unknown Candidate Creditor", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 25m),
                new ParticipantSeed(creditor.UserProfileId, 25m)
            ],
            [new PayerSeed(creditor.UserProfileId, 50m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalSettlementRequestsPath(billId),
            actorSession.RawSessionToken,
            """{"candidateKey":"stale-or-unknown-candidate"}""");

        using var response = await client.SendAsync(request);

        await AssertSettlementRequestConflictProblemAsync(response);
        await AssertNoSettlementSideEffectsAsync(testFactory);
    }

    [Theory]
    [InlineData(SettlementRequestStatuses.Requested)]
    [InlineData(SettlementRequestStatuses.PartiallyPaid)]
    [InlineData(SettlementRequestStatuses.MarkedPaid)]
    [InlineData(SettlementRequestStatuses.Confirmed)]
    [InlineData(SettlementRequestStatuses.Disputed)]
    public async Task DuplicateActiveSettlementRequestReturnsBoundedConflict(string duplicateStatus)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, $"Duplicate Debtor {duplicateStatus}");
        var creditor = await SeedAccountAsync(testFactory, $"Duplicate Creditor {duplicateStatus}", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 45m),
                new ParticipantSeed(creditor.UserProfileId, 45m)
            ],
            [new PayerSeed(creditor.UserProfileId, 90m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            debtorSession.UserProfileId,
            45m,
            duplicateStatus,
            archivedAtUtc: null);
        var candidateKey = CandidateKey(billId, debtorSession.UserProfileId, creditor.UserProfileId, 45m);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalSettlementRequestsPath(billId),
            debtorSession.RawSessionToken,
            $$"""{"candidateKey":"{{candidateKey}}"}""");

        using var response = await client.SendAsync(request);

        await AssertSettlementRequestConflictProblemAsync(response);
        var persisted = await ReadSettlementStateAsync(testFactory);
        Assert.Single(persisted.Requests);
        Assert.Empty(persisted.SettlementAuditEvents);
    }

    [Fact]
    public async Task NonConfirmedVisibleBillReturnsBoundedConflictWithoutSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Non Confirmed Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Non Confirmed Creditor", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(debtorSession.UserProfileId, 35m),
                new ParticipantSeed(creditor.UserProfileId, 35m)
            ],
            [new PayerSeed(creditor.UserProfileId, 70m)],
            ExpenseBillStatuses.Draft,
            InitialTimestamp);
        var candidateKey = CandidateKey(billId, debtorSession.UserProfileId, creditor.UserProfileId, 35m);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalSettlementRequestsPath(billId),
            debtorSession.RawSessionToken,
            $$"""{"candidateKey":"{{candidateKey}}"}""");

        using var response = await client.SendAsync(request);

        await AssertSettlementRequestConflictProblemAsync(response);
        await AssertNoSettlementSideEffectsAsync(testFactory);
    }

    [Fact]
    public async Task MissingArchivedUnrelatedAndWrongRouteBillsFailClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Unavailable Actor");
        var other = await SeedAccountAsync(testFactory, "Unavailable Other", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Unavailable Route Group",
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
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(other.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var personalBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 50m), new ParticipantSeed(other.UserProfileId, 50m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var groupBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(actorSession.UserProfileId, 50m), new ParticipantSeed(other.UserProfileId, 50m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var archivedBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 50m), new ParticipantSeed(other.UserProfileId, 50m)],
            [new PayerSeed(actorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp,
            archivedAtUtc: InitialTimestamp.AddMinutes(20));
        var unrelatedBillId = await SeedBillAsync(
            testFactory,
            other.UserProfileId,
            groupId: null,
            [new ParticipantSeed(other.UserProfileId, 50m)],
            [new PayerSeed(other.UserProfileId, 50m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var candidateKey = CandidateKey(personalBillId, other.UserProfileId, actorSession.UserProfileId, 50m);
        using var client = testFactory.CreateClient();

        var personalUnavailablePaths = new[]
        {
            PersonalSettlementRequestsPath(Guid.NewGuid()),
            PersonalSettlementRequestsPath(groupBillId),
            PersonalSettlementRequestsPath(archivedBillId),
            PersonalSettlementRequestsPath(unrelatedBillId)
        };
        foreach (var path in personalUnavailablePaths)
        {
            using var request = CreateJsonBearerRequest(HttpMethod.Post, path, actorSession.RawSessionToken, $$"""{"candidateKey":"{{candidateKey}}"}""");
            using var response = await client.SendAsync(request);
            await AssertBillUnavailableProblemAsync(response);
        }

        var groupUnavailablePaths = new[]
        {
            GroupSettlementRequestsPath(groupId, personalBillId),
            GroupSettlementRequestsPath(wrongGroupId, groupBillId),
            GroupSettlementRequestsPath(groupId, Guid.NewGuid())
        };
        foreach (var path in groupUnavailablePaths)
        {
            using var request = CreateJsonBearerRequest(HttpMethod.Post, path, actorSession.RawSessionToken, $$"""{"candidateKey":"{{candidateKey}}"}""");
            using var response = await client.SendAsync(request);
            await AssertGroupBillUnavailableProblemAsync(response);
        }

        await AssertNoSettlementSideEffectsAsync(testFactory);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("[]")]
    [InlineData("{")]
    [InlineData("""{"candidateKey":""}""")]
    [InlineData("""{"candidateKey":"valid-looking-key","debtorUserProfileId":"00000000-0000-0000-0000-000000000000"}""")]
    public async Task MalformedOrUnsupportedRequestBodyReturnsBoundedBadRequest(string body)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Bad Body Actor");
        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalSettlementRequestsPath(Guid.NewGuid()),
            actorSession.RawSessionToken,
            body);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("debtorUserProfileId", content);
        Assert.DoesNotContain("00000000-0000-0000-0000-000000000000", content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid settlement request", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("The submitted settlement request is invalid.", payload.RootElement.GetProperty("detail").GetString());

        await AssertNoSettlementSideEffectsAsync(testFactory);
    }

    [Fact]
    public async Task MissingOrInvalidSessionReturnsUniformUnauthorized()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var missingPersonalRequest = CreateJsonRequest(
            HttpMethod.Post,
            PersonalSettlementRequestsPath(Guid.NewGuid()),
            """{"candidateKey":"candidate"}""");
        using var missingPersonalResponse = await client.SendAsync(missingPersonalRequest);
        await AssertUnauthenticatedProblemAsync(missingPersonalResponse);

        using var invalidPersonalRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalSettlementRequestsPath(Guid.NewGuid()),
            WrongRawToken,
            """{"candidateKey":"candidate"}""");
        using var invalidPersonalResponse = await client.SendAsync(invalidPersonalRequest);
        await AssertUnauthenticatedProblemAsync(invalidPersonalResponse, WrongRawToken);

        using var missingGroupRequest = CreateJsonRequest(
            HttpMethod.Post,
            GroupSettlementRequestsPath(Guid.NewGuid(), Guid.NewGuid()),
            """{"candidateKey":"candidate"}""");
        using var missingGroupResponse = await client.SendAsync(missingGroupRequest);
        await AssertUnauthenticatedProblemAsync(missingGroupResponse);

        using var invalidGroupRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            GroupSettlementRequestsPath(Guid.NewGuid(), Guid.NewGuid()),
            WrongRawToken,
            """{"candidateKey":"candidate"}""");
        using var invalidGroupResponse = await client.SendAsync(invalidGroupRequest);
        await AssertUnauthenticatedProblemAsync(invalidGroupResponse, WrongRawToken);

        await AssertNoSettlementSideEffectsAsync(testFactory);
    }

    [Fact]
    public async Task FailedCreateDoesNotWriteSettlementOrSettlementAuditSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "No Side Effects Actor");
        var creditor = await SeedAccountAsync(testFactory, "No Side Effects Creditor", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 20m),
                new ParticipantSeed(creditor.UserProfileId, 20m)
            ],
            [new PayerSeed(creditor.UserProfileId, 40m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var before = await ReadSettlementStateAsync(testFactory);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            PersonalSettlementRequestsPath(billId),
            actorSession.RawSessionToken,
            """{"candidateKey":"wrong-candidate"}""");

        using var response = await client.SendAsync(request);

        await AssertSettlementRequestConflictProblemAsync(response);
        var after = await ReadSettlementStateAsync(testFactory);
        Assert.Equal(before.Requests.Count, after.Requests.Count);
        Assert.Equal(before.Payments.Count, after.Payments.Count);
        Assert.Equal(before.ProofAttachments.Count, after.ProofAttachments.Count);
        Assert.Equal(before.SettlementAuditEvents.Count, after.SettlementAuditEvents.Count);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new SettlementRequestCreateTestTimeProvider(InitialTimestamp);
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
        SettlementRequestCreateTestTimeProvider timeProvider,
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
        SettlementRequestCreateTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Settlement request create endpoint test",
                UserAgentSummary: "Settlement request create endpoint test user agent",
                NetworkAddressHash: "settlement-request-create-endpoint-test-network",
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
            MerchantName = HiddenMerchantName,
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
            Name = HiddenItemName,
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
                PaymentMethodLabelSnapshot = HiddenPaymentMethodLabel,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        dbContext.Set<ExpenseBill>().Add(bill);
        await dbContext.SaveChangesAsync();
        return billId;
    }

    private static async Task SeedSettlementRequestAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid? groupId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        Guid requestedByUserProfileId,
        decimal amount,
        string status,
        DateTimeOffset? archivedAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        dbContext.Set<SettlementRequest>().Add(new SettlementRequest
        {
            Id = Guid.NewGuid(),
            SourceExpenseBillId = billId,
            GroupId = groupId,
            DebtorUserProfileId = debtorUserProfileId,
            CreditorUserProfileId = creditorUserProfileId,
            Amount = amount,
            Currency = "USD",
            Status = status,
            RequestedByUserProfileId = requestedByUserProfileId,
            RequestedAtUtc = InitialTimestamp,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            ArchivedAtUtc = archivedAtUtc
        });

        await dbContext.SaveChangesAsync();
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

    private static async Task<SettlementState> ReadSettlementStateAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new SettlementState(
            await dbContext.Set<SettlementRequest>()
                .AsNoTracking()
                .OrderBy(settlementRequest => settlementRequest.CreatedAtUtc)
                .ToListAsync(),
            await dbContext.Set<SettlementPayment>()
                .AsNoTracking()
                .ToListAsync(),
            await dbContext.Set<SettlementProofAttachment>()
                .AsNoTracking()
                .ToListAsync(),
            await dbContext.Set<AuthAuditEvent>()
                .AsNoTracking()
                .Where(auditEvent => auditEvent.Action == "settlement.request_created")
                .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
                .ToListAsync());
    }

    private static async Task AssertNoSettlementSideEffectsAsync(WebApplicationFactory<Program> testFactory)
    {
        var persisted = await ReadSettlementStateAsync(testFactory);
        Assert.Empty(persisted.Requests);
        Assert.Empty(persisted.Payments);
        Assert.Empty(persisted.ProofAttachments);
        Assert.Empty(persisted.SettlementAuditEvents);
    }

    private static HttpRequestMessage CreateJsonBearerRequest(
        HttpMethod method,
        string path,
        string rawSessionToken,
        string body)
    {
        var request = CreateJsonRequest(method, path, body);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreateJsonRequest(
        HttpMethod method,
        string path,
        string body)
    {
        return new HttpRequestMessage(method, path)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
    }

    private static string PersonalSettlementRequestsPath(Guid billId)
    {
        return $"/api/v1/bills/{billId:D}/settlement-requests";
    }

    private static string GroupSettlementRequestsPath(Guid groupId, Guid billId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/settlement-requests";
    }

    private static string CandidateKey(
        Guid billId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        decimal amount)
    {
        return FormattableString.Invariant(
            $"bill:{billId:D}:debtor:{debtorUserProfileId:D}:creditor:{creditorUserProfileId:D}:amount:{amount:0.0000}:currency:USD");
    }

    private static void AssertSettlementRequestResponseShape(JsonElement response)
    {
        Assert.Equal(
            [
                "amount",
                "createdAtUtc",
                "creditorUserProfileId",
                "currency",
                "debtorUserProfileId",
                "groupId",
                "id",
                "requestedAtUtc",
                "requestedByUserProfileId",
                "sourceExpenseBillId",
                "status",
                "updatedAtUtc"
            ],
            response.EnumerateObject()
                .Select(property => property.Name)
                .Order(StringComparer.Ordinal)
                .ToArray());
    }

    private static void AssertSafeCreateResponseContent(
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
        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("item", lowerContent);
        Assert.DoesNotContain("ocr", lowerContent);
    }

    private static void AssertBoundedAuditMetadata(
        string? metadataJson,
        Guid settlementRequestId,
        Guid billId,
        Guid? groupId,
        string groupMode,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        string amount,
        string currency)
    {
        Assert.NotNull(metadataJson);
        Assert.DoesNotContain("candidateKey", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("merchant", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("item", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("paymentHandle", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storage", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", metadataJson, StringComparison.OrdinalIgnoreCase);

        using var metadata = JsonDocument.Parse(metadataJson);
        Assert.Equal("settlement_request_create", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(settlementRequestId.ToString("D"), metadata.RootElement.GetProperty("settlementRequestId").GetString());
        Assert.Equal(billId.ToString("D"), metadata.RootElement.GetProperty("sourceExpenseBillId").GetString());
        if (groupId.HasValue)
        {
            Assert.Equal(groupId.Value.ToString("D"), metadata.RootElement.GetProperty("groupId").GetString());
        }
        else
        {
            Assert.False(metadata.RootElement.TryGetProperty("groupId", out _));
        }

        Assert.Equal(groupMode, metadata.RootElement.GetProperty("groupMode").GetString());
        Assert.Equal(debtorUserProfileId.ToString("D"), metadata.RootElement.GetProperty("debtorUserProfileId").GetString());
        Assert.Equal(creditorUserProfileId.ToString("D"), metadata.RootElement.GetProperty("creditorUserProfileId").GetString());
        Assert.Equal(SettlementRequestStatuses.Requested, metadata.RootElement.GetProperty("requestStatus").GetString());
        Assert.Equal(amount, metadata.RootElement.GetProperty("amount").GetString());
        Assert.Equal(currency, metadata.RootElement.GetProperty("currency").GetString());
        Assert.Equal("confirmed_bill_net_position_v1", metadata.RootElement.GetProperty("candidateBasis").GetString());
    }

    private static async Task AssertSettlementRequestConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement request conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The settlement request cannot be created for the current bill and candidate state.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertBillUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

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
        AssertSafeProblemContent(content);

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

    private static void AssertSafeProblemContent(string content)
    {
        var lowerContent = content.ToLowerInvariant();
        Assert.DoesNotContain("candidatekey", lowerContent);
        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("paymenthandle", lowerContent);
        Assert.DoesNotContain("payment_handle", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        SettlementRequestCreateTestTimeProvider TimeProvider);

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

    private sealed record SettlementState(
        IReadOnlyList<SettlementRequest> Requests,
        IReadOnlyList<SettlementPayment> Payments,
        IReadOnlyList<SettlementProofAttachment> ProofAttachments,
        IReadOnlyList<AuthAuditEvent> SettlementAuditEvents);

    private sealed class SettlementRequestCreateTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public SettlementRequestCreateTestTimeProvider(DateTimeOffset utcNow)
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
