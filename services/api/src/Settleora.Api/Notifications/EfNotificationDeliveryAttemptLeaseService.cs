using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Notifications;

internal sealed class EfNotificationDeliveryAttemptLeaseService : INotificationDeliveryAttemptLeaseService
{
    private readonly SettleoraDbContext dbContext;

    public EfNotificationDeliveryAttemptLeaseService(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public async Task<NotificationDeliveryAttemptLeaseResult> ClaimAsync(
        NotificationDeliveryAttemptLeaseRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!IsSafeLeaseRequest(request))
        {
            return NotificationDeliveryAttemptLeaseResult.NotClaimed(
                request.DeliveryAttemptId,
                NotificationDeliveryAttemptStatuses.Suppressed,
                "unsafe_delivery_attempt_request",
                leaseOwner: null,
                leaseExpiresAtUtc: null,
                attemptCount: 0);
        }

        var attempt = await dbContext.Set<NotificationDeliveryAttempt>()
            .SingleOrDefaultAsync(
                deliveryAttempt => deliveryAttempt.Id == request.DeliveryAttemptId,
                cancellationToken);
        if (attempt is null)
        {
            return NotificationDeliveryAttemptLeaseResult.NotClaimed(
                request.DeliveryAttemptId,
                NotificationDeliveryAttemptStatuses.Suppressed,
                "recipient_profile_unavailable",
                leaseOwner: null,
                leaseExpiresAtUtc: null,
                attemptCount: 0);
        }

        if (!CanClaim(attempt, request.ClaimedAtUtc))
        {
            return NotificationDeliveryAttemptLeaseResult.NotClaimed(
                attempt.Id,
                attempt.Status,
                attempt.StatusReason,
                attempt.LeaseOwner,
                attempt.LeaseExpiresAtUtc,
                attempt.AttemptCount);
        }

        attempt.LeaseOwner = request.LeaseOwner;
        attempt.LeaseExpiresAtUtc = request.ClaimedAtUtc.Add(request.LeaseDuration);
        attempt.LastAttemptedAtUtc = request.ClaimedAtUtc;
        attempt.AttemptCount += 1;
        attempt.UpdatedAtUtc = request.ClaimedAtUtc;

        await dbContext.SaveChangesAsync(cancellationToken);

        return NotificationDeliveryAttemptLeaseResult.ClaimedAttempt(
            attempt.Id,
            attempt.Status,
            attempt.StatusReason,
            attempt.LeaseOwner,
            attempt.LeaseExpiresAtUtc.Value,
            attempt.AttemptCount);
    }

    private static bool CanClaim(NotificationDeliveryAttempt attempt, DateTimeOffset nowUtc)
    {
        return attempt.CompletedAtUtc is null
            && IsRunnableStatus(attempt.Status)
            && (attempt.NextAttemptAtUtc is null || attempt.NextAttemptAtUtc <= nowUtc)
            && (attempt.LeaseExpiresAtUtc is null || attempt.LeaseExpiresAtUtc <= nowUtc);
    }

    private static bool IsRunnableStatus(string status)
    {
        return string.Equals(status, NotificationDeliveryAttemptStatuses.Queued, StringComparison.Ordinal)
            || string.Equals(status, NotificationDeliveryAttemptStatuses.Deferred, StringComparison.Ordinal);
    }

    private static bool IsSafeLeaseRequest(NotificationDeliveryAttemptLeaseRequest request)
    {
        return request.DeliveryAttemptId != Guid.Empty
            && request.LeaseDuration > TimeSpan.Zero
            && request.LeaseOwner.Length is > 0 and <= NotificationDeliveryAttemptConstraints.LeaseOwnerMaxLength
            && request.LeaseOwner.Trim().Length == request.LeaseOwner.Length;
    }
}
