using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Settlements;

public sealed class SettlementProofAttachment
{
    public Guid SettlementPaymentId { get; set; }

    public SettlementPayment SettlementPayment { get; set; } = null!;

    public Guid FileObjectId { get; set; }

    public FileObject FileObject { get; set; } = null!;

    public Guid CreatedByUserProfileId { get; set; }

    public UserProfile CreatedByUserProfile { get; set; } = null!;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset? RemovedAtUtc { get; set; }
}
