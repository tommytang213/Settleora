using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth;

namespace Settleora.Api.Auth.PasswordChange;

internal static class CurrentAccountPasswordChangeEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string InvalidAuthRequestTitle = "Invalid auth request";
    private const string InvalidAuthRequestDetail = "The submitted auth request is invalid.";
    private const string UnsupportedFieldsDetail = "Unsupported fields are not allowed.";
    private const string PasswordChangeFailedTitle = "Password change failed";
    private const string PasswordChangeFailedDetail = "Unable to complete password change.";
    private const int PasswordMinLength = 12;
    private const int PasswordMaxLength = 4096;

    private static readonly HashSet<string> AllowedPasswordChangeProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "currentPassword",
        "newPassword"
    };

    public static WebApplication MapCurrentAccountPasswordChangeEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/auth/password/change", ChangePasswordAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        return app;
    }

    private static async Task<IResult> ChangePasswordAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        ICurrentAccountPasswordChangeService passwordChangeService,
        CancellationToken cancellationToken)
    {
        if (!request.HasJsonContentType())
        {
            return InvalidAuthRequest();
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await AuthEndpointRequestValidation.ReadLimitedJsonObjectAsync<CurrentAccountPasswordChangeEndpointRequest>(
            request,
            AllowedPasswordChangeProperties,
            cancellationToken);
        if (readResult.Status == AuthJsonRequestStatus.UnsupportedFields)
        {
            return UnsupportedFields();
        }

        if (readResult.Status != AuthJsonRequestStatus.Valid
            || readResult.Request is null
            || !TryMapRequest(readResult.Request, actor, out var passwordChangeRequest))
        {
            return InvalidAuthRequest();
        }

        var result = await passwordChangeService.ChangePasswordAsync(passwordChangeRequest, cancellationToken);
        return result.Status switch
        {
            CurrentAccountPasswordChangeStatus.Changed => Results.NoContent(),
            CurrentAccountPasswordChangeStatus.InvalidCurrentPassword => Unauthenticated(),
            CurrentAccountPasswordChangeStatus.SamePassword => InvalidAuthRequest(),
            CurrentAccountPasswordChangeStatus.InvalidNewPassword => InvalidAuthRequest(),
            CurrentAccountPasswordChangeStatus.PersistenceFailed => PasswordChangeFailed(),
            CurrentAccountPasswordChangeStatus.Unavailable => Unauthenticated(),
            _ => PasswordChangeFailed()
        };
    }

    private static bool TryMapRequest(
        CurrentAccountPasswordChangeEndpointRequest endpointRequest,
        AuthenticatedActor actor,
        out CurrentAccountPasswordChangeRequest passwordChangeRequest)
    {
        passwordChangeRequest = default!;

        if (!IsPasswordInputBounded(endpointRequest.CurrentPassword)
            || !IsPasswordInputBounded(endpointRequest.NewPassword)
            || endpointRequest.NewPassword!.Length < PasswordMinLength)
        {
            return false;
        }

        passwordChangeRequest = new CurrentAccountPasswordChangeRequest(
            actor,
            endpointRequest.CurrentPassword!,
            endpointRequest.NewPassword);
        return true;
    }

    private static bool IsPasswordInputBounded(string? password)
    {
        return !string.IsNullOrWhiteSpace(password)
            && password.Length <= PasswordMaxLength;
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult InvalidAuthRequest()
    {
        return Results.Problem(
            title: InvalidAuthRequestTitle,
            detail: InvalidAuthRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult UnsupportedFields()
    {
        return Results.Problem(
            title: InvalidAuthRequestTitle,
            detail: UnsupportedFieldsDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult PasswordChangeFailed()
    {
        return Results.Problem(
            title: PasswordChangeFailedTitle,
            detail: PasswordChangeFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }
}
