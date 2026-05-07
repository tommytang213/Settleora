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
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class PersonalBillEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string BillsPath = "/api/v1/bills";
    private const string PersonalBillCreatedAction = "bill.created";
    private const string WrongRawToken = "visible-wrong-personal-bill-session-token";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 7, 9, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 7, 9, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 7, 9, 30, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public PersonalBillEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PostBillCreatesPersonalDraftBillFromCurrentActorAndServerCalculation()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            BillsPath,
            seededSession.RawSessionToken,
            """
            {
              "merchantName": "  Corner Shop  ",
              "billDate": "2026-05-07",
              "currency": "USD",
              "items": [
                {
                  "name": "  Lunch  ",
                  "note": "  Noodles  ",
                  "amount": "10.00"
                }
              ],
              "adjustments": [
                {
                  "type": "service_charge",
                  "direction": "charge",
                  "allocationMethod": "equal",
                  "amount": "1.00",
                  "reasonNote": "  Tip  "
                }
              ],
              "payerPaymentMethodLabelSnapshot": "  Cash  "
            }
            """);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var root = payload.RootElement;
        var billId = root.GetProperty("id").GetGuid();

        Assert.Equal($"/api/v1/bills/{billId:D}", response.Headers.Location?.OriginalString);
        Assert.Equal("Corner Shop", root.GetProperty("merchantName").GetString());
        Assert.Equal("2026-05-07", root.GetProperty("billDate").GetString());
        Assert.Equal(ExpenseBillStatuses.Draft, root.GetProperty("status").GetString());
        Assert.Equal("11", root.GetProperty("totalAmount").GetString());
        Assert.Equal("USD", root.GetProperty("totalCurrency").GetString());
        Assert.Equal(WriteTimestamp, root.GetProperty("createdAtUtc").GetDateTimeOffset());
        Assert.Equal(WriteTimestamp, root.GetProperty("updatedAtUtc").GetDateTimeOffset());

        var item = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal("Lunch", item.GetProperty("name").GetString());
        Assert.Equal("Noodles", item.GetProperty("note").GetString());
        Assert.Equal("10", item.GetProperty("amount").GetString());
        Assert.Equal("USD", item.GetProperty("currency").GetString());

        var split = Assert.Single(item.GetProperty("splits").EnumerateArray());
        Assert.Equal(seededSession.UserProfileId, split.GetProperty("userProfileId").GetGuid());
        Assert.Equal(ExpenseBillItemSplitMethods.ExactAmount, split.GetProperty("splitMethod").GetString());
        Assert.Equal("10", split.GetProperty("basisValue").GetString());
        Assert.Equal("10", split.GetProperty("resolvedAmount").GetString());

        var participant = Assert.Single(root.GetProperty("participants").EnumerateArray());
        Assert.Equal(seededSession.UserProfileId, participant.GetProperty("userProfileId").GetGuid());
        Assert.Equal("11", participant.GetProperty("resolvedShareAmount").GetString());

        var payer = Assert.Single(root.GetProperty("payers").EnumerateArray());
        Assert.Equal(seededSession.UserProfileId, payer.GetProperty("userProfileId").GetGuid());
        Assert.Equal("11", payer.GetProperty("amount").GetString());
        Assert.Equal("Cash", payer.GetProperty("paymentMethodLabelSnapshot").GetString());

        var adjustment = Assert.Single(root.GetProperty("adjustments").EnumerateArray());
        Assert.Equal(ExpenseBillAdjustmentTypes.ServiceCharge, adjustment.GetProperty("type").GetString());
        Assert.Equal(ExpenseBillAdjustmentDirections.Charge, adjustment.GetProperty("direction").GetString());
        Assert.Equal(ExpenseBillAdjustmentAllocationMethods.Equal, adjustment.GetProperty("allocationMethod").GetString());
        Assert.Equal("1", adjustment.GetProperty("amount").GetString());
        Assert.Equal("Tip", adjustment.GetProperty("reasonNote").GetString());

        var allocation = Assert.Single(root.GetProperty("calculatedAdjustmentAllocations").EnumerateArray());
        Assert.Equal(adjustment.GetProperty("id").GetGuid(), allocation.GetProperty("expenseBillAdjustmentId").GetGuid());
        Assert.Equal(seededSession.UserProfileId, allocation.GetProperty("userProfileId").GetGuid());
        Assert.Equal("1", allocation.GetProperty("allocatedAmount").GetString());

        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Null(bill.GroupId);
        Assert.Equal(seededSession.UserProfileId, bill.CreatedByUserProfileId);
        Assert.Equal("Corner Shop", bill.MerchantName);
        Assert.Equal(11.00m, bill.TotalAmount);
        Assert.Equal("USD", bill.TotalCurrency);
        Assert.Single(bill.Participants);
        Assert.Single(bill.Items);
        Assert.Single(bill.Items.Single().Splits);
        Assert.Single(bill.Adjustments);
        Assert.Single(bill.Payers);

        var auditEvent = await AssertSinglePersonalBillAuditEventAsync(
            testFactory,
            seededSession.AuthAccountId,
            billId,
            WriteTimestamp);
        AssertPersonalBillAuditMetadata(
            auditEvent,
            billId,
            ExpenseBillStatuses.Draft,
            itemCount: 1,
            adjustmentCount: 1,
            participantCount: 1,
            currency: "USD",
            totalAmount: "11");
        AssertSafePersonalBillAuditContent(
            auditEvent,
            seededSession.RawSessionToken,
            "Corner Shop",
            "Lunch",
            "Noodles",
            "Tip",
            "Cash");
    }

    [Fact]
    public async Task PostBillResponseDoesNotExposeAuthSessionCredentialOrStorageInternals()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, seededSession.AuthSessionId);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            BillsPath,
            seededSession.RawSessionToken,
            """
            {
              "billDate": "2026-05-07",
              "currency": "USD",
              "items": [{ "name": "Lunch", "amount": "10.00" }]
            }
            """);

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
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("createdBy", content);
        Assert.DoesNotContain("account", lowerContent);
        Assert.DoesNotContain("group", lowerContent);
    }

    [Fact]
    public async Task PostBillRejectsClientSubmittedIdentityFieldsWithoutCreatingBill()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        var requestBody = JsonSerializer.Serialize(new
        {
            billDate = "2026-05-07",
            currency = "USD",
            createdByUserProfileId = Guid.NewGuid(),
            groupId = Guid.NewGuid(),
            participantUserProfileId = Guid.NewGuid(),
            payerUserProfileId = Guid.NewGuid(),
            rawSessionToken = "visible-personal-bill-token",
            items = new[] { new { name = "Lunch", amount = "10.00" } }
        });
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            BillsPath,
            seededSession.RawSessionToken,
            requestBody);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        await AssertInvalidBillRequestProblemAsync(response, content);
        Assert.Contains("Unsupported fields are not allowed.", content);
        Assert.DoesNotContain("createdByUserProfileId", content);
        Assert.DoesNotContain("participantUserProfileId", content);
        Assert.DoesNotContain("payerUserProfileId", content);
        Assert.DoesNotContain("visible-personal-bill-token", content);
        await AssertNoBillsCreatedByAsync(testFactory, seededSession.UserProfileId);
        await AssertNoPersonalBillAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task GetBillListReturnsOnlyPersonalBillsVisibleToCreatorOrParticipant()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var otherProfileId = await SeedProfileAsync(testFactory, "Other Personal Bill User");
        var creatorBillId = await SeedPersonalBillAsync(
            testFactory,
            seededSession.UserProfileId,
            [seededSession.UserProfileId],
            "Creator Bill",
            InitialTimestamp.AddMinutes(1));
        var participantBillId = await SeedPersonalBillAsync(
            testFactory,
            otherProfileId,
            [seededSession.UserProfileId, otherProfileId],
            "Participant Bill",
            InitialTimestamp.AddMinutes(2));
        await SeedPersonalBillAsync(
            testFactory,
            otherProfileId,
            [otherProfileId],
            "Unrelated Bill",
            InitialTimestamp.AddMinutes(3));
        await SeedPersonalBillAsync(
            testFactory,
            seededSession.UserProfileId,
            [seededSession.UserProfileId],
            "Archived Bill",
            InitialTimestamp.AddMinutes(4),
            archivedAtUtc: ValidationTimestamp);
        await SeedPersonalBillAsync(
            testFactory,
            seededSession.UserProfileId,
            [seededSession.UserProfileId],
            "Group Bill",
            InitialTimestamp.AddMinutes(5),
            groupId: Guid.NewGuid());
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, BillsPath, seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var bills = payload.RootElement.GetProperty("bills")
            .EnumerateArray()
            .Select(bill => new
            {
                Id = bill.GetProperty("id").GetGuid(),
                MerchantName = bill.GetProperty("merchantName").GetString()
            })
            .ToArray();

        Assert.Equal(new[] { participantBillId, creatorBillId }, bills.Select(bill => bill.Id).ToArray());
        Assert.Equal(new[] { "Participant Bill", "Creator Bill" }, bills.Select(bill => bill.MerchantName).ToArray());
    }

    [Fact]
    public async Task GetBillByIdFailsClosedForUnrelatedArchivedGroupOrMissingBill()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var otherProfileId = await SeedProfileAsync(testFactory, "Unavailable Personal Bill User");
        var unavailableBillIds = new[]
        {
            Guid.NewGuid(),
            await SeedPersonalBillAsync(testFactory, otherProfileId, [otherProfileId], "Unrelated Bill", InitialTimestamp),
            await SeedPersonalBillAsync(testFactory, seededSession.UserProfileId, [seededSession.UserProfileId], "Archived Bill", InitialTimestamp, archivedAtUtc: ValidationTimestamp),
            await SeedPersonalBillAsync(testFactory, seededSession.UserProfileId, [seededSession.UserProfileId], "Group Bill", InitialTimestamp, groupId: Guid.NewGuid())
        };
        using var client = testFactory.CreateClient();

        foreach (var billId in unavailableBillIds)
        {
            using var request = CreateBearerRequest(HttpMethod.Get, $"{BillsPath}/{billId:D}", seededSession.RawSessionToken);
            using var response = await client.SendAsync(request);

            await AssertBillUnavailableProblemAsync(response);
        }
    }

    [Fact]
    public async Task MissingOrInvalidSessionReturnsUniformUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();

        using var missingResponse = await client.GetAsync(BillsPath);
        await AssertUnauthenticatedProblemAsync(missingResponse);

        using var invalidRequest = CreateBearerRequest(HttpMethod.Get, BillsPath, WrongRawToken);
        using var invalidResponse = await client.SendAsync(invalidRequest);
        await AssertUnauthenticatedProblemAsync(invalidResponse, WrongRawToken);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new PersonalBillTestTimeProvider(InitialTimestamp);
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

    private static async Task<SeededPersonalBillSession> SeedValidSessionAsync(
        WebApplicationFactory<Program> testFactory,
        PersonalBillTestTimeProvider timeProvider)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Personal Bill Endpoint Test User",
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
                DeviceLabel: "Personal bill endpoint test",
                UserAgentSummary: "Personal bill endpoint test user agent",
                NetworkAddressHash: "personal-bill-endpoint-test-network",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededPersonalBillSession(
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

    private static async Task<Guid> SeedPersonalBillAsync(
        WebApplicationFactory<Program> testFactory,
        Guid creatorProfileId,
        IReadOnlyList<Guid> participantProfileIds,
        string merchantName,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? archivedAtUtc = null,
        Guid? groupId = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var billId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var participantShare = decimal.Round(10m / participantProfileIds.Count, 4);

        var bill = new ExpenseBill
        {
            Id = billId,
            CreatedByUserProfileId = creatorProfileId,
            GroupId = groupId,
            MerchantName = merchantName,
            BillDate = DateOnly.FromDateTime(createdAtUtc.UtcDateTime),
            Status = ExpenseBillStatuses.Draft,
            TotalAmount = 10.00m,
            TotalCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            ArchivedAtUtc = archivedAtUtc
        };

        var item = new ExpenseBillItem
        {
            Id = itemId,
            ExpenseBillId = billId,
            Name = "Seeded Item",
            Amount = 10.00m,
            Currency = "USD",
            SortOrder = 0,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };

        foreach (var participantId in participantProfileIds)
        {
            bill.Participants.Add(new ExpenseBillParticipant
            {
                ExpenseBillId = billId,
                UserProfileId = participantId,
                Status = ExpenseBillParticipantStatuses.PendingAcceptance,
                ResolvedShareAmount = participantShare,
                ResolvedShareCurrency = "USD",
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
            item.Splits.Add(new ExpenseBillItemSplit
            {
                Id = Guid.NewGuid(),
                ExpenseBillItemId = itemId,
                UserProfileId = participantId,
                SplitMethod = ExpenseBillItemSplitMethods.Equal,
                ResolvedAmount = participantShare,
                ResolvedCurrency = "USD",
                AllocationOrder = 0,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        bill.Items.Add(item);
        bill.Payers.Add(new ExpenseBillPayer
        {
            Id = Guid.NewGuid(),
            ExpenseBillId = billId,
            UserProfileId = creatorProfileId,
            Amount = 10.00m,
            Currency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        dbContext.Set<ExpenseBill>().Add(bill);
        await dbContext.SaveChangesAsync();
        return billId;
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
            .Include(bill => bill.Adjustments)
            .SingleAsync(bill => bill.Id == billId);
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

    private static async Task<AuthAuditEvent> AssertSinglePersonalBillAuditEventAsync(
        WebApplicationFactory<Program> testFactory,
        Guid expectedAuthAccountId,
        Guid expectedBillId,
        DateTimeOffset expectedOccurredAtUtc)
    {
        var auditEvent = Assert.Single(await ReadPersonalBillAuditEventsAsync(testFactory));

        Assert.Equal(PersonalBillCreatedAction, auditEvent.Action);
        Assert.Equal(expectedAuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.Equal(expectedAuthAccountId, auditEvent.SubjectAuthAccountId);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.Equal(expectedOccurredAtUtc, auditEvent.OccurredAtUtc);
        Assert.Null(auditEvent.CorrelationId);
        Assert.Null(auditEvent.RequestId);
        Assert.Contains(
            expectedBillId.ToString("D"),
            auditEvent.SafeMetadataJson ?? string.Empty,
            StringComparison.Ordinal);

        return auditEvent;
    }

    private static async Task AssertNoPersonalBillAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        Assert.Empty(await ReadPersonalBillAuditEventsAsync(testFactory));
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadPersonalBillAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action == PersonalBillCreatedAction)
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Id)
            .ToArrayAsync();
    }

    private static async Task AssertNoBillsCreatedByAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var billCount = await dbContext.Set<ExpenseBill>()
            .CountAsync(bill => bill.CreatedByUserProfileId == userProfileId);

        Assert.Equal(0, billCount);
    }

    private static void AssertPersonalBillAuditMetadata(
        AuthAuditEvent auditEvent,
        Guid expectedBillId,
        string expectedStatus,
        int itemCount,
        int adjustmentCount,
        int participantCount,
        string currency,
        string totalAmount)
    {
        Assert.NotNull(auditEvent.SafeMetadataJson);
        Assert.True(auditEvent.SafeMetadataJson!.Length <= 4096);

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);
        var propertyNames = metadata.RootElement
            .EnumerateObject()
            .Select(property => property.Name)
            .Order(StringComparer.Ordinal)
            .ToArray();
        var expectedPropertyNames = new[]
        {
            "adjustmentCount",
            "billId",
            "currency",
            "groupMode",
            "itemCount",
            "participantCount",
            "status",
            "totalAmount",
            "workflowName"
        };
        Assert.Equal(expectedPropertyNames, propertyNames);

        Assert.Equal("personal_bill", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(expectedBillId.ToString("D"), metadata.RootElement.GetProperty("billId").GetString());
        Assert.Equal("personal", metadata.RootElement.GetProperty("groupMode").GetString());
        Assert.Equal(expectedStatus, metadata.RootElement.GetProperty("status").GetString());
        Assert.Equal(itemCount, metadata.RootElement.GetProperty("itemCount").GetInt32());
        Assert.Equal(adjustmentCount, metadata.RootElement.GetProperty("adjustmentCount").GetInt32());
        Assert.Equal(participantCount, metadata.RootElement.GetProperty("participantCount").GetInt32());
        Assert.Equal(currency, metadata.RootElement.GetProperty("currency").GetString());
        Assert.Equal(totalAmount, metadata.RootElement.GetProperty("totalAmount").GetString());

        Assert.InRange(metadata.RootElement.GetProperty("workflowName").GetString()!.Length, 1, 120);
        Assert.InRange(metadata.RootElement.GetProperty("groupMode").GetString()!.Length, 1, 120);
        Assert.InRange(metadata.RootElement.GetProperty("status").GetString()!.Length, 1, 120);
        Assert.InRange(metadata.RootElement.GetProperty("currency").GetString()!.Length, 1, 120);
        Assert.InRange(metadata.RootElement.GetProperty("totalAmount").GetString()!.Length, 1, 120);
    }

    private static void AssertSafePersonalBillAuditContent(
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

        Assert.DoesNotContain("merchant", lowerAuditText);
        Assert.DoesNotContain("itemname", lowerAuditText);
        Assert.DoesNotContain("note", lowerAuditText);
        Assert.DoesNotContain("payer", lowerAuditText);
        Assert.DoesNotContain("payment", lowerAuditText);
        Assert.DoesNotContain("method", lowerAuditText);
        Assert.DoesNotContain("label", lowerAuditText);
        Assert.DoesNotContain("request", lowerAuditText);
        Assert.DoesNotContain("body", lowerAuditText);
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

    private static async Task AssertInvalidBillRequestProblemAsync(
        HttpResponseMessage response,
        string? content = null)
    {
        content ??= await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid bill request", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted bill request is invalid.",
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
        PersonalBillTestTimeProvider TimeProvider);

    private sealed record SeededPersonalBillSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset SessionExpiresAtUtc);

    private sealed class PersonalBillTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public PersonalBillTestTimeProvider(DateTimeOffset utcNow)
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
