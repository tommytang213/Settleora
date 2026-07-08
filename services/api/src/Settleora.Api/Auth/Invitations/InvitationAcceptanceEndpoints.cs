using System.Text.Json;
using Settleora.Api.Domain.Users;

namespace Settleora.Api.Auth.Invitations;

internal static class InvitationAcceptanceEndpoints
{
    private const string InvitationAcceptFailedTitle = "Invitation acceptance failed";
    private const string InvitationAcceptFailedDetail = "Unable to accept the submitted invitation.";
    private const string InvalidAuthRequestTitle = "Invalid auth request";
    private const string UnsupportedFieldsDetail = "Unsupported fields are not allowed.";
    private const string TooManyAttemptsTitle = "Too many invitation acceptance attempts";
    private const string TooManyAttemptsDetail = "Too many invitation acceptance attempts. Try again later.";
    private const int InvitationSecretMaxLength = 4096;
    private const int PasswordMinLength = 12;
    private const int PasswordMaxLength = 4096;
    private static readonly HashSet<string> AllowedAcceptProperties = new(StringComparer.Ordinal)
    {
        "invitationSecret",
        "displayName",
        "localPassword"
    };

    public static WebApplication MapInvitationAcceptanceEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/auth/invitations/accept", AcceptInvitationAsync)
            .AllowAnonymous();

        return app;
    }

    private static async Task<IResult> AcceptInvitationAsync(
        HttpRequest request,
        IInvitationAcceptanceService invitationAcceptanceService,
        CancellationToken cancellationToken)
    {
        if (!request.HasJsonContentType())
        {
            return InvitationAcceptFailed();
        }

        var readResult = await ReadAcceptRequestAsync(request, cancellationToken);
        if (readResult.Status == AcceptRequestReadStatus.UnsupportedFields)
        {
            return UnsupportedFields();
        }

        if (readResult.Status != AcceptRequestReadStatus.Valid || readResult.Request is null)
        {
            return InvitationAcceptFailed();
        }

        var result = await invitationAcceptanceService.AcceptInvitationAsync(
            readResult.Request,
            cancellationToken);

        return result.Status switch
        {
            InvitationAcceptanceStatus.Accepted => Results.Ok(new InvitationAcceptResponse(
                "accepted_sign_in_required",
                SignInRequired: true)),
            InvitationAcceptanceStatus.Throttled => TooManyAttempts(),
            _ => InvitationAcceptFailed()
        };
    }

    private static async Task<AcceptRequestReadResult> ReadAcceptRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(
                request.Body,
                cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            return AcceptRequestReadResult.Malformed();
        }
        catch (BadHttpRequestException)
        {
            return AcceptRequestReadResult.Malformed();
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                return AcceptRequestReadResult.Malformed();
            }

            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (!AllowedAcceptProperties.Contains(property.Name))
                {
                    return AcceptRequestReadResult.UnsupportedFields();
                }
            }

            if (!TryReadString(
                    document.RootElement,
                    "invitationSecret",
                    minLength: 1,
                    InvitationSecretMaxLength,
                    out var invitationSecret)
                || !TryReadString(
                    document.RootElement,
                    "displayName",
                    minLength: 1,
                    UserProfileConstraints.DisplayNameMaxLength,
                    out var displayName)
                || !TryReadString(
                    document.RootElement,
                    "localPassword",
                    PasswordMinLength,
                    PasswordMaxLength,
                    out var localPassword))
            {
                return AcceptRequestReadResult.Malformed();
            }

            return AcceptRequestReadResult.Valid(new InvitationAcceptRequest(
                invitationSecret,
                displayName,
                localPassword));
        }
    }

    private static bool TryReadString(
        JsonElement root,
        string propertyName,
        int minLength,
        int maxLength,
        out string value)
    {
        value = string.Empty;
        if (!root.TryGetProperty(propertyName, out var property)
            || property.ValueKind is not JsonValueKind.String)
        {
            return false;
        }

        var text = property.GetString();
        if (text is null)
        {
            return false;
        }

        if (propertyName is "localPassword")
        {
            if (text.Length < minLength || text.Length > maxLength || string.IsNullOrWhiteSpace(text))
            {
                return false;
            }

            value = text;
            return true;
        }

        var trimmed = text.Trim();
        if (trimmed.Length < minLength || trimmed.Length > maxLength)
        {
            return false;
        }

        value = trimmed;
        return true;
    }

    private static IResult InvitationAcceptFailed()
    {
        return Results.Problem(
            title: InvitationAcceptFailedTitle,
            detail: InvitationAcceptFailedDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult TooManyAttempts()
    {
        return Results.Problem(
            title: TooManyAttemptsTitle,
            detail: TooManyAttemptsDetail,
            statusCode: StatusCodes.Status429TooManyRequests);
    }

    private static IResult UnsupportedFields()
    {
        return Results.Problem(
            title: InvalidAuthRequestTitle,
            detail: UnsupportedFieldsDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private sealed record AcceptRequestReadResult(
        AcceptRequestReadStatus Status,
        InvitationAcceptRequest? Request)
    {
        public static AcceptRequestReadResult Valid(InvitationAcceptRequest request)
        {
            return new AcceptRequestReadResult(AcceptRequestReadStatus.Valid, request);
        }

        public static AcceptRequestReadResult Malformed()
        {
            return new AcceptRequestReadResult(AcceptRequestReadStatus.Malformed, null);
        }

        public static AcceptRequestReadResult UnsupportedFields()
        {
            return new AcceptRequestReadResult(AcceptRequestReadStatus.UnsupportedFields, null);
        }
    }

    private enum AcceptRequestReadStatus
    {
        Valid,
        Malformed,
        UnsupportedFields
    }
}
