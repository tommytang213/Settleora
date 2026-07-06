namespace Settleora.Api.Domain.Auth;

public static class AuthPasswordResetProviderSendCategories
{
    public const string NotAttempted = "not_attempted";
    public const string QueuedOrSent = "queued_or_sent";
    public const string SkippedByPolicy = "skipped_by_policy";
    public const string Throttled = "throttled";
    public const string FailedSafe = "failed_safe";
    public const string ProviderDisabled = "provider_disabled";
}
