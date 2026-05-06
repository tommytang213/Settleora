using Settleora.Api.Domain.Files;

namespace Settleora.Api.Domain.Users;

public sealed class UserPaymentProfile
{
    public Guid Id { get; set; }

    public Guid UserProfileId { get; set; }

    public UserProfile UserProfile { get; set; } = null!;

    public string? PreferredMethodLabel { get; set; }

    public string? PaymentHandle { get; set; }

    public string? PaymentNote { get; set; }

    public string Visibility { get; set; } = UserPaymentProfileVisibilities.Default;

    public Guid? QrFileObjectId { get; set; }

    public FileObject? QrFileObject { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? DeletedAtUtc { get; set; }
}
