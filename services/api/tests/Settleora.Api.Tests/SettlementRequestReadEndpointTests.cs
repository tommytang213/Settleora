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

public sealed class SettlementRequestReadEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WrongRawToken = "visible-wrong-settlement-read-session-token";
    private const string HiddenMerchantName = "Hidden Settlement Read Merchant";
    private const string HiddenItemName = "Hidden Settlement Read Item";
    private const string HiddenPaymentMethodLabel = "Hidden settlement read payment method";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 8, 11, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 8, 11, 15, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public SettlementRequestReadEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PersonalListAndGetReturnOnlyCurrentActorSettlementRequestsWithBoundedResponse()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal Read Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Personal Read Creditor", InitialTimestamp.AddMinutes(1));
        var requesterOnlyDebtor = await SeedAccountAsync(testFactory, "Requester Only Debtor", InitialTimestamp.AddMinutes(2));
        var requesterOnlyCreditor = await SeedAccountAsync(testFactory, "Requester Only Creditor", InitialTimestamp.AddMinutes(3));
        var unrelated = await SeedAccountAsync(testFactory, "Unrelated Hidden Settlement User", InitialTimestamp.AddMinutes(4));
        var visibleBillId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorSession.UserProfileId, 12.34m), new ParticipantSeed(creditor.UserProfileId, 12.34m)],
            [new PayerSeed(creditor.UserProfileId, 24.68m)],
            InitialTimestamp);
        var requesterOnlyBillId = await SeedBillAsync(
            testFactory,
            requesterOnlyCreditor.UserProfileId,
            groupId: null,
            [new ParticipantSeed(requesterOnlyDebtor.UserProfileId, 7.89m), new ParticipantSeed(requesterOnlyCreditor.UserProfileId, 7.89m)],
            [new PayerSeed(requesterOnlyCreditor.UserProfileId, 15.78m)],
            InitialTimestamp.AddMinutes(1));
        var unrelatedBillId = await SeedBillAsync(
            testFactory,
            unrelated.UserProfileId,
            groupId: null,
            [new ParticipantSeed(unrelated.UserProfileId, 1m)],
            [new PayerSeed(unrelated.UserProfileId, 1m)],
            InitialTimestamp.AddMinutes(2));
        var visibleSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            visibleBillId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            12.34m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(10));
        var requesterOnlySettlementId = await SeedSettlementRequestAsync(
            testFactory,
            requesterOnlyBillId,
            groupId: null,
            requesterOnlyDebtor.UserProfileId,
            requesterOnlyCreditor.UserProfileId,
            debtorSession.UserProfileId,
            7.89m,
            SettlementRequestStatuses.Disputed,
            InitialTimestamp.AddMinutes(20));
        await SeedSettlementRequestAsync(
            testFactory,
            unrelatedBillId,
            groupId: null,
            unrelated.UserProfileId,
            requesterOnlyCreditor.UserProfileId,
            unrelated.UserProfileId,
            1m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(30));
        await SeedSettlementRequestAsync(
            testFactory,
            visibleBillId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            debtorSession.UserProfileId,
            2m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(40),
            archivedAtUtc: InitialTimestamp.AddMinutes(41));
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, debtorSession.AuthSessionId);

        using var client = testFactory.CreateClient();
        using var listRequest = CreateBearerRequest(HttpMethod.Get, SettlementsPath(), debtorSession.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        var listContent = await listResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        Assert.Equal("application/json", listResponse.Content.Headers.ContentType?.MediaType);
        AssertSafeReadResponseContent(
            listContent,
            debtorSession.RawSessionToken,
            sessionTokenHash,
            HiddenMerchantName,
            HiddenItemName,
            HiddenPaymentMethodLabel,
            "Unrelated Hidden Settlement User");
        using var listPayload = JsonDocument.Parse(listContent);
        Assert.Equal(["settlements"], listPayload.RootElement.EnumerateObject().Select(property => property.Name).ToArray());
        var settlements = listPayload.RootElement.GetProperty("settlements").EnumerateArray().ToArray();
        Assert.Equal(2, settlements.Length);
        Assert.Equal(requesterOnlySettlementId, settlements[0].GetProperty("id").GetGuid());
        Assert.Equal(visibleSettlementId, settlements[1].GetProperty("id").GetGuid());
        AssertSettlementRequestResponseShape(settlements[0]);
        Assert.Equal(requesterOnlyBillId, settlements[0].GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal(JsonValueKind.Null, settlements[0].GetProperty("groupId").ValueKind);
        Assert.Equal(requesterOnlyDebtor.UserProfileId, settlements[0].GetProperty("debtorUserProfileId").GetGuid());
        Assert.Equal(requesterOnlyCreditor.UserProfileId, settlements[0].GetProperty("creditorUserProfileId").GetGuid());
        Assert.Equal("7.89", settlements[0].GetProperty("amount").GetString());
        Assert.Equal("USD", settlements[0].GetProperty("currency").GetString());
        Assert.Equal(SettlementRequestStatuses.Disputed, settlements[0].GetProperty("status").GetString());
        Assert.Equal(debtorSession.UserProfileId, settlements[0].GetProperty("requestedByUserProfileId").GetGuid());

        using var getRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(visibleSettlementId), debtorSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var getContent = await getResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        AssertSafeReadResponseContent(
            getContent,
            debtorSession.RawSessionToken,
            sessionTokenHash,
            HiddenMerchantName,
            HiddenItemName,
            HiddenPaymentMethodLabel);
        using var getPayload = JsonDocument.Parse(getContent);
        AssertSettlementRequestResponseShape(getPayload.RootElement);
        Assert.Equal(visibleSettlementId, getPayload.RootElement.GetProperty("id").GetGuid());
        Assert.Equal(visibleBillId, getPayload.RootElement.GetProperty("sourceExpenseBillId").GetGuid());
        Assert.Equal("12.34", getPayload.RootElement.GetProperty("amount").GetString());
    }

    [Fact]
    public async Task GroupReadsRequireSettlementPartyRelationshipAndActiveGroupVisibility()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Read Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Group Read Creditor", InitialTimestamp.AddMinutes(1));
        var membershipOnlySession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Membership Only Reader");
        var removedDebtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Removed Settlement Debtor");
        var removedCreditor = await SeedAccountAsync(testFactory, "Removed Settlement Creditor", InitialTimestamp.AddMinutes(2));
        var groupId = await SeedGroupAsync(
            testFactory,
            debtorSession.UserProfileId,
            "Visible Settlement Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(membershipOnlySession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var visibleBillId = await SeedBillAsync(
            testFactory,
            debtorSession.UserProfileId,
            groupId,
            [new ParticipantSeed(debtorSession.UserProfileId, 30m), new ParticipantSeed(creditor.UserProfileId, 30m)],
            [new PayerSeed(creditor.UserProfileId, 60m)],
            InitialTimestamp);
        var visibleSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            visibleBillId,
            groupId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            30m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(5));
        var removedGroupId = await SeedGroupAsync(
            testFactory,
            removedCreditor.UserProfileId,
            "Removed Settlement Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(removedDebtorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed),
            new MembershipSeed(removedCreditor.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var removedBillId = await SeedBillAsync(
            testFactory,
            removedCreditor.UserProfileId,
            removedGroupId,
            [new ParticipantSeed(removedDebtorSession.UserProfileId, 8m), new ParticipantSeed(removedCreditor.UserProfileId, 8m)],
            [new PayerSeed(removedCreditor.UserProfileId, 16m)],
            InitialTimestamp);
        var removedSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            removedBillId,
            removedGroupId,
            removedDebtorSession.UserProfileId,
            removedCreditor.UserProfileId,
            removedCreditor.UserProfileId,
            8m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(6));
        var deletedGroupId = await SeedGroupAsync(
            testFactory,
            debtorSession.UserProfileId,
            "Deleted Settlement Group",
            InitialTimestamp,
            deletedAtUtc: InitialTimestamp.AddMinutes(7),
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(creditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var deletedGroupBillId = await SeedBillAsync(
            testFactory,
            debtorSession.UserProfileId,
            deletedGroupId,
            [new ParticipantSeed(debtorSession.UserProfileId, 9m), new ParticipantSeed(creditor.UserProfileId, 9m)],
            [new PayerSeed(creditor.UserProfileId, 18m)],
            InitialTimestamp);
        var deletedGroupSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            deletedGroupBillId,
            deletedGroupId,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            9m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(7));
        var removedCounterpartyGroupId = await SeedGroupAsync(
            testFactory,
            debtorSession.UserProfileId,
            "Removed Counterparty Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(debtorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(removedCreditor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        var removedCounterpartyBillId = await SeedBillAsync(
            testFactory,
            debtorSession.UserProfileId,
            removedCounterpartyGroupId,
            [new ParticipantSeed(debtorSession.UserProfileId, 11m), new ParticipantSeed(removedCreditor.UserProfileId, 11m)],
            [new PayerSeed(removedCreditor.UserProfileId, 22m)],
            InitialTimestamp);
        var removedCounterpartySettlementId = await SeedSettlementRequestAsync(
            testFactory,
            removedCounterpartyBillId,
            removedCounterpartyGroupId,
            debtorSession.UserProfileId,
            removedCreditor.UserProfileId,
            debtorSession.UserProfileId,
            11m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(8));

        using var client = testFactory.CreateClient();
        using var visibleGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(visibleSettlementId), debtorSession.RawSessionToken);
        using var visibleGetResponse = await client.SendAsync(visibleGetRequest);
        var visibleGetContent = await visibleGetResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, visibleGetResponse.StatusCode);
        using var visiblePayload = JsonDocument.Parse(visibleGetContent);
        Assert.Equal(groupId, visiblePayload.RootElement.GetProperty("groupId").GetGuid());
        Assert.Equal(debtorSession.UserProfileId, visiblePayload.RootElement.GetProperty("debtorUserProfileId").GetGuid());
        Assert.Equal(creditor.UserProfileId, visiblePayload.RootElement.GetProperty("creditorUserProfileId").GetGuid());

        using var memberListRequest = CreateBearerRequest(HttpMethod.Get, SettlementsPath(), membershipOnlySession.RawSessionToken);
        using var memberListResponse = await client.SendAsync(memberListRequest);
        using var memberListPayload = JsonDocument.Parse(await memberListResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, memberListResponse.StatusCode);
        Assert.Empty(memberListPayload.RootElement.GetProperty("settlements").EnumerateArray());

        using var memberGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(visibleSettlementId), membershipOnlySession.RawSessionToken);
        using var memberGetResponse = await client.SendAsync(memberGetRequest);
        await AssertSettlementUnavailableProblemAsync(memberGetResponse);

        using var removedGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(removedSettlementId), removedDebtorSession.RawSessionToken);
        using var removedGetResponse = await client.SendAsync(removedGetRequest);
        await AssertSettlementUnavailableProblemAsync(removedGetResponse);

        using var deletedGroupGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(deletedGroupSettlementId), debtorSession.RawSessionToken);
        using var deletedGroupGetResponse = await client.SendAsync(deletedGroupGetRequest);
        await AssertSettlementUnavailableProblemAsync(deletedGroupGetResponse);

        using var removedCounterpartyGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(removedCounterpartySettlementId), debtorSession.RawSessionToken);
        using var removedCounterpartyGetResponse = await client.SendAsync(removedCounterpartyGetRequest);
        await AssertSettlementUnavailableProblemAsync(removedCounterpartyGetResponse);
    }

    [Fact]
    public async Task DeletedDebtorCreditorOrRequesterFailClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Deleted Party Actor");
        var activeCounterparty = await SeedAccountAsync(testFactory, "Active Counterparty", InitialTimestamp.AddMinutes(1));
        var deletedDebtor = await SeedAccountAsync(testFactory, "Deleted Debtor", InitialTimestamp.AddMinutes(2), InitialTimestamp.AddMinutes(20));
        var deletedCreditor = await SeedAccountAsync(testFactory, "Deleted Creditor", InitialTimestamp.AddMinutes(3), InitialTimestamp.AddMinutes(20));
        var deletedRequester = await SeedAccountAsync(testFactory, "Deleted Requester", InitialTimestamp.AddMinutes(4), InitialTimestamp.AddMinutes(20));
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [new ParticipantSeed(actorSession.UserProfileId, 10m), new ParticipantSeed(activeCounterparty.UserProfileId, 10m)],
            [new PayerSeed(activeCounterparty.UserProfileId, 20m)],
            InitialTimestamp);
        var deletedDebtorSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            deletedDebtor.UserProfileId,
            actorSession.UserProfileId,
            actorSession.UserProfileId,
            10m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(1));
        var deletedCreditorSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            actorSession.UserProfileId,
            deletedCreditor.UserProfileId,
            actorSession.UserProfileId,
            11m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(2));
        var deletedRequesterSettlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            actorSession.UserProfileId,
            activeCounterparty.UserProfileId,
            deletedRequester.UserProfileId,
            12m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(3));

        using var client = testFactory.CreateClient();
        foreach (var settlementId in new[]
        {
            deletedDebtorSettlementId,
            deletedCreditorSettlementId,
            deletedRequesterSettlementId
        })
        {
            using var getRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(settlementId), actorSession.RawSessionToken);
            using var getResponse = await client.SendAsync(getRequest);
            await AssertSettlementUnavailableProblemAsync(getResponse);
        }

        using var listRequest = CreateBearerRequest(HttpMethod.Get, SettlementsPath(), actorSession.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        using var listPayload = JsonDocument.Parse(await listResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        Assert.Empty(listPayload.RootElement.GetProperty("settlements").EnumerateArray());
    }

    [Fact]
    public async Task MissingOrInvalidSessionReturnsUniformUnauthorizedForReadEndpoints()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        var settlementId = Guid.NewGuid();

        using var missingListRequest = new HttpRequestMessage(HttpMethod.Get, SettlementsPath());
        using var missingListResponse = await client.SendAsync(missingListRequest);
        await AssertUnauthenticatedProblemAsync(missingListResponse);

        using var invalidListRequest = CreateBearerRequest(HttpMethod.Get, SettlementsPath(), WrongRawToken);
        using var invalidListResponse = await client.SendAsync(invalidListRequest);
        await AssertUnauthenticatedProblemAsync(invalidListResponse, WrongRawToken);

        using var missingGetRequest = new HttpRequestMessage(HttpMethod.Get, SettlementPath(settlementId));
        using var missingGetResponse = await client.SendAsync(missingGetRequest);
        await AssertUnauthenticatedProblemAsync(missingGetResponse);

        using var invalidGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(settlementId), WrongRawToken);
        using var invalidGetResponse = await client.SendAsync(invalidGetRequest);
        await AssertUnauthenticatedProblemAsync(invalidGetResponse, WrongRawToken);
    }

    [Fact]
    public async Task SettlementReadEndpointsDoNotWriteSettlementPaymentProofFilePaymentProfileOrNonSessionAuditSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var debtorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Read Side Effect Debtor");
        var creditor = await SeedAccountAsync(testFactory, "Read Side Effect Creditor", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            creditor.UserProfileId,
            groupId: null,
            [new ParticipantSeed(debtorSession.UserProfileId, 14m), new ParticipantSeed(creditor.UserProfileId, 14m)],
            [new PayerSeed(creditor.UserProfileId, 28m)],
            InitialTimestamp);
        var settlementId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            debtorSession.UserProfileId,
            creditor.UserProfileId,
            creditor.UserProfileId,
            14m,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(5));
        var before = await ReadSideEffectCountsAsync(testFactory);

        using var client = testFactory.CreateClient();
        using var listRequest = CreateBearerRequest(HttpMethod.Get, SettlementsPath(), debtorSession.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);

        using var getRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(settlementId), debtorSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);

        using var missingGetRequest = CreateBearerRequest(HttpMethod.Get, SettlementPath(Guid.NewGuid()), debtorSession.RawSessionToken);
        using var missingGetResponse = await client.SendAsync(missingGetRequest);
        await AssertSettlementUnavailableProblemAsync(missingGetResponse);

        var after = await ReadSideEffectCountsAsync(testFactory);
        Assert.Equal(before, after);
    }

    [Fact]
    public async Task InvalidSettlementIdRouteReturnsNotFoundWithoutLeakingSessionValues()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Invalid Route Actor");
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, "/api/v1/settlements/not-a-guid", actorSession.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.DoesNotContain(actorSession.RawSessionToken, content);
    }

    [Fact]
    public void OpenApiAndGeneratedClientsExposeSettlementListGetPaymentConfirmationAndDisputeWithoutFuturePaymentSurfaces()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var settlementsPathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlements:");
        var settlementGetPathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlements/{settlementId}:");
        var settlementRequestDisputePathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlements/{settlementId}/dispute:");
        var settlementPaymentPathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlements/{settlementId}/payments:");
        var settlementPaymentConfirmationPathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlement-payments/{paymentId}/confirm:");
        var settlementPaymentDisputePathBlock = ExtractOpenApiPathBlock(openApi, "  /api/v1/settlement-payments/{paymentId}/dispute:");
        var listSchemaBlock = ExtractOpenApiSchemaBlock(openApi, "SettlementRequestListResponse:");

        Assert.Contains("operationId: listSettlementRequests", settlementsPathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestListResponse", settlementsPathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: getSettlementRequest", settlementGetPathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestResponse", settlementGetPathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: disputeSettlementRequest", settlementRequestDisputePathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestResponse", settlementRequestDisputePathBlock, StringComparison.Ordinal);
        Assert.DoesNotContain("requestBody:", settlementRequestDisputePathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: createSettlementPaymentClaim", settlementPaymentPathBlock, StringComparison.Ordinal);
        Assert.Contains("CreateSettlementPaymentRequest", settlementPaymentPathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResponse", settlementPaymentPathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: confirmSettlementPayment", settlementPaymentConfirmationPathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResponse", settlementPaymentConfirmationPathBlock, StringComparison.Ordinal);
        Assert.DoesNotContain("requestBody:", settlementPaymentConfirmationPathBlock, StringComparison.Ordinal);
        Assert.Contains("operationId: disputeSettlementPayment", settlementPaymentDisputePathBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResponse", settlementPaymentDisputePathBlock, StringComparison.Ordinal);
        Assert.DoesNotContain("requestBody:", settlementPaymentDisputePathBlock, StringComparison.Ordinal);
        Assert.Contains("settlements", listSchemaBlock, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestResponse", listSchemaBlock, StringComparison.Ordinal);
        Assert.DoesNotContain("markSettlementPaid", openApi, StringComparison.Ordinal);
        Assert.DoesNotContain("cancelSettlement", openApi, StringComparison.Ordinal);
        Assert.DoesNotContain("proofSettlementPayment", openApi, StringComparison.Ordinal);
        Assert.DoesNotContain("settlementBalance", openApi, StringComparison.Ordinal);

        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/generated/client.dart"));
        var webModels = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/models.ts"));
        var dartModels = File.ReadAllText(FindRepoFile("packages/client-dart/generated/models.dart"));
        var generatedContent = string.Join("\n", webClient, dartClient, webModels, dartModels);

        Assert.Contains("listSettlementRequests", generatedContent, StringComparison.Ordinal);
        Assert.Contains("getSettlementRequest", generatedContent, StringComparison.Ordinal);
        Assert.Contains("createSettlementPaymentClaim", generatedContent, StringComparison.Ordinal);
        Assert.Contains("confirmSettlementPayment", generatedContent, StringComparison.Ordinal);
        Assert.Contains("disputeSettlementRequest", generatedContent, StringComparison.Ordinal);
        Assert.Contains("disputeSettlementPayment", generatedContent, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestListResponse", generatedContent, StringComparison.Ordinal);
        Assert.Contains("SettlementPaymentResponse", generatedContent, StringComparison.Ordinal);
        Assert.DoesNotContain("markSettlementPaid", generatedContent, StringComparison.Ordinal);
        Assert.DoesNotContain("cancelSettlement", generatedContent, StringComparison.Ordinal);
        Assert.DoesNotContain("proofSettlementPayment", generatedContent, StringComparison.Ordinal);
        Assert.DoesNotContain("settlementBalance", generatedContent, StringComparison.Ordinal);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new SettlementRequestReadTestTimeProvider(InitialTimestamp);
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
        SettlementRequestReadTestTimeProvider timeProvider,
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
        SettlementRequestReadTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Settlement request read endpoint test",
                UserAgentSummary: "Settlement request read endpoint test user agent",
                NetworkAddressHash: "settlement-request-read-endpoint-test-network",
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
        DateTimeOffset createdAtUtc)
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
            Status = ExpenseBillStatuses.Confirmed,
            TotalAmount = totalAmount,
            TotalCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
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
                Status = ExpenseBillParticipantStatuses.Accepted,
                ResolvedShareAmount = participant.ResolvedShareAmount,
                ResolvedShareCurrency = "USD",
                AcceptedAtUtc = createdAtUtc,
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

    private static async Task<Guid> SeedSettlementRequestAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid? groupId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        Guid requestedByUserProfileId,
        decimal amount,
        string status,
        DateTimeOffset requestedAtUtc,
        DateTimeOffset? archivedAtUtc = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var settlementId = Guid.NewGuid();
        dbContext.Set<SettlementRequest>().Add(new SettlementRequest
        {
            Id = settlementId,
            SourceExpenseBillId = billId,
            GroupId = groupId,
            DebtorUserProfileId = debtorUserProfileId,
            CreditorUserProfileId = creditorUserProfileId,
            Amount = amount,
            Currency = "USD",
            Status = status,
            RequestedByUserProfileId = requestedByUserProfileId,
            RequestedAtUtc = requestedAtUtc,
            CreatedAtUtc = requestedAtUtc,
            UpdatedAtUtc = requestedAtUtc,
            ArchivedAtUtc = archivedAtUtc
        });

        await dbContext.SaveChangesAsync();
        return settlementId;
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

    private static async Task<ReadSideEffectCounts> ReadSideEffectCountsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new ReadSideEffectCounts(
            await dbContext.Set<SettlementRequest>().CountAsync(),
            await dbContext.Set<SettlementPayment>().CountAsync(),
            await dbContext.Set<SettlementProofAttachment>().CountAsync(),
            await dbContext.Set<FileObject>().CountAsync(),
            await dbContext.Set<UserPaymentProfile>().CountAsync(),
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

    private static string SettlementsPath()
    {
        return "/api/v1/settlements";
    }

    private static string SettlementPath(Guid settlementId)
    {
        return $"/api/v1/settlements/{settlementId:D}";
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

    private static void AssertSafeReadResponseContent(
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

    private static async Task AssertSettlementUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Settlement unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested settlement is unavailable.",
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
        Assert.DoesNotContain("merchant", lowerContent);
        Assert.DoesNotContain("paymenthandle", lowerContent);
        Assert.DoesNotContain("payment_handle", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
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
        SettlementRequestReadTestTimeProvider TimeProvider);

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

    private sealed record ReadSideEffectCounts(
        int SettlementRequestCount,
        int SettlementPaymentCount,
        int SettlementProofAttachmentCount,
        int FileObjectCount,
        int UserPaymentProfileCount,
        int NonSessionAuditEventCount);

    private sealed class SettlementRequestReadTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public SettlementRequestReadTestTimeProvider(DateTimeOffset utcNow)
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
