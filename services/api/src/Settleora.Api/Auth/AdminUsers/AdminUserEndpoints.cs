using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.SignIn;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.AdminUsers;

internal static class AdminUserEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string AdminUserUnavailableTitle = "Admin user unavailable";
    private const string AdminUserUnavailableDetail = "The requested user is unavailable.";
    private const string InvalidAdminUserRequestTitle = "Invalid admin user request";
    private const string InvalidAdminUserRequestDetail = "The submitted admin user request is invalid.";
    private const string AdminUserConflictTitle = "Admin user conflict";
    private const string AdminUserConflictDetail = "Unable to create local user with the submitted information.";
    private const string AdminUserCreationFailedTitle = "Admin user creation failed";
    private const string AdminUserCreationFailedDetail = "Unable to complete local user creation.";
    private const int PasswordMinLength = 12;
    private const int PasswordMaxLength = 4096;

    public static WebApplication MapAdminUserEndpoints(this WebApplication app)
    {
        var adminUsers = app.MapGroup("/api/v1/admin/users")
            .RequireAuthorization(SettleoraAuthorizationPolicies.SystemRoleOwnerOrAdmin);

        adminUsers.MapGet("", ListUsersAsync);
        adminUsers.MapGet("/{userProfileId:guid}", GetUserAsync);
        adminUsers.MapPost("/local", CreateLocalUserAsync);

        return app;
    }

    private static async Task<IResult> ListUsersAsync(
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var users = await LoadUserSummaries(dbContext)
            .OrderBy(user => user.UserProfile.CreatedAtUtc)
            .ThenBy(user => user.UserProfileId)
            .ToListAsync(cancellationToken);

        return Results.Ok(new AdminUserListResponse(
            users.Select(MapSummary).ToArray()));
    }

    private static async Task<IResult> GetUserAsync(
        Guid userProfileId,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var user = await LoadUserSummaries(dbContext)
            .SingleOrDefaultAsync(
                account => account.UserProfileId == userProfileId,
                cancellationToken);

        return user is null
            ? AdminUserUnavailable()
            : Results.Ok(MapSummary(user));
    }

    private static async Task<IResult> CreateLocalUserAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IAdminLocalUserService adminLocalUserService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await ReadCreateRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidAdminUserRequest(readResult.Errors);
        }

        var result = await adminLocalUserService.CreateLocalUserAsync(
            readResult.Request,
            actor,
            cancellationToken);

        return result.Status switch
        {
            AdminLocalUserCreationStatus.Created when result.User is not null => Results.Created(
                $"/api/v1/admin/users/{result.User.UserProfileId:D}",
                result.User),
            AdminLocalUserCreationStatus.DuplicateLocalIdentifier => AdminUserConflict(),
            _ => AdminUserCreationFailed()
        };
    }

    private static IQueryable<AuthAccount> LoadUserSummaries(SettleoraDbContext dbContext)
    {
        return dbContext.Set<AuthAccount>()
            .AsNoTracking()
            .Include(account => account.UserProfile)
            .Include(account => account.RoleAssignments)
            .Where(account => account.DeletedAtUtc == null
                && account.UserProfile.DeletedAtUtc == null);
    }

    private static async Task<CreateRequestReadResult> ReadCreateRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            errors["body"] = ["A JSON object body is required."];
            return CreateRequestReadResult.Invalid(errors);
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
            return CreateRequestReadResult.Invalid(errors);
        }
        catch (BadHttpRequestException)
        {
            errors["body"] = ["A JSON object body is required."];
            return CreateRequestReadResult.Invalid(errors);
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                errors["body"] = ["A JSON object body is required."];
                return CreateRequestReadResult.Invalid(errors);
            }

            string? normalizedIdentifier = null;
            string? password = null;
            string? displayName = null;
            string? defaultCurrency = null;
            var hasIdentifier = false;
            var hasPassword = false;
            var hasDisplayName = false;
            var hasDefaultCurrency = false;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "identifier":
                        hasIdentifier = true;
                        normalizedIdentifier = ReadIdentifier(property.Value, errors);
                        break;
                    case "password":
                        hasPassword = true;
                        password = ReadPassword(property.Value, errors);
                        break;
                    case "displayName":
                        hasDisplayName = true;
                        displayName = ReadDisplayName(property.Value, errors);
                        break;
                    case "defaultCurrency":
                        hasDefaultCurrency = true;
                        defaultCurrency = ReadDefaultCurrency(property.Value, errors);
                        break;
                    default:
                        errors[property.Name] = ["This field is not supported."];
                        break;
                }
            }

            AddMissingRequiredErrors(
                errors,
                hasIdentifier,
                hasPassword,
                hasDisplayName);

            if (errors.Count != 0)
            {
                return CreateRequestReadResult.Invalid(errors);
            }

            return CreateRequestReadResult.Valid(new AdminLocalUserCreationRequest(
                normalizedIdentifier!,
                password!,
                displayName!,
                hasDefaultCurrency ? defaultCurrency : null));
        }
    }

    private static string? ReadIdentifier(
        JsonElement value,
        Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            errors["identifier"] = ["Identifier must be a string."];
            return null;
        }

        var submittedIdentifier = value.GetString();
        if (!LocalAccountIdentifier.TryNormalize(submittedIdentifier, out var normalizedIdentifier))
        {
            errors["identifier"] =
            [
                $"Identifier is required and must be {LocalAccountIdentifier.MaxLength} characters or fewer."
            ];
            return null;
        }

        return normalizedIdentifier;
    }

    private static string? ReadPassword(
        JsonElement value,
        Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            errors["password"] = ["Password must be a string."];
            return null;
        }

        var password = value.GetString();
        if (string.IsNullOrWhiteSpace(password))
        {
            errors["password"] = ["Password is required."];
            return null;
        }

        if (password.Length is < PasswordMinLength or > PasswordMaxLength)
        {
            errors["password"] =
            [
                $"Password must be between {PasswordMinLength} and {PasswordMaxLength} characters."
            ];
            return null;
        }

        return password;
    }

    private static string? ReadDisplayName(
        JsonElement value,
        Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            errors["displayName"] = ["Display name must be a string."];
            return null;
        }

        var displayName = value.GetString()!.Trim();
        if (displayName.Length == 0)
        {
            errors["displayName"] = ["Display name is required."];
            return null;
        }

        if (displayName.Length > UserProfileConstraints.DisplayNameMaxLength)
        {
            errors["displayName"] =
            [
                $"Display name must be {UserProfileConstraints.DisplayNameMaxLength} characters or fewer."
            ];
            return null;
        }

        return displayName;
    }

    private static string? ReadDefaultCurrency(
        JsonElement value,
        Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String)
        {
            errors["defaultCurrency"] = ["Default currency must be null or an uppercase 3-letter currency code."];
            return null;
        }

        var currencyCode = value.GetString();
        if (currencyCode is null || !IsUppercaseCurrencyCode(currencyCode))
        {
            errors["defaultCurrency"] = ["Default currency must be null or an uppercase 3-letter currency code."];
            return null;
        }

        return currencyCode;
    }

    private static bool IsUppercaseCurrencyCode(string value)
    {
        return value.Length == UserProfileConstraints.DefaultCurrencyMaxLength
            && value.All(character => character is >= 'A' and <= 'Z');
    }

    private static void AddMissingRequiredErrors(
        Dictionary<string, string[]> errors,
        bool hasIdentifier,
        bool hasPassword,
        bool hasDisplayName)
    {
        if (!hasIdentifier)
        {
            errors["identifier"] = ["Identifier is required."];
        }

        if (!hasPassword)
        {
            errors["password"] = ["Password is required."];
        }

        if (!hasDisplayName)
        {
            errors["displayName"] = ["Display name is required."];
        }
    }

    private static AdminUserSummaryResponse MapSummary(AuthAccount authAccount)
    {
        var roles = authAccount.RoleAssignments
            .Select(roleAssignment => roleAssignment.Role)
            .Where(SettleoraAuthorizationPolicies.IsSupportedSystemRole)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        roles.Sort(SettleoraAuthorizationPolicies.CompareSystemRoles);

        return new AdminUserSummaryResponse(
            authAccount.UserProfileId,
            authAccount.Id,
            authAccount.UserProfile.DisplayName,
            authAccount.UserProfile.DefaultCurrency,
            authAccount.Status,
            roles,
            authAccount.UserProfile.CreatedAtUtc,
            authAccount.UserProfile.UpdatedAtUtc > authAccount.UpdatedAtUtc
                ? authAccount.UserProfile.UpdatedAtUtc
                : authAccount.UpdatedAtUtc);
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult AdminUserUnavailable()
    {
        return Results.Problem(
            title: AdminUserUnavailableTitle,
            detail: AdminUserUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidAdminUserRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidAdminUserRequestTitle,
            detail: InvalidAdminUserRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult AdminUserConflict()
    {
        return Results.Problem(
            title: AdminUserConflictTitle,
            detail: AdminUserConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult AdminUserCreationFailed()
    {
        return Results.Problem(
            title: AdminUserCreationFailedTitle,
            detail: AdminUserCreationFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private sealed class CreateRequestReadResult
    {
        private CreateRequestReadResult(
            AdminLocalUserCreationRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public AdminLocalUserCreationRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static CreateRequestReadResult Valid(AdminLocalUserCreationRequest request)
        {
            return new CreateRequestReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static CreateRequestReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new CreateRequestReadResult(null, errors);
        }
    }
}
