using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Notifications;

internal static class PushDeviceTokenEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string InvalidRequestTitle = "Invalid push token request";
    private const string InvalidRequestDetail = "The submitted push token request is invalid.";
    private const string ProtectionUnavailableTitle = "Push token protection unavailable";
    private const string ProtectionUnavailableDetail = "Push token registration is unavailable because protected token fingerprinting is not configured.";
    private const string RegisterFailedTitle = "Push token registration failed";
    private const string RegisterFailedDetail = "Unable to persist the push token registration.";
    private const string RevokeFailedTitle = "Push token revocation failed";
    private const string RevokeFailedDetail = "Unable to persist the push token revocation.";
    private const int RawTokenMaxLength = 4096;
    private const int DeviceInstallationIdMaxLength = 256;

    public static WebApplication MapPushDeviceTokenEndpoints(this WebApplication app)
    {
        var pushDevices = app.MapGroup("/api/v1/me/push-devices")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        pushDevices.MapPut("/current-token", RegisterCurrentTokenAsync);
        pushDevices.MapDelete("/current-token", RevokeCurrentTokenAsync);
        pushDevices.MapDelete("/current-session", RevokeCurrentSessionTokensAsync);

        return app;
    }

    private static async Task<IResult> RegisterCurrentTokenAsync(
        [FromBody] PushDeviceTokenRegisterRequest? registerRequest,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        SettleoraDbContext dbContext,
        IPushTokenProtector tokenProtector,
        IPushTokenFingerprintService fingerprintService,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (request.Query.Count > 0)
        {
            return InvalidRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["query"] = ["Unsupported query fields are not allowed."]
            });
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (!fingerprintService.IsAvailable)
        {
            return ProtectionUnavailable();
        }

        var validation = ValidateRegister(registerRequest);
        if (validation.Count > 0)
        {
            return InvalidRequest(validation);
        }

        var platform = Normalize(registerRequest!.Platform)!;
        var provider = Normalize(registerRequest.Provider)!;
        var rawToken = registerRequest.Token!.Trim();
        var deviceInstallationHash = fingerprintService.CreateDeviceInstallationHash(registerRequest.DeviceInstallationId!.Trim());
        var appBuildEnvironment = Normalize(registerRequest.AppBuildEnvironment)!;
        var permissionState = Normalize(registerRequest.PermissionState)!;
        var tokenFingerprint = fingerprintService.CreateTokenFingerprint(provider, appBuildEnvironment, rawToken);
        var now = timeProvider.GetUtcNow();

        var actorStillValid = await dbContext.Set<AuthAccount>()
            .AsNoTracking()
            .AnyAsync(account => account.Id == actor.AuthAccountId
                && account.UserProfileId == actor.UserProfileId
                && account.Status == AuthAccountStatuses.Active
                && account.DisabledAtUtc == null
                && account.DeletedAtUtc == null
                && account.UserProfile.DeletedAtUtc == null,
                cancellationToken);
        if (!actorStillValid)
        {
            return Unauthenticated();
        }

        var conflictingToken = await dbContext.Set<PushDeviceToken>()
            .AsNoTracking()
            .Where(token => token.Status == PushDeviceTokenStatuses.Active
                && token.TokenFingerprint == tokenFingerprint
                && token.Provider == provider
                && token.AppBuildEnvironment == appBuildEnvironment
                && token.UserProfileId != actor.UserProfileId)
            .Select(token => token.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (conflictingToken != Guid.Empty)
        {
            return InvalidRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["token"] = ["The token registration could not be accepted for this authenticated user."]
            });
        }

        var activeTokens = await dbContext.Set<PushDeviceToken>()
            .Where(token => token.UserProfileId == actor.UserProfileId
                && token.Platform == platform
                && token.Provider == provider
                && token.DeviceInstallationHash == deviceInstallationHash
                && token.AppBuildEnvironment == appBuildEnvironment
                && token.Status == PushDeviceTokenStatuses.Active)
            .ToListAsync(cancellationToken);

        var existingToken = activeTokens.SingleOrDefault(token => token.TokenFingerprint == tokenFingerprint);
        var replacedPriorToken = false;
        if (existingToken is not null)
        {
            existingToken.LastSeenAtUtc = now;
            existingToken.PermissionState = permissionState;
            existingToken.ClientObservedAtUtc = registerRequest.ClientObservedAtUtc;
            existingToken.AuthSessionId = actor.AuthSessionId;
            existingToken.UpdatedAtUtc = now;
        }
        else
        {
            foreach (var activeToken in activeTokens)
            {
                activeToken.Status = PushDeviceTokenStatuses.Superseded;
                activeToken.StatusReason = "replaced_by_current_device_registration";
                activeToken.SupersededAtUtc = now;
                activeToken.RotatedAtUtc = now;
                activeToken.UpdatedAtUtc = now;
                replacedPriorToken = true;
            }

            var protectedToken = tokenProtector.Protect(rawToken);
            existingToken = new PushDeviceToken
            {
                Id = Guid.NewGuid(),
                AuthAccountId = actor.AuthAccountId,
                UserProfileId = actor.UserProfileId,
                AuthSessionId = actor.AuthSessionId,
                DeviceInstallationHash = deviceInstallationHash,
                Platform = platform,
                Provider = provider,
                AppBuildEnvironment = appBuildEnvironment,
                TokenFingerprint = tokenFingerprint,
                ProtectedTokenBlob = protectedToken.ProtectedTokenBlob,
                ProtectionKeyId = protectedToken.ProtectionKeyId,
                ProtectionPurpose = protectedToken.ProtectionPurpose,
                TokenVersion = 1,
                PermissionState = permissionState,
                Status = PushDeviceTokenStatuses.Active,
                LastSeenAtUtc = now,
                RegisteredAtUtc = now,
                ClientObservedAtUtc = registerRequest.ClientObservedAtUtc,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            dbContext.Set<PushDeviceToken>().Add(existingToken);
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return Results.Problem(
                title: RegisterFailedTitle,
                detail: RegisterFailedDetail,
                statusCode: StatusCodes.Status500InternalServerError);
        }

        return Results.Ok(PushDeviceTokenResponse.From(existingToken, replacedPriorToken));
    }

    private static async Task<IResult> RevokeCurrentTokenAsync(
        [FromBody] PushDeviceTokenRevokeRequest? revokeRequest,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        SettleoraDbContext dbContext,
        IPushTokenFingerprintService fingerprintService,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (request.Query.Count > 0)
        {
            return InvalidRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["query"] = ["Unsupported query fields are not allowed."]
            });
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (!fingerprintService.IsAvailable)
        {
            return ProtectionUnavailable();
        }

        var validation = ValidateRevoke(revokeRequest);
        if (validation.Count > 0)
        {
            return InvalidRequest(validation);
        }

        var platform = Normalize(revokeRequest!.Platform)!;
        var provider = Normalize(revokeRequest.Provider)!;
        var appBuildEnvironment = Normalize(revokeRequest.AppBuildEnvironment)!;
        var rawToken = revokeRequest.Token!.Trim();
        var tokenFingerprint = fingerprintService.CreateTokenFingerprint(provider, appBuildEnvironment, rawToken);
        var deviceInstallationHash = fingerprintService.CreateDeviceInstallationHash(revokeRequest.DeviceInstallationId!.Trim());
        var now = timeProvider.GetUtcNow();

        var token = await dbContext.Set<PushDeviceToken>()
            .SingleOrDefaultAsync(candidate => candidate.UserProfileId == actor.UserProfileId
                && candidate.AuthAccountId == actor.AuthAccountId
                && candidate.AuthSessionId == actor.AuthSessionId
                && candidate.Platform == platform
                && candidate.Provider == provider
                && candidate.AppBuildEnvironment == appBuildEnvironment
                && candidate.DeviceInstallationHash == deviceInstallationHash
                && candidate.TokenFingerprint == tokenFingerprint
                && candidate.Status == PushDeviceTokenStatuses.Active,
                cancellationToken);

        if (token is not null)
        {
            token.Status = PushDeviceTokenStatuses.Revoked;
            token.StatusReason = "current_token_revoked";
            token.RevokedAtUtc = now;
            token.UpdatedAtUtc = now;

            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                dbContext.ChangeTracker.Clear();
                return Results.Problem(
                    title: RevokeFailedTitle,
                    detail: RevokeFailedDetail,
                    statusCode: StatusCodes.Status500InternalServerError);
            }
        }

        return Results.NoContent();
    }

    private static async Task<IResult> RevokeCurrentSessionTokensAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (request.Query.Count > 0 || RequestHasBody(request))
        {
            return InvalidRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                [request.Query.Count > 0 ? "query" : "body"] = ["Unsupported request content is not allowed."]
            });
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var now = timeProvider.GetUtcNow();
        var tokens = await dbContext.Set<PushDeviceToken>()
            .Where(token => token.UserProfileId == actor.UserProfileId
                && token.AuthAccountId == actor.AuthAccountId
                && token.AuthSessionId == actor.AuthSessionId
                && token.Status == PushDeviceTokenStatuses.Active)
            .ToListAsync(cancellationToken);

        foreach (var token in tokens)
        {
            token.Status = PushDeviceTokenStatuses.Revoked;
            token.StatusReason = "current_session_revoked";
            token.RevokedAtUtc = now;
            token.UpdatedAtUtc = now;
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return Results.Problem(
                title: RevokeFailedTitle,
                detail: RevokeFailedDetail,
                statusCode: StatusCodes.Status500InternalServerError);
        }

        return Results.NoContent();
    }

    private static IDictionary<string, string[]> ValidateRegister(PushDeviceTokenRegisterRequest? request)
    {
        var errors = ValidateTokenRequest(
            request?.Platform,
            request?.Provider,
            request?.Token,
            request?.DeviceInstallationId,
            request?.AppBuildEnvironment);

        if (!PushDeviceTokenPermissionStates.IsSupported(Normalize(request?.PermissionState)))
        {
            AddError(errors, "permissionState", "permissionState must be authorized, provisional, denied, or not_determined.");
        }

        return ToErrorDictionary(errors);
    }

    private static IDictionary<string, string[]> ValidateRevoke(PushDeviceTokenRevokeRequest? request)
    {
        return ToErrorDictionary(ValidateTokenRequest(
            request?.Platform,
            request?.Provider,
            request?.Token,
            request?.DeviceInstallationId,
            request?.AppBuildEnvironment));
    }

    private static Dictionary<string, List<string>> ValidateTokenRequest(
        string? platform,
        string? provider,
        string? token,
        string? deviceInstallationId,
        string? appBuildEnvironment)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (token is null)
        {
            AddError(errors, "token", "token is required.");
        }
        else if (string.IsNullOrWhiteSpace(token) || token.Trim().Length > RawTokenMaxLength)
        {
            AddError(errors, "token", "token must be non-blank and at most 4096 characters.");
        }

        if (!PushDeviceTokenPlatforms.IsSupported(Normalize(platform)))
        {
            AddError(errors, "platform", "platform must be ios or android.");
        }

        if (!PushDeviceTokenProviders.IsSupported(Normalize(provider)))
        {
            AddError(errors, "provider", "provider must be apns or fcm.");
        }

        if (!PushDeviceTokenAppBuildEnvironments.IsSupported(Normalize(appBuildEnvironment)))
        {
            AddError(errors, "appBuildEnvironment", "appBuildEnvironment must be development, staging, or production.");
        }

        if (deviceInstallationId is null)
        {
            AddError(errors, "deviceInstallationId", "deviceInstallationId is required.");
        }
        else if (string.IsNullOrWhiteSpace(deviceInstallationId)
            || deviceInstallationId.Trim().Length > DeviceInstallationIdMaxLength)
        {
            AddError(errors, "deviceInstallationId", "deviceInstallationId must be non-blank and at most 256 characters.");
        }

        return errors;
    }

    private static void AddError(Dictionary<string, List<string>> errors, string field, string message)
    {
        if (!errors.TryGetValue(field, out var messages))
        {
            messages = [];
            errors[field] = messages;
        }

        messages.Add(message);
    }

    private static IDictionary<string, string[]> ToErrorDictionary(Dictionary<string, List<string>> errors)
    {
        return errors.ToDictionary(
            pair => pair.Key,
            pair => pair.Value.ToArray(),
            StringComparer.Ordinal);
    }

    private static string? Normalize(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();
    }

    private static bool RequestHasBody(HttpRequest request)
    {
        return request.ContentLength is > 0
            || (request.Headers.TryGetValue("Transfer-Encoding", out var transferEncoding)
                && transferEncoding.Count > 0);
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult InvalidRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidRequestTitle,
            detail: InvalidRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult ProtectionUnavailable()
    {
        return Results.Problem(
            title: ProtectionUnavailableTitle,
            detail: ProtectionUnavailableDetail,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
}
