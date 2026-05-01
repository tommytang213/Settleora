namespace Settleora.Api.Domain.Auth;

public sealed class AuthIdentity
{
    public Guid Id { get; set; }

    public Guid AuthAccountId { get; set; }

    public AuthAccount AuthAccount { get; set; } = null!;

    public string ProviderType { get; set; } = AuthIdentityProviderTypes.Local;

    public string ProviderName { get; set; } = string.Empty;

    public string ProviderSubject { get; set; } = string.Empty;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? DisabledAtUtc { get; set; }
}
