using System.Globalization;
using System.Security.Claims;

namespace Settleora.Api.Auth.Authorization;

internal sealed class HttpContextCurrentActorAccessor : ICurrentActorAccessor
{
    private readonly IHttpContextAccessor httpContextAccessor;

    public HttpContextCurrentActorAccessor(IHttpContextAccessor httpContextAccessor)
    {
        this.httpContextAccessor = httpContextAccessor;
    }

    public bool TryGetCurrentActor(out AuthenticatedActor actor)
    {
        actor = default!;

        var principal = httpContextAccessor.HttpContext?.User;
        if (principal?.Identity?.IsAuthenticated != true)
        {
            return false;
        }

        return TryGetGuidClaim(principal, SettleoraAuthClaimTypes.AuthAccountId, out var authAccountId)
            && TryGetGuidClaim(principal, SettleoraAuthClaimTypes.UserProfileId, out var userProfileId)
            && TryGetGuidClaim(principal, SettleoraAuthClaimTypes.AuthSessionId, out var authSessionId)
            && TryGetSessionExpiresAtUtc(principal, out var sessionExpiresAtUtc)
            && TryCreateActor(
                principal,
                authAccountId,
                userProfileId,
                authSessionId,
                sessionExpiresAtUtc,
                out actor);
    }

    private static bool TryCreateActor(
        ClaimsPrincipal principal,
        Guid authAccountId,
        Guid userProfileId,
        Guid authSessionId,
        DateTimeOffset sessionExpiresAtUtc,
        out AuthenticatedActor actor)
    {
        var roles = principal.FindAll(ClaimTypes.Role)
            .Select(claim => claim.Value)
            .Where(SettleoraAuthorizationPolicies.IsSupportedSystemRole)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        roles.Sort(SettleoraAuthorizationPolicies.CompareSystemRoles);

        actor = new AuthenticatedActor(
            authAccountId,
            userProfileId,
            authSessionId,
            sessionExpiresAtUtc,
            roles);
        return true;
    }

    private static bool TryGetGuidClaim(
        ClaimsPrincipal principal,
        string claimType,
        out Guid value)
    {
        var claimValue = principal.FindFirst(claimType)?.Value;
        return Guid.TryParse(claimValue, out value);
    }

    private static bool TryGetSessionExpiresAtUtc(
        ClaimsPrincipal principal,
        out DateTimeOffset value)
    {
        var claimValue = principal.FindFirst(SettleoraAuthClaimTypes.SessionExpiresAtUtc)?.Value;
        return DateTimeOffset.TryParse(
            claimValue,
            CultureInfo.InvariantCulture,
            DateTimeStyles.RoundtripKind,
            out value);
    }
}
