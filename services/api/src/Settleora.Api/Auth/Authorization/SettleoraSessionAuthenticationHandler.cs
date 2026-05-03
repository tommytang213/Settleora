using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Authorization;

internal sealed class SettleoraSessionAuthenticationHandler
    : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string ForbiddenTitle = "Forbidden";
    private const string ForbiddenDetail = "The authenticated actor is not allowed to access this resource.";

    private static readonly JsonSerializerOptions ProblemJsonSerializerOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly IAuthSessionRuntimeService sessionRuntimeService;
    private readonly SettleoraDbContext dbContext;

    public SettleoraSessionAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        IAuthSessionRuntimeService sessionRuntimeService,
        SettleoraDbContext dbContext)
        : base(options, logger, encoder)
    {
        this.sessionRuntimeService = sessionRuntimeService;
        this.dbContext = dbContext;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var rawSessionToken = SessionBearerTokenReader.TryGetBearerToken(Request);
        if (rawSessionToken is null)
        {
            return AuthenticateResult.NoResult();
        }

        var validationResult = await sessionRuntimeService.ValidateSessionAsync(
            rawSessionToken,
            Context.RequestAborted);
        if (!validationResult.Succeeded || validationResult.Actor is null)
        {
            return AuthenticateResult.Fail("Session authentication failed.");
        }

        var actor = validationResult.Actor;
        var roles = await LoadSystemRolesAsync(actor.AuthAccountId);
        var claims = CreateClaims(actor, roles);
        var identity = new ClaimsIdentity(
            claims,
            Scheme.Name,
            SettleoraAuthClaimTypes.AuthAccountId,
            ClaimTypes.Role);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, Scheme.Name);

        return AuthenticateResult.Success(ticket);
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        return WriteProblemAsync(
            StatusCodes.Status401Unauthorized,
            UnauthenticatedTitle,
            UnauthenticatedDetail);
    }

    protected override Task HandleForbiddenAsync(AuthenticationProperties properties)
    {
        return WriteProblemAsync(
            StatusCodes.Status403Forbidden,
            ForbiddenTitle,
            ForbiddenDetail);
    }

    private async Task<IReadOnlyList<string>> LoadSystemRolesAsync(Guid authAccountId)
    {
        var roles = await dbContext.Set<SystemRoleAssignment>()
            .AsNoTracking()
            .Where(roleAssignment => roleAssignment.AuthAccountId == authAccountId)
            .Select(roleAssignment => roleAssignment.Role)
            .ToListAsync(Context.RequestAborted);

        var distinctRoles = roles
            .Where(SettleoraAuthorizationPolicies.IsSupportedSystemRole)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        distinctRoles.Sort(SettleoraAuthorizationPolicies.CompareSystemRoles);

        return distinctRoles;
    }

    private static List<Claim> CreateClaims(
        AuthenticatedSessionActor actor,
        IReadOnlyList<string> roles)
    {
        var claims = new List<Claim>
        {
            CreateClaim(SettleoraAuthClaimTypes.AuthAccountId, actor.AuthAccountId.ToString("D")),
            CreateClaim(SettleoraAuthClaimTypes.UserProfileId, actor.UserProfileId.ToString("D")),
            CreateClaim(SettleoraAuthClaimTypes.AuthSessionId, actor.AuthSessionId.ToString("D")),
            CreateClaim(SettleoraAuthClaimTypes.SessionExpiresAtUtc, actor.SessionExpiresAtUtc.ToString("O"))
        };

        foreach (var role in roles)
        {
            claims.Add(CreateClaim(ClaimTypes.Role, role));
        }

        return claims;
    }

    private static Claim CreateClaim(string type, string value)
    {
        return new Claim(
            type,
            value,
            ClaimValueTypes.String,
            SettleoraSessionAuthenticationDefaults.AuthenticationScheme);
    }

    private Task WriteProblemAsync(int statusCode, string title, string detail)
    {
        if (Response.HasStarted)
        {
            return Task.CompletedTask;
        }

        Response.StatusCode = statusCode;
        Response.ContentType = "application/problem+json";
        var problem = new ProblemDetails
        {
            Title = title,
            Status = statusCode,
            Detail = detail
        };

        return JsonSerializer.SerializeAsync(
            Response.Body,
            problem,
            ProblemJsonSerializerOptions,
            Context.RequestAborted);
    }
}
