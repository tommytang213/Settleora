namespace Settleora.Api.Domain.Auth;

public sealed class AuthSession
{
    public Guid Id { get; set; }

    public Guid AuthAccountId { get; set; }

    public AuthAccount AuthAccount { get; set; } = null!;

    public string SessionTokenHash { get; set; } = string.Empty;

    public string? RefreshTokenHash { get; set; }

    public string Status { get; set; } = AuthSessionStatuses.Active;

    public DateTimeOffset IssuedAtUtc { get; set; }

    public DateTimeOffset ExpiresAtUtc { get; set; }

    public DateTimeOffset? LastSeenAtUtc { get; set; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public string? RevocationReason { get; set; }

    public string? DeviceLabel { get; set; }

    public string? UserAgentSummary { get; set; }

    public string? NetworkAddressHash { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
