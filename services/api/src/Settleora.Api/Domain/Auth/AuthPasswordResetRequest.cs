namespace Settleora.Api.Domain.Auth;

public sealed class AuthPasswordResetRequest
{
    public Guid Id { get; set; }

    public string Purpose { get; set; } = AuthPasswordResetPurposes.LocalPasswordReset;

    public string Status { get; set; } = AuthPasswordResetRequestStatuses.Pending;

    public Guid? AuthAccountId { get; set; }

    public AuthAccount? AuthAccount { get; set; }

    public Guid? LocalPasswordCredentialId { get; set; }

    public LocalPasswordCredential? LocalPasswordCredential { get; set; }

    public string? ResetMaterialHash { get; set; }

    public string? ResetMaterialHashVersion { get; set; }

    public string? ResetMaterialScope { get; set; }

    public DateTimeOffset? IssuedAtUtc { get; set; }

    public DateTimeOffset? ExpiresAtUtc { get; set; }

    public DateTimeOffset? ConsumedAtUtc { get; set; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public DateTimeOffset? ReplacedAtUtc { get; set; }

    public DateTimeOffset? SuspiciousReplayAtUtc { get; set; }

    public DateTimeOffset? LastCheckedAtUtc { get; set; }

    public Guid? ReplacedByResetRequestId { get; set; }

    public AuthPasswordResetRequest? ReplacedByResetRequest { get; set; }

    public string? RevocationReason { get; set; }

    public string DeliveryCategory { get; set; } = AuthPasswordResetDeliveryCategories.ProviderSkipped;

    public string ProviderSendCategory { get; set; } = AuthPasswordResetProviderSendCategories.NotAttempted;

    public string? RequestSourceBucketRef { get; set; }

    public string? IdentifierBucketRef { get; set; }

    public string? CombinedBucketRef { get; set; }

    public string? GlobalBucketRef { get; set; }

    public string? ProviderSendBucketRef { get; set; }

    public string? RequestCorrelationId { get; set; }

    public string? AuditCorrelationId { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? CleanupEligibleAtUtc { get; set; }

    public ICollection<AuthPasswordResetRequest> ReplacedResetRequests { get; } =
        new List<AuthPasswordResetRequest>();
}
