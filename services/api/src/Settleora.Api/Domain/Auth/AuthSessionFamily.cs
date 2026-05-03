namespace Settleora.Api.Domain.Auth;

public sealed class AuthSessionFamily
{
    public Guid Id { get; set; }

    public Guid AuthAccountId { get; set; }

    public AuthAccount AuthAccount { get; set; } = null!;

    public string Status { get; set; } = AuthSessionFamilyStatuses.Active;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset AbsoluteExpiresAtUtc { get; set; }

    public DateTimeOffset? LastRotatedAtUtc { get; set; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public string? RevocationReason { get; set; }

    public ICollection<AuthRefreshCredential> RefreshCredentials { get; } = new List<AuthRefreshCredential>();
}
