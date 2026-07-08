namespace Settleora.Api.Auth.Invitations;

internal static class InvitationPublicOriginPolicy
{
    public static bool IsSafePublicOrigin(Uri uri, string deliveryMode)
    {
        if (!string.IsNullOrWhiteSpace(uri.UserInfo)
            || !string.IsNullOrWhiteSpace(uri.Query)
            || !string.IsNullOrWhiteSpace(uri.Fragment)
            || string.IsNullOrWhiteSpace(uri.Host))
        {
            return false;
        }

        if (uri.Scheme == Uri.UriSchemeHttps)
        {
            return true;
        }

        return InvitationEmailDeliveryModes.IsSinkMode(deliveryMode)
            && uri.Scheme == Uri.UriSchemeHttp
            && IsLocalHost(uri.Host);
    }

    private static bool IsLocalHost(string host)
    {
        return StringComparer.OrdinalIgnoreCase.Equals(host, "localhost")
            || StringComparer.OrdinalIgnoreCase.Equals(host, "127.0.0.1")
            || StringComparer.OrdinalIgnoreCase.Equals(host, "::1");
    }
}

internal static class InvitationLinkPathPolicy
{
    public static bool IsSafeRelativePath(string? inviteLinkPath)
    {
        if (string.IsNullOrWhiteSpace(inviteLinkPath))
        {
            return false;
        }

        var path = inviteLinkPath.Trim();
        if (!path.StartsWith("/", StringComparison.Ordinal)
            || path.StartsWith("//", StringComparison.Ordinal)
            || path.Contains('\\', StringComparison.Ordinal)
            || path.Contains('?', StringComparison.Ordinal)
            || path.Contains('#', StringComparison.Ordinal)
            || path.Contains('@', StringComparison.Ordinal)
            || path.Contains(":", StringComparison.Ordinal)
            || path.Contains("//", StringComparison.Ordinal)
            || path.Length > 256)
        {
            return false;
        }

        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length is 0)
        {
            return false;
        }

        foreach (var segment in segments)
        {
            if (!IsSafeSegment(segment))
            {
                return false;
            }
        }

        return true;
    }

    private static bool IsSafeSegment(string segment)
    {
        if (segment is "." or "..")
        {
            return false;
        }

        foreach (var character in segment)
        {
            if (!IsSafePathCharacter(character))
            {
                return false;
            }
        }

        return true;
    }

    private static bool IsSafePathCharacter(char character)
    {
        return character is >= 'a' and <= 'z'
            or >= 'A' and <= 'Z'
            or >= '0' and <= '9'
            or '-'
            or '_'
            or '.';
    }
}
