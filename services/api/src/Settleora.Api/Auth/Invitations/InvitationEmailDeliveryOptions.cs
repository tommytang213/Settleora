using Microsoft.Extensions.Options;

namespace Settleora.Api.Auth.Invitations;

internal sealed class InvitationEmailDeliveryOptions
{
    public const string SectionName = "Settleora:Auth:Invitations:EmailDelivery";

    public bool Enabled { get; init; }

    public string DeliveryMode { get; init; } = InvitationEmailDeliveryModes.ProductionSmtp;

    public string? PublicBaseUrl { get; init; }

    public string InviteLinkPath { get; init; } = "/auth/invitations/accept";

    internal IReadOnlyCollection<string> GetValidationFailures()
    {
        List<string> failures = [];

        if (!InvitationEmailDeliveryModes.IsSupported(DeliveryMode))
        {
            failures.Add($"{SectionName}:{nameof(DeliveryMode)} must be a supported invitation delivery mode.");
        }

        if (!InvitationLinkPathPolicy.IsSafeRelativePath(InviteLinkPath))
        {
            failures.Add($"{SectionName}:{nameof(InviteLinkPath)} must be a safe rooted relative path.");
        }

        return failures;
    }
}

internal sealed class InvitationEmailDeliveryOptionsValidator
    : IValidateOptions<InvitationEmailDeliveryOptions>
{
    public ValidateOptionsResult Validate(string? name, InvitationEmailDeliveryOptions options)
    {
        var failures = options.GetValidationFailures();

        return failures.Count is 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}

internal static class InvitationEmailDeliveryModes
{
    public const string ProductionSmtp = "production_smtp";
    public const string LocalSink = "local_sink";
    public const string TestSink = "test_sink";

    public static bool IsSupported(string? value)
    {
        return value is ProductionSmtp
            or LocalSink
            or TestSink;
    }

    public static bool IsSinkMode(string? value)
    {
        return value is LocalSink
            or TestSink;
    }
}
