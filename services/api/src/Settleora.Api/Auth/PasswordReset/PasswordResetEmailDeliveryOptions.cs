using Microsoft.Extensions.Options;

namespace Settleora.Api.Auth.PasswordReset;

internal sealed class PasswordResetEmailDeliveryOptions
{
    public const string SectionName = "Settleora:Auth:PasswordReset:EmailDelivery";
    public static readonly TimeSpan MinimumResetLinkLifetime = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan DefaultResetLinkLifetime = TimeSpan.FromMinutes(60);
    public static readonly TimeSpan MaximumResetLinkLifetime = TimeSpan.FromMinutes(120);

    public bool Enabled { get; init; }

    public string DeliveryMode { get; init; } = PasswordResetEmailDeliveryModes.ProductionSmtp;

    public string? PublicBaseUrl { get; init; }

    public TimeSpan ResetLinkLifetime { get; init; } = DefaultResetLinkLifetime;

    internal IReadOnlyCollection<string> GetValidationFailures()
    {
        List<string> failures = [];

        if (!PasswordResetEmailDeliveryModes.IsSupported(DeliveryMode))
        {
            failures.Add($"{SectionName}:{nameof(DeliveryMode)} must be a supported password reset delivery mode.");
        }

        if (ResetLinkLifetime < MinimumResetLinkLifetime
            || ResetLinkLifetime > MaximumResetLinkLifetime)
        {
            failures.Add(
                $"{SectionName}:{nameof(ResetLinkLifetime)} must be between {MinimumResetLinkLifetime} and {MaximumResetLinkLifetime}.");
        }

        return failures;
    }
}

internal sealed class PasswordResetEmailDeliveryOptionsValidator
    : IValidateOptions<PasswordResetEmailDeliveryOptions>
{
    public ValidateOptionsResult Validate(string? name, PasswordResetEmailDeliveryOptions options)
    {
        var failures = options.GetValidationFailures();

        return failures.Count is 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}

internal static class PasswordResetEmailDeliveryModes
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
