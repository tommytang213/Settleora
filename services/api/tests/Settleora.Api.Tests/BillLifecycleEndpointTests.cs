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

public sealed class BillLifecycleEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string BillArchivedAction = "bill.archived";
    private const string BillRestoredAction = "bill.restored";
    private const string WrongRawToken = "visible-wrong-bill-lifecycle-session-token";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 17, 8, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 17, 8, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ArchiveTimestamp = new(2026, 5, 17, 8, 30, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset RestoreTimestamp = new(2026, 5, 17, 8, 45, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public BillLifecycleEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PersonalBillArchiveAndRestoreAreIdempotentAndPreserveRelatedFinancialRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal Lifecycle Owner");
        var participant = await SeedAccountAsync(testFactory, "Personal Lifecycle Participant", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            [ownerSession.UserProfileId, participant.UserProfileId],
            ExpenseBillStatuses.Draft,
            "Hidden Personal Lifecycle Merchant",
            InitialTimestamp,
            includeAttachmentAndOcr: true);
        await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            ownerSession.UserProfileId,
            participant.UserProfileId,
            SettlementRequestStatuses.Cancelled,
            InitialTimestamp.AddMinutes(2));
        var before = await ReadBillSnapshotAsync(testFactory, billId);

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp);
        using var client = testFactory.CreateClient();
        using (var archiveRequest = CreateBearerRequest(
            HttpMethod.Post,
            PersonalArchivePath(billId),
            ownerSession.RawSessionToken))
        using (var archiveResponse = await client.SendAsync(archiveRequest))
        {
            await AssertLifecycleResponseAsync(
                archiveResponse,
                billId,
                groupId: null,
                ExpenseBillStatuses.Draft,
                "archived",
                ArchiveTimestamp,
                ArchiveTimestamp);
        }

        var archived = await ReadBillSnapshotAsync(testFactory, billId);
        AssertLifecycleOnlyChanged(before, archived, ArchiveTimestamp, expectedArchiveStateChanged: true);

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(5));
        using (var repeatedArchiveRequest = CreateBearerRequest(
            HttpMethod.Post,
            PersonalArchivePath(billId),
            ownerSession.RawSessionToken))
        using (var repeatedArchiveResponse = await client.SendAsync(repeatedArchiveRequest))
        {
            await AssertLifecycleResponseAsync(
                repeatedArchiveResponse,
                billId,
                groupId: null,
                ExpenseBillStatuses.Draft,
                "archived",
                ArchiveTimestamp,
                ArchiveTimestamp);
        }

        testContext.TimeProvider.SetUtcNow(RestoreTimestamp);
        using (var restoreRequest = CreateBearerRequest(
            HttpMethod.Post,
            PersonalRestorePath(billId),
            ownerSession.RawSessionToken))
        using (var restoreResponse = await client.SendAsync(restoreRequest))
        {
            await AssertLifecycleResponseAsync(
                restoreResponse,
                billId,
                groupId: null,
                ExpenseBillStatuses.Draft,
                "active",
                archivedAtUtc: null,
                RestoreTimestamp);
        }

        var restored = await ReadBillSnapshotAsync(testFactory, billId);
        AssertLifecycleOnlyChanged(before, restored, RestoreTimestamp, expectedArchiveStateChanged: false);

        var auditEvents = await ReadLifecycleAuditEventsAsync(testFactory);
        Assert.Equal([BillArchivedAction, BillRestoredAction], auditEvents.Select(auditEvent => auditEvent.Action).ToArray());
        Assert.All(
            auditEvents,
            auditEvent => AssertSafeLifecycleAuditContent(
                auditEvent,
                ownerSession.RawSessionToken,
                "Hidden Personal Lifecycle Merchant",
                "Seeded Lifecycle Item",
                "Seeded OCR Merchant",
                "storage/object/key",
                "payment label secret"));
    }

    [Fact]
    public async Task PersonalLifecycleFailsClosedForCrossUserAndSupportsBoundedArchiveStateFilters()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Personal Filter Actor");
        var other = await SeedAccountAsync(testFactory, "Personal Filter Other", InitialTimestamp.AddMinutes(1));
        var activeBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            ExpenseBillStatuses.Draft,
            "Active Personal Filter",
            InitialTimestamp);
        var archivedBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            ExpenseBillStatuses.Draft,
            "Archived Personal Filter",
            InitialTimestamp.AddMinutes(1),
            archivedAtUtc: ArchiveTimestamp);
        var participantOnlyBillId = await SeedBillAsync(
            testFactory,
            other.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId, other.UserProfileId],
            ExpenseBillStatuses.Draft,
            "Participant Only Filter",
            InitialTimestamp.AddMinutes(2));
        using var client = testFactory.CreateClient();

        using (var crossUserArchiveRequest = CreateBearerRequest(
            HttpMethod.Post,
            PersonalArchivePath(participantOnlyBillId),
            actorSession.RawSessionToken))
        using (var crossUserArchiveResponse = await client.SendAsync(crossUserArchiveRequest))
        {
            await AssertBillUnavailableProblemAsync(crossUserArchiveResponse);
        }

        using (var defaultListRequest = CreateBearerRequest(HttpMethod.Get, "/api/v1/bills", actorSession.RawSessionToken))
        using (var defaultListResponse = await client.SendAsync(defaultListRequest))
        {
            Assert.Equal([participantOnlyBillId, activeBillId], await ReadBillIdsAsync(defaultListResponse));
        }

        using (var archivedListRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/bills?archiveState=archived",
            actorSession.RawSessionToken))
        using (var archivedListResponse = await client.SendAsync(archivedListRequest))
        {
            Assert.Equal([archivedBillId], await ReadBillIdsAsync(archivedListResponse));
        }

        using (var allListRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/bills?archiveState=all&limit=10",
            actorSession.RawSessionToken))
        using (var allListResponse = await client.SendAsync(allListRequest))
        {
            Assert.Equal([participantOnlyBillId, archivedBillId, activeBillId], await ReadBillIdsAsync(allListResponse));
        }

        using (var exportRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/bills/export.json?archiveState=archived",
            actorSession.RawSessionToken))
        using (var exportResponse = await client.SendAsync(exportRequest))
        {
            var content = await exportResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, exportResponse.StatusCode);
            using var payload = JsonDocument.Parse(content);
            Assert.Equal("archived", payload.RootElement.GetProperty("appliedFilters").GetProperty("archiveState").GetString());
            var row = Assert.Single(payload.RootElement.GetProperty("rows").EnumerateArray());
            Assert.Equal(archivedBillId, row.GetProperty("billId").GetGuid());
        }

        using (var monthlyReportRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/reports/monthly?month=2026-05",
            actorSession.RawSessionToken))
        using (var monthlyReportResponse = await client.SendAsync(monthlyReportRequest))
        {
            var content = await monthlyReportResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, monthlyReportResponse.StatusCode);
            using var payload = JsonDocument.Parse(content);
            Assert.Equal(2, payload.RootElement.GetProperty("billCount").GetInt32());
            var total = Assert.Single(payload.RootElement.GetProperty("totalByCurrency").EnumerateArray());
            Assert.Equal("USD", total.GetProperty("currency").GetString());
            Assert.Equal("24", total.GetProperty("amount").GetString());
        }

        using (var invalidFilterRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/bills?archiveState=deleted",
            actorSession.RawSessionToken))
        using (var invalidFilterResponse = await client.SendAsync(invalidFilterRequest))
        {
            var content = await invalidFilterResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.BadRequest, invalidFilterResponse.StatusCode);
            Assert.Contains("Archive state is not supported.", content);
        }

        Assert.Empty(await ReadLifecycleAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task GroupBillArchiveRestoreRequireActiveRouteGroupAccess()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Lifecycle Owner");
        var memberSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Lifecycle Member");
        var removedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Lifecycle Removed");
        var outsideSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Lifecycle Outside");
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Group Lifecycle",
            InitialTimestamp,
            null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(memberSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(removedSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        var wrongGroupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Wrong Lifecycle Group",
            InitialTimestamp,
            null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            [ownerSession.UserProfileId, memberSession.UserProfileId],
            ExpenseBillStatuses.Rejected,
            "Group Lifecycle Merchant",
            InitialTimestamp);
        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp);
        using var client = testFactory.CreateClient();

        using (var archiveRequest = CreateBearerRequest(
            HttpMethod.Post,
            GroupArchivePath(groupId, billId),
            memberSession.RawSessionToken))
        using (var archiveResponse = await client.SendAsync(archiveRequest))
        {
            await AssertLifecycleResponseAsync(
                archiveResponse,
                billId,
                groupId,
                ExpenseBillStatuses.Rejected,
                "archived",
                ArchiveTimestamp,
                ArchiveTimestamp);
        }

        using (var defaultListRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/groups/{groupId:D}/bills",
            memberSession.RawSessionToken))
        using (var defaultListResponse = await client.SendAsync(defaultListRequest))
        {
            Assert.Empty(await ReadBillIdsAsync(defaultListResponse));
        }

        using (var archivedListRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/groups/{groupId:D}/bills?archiveState=archived",
            memberSession.RawSessionToken))
        using (var archivedListResponse = await client.SendAsync(archivedListRequest))
        {
            Assert.Equal([billId], await ReadBillIdsAsync(archivedListResponse));
        }

        using (var removedRestoreRequest = CreateBearerRequest(
            HttpMethod.Post,
            GroupRestorePath(groupId, billId),
            removedSession.RawSessionToken))
        using (var removedRestoreResponse = await client.SendAsync(removedRestoreRequest))
        {
            await AssertGroupBillUnavailableProblemAsync(removedRestoreResponse);
        }

        using (var outsideArchiveRequest = CreateBearerRequest(
            HttpMethod.Post,
            GroupArchivePath(groupId, billId),
            outsideSession.RawSessionToken))
        using (var outsideArchiveResponse = await client.SendAsync(outsideArchiveRequest))
        {
            await AssertGroupBillUnavailableProblemAsync(outsideArchiveResponse);
        }

        using (var wrongGroupRestoreRequest = CreateBearerRequest(
            HttpMethod.Post,
            GroupRestorePath(wrongGroupId, billId),
            ownerSession.RawSessionToken))
        using (var wrongGroupRestoreResponse = await client.SendAsync(wrongGroupRestoreRequest))
        {
            await AssertGroupBillUnavailableProblemAsync(wrongGroupRestoreResponse);
        }

        testContext.TimeProvider.SetUtcNow(RestoreTimestamp);
        using (var restoreRequest = CreateBearerRequest(
            HttpMethod.Post,
            GroupRestorePath(groupId, billId),
            ownerSession.RawSessionToken))
        using (var restoreResponse = await client.SendAsync(restoreRequest))
        {
            await AssertLifecycleResponseAsync(
                restoreResponse,
                billId,
                groupId,
                ExpenseBillStatuses.Rejected,
                "active",
                archivedAtUtc: null,
                RestoreTimestamp);
        }

        var auditEvents = await ReadLifecycleAuditEventsAsync(testFactory);
        Assert.Equal([BillArchivedAction, BillRestoredAction], auditEvents.Select(auditEvent => auditEvent.Action).ToArray());
    }

    [Fact]
    public async Task ArchiveWithActiveSettlementStateReturnsSafeConflictWithoutMutatingRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Settlement Conflict Actor");
        var counterparty = await SeedAccountAsync(testFactory, "Settlement Conflict Counterparty", InitialTimestamp.AddMinutes(1));
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId, counterparty.UserProfileId],
            ExpenseBillStatuses.Confirmed,
            "Settlement Conflict Merchant",
            InitialTimestamp);
        var settlementRequestId = await SeedSettlementRequestAsync(
            testFactory,
            billId,
            groupId: null,
            actorSession.UserProfileId,
            counterparty.UserProfileId,
            SettlementRequestStatuses.Requested,
            InitialTimestamp.AddMinutes(1));
        var before = await ReadBillSnapshotAsync(testFactory, billId);

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Post, PersonalArchivePath(billId), actorSession.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(actorSession.RawSessionToken, content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bill lifecycle conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("The requested bill lifecycle transition is not allowed.", payload.RootElement.GetProperty("detail").GetString());

        var after = await ReadBillSnapshotAsync(testFactory, billId);
        Assert.Equal(before, after);
        Assert.Equal(SettlementRequestStatuses.Requested, await ReadSettlementRequestStatusAsync(testFactory, settlementRequestId));
        Assert.Empty(await ReadLifecycleAuditEventsAsync(testFactory));
    }

    [Fact]
    public void OpenApiAndGeneratedClientsExposeBillLifecycleOperations()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var personalArchiveBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/bills/{billId}/archive:");
        var personalRestoreBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/bills/{billId}/restore:");
        var groupArchiveBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/groups/{groupId}/bills/{billId}/archive:");
        var groupRestoreBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/groups/{groupId}/bills/{billId}/restore:");
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "ExpenseBillLifecycleResponse:");
        var archiveStateSchema = ExtractOpenApiSchemaBlock(openApi, "ExpenseBillArchiveState:");

        Assert.Contains("operationId: archivePersonalBill", personalArchiveBlock);
        Assert.Contains("operationId: restorePersonalBill", personalRestoreBlock);
        Assert.Contains("operationId: archiveGroupBill", groupArchiveBlock);
        Assert.Contains("operationId: restoreGroupBill", groupRestoreBlock);
        Assert.Contains("ExpenseBillLifecycleResponse", personalArchiveBlock + personalRestoreBlock + groupArchiveBlock + groupRestoreBlock);
        Assert.Contains("archiveState", responseSchema);
        Assert.Contains("archivedAtUtc", responseSchema);
        Assert.Contains("active", archiveStateSchema);
        Assert.Contains("archived", archiveStateSchema);
        Assert.Contains("all", archiveStateSchema);
        Assert.DoesNotContain("storageObjectKey", responseSchema);
        Assert.DoesNotContain("paymentMethodLabelSnapshot", responseSchema);

        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/client.dart"));
        var webModels = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/models.ts"));
        var dartModels = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/models.dart"));

        Assert.Contains("archivePersonalBill", webClient);
        Assert.Contains("restorePersonalBill", webClient);
        Assert.Contains("archiveGroupBill", dartClient);
        Assert.Contains("restoreGroupBill", dartClient);
        Assert.Contains("ExpenseBillLifecycleResponse", webModels);
        Assert.Contains("class ExpenseBillLifecycleResponse", dartModels);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new BillLifecycleTestTimeProvider(InitialTimestamp);
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
        BillLifecycleTestTimeProvider timeProvider,
        string displayName)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
        var account = await SeedAccountAsync(testFactory, displayName, InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Bill lifecycle endpoint test",
                UserAgentSummary: "Bill lifecycle endpoint test user agent",
                NetworkAddressHash: "bill-lifecycle-endpoint-test-network",
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
        DateTimeOffset? createdAtUtc = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var now = createdAtUtc ?? InitialTimestamp;
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
            DefaultCurrency = "USD",
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        await dbContext.SaveChangesAsync();
        return new SeededAccount(authAccountId, userProfileId);
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
        IReadOnlyList<Guid> participantProfileIds,
        string status,
        string merchantName,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? archivedAtUtc = null,
        bool includeAttachmentAndOcr = false)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var billId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var participantShare = decimal.Round(12m / participantProfileIds.Count, 4);

        var bill = new ExpenseBill
        {
            Id = billId,
            CreatedByUserProfileId = creatorProfileId,
            BillOwnerUserProfileId = creatorProfileId,
            GroupId = groupId,
            MerchantName = merchantName,
            BillDate = DateOnly.FromDateTime(createdAtUtc.UtcDateTime),
            Status = status,
            TotalAmount = 12m,
            TotalCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            ArchivedAtUtc = archivedAtUtc
        };

        var item = new ExpenseBillItem
        {
            Id = itemId,
            ExpenseBillId = billId,
            Name = "Seeded Lifecycle Item",
            Note = "Seeded lifecycle item note",
            Amount = 12m,
            Currency = "USD",
            SortOrder = 0,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };

        for (var index = 0; index < participantProfileIds.Count; index++)
        {
            var participantId = participantProfileIds[index];
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
                AllocationOrder = index,
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
            Amount = 12m,
            Currency = "USD",
            PaymentMethodLabelSnapshot = "payment label secret",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });
        dbContext.Set<ExpenseBill>().Add(bill);

        if (includeAttachmentAndOcr)
        {
            bill.Adjustments.Add(new ExpenseBillAdjustment
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = billId,
                Type = ExpenseBillAdjustmentTypes.ServiceCharge,
                Direction = ExpenseBillAdjustmentDirections.Charge,
                AllocationMethod = ExpenseBillAdjustmentAllocationMethods.Equal,
                Amount = 0m,
                Currency = "USD",
                SortOrder = 0,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
            var fileId = Guid.NewGuid();
            dbContext.Set<FileObject>().Add(new FileObject
            {
                Id = fileId,
                OwnerUserProfileId = creatorProfileId,
                CreatedByUserProfileId = creatorProfileId,
                Purpose = FileObjectPurposes.ReceiptImage,
                Status = FileObjectStatuses.Active,
                ContentType = "image/png",
                SizeBytes = 128,
                StorageProvider = "local",
                StorageObjectKey = "storage/object/key",
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
            bill.Attachments.Add(new ExpenseBillAttachment
            {
                ExpenseBillId = billId,
                FileObjectId = fileId,
                Purpose = ExpenseBillAttachmentPurposes.Receipt,
                CreatedByUserProfileId = creatorProfileId,
                CreatedAtUtc = createdAtUtc
            });
            dbContext.Set<ReceiptOcrReview>().Add(new ReceiptOcrReview
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = billId,
                FileObjectId = fileId,
                CreatedByUserProfileId = creatorProfileId,
                GroupId = groupId,
                Status = ReceiptOcrReviewStatuses.Reviewed,
                Source = ReceiptOcrReviewSources.OnDevice,
                MerchantText = "Seeded OCR Merchant",
                Currency = "USD",
                GrandTotalAmount = 12m,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        await dbContext.SaveChangesAsync();
        return billId;
    }

    private static async Task<Guid> SeedSettlementRequestAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid? groupId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        string status,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var settlementRequestId = Guid.NewGuid();
        var request = new SettlementRequest
        {
            Id = settlementRequestId,
            GroupId = groupId,
            SourceExpenseBillId = billId,
            DebtorUserProfileId = debtorUserProfileId,
            CreditorUserProfileId = creditorUserProfileId,
            RequestedByUserProfileId = creditorUserProfileId,
            Amount = 6m,
            Currency = "USD",
            Status = status,
            RequestedAtUtc = createdAtUtc,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            CancelledAtUtc = status is SettlementRequestStatuses.Cancelled ? createdAtUtc : null,
            ConfirmedAtUtc = status is SettlementRequestStatuses.Confirmed ? createdAtUtc : null
        };
        request.Lines.Add(new SettlementRequestLine
        {
            Id = Guid.NewGuid(),
            SettlementRequestId = settlementRequestId,
            SourceExpenseBillId = billId,
            SourceCandidateKey = $"bill:{billId:D}:test",
            ExactAmount = 6m,
            Currency = "USD",
            AllocationOrder = 0,
            Status = SettlementRequestLineStatuses.Open,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });
        dbContext.Set<SettlementRequest>().Add(request);
        await dbContext.SaveChangesAsync();
        return settlementRequestId;
    }

    private static async Task<BillSnapshot> ReadBillSnapshotAsync(
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
            .Include(candidate => candidate.Adjustments)
            .Include(candidate => candidate.Attachments)
            .SingleAsync(candidate => candidate.Id == billId);
        var ocrReviews = await dbContext.Set<ReceiptOcrReview>()
            .AsNoTracking()
            .Where(review => review.ExpenseBillId == billId)
            .OrderBy(review => review.Id)
            .Select(review => $"{review.Status}:{review.Currency}:{review.GrandTotalAmount}:{review.RemovedAtUtc}")
            .ToArrayAsync();
        var settlementRequests = await dbContext.Set<SettlementRequest>()
            .AsNoTracking()
            .Where(request => request.SourceExpenseBillId == billId)
            .OrderBy(request => request.Id)
            .Select(request => $"{request.Status}:{request.Amount}:{request.Currency}:{request.ArchivedAtUtc}")
            .ToArrayAsync();

        return new BillSnapshot(
            bill.Status,
            bill.TotalAmount,
            bill.TotalCurrency,
            bill.ArchivedAtUtc,
            bill.UpdatedAtUtc,
            string.Join("|", bill.Items.OrderBy(item => item.Id).Select(item => $"{item.Amount}:{item.Currency}:{item.DeletedAtUtc}:{item.Splits.Count}")),
            string.Join("|", bill.Participants.OrderBy(participant => participant.UserProfileId).Select(participant => $"{participant.UserProfileId:D}:{participant.Status}:{participant.ResolvedShareAmount}:{participant.ResolvedShareCurrency}")),
            string.Join("|", bill.Payers.OrderBy(payer => payer.UserProfileId).Select(payer => $"{payer.UserProfileId:D}:{payer.Amount}:{payer.Currency}:{payer.PaymentMethodLabelSnapshot}")),
            string.Join("|", bill.Adjustments.OrderBy(adjustment => adjustment.Id).Select(adjustment => $"{adjustment.Type}:{adjustment.Direction}:{adjustment.AllocationMethod}:{adjustment.Amount}:{adjustment.Currency}")),
            string.Join("|", bill.Attachments.OrderBy(attachment => attachment.FileObjectId).Select(attachment => $"{attachment.FileObjectId:D}:{attachment.Purpose}:{attachment.RemovedAtUtc}")),
            string.Join("|", ocrReviews),
            string.Join("|", settlementRequests));
    }

    private static async Task<string> ReadSettlementRequestStatusAsync(
        WebApplicationFactory<Program> testFactory,
        Guid settlementRequestId)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<SettlementRequest>()
            .Where(request => request.Id == settlementRequestId)
            .Select(request => request.Status)
            .SingleAsync();
    }

    private static void AssertLifecycleOnlyChanged(
        BillSnapshot before,
        BillSnapshot after,
        DateTimeOffset expectedUpdatedAtUtc,
        bool expectedArchiveStateChanged)
    {
        Assert.Equal(before.Status, after.Status);
        Assert.Equal(before.TotalAmount, after.TotalAmount);
        Assert.Equal(before.TotalCurrency, after.TotalCurrency);
        Assert.Equal(before.ItemsShape, after.ItemsShape);
        Assert.Equal(before.ParticipantsShape, after.ParticipantsShape);
        Assert.Equal(before.PayersShape, after.PayersShape);
        Assert.Equal(before.AdjustmentsShape, after.AdjustmentsShape);
        Assert.Equal(before.AttachmentsShape, after.AttachmentsShape);
        Assert.Equal(before.OcrReviewsShape, after.OcrReviewsShape);
        Assert.Equal(before.SettlementRequestsShape, after.SettlementRequestsShape);
        Assert.Equal(expectedUpdatedAtUtc, after.UpdatedAtUtc);
        if (expectedArchiveStateChanged)
        {
            Assert.Equal(expectedUpdatedAtUtc, after.ArchivedAtUtc);
        }
        else
        {
            Assert.Null(after.ArchivedAtUtc);
        }
    }

    private static async Task<IReadOnlyList<Guid>> ReadBillIdsAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        return payload.RootElement.GetProperty("bills")
            .EnumerateArray()
            .Select(bill => bill.GetProperty("id").GetGuid())
            .ToArray();
    }

    private static async Task AssertLifecycleResponseAsync(
        HttpResponseMessage response,
        Guid billId,
        Guid? groupId,
        string expectedStatus,
        string expectedArchiveState,
        DateTimeOffset? archivedAtUtc,
        DateTimeOffset updatedAtUtc)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        Assert.Equal(billId, root.GetProperty("billId").GetGuid());
        if (groupId is null)
        {
            Assert.Equal(JsonValueKind.Null, root.GetProperty("groupId").ValueKind);
        }
        else
        {
            Assert.Equal(groupId.Value, root.GetProperty("groupId").GetGuid());
        }

        Assert.Equal(expectedStatus, root.GetProperty("status").GetString());
        Assert.Equal(expectedArchiveState, root.GetProperty("archiveState").GetString());
        if (archivedAtUtc is null)
        {
            Assert.Equal(JsonValueKind.Null, root.GetProperty("archivedAtUtc").ValueKind);
        }
        else
        {
            Assert.Equal(archivedAtUtc.Value, root.GetProperty("archivedAtUtc").GetDateTimeOffset());
        }

        Assert.Equal(updatedAtUtc, root.GetProperty("updatedAtUtc").GetDateTimeOffset());
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadLifecycleAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action == BillArchivedAction
                || auditEvent.Action == BillRestoredAction)
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Action)
            .ThenBy(auditEvent => auditEvent.Id)
            .ToArrayAsync();
    }

    private static void AssertSafeLifecycleAuditContent(
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

    private static string PersonalArchivePath(Guid billId)
    {
        return $"/api/v1/bills/{billId:D}/archive";
    }

    private static string PersonalRestorePath(Guid billId)
    {
        return $"/api/v1/bills/{billId:D}/restore";
    }

    private static string GroupArchivePath(Guid groupId, Guid billId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/archive";
    }

    private static string GroupRestorePath(Guid groupId, Guid billId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/restore";
    }

    private static async Task AssertBillUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(WrongRawToken, content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bill unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("The requested bill is unavailable.", payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertGroupBillUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(WrongRawToken, content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Group bill unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("The requested group bill is unavailable.", payload.RootElement.GetProperty("detail").GetString());
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
        BillLifecycleTestTimeProvider TimeProvider);

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

    private sealed record BillSnapshot(
        string Status,
        decimal TotalAmount,
        string TotalCurrency,
        DateTimeOffset? ArchivedAtUtc,
        DateTimeOffset UpdatedAtUtc,
        string ItemsShape,
        string ParticipantsShape,
        string PayersShape,
        string AdjustmentsShape,
        string AttachmentsShape,
        string OcrReviewsShape,
        string SettlementRequestsShape);

    private sealed class BillLifecycleTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public BillLifecycleTestTimeProvider(DateTimeOffset utcNow)
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
