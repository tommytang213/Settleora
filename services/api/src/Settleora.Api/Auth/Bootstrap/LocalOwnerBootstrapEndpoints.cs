using System.Text.Json;
using Settleora.Api.Auth.SignIn;
using Settleora.Api.Domain.Users;
using Settleora.Api.Users.SelfProfile;

namespace Settleora.Api.Auth.Bootstrap;

internal static class LocalOwnerBootstrapEndpoints
{
    private const string BootstrapUnavailableTitle = "Bootstrap unavailable";
    private const string BootstrapUnavailableDetail = "Local owner bootstrap is unavailable for this deployment state.";
    private const string InvalidBootstrapRequestTitle = "Invalid bootstrap request";
    private const string InvalidBootstrapRequestDetail = "The submitted bootstrap request is invalid.";
    private const string BootstrapFailedTitle = "Bootstrap failed";
    private const string BootstrapFailedDetail = "Unable to complete local owner bootstrap.";
    private const int PasswordMinLength = 12;
    private const int PasswordMaxLength = 4096;

    public static WebApplication MapLocalOwnerBootstrapEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/auth/bootstrap/status", GetBootstrapStatusAsync);
        app.MapPost("/api/v1/auth/bootstrap/local-owner", CreateLocalOwnerAsync);

        return app;
    }

    private static async Task<IResult> GetBootstrapStatusAsync(
        ILocalOwnerBootstrapService bootstrapService,
        CancellationToken cancellationToken)
    {
        var bootstrapRequired = await bootstrapService.IsBootstrapRequiredAsync(cancellationToken);
        return Results.Ok(new BootstrapStatusResponse(bootstrapRequired));
    }

    private static async Task<IResult> CreateLocalOwnerAsync(
        HttpRequest request,
        ILocalOwnerBootstrapService bootstrapService,
        CancellationToken cancellationToken)
    {
        var readResult = await ReadBootstrapRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidBootstrapRequest(readResult.Errors);
        }

        var result = await bootstrapService.CreateLocalOwnerAsync(
            readResult.Request,
            cancellationToken);

        return result.Status switch
        {
            LocalOwnerBootstrapCreationStatus.Created
                when result.UserProfile is not null => Results.Ok(MapResponse(result.UserProfile, result.Roles)),
            LocalOwnerBootstrapCreationStatus.BootstrapUnavailable => BootstrapUnavailable(),
            _ => BootstrapFailed()
        };
    }

    private static async Task<BootstrapRequestReadResult> ReadBootstrapRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            errors["body"] = ["A JSON object body is required."];
            return BootstrapRequestReadResult.Invalid(errors);
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
            return BootstrapRequestReadResult.Invalid(errors);
        }
        catch (BadHttpRequestException)
        {
            errors["body"] = ["A JSON object body is required."];
            return BootstrapRequestReadResult.Invalid(errors);
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                errors["body"] = ["A JSON object body is required."];
                return BootstrapRequestReadResult.Invalid(errors);
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
                return BootstrapRequestReadResult.Invalid(errors);
            }

            return BootstrapRequestReadResult.Valid(new LocalOwnerBootstrapRequest(
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

    private static BootstrapLocalOwnerResponse MapResponse(
        UserProfile userProfile,
        IReadOnlyList<string> roles)
    {
        return new BootstrapLocalOwnerResponse(
            new SelfUserProfileResponse(
                userProfile.Id,
                userProfile.DisplayName,
                userProfile.DefaultCurrency,
                userProfile.CreatedAtUtc,
                userProfile.UpdatedAtUtc),
            roles);
    }

    private static IResult BootstrapUnavailable()
    {
        return Results.Problem(
            title: BootstrapUnavailableTitle,
            detail: BootstrapUnavailableDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult InvalidBootstrapRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidBootstrapRequestTitle,
            detail: InvalidBootstrapRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult BootstrapFailed()
    {
        return Results.Problem(
            title: BootstrapFailedTitle,
            detail: BootstrapFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private sealed class BootstrapRequestReadResult
    {
        private BootstrapRequestReadResult(
            LocalOwnerBootstrapRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public LocalOwnerBootstrapRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static BootstrapRequestReadResult Valid(LocalOwnerBootstrapRequest request)
        {
            return new BootstrapRequestReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static BootstrapRequestReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new BootstrapRequestReadResult(null, errors);
        }
    }
}
