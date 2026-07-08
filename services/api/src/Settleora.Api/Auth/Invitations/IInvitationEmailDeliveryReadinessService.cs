namespace Settleora.Api.Auth.Invitations;

internal interface IInvitationEmailDeliveryReadinessService
{
    InvitationEmailDeliveryReadinessResult GetReadiness();
}

internal sealed record InvitationEmailDeliveryReadinessResult(
    bool Ready,
    string Status,
    string DeliveryMode,
    string ProviderReadiness,
    string PublicOriginReadiness,
    IReadOnlyList<string> FailureCategories)
{
    public static InvitationEmailDeliveryReadinessResult Disabled()
    {
        return new InvitationEmailDeliveryReadinessResult(
            Ready: false,
            InvitationEmailDeliveryReadinessStatuses.Disabled,
            InvitationEmailDeliveryModes.ProductionSmtp,
            InvitationEmailDeliveryReadinessCategories.NotEvaluated,
            InvitationEmailDeliveryReadinessCategories.NotEvaluated,
            [InvitationEmailDeliveryReadinessCategories.DeliveryDisabled]);
    }
}

internal static class InvitationEmailDeliveryReadinessStatuses
{
    public const string Disabled = "disabled";
    public const string Ready = "ready";
    public const string NotReady = "not_ready";
}

internal static class InvitationEmailDeliveryReadinessCategories
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
    public const string DeliveryModeUnsupported = "delivery_mode_unsupported";
    public const string InviteLinkPathUnsafe = "invite_link_path_unsafe";
    public const string NotEvaluated = "not_evaluated";
}
