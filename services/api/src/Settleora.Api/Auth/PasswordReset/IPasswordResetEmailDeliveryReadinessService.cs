namespace Settleora.Api.Auth.PasswordReset;

internal interface IPasswordResetEmailDeliveryReadinessService
{
    PasswordResetEmailDeliveryReadinessResult GetReadiness();
}

internal sealed record PasswordResetEmailDeliveryReadinessResult(
    bool Ready,
    string Status,
    string DeliveryMode,
    string ProviderReadiness,
    string PublicOriginReadiness,
    int ResetLinkLifetimeMinutes,
    IReadOnlyList<string> FailureCategories)
{
    public static PasswordResetEmailDeliveryReadinessResult Disabled(int lifetimeMinutes)
    {
        return new PasswordResetEmailDeliveryReadinessResult(
            Ready: false,
            PasswordResetEmailDeliveryReadinessStatuses.Disabled,
            PasswordResetEmailDeliveryModes.ProductionSmtp,
            PasswordResetEmailDeliveryReadinessCategories.NotEvaluated,
            PasswordResetEmailDeliveryReadinessCategories.NotEvaluated,
            lifetimeMinutes,
            [PasswordResetEmailDeliveryReadinessCategories.DeliveryDisabled]);
    }
}

internal static class PasswordResetEmailDeliveryReadinessStatuses
{
    public const string Disabled = "disabled";
    public const string Ready = "ready";
    public const string NotReady = "not_ready";
}

internal static class PasswordResetEmailDeliveryReadinessCategories
{
    public const string DeliveryDisabled = "delivery_disabled";
    public const string GenericSmtpConfigured = "generic_smtp_configured";
    public const string GenericSmtpDisabled = "generic_smtp_disabled";
    public const string GenericSmtpUnconfigured = "generic_smtp_unconfigured";
    public const string GenericSmtpInvalid = "generic_smtp_invalid";
    public const string LocalSinkNoSmtpSend = "local_sink_no_smtp_send";
    public const string TestSinkNoSmtpSend = "test_sink_no_smtp_send";
    public const string PublicOriginConfigured = "public_origin_configured";
    public const string PublicOriginMissing = "public_origin_missing";
    public const string PublicOriginUnsafe = "public_origin_unsafe";
    public const string ResetLinkLifetimeApproved = "reset_link_lifetime_approved";
    public const string ResetLinkLifetimeOutOfRange = "reset_link_lifetime_out_of_range";
    public const string DeliveryModeUnsupported = "delivery_mode_unsupported";
    public const string NotEvaluated = "not_evaluated";
}
