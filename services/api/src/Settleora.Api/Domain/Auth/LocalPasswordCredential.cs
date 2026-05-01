namespace Settleora.Api.Domain.Auth;

public sealed class LocalPasswordCredential
{
    public Guid Id { get; set; }

    public Guid AuthAccountId { get; set; }

    public AuthAccount AuthAccount { get; set; } = null!;

    public string PasswordHash { get; set; } = string.Empty;

    public string PasswordHashAlgorithm { get; set; } = string.Empty;

    public string PasswordHashAlgorithmVersion { get; set; } = string.Empty;

    public string PasswordHashParameters { get; set; } = string.Empty;

    public string Status { get; set; } = LocalPasswordCredentialStatuses.Active;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? LastVerifiedAtUtc { get; set; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public bool RequiresRehash { get; set; }
}
