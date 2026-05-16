using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Notifications;

internal sealed class EfInAppNotificationWriter : IInAppNotificationWriter
{
    private readonly SettleoraDbContext dbContext;

    public EfInAppNotificationWriter(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public async Task<InAppNotificationWriteResult> WriteAsync(
        InAppNotificationWriteRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!IsSafeRequest(request))
        {
            return InAppNotificationWriteResult.Skipped();
        }

        if (!request.AllowSelfNotification
            && request.ActorUserProfileId == request.RecipientUserProfileId)
        {
            return InAppNotificationWriteResult.Skipped();
        }

        if (HasPendingDuplicate(request))
        {
            return InAppNotificationWriteResult.Skipped();
        }

        var recipientExists = await dbContext.Set<UserProfile>()
            .AsNoTracking()
            .AnyAsync(
                profile => profile.Id == request.RecipientUserProfileId
                    && profile.DeletedAtUtc == null,
                cancellationToken);
        if (!recipientExists)
        {
            return InAppNotificationWriteResult.Skipped();
        }

        var notification = new InAppNotification
        {
            Id = Guid.NewGuid(),
            RecipientUserProfileId = request.RecipientUserProfileId,
            ActorUserProfileId = request.ActorUserProfileId,
            EventType = request.EventType,
            Status = InAppNotificationStatuses.Unread,
            Priority = request.Priority,
            SubjectType = request.SubjectType,
            TitleKey = request.TitleKey,
            MessageKey = request.MessageKey,
            SafeSummary = NormalizeOptionalText(request.SafeSummary),
            ActionUrl = NormalizeOptionalText(request.ActionUrl),
            GroupId = request.GroupId,
            ExpenseBillId = request.ExpenseBillId,
            ExpenseBillRevisionId = request.ExpenseBillRevisionId,
            SettlementRequestId = request.SettlementRequestId,
            SettlementPaymentId = request.SettlementPaymentId,
            RecurringBillTemplateId = request.RecurringBillTemplateId,
            RecurringBillOccurrenceId = request.RecurringBillOccurrenceId,
            CreatedAtUtc = request.CreatedAtUtc
        };

        dbContext.Set<InAppNotification>().Add(notification);
        return InAppNotificationWriteResult.Created();
    }

    private bool HasPendingDuplicate(InAppNotificationWriteRequest request)
    {
        return dbContext.ChangeTracker
            .Entries<InAppNotification>()
            .Any(entry =>
            {
                var notification = entry.Entity;
                return notification.RecipientUserProfileId == request.RecipientUserProfileId
                    && notification.ActorUserProfileId == request.ActorUserProfileId
                    && notification.EventType == request.EventType
                    && notification.SubjectType == request.SubjectType
                    && notification.GroupId == request.GroupId
                    && notification.ExpenseBillId == request.ExpenseBillId
                    && notification.ExpenseBillRevisionId == request.ExpenseBillRevisionId
                    && notification.SettlementRequestId == request.SettlementRequestId
                    && notification.SettlementPaymentId == request.SettlementPaymentId
                    && notification.RecurringBillTemplateId == request.RecurringBillTemplateId
                    && notification.RecurringBillOccurrenceId == request.RecurringBillOccurrenceId
                    && notification.Status == InAppNotificationStatuses.Unread;
            });
    }

    private static bool IsSafeRequest(InAppNotificationWriteRequest request)
    {
        return request.RecipientUserProfileId != Guid.Empty
            && IsOptionalProfileIdSafe(request.ActorUserProfileId)
            && InAppNotificationEventTypes.IsSupported(request.EventType)
            && InAppNotificationPriorities.IsSupported(request.Priority)
            && InAppNotificationSubjectTypes.IsSupported(request.SubjectType)
            && IsRequiredTextSafe(request.TitleKey, InAppNotificationConstraints.TemplateKeyMaxLength)
            && IsRequiredTextSafe(request.MessageKey, InAppNotificationConstraints.TemplateKeyMaxLength)
            && IsOptionalTextSafe(request.SafeSummary, InAppNotificationConstraints.SafeSummaryMaxLength)
            && IsActionUrlSafe(request.ActionUrl);
    }

    private static bool IsOptionalProfileIdSafe(Guid? profileId)
    {
        return profileId is null || profileId.Value != Guid.Empty;
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

    private static bool IsActionUrlSafe(string? actionUrl)
    {
        return actionUrl is null
            || (IsOptionalTextSafe(actionUrl, InAppNotificationConstraints.ActionUrlMaxLength)
                && actionUrl.StartsWith("/api/v1/", StringComparison.Ordinal)
                && !actionUrl.Contains("://", StringComparison.Ordinal)
                && !actionUrl.Contains('\\', StringComparison.Ordinal));
    }

    private static string? NormalizeOptionalText(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }
}
