namespace Settleora.Api.Domain.Auth;

public static class AuthPasswordResetRequestStatuses
{
    public const string Pending = "pending";
    public const string Consumed = "consumed";
    public const string Expired = "expired";
    public const string Revoked = "revoked";
    public const string SuspiciousReplay = "suspicious_replay";
}
