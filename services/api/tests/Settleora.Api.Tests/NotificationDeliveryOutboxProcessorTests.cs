using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Users;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class NotificationDeliveryOutboxProcessorTests
{
    private static readonly DateTimeOffset ProcessingTime = new(2026, 7, 1, 6, 55, 0, TimeSpan.Zero);
    private static readonly TimeSpan LeaseDuration = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan RetryBackoff = TimeSpan.FromMinutes(15);

    [Fact]
    public async Task EligibleQueuedAttemptCanBeClaimedByOneWorkerLeaseOnly()
    {
        await using var dbContext = CreateDbContext();
        var attemptId = await SeedAttemptAsync(dbContext);
        var leaseService = new EfNotificationDeliveryAttemptLeaseService(dbContext);

        var first = await leaseService.ClaimAsync(CreateLeaseRequest(attemptId, "worker-a", ProcessingTime));
        var second = await leaseService.ClaimAsync(CreateLeaseRequest(attemptId, "worker-b", ProcessingTime.AddSeconds(1)));

        Assert.True(first.Claimed);
        Assert.Equal("worker-a", first.LeaseOwner);
        Assert.Equal(1, first.AttemptCount);
        Assert.False(second.Claimed);
        Assert.Equal("worker-a", second.LeaseOwner);
        Assert.Equal(1, second.AttemptCount);

        var attempt = await dbContext.Set<NotificationDeliveryAttempt>().SingleAsync();
        Assert.Equal(NotificationDeliveryAttemptStatuses.Queued, attempt.Status);
        Assert.Equal("worker-a", attempt.LeaseOwner);
        Assert.Equal(ProcessingTime.Add(LeaseDuration), attempt.LeaseExpiresAtUtc);
        Assert.Equal(ProcessingTime, attempt.LastAttemptedAtUtc);
        Assert.Equal(1, attempt.AttemptCount);
        Assert.Null(attempt.CompletedAtUtc);
        Assert.Null(attempt.RedactedProviderResultCategory);
    }

    [Fact]
    public async Task ExpiredLeaseAllowsDeterministicRetryClaim()
    {
        await using var dbContext = CreateDbContext();
        var attemptId = await SeedAttemptAsync(dbContext);
        var leaseService = new EfNotificationDeliveryAttemptLeaseService(dbContext);

        var first = await leaseService.ClaimAsync(CreateLeaseRequest(attemptId, "worker-a", ProcessingTime));
        var beforeExpiry = await leaseService.ClaimAsync(CreateLeaseRequest(attemptId, "worker-b", ProcessingTime.AddMinutes(4)));
        var afterExpiry = await leaseService.ClaimAsync(CreateLeaseRequest(attemptId, "worker-b", ProcessingTime.AddMinutes(5)));

        Assert.True(first.Claimed);
        Assert.False(beforeExpiry.Claimed);
        Assert.True(afterExpiry.Claimed);
        Assert.Equal("worker-b", afterExpiry.LeaseOwner);
        Assert.Equal(2, afterExpiry.AttemptCount);
    }

    [Fact]
    public async Task RetryBackoffPreventsEarlyProcessingAndRepeatedProcessingHasNoDuplicateEffects()
    {
        await using var dbContext = CreateDbContext();
        var attemptId = await SeedAttemptAsync(dbContext);
        var processor = CreateProcessor(dbContext);

        var first = await processor.ProcessAsync(CreateProcessingRequest(attemptId, "worker-a", ProcessingTime));
        var second = await processor.ProcessAsync(CreateProcessingRequest(attemptId, "worker-b", ProcessingTime.AddMinutes(1)));

        Assert.True(first.Processed);
        Assert.True(first.Claimed);
        Assert.Equal(NotificationDeliveryAttemptStatuses.Queued, first.Status);
        Assert.Equal(ProcessingTime.Add(RetryBackoff), first.NextAttemptAtUtc);
        Assert.False(second.Processed);
        Assert.False(second.Claimed);
        Assert.Equal(NotificationDeliveryAttemptStatuses.Queued, second.Status);
        Assert.Equal(1, second.AttemptCount);

        var attempt = await dbContext.Set<NotificationDeliveryAttempt>().SingleAsync();
        Assert.Equal(1, attempt.AttemptCount);
        Assert.Equal(ProcessingTime.Add(RetryBackoff), attempt.NextAttemptAtUtc);
        Assert.Null(attempt.LeaseOwner);
        Assert.Null(attempt.LeaseExpiresAtUtc);
        Assert.Null(attempt.CompletedAtUtc);
        Assert.Null(attempt.RedactedProviderResultCategory);
        Assert.False(NotificationDeliveryAttemptStatuses.IsProviderRuntimeStatus(attempt.Status));
    }

    [Fact]
    public async Task ExpiredAndUnsafeQueuedAttemptsTransitionOnlyToSafeTerminalStates()
    {
        await using var dbContext = CreateDbContext();
        var expiredId = await SeedAttemptAsync(
            dbContext,
            idempotencyKey: "notification-attempt:expired",
            expiresAtUtc: ProcessingTime.AddMinutes(-1));
        var sourceInvalidId = await SeedAttemptAsync(
            dbContext,
            idempotencyKey: "notification-attempt:source-invalid",
            statusReason: "source_domain_ineligible");
        var processor = CreateProcessor(dbContext);

        var expired = await processor.ProcessAsync(CreateProcessingRequest(expiredId, "worker-a", ProcessingTime));
        var sourceInvalid = await processor.ProcessAsync(CreateProcessingRequest(sourceInvalidId, "worker-b", ProcessingTime));

        Assert.True(expired.Processed);
        Assert.Equal(NotificationDeliveryAttemptStatuses.Expired, expired.Status);
        Assert.True(sourceInvalid.Processed);
        Assert.Equal(NotificationDeliveryAttemptStatuses.Suppressed, sourceInvalid.Status);

        var attempts = await dbContext.Set<NotificationDeliveryAttempt>()
            .AsNoTracking()
            .OrderBy(attempt => attempt.IdempotencyKey)
            .ToListAsync();
        Assert.All(attempts, attempt =>
        {
            Assert.NotEqual("sent", attempt.Status);
            Assert.NotEqual("delivered", attempt.Status);
            Assert.False(NotificationDeliveryAttemptStatuses.IsProviderRuntimeStatus(attempt.Status));
            Assert.NotNull(attempt.CompletedAtUtc);
            Assert.Null(attempt.RedactedProviderResultCategory);
            Assert.Null(attempt.LeaseOwner);
            Assert.Null(attempt.LeaseExpiresAtUtc);
        });
    }

    [Theory]
    [InlineData(NotificationDeliveryAttemptStatuses.Disabled, "disabled_by_policy")]
    [InlineData(NotificationDeliveryAttemptStatuses.Unconfigured, "provider_unconfigured")]
    [InlineData(NotificationDeliveryAttemptStatuses.Cancelled, "source_domain_ineligible")]
    [InlineData(NotificationDeliveryAttemptStatuses.Suppressed, "recipient_profile_unavailable")]
    [InlineData(NotificationDeliveryAttemptStatuses.Expired, "future_provider_eligible")]
    public async Task NonRunnableAttemptsAreSafeNoOpsWithoutFakeProviderSuccess(string status, string statusReason)
    {
        await using var dbContext = CreateDbContext();
        var attemptId = await SeedAttemptAsync(
            dbContext,
            idempotencyKey: $"notification-attempt:{status}:{Guid.NewGuid()}",
            status: status,
            statusReason: statusReason,
            completedAtUtc: status is NotificationDeliveryAttemptStatuses.Expired ? ProcessingTime.AddMinutes(-1) : null);
        var processor = CreateProcessor(dbContext);

        var result = await processor.ProcessAsync(CreateProcessingRequest(attemptId, "worker-a", ProcessingTime));

        Assert.False(result.Processed);
        Assert.False(result.Claimed);
        Assert.Equal(status, result.Status);
        Assert.False(NotificationDeliveryAttemptStatuses.IsProviderRuntimeStatus(result.Status));

        var attempt = await dbContext.Set<NotificationDeliveryAttempt>().SingleAsync();
        Assert.Equal(status, attempt.Status);
        Assert.Equal(0, attempt.AttemptCount);
        Assert.Null(attempt.LeaseOwner);
        Assert.Null(attempt.LeaseExpiresAtUtc);
        Assert.Null(attempt.RedactedProviderResultCategory);
    }

    [Fact]
    public async Task ProcessingDoesNotMutateInAppInboxOrSourceBusinessState()
    {
        await using var dbContext = CreateDbContext();
        var recipientId = await SeedUserProfileAsync(dbContext, "Recipient");
        var actorId = await SeedUserProfileAsync(dbContext, "Actor");
        var groupId = await SeedGroupAsync(dbContext, actorId);
        var notificationId = Guid.NewGuid();
        dbContext.Set<InAppNotification>().Add(new InAppNotification
        {
            Id = notificationId,
            RecipientUserProfileId = recipientId,
            ActorUserProfileId = actorId,
            EventType = InAppNotificationEventTypes.BillSubmitted,
            Status = InAppNotificationStatuses.Unread,
            Priority = InAppNotificationPriorities.Attention,
            SubjectType = InAppNotificationSubjectTypes.ExpenseBill,
            TitleKey = "notifications.bill.submitted.title",
            MessageKey = "notifications.bill.submitted.message",
            GroupId = groupId,
            CreatedAtUtc = ProcessingTime
        });
        var attemptId = await SeedAttemptAsync(
            dbContext,
            recipientId: recipientId,
            actorId: actorId,
            groupId: groupId,
            inAppNotificationId: notificationId);
        var processor = CreateProcessor(dbContext);

        var result = await processor.ProcessAsync(CreateProcessingRequest(attemptId, "worker-a", ProcessingTime));

        Assert.True(result.Processed);
        var notification = await dbContext.Set<InAppNotification>().SingleAsync();
        Assert.Equal(InAppNotificationStatuses.Unread, notification.Status);
        Assert.Null(notification.ReadAtUtc);
        Assert.Null(notification.ArchivedAtUtc);

        var group = await dbContext.Set<UserGroup>().SingleAsync();
        Assert.Equal("Shared Dinner", group.Name);
        Assert.Equal(ProcessingTime, group.CreatedAtUtc);
        Assert.Equal(ProcessingTime, group.UpdatedAtUtc);
        Assert.Null(group.DeletedAtUtc);
    }

    [Fact]
    public async Task EmailAttemptUsesSmtpBoundaryAndStoresOnlyRedactedProviderCategory()
    {
        await using var dbContext = CreateDbContext();
        var attemptId = await SeedAttemptAsync(
            dbContext,
            idempotencyKey: "notification-attempt:smtp-accepted");
        var processor = CreateProcessor(dbContext, new FakeSmtpEmailNotificationSender(
            SmtpEmailNotificationSendResult.AcceptedByProvider()));

        var result = await processor.ProcessAsync(CreateProcessingRequest(attemptId, "worker-a", ProcessingTime));

        Assert.True(result.Processed);
        Assert.Equal(NotificationDeliveryAttemptStatuses.Queued, result.Status);
        Assert.Null(result.NextAttemptAtUtc);

        var attempt = await dbContext.Set<NotificationDeliveryAttempt>().SingleAsync();
        Assert.Equal(NotificationDeliveryAttemptStatuses.Queued, attempt.Status);
        Assert.Equal(NotificationChannelDecisionReasons.FutureProviderEligible, attempt.StatusReason);
        Assert.Equal(SmtpEmailNotificationResultCategories.Accepted, attempt.RedactedProviderResultCategory);
        Assert.Equal(ProcessingTime, attempt.CompletedAtUtc);
        Assert.False(NotificationDeliveryAttemptStatuses.IsProviderRuntimeStatus(attempt.Status));
    }

    [Fact]
    public async Task DisabledAndUnconfiguredSmtpResultsDoNotBecomeFakeSentSuccess()
    {
        await using var dbContext = CreateDbContext();
        var disabledId = await SeedAttemptAsync(
            dbContext,
            idempotencyKey: "notification-attempt:smtp-disabled");
        var unconfiguredId = await SeedAttemptAsync(
            dbContext,
            idempotencyKey: "notification-attempt:smtp-unconfigured");

        var disabledProcessor = CreateProcessor(dbContext, new FakeSmtpEmailNotificationSender(
            SmtpEmailNotificationSendResult.DisabledByConfiguration()));
        var disabled = await disabledProcessor.ProcessAsync(CreateProcessingRequest(disabledId, "worker-a", ProcessingTime));

        var unconfiguredProcessor = CreateProcessor(dbContext, new FakeSmtpEmailNotificationSender(
            SmtpEmailNotificationSendResult.ProviderUnconfigured()));
        var unconfigured = await unconfiguredProcessor.ProcessAsync(CreateProcessingRequest(unconfiguredId, "worker-b", ProcessingTime));

        Assert.Equal(NotificationDeliveryAttemptStatuses.Disabled, disabled.Status);
        Assert.Equal(NotificationDeliveryAttemptStatuses.Unconfigured, unconfigured.Status);

        var attempts = await dbContext.Set<NotificationDeliveryAttempt>()
            .AsNoTracking()
            .OrderBy(attempt => attempt.IdempotencyKey)
            .ToListAsync();
        Assert.All(attempts, attempt =>
        {
            Assert.NotEqual("sent", attempt.Status);
            Assert.NotEqual("delivered", attempt.Status);
            Assert.False(NotificationDeliveryAttemptStatuses.IsProviderRuntimeStatus(attempt.Status));
            Assert.NotNull(attempt.CompletedAtUtc);
            Assert.True(
                attempt.RedactedProviderResultCategory is SmtpEmailNotificationResultCategories.DisabledByConfiguration
                    or SmtpEmailNotificationResultCategories.ProviderUnconfigured,
                $"Unexpected SMTP result category: {attempt.RedactedProviderResultCategory}");
        });
    }

    [Fact]
    public void OutboxFoundationHasOnlyInternalSmtpProviderRuntimeAndNoPushOrDeviceTokenDependencies()
    {
        AssertConstructorDependencies(
            typeof(EfNotificationDeliveryAttemptLeaseService),
            [typeof(SettleoraDbContext)]);
        AssertConstructorDependencies(
            typeof(NotificationDeliveryOutboxProcessor),
            [typeof(SettleoraDbContext), typeof(INotificationDeliveryAttemptLeaseService), typeof(ISmtpEmailNotificationSender)]);
        Assert.DoesNotContain(
            typeof(NotificationDeliveryOutboxProcessor).Assembly.GetTypes().Select(type => type.Name),
            name => name.Contains("PushProvider", StringComparison.OrdinalIgnoreCase)
                || name.Contains("DeviceToken", StringComparison.OrdinalIgnoreCase)
                || name.Contains("Apns", StringComparison.OrdinalIgnoreCase)
                || name.Contains("Fcm", StringComparison.OrdinalIgnoreCase));
    }

    private static NotificationDeliveryAttemptLeaseRequest CreateLeaseRequest(
        Guid attemptId,
        string leaseOwner,
        DateTimeOffset claimedAtUtc)
    {
        return new NotificationDeliveryAttemptLeaseRequest(
            attemptId,
            leaseOwner,
            claimedAtUtc,
            LeaseDuration);
    }

    private static NotificationDeliveryOutboxProcessingRequest CreateProcessingRequest(
        Guid attemptId,
        string workerId,
        DateTimeOffset processedAtUtc)
    {
        return new NotificationDeliveryOutboxProcessingRequest(
            attemptId,
            workerId,
            processedAtUtc,
            LeaseDuration,
            RetryBackoff);
    }

    private static INotificationDeliveryOutboxProcessor CreateProcessor(
        SettleoraDbContext dbContext,
        ISmtpEmailNotificationSender? smtpEmailSender = null)
    {
        return new NotificationDeliveryOutboxProcessor(
            dbContext,
            new EfNotificationDeliveryAttemptLeaseService(dbContext),
            smtpEmailSender ?? new FakeSmtpEmailNotificationSender(
                SmtpEmailNotificationSendResult.FailedTransient(
                    SmtpEmailNotificationResultCategories.ProviderUnavailable)));
    }

    private static async Task<Guid> SeedAttemptAsync(
        SettleoraDbContext dbContext,
        string idempotencyKey = "notification-attempt:queued",
        string status = NotificationDeliveryAttemptStatuses.Queued,
        string statusReason = "future_provider_eligible",
        DateTimeOffset? nextAttemptAtUtc = null,
        DateTimeOffset? expiresAtUtc = null,
        DateTimeOffset? completedAtUtc = null,
        Guid? recipientId = null,
        Guid? actorId = null,
        Guid? groupId = null,
        Guid? inAppNotificationId = null)
    {
        var resolvedRecipientId = recipientId ?? await SeedUserProfileAsync(dbContext, $"Recipient {Guid.NewGuid()}");
        var attemptId = Guid.NewGuid();
        dbContext.Set<NotificationDeliveryAttempt>().Add(new NotificationDeliveryAttempt
        {
            Id = attemptId,
            InAppNotificationId = inAppNotificationId,
            RecipientUserProfileId = resolvedRecipientId,
            ActorUserProfileId = actorId,
            EventType = InAppNotificationEventTypes.BillSubmitted,
            SubjectType = InAppNotificationSubjectTypes.ExpenseBill,
            Channel = NotificationChannels.Email,
            Status = status,
            StatusReason = statusReason,
            IdempotencyKey = idempotencyKey,
            AttemptCount = 0,
            NextAttemptAtUtc = nextAttemptAtUtc,
            ExpiresAtUtc = expiresAtUtc,
            CreatedAtUtc = ProcessingTime,
            UpdatedAtUtc = ProcessingTime,
            CompletedAtUtc = completedAtUtc,
            GroupId = groupId
        });
        await dbContext.SaveChangesAsync();

        return attemptId;
    }

    private static async Task<Guid> SeedUserProfileAsync(SettleoraDbContext dbContext, string displayName)
    {
        var userProfileId = Guid.NewGuid();
        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
            DefaultCurrency = "USD",
            CreatedAtUtc = ProcessingTime,
            UpdatedAtUtc = ProcessingTime
        });
        await dbContext.SaveChangesAsync();

        return userProfileId;
    }

    private static async Task<Guid> SeedGroupAsync(SettleoraDbContext dbContext, Guid createdByUserProfileId)
    {
        var groupId = Guid.NewGuid();
        dbContext.Set<UserGroup>().Add(new UserGroup
        {
            Id = groupId,
            Name = "Shared Dinner",
            CreatedByUserProfileId = createdByUserProfileId,
            CreatedAtUtc = ProcessingTime,
            UpdatedAtUtc = ProcessingTime
        });
        await dbContext.SaveChangesAsync();

        return groupId;
    }

    private static void AssertConstructorDependencies(Type implementationType, Type[] expectedParameterTypes)
    {
        var constructor = Assert.Single(implementationType.GetConstructors());
        Assert.Equal(expectedParameterTypes, constructor.GetParameters().Select(parameter => parameter.ParameterType));
    }

    private static SettleoraDbContext CreateDbContext()
    {
        return new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
    }

    private sealed class FakeSmtpEmailNotificationSender : ISmtpEmailNotificationSender
    {
        private readonly SmtpEmailNotificationSendResult result;

        public FakeSmtpEmailNotificationSender(SmtpEmailNotificationSendResult result)
        {
            this.result = result;
        }

        public Task<SmtpEmailNotificationSendResult> SendAsync(
            SmtpEmailNotificationSendRequest request,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(result);
        }
    }
}
