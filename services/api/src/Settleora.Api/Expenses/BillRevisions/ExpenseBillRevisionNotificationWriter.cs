using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;

namespace Settleora.Api.Expenses.BillRevisions;

internal sealed class ExpenseBillRevisionNotificationWriter
{
    private readonly IInAppNotificationWriter notificationWriter;

    public ExpenseBillRevisionNotificationWriter(IInAppNotificationWriter notificationWriter)
    {
        this.notificationWriter = notificationWriter;
    }

    public Task WriteProposedAsync(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid actorUserProfileId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return WriteRevisionNotificationsAsync(
            bill,
            revision,
            actorUserProfileId,
            InAppNotificationEventTypes.BillRevisionProposed,
            InAppNotificationPriorities.Attention,
            "Bill revision was proposed.",
            PendingReviewRecipientIds(revision),
            now,
            cancellationToken);
    }

    public Task WriteResubmittedAsync(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid actorUserProfileId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return WriteRevisionNotificationsAsync(
            bill,
            revision,
            actorUserProfileId,
            InAppNotificationEventTypes.BillRevisionResubmitted,
            InAppNotificationPriorities.Attention,
            "Bill revision was resubmitted for review.",
            PendingReviewRecipientIds(revision),
            now,
            cancellationToken);
    }

    public Task WriteSubmittedAsync(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid actorUserProfileId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return WriteRevisionNotificationsAsync(
            bill,
            revision,
            actorUserProfileId,
            InAppNotificationEventTypes.BillRevisionSubmitted,
            InAppNotificationPriorities.Attention,
            "Bill revision is ready for review.",
            PendingReviewRecipientIds(revision),
            now,
            cancellationToken);
    }

    public Task WriteWithdrawnAsync(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid actorUserProfileId,
        string previousRevisionStatus,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var recipientIds = previousRevisionStatus == ExpenseBillRevisionStatuses.SubmittedForReview
            ? PendingReviewRecipientIds(revision)
            : Enumerable.Empty<Guid>();

        return WriteRevisionNotificationsAsync(
            bill,
            revision,
            actorUserProfileId,
            InAppNotificationEventTypes.BillRevisionWithdrawn,
            InAppNotificationPriorities.Normal,
            "Bill revision was withdrawn.",
            recipientIds,
            now,
            cancellationToken);
    }

    public Task WriteApprovedAsync(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid actorUserProfileId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return WriteRevisionNotificationsAsync(
            bill,
            revision,
            actorUserProfileId,
            InAppNotificationEventTypes.BillRevisionApproved,
            InAppNotificationPriorities.Normal,
            "Bill revision was approved.",
            CreatorAndOwnerRecipientIds(bill, revision),
            now,
            cancellationToken);
    }

    public Task WriteRejectedAsync(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid actorUserProfileId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return WriteRevisionNotificationsAsync(
            bill,
            revision,
            actorUserProfileId,
            InAppNotificationEventTypes.BillRevisionRejected,
            InAppNotificationPriorities.Attention,
            "Bill revision was rejected.",
            CreatorAndOwnerRecipientIds(bill, revision),
            now,
            cancellationToken);
    }

    public Task WritePayerConfirmedAsync(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid actorUserProfileId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return WriteRevisionNotificationsAsync(
            bill,
            revision,
            actorUserProfileId,
            InAppNotificationEventTypes.BillRevisionPayerConfirmed,
            InAppNotificationPriorities.Normal,
            "Bill revision payer confirmation was completed.",
            CreatorAndOwnerRecipientIds(bill, revision),
            now,
            cancellationToken);
    }

    public Task WriteAppliedAsync(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid actorUserProfileId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        return WriteRevisionNotificationsAsync(
            bill,
            revision,
            actorUserProfileId,
            InAppNotificationEventTypes.BillRevisionApplied,
            InAppNotificationPriorities.Attention,
            "Bill revision was applied.",
            AppliedRecipientIds(bill, revision),
            now,
            cancellationToken);
    }

    private async Task WriteRevisionNotificationsAsync(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid actorUserProfileId,
        string eventType,
        string priority,
        string safeSummary,
        IEnumerable<Guid> recipientIds,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        foreach (var recipientId in recipientIds
            .Where(recipientId => recipientId != Guid.Empty && recipientId != actorUserProfileId)
            .Distinct()
            .Order())
        {
            await notificationWriter.WriteAsync(
                new InAppNotificationWriteRequest(
                    recipientId,
                    actorUserProfileId,
                    eventType,
                    priority,
                    InAppNotificationSubjectTypes.ExpenseBill,
                    TitleKey(eventType),
                    MessageKey(eventType),
                    now,
                    SafeSummary: safeSummary,
                    ActionUrl: RevisionActionUrl(bill, revision),
                    GroupId: bill.GroupId,
                    ExpenseBillId: bill.Id,
                    ExpenseBillRevisionId: revision.Id),
                cancellationToken);
        }
    }

    private static IEnumerable<Guid> PendingReviewRecipientIds(ExpenseBillRevision revision)
    {
        foreach (var approval in revision.Approvals)
        {
            if (approval.Status == ExpenseBillRevisionApprovalStatuses.PendingReview)
            {
                yield return approval.ParticipantUserProfileId;
            }
        }

        foreach (var payer in revision.Payers)
        {
            if (payer.RequiresPayerConfirmation
                && payer.PayerConfirmationStatus == ExpenseBillPayerConfirmationStatuses.PendingConfirmation)
            {
                yield return payer.UserProfileId;
            }
        }
    }

    private static IEnumerable<Guid> CreatorAndOwnerRecipientIds(
        ExpenseBill bill,
        ExpenseBillRevision revision)
    {
        yield return revision.ProposalCreatorUserProfileId;

        if (bill.BillOwnerUserProfileId != Guid.Empty)
        {
            yield return bill.BillOwnerUserProfileId;
        }
    }

    private static IEnumerable<Guid> AppliedRecipientIds(
        ExpenseBill bill,
        ExpenseBillRevision revision)
    {
        foreach (var participant in revision.Participants)
        {
            if (participant.AffectedByRevision)
            {
                yield return participant.UserProfileId;
            }
        }

        foreach (var payer in revision.Payers)
        {
            yield return payer.UserProfileId;
        }

        foreach (var recipientId in CreatorAndOwnerRecipientIds(bill, revision))
        {
            yield return recipientId;
        }
    }

    private static string RevisionActionUrl(ExpenseBill bill, ExpenseBillRevision revision)
    {
        return $"/api/v1/bills/{bill.Id:D}/revisions/{revision.Id:D}";
    }

    private static string TitleKey(string eventType)
    {
        return $"notifications.{eventType}.title";
    }

    private static string MessageKey(string eventType)
    {
        return $"notifications.{eventType}.message";
    }
}
