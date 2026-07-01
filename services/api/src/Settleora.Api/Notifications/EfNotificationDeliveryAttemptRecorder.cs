using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Notifications;

internal sealed class EfNotificationDeliveryAttemptRecorder : INotificationDeliveryAttemptRecorder
{
    private static readonly HashSet<string> AllowedExternalChannels = new(StringComparer.Ordinal)
    {
        NotificationChannels.Email,
        NotificationChannels.MobilePush
    };

    private readonly SettleoraDbContext dbContext;

    public EfNotificationDeliveryAttemptRecorder(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public async Task<NotificationDeliveryAttemptRecordResult> RecordAsync(
        NotificationDeliveryAttemptRecordRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!IsSafeRequest(request))
        {
            return NotificationDeliveryAttemptRecordResult.Skipped(
                NotificationDeliveryAttemptStatuses.Suppressed,
                "unsafe_delivery_attempt_request");
        }

        var decision = request.DecisionEnvelope.Channels.Single(channel =>
            string.Equals(channel.Channel, request.Channel, StringComparison.Ordinal));

        if (!request.SourceDomainEligible)
        {
            return NotificationDeliveryAttemptRecordResult.Skipped(
                NotificationDeliveryAttemptStatuses.Suppressed,
                "source_domain_ineligible");
        }

        if (!string.Equals(decision.State, NotificationChannelDecisionStates.EligibleForFutureProvider, StringComparison.Ordinal))
        {
            return NotificationDeliveryAttemptRecordResult.Skipped(
                MapDecisionState(decision.State),
                decision.Reason);
        }

        if (!string.Equals(decision.Reason, NotificationChannelDecisionReasons.FutureProviderEligible, StringComparison.Ordinal)
            && !string.Equals(decision.Reason, NotificationChannelDecisionReasons.RequiredBypassPolicyNotConfigured, StringComparison.Ordinal))
        {
            return NotificationDeliveryAttemptRecordResult.Skipped(
                NotificationDeliveryAttemptStatuses.Suppressed,
                decision.Reason);
        }

        var existing = await dbContext.Set<NotificationDeliveryAttempt>()
            .AsNoTracking()
            .Where(attempt => attempt.IdempotencyKey == request.IdempotencyKey)
            .Select(attempt => new
            {
                attempt.Id,
                attempt.Status,
                attempt.StatusReason
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (existing is not null)
        {
            return NotificationDeliveryAttemptRecordResult.Existing(
                existing.Id,
                existing.Status,
                existing.StatusReason);
        }

        var recipientExists = await dbContext.Set<UserProfile>()
            .AsNoTracking()
            .AnyAsync(
                profile => profile.Id == request.DecisionEnvelope.RecipientUserProfileId
                    && profile.DeletedAtUtc == null,
                cancellationToken);
        if (!recipientExists)
        {
            return NotificationDeliveryAttemptRecordResult.Skipped(
                NotificationDeliveryAttemptStatuses.Suppressed,
                "recipient_profile_unavailable");
        }

        var deliveryAttempt = new NotificationDeliveryAttempt
        {
            Id = Guid.NewGuid(),
            InAppNotificationId = request.InAppNotificationId,
            RecipientUserProfileId = request.DecisionEnvelope.RecipientUserProfileId,
            ActorUserProfileId = request.DecisionEnvelope.ActorUserProfileId,
            EventType = request.DecisionEnvelope.EventType,
            SubjectType = request.DecisionEnvelope.SubjectType,
            Channel = request.Channel,
            Status = NotificationDeliveryAttemptStatuses.Queued,
            StatusReason = decision.Reason,
            IdempotencyKey = request.IdempotencyKey,
            SourceCorrelationId = NormalizeOptionalText(request.SourceCorrelationId),
            AttemptCount = 0,
            NextAttemptAtUtc = request.NextAttemptAtUtc,
            ExpiresAtUtc = request.ExpiresAtUtc,
            CreatedAtUtc = request.CreatedAtUtc,
            UpdatedAtUtc = request.CreatedAtUtc,
            CompletedAtUtc = null,
            RedactedProviderResultCategory = null,
            GroupId = request.GroupId ?? request.DecisionEnvelope.GroupId,
            ExpenseBillId = request.ExpenseBillId,
            ExpenseBillRevisionId = request.ExpenseBillRevisionId,
            SettlementRequestId = request.SettlementRequestId,
            SettlementPaymentId = request.SettlementPaymentId,
            RecurringBillTemplateId = request.RecurringBillTemplateId,
            RecurringBillOccurrenceId = request.RecurringBillOccurrenceId,
            ReceiptOcrReviewId = request.ReceiptOcrReviewId,
            ReceiptAttachmentFileId = request.ReceiptAttachmentFileId,
            SyncOperationId = request.SyncOperationId
        };

        dbContext.Set<NotificationDeliveryAttempt>().Add(deliveryAttempt);
        return NotificationDeliveryAttemptRecordResult.CreatedAttempt(
            deliveryAttempt.Id,
            deliveryAttempt.Status,
            deliveryAttempt.StatusReason);
    }

    private static bool IsSafeRequest(NotificationDeliveryAttemptRecordRequest request)
    {
        return AllowedExternalChannels.Contains(request.Channel)
            && request.DecisionEnvelope.RecipientUserProfileId != Guid.Empty
            && InAppNotificationEventTypes.IsSupported(request.DecisionEnvelope.EventType)
            && InAppNotificationSubjectTypes.IsSupported(request.DecisionEnvelope.SubjectType)
            && IsRequiredTextSafe(request.IdempotencyKey, NotificationDeliveryAttemptConstraints.IdempotencyKeyMaxLength)
            && IsOptionalTextSafe(request.SourceCorrelationId, NotificationDeliveryAttemptConstraints.SourceCorrelationIdMaxLength)
            && IsOptionalTargetIdSafe(request.InAppNotificationId)
            && IsOptionalTargetIdSafe(request.GroupId)
            && IsOptionalTargetIdSafe(request.ExpenseBillId)
            && IsOptionalTargetIdSafe(request.ExpenseBillRevisionId)
            && IsOptionalTargetIdSafe(request.SettlementRequestId)
            && IsOptionalTargetIdSafe(request.SettlementPaymentId)
            && IsOptionalTargetIdSafe(request.RecurringBillTemplateId)
            && IsOptionalTargetIdSafe(request.RecurringBillOccurrenceId)
            && IsOptionalTargetIdSafe(request.ReceiptOcrReviewId)
            && IsOptionalTargetIdSafe(request.ReceiptAttachmentFileId)
            && IsOptionalTargetIdSafe(request.SyncOperationId);
    }

    private static string MapDecisionState(string decisionState)
    {
        return decisionState switch
        {
            NotificationChannelDecisionStates.Disabled => NotificationDeliveryAttemptStatuses.Disabled,
            NotificationChannelDecisionStates.Unconfigured => NotificationDeliveryAttemptStatuses.Unconfigured,
            NotificationChannelDecisionStates.Deferred => NotificationDeliveryAttemptStatuses.Deferred,
            NotificationChannelDecisionStates.Unsupported or NotificationChannelDecisionStates.Skipped => NotificationDeliveryAttemptStatuses.Suppressed,
            _ => NotificationDeliveryAttemptStatuses.NotApplicable
        };
    }

    private static bool IsRequiredTextSafe(string value, int maxLength)
    {
        return value.Length is > 0
            && value.Length <= maxLength
            && value.Trim().Length == value.Length;
    }

    private static bool IsOptionalTextSafe(string? value, int maxLength)
    {
        return value is null
            || (value.Length > 0
                && value.Length <= maxLength
                && value.Trim().Length == value.Length);
    }

    private static bool IsOptionalTargetIdSafe(Guid? targetId)
    {
        return targetId is null || targetId.Value != Guid.Empty;
    }

    private static string? NormalizeOptionalText(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }
}
