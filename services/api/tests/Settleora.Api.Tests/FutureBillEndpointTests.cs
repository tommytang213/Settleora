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
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.RecurringBills;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class FutureBillEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string FutureBillsPath = "/api/v1/future-bills";
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 16, 13, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 16, 13, 30, 0, TimeSpan.Zero);
    private readonly WebApplicationFactory<Program> factory;

    public FutureBillEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task CreateListAndGetPersonalFutureBillKeepsDraftNonSettlementEffective()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Actor");
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            FutureBillsPath,
            actor.RawSessionToken,
            CreatePersonalFutureBillJson("2026-06-20", "120.00"));

        using var createResponse = await client.SendAsync(createRequest);

        var createContent = await createResponse.Content.ReadAsStringAsync();
        Assert.True(createResponse.StatusCode == HttpStatusCode.Created, createContent);
        using var createPayload = JsonDocument.Parse(createContent);
        var root = createPayload.RootElement;
        var futureBillId = root.GetProperty("id").GetGuid();
        Assert.Equal($"/api/v1/future-bills/{futureBillId:D}", createResponse.Headers.Location?.OriginalString);
        Assert.Equal(actor.UserProfileId, root.GetProperty("ownerUserProfileId").GetGuid());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("groupId").ValueKind);
        Assert.Equal("Future Rent", root.GetProperty("merchantName").GetString());
        Assert.Equal("2026-06-20", root.GetProperty("dueDate").GetString());
        Assert.Equal(ExpenseBillStatuses.Draft, root.GetProperty("status").GetString());
        Assert.False(root.GetProperty("settlementEffective").GetBoolean());
        Assert.Equal("120", root.GetProperty("totalAmount").GetString());
        Assert.Equal("USD", root.GetProperty("totalCurrency").GetString());

        using var listRequest = CreateBearerRequest(HttpMethod.Get, FutureBillsPath, actor.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        using var listPayload = JsonDocument.Parse(await listResponse.Content.ReadAsStringAsync());
        Assert.Equal(futureBillId, Assert.Single(listPayload.RootElement.GetProperty("futureBills").EnumerateArray()).GetProperty("id").GetGuid());

        using var getRequest = CreateBearerRequest(HttpMethod.Get, $"{FutureBillsPath}/{futureBillId:D}", actor.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);

        using var candidatesRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/bills/{futureBillId:D}/settlement-candidates",
            actor.RawSessionToken);
        using var candidatesResponse = await client.SendAsync(candidatesRequest);
        Assert.Equal(HttpStatusCode.Conflict, candidatesResponse.StatusCode);

        var bill = await ReadBillAsync(testFactory, futureBillId);
        Assert.Equal(ExpenseBillStatuses.Draft, bill.Status);
        Assert.Equal(new DateOnly(2026, 6, 20), bill.BillDate);
        Assert.Null(bill.ArchivedAtUtc);
        Assert.Equal(120m, bill.TotalAmount);
    }

    [Fact]
    public async Task PostPersonalFutureBillConfirmsSelfOnlyBillThroughWorkflow()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Post Actor");
        using var client = testFactory.CreateClient();
        var futureBillId = await CreateFutureBillAsync(client, actor.RawSessionToken, CreatePersonalFutureBillJson("2026-06-20", "120.00"));

        using var draftCandidatesRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/bills/{futureBillId:D}/settlement-candidates",
            actor.RawSessionToken);
        using var draftCandidatesResponse = await client.SendAsync(draftCandidatesRequest);
        Assert.Equal(HttpStatusCode.Conflict, draftCandidatesResponse.StatusCode);

        using var postRequest = CreateBearerRequest(HttpMethod.Post, $"{FutureBillsPath}/{futureBillId:D}/post", actor.RawSessionToken);
        using var postResponse = await client.SendAsync(postRequest);

        var content = await postResponse.Content.ReadAsStringAsync();
        Assert.True(postResponse.StatusCode == HttpStatusCode.OK, content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(ExpenseBillStatuses.Confirmed, payload.RootElement.GetProperty("status").GetString());
        Assert.True(payload.RootElement.GetProperty("settlementEffective").GetBoolean());

        var bill = await ReadBillAsync(testFactory, futureBillId);
        Assert.Equal(ExpenseBillStatuses.Confirmed, bill.Status);
        var participant = Assert.Single(bill.Participants);
        Assert.Equal(actor.UserProfileId, participant.UserProfileId);
        Assert.Equal(ExpenseBillParticipantStatuses.Accepted, participant.Status);
        Assert.Equal(WriteTimestamp, participant.AcceptedAtUtc);
    }

    [Fact]
    public async Task PostGroupFutureBillSelfAcceptsActorAndLeavesOtherParticipantPending()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var owner = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Group Post Owner");
        var member = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Group Post Member");
        var groupId = await SeedGroupAsync(
            testFactory,
            owner.UserProfileId,
            new MembershipSeed(owner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(member.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        var futureBillId = await CreateFutureBillAsync(
            client,
            owner.RawSessionToken,
            CreateGroupFutureBillJson(groupId, owner.UserProfileId, member.UserProfileId));

        using var nonCreatorPostRequest = CreateBearerRequest(HttpMethod.Post, $"{FutureBillsPath}/{futureBillId:D}/post", member.RawSessionToken);
        using var nonCreatorPostResponse = await client.SendAsync(nonCreatorPostRequest);
        await AssertFutureBillUnavailableProblemAsync(nonCreatorPostResponse);

        using var postRequest = CreateBearerRequest(HttpMethod.Post, $"{FutureBillsPath}/{futureBillId:D}/post", owner.RawSessionToken);
        using var postResponse = await client.SendAsync(postRequest);

        var content = await postResponse.Content.ReadAsStringAsync();
        Assert.True(postResponse.StatusCode == HttpStatusCode.OK, content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(ExpenseBillStatuses.PendingConfirmation, payload.RootElement.GetProperty("status").GetString());
        Assert.False(payload.RootElement.GetProperty("settlementEffective").GetBoolean());

        var bill = await ReadBillAsync(testFactory, futureBillId);
        Assert.Equal(ExpenseBillStatuses.PendingConfirmation, bill.Status);
        Assert.Contains(
            bill.Participants,
            participant => participant.UserProfileId == owner.UserProfileId
                && participant.Status == ExpenseBillParticipantStatuses.Accepted
                && participant.AcceptedAtUtc == WriteTimestamp);
        Assert.Contains(
            bill.Participants,
            participant => participant.UserProfileId == member.UserProfileId
                && participant.Status == ExpenseBillParticipantStatuses.PendingAcceptance
                && participant.AcceptedAtUtc == null);

        using var candidatesRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/groups/{groupId:D}/bills/{futureBillId:D}/settlement-candidates",
            owner.RawSessionToken);
        using var candidatesResponse = await client.SendAsync(candidatesRequest);
        Assert.Equal(HttpStatusCode.Conflict, candidatesResponse.StatusCode);
    }

    [Fact]
    public async Task PostFutureBillRejectsCancelledAlreadyPostedAndUnavailableBills()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Invalid Post Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Invalid Post Other");
        using var client = testFactory.CreateClient();
        var cancelledFutureBillId = await CreateFutureBillAsync(client, actor.RawSessionToken, CreatePersonalFutureBillJson("2026-06-20", "120.00"));
        var postedFutureBillId = await CreateFutureBillAsync(client, actor.RawSessionToken, CreatePersonalFutureBillJson("2026-06-21", "80.00"));
        var otherFutureBillId = await CreateFutureBillAsync(client, other.RawSessionToken, CreatePersonalFutureBillJson("2026-06-22", "40.00"));

        using var cancelRequest = CreateBearerRequest(HttpMethod.Post, $"{FutureBillsPath}/{cancelledFutureBillId:D}/cancel", actor.RawSessionToken);
        using var cancelResponse = await client.SendAsync(cancelRequest);
        Assert.Equal(HttpStatusCode.OK, cancelResponse.StatusCode);

        using var postRequest = CreateBearerRequest(HttpMethod.Post, $"{FutureBillsPath}/{postedFutureBillId:D}/post", actor.RawSessionToken);
        using var postResponse = await client.SendAsync(postRequest);
        Assert.Equal(HttpStatusCode.OK, postResponse.StatusCode);

        using var cancelledPostRequest = CreateBearerRequest(HttpMethod.Post, $"{FutureBillsPath}/{cancelledFutureBillId:D}/post", actor.RawSessionToken);
        using var cancelledPostResponse = await client.SendAsync(cancelledPostRequest);
        await AssertFutureBillConflictProblemAsync(cancelledPostResponse);

        using var alreadyPostedRequest = CreateBearerRequest(HttpMethod.Post, $"{FutureBillsPath}/{postedFutureBillId:D}/post", actor.RawSessionToken);
        using var alreadyPostedResponse = await client.SendAsync(alreadyPostedRequest);
        await AssertFutureBillConflictProblemAsync(alreadyPostedResponse);

        using var unavailableRequest = CreateBearerRequest(HttpMethod.Post, $"{FutureBillsPath}/{otherFutureBillId:D}/post", actor.RawSessionToken);
        using var unavailableResponse = await client.SendAsync(unavailableRequest);
        await AssertFutureBillUnavailableProblemAsync(unavailableResponse);
    }

    [Fact]
    public async Task UpdateFutureBillChangesSupportedDraftFields()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Update Actor");
        using var client = testFactory.CreateClient();
        var futureBillId = await CreateFutureBillAsync(client, actor.RawSessionToken, CreatePersonalFutureBillJson("2026-06-20", "120.00"));

        using var updateRequest = CreateJsonRequest(
            HttpMethod.Patch,
            $"{FutureBillsPath}/{futureBillId:D}",
            actor.RawSessionToken,
            """
            {
              "merchantName": " Updated Future Rent ",
              "dueDate": "2026-07-01"
            }
            """);

        using var updateResponse = await client.SendAsync(updateRequest);

        var content = await updateResponse.Content.ReadAsStringAsync();
        Assert.True(updateResponse.StatusCode == HttpStatusCode.OK, content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Updated Future Rent", payload.RootElement.GetProperty("merchantName").GetString());
        Assert.Equal("2026-07-01", payload.RootElement.GetProperty("dueDate").GetString());
        Assert.Equal("120", payload.RootElement.GetProperty("totalAmount").GetString());
        Assert.False(payload.RootElement.GetProperty("settlementEffective").GetBoolean());
        var item = Assert.Single(payload.RootElement.GetProperty("billPayload").GetProperty("items").EnumerateArray());
        Assert.Equal("Rent", item.GetProperty("name").GetString());
    }

    [Fact]
    public async Task GroupFutureBillUpdateAndCancelRequireCreatorOrOwnerAuthority()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var owner = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Mutation Owner");
        var member = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Mutation Member");
        var groupId = await SeedGroupAsync(
            testFactory,
            owner.UserProfileId,
            new MembershipSeed(owner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(member.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        var futureBillId = await CreateFutureBillAsync(
            client,
            owner.RawSessionToken,
            CreateGroupFutureBillJson(groupId, owner.UserProfileId, member.UserProfileId));

        using var memberUpdateRequest = CreateJsonRequest(
            HttpMethod.Patch,
            $"{FutureBillsPath}/{futureBillId:D}",
            member.RawSessionToken,
            """
            {
              "merchantName": "Member overwrite",
              "dueDate": "2026-07-01"
            }
            """);
        using var memberUpdateResponse = await client.SendAsync(memberUpdateRequest);
        await AssertFutureBillUnavailableProblemAsync(memberUpdateResponse);

        using var memberCancelRequest = CreateBearerRequest(HttpMethod.Post, $"{FutureBillsPath}/{futureBillId:D}/cancel", member.RawSessionToken);
        using var memberCancelResponse = await client.SendAsync(memberCancelRequest);
        await AssertFutureBillUnavailableProblemAsync(memberCancelResponse);

        var bill = await ReadBillAsync(testFactory, futureBillId);
        Assert.Equal("Future Group Bill", bill.MerchantName);
        Assert.Equal(new DateOnly(2026, 6, 20), bill.BillDate);
        Assert.Equal(ExpenseBillStatuses.Draft, bill.Status);
        Assert.Null(bill.ArchivedAtUtc);
        var auditEvents = await ReadAuditEventsAsync(testFactory);
        Assert.Single(auditEvents, auditEvent => auditEvent.Action == "future_bill.created");
        Assert.DoesNotContain(auditEvents, auditEvent => auditEvent.Action == "future_bill.updated");
        Assert.DoesNotContain(auditEvents, auditEvent => auditEvent.Action == "future_bill.cancelled");
    }

    [Fact]
    public async Task CancelFutureBillArchivesDraftAndHidesItFromDefaultList()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Cancel Actor");
        using var client = testFactory.CreateClient();
        var futureBillId = await CreateFutureBillAsync(client, actor.RawSessionToken, CreatePersonalFutureBillJson("2026-06-20", "120.00"));

        using var cancelRequest = CreateBearerRequest(HttpMethod.Post, $"{FutureBillsPath}/{futureBillId:D}/cancel", actor.RawSessionToken);
        using var cancelResponse = await client.SendAsync(cancelRequest);

        Assert.Equal(HttpStatusCode.OK, cancelResponse.StatusCode);
        using var cancelPayload = JsonDocument.Parse(await cancelResponse.Content.ReadAsStringAsync());
        Assert.Equal(ExpenseBillStatuses.Cancelled, cancelPayload.RootElement.GetProperty("status").GetString());
        Assert.Equal(WriteTimestamp, cancelPayload.RootElement.GetProperty("archivedAtUtc").GetDateTimeOffset());
        Assert.False(cancelPayload.RootElement.GetProperty("settlementEffective").GetBoolean());

        using var listRequest = CreateBearerRequest(HttpMethod.Get, FutureBillsPath, actor.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        using var listPayload = JsonDocument.Parse(await listResponse.Content.ReadAsStringAsync());
        Assert.Empty(listPayload.RootElement.GetProperty("futureBills").EnumerateArray());
    }

    [Fact]
    public async Task NoBodyFutureBillActionsRejectSmuggledBodiesBeforeMutation()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Body Actor");
        using var client = testFactory.CreateClient();
        var postFutureBillId = await CreateFutureBillAsync(client, actor.RawSessionToken, CreatePersonalFutureBillJson("2026-06-20", "120.00"));
        var cancelFutureBillId = await CreateFutureBillAsync(client, actor.RawSessionToken, CreatePersonalFutureBillJson("2026-06-21", "80.00"));

        using var postRequest = CreateJsonRequest(
            HttpMethod.Post,
            $"{FutureBillsPath}/{postFutureBillId:D}/post",
            actor.RawSessionToken,
            """{ "futureBillId": "00000000-0000-0000-0000-000000000001", "userProfileId": "00000000-0000-0000-0000-000000000002" }""");
        using var postResponse = await client.SendAsync(postRequest);
        await AssertInvalidFutureBillNoBodyProblemAsync(postResponse);

        using var cancelRequest = CreateJsonRequest(
            HttpMethod.Post,
            $"{FutureBillsPath}/{cancelFutureBillId:D}/cancel",
            actor.RawSessionToken,
            """{ "futureBillId": "00000000-0000-0000-0000-000000000003", "ownerUserProfileId": "00000000-0000-0000-0000-000000000004" }""");
        using var cancelResponse = await client.SendAsync(cancelRequest);
        await AssertInvalidFutureBillNoBodyProblemAsync(cancelResponse);

        var postBill = await ReadBillAsync(testFactory, postFutureBillId);
        var cancelBill = await ReadBillAsync(testFactory, cancelFutureBillId);
        Assert.Equal(ExpenseBillStatuses.Draft, postBill.Status);
        Assert.Null(postBill.ArchivedAtUtc);
        Assert.Equal(ExpenseBillStatuses.Draft, cancelBill.Status);
        Assert.Null(cancelBill.ArchivedAtUtc);
        var auditActions = (await ReadAuditEventsAsync(testFactory)).Select(auditEvent => auditEvent.Action).ToArray();
        Assert.Equal(2, auditActions.Count(action => action == "future_bill.created"));
        Assert.DoesNotContain("bill.submitted", auditActions);
        Assert.DoesNotContain("future_bill.cancelled", auditActions);
    }

    [Fact]
    public async Task ListAndReadRejectUnsupportedQueryAndGetBodiesBeforeProtectedReadsOrSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Envelope Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Envelope Other");
        using var client = testFactory.CreateClient();
        var visibleFutureBillId = await CreateFutureBillAsync(
            client,
            actor.RawSessionToken,
            CreatePersonalFutureBillJson("2026-06-20", "120.00"));
        var hiddenFutureBillId = await CreateFutureBillAsync(
            client,
            other.RawSessionToken,
            CreatePersonalFutureBillJson("2026-06-22", "40.00"));
        var beforeCounts = await CountProtectedRowsAsync(testFactory);
        var unsupportedQuery = string.Join(
            '&',
            $"futureBillId={hiddenFutureBillId:D}",
            $"billId={Guid.NewGuid():D}",
            $"ownerUserProfileId={other.UserProfileId:D}",
            $"createdByUserProfileId={other.UserProfileId:D}",
            $"groupId={Guid.NewGuid():D}",
            $"settlementId={Guid.NewGuid():D}",
            $"paymentId={Guid.NewGuid():D}",
            $"fileId={Guid.NewGuid():D}",
            "merchantName=Hidden Future Envelope Merchant",
            "selector=Hidden Future Envelope Selector");

        using (var listRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{FutureBillsPath}?{unsupportedQuery}",
            actor.RawSessionToken))
        using (var listResponse = await client.SendAsync(listRequest))
        {
            var content = await listResponse.Content.ReadAsStringAsync();
            await AssertInvalidFutureBillRequestProblemAsync(listResponse, content);
            Assert.Contains("Unsupported query fields are not allowed.", content);
            AssertValidationResponseIsBounded(content, hiddenFutureBillId, other.UserProfileId, "Hidden Future Envelope");
            Assert.DoesNotContain(visibleFutureBillId.ToString("D"), content);
            Assert.DoesNotContain("Future Rent", content);
        }

        using (var readRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{FutureBillsPath}/{visibleFutureBillId:D}?{unsupportedQuery}",
            actor.RawSessionToken))
        using (var readResponse = await client.SendAsync(readRequest))
        {
            var content = await readResponse.Content.ReadAsStringAsync();
            await AssertInvalidFutureBillRequestProblemAsync(readResponse, content);
            Assert.Contains("Unsupported query fields are not allowed.", content);
            AssertValidationResponseIsBounded(content, hiddenFutureBillId, other.UserProfileId, "Hidden Future Envelope");
            Assert.DoesNotContain(visibleFutureBillId.ToString("D"), content);
            Assert.DoesNotContain("Future Rent", content);
        }

        var body = JsonSerializer.Serialize(new
        {
            futureBillId = hiddenFutureBillId,
            ownerUserProfileId = other.UserProfileId,
            billId = Guid.NewGuid(),
            settlementId = Guid.NewGuid(),
            paymentId = Guid.NewGuid(),
            fileId = Guid.NewGuid(),
            merchantName = "Hidden Future Envelope Merchant"
        });

        using (var listBodyRequest = CreateJsonRequest(
            HttpMethod.Get,
            $"{FutureBillsPath}?status={ExpenseBillStatuses.Draft}",
            actor.RawSessionToken,
            body))
        using (var listBodyResponse = await client.SendAsync(listBodyRequest))
        {
            var content = await listBodyResponse.Content.ReadAsStringAsync();
            await AssertInvalidFutureBillRequestProblemAsync(listBodyResponse, content);
            Assert.Contains("Future bill list requests do not accept a body.", content);
            AssertValidationResponseIsBounded(content, hiddenFutureBillId, other.UserProfileId, "Hidden Future Envelope");
            Assert.DoesNotContain(visibleFutureBillId.ToString("D"), content);
            Assert.DoesNotContain("Future Rent", content);
        }

        using (var readBodyRequest = CreateJsonRequest(
            HttpMethod.Get,
            $"{FutureBillsPath}/{visibleFutureBillId:D}",
            actor.RawSessionToken,
            body))
        using (var readBodyResponse = await client.SendAsync(readBodyRequest))
        {
            var content = await readBodyResponse.Content.ReadAsStringAsync();
            await AssertInvalidFutureBillRequestProblemAsync(readBodyResponse, content);
            Assert.Contains("Future bill read requests do not accept a body.", content);
            AssertValidationResponseIsBounded(content, hiddenFutureBillId, other.UserProfileId, "Hidden Future Envelope");
            Assert.DoesNotContain(visibleFutureBillId.ToString("D"), content);
            Assert.DoesNotContain("Future Rent", content);
        }

        Assert.Equal(beforeCounts, await CountProtectedRowsAsync(testFactory));
    }

    [Fact]
    public async Task ListRejectsDuplicateAndInvalidSupportedQueryValuesWithoutRawEchoOrReads()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Filter Actor");
        using var client = testFactory.CreateClient();
        var visibleFutureBillId = await CreateFutureBillAsync(
            client,
            actor.RawSessionToken,
            CreatePersonalFutureBillJson("2026-06-20", "120.00"));
        var beforeCounts = await CountProtectedRowsAsync(testFactory);

        using (var duplicateRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{FutureBillsPath}?status={ExpenseBillStatuses.Draft}&status={ExpenseBillStatuses.Cancelled}&groupId={Guid.NewGuid():D}&groupId={Guid.NewGuid():D}&fromDate=2026-06-01&fromDate=2026-06-02&toDate=2026-06-30&toDate=2026-07-01&includeArchived=true&includeArchived=false",
            actor.RawSessionToken))
        using (var duplicateResponse = await client.SendAsync(duplicateRequest))
        {
            var content = await duplicateResponse.Content.ReadAsStringAsync();
            await AssertInvalidFutureBillRequestProblemAsync(duplicateResponse, content);
            Assert.Contains("\"status\":[\"Only one value is supported.\"]", content);
            Assert.Contains("\"groupId\":[\"Only one value is supported.\"]", content);
            Assert.Contains("\"fromDate\":[\"Only one value is supported.\"]", content);
            Assert.Contains("\"toDate\":[\"Only one value is supported.\"]", content);
            Assert.Contains("\"includeArchived\":[\"Only one value is supported.\"]", content);
            Assert.DoesNotContain(ExpenseBillStatuses.Draft, content);
            Assert.DoesNotContain(ExpenseBillStatuses.Cancelled, content);
            Assert.DoesNotContain(visibleFutureBillId.ToString("D"), content);
            Assert.DoesNotContain("Future Rent", content);
        }

        using (var invalidRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{FutureBillsPath}?status=posted&groupId=not-a-guid&fromDate=2026-99-01&toDate=not-a-date&includeArchived=yes",
            actor.RawSessionToken))
        using (var invalidResponse = await client.SendAsync(invalidRequest))
        {
            var content = await invalidResponse.Content.ReadAsStringAsync();
            await AssertInvalidFutureBillRequestProblemAsync(invalidResponse, content);
            Assert.Contains("Future bill status is not supported.", content);
            Assert.Contains("groupId must be a valid non-empty GUID.", content);
            Assert.Contains("fromDate must be a yyyy-MM-dd date string.", content);
            Assert.Contains("toDate must be a yyyy-MM-dd date string.", content);
            Assert.Contains("includeArchived must be true or false.", content);
            Assert.DoesNotContain("posted", content);
            Assert.DoesNotContain("not-a-guid", content);
            Assert.DoesNotContain("2026-99-01", content);
            Assert.DoesNotContain("not-a-date", content);
            Assert.DoesNotContain(visibleFutureBillId.ToString("D"), content);
            Assert.DoesNotContain("Future Rent", content);
        }

        Assert.Equal(beforeCounts, await CountProtectedRowsAsync(testFactory));
    }

    [Fact]
    public async Task CreateRejectsInvalidCurrencyAndDueDate()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Invalid Actor");
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            FutureBillsPath,
            actor.RawSessionToken,
            """
            {
              "dueDate": "2026-05-16",
              "billPayload": {
                "currency": "usd",
                "items": [
                  { "name": "Bad", "amount": "1.00" }
                ]
              }
            }
            """);

        using var response = await client.SendAsync(request);

        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Due date must be in the future.", content);
        Assert.Contains("Currency", content);
    }

    [Fact]
    public async Task CreateRejectsInvalidMoney()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Invalid Money Actor");
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            FutureBillsPath,
            actor.RawSessionToken,
            """
            {
              "dueDate": "2026-06-20",
              "billPayload": {
                "currency": "USD",
                "items": [
                  { "name": "Bad", "amount": "-1.00" }
                ]
              }
            }
            """);

        using var response = await client.SendAsync(request);

        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Negative amount is not allowed for this operation.", content);
    }

    [Fact]
    public async Task GroupFutureBillRejectsNonMemberReferencedParticipant()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var owner = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Group Owner");
        var member = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Group Member");
        var outsider = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Future Group Outsider");
        var groupId = await SeedGroupAsync(
            testFactory,
            owner.UserProfileId,
            new MembershipSeed(owner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(member.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            FutureBillsPath,
            member.RawSessionToken,
            CreateGroupFutureBillJson(groupId, member.UserProfileId, outsider.UserProfileId));

        using var response = await client.SendAsync(request);

        await AssertFutureBillUnavailableProblemAsync(response);
        Assert.Empty(await ReadBillsAsync(testFactory));
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new EndpointTestTimeProvider(InitialTimestamp);
        var testFactory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<SettleoraDbContext>();
                services.RemoveAll<DbContextOptions>();
                services.RemoveAll<DbContextOptions<SettleoraDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<SettleoraDbContext>>();
                services.AddDbContext<SettleoraDbContext>(options => options.UseInMemoryDatabase(databaseName));
                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(timeProvider);
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<Guid> CreateFutureBillAsync(HttpClient client, string rawSessionToken, string json)
    {
        using var request = CreateJsonRequest(HttpMethod.Post, FutureBillsPath, rawSessionToken, json);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Created, content);
        using var payload = JsonDocument.Parse(content);
        return payload.RootElement.GetProperty("id").GetGuid();
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        EndpointTestTimeProvider timeProvider,
        string displayName)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();
        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
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
        dbContext.Set<SystemRoleAssignment>().Add(new SystemRoleAssignment
        {
            AuthAccountId = authAccountId,
            Role = SystemRoles.User,
            AssignedAtUtc = InitialTimestamp
        });
        await dbContext.SaveChangesAsync();

        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                authAccountId,
                DeviceLabel: "Future bill endpoint test",
                UserAgentSummary: "Future bill endpoint test",
                NetworkAddressHash: $"future-bill-{userProfileId:N}",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        timeProvider.SetUtcNow(WriteTimestamp);
        return new SeededSession(authAccountId, userProfileId, sessionCreationResult.RawSessionToken!);
    }

    private static async Task<Guid> SeedGroupAsync(
        WebApplicationFactory<Program> testFactory,
        Guid createdByUserProfileId,
        params MembershipSeed[] memberships)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var groupId = Guid.NewGuid();
        dbContext.Set<UserGroup>().Add(new UserGroup
        {
            Id = groupId,
            Name = "Future group",
            CreatedByUserProfileId = createdByUserProfileId,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });

        foreach (var membership in memberships)
        {
            dbContext.Set<GroupMembership>().Add(new GroupMembership
            {
                GroupId = groupId,
                UserProfileId = membership.UserProfileId,
                Role = membership.Role,
                Status = membership.Status,
                CreatedAtUtc = InitialTimestamp,
                UpdatedAtUtc = InitialTimestamp
            });
        }

        await dbContext.SaveChangesAsync();
        return groupId;
    }

    private static string CreatePersonalFutureBillJson(string dueDate, string amount)
    {
        return JsonSerializer.Serialize(new
        {
            merchantName = " Future Rent ",
            dueDate,
            billPayload = new
            {
                currency = "USD",
                items = new[]
                {
                    new { name = "Rent", amount }
                }
            }
        });
    }

    private static string CreateGroupFutureBillJson(Guid groupId, Guid actorUserProfileId, Guid otherUserProfileId)
    {
        return JsonSerializer.Serialize(new
        {
            groupId,
            merchantName = "Future Group Bill",
            dueDate = "2026-06-20",
            billPayload = new
            {
                currency = "USD",
                items = new[]
                {
                    new
                    {
                        name = "Power",
                        amount = "120.00",
                        splits = new[]
                        {
                            new
                            {
                                userProfileId = actorUserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "60.00",
                                allocationOrder = 0
                            },
                            new
                            {
                                userProfileId = otherUserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "60.00",
                                allocationOrder = 1
                            }
                        }
                    }
                }
            }
        });
    }

    private static async Task<ExpenseBill> ReadBillAsync(WebApplicationFactory<Program> testFactory, Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<ExpenseBill>()
            .Include(bill => bill.Items)
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .SingleAsync(bill => bill.Id == billId);
    }

    private static async Task<IReadOnlyList<ExpenseBill>> ReadBillsAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<ExpenseBill>()
            .ToListAsync();
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadAuditEventsAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<AuthAuditEvent>()
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Action)
            .ToListAsync();
    }

    private static async Task<ProtectedRowCounts> CountProtectedRowsAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        return new ProtectedRowCounts(
            await dbContext.Set<ExpenseBill>().CountAsync(),
            await dbContext.Set<ExpenseBillItem>().CountAsync(),
            await dbContext.Set<ExpenseBillItemSplit>().CountAsync(),
            await dbContext.Set<ExpenseBillParticipant>().CountAsync(),
            await dbContext.Set<ExpenseBillPayer>().CountAsync(),
            await dbContext.Set<ExpenseBillAdjustment>().CountAsync(),
            await dbContext.Set<ReceiptOcrReview>().CountAsync(),
            await dbContext.Set<ReceiptOcrReviewLine>().CountAsync(),
            await dbContext.Set<RecurringBillTemplate>().CountAsync(),
            await dbContext.Set<RecurringBillOccurrence>().CountAsync(),
            await dbContext.Set<SettlementRequest>().CountAsync(),
            await dbContext.Set<SettlementRequestLine>().CountAsync(),
            await dbContext.Set<SettlementPayment>().CountAsync(),
            await dbContext.Set<SettlementPaymentAllocation>().CountAsync(),
            await dbContext.Set<SettlementResidual>().CountAsync(),
            await dbContext.Set<FileObject>().CountAsync(),
            await dbContext.Set<AuthAuditEvent>()
                .CountAsync(auditEvent => auditEvent.Action.StartsWith("future_bill.", StringComparison.Ordinal)
                    || auditEvent.Action == "bill.submitted"));
    }

    private static HttpRequestMessage CreateBearerRequest(HttpMethod method, string path, string rawSessionToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");
        return request;
    }

    private static HttpRequestMessage CreateJsonRequest(HttpMethod method, string path, string rawSessionToken, string json)
    {
        var request = CreateBearerRequest(method, path, rawSessionToken);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        return request;
    }

    private static async Task AssertFutureBillUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("\"title\":\"Future bill unavailable\"", content);
    }

    private static async Task AssertFutureBillConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("\"title\":\"Future bill conflict\"", content);
    }

    private static async Task AssertInvalidFutureBillNoBodyProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("\"title\":\"Invalid future bill request\"", content);
        Assert.Contains("does not accept a request body", content);
    }

    private static Task AssertInvalidFutureBillRequestProblemAsync(HttpResponseMessage response, string content)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("\"title\":\"Invalid future bill request\"", content);
        return Task.CompletedTask;
    }

    private static void AssertValidationResponseIsBounded(
        string content,
        Guid hiddenFutureBillId,
        Guid hiddenUserProfileId,
        string hiddenTextPrefix)
    {
        Assert.DoesNotContain(hiddenFutureBillId.ToString("D"), content);
        Assert.DoesNotContain(hiddenUserProfileId.ToString("D"), content);
        Assert.DoesNotContain(hiddenTextPrefix, content);
    }

    private sealed record FactoryTestContext(WebApplicationFactory<Program> Factory, EndpointTestTimeProvider TimeProvider);

    private sealed record SeededSession(Guid AuthAccountId, Guid UserProfileId, string RawSessionToken);

    private sealed record MembershipSeed(Guid UserProfileId, string Role, string Status);

    private sealed record ProtectedRowCounts(
        int Bills,
        int BillItems,
        int BillItemSplits,
        int BillParticipants,
        int BillPayers,
        int BillAdjustments,
        int ReceiptOcrReviews,
        int ReceiptOcrReviewLines,
        int RecurringTemplates,
        int RecurringOccurrences,
        int SettlementRequests,
        int SettlementRequestLines,
        int SettlementPayments,
        int SettlementPaymentAllocations,
        int SettlementResiduals,
        int FileObjects,
        int AuditEvents);

    private sealed class EndpointTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public EndpointTestTimeProvider(DateTimeOffset utcNow)
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
