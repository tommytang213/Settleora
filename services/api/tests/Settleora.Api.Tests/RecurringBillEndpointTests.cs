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
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.RecurringBills;
using Settleora.Api.Domain.Users;
using Settleora.Api.Expenses.RecurringBills;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class RecurringBillEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string RecurringBillsPath = "/api/v1/recurring-bills";
    private const string WrongRawToken = "visible-wrong-recurring-bill-session-token";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 16, 13, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 16, 13, 30, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset LaterTimestamp = new(2026, 5, 16, 13, 45, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public RecurringBillEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task CreateListAndGetPersonalRecurringTemplateUsesCurrentActorAndSafeAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal Recurring Actor");
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            RecurringBillsPath,
            actor.RawSessionToken,
            """
            {
              "merchantName": "  Rent House  ",
              "description": "  Keep this out of audit  ",
              "schedule": {
                "type": "monthly",
                "intervalCount": 1,
                "startDate": "2026-06-01",
                "dueOffsetDays": 5
              },
              "billPayload": {
                "currency": "USD",
                "items": [
                  {
                    "name": "  Monthly Rent  ",
                    "note": "  Sensitive note  ",
                    "amount": "100.00"
                  }
                ]
              }
            }
            """);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var root = payload.RootElement;
        var templateId = root.GetProperty("id").GetGuid();
        Assert.Equal($"/api/v1/recurring-bills/{templateId:D}", response.Headers.Location?.OriginalString);
        Assert.Equal(actor.UserProfileId, root.GetProperty("ownerUserProfileId").GetGuid());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("groupId").ValueKind);
        Assert.Equal("Rent House", root.GetProperty("merchantName").GetString());
        Assert.Equal("Keep this out of audit", root.GetProperty("description").GetString());
        Assert.Equal(RecurringBillTemplateStatuses.Active, root.GetProperty("status").GetString());
        Assert.Equal("100", root.GetProperty("forecastAmount").GetString());
        Assert.Equal("USD", root.GetProperty("forecastCurrency").GetString());
        Assert.Equal("2026-06-01", root.GetProperty("nextOccurrenceDate").GetString());

        using var listRequest = CreateBearerRequest(HttpMethod.Get, RecurringBillsPath, actor.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        using var listPayload = JsonDocument.Parse(await listResponse.Content.ReadAsStringAsync());
        var listedTemplate = Assert.Single(listPayload.RootElement.GetProperty("templates").EnumerateArray());
        Assert.Equal(templateId, listedTemplate.GetProperty("id").GetGuid());

        using var getRequest = CreateBearerRequest(HttpMethod.Get, $"{RecurringBillsPath}/{templateId:D}", actor.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        using var getPayload = JsonDocument.Parse(await getResponse.Content.ReadAsStringAsync());
        var editablePayload = getPayload.RootElement.GetProperty("billPayload");
        Assert.Equal("USD", editablePayload.GetProperty("currency").GetString());
        var editableItem = Assert.Single(editablePayload.GetProperty("items").EnumerateArray());
        Assert.Equal("Monthly Rent", editableItem.GetProperty("name").GetString());
        Assert.Equal("Sensitive note", editableItem.GetProperty("note").GetString());
        Assert.Equal("100", editableItem.GetProperty("amount").GetString());
        Assert.Equal("USD", editableItem.GetProperty("currency").GetString());
        Assert.Empty(editableItem.GetProperty("splits").EnumerateArray());
        Assert.Empty(editablePayload.GetProperty("adjustments").EnumerateArray());
        Assert.Empty(editablePayload.GetProperty("payers").EnumerateArray());

        var template = await ReadTemplateAsync(testFactory, templateId);
        Assert.Null(template.GroupId);
        Assert.Equal(actor.UserProfileId, template.OwnerUserProfileId);
        Assert.Equal(RecurringBillScheduleTypes.Monthly, template.ScheduleType);
        Assert.Equal(1, template.IntervalCount);
        Assert.Null(template.IntervalDays);
        Assert.Equal("USD", template.ForecastCurrency);

        var auditEvent = await AssertSingleAuditEventAsync(testFactory, "recurring_bill.template_created");
        Assert.Equal(actor.AuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.DoesNotContain(actor.RawSessionToken, auditEvent.SafeMetadataJson);
        Assert.DoesNotContain("Rent House", auditEvent.SafeMetadataJson);
        Assert.DoesNotContain("Monthly Rent", auditEvent.SafeMetadataJson);
        Assert.DoesNotContain("Sensitive note", auditEvent.SafeMetadataJson);
        Assert.DoesNotContain("Keep this out of audit", auditEvent.SafeMetadataJson);
    }

    [Fact]
    public async Task GroupRecurringTemplateCreateListAndGetRequireActiveMembership()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var owner = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Owner");
        var member = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Member");
        var outsider = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Outsider");
        var groupId = await SeedGroupAsync(
            testFactory,
            owner.UserProfileId,
            "Household",
            new MembershipSeed(owner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(member.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            RecurringBillsPath,
            member.RawSessionToken,
            CreateGroupTemplateJson(groupId, member.UserProfileId, owner.UserProfileId));

        using var createResponse = await client.SendAsync(createRequest);

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var createPayload = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var templateId = createPayload.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(groupId, createPayload.RootElement.GetProperty("groupId").GetGuid());
        Assert.Equal(member.UserProfileId, createPayload.RootElement.GetProperty("ownerUserProfileId").GetGuid());

        using var memberListRequest = CreateBearerRequest(HttpMethod.Get, RecurringBillsPath, member.RawSessionToken);
        using var memberListResponse = await client.SendAsync(memberListRequest);
        Assert.Equal(HttpStatusCode.OK, memberListResponse.StatusCode);
        using var memberListPayload = JsonDocument.Parse(await memberListResponse.Content.ReadAsStringAsync());
        Assert.Equal(templateId, Assert.Single(memberListPayload.RootElement.GetProperty("templates").EnumerateArray()).GetProperty("id").GetGuid());

        using var ownerGetRequest = CreateBearerRequest(HttpMethod.Get, $"{RecurringBillsPath}/{templateId:D}", owner.RawSessionToken);
        using var ownerGetResponse = await client.SendAsync(ownerGetRequest);
        Assert.Equal(HttpStatusCode.OK, ownerGetResponse.StatusCode);

        using var outsiderGetRequest = CreateBearerRequest(HttpMethod.Get, $"{RecurringBillsPath}/{templateId:D}", outsider.RawSessionToken);
        using var outsiderGetResponse = await client.SendAsync(outsiderGetRequest);
        await AssertRecurringBillUnavailableProblemAsync(outsiderGetResponse);
    }

    [Fact]
    public async Task UpdateGroupRecurringTemplatePayloadPersistsSafeEditableFields()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var owner = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Update Group Owner");
        var member = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Update Group Member");
        var groupId = await SeedGroupAsync(
            testFactory,
            owner.UserProfileId,
            "Update Group",
            new MembershipSeed(owner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(member.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var templateId = await SeedGroupTemplateAsync(
            testFactory,
            owner.UserProfileId,
            groupId,
            "Old Group Template",
            [owner.UserProfileId, member.UserProfileId]);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Patch,
            $"{RecurringBillsPath}/{templateId:D}",
            member.RawSessionToken,
            CreateGroupTemplatePatchJson(owner.UserProfileId, member.UserProfileId));

        using var response = await client.SendAsync(request);

        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, content);
        using var responsePayload = JsonDocument.Parse(content);
        var root = responsePayload.RootElement;
        Assert.Equal("Updated Internet", root.GetProperty("merchantName").GetString());
        Assert.Equal("200", root.GetProperty("forecastAmount").GetString());
        Assert.Equal("USD", root.GetProperty("forecastCurrency").GetString());
        var billPayload = root.GetProperty("billPayload");
        Assert.Equal("USD", billPayload.GetProperty("currency").GetString());
        var item = Assert.Single(billPayload.GetProperty("items").EnumerateArray());
        Assert.Equal("Fiber Internet", item.GetProperty("name").GetString());
        Assert.Equal("Shared plan", item.GetProperty("note").GetString());
        Assert.Equal("200", item.GetProperty("amount").GetString());
        var splits = item.GetProperty("splits").EnumerateArray().ToArray();
        Assert.Equal(2, splits.Length);
        Assert.Equal(owner.UserProfileId, splits[0].GetProperty("userProfileId").GetGuid());
        Assert.Equal("120", splits[0].GetProperty("basisValue").GetString());
        Assert.Equal(member.UserProfileId, splits[1].GetProperty("userProfileId").GetGuid());
        Assert.Equal("80", splits[1].GetProperty("basisValue").GetString());

        var template = await ReadTemplateAsync(testFactory, templateId);
        Assert.Equal("Updated Internet", template.MerchantName);
        Assert.Equal(200m, template.ForecastAmount);
        var storedPayload = RecurringBillTemplatePayloadCodec.Deserialize(template.PayloadJson);
        Assert.NotNull(storedPayload);
        Assert.Equal("Fiber Internet", Assert.Single(storedPayload.Items).Name);
        Assert.Equal([owner.UserProfileId, member.UserProfileId], storedPayload.Items[0].Splits.Select(split => split.UserProfileId).ToArray());

        var auditEvent = await AssertSingleAuditEventAsync(testFactory, "recurring_bill.template_updated");
        Assert.DoesNotContain("Fiber Internet", auditEvent.SafeMetadataJson);
        Assert.DoesNotContain("Shared plan", auditEvent.SafeMetadataJson);
    }

    [Fact]
    public async Task UpdateRejectsUnsupportedPayloadFieldsWithoutOverwritingTemplate()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Unsafe Payload Actor");
        var templateId = await SeedTemplateAsync(testFactory, actor.UserProfileId, groupId: null, "Safe Template");
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Patch,
            $"{RecurringBillsPath}/{templateId:D}",
            actor.RawSessionToken,
            """
            {
              "billPayload": {
                "currency": "USD",
                "rawPayloadJson": { "serverOwned": true },
                "items": [{ "name": "Unsafe overwrite", "amount": "999.00" }]
              }
            }
            """);

        using var response = await client.SendAsync(request);

        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Unsupported fields are not allowed.", content);
        var template = await ReadTemplateAsync(testFactory, templateId);
        Assert.Equal("Safe Template", template.MerchantName);
        Assert.Equal(100m, template.ForecastAmount);
        Assert.DoesNotContain("Unsafe overwrite", template.PayloadJson);
    }

    [Fact]
    public async Task MissingInvalidCrossUserAndRemovedMemberAccessFailSafely()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Access Owner");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Access Other");
        var removed = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Removed Member");
        var groupId = await SeedGroupAsync(
            testFactory,
            actor.UserProfileId,
            "Removed Group",
            new MembershipSeed(actor.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(removed.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        var personalTemplateId = await SeedTemplateAsync(testFactory, actor.UserProfileId, groupId: null, "Personal Hidden");
        var groupTemplateId = await SeedTemplateAsync(testFactory, actor.UserProfileId, groupId, "Group Hidden");
        using var client = testFactory.CreateClient();

        using var missingResponse = await client.GetAsync(RecurringBillsPath);
        await AssertUnauthenticatedProblemAsync(missingResponse);

        using var invalidRequest = CreateBearerRequest(HttpMethod.Get, RecurringBillsPath, WrongRawToken);
        using var invalidResponse = await client.SendAsync(invalidRequest);
        await AssertUnauthenticatedProblemAsync(invalidResponse, WrongRawToken);

        using var crossUserRequest = CreateBearerRequest(HttpMethod.Get, $"{RecurringBillsPath}/{personalTemplateId:D}", other.RawSessionToken);
        using var crossUserResponse = await client.SendAsync(crossUserRequest);
        await AssertRecurringBillUnavailableProblemAsync(crossUserResponse);

        using var removedMemberRequest = CreateBearerRequest(HttpMethod.Get, $"{RecurringBillsPath}/{groupTemplateId:D}", removed.RawSessionToken);
        using var removedMemberResponse = await client.SendAsync(removedMemberRequest);
        await AssertRecurringBillUnavailableProblemAsync(removedMemberResponse);

        using var removedMemberPatchRequest = CreateJsonRequest(
            HttpMethod.Patch,
            $"{RecurringBillsPath}/{groupTemplateId:D}",
            removed.RawSessionToken,
            """
            {
              "billPayload": {
                "currency": "USD",
                "items": [{ "name": "Removed member edit", "amount": "200.00" }]
              }
            }
            """);
        using var removedMemberPatchResponse = await client.SendAsync(removedMemberPatchRequest);
        await AssertRecurringBillUnavailableProblemAsync(removedMemberPatchResponse);
    }

    [Fact]
    public async Task BadScheduleValidationDoesNotCreateTemplate()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Bad Schedule Actor");
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            RecurringBillsPath,
            actor.RawSessionToken,
            """
            {
              "schedule": {
                "type": "monthly",
                "intervalCount": 0,
                "startDate": "2026-06-01",
                "endDate": "2026-05-01"
              },
              "billPayload": {
                "currency": "USD",
                "items": [{ "name": "Rent", "amount": "100.00" }]
              }
            }
            """);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("schedule.intervalCount", content);
        Assert.Contains("schedule.endDate", content);
        Assert.Empty(await ReadTemplatesAsync(testFactory));
    }

    [Fact]
    public async Task ForecastReturnsBoundedOccurrencesWithoutCreatingBillsOrOccurrenceRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Forecast Actor");
        await SeedTemplateAsync(
            testFactory,
            actor.UserProfileId,
            groupId: null,
            merchantName: "Weekly Forecast",
            scheduleType: RecurringBillScheduleTypes.Weekly,
            intervalCount: 1,
            startDate: new DateOnly(2026, 6, 1));
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            $"{RecurringBillsPath}/forecast?fromDate=2026-06-01&toDate=2026-12-31&limit=3",
            actor.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var occurrences = payload.RootElement.GetProperty("occurrences").EnumerateArray().ToArray();
        Assert.Equal(3, occurrences.Length);
        Assert.Equal(
            ["2026-06-01", "2026-06-08", "2026-06-15"],
            occurrences.Select(occurrence => occurrence.GetProperty("occurrenceDate").GetString()!).ToArray());
        Assert.All(occurrences, occurrence =>
        {
            Assert.Equal(RecurringBillOccurrenceStatuses.Forecasted, occurrence.GetProperty("status").GetString());
            Assert.False(occurrence.GetProperty("draftGenerated").GetBoolean());
            Assert.Equal("USD", occurrence.GetProperty("forecastCurrency").GetString());
        });
        Assert.Empty(await ReadBillsAsync(testFactory));
        Assert.Empty(await ReadOccurrencesAsync(testFactory));
    }

    [Fact]
    public async Task PauseResumeArchiveAndGenerationConflictsUseBoundedState()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "State Actor");
        var templateId = await SeedTemplateAsync(testFactory, actor.UserProfileId, groupId: null, "State Template");
        using var client = testFactory.CreateClient();

        using var pauseRequest = CreateBearerRequest(HttpMethod.Post, $"{RecurringBillsPath}/{templateId:D}/pause", actor.RawSessionToken);
        using var pauseResponse = await client.SendAsync(pauseRequest);
        Assert.Equal(HttpStatusCode.OK, pauseResponse.StatusCode);
        using var pausedGenerateRequest = CreateBearerRequest(HttpMethod.Post, $"{RecurringBillsPath}/{templateId:D}/occurrences/2026-06-01/generate-draft", actor.RawSessionToken);
        using var pausedGenerateResponse = await client.SendAsync(pausedGenerateRequest);
        await AssertRecurringBillConflictProblemAsync(pausedGenerateResponse);

        using var resumeRequest = CreateBearerRequest(HttpMethod.Post, $"{RecurringBillsPath}/{templateId:D}/resume", actor.RawSessionToken);
        using var resumeResponse = await client.SendAsync(resumeRequest);
        Assert.Equal(HttpStatusCode.OK, resumeResponse.StatusCode);

        using var archiveRequest = CreateBearerRequest(HttpMethod.Post, $"{RecurringBillsPath}/{templateId:D}/archive", actor.RawSessionToken);
        using var archiveResponse = await client.SendAsync(archiveRequest);
        Assert.Equal(HttpStatusCode.OK, archiveResponse.StatusCode);
        using var archivedGenerateRequest = CreateBearerRequest(HttpMethod.Post, $"{RecurringBillsPath}/{templateId:D}/occurrences/2026-06-01/generate-draft", actor.RawSessionToken);
        using var archivedGenerateResponse = await client.SendAsync(archivedGenerateRequest);
        await AssertRecurringBillConflictProblemAsync(archivedGenerateResponse);

        var auditActions = (await ReadAuditEventsAsync(testFactory))
            .Select(auditEvent => auditEvent.Action)
            .ToArray();
        Assert.Contains("recurring_bill.template_paused", auditActions);
        Assert.Contains("recurring_bill.template_resumed", auditActions);
        Assert.Contains("recurring_bill.template_archived", auditActions);
    }

    [Fact]
    public async Task NoBodyRecurringActionsRejectSmuggledBodiesBeforeMutationOrAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Recurring Body Actor");
        var lifecycleTemplateId = await SeedTemplateAsync(testFactory, actor.UserProfileId, groupId: null, "Lifecycle Body Template");
        var generationTemplateId = await SeedTemplateAsync(testFactory, actor.UserProfileId, groupId: null, "Generation Body Template");
        using var client = testFactory.CreateClient();

        using var pauseRequest = CreateJsonRequest(
            HttpMethod.Post,
            $"{RecurringBillsPath}/{lifecycleTemplateId:D}/pause",
            actor.RawSessionToken,
            """{ "templateId": "00000000-0000-0000-0000-000000000001", "ownerUserProfileId": "00000000-0000-0000-0000-000000000002" }""");
        using var pauseResponse = await client.SendAsync(pauseRequest);
        await AssertInvalidRecurringBillNoBodyProblemAsync(pauseResponse);

        using var generateRequest = CreateJsonRequest(
            HttpMethod.Post,
            $"{RecurringBillsPath}/{generationTemplateId:D}/occurrences/2026-06-01/generate-draft",
            actor.RawSessionToken,
            """{ "templateId": "00000000-0000-0000-0000-000000000003", "billId": "00000000-0000-0000-0000-000000000004" }""");
        using var generateResponse = await client.SendAsync(generateRequest);
        await AssertInvalidRecurringBillNoBodyProblemAsync(generateResponse);

        Assert.Equal(RecurringBillTemplateStatuses.Active, (await ReadTemplateAsync(testFactory, lifecycleTemplateId)).Status);
        Assert.Equal(RecurringBillTemplateStatuses.Active, (await ReadTemplateAsync(testFactory, generationTemplateId)).Status);
        Assert.Empty(await ReadBillsAsync(testFactory));
        Assert.Empty(await ReadOccurrencesAsync(testFactory));
        Assert.DoesNotContain(
            await ReadAuditEventsAsync(testFactory),
            auditEvent => auditEvent.Action.StartsWith("recurring_bill.", StringComparison.Ordinal));
    }

    [Fact]
    public async Task GenerateDraftCreatesExactlyOneBillAndIsIdempotentForOccurrence()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Generate Actor");
        var templateId = await SeedTemplateAsync(testFactory, actor.UserProfileId, groupId: null, "Generate Template");
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Post, $"{RecurringBillsPath}/{templateId:D}/occurrences/2026-06-01/generate-draft", actor.RawSessionToken);

        using var response = await client.SendAsync(request);

        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Created, content);
        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        var billId = root.GetProperty("generatedBillId").GetGuid();
        var occurrenceId = root.GetProperty("occurrenceId").GetGuid();
        Assert.Equal(RecurringBillOccurrenceStatuses.DraftGenerated, root.GetProperty("occurrenceStatus").GetString());
        Assert.Equal(ExpenseBillStatuses.Draft, root.GetProperty("billStatus").GetString());
        Assert.Equal("100", root.GetProperty("totalAmount").GetString());
        Assert.Equal("USD", root.GetProperty("totalCurrency").GetString());

        var bill = Assert.Single(await ReadBillsAsync(testFactory));
        Assert.Equal(billId, bill.Id);
        Assert.Equal(actor.UserProfileId, bill.CreatedByUserProfileId);
        Assert.Equal(new DateOnly(2026, 6, 1), bill.BillDate);
        Assert.Equal(ExpenseBillStatuses.Draft, bill.Status);
        Assert.Equal(100m, bill.TotalAmount);

        var occurrence = Assert.Single(await ReadOccurrencesAsync(testFactory));
        Assert.Equal(occurrenceId, occurrence.Id);
        Assert.Equal(templateId, occurrence.RecurringBillTemplateId);
        Assert.Equal(new DateOnly(2026, 6, 1), occurrence.OccurrenceDate);
        Assert.Equal(billId, occurrence.GeneratedExpenseBillId);

        testContext.TimeProvider.SetUtcNow(LaterTimestamp);
        using var secondRequest = CreateBearerRequest(HttpMethod.Post, $"{RecurringBillsPath}/{templateId:D}/occurrences/2026-06-01/generate-draft", actor.RawSessionToken);
        using var secondResponse = await client.SendAsync(secondRequest);
        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
        using var secondPayload = JsonDocument.Parse(await secondResponse.Content.ReadAsStringAsync());
        Assert.Equal(billId, secondPayload.RootElement.GetProperty("generatedBillId").GetGuid());
        Assert.Single(await ReadBillsAsync(testFactory));
        Assert.Single(await ReadOccurrencesAsync(testFactory));

        var auditEvent = Assert.Single(
            await ReadAuditEventsAsync(testFactory),
            auditEvent => auditEvent.Action == "recurring_bill.draft_generated");
        Assert.DoesNotContain(actor.RawSessionToken, auditEvent.SafeMetadataJson);
        Assert.DoesNotContain("Generate Template", auditEvent.SafeMetadataJson);
        Assert.Empty(await ReadNotificationsAsync(testFactory));
    }

    [Fact]
    public async Task GroupMemberGenerateDraftNotifiesTemplateOwnerWithoutSelfNotification()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var owner = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Recurring Notification Owner");
        var member = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Recurring Notification Member");
        var groupId = await SeedGroupAsync(
            testFactory,
            owner.UserProfileId,
            "Recurring Notification Group",
            new MembershipSeed(owner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(member.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var templateId = await SeedGroupTemplateAsync(
            testFactory,
            owner.UserProfileId,
            groupId,
            "Recurring Owner Notification Template",
            [owner.UserProfileId, member.UserProfileId]);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Post,
            $"{RecurringBillsPath}/{templateId:D}/occurrences/2026-06-01/generate-draft",
            member.RawSessionToken);

        using var response = await client.SendAsync(request);

        var content = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Created, content);
        using var payload = JsonDocument.Parse(content);
        var billId = payload.RootElement.GetProperty("generatedBillId").GetGuid();
        var occurrenceId = payload.RootElement.GetProperty("occurrenceId").GetGuid();

        var notification = Assert.Single(await ReadNotificationsAsync(testFactory));
        Assert.Equal(owner.UserProfileId, notification.RecipientUserProfileId);
        Assert.Equal(member.UserProfileId, notification.ActorUserProfileId);
        Assert.Equal(InAppNotificationEventTypes.RecurringBillDraftGenerated, notification.EventType);
        Assert.Equal(InAppNotificationStatuses.Unread, notification.Status);
        Assert.Equal(InAppNotificationPriorities.Normal, notification.Priority);
        Assert.Equal(InAppNotificationSubjectTypes.RecurringBillOccurrence, notification.SubjectType);
        Assert.Equal(groupId, notification.GroupId);
        Assert.Equal(templateId, notification.RecurringBillTemplateId);
        Assert.Equal(occurrenceId, notification.RecurringBillOccurrenceId);
        Assert.Equal(billId, notification.ExpenseBillId);
        Assert.Equal($"/api/v1/groups/{groupId:D}/bills/{billId:D}", notification.ActionUrl);
        Assert.Equal(WriteTimestamp, notification.CreatedAtUtc);
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
                DeviceLabel: "Recurring bill endpoint test",
                UserAgentSummary: "Recurring bill endpoint test",
                NetworkAddressHash: $"recurring-bill-{userProfileId:N}",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(WriteTimestamp);
        return new SeededSession(
            authAccountId,
            userProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            sessionCreationResult.SessionExpiresAtUtc.Value);
    }

    private static async Task<Guid> SeedGroupAsync(
        WebApplicationFactory<Program> testFactory,
        Guid createdByUserProfileId,
        string name,
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

    private static async Task<Guid> SeedTemplateAsync(
        WebApplicationFactory<Program> testFactory,
        Guid ownerUserProfileId,
        Guid? groupId,
        string merchantName,
        string scheduleType = RecurringBillScheduleTypes.Monthly,
        int? intervalCount = 1,
        DateOnly? startDate = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var templateId = Guid.NewGuid();
        var payload = new RecurringBillTemplatePayload(
            "USD",
            [new RecurringBillTemplatePayloadItem("Seed Item", null, 100m, "USD", [])],
            [],
            []);
        dbContext.Set<RecurringBillTemplate>().Add(new RecurringBillTemplate
        {
            Id = templateId,
            OwnerUserProfileId = ownerUserProfileId,
            CreatedByUserProfileId = ownerUserProfileId,
            GroupId = groupId,
            MerchantName = merchantName,
            ScheduleType = scheduleType,
            IntervalCount = scheduleType == RecurringBillScheduleTypes.CustomIntervalDays ? null : intervalCount,
            IntervalDays = scheduleType == RecurringBillScheduleTypes.CustomIntervalDays ? 10 : null,
            StartDate = startDate ?? new DateOnly(2026, 6, 1),
            DueOffsetDays = 2,
            NextOccurrenceDate = startDate ?? new DateOnly(2026, 6, 1),
            Status = RecurringBillTemplateStatuses.Active,
            PayloadVersion = 1,
            PayloadJson = RecurringBillTemplatePayloadCodec.Serialize(payload),
            ForecastAmount = 100m,
            ForecastCurrency = "USD",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        await dbContext.SaveChangesAsync();
        return templateId;
    }

    private static async Task<Guid> SeedGroupTemplateAsync(
        WebApplicationFactory<Program> testFactory,
        Guid ownerUserProfileId,
        Guid groupId,
        string merchantName,
        IReadOnlyList<Guid> splitUserProfileIds)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var templateId = Guid.NewGuid();
        var amount = splitUserProfileIds.Count * 50m;
        var splits = splitUserProfileIds
            .Select((userProfileId, index) => new RecurringBillTemplatePayloadItemSplit(
                userProfileId,
                ExpenseBillItemSplitMethods.ExactAmount,
                50m,
                index))
            .ToArray();
        var payload = new RecurringBillTemplatePayload(
            "USD",
            [new RecurringBillTemplatePayloadItem("Seed Group Item", null, amount, "USD", splits)],
            [],
            []);
        dbContext.Set<RecurringBillTemplate>().Add(new RecurringBillTemplate
        {
            Id = templateId,
            OwnerUserProfileId = ownerUserProfileId,
            CreatedByUserProfileId = ownerUserProfileId,
            GroupId = groupId,
            MerchantName = merchantName,
            ScheduleType = RecurringBillScheduleTypes.Monthly,
            IntervalCount = 1,
            StartDate = new DateOnly(2026, 6, 1),
            DueOffsetDays = 2,
            NextOccurrenceDate = new DateOnly(2026, 6, 1),
            Status = RecurringBillTemplateStatuses.Active,
            PayloadVersion = 1,
            PayloadJson = RecurringBillTemplatePayloadCodec.Serialize(payload),
            ForecastAmount = amount,
            ForecastCurrency = "USD",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        await dbContext.SaveChangesAsync();

        return templateId;
    }

    private static string CreateGroupTemplateJson(
        Guid groupId,
        Guid actorUserProfileId,
        Guid memberUserProfileId)
    {
        return JsonSerializer.Serialize(new
        {
            groupId,
            merchantName = "Household Power",
            schedule = new
            {
                type = RecurringBillScheduleTypes.Monthly,
                intervalCount = 1,
                startDate = "2026-06-01",
                dueOffsetDays = 3
            },
            billPayload = new
            {
                currency = "USD",
                items = new[]
                {
                    new
                    {
                        name = "Electricity",
                        amount = "120.00",
                        splits = new[]
                        {
                            new
                            {
                                userProfileId = actorUserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "70.00",
                                allocationOrder = 0
                            },
                            new
                            {
                                userProfileId = memberUserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "50.00",
                                allocationOrder = 1
                            }
                        }
                    }
                }
            }
        });
    }

    private static string CreateGroupTemplatePatchJson(
        Guid ownerUserProfileId,
        Guid memberUserProfileId)
    {
        return JsonSerializer.Serialize(new
        {
            merchantName = "Updated Internet",
            billPayload = new
            {
                currency = "USD",
                items = new[]
                {
                    new
                    {
                        name = "Fiber Internet",
                        note = "Shared plan",
                        amount = "200.00",
                        splits = new[]
                        {
                            new
                            {
                                userProfileId = ownerUserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "120.00",
                                allocationOrder = 0
                            },
                            new
                            {
                                userProfileId = memberUserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "80.00",
                                allocationOrder = 1
                            }
                        }
                    }
                }
            }
        });
    }

    private static async Task<RecurringBillTemplate> ReadTemplateAsync(
        WebApplicationFactory<Program> testFactory,
        Guid templateId)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<RecurringBillTemplate>()
            .SingleAsync(template => template.Id == templateId);
    }

    private static async Task<IReadOnlyList<RecurringBillTemplate>> ReadTemplatesAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<RecurringBillTemplate>()
            .ToListAsync();
    }

    private static async Task<IReadOnlyList<ExpenseBill>> ReadBillsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<ExpenseBill>()
            .Include(bill => bill.Items)
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .ToListAsync();
    }

    private static async Task<IReadOnlyList<RecurringBillOccurrence>> ReadOccurrencesAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<RecurringBillOccurrence>()
            .ToListAsync();
    }

    private static async Task<IReadOnlyList<InAppNotification>> ReadNotificationsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<InAppNotification>()
            .AsNoTracking()
            .OrderBy(notification => notification.CreatedAtUtc)
            .ThenBy(notification => notification.Id)
            .ToListAsync();
    }

    private static async Task<AuthAuditEvent> AssertSingleAuditEventAsync(
        WebApplicationFactory<Program> testFactory,
        string action)
    {
        return Assert.Single(
            await ReadAuditEventsAsync(testFactory),
            auditEvent => auditEvent.Action == action);
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<AuthAuditEvent>()
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Action)
            .ToListAsync();
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

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        string? unexpectedToken = null)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("\"title\":\"Unauthenticated\"", content);
        Assert.DoesNotContain("token", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("hash", content, StringComparison.OrdinalIgnoreCase);
        if (unexpectedToken is not null)
        {
            Assert.DoesNotContain(unexpectedToken, content);
        }
    }

    private static async Task AssertRecurringBillUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("\"title\":\"Recurring bill unavailable\"", content);
    }

    private static async Task AssertRecurringBillConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("\"title\":\"Recurring bill conflict\"", content);
    }

    private static async Task AssertInvalidRecurringBillNoBodyProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("\"title\":\"Invalid recurring bill request\"", content);
        Assert.Contains("does not accept a request body", content);
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        EndpointTestTimeProvider TimeProvider);

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

        public void SetUtcNow(DateTimeOffset nextUtcNow)
        {
            utcNow = nextUtcNow;
        }
    }
}
