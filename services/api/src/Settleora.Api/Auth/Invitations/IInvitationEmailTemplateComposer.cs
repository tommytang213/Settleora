using Microsoft.Extensions.Options;

namespace Settleora.Api.Auth.Invitations;

internal interface IInvitationEmailTemplateComposer
{
    InvitationEmailTemplateCompositionResult Compose(
        InvitationEmailTemplateCompositionRequest request);
}

internal sealed record InvitationEmailTemplateCompositionRequest(
    string? RawInvitationSecret);

internal sealed record InvitationEmailTemplateCompositionResult(
    bool Available,
    string Status,
    string Category,
    string DeliveryMode,
    InvitationEmailSendReadyMessage? SendReadyMessage,
    InvitationEmailTemplateRedactedPreview RedactedPreview,
    IReadOnlyList<string> FailureCategories)
{
    public static InvitationEmailTemplateCompositionResult Unavailable(
        InvitationEmailDeliveryReadinessResult readiness,
        string category,
        IReadOnlyList<string>? failureCategories = null)
    {
        var categories = failureCategories ?? readiness.FailureCategories;
        return new InvitationEmailTemplateCompositionResult(
            Available: false,
            InvitationEmailTemplateCompositionStatuses.Unavailable,
            category,
            readiness.DeliveryMode,
            SendReadyMessage: null,
            InvitationEmailTemplateRedactedPreview.Unavailable(category),
            categories);
    }

    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(InvitationEmailTemplateCompositionResult),
            $"Status={Status}",
            $"Category={Category}",
            $"DeliveryMode={DeliveryMode}",
            $"HasSendReadyMessage={SendReadyMessage is not null}");
    }
}

internal sealed record InvitationEmailSendReadyMessage(
    string Subject,
    string TextBody,
    Uri InviteLink,
    string DeliveryMode)
{
    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(InvitationEmailSendReadyMessage),
            $"Subject={Subject}",
            $"DeliveryMode={DeliveryMode}",
            "InviteLink=[redacted]",
            "TextBody=[redacted]");
    }
}

internal sealed record InvitationEmailTemplateRedactedPreview(
    string Subject,
    string TextBody,
    string Category)
{
    public static InvitationEmailTemplateRedactedPreview Unavailable(string category)
    {
        return new InvitationEmailTemplateRedactedPreview(
            InvitationEmailTemplateComposer.TemplateSubject,
            InvitationEmailTemplateComposer.RedactedUnavailableBody,
            category);
    }
}

internal static class InvitationEmailTemplateCompositionStatuses
{
    public const string Available = "available";
    public const string Unavailable = "unavailable";
}

internal static class InvitationEmailTemplateCompositionCategories
{
    public const string ProductionSmtpReady = "production_smtp_ready";
    public const string LocalSinkReadyNoSmtpSend = "local_sink_ready_no_smtp_send";
    public const string TestSinkReadyNoSmtpSend = "test_sink_ready_no_smtp_send";
    public const string DeliveryReadinessUnavailable = "delivery_readiness_unavailable";
    public const string InvitationSecretMissing = "invitation_secret_missing";
    public const string InviteLinkPathUnsafe = "invite_link_path_unsafe";
    public const string PublicOriginUnsafe = "public_origin_unsafe";
}

internal sealed class InvitationEmailTemplateComposer : IInvitationEmailTemplateComposer
{
    public const string TemplateSubject = "Settleora invitation";
    public const string RedactedInviteLink = "[invite-link-redacted]";
    public const string RedactedUnavailableBody = "Invitation email composition is not available.";

    private readonly IInvitationEmailDeliveryReadinessService readinessService;
    private readonly IOptionsMonitor<InvitationEmailDeliveryOptions> deliveryOptions;

    public InvitationEmailTemplateComposer(
        IInvitationEmailDeliveryReadinessService readinessService,
        IOptionsMonitor<InvitationEmailDeliveryOptions> deliveryOptions)
    {
        this.readinessService = readinessService;
        this.deliveryOptions = deliveryOptions;
    }

    public InvitationEmailTemplateCompositionResult Compose(
        InvitationEmailTemplateCompositionRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var readiness = readinessService.GetReadiness();
        if (!readiness.Ready)
        {
            return InvitationEmailTemplateCompositionResult.Unavailable(
                readiness,
                InvitationEmailTemplateCompositionCategories.DeliveryReadinessUnavailable);
        }

        if (string.IsNullOrWhiteSpace(request.RawInvitationSecret))
        {
            return InvitationEmailTemplateCompositionResult.Unavailable(
                readiness,
                InvitationEmailTemplateCompositionCategories.InvitationSecretMissing,
                [InvitationEmailTemplateCompositionCategories.InvitationSecretMissing]);
        }

        var options = deliveryOptions.CurrentValue;
        if (!InvitationLinkPathPolicy.IsSafeRelativePath(options.InviteLinkPath))
        {
            return InvitationEmailTemplateCompositionResult.Unavailable(
                readiness,
                InvitationEmailTemplateCompositionCategories.InviteLinkPathUnsafe,
                [InvitationEmailTemplateCompositionCategories.InviteLinkPathUnsafe]);
        }

        if (!TryCreateSafePublicOrigin(options.PublicBaseUrl, options.DeliveryMode, out var publicOrigin))
        {
            return InvitationEmailTemplateCompositionResult.Unavailable(
                readiness,
                InvitationEmailTemplateCompositionCategories.PublicOriginUnsafe,
                [InvitationEmailTemplateCompositionCategories.PublicOriginUnsafe]);
        }

        var inviteLink = BuildInviteLink(
            publicOrigin,
            options.InviteLinkPath,
            request.RawInvitationSecret.Trim());
        var subject = TemplateSubject;
        var redactedPreview = new InvitationEmailTemplateRedactedPreview(
            subject,
            BuildTextBody(RedactedInviteLink),
            ResolveReadyCategory(readiness.DeliveryMode));

        return new InvitationEmailTemplateCompositionResult(
            Available: true,
            InvitationEmailTemplateCompositionStatuses.Available,
            redactedPreview.Category,
            readiness.DeliveryMode,
            new InvitationEmailSendReadyMessage(
                subject,
                BuildTextBody(inviteLink),
                inviteLink,
                readiness.DeliveryMode),
            redactedPreview,
            []);
    }

    private static Uri BuildInviteLink(
        Uri publicOrigin,
        string inviteLinkPath,
        string rawInvitationSecret)
    {
        var builder = new UriBuilder(publicOrigin)
        {
            Path = CombinePaths(publicOrigin.AbsolutePath, inviteLinkPath),
            Query = string.Empty,
            Fragment = "invitationSecret=" + Uri.EscapeDataString(rawInvitationSecret)
        };

        return builder.Uri;
    }

    private static string CombinePaths(string originPath, string inviteLinkPath)
    {
        var normalizedOriginPath = string.IsNullOrWhiteSpace(originPath)
            || StringComparer.Ordinal.Equals(originPath, "/")
                ? string.Empty
                : originPath.TrimEnd('/');

        return normalizedOriginPath + inviteLinkPath;
    }

    private static string BuildTextBody(Uri inviteLink)
    {
        return BuildTextBody(inviteLink.ToString());
    }

    private static string BuildTextBody(string inviteLink)
    {
        return string.Join(
            Environment.NewLine,
            TemplateSubject,
            string.Empty,
            "Use this link to continue accepting your Settleora invitation:",
            string.Empty,
            inviteLink,
            string.Empty,
            "This link expires after a limited time. If you did not expect this, you can ignore this email.");
    }

    private static string ResolveReadyCategory(string deliveryMode)
    {
        return deliveryMode switch
        {
            InvitationEmailDeliveryModes.LocalSink
                => InvitationEmailTemplateCompositionCategories.LocalSinkReadyNoSmtpSend,
            InvitationEmailDeliveryModes.TestSink
                => InvitationEmailTemplateCompositionCategories.TestSinkReadyNoSmtpSend,
            _ => InvitationEmailTemplateCompositionCategories.ProductionSmtpReady
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
            || !InvitationPublicOriginPolicy.IsSafePublicOrigin(uri, deliveryMode))
        {
            return false;
        }

        publicOrigin = uri;
        return true;
    }
}
