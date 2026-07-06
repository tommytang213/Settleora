namespace Settleora.Api.Auth.PasswordReset;

internal interface IPasswordResetEmailDeliveryOrchestrator
{
    Task<PasswordResetEmailDeliveryResult> DeliverAsync(
        PasswordResetEmailDeliveryRequest request,
        CancellationToken cancellationToken = default);
}

internal sealed record PasswordResetEmailDeliveryRequest(
    string? SubmittedIdentifier,
    string? RecipientEmailAddress,
    string? SourceBucketRef = null,
    string? RequestCorrelationId = null)
{
    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(PasswordResetEmailDeliveryRequest),
            $"HasSubmittedIdentifier={!string.IsNullOrWhiteSpace(SubmittedIdentifier)}",
            $"HasRecipientEmailAddress={!string.IsNullOrWhiteSpace(RecipientEmailAddress)}",
            $"HasSourceBucketRef={!string.IsNullOrWhiteSpace(SourceBucketRef)}",
            $"HasRequestCorrelationId={!string.IsNullOrWhiteSpace(RequestCorrelationId)}");
    }
}

internal sealed record PasswordResetEmailDeliveryResult(
    bool Accepted,
    string Category,
    string DeliveryMode,
    int ResetLinkLifetimeMinutes,
    string? ProviderCategory = null,
    bool Retryable = false,
    IReadOnlyList<string>? FailureCategories = null,
    PasswordResetEmailTemplateRedactedPreview? RedactedPreview = null)
{
    public static PasswordResetEmailDeliveryResult DisabledOrNotReady(
        PasswordResetEmailDeliveryReadinessResult readiness)
    {
        return new PasswordResetEmailDeliveryResult(
            Accepted: false,
            PasswordResetEmailDeliveryResultCategories.DisabledNotReady,
            readiness.DeliveryMode,
            readiness.ResetLinkLifetimeMinutes,
            FailureCategories: readiness.FailureCategories);
    }

    public static PasswordResetEmailDeliveryResult InvalidPolicy(
        PasswordResetEmailDeliveryReadinessResult readiness,
        IReadOnlyList<string> failureCategories)
    {
        return new PasswordResetEmailDeliveryResult(
            Accepted: false,
            PasswordResetEmailDeliveryResultCategories.InvalidPolicy,
            readiness.DeliveryMode,
            readiness.ResetLinkLifetimeMinutes,
            FailureCategories: failureCategories);
    }

    public static PasswordResetEmailDeliveryResult Composed(
        PasswordResetEmailTemplateCompositionResult composition)
    {
        return new PasswordResetEmailDeliveryResult(
            Accepted: false,
            PasswordResetEmailDeliveryResultCategories.Composed,
            composition.DeliveryMode,
            composition.ResetLinkLifetimeMinutes,
            RedactedPreview: composition.RedactedPreview);
    }

    public static PasswordResetEmailDeliveryResult SinkRecorded(
        PasswordResetEmailTemplateCompositionResult composition)
    {
        return new PasswordResetEmailDeliveryResult(
            Accepted: true,
            PasswordResetEmailDeliveryResultCategories.SinkRecorded,
            composition.DeliveryMode,
            composition.ResetLinkLifetimeMinutes,
            RedactedPreview: composition.RedactedPreview);
    }

    public static PasswordResetEmailDeliveryResult ProviderAccepted(
        PasswordResetEmailTemplateCompositionResult composition,
        PasswordResetSmtpEmailSendResult sendResult)
    {
        return new PasswordResetEmailDeliveryResult(
            Accepted: true,
            PasswordResetEmailDeliveryResultCategories.ProviderSendAccepted,
            composition.DeliveryMode,
            composition.ResetLinkLifetimeMinutes,
            ProviderCategory: sendResult.Category,
            RedactedPreview: composition.RedactedPreview);
    }

    public static PasswordResetEmailDeliveryResult ProviderFailedRedacted(
        PasswordResetEmailTemplateCompositionResult composition,
        PasswordResetSmtpEmailSendResult sendResult)
    {
        return new PasswordResetEmailDeliveryResult(
            Accepted: false,
            PasswordResetEmailDeliveryResultCategories.ProviderSendFailedRedacted,
            composition.DeliveryMode,
            composition.ResetLinkLifetimeMinutes,
            ProviderCategory: sendResult.Category,
            Retryable: sendResult.Retryable,
            RedactedPreview: composition.RedactedPreview);
    }

    public static PasswordResetEmailDeliveryResult Throttled(
        PasswordResetEmailDeliveryReadinessResult readiness,
        PasswordResetThrottleDecision decision)
    {
        return new PasswordResetEmailDeliveryResult(
            Accepted: false,
            PasswordResetEmailDeliveryResultCategories.Throttled,
            readiness.DeliveryMode,
            readiness.ResetLinkLifetimeMinutes,
            FailureCategories:
            [
                decision.Category,
                decision.Scope
            ]);
    }

    public static PasswordResetEmailDeliveryResult Throttled(
        PasswordResetEmailTemplateCompositionResult composition,
        PasswordResetThrottleDecision decision)
    {
        return new PasswordResetEmailDeliveryResult(
            Accepted: false,
            PasswordResetEmailDeliveryResultCategories.Throttled,
            composition.DeliveryMode,
            composition.ResetLinkLifetimeMinutes,
            ProviderCategory: PasswordResetSmtpEmailSendResultCategories.ThrottledByPolicy,
            FailureCategories:
            [
                decision.Category,
                decision.Scope
            ],
            RedactedPreview: composition.RedactedPreview);
    }

    public static PasswordResetEmailDeliveryResult BlockedDecisionRequired(
        PasswordResetEmailDeliveryReadinessResult readiness,
        string category)
    {
        return new PasswordResetEmailDeliveryResult(
            Accepted: false,
            PasswordResetEmailDeliveryResultCategories.BlockedDecisionRequired,
            readiness.DeliveryMode,
            readiness.ResetLinkLifetimeMinutes,
            FailureCategories: [category]);
    }

    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(PasswordResetEmailDeliveryResult),
            $"Accepted={Accepted}",
            $"Category={Category}",
            $"DeliveryMode={DeliveryMode}",
            $"ResetLinkLifetimeMinutes={ResetLinkLifetimeMinutes}",
            $"ProviderCategory={ProviderCategory ?? "none"}",
            $"Retryable={Retryable}",
            $"FailureCategories={string.Join(",", FailureCategories ?? [])}",
            $"HasRedactedPreview={RedactedPreview is not null}");
    }
}

internal static class PasswordResetEmailDeliveryResultCategories
{
    public const string DisabledNotReady = "disabled_not_ready";
    public const string InvalidPolicy = "invalid_policy";
    public const string Composed = "composed";
    public const string SinkRecorded = "sink_recorded";
    public const string ProviderSendAccepted = "provider_send_accepted";
    public const string ProviderSendFailedRedacted = "provider_send_failed_redacted";
    public const string Throttled = "throttled";
    public const string BlockedDecisionRequired = "blocked_decision_required";
}

internal static class PasswordResetEmailDeliveryFailureCategories
{
    public const string MaterialNotIssued = "material_not_issued";
    public const string RecipientUnavailable = "recipient_unavailable";
}
