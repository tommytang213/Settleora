namespace Settleora.Api.Auth.SignIn;

internal static class LocalAccountIdentifier
{
    public const int MaxLength = 320;

    public static bool TryNormalize(
        string? submittedIdentifier,
        out string normalizedIdentifier)
    {
        normalizedIdentifier = string.Empty;
        if (string.IsNullOrWhiteSpace(submittedIdentifier))
        {
            return false;
        }

        var trimmedIdentifier = submittedIdentifier.Trim();
        if (trimmedIdentifier.Length is 0 or > MaxLength)
        {
            return false;
        }

        normalizedIdentifier = trimmedIdentifier.ToLowerInvariant();
        return true;
    }
}
