namespace Settleora.Api.Domain.Auth;

public static class AuthRefreshCredentialStatuses
{
    public const string Active = "active";
    public const string Rotated = "rotated";
    public const string Revoked = "revoked";
    public const string Expired = "expired";
    public const string Replayed = "replayed";
}
