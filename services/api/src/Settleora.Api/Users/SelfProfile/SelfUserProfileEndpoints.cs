using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Users.SelfProfile;

internal static class SelfUserProfileEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string ProfileUnavailableTitle = "Profile unavailable";
    private const string ProfileUnavailableDetail = "The requested profile is unavailable.";
    private const string InvalidProfileUpdateTitle = "Invalid profile update";
    private const string InvalidProfileUpdateDetail = "The submitted profile update is invalid.";
    private const string ProfileUpdateFailedTitle = "Profile update failed";
    private const string ProfileUpdateFailedDetail = "Unable to complete profile update.";

    public static WebApplication MapSelfUserProfileEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/users/me/profile", GetSelfProfileAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        app.MapPatch("/api/v1/users/me/profile", UpdateSelfProfileAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        return app;
    }

    private static async Task<IResult> GetSelfProfileAsync(
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var userProfile = await LoadProfileAsync(
            dbContext,
            actor.UserProfileId,
            trackChanges: false,
            cancellationToken);

        return userProfile is null
            ? ProfileUnavailable()
            : Results.Ok(MapResponse(userProfile));
    }

    private static async Task<IResult> UpdateSelfProfileAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var patchResult = await ReadPatchAsync(request, cancellationToken);
        if (!patchResult.Succeeded || patchResult.Patch is null)
        {
            return InvalidProfileUpdate(patchResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var userProfile = await LoadProfileAsync(
            dbContext,
            actor.UserProfileId,
            trackChanges: true,
            cancellationToken);
        if (userProfile is null)
        {
            return ProfileUnavailable();
        }

        var patch = patchResult.Patch;
        if (patch.HasDisplayName)
        {
            userProfile.DisplayName = patch.DisplayName!;
        }

        if (patch.HasDefaultCurrency)
        {
            userProfile.DefaultCurrency = patch.DefaultCurrency;
        }

        userProfile.UpdatedAtUtc = timeProvider.GetUtcNow();

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return ProfileUpdateFailed();
        }

        return Results.Ok(MapResponse(userProfile));
    }

    private static async Task<UserProfile?> LoadProfileAsync(
        SettleoraDbContext dbContext,
        Guid userProfileId,
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        var profiles = dbContext.Set<UserProfile>()
            .Where(profile => profile.Id == userProfileId
                && profile.DeletedAtUtc == null);

        if (!trackChanges)
        {
            profiles = profiles.AsNoTracking();
        }

        return await profiles.SingleOrDefaultAsync(cancellationToken);
    }

    private static async Task<ProfilePatchReadResult> ReadPatchAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            errors["body"] = ["A JSON object body is required."];
            return ProfilePatchReadResult.Invalid(errors);
        }

        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(
                request.Body,
                cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            errors["body"] = ["A JSON object body is required."];
            return ProfilePatchReadResult.Invalid(errors);
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                errors["body"] = ["A JSON object body is required."];
                return ProfilePatchReadResult.Invalid(errors);
            }

            var patch = new ProfilePatch();
            var recognizedFieldCount = 0;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "displayName":
                        recognizedFieldCount++;
                        ReadDisplayName(property.Value, patch, errors);
                        break;
                    case "defaultCurrency":
                        recognizedFieldCount++;
                        ReadDefaultCurrency(property.Value, patch, errors);
                        break;
                    default:
                        errors[property.Name] = ["This field is not supported."];
                        break;
                }
            }

            if (recognizedFieldCount == 0)
            {
                errors["body"] = ["At least one supported profile field is required."];
            }

            return errors.Count == 0
                ? ProfilePatchReadResult.Valid(patch)
                : ProfilePatchReadResult.Invalid(errors);
        }
    }

    private static void ReadDisplayName(
        JsonElement value,
        ProfilePatch patch,
        Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            errors["displayName"] = ["Display name must be a string."];
            return;
        }

        var displayName = value.GetString()!.Trim();
        if (displayName.Length == 0)
        {
            errors["displayName"] = ["Display name is required when supplied."];
            return;
        }

        if (displayName.Length > UserProfileConstraints.DisplayNameMaxLength)
        {
            errors["displayName"] =
            [
                $"Display name must be {UserProfileConstraints.DisplayNameMaxLength} characters or fewer."
            ];
            return;
        }

        patch.HasDisplayName = true;
        patch.DisplayName = displayName;
    }

    private static void ReadDefaultCurrency(
        JsonElement value,
        ProfilePatch patch,
        Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            patch.HasDefaultCurrency = true;
            patch.DefaultCurrency = null;
            return;
        }

        if (value.ValueKind is not JsonValueKind.String)
        {
            errors["defaultCurrency"] = ["Default currency must be null or an uppercase 3-letter currency code."];
            return;
        }

        var currencyCode = value.GetString();
        if (currencyCode is null || !IsUppercaseCurrencyCode(currencyCode))
        {
            errors["defaultCurrency"] = ["Default currency must be null or an uppercase 3-letter currency code."];
            return;
        }

        patch.HasDefaultCurrency = true;
        patch.DefaultCurrency = currencyCode;
    }

    private static bool IsUppercaseCurrencyCode(string value)
    {
        return value.Length == UserProfileConstraints.DefaultCurrencyMaxLength
            && value.All(character => character is >= 'A' and <= 'Z');
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : ProfileUnavailable();
    }

    private static SelfUserProfileResponse MapResponse(UserProfile userProfile)
    {
        return new SelfUserProfileResponse(
            userProfile.Id,
            userProfile.DisplayName,
            userProfile.DefaultCurrency,
            userProfile.CreatedAtUtc,
            userProfile.UpdatedAtUtc);
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult ProfileUnavailable()
    {
        return Results.Problem(
            title: ProfileUnavailableTitle,
            detail: ProfileUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidProfileUpdate(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidProfileUpdateTitle,
            detail: InvalidProfileUpdateDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult ProfileUpdateFailed()
    {
        return Results.Problem(
            title: ProfileUpdateFailedTitle,
            detail: ProfileUpdateFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private sealed class ProfilePatch
    {
        public bool HasDisplayName { get; set; }

        public string? DisplayName { get; set; }

        public bool HasDefaultCurrency { get; set; }

        public string? DefaultCurrency { get; set; }
    }

    private sealed class ProfilePatchReadResult
    {
        private ProfilePatchReadResult(
            ProfilePatch? patch,
            IDictionary<string, string[]> errors)
        {
            Patch = patch;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public ProfilePatch? Patch { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static ProfilePatchReadResult Valid(ProfilePatch patch)
        {
            return new ProfilePatchReadResult(
                patch,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static ProfilePatchReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new ProfilePatchReadResult(null, errors);
        }
    }
}
