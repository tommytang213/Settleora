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

public sealed class ExpenseBillReconciliationReportingEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string ReconciliationUpdatedAction = "bill.reconciliation_updated";
    private const string WrongRawToken = "visible-wrong-reconciliation-session-token";
    private const string HiddenNote = "hidden bank statement line";
    private const string HiddenMerchant = "Hidden Reconciliation Merchant";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 17, 1, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 17, 1, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 17, 1, 30, 0, TimeSpan.Zero);
    private static readonly DateOnly PaymentDate = new(2026, 5, 17);

    private readonly WebApplicationFactory<Program> factory;

    public ExpenseBillReconciliationReportingEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PersonalOwnerCanUpdateSupportedStatusWithoutFinancialMutationAndWithSafeAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Reconciliation Owner");
        var counterparty = await SeedAccountAsync(testFactory, "Reconciliation Counterparty", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 42m),
                new ParticipantSeed(counterparty.UserProfileId, 0m)
            ],
            [new PayerSeed(actorSession.UserProfileId, 42m)],
            HiddenMerchant,
            new DateOnly(2026, 5, 17),
            42m,
            "USD",
            ExpenseBillReconciliationStatuses.Unreconciled,
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            actorSession.UserProfileId,
            counterparty.UserProfileId,
            actorSession.UserProfileId,
            42m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(2));
        await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            actorSession.UserProfileId,
            counterparty.UserProfileId,
            12m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(3));
        var beforeSnapshot = await ReadFinancialSnapshotAsync(testFactory, billId);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Patch,
            PersonalReconciliationPath(billId),
            actorSession.RawSessionToken,
            JsonSerializer.Serialize(new
            {
                status = ExpenseBillReconciliationStatuses.Reconciled,
                note = $"  {HiddenNote}  "
            }));

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        using (var payload = JsonDocument.Parse(content))
        {
            var root = payload.RootElement;
            Assert.Equal(ExpenseBillReconciliationStatuses.Reconciled, root.GetProperty("status").GetString());
            Assert.Equal(WriteTimestamp, root.GetProperty("updatedAtUtc").GetDateTimeOffset());
            Assert.Equal(actorSession.UserProfileId, root.GetProperty("updatedByUserProfileId").GetGuid());
            Assert.Equal(WriteTimestamp, root.GetProperty("reconciledAtUtc").GetDateTimeOffset());
            Assert.Equal(HiddenNote, root.GetProperty("note").GetString());
        }

        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Equal(ExpenseBillReconciliationStatuses.Reconciled, bill.ReconciliationStatus);
        Assert.Equal(WriteTimestamp, bill.ReconciliationUpdatedAtUtc);
        Assert.Equal(actorSession.UserProfileId, bill.ReconciliationUpdatedByUserProfileId);
        Assert.Equal(WriteTimestamp, bill.ReconciledAtUtc);
        Assert.Equal(HiddenNote, bill.ReconciliationNote);
        AssertFinancialSnapshotEqual(beforeSnapshot, await ReadFinancialSnapshotAsync(testFactory, billId));

        var auditEvent = Assert.Single(await ReadReconciliationAuditEventsAsync(testFactory));
        Assert.Equal(ReconciliationUpdatedAction, auditEvent.Action);
        Assert.Equal(actorSession.AuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.Equal(actorSession.AuthAccountId, auditEvent.SubjectAuthAccountId);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.Equal(WriteTimestamp, auditEvent.OccurredAtUtc);
        AssertSafeAuditContent(
            auditEvent,
            actorSession.RawSessionToken,
            HiddenNote,
            HiddenMerchant,
            WrongRawToken);
    }

    [Fact]
    public async Task PersonalCrossUserInvalidStatusAndOversizedNoteFailSafelyWithoutAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Denied Reconciliation Actor");
        var other = await SeedAccountAsync(testFactory, "Denied Reconciliation Owner", InitialTimestamp.AddMinutes(1));
        var ownedBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 10m)],
            [new PayerSeed(actorSession.UserProfileId, 10m)],
            "Own Reconciliation Bill",
            new DateOnly(2026, 5, 17),
            10m,
            "USD",
            ExpenseBillReconciliationStatuses.Unreconciled,
            InitialTimestamp);
        var otherBillId = await SeedBillAsync(
            testFactory,
            other.UserProfileId,
            groupId: null,
            [new ParticipantSeed(other.UserProfileId, 15m)],
            [new PayerSeed(other.UserProfileId, 15m)],
            "Other Reconciliation Bill",
            new DateOnly(2026, 5, 17),
            15m,
            "USD",
            ExpenseBillReconciliationStatuses.Unreconciled,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using (var deniedRequest = CreateJsonRequest(
            HttpMethod.Patch,
            PersonalReconciliationPath(otherBillId),
            actorSession.RawSessionToken,
            JsonSerializer.Serialize(new { status = ExpenseBillReconciliationStatuses.Ignored })))
        using (var deniedResponse = await client.SendAsync(deniedRequest))
        {
            await AssertReconciliationUnavailableProblemAsync(deniedResponse);
        }

        using (var invalidStatusRequest = CreateJsonRequest(
            HttpMethod.Patch,
            PersonalReconciliationPath(ownedBillId),
            actorSession.RawSessionToken,
            JsonSerializer.Serialize(new { status = "matched" })))
        using (var invalidStatusResponse = await client.SendAsync(invalidStatusRequest))
        {
            var content = await invalidStatusResponse.Content.ReadAsStringAsync();
            await AssertInvalidReconciliationRequestProblemAsync(invalidStatusResponse, content);
            Assert.Contains("Reconciliation status is not supported.", content);
            Assert.DoesNotContain("matched", content);
        }

        using (var oversizedNoteRequest = CreateJsonRequest(
            HttpMethod.Patch,
            PersonalReconciliationPath(ownedBillId),
            actorSession.RawSessionToken,
            JsonSerializer.Serialize(new
            {
                status = ExpenseBillReconciliationStatuses.Reconciled,
                note = new string('x', ExpenseBillConstraints.BillReconciliationNoteMaxLength + 1)
            })))
        using (var oversizedNoteResponse = await client.SendAsync(oversizedNoteRequest))
        {
            var content = await oversizedNoteResponse.Content.ReadAsStringAsync();
            await AssertInvalidReconciliationRequestProblemAsync(oversizedNoteResponse, content);
            Assert.Contains("Reconciliation note must be 120 characters or fewer.", content);
        }

        Assert.Equal(
            ExpenseBillReconciliationStatuses.Unreconciled,
            (await ReadBillAsync(testFactory, ownedBillId)).ReconciliationStatus);
        Assert.Equal(
            ExpenseBillReconciliationStatuses.Unreconciled,
            (await ReadBillAsync(testFactory, otherBillId)).ReconciliationStatus);
        Assert.Empty(await ReadReconciliationAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task GroupActiveMemberCanUpdateWhileRemovedNonMemberAndWrongGroupFailClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Reconciliation Actor");
        var owner = await SeedAccountAsync(testFactory, "Group Reconciliation Owner", InitialTimestamp.AddMinutes(1));
        var removedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Removed Reconciliation Member");
        var outsideSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Outside Reconciliation Member");
        var groupId = await SeedGroupAsync(
            testFactory,
            owner.UserProfileId,
            "Reconciliation Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(owner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(removedSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        var wrongGroupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Wrong Reconciliation Group",
            InitialTimestamp.AddMinutes(1),
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            owner.UserProfileId,
            groupId,
            [
                new ParticipantSeed(owner.UserProfileId, 8m),
                new ParticipantSeed(actorSession.UserProfileId, 8m)
            ],
            [new PayerSeed(owner.UserProfileId, 16m)],
            "Group Reconciliation Dinner",
            new DateOnly(2026, 5, 17),
            16m,
            "USD",
            ExpenseBillReconciliationStatuses.Unreconciled,
            InitialTimestamp);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using (var updateRequest = CreateJsonRequest(
            HttpMethod.Patch,
            GroupReconciliationPath(groupId, billId),
            actorSession.RawSessionToken,
            JsonSerializer.Serialize(new { status = ExpenseBillReconciliationStatuses.Ignored })))
        using (var updateResponse = await client.SendAsync(updateRequest))
        {
            Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        }

        using (var removedRequest = CreateJsonRequest(
            HttpMethod.Patch,
            GroupReconciliationPath(groupId, billId),
            removedSession.RawSessionToken,
            JsonSerializer.Serialize(new { status = ExpenseBillReconciliationStatuses.Reconciled })))
        using (var removedResponse = await client.SendAsync(removedRequest))
        {
            await AssertReconciliationUnavailableProblemAsync(removedResponse);
        }

        using (var outsideRequest = CreateJsonRequest(
            HttpMethod.Patch,
            GroupReconciliationPath(groupId, billId),
            outsideSession.RawSessionToken,
            JsonSerializer.Serialize(new { status = ExpenseBillReconciliationStatuses.Reconciled })))
        using (var outsideResponse = await client.SendAsync(outsideRequest))
        {
            await AssertReconciliationUnavailableProblemAsync(outsideResponse);
        }

        using (var wrongGroupRequest = CreateJsonRequest(
            HttpMethod.Patch,
            GroupReconciliationPath(wrongGroupId, billId),
            actorSession.RawSessionToken,
            JsonSerializer.Serialize(new { status = ExpenseBillReconciliationStatuses.Reconciled })))
        using (var wrongGroupResponse = await client.SendAsync(wrongGroupRequest))
        {
            await AssertReconciliationUnavailableProblemAsync(wrongGroupResponse);
        }

        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Equal(ExpenseBillReconciliationStatuses.Ignored, bill.ReconciliationStatus);
        Assert.Equal(actorSession.UserProfileId, bill.ReconciliationUpdatedByUserProfileId);
        Assert.Single(await ReadReconciliationAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task GroupReconciliationUsesRouteBillAndRejectsBodySmuggledIds()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Route Reconciliation Actor");
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Route Reconciliation Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var wrongGroupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Body Reconciliation Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var routeBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(actorSession.UserProfileId, 11m)],
            [new PayerSeed(actorSession.UserProfileId, 11m)],
            "Route Reconciliation Bill",
            new DateOnly(2026, 5, 17),
            11m,
            "USD",
            ExpenseBillReconciliationStatuses.Unreconciled,
            InitialTimestamp);
        var bodyTargetBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            wrongGroupId,
            [new ParticipantSeed(actorSession.UserProfileId, 13m)],
            [new PayerSeed(actorSession.UserProfileId, 13m)],
            "Body Reconciliation Bill",
            new DateOnly(2026, 5, 17),
            13m,
            "USD",
            ExpenseBillReconciliationStatuses.Unreconciled,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var request = CreateJsonRequest(
            HttpMethod.Patch,
            GroupReconciliationPath(groupId, routeBillId),
            actorSession.RawSessionToken,
            JsonSerializer.Serialize(new
            {
                status = ExpenseBillReconciliationStatuses.Reconciled,
                note = "route-only",
                groupId = wrongGroupId,
                billId = bodyTargetBillId,
                statementId = Guid.NewGuid(),
                statementTransactionId = Guid.NewGuid(),
                reconciliationMatchId = Guid.NewGuid(),
                userProfileId = Guid.NewGuid(),
                ownerUserProfileId = Guid.NewGuid(),
                authAccountId = Guid.NewGuid(),
                updatedByUserProfileId = Guid.NewGuid(),
                settlementPaymentId = Guid.NewGuid()
            }));
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        await AssertInvalidReconciliationRequestProblemAsync(response, content);
        Assert.Contains("Unsupported fields are not allowed.", content);
        Assert.Equal(ExpenseBillReconciliationStatuses.Unreconciled, (await ReadBillAsync(testFactory, routeBillId)).ReconciliationStatus);
        Assert.Equal(ExpenseBillReconciliationStatuses.Unreconciled, (await ReadBillAsync(testFactory, bodyTargetBillId)).ReconciliationStatus);
        Assert.Empty(await ReadReconciliationAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task PersonalReconciliationUsesRouteBillAndRejectsBodySmuggledIds()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal Route Reconciliation Actor");
        var routeBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 11m)],
            [new PayerSeed(actorSession.UserProfileId, 11m)],
            "Personal Route Reconciliation Bill",
            new DateOnly(2026, 5, 17),
            11m,
            "USD",
            ExpenseBillReconciliationStatuses.Unreconciled,
            InitialTimestamp);
        var bodyTargetBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 13m)],
            [new PayerSeed(actorSession.UserProfileId, 13m)],
            "Personal Body Reconciliation Bill",
            new DateOnly(2026, 5, 17),
            13m,
            "USD",
            ExpenseBillReconciliationStatuses.Unreconciled,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var request = CreateJsonRequest(
            HttpMethod.Patch,
            PersonalReconciliationPath(routeBillId),
            actorSession.RawSessionToken,
            JsonSerializer.Serialize(new
            {
                status = ExpenseBillReconciliationStatuses.Reconciled,
                note = "route-only",
                billId = bodyTargetBillId,
                groupId = Guid.NewGuid(),
                statementId = Guid.NewGuid(),
                statementTransactionId = Guid.NewGuid(),
                reconciliationMatchId = Guid.NewGuid(),
                userProfileId = Guid.NewGuid(),
                ownerUserProfileId = actorSession.UserProfileId,
                authAccountId = Guid.NewGuid(),
                updatedByUserProfileId = Guid.NewGuid(),
                settlementRequestId = Guid.NewGuid()
            }));
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        await AssertInvalidReconciliationRequestProblemAsync(response, content);
        Assert.Contains("Unsupported fields are not allowed.", content);
        Assert.Equal(ExpenseBillReconciliationStatuses.Unreconciled, (await ReadBillAsync(testFactory, routeBillId)).ReconciliationStatus);
        Assert.Equal(ExpenseBillReconciliationStatuses.Unreconciled, (await ReadBillAsync(testFactory, bodyTargetBillId)).ReconciliationStatus);
        Assert.Empty(await ReadReconciliationAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task BillListsCanFilterByReconciliationStatus()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Filter Reconciliation Actor");
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Filter Reconciliation Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var personalReconciledId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 10m)],
            [new PayerSeed(actorSession.UserProfileId, 10m)],
            "Personal Reconciled",
            new DateOnly(2026, 5, 17),
            10m,
            "USD",
            ExpenseBillReconciliationStatuses.Reconciled,
            InitialTimestamp);
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 11m)],
            [new PayerSeed(actorSession.UserProfileId, 11m)],
            "Personal Ignored",
            new DateOnly(2026, 5, 17),
            11m,
            "USD",
            ExpenseBillReconciliationStatuses.Ignored,
            InitialTimestamp.AddMinutes(1));
        var groupIgnoredId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(actorSession.UserProfileId, 12m)],
            [new PayerSeed(actorSession.UserProfileId, 12m)],
            "Group Ignored",
            new DateOnly(2026, 5, 17),
            12m,
            "USD",
            ExpenseBillReconciliationStatuses.Ignored,
            InitialTimestamp.AddMinutes(2));
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(actorSession.UserProfileId, 13m)],
            [new PayerSeed(actorSession.UserProfileId, 13m)],
            "Group Unreconciled",
            new DateOnly(2026, 5, 17),
            13m,
            "USD",
            ExpenseBillReconciliationStatuses.Unreconciled,
            InitialTimestamp.AddMinutes(3));
        using var client = testFactory.CreateClient();

        var personalBills = await GetBillsAsync(
            client,
            actorSession.RawSessionToken,
            $"/api/v1/bills?reconciliationStatus={ExpenseBillReconciliationStatuses.Reconciled}");
        Assert.Equal([personalReconciledId], personalBills.Select(bill => bill.Id));
        Assert.All(personalBills, bill => Assert.Equal(ExpenseBillReconciliationStatuses.Reconciled, bill.ReconciliationStatus));

        var groupBills = await GetBillsAsync(
            client,
            actorSession.RawSessionToken,
            $"/api/v1/groups/{groupId:D}/bills?reconciliationStatus={ExpenseBillReconciliationStatuses.Ignored}");
        Assert.Equal([groupIgnoredId], groupBills.Select(bill => bill.Id));
        Assert.All(groupBills, bill => Assert.Equal(ExpenseBillReconciliationStatuses.Ignored, bill.ReconciliationStatus));

        using var invalidFilterRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/bills?reconciliationStatus=matched",
            actorSession.RawSessionToken);
        using var invalidFilterResponse = await client.SendAsync(invalidFilterRequest);
        var invalidFilterContent = await invalidFilterResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, invalidFilterResponse.StatusCode);
        Assert.Contains("Reconciliation status is not supported.", invalidFilterContent);
        Assert.DoesNotContain("matched", invalidFilterContent);
    }

    [Fact]
    public async Task PersonalBillListUsesSharedSearchFiltersWithoutLeakingCrossUserOrArchivedBills()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal Search Actor");
        var other = await SeedAccountAsync(testFactory, "Personal Search Other", InitialTimestamp.AddMinutes(1));
        var matchedId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 20m)],
            [new PayerSeed(actorSession.UserProfileId, 20m)],
            "Alpha Market",
            new DateOnly(2026, 5, 12),
            20m,
            "HKD",
            ExpenseBillReconciliationStatuses.Ignored,
            InitialTimestamp.AddMinutes(2),
            status: ExpenseBillStatuses.Confirmed,
            itemName: "Alpha Noodles");
        await SeedBillAsync(
            testFactory,
            other.UserProfileId,
            groupId: null,
            [new ParticipantSeed(other.UserProfileId, 20m)],
            [new PayerSeed(other.UserProfileId, 20m)],
            "Alpha Market",
            new DateOnly(2026, 5, 12),
            20m,
            "HKD",
            ExpenseBillReconciliationStatuses.Ignored,
            InitialTimestamp.AddMinutes(3),
            status: ExpenseBillStatuses.Confirmed);
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 22m)],
            [new PayerSeed(actorSession.UserProfileId, 22m)],
            "Alpha Archived",
            new DateOnly(2026, 5, 12),
            22m,
            "HKD",
            ExpenseBillReconciliationStatuses.Ignored,
            InitialTimestamp.AddMinutes(4),
            status: ExpenseBillStatuses.Confirmed,
            archivedAtUtc: InitialTimestamp.AddMinutes(5));
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 23m)],
            [new PayerSeed(actorSession.UserProfileId, 23m)],
            "Alpha Wrong Currency",
            new DateOnly(2026, 5, 12),
            23m,
            "USD",
            ExpenseBillReconciliationStatuses.Ignored,
            InitialTimestamp.AddMinutes(6),
            status: ExpenseBillStatuses.Confirmed);
        var searchMatchId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 15m)],
            [new PayerSeed(actorSession.UserProfileId, 15m)],
            "Quiet Cafe",
            new DateOnly(2026, 5, 13),
            15m,
            "USD",
            ExpenseBillReconciliationStatuses.Unreconciled,
            InitialTimestamp.AddMinutes(7),
            itemName: "Needle Soup");
        using var client = testFactory.CreateClient();

        var filteredBills = await GetBillsAsync(
            client,
            actorSession.RawSessionToken,
            $"/api/v1/bills?fromDate=2026-05-01&toDate=2026-05-31&status={ExpenseBillStatuses.Confirmed}&reconciliationStatus={ExpenseBillReconciliationStatuses.Ignored}&currency=HKD&merchant=alpha&limit=1");
        Assert.Equal([matchedId], filteredBills.Select(bill => bill.Id));
        Assert.All(filteredBills, bill =>
        {
            Assert.Equal(ExpenseBillStatuses.Confirmed, bill.Status);
            Assert.Equal(ExpenseBillReconciliationStatuses.Ignored, bill.ReconciliationStatus);
            Assert.Equal("HKD", bill.TotalCurrency);
        });

        var searchBills = await GetBillsAsync(
            client,
            actorSession.RawSessionToken,
            "/api/v1/bills?search=needle&limit=10");
        Assert.Equal([searchMatchId], searchBills.Select(bill => bill.Id));

        using var invalidFilterRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/bills?fromDate=2026-99-99&toDate=2026-01-01&currency=usd&limit=999&search=visible-secret",
            actorSession.RawSessionToken);
        using var invalidFilterResponse = await client.SendAsync(invalidFilterRequest);
        var invalidFilterContent = await invalidFilterResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, invalidFilterResponse.StatusCode);
        Assert.Contains("From date must be a yyyy-MM-dd date string.", invalidFilterContent);
        Assert.Contains("Currency must be an uppercase three-letter code.", invalidFilterContent);
        Assert.Contains("Limit must be between 1 and 200.", invalidFilterContent);
        Assert.DoesNotContain("visible-secret", invalidFilterContent);
        Assert.DoesNotContain("usd", invalidFilterContent);
    }

    [Fact]
    public async Task GroupBillListUsesSharedSearchFiltersWithoutLeakingCrossGroupBills()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Search Actor");
        var nonMemberSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Search Non Member");
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Group Search",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var wrongGroupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Wrong Search Group",
            InitialTimestamp.AddMinutes(1),
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var matchedId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(actorSession.UserProfileId, 33m)],
            [new PayerSeed(actorSession.UserProfileId, 33m)],
            "Shared Alpha",
            new DateOnly(2026, 5, 14),
            33m,
            "USD",
            ExpenseBillReconciliationStatuses.Reconciled,
            InitialTimestamp.AddMinutes(2),
            status: ExpenseBillStatuses.Confirmed,
            itemName: "Group Search Needle");
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            wrongGroupId,
            [new ParticipantSeed(actorSession.UserProfileId, 33m)],
            [new PayerSeed(actorSession.UserProfileId, 33m)],
            "Shared Alpha",
            new DateOnly(2026, 5, 14),
            33m,
            "USD",
            ExpenseBillReconciliationStatuses.Reconciled,
            InitialTimestamp.AddMinutes(3),
            status: ExpenseBillStatuses.Confirmed,
            itemName: "Group Search Needle");
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(actorSession.UserProfileId, 34m)],
            [new PayerSeed(actorSession.UserProfileId, 34m)],
            "Shared Alpha Archived",
            new DateOnly(2026, 5, 14),
            34m,
            "USD",
            ExpenseBillReconciliationStatuses.Reconciled,
            InitialTimestamp.AddMinutes(4),
            status: ExpenseBillStatuses.Confirmed,
            archivedAtUtc: InitialTimestamp.AddMinutes(5));
        using var client = testFactory.CreateClient();

        var groupBills = await GetBillsAsync(
            client,
            actorSession.RawSessionToken,
            $"/api/v1/groups/{groupId:D}/bills?fromDate=2026-05-01&toDate=2026-05-31&status={ExpenseBillStatuses.Confirmed}&reconciliationStatus={ExpenseBillReconciliationStatuses.Reconciled}&currency=USD&merchant=alpha&search=needle&limit=10");
        Assert.Equal([matchedId], groupBills.Select(bill => bill.Id));

        using var nonMemberExportRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/groups/{groupId:D}/bills/export.json?search=needle",
            nonMemberSession.RawSessionToken);
        using var nonMemberExportResponse = await client.SendAsync(nonMemberExportRequest);
        await AssertBillExportUnavailableProblemAsync(nonMemberExportResponse);
    }

    [Fact]
    public async Task BillExportsReturnSafeJsonAndCsvRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Export Actor");
        var other = await SeedAccountAsync(testFactory, "Export Other", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Export Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var formulaBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 12m)],
            [new PayerSeed(actorSession.UserProfileId, 12m)],
            "=SUM(1,2)",
            new DateOnly(2026, 5, 15),
            12m,
            "USD",
            ExpenseBillReconciliationStatuses.Reconciled,
            InitialTimestamp.AddMinutes(2),
            status: ExpenseBillStatuses.Finalized,
            itemName: "Hidden Export Item",
            itemNote: "Private export note",
            adjustmentReasonNote: "Private adjustment note");
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 8m)],
            [new PayerSeed(actorSession.UserProfileId, 8m)],
            "Cafe, \"North\"",
            new DateOnly(2026, 5, 14),
            8m,
            "USD",
            ExpenseBillReconciliationStatuses.Unreconciled,
            InitialTimestamp.AddMinutes(3));
        await SeedBillAsync(
            testFactory,
            other.UserProfileId,
            groupId: null,
            [new ParticipantSeed(other.UserProfileId, 99m)],
            [new PayerSeed(other.UserProfileId, 99m)],
            "=SUM(9,9)",
            new DateOnly(2026, 5, 15),
            99m,
            "USD",
            ExpenseBillReconciliationStatuses.Reconciled,
            InitialTimestamp.AddMinutes(4));
        var groupBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(actorSession.UserProfileId, 17m)],
            [new PayerSeed(actorSession.UserProfileId, 17m)],
            "Group Export",
            new DateOnly(2026, 5, 13),
            17m,
            "USD",
            ExpenseBillReconciliationStatuses.Ignored,
            InitialTimestamp.AddMinutes(5));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using (var jsonRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/bills/export.json?fromDate=2026-05-01&toDate=2026-05-31&limit=10",
            actorSession.RawSessionToken))
        using (var jsonResponse = await client.SendAsync(jsonRequest))
        {
            var content = await jsonResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, jsonResponse.StatusCode);
            Assert.Equal("application/json", jsonResponse.Content.Headers.ContentType?.MediaType);
            Assert.DoesNotContain(actorSession.RawSessionToken, content);
            Assert.DoesNotContain("Hidden Export Item", content);
            Assert.DoesNotContain("Private export note", content);
            Assert.DoesNotContain("Private adjustment note", content);
            using var payload = JsonDocument.Parse(content);
            var root = payload.RootElement;
            Assert.Equal(WriteTimestamp, root.GetProperty("generatedAtUtc").GetDateTimeOffset());
            Assert.Equal(2, root.GetProperty("rowCount").GetInt32());
            Assert.Equal(10, root.GetProperty("appliedFilters").GetProperty("limit").GetInt32());
            var rows = root.GetProperty("rows").EnumerateArray().ToArray();
            Assert.Equal([formulaBillId], rows.Where(row => row.GetProperty("merchantName").GetString() == "=SUM(1,2)").Select(row => row.GetProperty("billId").GetGuid()));
            Assert.All(rows, row => Assert.True(row.TryGetProperty("itemCount", out _)));
        }

        using (var csvRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/bills/export.csv?fromDate=2026-05-01&toDate=2026-05-31&limit=10",
            actorSession.RawSessionToken))
        using (var csvResponse = await client.SendAsync(csvRequest))
        {
            var content = await csvResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
            Assert.Equal("text/csv", csvResponse.Content.Headers.ContentType?.MediaType);
            Assert.StartsWith("billId,groupId,merchantName,billDate,billStatus,reconciliationStatus,totalAmount,currency,itemCount,participantCount,payerCount,createdAtUtc,updatedAtUtc", content, StringComparison.Ordinal);
            Assert.Contains("\"'=SUM(1,2)\"", content);
            Assert.Contains("\"Cafe, \"\"North\"\"\"", content);
            Assert.DoesNotContain("=SUM(9,9)", content);
            Assert.DoesNotContain("Hidden Export Item", content);
            Assert.DoesNotContain("Private export note", content);
            Assert.DoesNotContain("Private adjustment note", content);
        }

        using (var groupJsonRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/groups/{groupId:D}/bills/export.json?search=export&limit=10",
            actorSession.RawSessionToken))
        using (var groupJsonResponse = await client.SendAsync(groupJsonRequest))
        {
            var content = await groupJsonResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, groupJsonResponse.StatusCode);
            using var payload = JsonDocument.Parse(content);
            var row = Assert.Single(payload.RootElement.GetProperty("rows").EnumerateArray());
            Assert.Equal(groupBillId, row.GetProperty("billId").GetGuid());
            Assert.Equal(groupId, row.GetProperty("groupId").GetGuid());
            Assert.Equal("Group Export", row.GetProperty("merchantName").GetString());
        }
    }

    [Fact]
    public async Task MonthlyPersonalReportIncludesOnlyActorVisibleBillsByMonthAndBucketsCurrencies()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal Report Actor");
        var other = await SeedAccountAsync(testFactory, "Personal Report Other", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Personal Report Hidden Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var actorBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 12m)],
            [new PayerSeed(actorSession.UserProfileId, 12m)],
            "Visible USD Personal Report Bill",
            new DateOnly(2026, 5, 4),
            12m,
            "USD",
            ExpenseBillReconciliationStatuses.Reconciled,
            InitialTimestamp);
        await SeedBillAsync(
            testFactory,
            other.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(actorSession.UserProfileId, 5m),
                new ParticipantSeed(other.UserProfileId, 15m)
            ],
            [new PayerSeed(other.UserProfileId, 20m)],
            "Visible HKD Personal Report Bill",
            new DateOnly(2026, 5, 5),
            20m,
            "HKD",
            ExpenseBillReconciliationStatuses.Ignored,
            InitialTimestamp.AddMinutes(1));
        await SeedBillAsync(
            testFactory,
            other.UserProfileId,
            groupId: null,
            [new ParticipantSeed(other.UserProfileId, 99m)],
            [new PayerSeed(other.UserProfileId, 99m)],
            "Unrelated Personal Report Bill",
            new DateOnly(2026, 5, 6),
            99m,
            "USD",
            ExpenseBillReconciliationStatuses.Reconciled,
            InitialTimestamp.AddMinutes(2));
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 30m)],
            [new PayerSeed(actorSession.UserProfileId, 30m)],
            "Wrong Month Personal Report Bill",
            new DateOnly(2026, 6, 1),
            30m,
            "USD",
            ExpenseBillReconciliationStatuses.Unreconciled,
            InitialTimestamp.AddMinutes(3));
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(actorSession.UserProfileId, 44m)],
            [new PayerSeed(actorSession.UserProfileId, 44m)],
            "Hidden Group Report Bill",
            new DateOnly(2026, 5, 7),
            44m,
            "USD",
            ExpenseBillReconciliationStatuses.Reconciled,
            InitialTimestamp.AddMinutes(4));
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            actorBillId,
            groupId: null,
            actorSession.UserProfileId,
            other.UserProfileId,
            actorSession.UserProfileId,
            12m,
            SettlementRequestStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(5));
        await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            actorSession.UserProfileId,
            other.UserProfileId,
            12m,
            SettlementPaymentStatuses.MarkedPaid,
            InitialTimestamp.AddMinutes(6));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using var request = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/reports/monthly?month=2026-05",
            actorSession.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafeReportContent(content, "Unrelated Personal Report Bill", "Hidden Group Report Bill");
        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        Assert.Equal("2026-05", root.GetProperty("month").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("groupId").ValueKind);
        Assert.Equal(WriteTimestamp, root.GetProperty("generatedAtUtc").GetDateTimeOffset());
        Assert.Equal(2, root.GetProperty("billCount").GetInt32());
        Assert.Equal("20", FindCurrencyAmount(root.GetProperty("totalByCurrency"), "HKD"));
        Assert.Equal("12", FindCurrencyAmount(root.GetProperty("totalByCurrency"), "USD"));
        Assert.Equal("5", FindCurrencyAmount(root.GetProperty("actorShareByCurrency"), "HKD"));
        Assert.Equal("12", FindCurrencyAmount(root.GetProperty("actorShareByCurrency"), "USD"));
        Assert.Equal("12", FindCurrencyAmount(root.GetProperty("actorPaidByCurrency"), "USD"));
        Assert.Equal(0, FindStatusCount(root.GetProperty("reconciliationCounts"), ExpenseBillReconciliationStatuses.Unreconciled));
        Assert.Equal(1, FindStatusCount(root.GetProperty("reconciliationCounts"), ExpenseBillReconciliationStatuses.Reconciled));
        Assert.Equal(1, FindStatusCount(root.GetProperty("reconciliationCounts"), ExpenseBillReconciliationStatuses.Ignored));
        Assert.Equal(1, FindStatusCount(root.GetProperty("settlementRequestCounts"), SettlementRequestStatuses.MarkedPaid));
        Assert.Equal(1, FindStatusCount(root.GetProperty("settlementPaymentCounts"), SettlementPaymentStatuses.MarkedPaid));
    }

    [Fact]
    public async Task MonthlyGroupReportRequiresMembershipAndKeepsCurrencyBucketsSeparate()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Report Actor");
        var nonMemberSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Report Non Member");
        var creditor = await SeedAccountAsync(testFactory, "Group Report Creditor", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Visible Monthly Report Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var usdBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId,
            [
                new ParticipantSeed(actorSession.UserProfileId, 9m),
                new ParticipantSeed(creditor.UserProfileId, 9m)
            ],
            [new PayerSeed(creditor.UserProfileId, 18m)],
            "Group USD Monthly Report Bill",
            new DateOnly(2026, 5, 8),
            18m,
            "USD",
            ExpenseBillReconciliationStatuses.Reconciled,
            InitialTimestamp);
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(actorSession.UserProfileId, 33m)],
            [new PayerSeed(actorSession.UserProfileId, 33m)],
            "Group HKD Monthly Report Bill",
            new DateOnly(2026, 5, 9),
            33m,
            "HKD",
            ExpenseBillReconciliationStatuses.Unreconciled,
            InitialTimestamp.AddMinutes(1));
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(actorSession.UserProfileId, 50m)],
            [new PayerSeed(actorSession.UserProfileId, 50m)],
            "Wrong Month Group Report Bill",
            new DateOnly(2026, 4, 30),
            50m,
            "USD",
            ExpenseBillReconciliationStatuses.Ignored,
            InitialTimestamp.AddMinutes(2));
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            usdBillId,
            groupId,
            actorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            9m,
            SettlementRequestStatuses.Confirmed,
            InitialTimestamp.AddMinutes(3));
        await SeedSettlementPaymentAsync(
            testFactory,
            settlementId,
            actorSession.UserProfileId,
            creditor.UserProfileId,
            9m,
            SettlementPaymentStatuses.Confirmed,
            InitialTimestamp.AddMinutes(4));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using (var reportRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/reports/monthly?month=2026-05&groupId={groupId:D}",
            actorSession.RawSessionToken))
        using (var reportResponse = await client.SendAsync(reportRequest))
        {
            var content = await reportResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, reportResponse.StatusCode);
            AssertSafeReportContent(content, "Wrong Month Group Report Bill");
            using var payload = JsonDocument.Parse(content);
            var root = payload.RootElement;
            Assert.Equal(groupId, root.GetProperty("groupId").GetGuid());
            Assert.Equal(2, root.GetProperty("billCount").GetInt32());
            Assert.Equal("33", FindCurrencyAmount(root.GetProperty("totalByCurrency"), "HKD"));
            Assert.Equal("18", FindCurrencyAmount(root.GetProperty("totalByCurrency"), "USD"));
            Assert.Equal("33", FindCurrencyAmount(root.GetProperty("actorShareByCurrency"), "HKD"));
            Assert.Equal("9", FindCurrencyAmount(root.GetProperty("actorShareByCurrency"), "USD"));
            Assert.Equal("33", FindCurrencyAmount(root.GetProperty("actorPaidByCurrency"), "HKD"));
            Assert.Equal(1, FindStatusCount(root.GetProperty("reconciliationCounts"), ExpenseBillReconciliationStatuses.Unreconciled));
            Assert.Equal(1, FindStatusCount(root.GetProperty("reconciliationCounts"), ExpenseBillReconciliationStatuses.Reconciled));
            Assert.Equal(1, FindStatusCount(root.GetProperty("settlementRequestCounts"), SettlementRequestStatuses.Confirmed));
            Assert.Equal(1, FindStatusCount(root.GetProperty("settlementPaymentCounts"), SettlementPaymentStatuses.Confirmed));
        }

        using var deniedRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/reports/monthly?month=2026-05&groupId={groupId:D}",
            nonMemberSession.RawSessionToken);
        using var deniedResponse = await client.SendAsync(deniedRequest);
        await AssertMonthlyReportUnavailableProblemAsync(deniedResponse);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new ReconciliationTestTimeProvider(InitialTimestamp);
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
        ReconciliationTestTimeProvider timeProvider,
        string displayName)
    {
        var account = await SeedAccountAsync(testFactory, displayName, InitialTimestamp);
        timeProvider.SetUtcNow(InitialTimestamp);
        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Reconciliation reporting endpoint test",
                UserAgentSummary: "Reconciliation reporting endpoint test user agent",
                NetworkAddressHash: "reconciliation-reporting-endpoint-test-network",
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
        DateTimeOffset createdAtUtc)
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
            UpdatedAtUtc = createdAtUtc
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

    private static async Task<Guid> SeedGroupAsync(
        WebApplicationFactory<Program> testFactory,
        Guid createdByUserProfileId,
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
            CreatedByUserProfileId = createdByUserProfileId,
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
        string merchantName,
        DateOnly billDate,
        decimal totalAmount,
        string currency,
        string reconciliationStatus,
        DateTimeOffset createdAtUtc,
        string status = ExpenseBillStatuses.Draft,
        DateTimeOffset? archivedAtUtc = null,
        string itemName = "Seeded Reconciliation Item",
        string? itemNote = null,
        string? adjustmentReasonNote = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var billId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var bill = new ExpenseBill
        {
            Id = billId,
            CreatedByUserProfileId = creatorProfileId,
            BillOwnerUserProfileId = creatorProfileId,
            GroupId = groupId,
            MerchantName = merchantName,
            BillDate = billDate,
            Status = status,
            ReconciliationStatus = reconciliationStatus,
            ReconciliationUpdatedAtUtc = reconciliationStatus == ExpenseBillReconciliationStatuses.Unreconciled ? null : createdAtUtc,
            ReconciliationUpdatedByUserProfileId = reconciliationStatus == ExpenseBillReconciliationStatuses.Unreconciled ? null : creatorProfileId,
            ReconciledAtUtc = reconciliationStatus == ExpenseBillReconciliationStatuses.Reconciled ? createdAtUtc : null,
            TotalAmount = totalAmount,
            TotalCurrency = currency,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            ArchivedAtUtc = archivedAtUtc
        };
        var item = new ExpenseBillItem
        {
            Id = itemId,
            ExpenseBillId = billId,
            Name = itemName,
            Note = itemNote,
            Amount = totalAmount,
            Currency = currency,
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
                Status = ExpenseBillParticipantStatuses.PendingAcceptance,
                ResolvedShareAmount = participant.ResolvedShareAmount,
                ResolvedShareCurrency = currency,
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
                ResolvedCurrency = currency,
                AllocationOrder = index,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        foreach (var payer in payers)
        {
            bill.Payers.Add(new ExpenseBillPayer
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = billId,
                UserProfileId = payer.UserProfileId,
                Amount = payer.Amount,
                Currency = currency,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        bill.Items.Add(item);
        if (adjustmentReasonNote is not null)
        {
            bill.Adjustments.Add(new ExpenseBillAdjustment
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = billId,
                Type = ExpenseBillAdjustmentTypes.ServiceCharge,
                Direction = ExpenseBillAdjustmentDirections.Charge,
                AllocationMethod = ExpenseBillAdjustmentAllocationMethods.Equal,
                Amount = 0m,
                Currency = currency,
                ReasonNote = adjustmentReasonNote,
                SortOrder = 0,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        dbContext.Set<ExpenseBill>().Add(bill);
        await dbContext.SaveChangesAsync();
        return billId;
    }

    private static async Task<Guid> SeedSettlementRequestAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid? groupId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        Guid requestedByUserProfileId,
        decimal amount,
        string status,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var settlementId = Guid.NewGuid();
        var lineId = Guid.NewGuid();
        dbContext.Set<SettlementRequest>().Add(new SettlementRequest
        {
            Id = settlementId,
            GroupId = groupId,
            SourceExpenseBillId = billId,
            DebtorUserProfileId = debtorUserProfileId,
            CreditorUserProfileId = creditorUserProfileId,
            Amount = amount,
            Currency = "USD",
            Status = status,
            RequestedByUserProfileId = requestedByUserProfileId,
            RequestedAtUtc = createdAtUtc,
            ConfirmedAtUtc = status == SettlementRequestStatuses.Confirmed ? createdAtUtc.AddMinutes(1) : null,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });
        dbContext.Set<SettlementRequestLine>().Add(new SettlementRequestLine
        {
            Id = lineId,
            SettlementRequestId = settlementId,
            SourceExpenseBillId = billId,
            ExactAmount = amount,
            Currency = "USD",
            AllocationOrder = 0,
            Status = SettlementRequestLineStatuses.Open,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
        return settlementId;
    }

    private static async Task<Guid> SeedSettlementPaymentAsync(
        WebApplicationFactory<Program> testFactory,
        Guid settlementId,
        Guid paidByUserProfileId,
        Guid receivedByUserProfileId,
        decimal amount,
        string status,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var paymentId = Guid.NewGuid();
        dbContext.Set<SettlementPayment>().Add(new SettlementPayment
        {
            Id = paymentId,
            SettlementRequestId = settlementId,
            PaidByUserProfileId = paidByUserProfileId,
            ReceivedByUserProfileId = receivedByUserProfileId,
            Amount = amount,
            Currency = "USD",
            Status = status,
            PaymentDate = PaymentDate,
            CreatedByUserProfileId = paidByUserProfileId,
            ClaimedAtUtc = createdAtUtc,
            ConfirmedAtUtc = status == SettlementPaymentStatuses.Confirmed ? createdAtUtc.AddMinutes(1) : null,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
        return paymentId;
    }

    private static async Task<ExpenseBill> ReadBillAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBill>()
            .Include(bill => bill.Items)
                .ThenInclude(item => item.Splits)
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .SingleAsync(bill => bill.Id == billId);
    }

    private static async Task<FinancialSnapshot> ReadFinancialSnapshotAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var bill = await dbContext.Set<ExpenseBill>()
            .AsNoTracking()
            .Include(candidate => candidate.Items)
                .ThenInclude(item => item.Splits)
            .Include(candidate => candidate.Participants)
            .Include(candidate => candidate.Payers)
            .SingleAsync(candidate => candidate.Id == billId);

        return new FinancialSnapshot(
            bill.Status,
            bill.TotalAmount,
            bill.TotalCurrency,
            bill.UpdatedAtUtc,
            bill.Participants
                .OrderBy(participant => participant.UserProfileId)
                .Select(participant => new ParticipantSnapshot(
                    participant.UserProfileId,
                    participant.Status,
                    participant.ResolvedShareAmount,
                    participant.ResolvedShareCurrency))
                .ToArray(),
            bill.Payers
                .OrderBy(payer => payer.UserProfileId)
                .Select(payer => new PayerSnapshot(
                    payer.UserProfileId,
                    payer.Amount,
                    payer.Currency))
                .ToArray(),
            bill.Items
                .SelectMany(item => item.Splits)
                .OrderBy(split => split.UserProfileId)
                .Select(split => new SplitSnapshot(
                    split.UserProfileId,
                    split.ResolvedAmount,
                    split.ResolvedCurrency))
                .ToArray(),
            await dbContext.Set<SettlementRequest>().CountAsync(request => request.SourceExpenseBillId == billId),
            await dbContext.Set<SettlementPayment>().CountAsync(payment => payment.SettlementRequest.SourceExpenseBillId == billId));
    }

    private static void AssertFinancialSnapshotEqual(
        FinancialSnapshot expected,
        FinancialSnapshot actual)
    {
        Assert.Equal(expected.BillStatus, actual.BillStatus);
        Assert.Equal(expected.TotalAmount, actual.TotalAmount);
        Assert.Equal(expected.TotalCurrency, actual.TotalCurrency);
        Assert.Equal(expected.UpdatedAtUtc, actual.UpdatedAtUtc);
        Assert.Equal(expected.Participants, actual.Participants);
        Assert.Equal(expected.Payers, actual.Payers);
        Assert.Equal(expected.Splits, actual.Splits);
        Assert.Equal(expected.SettlementRequestCount, actual.SettlementRequestCount);
        Assert.Equal(expected.SettlementPaymentCount, actual.SettlementPaymentCount);
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadReconciliationAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action == ReconciliationUpdatedAction)
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Id)
            .ToArrayAsync();
    }

    private static async Task<IReadOnlyList<BillListItem>> GetBillsAsync(
        HttpClient client,
        string rawSessionToken,
        string path)
    {
        using var request = CreateBearerRequest(HttpMethod.Get, path, rawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        return payload.RootElement.GetProperty("bills")
            .EnumerateArray()
            .Select(bill => new BillListItem(
                bill.GetProperty("id").GetGuid(),
                bill.GetProperty("reconciliation").GetProperty("status").GetString()!,
                bill.GetProperty("status").GetString()!,
                bill.GetProperty("totalCurrency").GetString()!,
                bill.GetProperty("merchantName").ValueKind is JsonValueKind.Null
                    ? null
                    : bill.GetProperty("merchantName").GetString(),
                DateOnly.ParseExact(
                    bill.GetProperty("billDate").GetString()!,
                    "yyyy-MM-dd",
                    CultureInfo.InvariantCulture)))
            .ToArray();
    }

    private static string FindCurrencyAmount(JsonElement totals, string currency)
    {
        return totals
            .EnumerateArray()
            .Single(total => total.GetProperty("currency").GetString() == currency)
            .GetProperty("amount")
            .GetString()!;
    }

    private static int FindStatusCount(JsonElement counts, string status)
    {
        return counts
            .EnumerateArray()
            .Single(count => count.GetProperty("status").GetString() == status)
            .GetProperty("count")
            .GetInt32();
    }

    private static void AssertSafeAuditContent(
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

        Assert.DoesNotContain("note", lowerAuditText);
        Assert.DoesNotContain("merchant", lowerAuditText);
        Assert.DoesNotContain("auth", lowerAuditText);
        Assert.DoesNotContain("session", lowerAuditText);
        Assert.DoesNotContain("credential", lowerAuditText);
        Assert.DoesNotContain("token", lowerAuditText);
        Assert.DoesNotContain("hash", lowerAuditText);
        Assert.DoesNotContain("password", lowerAuditText);
        Assert.DoesNotContain("provider", lowerAuditText);
        Assert.DoesNotContain("payload", lowerAuditText);
        Assert.DoesNotContain("storage", lowerAuditText);
        Assert.DoesNotContain("path", lowerAuditText);
        Assert.DoesNotContain("file", lowerAuditText);
        Assert.DoesNotContain("object", lowerAuditText);
        Assert.DoesNotContain("vault", lowerAuditText);
        Assert.DoesNotContain("ocr", lowerAuditText);
    }

    private static void AssertSafeReportContent(
        string content,
        params string[] forbiddenValues)
    {
        var lowerContent = content.ToLowerInvariant();

        foreach (var forbiddenValue in forbiddenValues)
        {
            Assert.DoesNotContain(forbiddenValue, content);
        }

        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("item", lowerContent);
        Assert.DoesNotContain("auth", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("paymentdetail", lowerContent);
        Assert.DoesNotContain("payment_detail", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("file", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("object_key", lowerContent);
        Assert.DoesNotContain("ocr", lowerContent);
        Assert.DoesNotContain("raw", lowerContent);
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

    private static string PersonalReconciliationPath(Guid billId)
    {
        return $"/api/v1/bills/{billId:D}/reconciliation";
    }

    private static string GroupReconciliationPath(Guid groupId, Guid billId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/reconciliation";
    }

    private static async Task AssertReconciliationUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bill reconciliation unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested bill reconciliation is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertInvalidReconciliationRequestProblemAsync(
        HttpResponseMessage response,
        string content)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid reconciliation request", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted reconciliation request is invalid.",
            payload.RootElement.GetProperty("detail").GetString());
        await Task.CompletedTask;
    }

    private static async Task AssertMonthlyReportUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Monthly report unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested monthly report is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertBillExportUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bill export unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested bill export is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        ReconciliationTestTimeProvider TimeProvider);

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
        decimal ResolvedShareAmount);

    private sealed record PayerSeed(
        Guid UserProfileId,
        decimal Amount);

    private sealed record BillListItem(
        Guid Id,
        string ReconciliationStatus,
        string Status,
        string TotalCurrency,
        string? MerchantName,
        DateOnly BillDate);

    private sealed record FinancialSnapshot(
        string BillStatus,
        decimal TotalAmount,
        string TotalCurrency,
        DateTimeOffset UpdatedAtUtc,
        IReadOnlyList<ParticipantSnapshot> Participants,
        IReadOnlyList<PayerSnapshot> Payers,
        IReadOnlyList<SplitSnapshot> Splits,
        int SettlementRequestCount,
        int SettlementPaymentCount);

    private sealed record ParticipantSnapshot(
        Guid UserProfileId,
        string Status,
        decimal ResolvedShareAmount,
        string ResolvedShareCurrency);

    private sealed record PayerSnapshot(
        Guid UserProfileId,
        decimal Amount,
        string Currency);

    private sealed record SplitSnapshot(
        Guid UserProfileId,
        decimal ResolvedAmount,
        string ResolvedCurrency);

    private sealed class ReconciliationTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public ReconciliationTestTimeProvider(DateTimeOffset utcNow)
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
