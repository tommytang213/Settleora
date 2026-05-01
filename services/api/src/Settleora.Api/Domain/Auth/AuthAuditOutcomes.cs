namespace Settleora.Api.Domain.Auth;

public static class AuthAuditOutcomes
{
    public const string Success = "success";
    public const string Failure = "failure";
    public const string Denied = "denied";
    public const string Revoked = "revoked";
    public const string Expired = "expired";
    public const string BlockedByPolicy = "blocked_by_policy";
}
