namespace Settleora.Api.Domain.Notifications;

public static class NotificationPolicyContentClasses
{
    public const string InAppOnly = "in_app_only";
    public const string GenericExternalOnly = "generic_external_only";
    public const string SafeSummaryAllowed = "safe_summary_allowed";

    public static bool IsSupported(string? value)
    {
        return value is InAppOnly or GenericExternalOnly or SafeSummaryAllowed;
    }
}
