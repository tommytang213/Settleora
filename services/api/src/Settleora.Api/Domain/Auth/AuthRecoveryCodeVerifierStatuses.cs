namespace Settleora.Api.Domain.Auth;

public static class AuthRecoveryCodeVerifierStatuses
{
    public const string Unused = "unused";
    public const string Consumed = "consumed";
    public const string Revoked = "revoked";
    public const string Replaced = "replaced";
    public const string Expired = "expired";
}
