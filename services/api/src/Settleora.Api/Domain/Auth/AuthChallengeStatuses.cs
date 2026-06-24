namespace Settleora.Api.Domain.Auth;

public static class AuthChallengeStatuses
{
    public const string Pending = "pending";
    public const string Consumed = "consumed";
    public const string Verified = "verified";
    public const string Expired = "expired";
    public const string Failed = "failed";
    public const string Blocked = "blocked";
    public const string Cancelled = "cancelled";
    public const string ReplayDetected = "replay_detected";
}
