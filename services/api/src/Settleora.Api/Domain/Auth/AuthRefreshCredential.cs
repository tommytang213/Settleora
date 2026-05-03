namespace Settleora.Api.Domain.Auth;

public sealed class AuthRefreshCredential
{
    public Guid Id { get; set; }

    public Guid AuthSessionFamilyId { get; set; }

    public AuthSessionFamily SessionFamily { get; set; } = null!;

    public Guid? AuthSessionId { get; set; }

    public AuthSession? AuthSession { get; set; }

    public string RefreshTokenHash { get; set; } = string.Empty;

    public string Status { get; set; } = AuthRefreshCredentialStatuses.Active;

    public DateTimeOffset IssuedAtUtc { get; set; }

    public DateTimeOffset IdleExpiresAtUtc { get; set; }

    public DateTimeOffset AbsoluteExpiresAtUtc { get; set; }

    public DateTimeOffset? ConsumedAtUtc { get; set; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public Guid? ReplacedByRefreshCredentialId { get; set; }

    public AuthRefreshCredential? ReplacedByRefreshCredential { get; set; }

    public string? RevocationReason { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public ICollection<AuthRefreshCredential> ReplacedRefreshCredentials { get; } = new List<AuthRefreshCredential>();
}
