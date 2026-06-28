using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Expenses;

public sealed class ReceiptOcrReviewAssignment
{
    public Guid Id { get; set; }

    public Guid ReceiptOcrReviewId { get; set; }

    public ReceiptOcrReview ReceiptOcrReview { get; set; } = null!;

    public Guid ExpenseBillId { get; set; }

    public Guid FileObjectId { get; set; }

    public Guid? GroupId { get; set; }

    public UserGroup? Group { get; set; }

    public string AssignmentStatus { get; set; } = ReceiptOcrReviewAssignmentStatuses.NeedsReview;

    public Guid AssignedToUserProfileId { get; set; }

    public UserProfile AssignedToUserProfile { get; set; } = null!;

    public Guid? AssignedByUserProfileId { get; set; }

    public UserProfile? AssignedByUserProfile { get; set; }

    public string AssignmentSource { get; set; } = ReceiptOcrReviewAssignmentSources.ManualAssignment;

    public Guid? SourceActorUserProfileId { get; set; }

    public UserProfile? SourceActorUserProfile { get; set; }

    public string? SourceCorrelationId { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? CompletedAtUtc { get; set; }

    public DateTimeOffset? CancelledAtUtc { get; set; }

    public DateTimeOffset? SupersededAtUtc { get; set; }
}
