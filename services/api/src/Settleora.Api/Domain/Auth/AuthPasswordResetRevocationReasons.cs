namespace Settleora.Api.Domain.Auth;

public static class AuthPasswordResetRevocationReasons
{
    public const string ReplacedByNewerMaterial = "replaced_by_newer_material";
    public const string SuccessfulReset = "successful_reset";
    public const string PolicyBlocked = "policy_blocked";
    public const string AccountDisabled = "account_disabled";
    public const string ProviderUnavailable = "provider_unavailable";
    public const string CleanupExpired = "cleanup_expired";
}
