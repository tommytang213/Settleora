namespace Settleora.Api.Auth.Sessions;

internal static class SessionBearerTokenReader
{
    private const string BearerScheme = "Bearer";

    public static string? TryGetBearerToken(HttpRequest request)
    {
        var authorizationHeaders = request.Headers.Authorization;
        if (authorizationHeaders.Count != 1)
        {
            return null;
        }

        var authorizationHeader = authorizationHeaders[0];
        if (string.IsNullOrWhiteSpace(authorizationHeader)
            || authorizationHeader.Contains(',', StringComparison.Ordinal))
        {
            return null;
        }

        var trimmedAuthorizationHeader = authorizationHeader.Trim();
        if (trimmedAuthorizationHeader.Length <= BearerScheme.Length
            || !trimmedAuthorizationHeader.StartsWith(BearerScheme, StringComparison.OrdinalIgnoreCase)
            || !char.IsWhiteSpace(trimmedAuthorizationHeader[BearerScheme.Length]))
        {
            return null;
        }

        var rawSessionToken = trimmedAuthorizationHeader[BearerScheme.Length..].Trim();
        if (rawSessionToken.Length == 0 || rawSessionToken.Any(char.IsWhiteSpace))
        {
            return null;
        }

        return rawSessionToken;
    }
}
