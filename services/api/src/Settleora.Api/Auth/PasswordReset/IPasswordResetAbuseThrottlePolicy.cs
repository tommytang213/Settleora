using Microsoft.AspNetCore.WebUtilities;
using System.Security.Cryptography;
using System.Text;

namespace Settleora.Api.Auth.PasswordReset;

internal interface IPasswordResetAbuseThrottlePolicy
{
    PasswordResetThrottleDecision CheckRequest(PasswordResetThrottleRequest request);

    PasswordResetThrottleDecision CheckProviderSend(PasswordResetThrottleRequest request);

    void RecordRequestAttempt(PasswordResetThrottleRequest request);

    void RecordProviderSendAttempt(PasswordResetThrottleRequest request);
}

internal sealed record PasswordResetThrottleRequest(
    string? SubmittedIdentifier,
    string? SourceBucketRef,
    string? RequestCorrelationId = null)
{
    private const int SafeKeyMaxLength = 128;

    public string IdentifierKey => CreateIdentifierKey(SubmittedIdentifier);

    public string SourceKey => CreateSafeSourceKey(SourceBucketRef);

    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(PasswordResetThrottleRequest),
            $"HasSubmittedIdentifier={!string.IsNullOrWhiteSpace(SubmittedIdentifier)}",
            $"HasSourceBucketRef={!string.IsNullOrWhiteSpace(SourceBucketRef)}",
            $"HasRequestCorrelationId={!string.IsNullOrWhiteSpace(RequestCorrelationId)}");
    }

    private static string CreateIdentifierKey(string? submittedIdentifier)
    {
        var normalizedIdentifier = string.IsNullOrWhiteSpace(submittedIdentifier)
            ? "unknown"
            : submittedIdentifier.Trim().ToLowerInvariant();
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes("local-password-reset-id:" + normalizedIdentifier));
        return "reset-id-sha256:" + WebEncoders.Base64UrlEncode(hash);
    }

    private static string CreateSafeSourceKey(string? sourceBucketRef)
    {
        if (string.IsNullOrWhiteSpace(sourceBucketRef))
        {
            return "reset-source:unknown";
        }

        var trimmed = sourceBucketRef.Trim();
        if (trimmed.Length <= SafeKeyMaxLength && trimmed.All(IsSafeKeyCharacter))
        {
            return trimmed;
        }

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes("local-password-reset-source:" + trimmed));
        return "reset-source-sha256:" + WebEncoders.Base64UrlEncode(hash);
    }

    private static bool IsSafeKeyCharacter(char character)
    {
        return char.IsAsciiLetterOrDigit(character)
            || character is ':' or '-' or '_' or '.';
    }
}

internal sealed record PasswordResetThrottleDecision(
    bool Allowed,
    string Status,
    string Category,
    string Scope)
{
    public static PasswordResetThrottleDecision Allow(string category)
    {
        return new PasswordResetThrottleDecision(
            Allowed: true,
            PasswordResetThrottleStatuses.Allowed,
            category,
            PasswordResetThrottleScopes.None);
    }

    public static PasswordResetThrottleDecision Block(string category, string scope)
    {
        return new PasswordResetThrottleDecision(
            Allowed: false,
            PasswordResetThrottleStatuses.Throttled,
            category,
            scope);
    }

    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(PasswordResetThrottleDecision),
            $"Allowed={Allowed}",
            $"Status={Status}",
            $"Category={Category}",
            $"Scope={Scope}");
    }
}

internal static class PasswordResetThrottleStatuses
{
    public const string Allowed = "allowed";
    public const string Throttled = "throttled";
}

internal static class PasswordResetThrottleCategories
{
    public const string Request = "reset_request";
    public const string ProviderSend = "provider_send";
}

internal static class PasswordResetThrottleScopes
{
    public const string None = "none";
    public const string Source = "source";
    public const string Identifier = "identifier";
    public const string Combined = "combined";
    public const string Global = "global";
    public const string ProviderSend = "provider_send";
}
