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

public sealed class ExpenseBillRevisionEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 10, 5, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 10, 5, 10, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 10, 5, 30, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public ExpenseBillRevisionEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task AllowedActorCanCreateListAndGetDraftRevisionForVisibleBill()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Create Creator");
        var participant = await SeedAccountAsync(testFactory, "Revision Create Participant", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participant.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            creatorSession.RawSessionToken,
            SnapshotJson(
                [(creatorSession.UserProfileId, 40m), (participant.UserProfileId, 60m)],
                [(creatorSession.UserProfileId, 100m)]));
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();

        Assert.True(createResponse.StatusCode == HttpStatusCode.Created, createContent);
        using var createPayload = JsonDocument.Parse(createContent);
        var revisionId = createPayload.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(billId, createPayload.RootElement.GetProperty("billId").GetGuid());
        Assert.Equal(creatorSession.UserProfileId, createPayload.RootElement.GetProperty("proposalCreatorUserProfileId").GetGuid());
        Assert.Equal(ExpenseBillRevisionStatuses.DraftRevision, createPayload.RootElement.GetProperty("status").GetString());
        Assert.Equal("100", createPayload.RootElement.GetProperty("totalAmount").GetString());
        Assert.Equal("USD", createPayload.RootElement.GetProperty("totalCurrency").GetString());
        Assert.Equal(64, createPayload.RootElement.GetProperty("calculationHash").GetString()!.Length);
        Assert.Equal(2, createPayload.RootElement.GetProperty("participants").GetArrayLength());
        Assert.Equal(2, createPayload.RootElement.GetProperty("approvals").GetArrayLength());

        using var listRequest = CreateBearerRequest(HttpMethod.Get, RevisionsPath(billId), creatorSession.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        var listContent = await listResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        using var listPayload = JsonDocument.Parse(listContent);
        var listedRevision = Assert.Single(listPayload.RootElement.GetProperty("revisions").EnumerateArray());
        Assert.Equal(revisionId, listedRevision.GetProperty("id").GetGuid());

        using var getRequest = CreateBearerRequest(HttpMethod.Get, RevisionPath(billId, revisionId), participant.RawSessionToken ?? creatorSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var getContent = await getResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        using var getPayload = JsonDocument.Parse(getContent);
        Assert.Equal(revisionId, getPayload.RootElement.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task UnrelatedActorCannotListGetCreateUpdateSubmitWithdrawApproveOrRejectRevisions()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Unrelated Creator");
        var participant = await SeedAccountAsync(testFactory, "Revision Unrelated Participant", InitialTimestamp.AddMinutes(1));
        var unrelatedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Unrelated Actor");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participant.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateDraftRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            creatorSession.UserProfileId,
            participant.UserProfileId);
        using var client = testFactory.CreateClient();
        var snapshotBody = SnapshotJson(
            [(creatorSession.UserProfileId, 45m), (participant.UserProfileId, 55m)],
            [(creatorSession.UserProfileId, 100m)]);
        var approvalBody = ApprovalJson("50", "USD", new string('a', 64));
        var requests = new[]
        {
            CreateBearerRequest(HttpMethod.Get, RevisionsPath(billId), unrelatedSession.RawSessionToken),
            CreateBearerRequest(HttpMethod.Get, RevisionPath(billId, revisionId), unrelatedSession.RawSessionToken),
            CreateJsonRequest(HttpMethod.Post, RevisionsPath(billId), unrelatedSession.RawSessionToken, snapshotBody),
            CreateJsonRequest(HttpMethod.Patch, RevisionPath(billId, revisionId), unrelatedSession.RawSessionToken, snapshotBody),
            CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, revisionId), unrelatedSession.RawSessionToken),
            CreateBearerRequest(HttpMethod.Post, WithdrawPath(billId, revisionId), unrelatedSession.RawSessionToken),
            CreateJsonRequest(HttpMethod.Post, ApprovePath(billId, revisionId), unrelatedSession.RawSessionToken, approvalBody),
            CreateBearerRequest(HttpMethod.Post, RejectPath(billId, revisionId), unrelatedSession.RawSessionToken)
        };

        foreach (var request in requests)
        {
            using (request)
            using (var response = await client.SendAsync(request))
            {
                Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            }
        }

        var revision = await ReadRevisionAsync(testFactory, revisionId);
        Assert.Equal(ExpenseBillRevisionStatuses.DraftRevision, revision.Status);
    }

    [Fact]
    public async Task RemovedGroupParticipantCannotSeeOrCreateRevisions()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Group Owner");
        var removedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Removed Member");
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Revision Removed Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(removedSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            ownerProfileId: ownerSession.UserProfileId,
            groupId,
            [
                new ParticipantSeed(ownerSession.UserProfileId, 50m),
                new ParticipantSeed(removedSession.UserProfileId, 50m)
            ],
            [new PayerSeed(ownerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var listRequest = CreateBearerRequest(HttpMethod.Get, RevisionsPath(billId), removedSession.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        Assert.Equal(HttpStatusCode.NotFound, listResponse.StatusCode);

        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            removedSession.RawSessionToken,
            SnapshotJson(
                [(ownerSession.UserProfileId, 40m), (removedSession.UserProfileId, 60m)],
                [(ownerSession.UserProfileId, 100m)]));
        using var createResponse = await client.SendAsync(createRequest);
        Assert.Equal(HttpStatusCode.NotFound, createResponse.StatusCode);
    }

    [Fact]
    public async Task OneActivePendingRevisionPerBillIsEnforcedThroughApi()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Slot Creator");
        var participant = await SeedAccountAsync(testFactory, "Revision Slot Participant", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participant.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var firstRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            creatorSession.RawSessionToken,
            SnapshotJson(
                [(creatorSession.UserProfileId, 40m), (participant.UserProfileId, 60m)],
                [(creatorSession.UserProfileId, 100m)]));
        using var firstResponse = await client.SendAsync(firstRequest);
        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);

        using var secondRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            creatorSession.RawSessionToken,
            SnapshotJson(
                [(creatorSession.UserProfileId, 45m), (participant.UserProfileId, 55m)],
                [(creatorSession.UserProfileId, 100m)]));
        using var secondResponse = await client.SendAsync(secondRequest);

        await AssertBillRevisionConflictProblemAsync(secondResponse);
    }

    [Fact]
    public async Task DraftProposalCanSubmitAndWithdrawOnlyByProposerPolicy()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Submit Creator");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Submit Participant");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateDraftRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            creatorSession.UserProfileId,
            participantSession.UserProfileId);
        using var client = testFactory.CreateClient();

        using var submitRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, revisionId), creatorSession.RawSessionToken);
        using var submitResponse = await client.SendAsync(submitRequest);
        var submitContent = await submitResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, submitResponse.StatusCode);
        using (var submitPayload = JsonDocument.Parse(submitContent))
        {
            Assert.Equal(ExpenseBillRevisionStatuses.SubmittedForReview, submitPayload.RootElement.GetProperty("status").GetString());
        }

        using var deniedWithdrawRequest = CreateBearerRequest(HttpMethod.Post, WithdrawPath(billId, revisionId), participantSession.RawSessionToken);
        using var deniedWithdrawResponse = await client.SendAsync(deniedWithdrawRequest);
        await AssertBillRevisionConflictProblemAsync(deniedWithdrawResponse);

        using var withdrawRequest = CreateBearerRequest(HttpMethod.Post, WithdrawPath(billId, revisionId), creatorSession.RawSessionToken);
        using var withdrawResponse = await client.SendAsync(withdrawRequest);
        var withdrawContent = await withdrawResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, withdrawResponse.StatusCode);
        using var withdrawPayload = JsonDocument.Parse(withdrawContent);
        Assert.Equal(ExpenseBillRevisionStatuses.WithdrawnByProposer, withdrawPayload.RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public async Task AffectedParticipantCanApproveOnlyWithMatchingAmountCurrencyAndCalculationHash()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Approve Creator");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Approve Participant");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateDraftRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            creatorSession.UserProfileId,
            participantSession.UserProfileId);
        using var client = testFactory.CreateClient();
        using (var submitRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, revisionId), creatorSession.RawSessionToken))
        using (var submitResponse = await client.SendAsync(submitRequest))
        {
            Assert.Equal(HttpStatusCode.OK, submitResponse.StatusCode);
        }

        var approval = await ReadApprovalAsync(testFactory, revisionId, participantSession.UserProfileId);
        using (var wrongHashRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            participantSession.RawSessionToken,
            ApprovalJson(approval.AcceptedAmount.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture), approval.Currency, new string('a', 64))))
        using (var wrongHashResponse = await client.SendAsync(wrongHashRequest))
        {
            await AssertBillRevisionConflictProblemAsync(wrongHashResponse);
        }

        using (var wrongAmountRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            participantSession.RawSessionToken,
            ApprovalJson("50", approval.Currency, approval.CalculationHash)))
        using (var wrongAmountResponse = await client.SendAsync(wrongAmountRequest))
        {
            await AssertBillRevisionConflictProblemAsync(wrongAmountResponse);
        }

        using (var wrongCurrencyRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            participantSession.RawSessionToken,
            ApprovalJson(approval.AcceptedAmount.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture), "HKD", approval.CalculationHash)))
        using (var wrongCurrencyResponse = await client.SendAsync(wrongCurrencyRequest))
        {
            await AssertBillRevisionConflictProblemAsync(wrongCurrencyResponse);
        }

        using var correctRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            participantSession.RawSessionToken,
            ApprovalJson(approval.AcceptedAmount.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture), approval.Currency, approval.CalculationHash));
        using var correctResponse = await client.SendAsync(correctRequest);
        var correctContent = await correctResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, correctResponse.StatusCode);
        using var correctPayload = JsonDocument.Parse(correctContent);
        var participantApproval = correctPayload.RootElement.GetProperty("approvals")
            .EnumerateArray()
            .Single(candidate => candidate.GetProperty("participantUserProfileId").GetGuid() == participantSession.UserProfileId);
        Assert.Equal(ExpenseBillRevisionApprovalStatuses.Approved, participantApproval.GetProperty("status").GetString());
    }

    [Fact]
    public async Task UnaffectedActorCannotApproveAsIfAffectedWhenApprovalWasAlreadyPreserved()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Unaffected Creator");
        var affectedParticipant = await SeedAccountAsync(testFactory, "Revision Affected Participant", InitialTimestamp.AddMinutes(1));
        var unaffectedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Unaffected Participant");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 30m),
                new ParticipantSeed(affectedParticipant.UserProfileId, 30m),
                new ParticipantSeed(unaffectedSession.UserProfileId, 40m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            creatorSession.RawSessionToken,
            SnapshotJson(
                [
                    (creatorSession.UserProfileId, 20m),
                    (affectedParticipant.UserProfileId, 40m),
                    (unaffectedSession.UserProfileId, 40m)
                ],
                [(creatorSession.UserProfileId, 100m)]));
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var createPayload = JsonDocument.Parse(createContent);
        var revisionId = createPayload.RootElement.GetProperty("id").GetGuid();

        using (var submitRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, revisionId), creatorSession.RawSessionToken))
        using (var submitResponse = await client.SendAsync(submitRequest))
        {
            Assert.Equal(HttpStatusCode.OK, submitResponse.StatusCode);
        }

        var preservedApproval = await ReadApprovalAsync(testFactory, revisionId, unaffectedSession.UserProfileId);
        Assert.Equal(ExpenseBillRevisionApprovalStatuses.Approved, preservedApproval.Status);

        using var approveRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            unaffectedSession.RawSessionToken,
            ApprovalJson("40", "USD", preservedApproval.CalculationHash));
        using var approveResponse = await client.SendAsync(approveRequest);

        await AssertBillRevisionConflictProblemAsync(approveResponse);
    }

    [Fact]
    public async Task RejectionIsBoundedAndRejectedProposalCannotLaterApprove()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var creatorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Reject Creator");
        var participantSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Reject Participant");
        var billId = await SeedBillAsync(
            testFactory,
            creatorSession.UserProfileId,
            ownerProfileId: creatorSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(creatorSession.UserProfileId, 50m),
                new ParticipantSeed(participantSession.UserProfileId, 50m)
            ],
            [new PayerSeed(creatorSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        var revisionId = await CreateDraftRevisionAsync(
            testFactory,
            testContext.TimeProvider,
            billId,
            creatorSession.RawSessionToken,
            creatorSession.UserProfileId,
            participantSession.UserProfileId);
        using var client = testFactory.CreateClient();
        using (var submitRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, revisionId), creatorSession.RawSessionToken))
        using (var submitResponse = await client.SendAsync(submitRequest))
        {
            Assert.Equal(HttpStatusCode.OK, submitResponse.StatusCode);
        }

        using var rejectRequest = CreateBearerRequest(HttpMethod.Post, RejectPath(billId, revisionId), participantSession.RawSessionToken);
        using var rejectResponse = await client.SendAsync(rejectRequest);
        var rejectContent = await rejectResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, rejectResponse.StatusCode);
        Assert.DoesNotContain("reason", rejectContent, StringComparison.OrdinalIgnoreCase);
        using (var rejectPayload = JsonDocument.Parse(rejectContent))
        {
            Assert.Equal(ExpenseBillRevisionStatuses.Rejected, rejectPayload.RootElement.GetProperty("status").GetString());
        }

        var approval = await ReadApprovalAsync(testFactory, revisionId, participantSession.UserProfileId);
        using var approveRequest = CreateJsonRequest(
            HttpMethod.Post,
            ApprovePath(billId, revisionId),
            participantSession.RawSessionToken,
            ApprovalJson(approval.AcceptedAmount.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture), approval.Currency, approval.CalculationHash));
        using var approveResponse = await client.SendAsync(approveRequest);

        await AssertBillRevisionConflictProblemAsync(approveResponse);
    }

    [Fact]
    public async Task PendingRejectedSupersededAndWithdrawnRevisionsDoNotChangeSettlementCandidateDerivation()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var payerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Revision Settlement Payer");
        var debtor = await SeedAccountAsync(testFactory, "Revision Settlement Debtor", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            payerSession.UserProfileId,
            ownerProfileId: payerSession.UserProfileId,
            groupId: null,
            [
                new ParticipantSeed(payerSession.UserProfileId, 50m),
                new ParticipantSeed(debtor.UserProfileId, 50m)
            ],
            [new PayerSeed(payerSession.UserProfileId, 100m)],
            ExpenseBillStatuses.Confirmed,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        await AssertSettlementCandidateAmountAsync(client, billId, payerSession.RawSessionToken, "50");

        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            payerSession.RawSessionToken,
            SnapshotJson(
                [(payerSession.UserProfileId, 20m), (debtor.UserProfileId, 80m)],
                [(payerSession.UserProfileId, 100m)]));
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var createPayload = JsonDocument.Parse(createContent);
        var firstRevisionId = createPayload.RootElement.GetProperty("id").GetGuid();

        using (var submitRequest = CreateBearerRequest(HttpMethod.Post, SubmitPath(billId, firstRevisionId), payerSession.RawSessionToken))
        using (var submitResponse = await client.SendAsync(submitRequest))
        {
            Assert.Equal(HttpStatusCode.OK, submitResponse.StatusCode);
        }

        await AssertSettlementCandidateAmountAsync(client, billId, payerSession.RawSessionToken, "50");

        using var reviseRequest = CreateJsonRequest(
            HttpMethod.Patch,
            RevisionPath(billId, firstRevisionId),
            payerSession.RawSessionToken,
            SnapshotJson(
                [(payerSession.UserProfileId, 10m), (debtor.UserProfileId, 90m)],
                [(payerSession.UserProfileId, 100m)]));
        using var reviseResponse = await client.SendAsync(reviseRequest);
        var reviseContent = await reviseResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, reviseResponse.StatusCode);
        using var revisePayload = JsonDocument.Parse(reviseContent);
        var secondRevisionId = revisePayload.RootElement.GetProperty("id").GetGuid();

        await AssertSettlementCandidateAmountAsync(client, billId, payerSession.RawSessionToken, "50");

        using (var rejectRequest = CreateBearerRequest(HttpMethod.Post, RejectPath(billId, secondRevisionId), debtor.RawSessionToken ?? payerSession.RawSessionToken))
        using (var rejectResponse = await client.SendAsync(rejectRequest))
        {
            Assert.Equal(HttpStatusCode.OK, rejectResponse.StatusCode);
        }

        await AssertSettlementCandidateAmountAsync(client, billId, payerSession.RawSessionToken, "50");

        using var thirdCreateRequest = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            payerSession.RawSessionToken,
            SnapshotJson(
                [(payerSession.UserProfileId, 30m), (debtor.UserProfileId, 70m)],
                [(payerSession.UserProfileId, 100m)]));
        using var thirdCreateResponse = await client.SendAsync(thirdCreateRequest);
        var thirdCreateContent = await thirdCreateResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Created, thirdCreateResponse.StatusCode);
        using var thirdCreatePayload = JsonDocument.Parse(thirdCreateContent);
        var thirdRevisionId = thirdCreatePayload.RootElement.GetProperty("id").GetGuid();

        using (var withdrawRequest = CreateBearerRequest(HttpMethod.Post, WithdrawPath(billId, thirdRevisionId), payerSession.RawSessionToken))
        using (var withdrawResponse = await client.SendAsync(withdrawRequest))
        {
            Assert.Equal(HttpStatusCode.OK, withdrawResponse.StatusCode);
        }

        await AssertSettlementCandidateAmountAsync(client, billId, payerSession.RawSessionToken, "50");
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new ExpenseBillRevisionTestTimeProvider(InitialTimestamp);
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
        ExpenseBillRevisionTestTimeProvider timeProvider,
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
        return new SeededAccount(authAccountId, userProfileId, null);
    }

    private static async Task<SeededSession> SeedSessionForAccountAsync(
        WebApplicationFactory<Program> testFactory,
        ExpenseBillRevisionTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Bill revision endpoint test",
                UserAgentSummary: "Bill revision endpoint test user agent",
                NetworkAddressHash: "bill-revision-endpoint-test-network",
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
        Guid ownerProfileId,
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
            BillOwnerUserProfileId = ownerProfileId,
            GroupId = groupId,
            MerchantName = "Hidden Revision Merchant",
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
            Name = "Hidden Revision Item",
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
                AcceptedAtUtc = participant.AcceptedAtUtc ?? createdAtUtc,
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
                PayerFactsCreatedByUserProfileId = creatorProfileId,
                Amount = payer.Amount,
                Currency = "USD",
                PayerConfirmationStatus = ExpenseBillPayerConfirmationStatuses.Confirmed,
                PayerConfirmedAtUtc = createdAtUtc,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        dbContext.Set<ExpenseBill>().Add(bill);
        await dbContext.SaveChangesAsync();
        return billId;
    }

    private static async Task<Guid> CreateDraftRevisionAsync(
        WebApplicationFactory<Program> testFactory,
        ExpenseBillRevisionTestTimeProvider timeProvider,
        Guid billId,
        string rawSessionToken,
        Guid creatorProfileId,
        Guid participantProfileId)
    {
        timeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            RevisionsPath(billId),
            rawSessionToken,
            SnapshotJson(
                [(creatorProfileId, 40m), (participantProfileId, 60m)],
                [(creatorProfileId, 100m)]));
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Created, content);
        using var payload = JsonDocument.Parse(content);
        return payload.RootElement.GetProperty("id").GetGuid();
    }

    private static async Task<ExpenseBillRevision> ReadRevisionAsync(
        WebApplicationFactory<Program> testFactory,
        Guid revisionId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBillRevision>()
            .Include(revision => revision.Participants)
            .Include(revision => revision.Payers)
            .Include(revision => revision.Approvals)
            .SingleAsync(revision => revision.Id == revisionId);
    }

    private static async Task<ExpenseBillRevisionApproval> ReadApprovalAsync(
        WebApplicationFactory<Program> testFactory,
        Guid revisionId,
        Guid participantUserProfileId)
    {
        var revision = await ReadRevisionAsync(testFactory, revisionId);
        return revision.Approvals.Single(approval => approval.ParticipantUserProfileId == participantUserProfileId);
    }

    private static async Task AssertSettlementCandidateAmountAsync(
        HttpClient client,
        Guid billId,
        string rawSessionToken,
        string expectedAmount)
    {
        using var request = CreateBearerRequest(HttpMethod.Get, SettlementCandidatesPath(billId), rawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        var candidate = Assert.Single(payload.RootElement.GetProperty("candidates").EnumerateArray());
        Assert.Equal(expectedAmount, candidate.GetProperty("amount").GetString());
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

    private static string SnapshotJson(
        IReadOnlyList<(Guid UserProfileId, decimal Amount)> participants,
        IReadOnlyList<(Guid UserProfileId, decimal Amount)> payers)
    {
        var total = participants.Sum(participant => participant.Amount);
        var participantJson = string.Join(
            ",",
            participants.Select(participant =>
                $$"""{"userProfileId":"{{participant.UserProfileId:D}}","resolvedShareAmount":"{{FormatAmount(participant.Amount)}}","resolvedShareCurrency":"USD"}"""));
        var payerJson = string.Join(
            ",",
            payers.Select(payer =>
                $$"""{"userProfileId":"{{payer.UserProfileId:D}}","amount":"{{FormatAmount(payer.Amount)}}","currency":"USD"}"""));

        return $$"""{"totalAmount":"{{FormatAmount(total)}}","totalCurrency":"USD","participants":[{{participantJson}}],"payers":[{{payerJson}}]}""";
    }

    private static string ApprovalJson(
        string acceptedAmount,
        string currency,
        string calculationHash)
    {
        return $$"""{"acceptedAmount":"{{acceptedAmount}}","currency":"{{currency}}","calculationHash":"{{calculationHash}}"}""";
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", System.Globalization.CultureInfo.InvariantCulture);
    }

    private static string RevisionsPath(Guid billId)
    {
        return $"/api/v1/bills/{billId:D}/revisions";
    }

    private static string RevisionPath(Guid billId, Guid revisionId)
    {
        return $"/api/v1/bills/{billId:D}/revisions/{revisionId:D}";
    }

    private static string SubmitPath(Guid billId, Guid revisionId)
    {
        return $"/api/v1/bills/{billId:D}/revisions/{revisionId:D}/submit";
    }

    private static string WithdrawPath(Guid billId, Guid revisionId)
    {
        return $"/api/v1/bills/{billId:D}/revisions/{revisionId:D}/withdraw";
    }

    private static string ApprovePath(Guid billId, Guid revisionId)
    {
        return $"/api/v1/bills/{billId:D}/revisions/{revisionId:D}/approve";
    }

    private static string RejectPath(Guid billId, Guid revisionId)
    {
        return $"/api/v1/bills/{billId:D}/revisions/{revisionId:D}/reject";
    }

    private static string SettlementCandidatesPath(Guid billId)
    {
        return $"/api/v1/bills/{billId:D}/settlement-candidates";
    }

    private static async Task AssertBillRevisionConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bill revision conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested bill revision transition is not allowed.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        ExpenseBillRevisionTestTimeProvider TimeProvider);

    private sealed record SeededAccount(
        Guid AuthAccountId,
        Guid UserProfileId,
        string? RawSessionToken);

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

    private sealed class ExpenseBillRevisionTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public ExpenseBillRevisionTestTimeProvider(DateTimeOffset utcNow)
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
