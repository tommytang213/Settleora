using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Notifications;

internal sealed class NotificationDeliveryOutboxProcessor : INotificationDeliveryOutboxProcessor
{
    private static readonly HashSet<string> UnsafeQueuedReasons = new(StringComparer.Ordinal)
    {
        "source_domain_ineligible",
        "recipient_profile_unavailable",
        "recipient_unauthorized",
        "unsafe_delivery_attempt_request",
        "unsafe_notification_content",
        "unsafe_external_content"
    };

    private readonly SettleoraDbContext dbContext;
    private readonly INotificationDeliveryAttemptLeaseService leaseService;

    public NotificationDeliveryOutboxProcessor(
        SettleoraDbContext dbContext,
        INotificationDeliveryAttemptLeaseService leaseService)
    {
        this.dbContext = dbContext;
        this.leaseService = leaseService;
    }

    public async Task<NotificationDeliveryOutboxProcessingResult> ProcessAsync(
        NotificationDeliveryOutboxProcessingRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!IsSafeProcessingRequest(request))
        {
            return NotificationDeliveryOutboxProcessingResult.Skipped(
                request.DeliveryAttemptId,
                NotificationDeliveryAttemptStatuses.Suppressed,
                "unsafe_delivery_attempt_request",
                nextAttemptAtUtc: null,
                attemptCount: 0);
        }

        var lease = await leaseService.ClaimAsync(
            new NotificationDeliveryAttemptLeaseRequest(
                request.DeliveryAttemptId,
                request.WorkerId,
                request.ProcessedAtUtc,
                request.LeaseDuration),
            cancellationToken);
        if (!lease.Claimed)
        {
            return NotificationDeliveryOutboxProcessingResult.Skipped(
                request.DeliveryAttemptId,
                lease.Status,
                lease.Reason,
                nextAttemptAtUtc: null,
                lease.AttemptCount);
        }

        var attempt = await dbContext.Set<NotificationDeliveryAttempt>()
            .SingleAsync(
                deliveryAttempt => deliveryAttempt.Id == request.DeliveryAttemptId,
                cancellationToken);

        if (attempt.ExpiresAtUtc is not null && attempt.ExpiresAtUtc <= request.ProcessedAtUtc)
        {
            CompleteWithoutProvider(attempt, NotificationDeliveryAttemptStatuses.Expired, request.ProcessedAtUtc);
            await dbContext.SaveChangesAsync(cancellationToken);

            return NotificationDeliveryOutboxProcessingResult.ProcessedAttempt(
                attempt.Id,
                attempt.Status,
                attempt.StatusReason,
                attempt.NextAttemptAtUtc,
                attempt.AttemptCount);
        }

        if (UnsafeQueuedReasons.Contains(attempt.StatusReason))
        {
            CompleteWithoutProvider(attempt, NotificationDeliveryAttemptStatuses.Suppressed, request.ProcessedAtUtc);
            await dbContext.SaveChangesAsync(cancellationToken);

            return NotificationDeliveryOutboxProcessingResult.ProcessedAttempt(
                attempt.Id,
                attempt.Status,
                attempt.StatusReason,
                attempt.NextAttemptAtUtc,
                attempt.AttemptCount);
        }

        attempt.Status = NotificationDeliveryAttemptStatuses.Queued;
        attempt.NextAttemptAtUtc = request.ProcessedAtUtc.Add(request.RetryBackoff);
        attempt.LeaseOwner = null;
        attempt.LeaseExpiresAtUtc = null;
        attempt.UpdatedAtUtc = request.ProcessedAtUtc;
        await dbContext.SaveChangesAsync(cancellationToken);

        return NotificationDeliveryOutboxProcessingResult.ProcessedAttempt(
            attempt.Id,
            attempt.Status,
            attempt.StatusReason,
            attempt.NextAttemptAtUtc,
            attempt.AttemptCount);
    }

    private static void CompleteWithoutProvider(
        NotificationDeliveryAttempt attempt,
        string status,
        DateTimeOffset completedAtUtc)
    {
        attempt.Status = status;
        attempt.NextAttemptAtUtc = null;
        attempt.LeaseOwner = null;
        attempt.LeaseExpiresAtUtc = null;
        attempt.CompletedAtUtc = completedAtUtc;
        attempt.UpdatedAtUtc = completedAtUtc;
        attempt.RedactedProviderResultCategory = null;
    }

    private static bool IsSafeProcessingRequest(NotificationDeliveryOutboxProcessingRequest request)
    {
        return request.DeliveryAttemptId != Guid.Empty
            && request.WorkerId.Length is > 0 and <= NotificationDeliveryAttemptConstraints.LeaseOwnerMaxLength
            && request.WorkerId.Trim().Length == request.WorkerId.Length
            && request.LeaseDuration > TimeSpan.Zero
            && request.RetryBackoff > TimeSpan.Zero;
    }
}
