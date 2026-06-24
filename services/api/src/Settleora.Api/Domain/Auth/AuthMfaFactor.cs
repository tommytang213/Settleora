namespace Settleora.Api.Domain.Auth;

public sealed class AuthMfaFactor
{
    public Guid Id { get; set; }

    public Guid AuthAccountId { get; set; }

    public AuthAccount AuthAccount { get; set; } = null!;

    public string FactorType { get; set; } = AuthMfaFactorTypes.Totp;

    public string Status { get; set; } = AuthMfaFactorStatuses.Pending;

    public string? DisplayLabel { get; set; }

    public string? TotpSecretStorageKind { get; set; }

    public string? TotpProtectedSecretReference { get; set; }

    public string? TotpEncryptedSecretPayload { get; set; }

    public string? TotpIssuer { get; set; }

    public string? TotpAccountLabel { get; set; }

    public string? TotpAlgorithm { get; set; }

    public int? TotpDigits { get; set; }

    public int? TotpPeriodSeconds { get; set; }

    public string? PolicyVersion { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? VerifiedAtUtc { get; set; }

    public DateTimeOffset? LastUsedAtUtc { get; set; }

    public DateTimeOffset? DisabledAtUtc { get; set; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public DateTimeOffset? RotatedAtUtc { get; set; }

    public DateTimeOffset? ExpiresAtUtc { get; set; }

    public string? StatusReason { get; set; }

    public Guid? LastStatusChangedByAuthAccountId { get; set; }

    public AuthAccount? LastStatusChangedByAuthAccount { get; set; }

    public string? LastStatusChangeCorrelationId { get; set; }
}
