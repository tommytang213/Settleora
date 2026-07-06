using Microsoft.Extensions.Options;

namespace Settleora.Api.Auth.PasswordReset;

internal interface IPasswordResetEmailTemplateComposer
{
    PasswordResetEmailTemplateCompositionResult Compose(
        PasswordResetEmailTemplateCompositionRequest request);
}

internal sealed record PasswordResetEmailTemplateCompositionRequest(
    string? RawResetMaterial);

internal sealed record PasswordResetEmailTemplateCompositionResult(
    bool Available,
    string Status,
    string Category,
    string DeliveryMode,
    int ResetLinkLifetimeMinutes,
    PasswordResetEmailSendReadyMessage? SendReadyMessage,
    PasswordResetEmailTemplateRedactedPreview RedactedPreview,
    IReadOnlyList<string> FailureCategories)
{
    public static PasswordResetEmailTemplateCompositionResult Unavailable(
        PasswordResetEmailDeliveryReadinessResult readiness,
        string category,
        IReadOnlyList<string>? failureCategories = null)
    {
        var categories = failureCategories ?? readiness.FailureCategories;
        return new PasswordResetEmailTemplateCompositionResult(
            Available: false,
            PasswordResetEmailTemplateCompositionStatuses.Unavailable,
            category,
            readiness.DeliveryMode,
            readiness.ResetLinkLifetimeMinutes,
            SendReadyMessage: null,
            PasswordResetEmailTemplateRedactedPreview.Unavailable(
                category,
                readiness.ResetLinkLifetimeMinutes),
            categories);
    }

    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(PasswordResetEmailTemplateCompositionResult),
            $"Status={Status}",
            $"Category={Category}",
            $"DeliveryMode={DeliveryMode}",
            $"ResetLinkLifetimeMinutes={ResetLinkLifetimeMinutes}",
            $"HasSendReadyMessage={SendReadyMessage is not null}");
    }
}

internal sealed record PasswordResetEmailSendReadyMessage(
    string Subject,
    string TextBody,
    Uri ResetLink,
    string DeliveryMode,
    int ResetLinkLifetimeMinutes)
{
    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(PasswordResetEmailSendReadyMessage),
            $"Subject={Subject}",
            $"DeliveryMode={DeliveryMode}",
            $"ResetLinkLifetimeMinutes={ResetLinkLifetimeMinutes}",
            "ResetLink=[redacted]",
            "TextBody=[redacted]");
    }
}

internal sealed record PasswordResetEmailTemplateRedactedPreview(
    string Subject,
    string TextBody,
    string Category,
    int ResetLinkLifetimeMinutes)
{
    public static PasswordResetEmailTemplateRedactedPreview Unavailable(
        string category,
        int resetLinkLifetimeMinutes)
    {
        return new PasswordResetEmailTemplateRedactedPreview(
            PasswordResetEmailTemplateComposer.TemplateSubject,
            PasswordResetEmailTemplateComposer.RedactedUnavailableBody,
            category,
            resetLinkLifetimeMinutes);
    }
}

internal static class PasswordResetEmailTemplateCompositionStatuses
{
    public const string Available = "available";
    public const string Unavailable = "unavailable";
}

internal static class PasswordResetEmailTemplateCompositionCategories
{
    public const string ProductionSmtpReady = "production_smtp_ready";
    public const string LocalSinkReadyNoSmtpSend = "local_sink_ready_no_smtp_send";
    public const string TestSinkReadyNoSmtpSend = "test_sink_ready_no_smtp_send";
    public const string DeliveryReadinessUnavailable = "delivery_readiness_unavailable";
    public const string ResetMaterialMissing = "reset_material_missing";
    public const string ResetLinkPathUnsafe = "reset_link_path_unsafe";
    public const string PublicOriginUnsafe = "public_origin_unsafe";
}

internal sealed class PasswordResetEmailTemplateComposer : IPasswordResetEmailTemplateComposer
{
    public const string TemplateSubject = "Settleora password reset";
    public const string RedactedResetLink = "[reset-link-redacted]";
    public const string RedactedUnavailableBody = "Password reset email composition is not available.";

    private readonly IPasswordResetEmailDeliveryReadinessService readinessService;
    private readonly IOptionsMonitor<PasswordResetEmailDeliveryOptions> deliveryOptions;

    public PasswordResetEmailTemplateComposer(
        IPasswordResetEmailDeliveryReadinessService readinessService,
        IOptionsMonitor<PasswordResetEmailDeliveryOptions> deliveryOptions)
    {
        this.readinessService = readinessService;
        this.deliveryOptions = deliveryOptions;
    }

    public PasswordResetEmailTemplateCompositionResult Compose(
        PasswordResetEmailTemplateCompositionRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var readiness = readinessService.GetReadiness();
        if (!readiness.Ready)
        {
            return PasswordResetEmailTemplateCompositionResult.Unavailable(
                readiness,
                PasswordResetEmailTemplateCompositionCategories.DeliveryReadinessUnavailable);
        }

        if (string.IsNullOrWhiteSpace(request.RawResetMaterial))
        {
            return PasswordResetEmailTemplateCompositionResult.Unavailable(
                readiness,
                PasswordResetEmailTemplateCompositionCategories.ResetMaterialMissing,
                [PasswordResetEmailTemplateCompositionCategories.ResetMaterialMissing]);
        }

        var options = deliveryOptions.CurrentValue;
        if (!PasswordResetLinkPathPolicy.IsSafeRelativePath(options.ResetLinkPath))
        {
            return PasswordResetEmailTemplateCompositionResult.Unavailable(
                readiness,
                PasswordResetEmailTemplateCompositionCategories.ResetLinkPathUnsafe,
                [PasswordResetEmailTemplateCompositionCategories.ResetLinkPathUnsafe]);
        }

        if (!TryCreateSafePublicOrigin(options.PublicBaseUrl, options.DeliveryMode, out var publicOrigin))
        {
            return PasswordResetEmailTemplateCompositionResult.Unavailable(
                readiness,
                PasswordResetEmailTemplateCompositionCategories.PublicOriginUnsafe,
                [PasswordResetEmailTemplateCompositionCategories.PublicOriginUnsafe]);
        }

        var lifetimeMinutes = readiness.ResetLinkLifetimeMinutes;
        var resetLink = BuildResetLink(
            publicOrigin,
            options.ResetLinkPath,
            request.RawResetMaterial.Trim());
        var subject = TemplateSubject;
        var body = BuildTextBody(resetLink, lifetimeMinutes);
        var redactedPreview = new PasswordResetEmailTemplateRedactedPreview(
            subject,
            BuildTextBody(RedactedResetLink, lifetimeMinutes),
            ResolveReadyCategory(readiness.DeliveryMode),
            lifetimeMinutes);

        return new PasswordResetEmailTemplateCompositionResult(
            Available: true,
            PasswordResetEmailTemplateCompositionStatuses.Available,
            redactedPreview.Category,
            readiness.DeliveryMode,
            lifetimeMinutes,
            new PasswordResetEmailSendReadyMessage(
                subject,
                body,
                resetLink,
                readiness.DeliveryMode,
                lifetimeMinutes),
            redactedPreview,
            []);
    }

    private static Uri BuildResetLink(
        Uri publicOrigin,
        string resetLinkPath,
        string rawResetMaterial)
    {
        var builder = new UriBuilder(publicOrigin)
        {
            Path = CombinePaths(publicOrigin.AbsolutePath, resetLinkPath),
            Query = string.Empty,
            Fragment = "resetMaterial=" + Uri.EscapeDataString(rawResetMaterial)
        };

        return builder.Uri;
    }

    private static string CombinePaths(string originPath, string resetLinkPath)
    {
        var normalizedOriginPath = string.IsNullOrWhiteSpace(originPath)
            || StringComparer.Ordinal.Equals(originPath, "/")
                ? string.Empty
                : originPath.TrimEnd('/');

        return normalizedOriginPath + resetLinkPath;
    }

    private static string BuildTextBody(Uri resetLink, int lifetimeMinutes)
    {
        return BuildTextBody(resetLink.ToString(), lifetimeMinutes);
    }

    private static string BuildTextBody(string resetLink, int lifetimeMinutes)
    {
        return string.Join(
            Environment.NewLine,
            "If you requested a Settleora local password reset, use this link to continue.",
            string.Empty,
            resetLink,
            string.Empty,
            $"This link expires in {lifetimeMinutes} minutes.",
            "If you did not request a reset, ignore this email.");
    }

    private static string ResolveReadyCategory(string deliveryMode)
    {
        return deliveryMode switch
        {
            PasswordResetEmailDeliveryModes.LocalSink
                => PasswordResetEmailTemplateCompositionCategories.LocalSinkReadyNoSmtpSend,
            PasswordResetEmailDeliveryModes.TestSink
                => PasswordResetEmailTemplateCompositionCategories.TestSinkReadyNoSmtpSend,
            _ => PasswordResetEmailTemplateCompositionCategories.ProductionSmtpReady
        };
    }

    private static bool TryCreateSafePublicOrigin(
        string? publicBaseUrl,
        string deliveryMode,
        out Uri publicOrigin)
    {
        publicOrigin = null!;
        if (string.IsNullOrWhiteSpace(publicBaseUrl)
            || !Uri.TryCreate(publicBaseUrl, UriKind.Absolute, out var uri)
            || !PasswordResetPublicOriginPolicy.IsSafePublicOrigin(uri, deliveryMode))
        {
            return false;
        }

        publicOrigin = uri;
        return true;
    }
}
