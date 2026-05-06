using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Expenses;

public sealed class ExpenseBillAttachment
{
    public Guid ExpenseBillId { get; set; }

    public ExpenseBill ExpenseBill { get; set; } = null!;

    public Guid FileObjectId { get; set; }

    public FileObject FileObject { get; set; } = null!;

    public string Purpose { get; set; } = ExpenseBillAttachmentPurposes.Receipt;

    public Guid CreatedByUserProfileId { get; set; }

    public UserProfile CreatedByUserProfile { get; set; } = null!;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset? RemovedAtUtc { get; set; }
}
