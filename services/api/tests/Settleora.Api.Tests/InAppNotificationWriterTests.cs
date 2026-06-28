using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Users;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class InAppNotificationWriterTests
{
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 16, 16, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task WriterCreatesSafeNotificationForActiveNonDeletedRecipient()
    {
        await using var dbContext = CreateDbContext();
        var recipientId = await SeedUserProfileAsync(dbContext, "Notification Recipient");
        var actorId = await SeedUserProfileAsync(dbContext, "Notification Actor");
        var writer = new EfInAppNotificationWriter(dbContext);

        var result = await writer.WriteAsync(new InAppNotificationWriteRequest(
            recipientId,
            actorId,
            InAppNotificationEventTypes.SettlementRequestCreated,
            InAppNotificationPriorities.Attention,
            InAppNotificationSubjectTypes.SettlementRequest,
            "notifications.settlement.request_created.title",
            "notifications.settlement.request_created.message",
            InitialTimestamp,
            ActionUrl: "/api/v1/settlements/11111111-1111-1111-1111-111111111111",
            ReceiptOcrReviewId: Guid.Parse("22222222-2222-2222-2222-222222222222"),
            ReceiptAttachmentFileId: Guid.Parse("33333333-3333-3333-3333-333333333333"),
            SyncOperationId: Guid.Parse("44444444-4444-4444-4444-444444444444")));
        await dbContext.SaveChangesAsync();

        Assert.True(result.Succeeded);
        var notification = Assert.Single(await dbContext.Set<InAppNotification>().AsNoTracking().ToListAsync());
        Assert.Equal(recipientId, notification.RecipientUserProfileId);
        Assert.Equal(actorId, notification.ActorUserProfileId);
        Assert.Equal(InAppNotificationStatuses.Unread, notification.Status);
        Assert.Equal(InAppNotificationEventTypes.SettlementRequestCreated, notification.EventType);
        Assert.Equal("/api/v1/settlements/11111111-1111-1111-1111-111111111111", notification.ActionUrl);
        Assert.Equal(Guid.Parse("22222222-2222-2222-2222-222222222222"), notification.ReceiptOcrReviewId);
        Assert.Equal(Guid.Parse("33333333-3333-3333-3333-333333333333"), notification.ReceiptAttachmentFileId);
        Assert.Equal(Guid.Parse("44444444-4444-4444-4444-444444444444"), notification.SyncOperationId);
    }

    [Fact]
    public async Task WriterSkipsDeletedRecipientSelfNotificationUnsafeMetadataAndPendingDuplicates()
    {
        await using var dbContext = CreateDbContext();
        var recipientId = await SeedUserProfileAsync(dbContext, "Notification Recipient");
        var deletedRecipientId = await SeedUserProfileAsync(
            dbContext,
            "Deleted Notification Recipient",
            deletedAtUtc: InitialTimestamp.AddMinutes(1));
        var actorId = await SeedUserProfileAsync(dbContext, "Notification Actor");
        var writer = new EfInAppNotificationWriter(dbContext);
        var validRequest = new InAppNotificationWriteRequest(
            recipientId,
            actorId,
            InAppNotificationEventTypes.BillSubmitted,
            InAppNotificationPriorities.Attention,
            InAppNotificationSubjectTypes.ExpenseBill,
            "notifications.bill.submitted.title",
            "notifications.bill.submitted.message",
            InitialTimestamp,
            ActionUrl: "/api/v1/bills/11111111-1111-1111-1111-111111111111");

        Assert.False((await writer.WriteAsync(new InAppNotificationWriteRequest(
            recipientId,
            recipientId,
            InAppNotificationEventTypes.BillSubmitted,
            InAppNotificationPriorities.Attention,
            InAppNotificationSubjectTypes.ExpenseBill,
            "notifications.bill.submitted.title",
            "notifications.bill.submitted.message",
            InitialTimestamp))).Succeeded);
        Assert.False((await writer.WriteAsync(new InAppNotificationWriteRequest(
            deletedRecipientId,
            actorId,
            InAppNotificationEventTypes.BillSubmitted,
            InAppNotificationPriorities.Attention,
            InAppNotificationSubjectTypes.ExpenseBill,
            "notifications.bill.submitted.title",
            "notifications.bill.submitted.message",
            InitialTimestamp))).Succeeded);
        Assert.False((await writer.WriteAsync(validRequest with
        {
            ActionUrl = "https://example.test/unsafe"
        })).Succeeded);
        Assert.False((await writer.WriteAsync(validRequest with
        {
            SafeSummary = " raw leading whitespace"
        })).Succeeded);
        Assert.False((await writer.WriteAsync(validRequest with
        {
            ReceiptOcrReviewId = Guid.Empty
        })).Succeeded);
        Assert.False((await writer.WriteAsync(validRequest with
        {
            ReceiptAttachmentFileId = Guid.Empty
        })).Succeeded);
        Assert.False((await writer.WriteAsync(validRequest with
        {
            SyncOperationId = Guid.Empty
        })).Succeeded);

        Assert.True((await writer.WriteAsync(validRequest)).Succeeded);
        Assert.False((await writer.WriteAsync(validRequest)).Succeeded);
        await dbContext.SaveChangesAsync();

        var notification = Assert.Single(await dbContext.Set<InAppNotification>().AsNoTracking().ToListAsync());
        Assert.Equal(recipientId, notification.RecipientUserProfileId);
        Assert.Equal(actorId, notification.ActorUserProfileId);
        Assert.Null(notification.SafeSummary);
    }

    private static SettleoraDbContext CreateDbContext()
    {
        return new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
    }

    private static async Task<Guid> SeedUserProfileAsync(
        SettleoraDbContext dbContext,
        string displayName,
        DateTimeOffset? deletedAtUtc = null)
    {
        var userProfileId = Guid.NewGuid();
        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
            DefaultCurrency = "USD",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            DeletedAtUtc = deletedAtUtc
        });
        await dbContext.SaveChangesAsync();

        return userProfileId;
    }
}
