using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.RecurringBills;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Sync;
using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Notifications;

public sealed class InAppNotification
{
    public Guid Id { get; set; }

    public Guid RecipientUserProfileId { get; set; }

    public UserProfile RecipientUserProfile { get; set; } = null!;

    public Guid? ActorUserProfileId { get; set; }

    public UserProfile? ActorUserProfile { get; set; }

    public string EventType { get; set; } = string.Empty;

    public string Status { get; set; } = InAppNotificationStatuses.Unread;

    public string Priority { get; set; } = InAppNotificationPriorities.Normal;

    public string SubjectType { get; set; } = string.Empty;

    public string TitleKey { get; set; } = string.Empty;

    public string MessageKey { get; set; } = string.Empty;

    public string? SafeSummary { get; set; }

    public string? ActionUrl { get; set; }

    public Guid? GroupId { get; set; }

    public UserGroup? Group { get; set; }

    public Guid? ExpenseBillId { get; set; }

    public ExpenseBill? ExpenseBill { get; set; }

    public Guid? ExpenseBillRevisionId { get; set; }

    public ExpenseBillRevision? ExpenseBillRevision { get; set; }

    public Guid? SettlementRequestId { get; set; }

    public SettlementRequest? SettlementRequest { get; set; }

    public Guid? SettlementPaymentId { get; set; }

    public SettlementPayment? SettlementPayment { get; set; }

    public Guid? RecurringBillTemplateId { get; set; }

    public RecurringBillTemplate? RecurringBillTemplate { get; set; }

    public Guid? RecurringBillOccurrenceId { get; set; }

    public RecurringBillOccurrence? RecurringBillOccurrence { get; set; }

    public Guid? ReceiptOcrReviewId { get; set; }

    public ReceiptOcrReview? ReceiptOcrReview { get; set; }

    public Guid? ReceiptAttachmentFileId { get; set; }

    public FileObject? ReceiptAttachmentFile { get; set; }

    public Guid? SyncOperationId { get; set; }

    public SyncOperation? SyncOperation { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset? ReadAtUtc { get; set; }

    public DateTimeOffset? ArchivedAtUtc { get; set; }
}
