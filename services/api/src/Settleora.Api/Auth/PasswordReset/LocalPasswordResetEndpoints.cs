using System.Net.Mail;
using Settleora.Api.Auth;

namespace Settleora.Api.Auth.PasswordReset;

internal static class LocalPasswordResetEndpoints
{
    private const string InvalidAuthRequestTitle = "Invalid auth request";
    private const string InvalidAuthRequestDetail = "The submitted auth request is invalid.";
    private const string UnsupportedFieldsDetail = "Unsupported fields are not allowed.";
    private const string ResetCompleteFailedTitle = "Password reset failed";
    private const string ResetCompleteFailedDetail = "Unable to complete password reset with the submitted information.";
    private const string ResetCompleteUnavailableDetail = "Unable to complete password reset.";
    private const string LocalSingleNodeSourceKey = "src:local-single-node";
    private const int ResetIdentifierMaxLength = 320;
    private const int ResetMaterialMaxLength = 4096;
    private const int PasswordMinLength = 12;
    private const int PasswordMaxLength = 4096;

    private static readonly HashSet<string> AllowedResetRequestProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "resetIdentifier"
    };

    private static readonly HashSet<string> AllowedResetCompleteProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "resetMaterial",
        "newPassword"
    };

    public static WebApplication MapLocalPasswordResetEndpoints(this WebApplication app)
    {
        app.MapPost("/api/v1/auth/password-reset/request", RequestResetAsync)
            .AllowAnonymous();
        app.MapPost("/api/v1/auth/password-reset/complete", CompleteResetAsync)
            .AllowAnonymous();

        return app;
    }

    private static async Task<IResult> RequestResetAsync(
        HttpRequest request,
        ILocalPasswordResetService localPasswordResetService,
        IPasswordResetEmailDeliveryOrchestrator deliveryOrchestrator,
        IPasswordResetPublicResponsePolicy publicResponsePolicy,
        CancellationToken cancellationToken)
    {
        if (!request.HasJsonContentType())
        {
            return InvalidAuthRequest();
        }

        var readResult = await AuthEndpointRequestValidation.ReadLimitedJsonObjectAsync<LocalPasswordResetEndpointRequest>(
            request,
            AllowedResetRequestProperties,
            cancellationToken);
        if (readResult.Status == AuthJsonRequestStatus.UnsupportedFields)
        {
            return UnsupportedFields();
        }

        if (readResult.Status != AuthJsonRequestStatus.Valid
            || readResult.Request is null
            || !TryMapRequest(readResult.Request, out var resetRequest))
        {
            return InvalidAuthRequest();
        }

        await localPasswordResetService.RequestResetAsync(resetRequest, cancellationToken);

        var deliveryResult = await deliveryOrchestrator.DeliverAsync(
            new PasswordResetEmailDeliveryRequest(
                resetRequest.SubmittedIdentifier,
                TryDeriveRecipientEmailAddress(resetRequest.SubmittedIdentifier),
                resetRequest.SourceBucketRef,
                resetRequest.RequestCorrelationId),
            cancellationToken);
        var decision = publicResponsePolicy.DecideForRequest(deliveryResult);

        return Results.StatusCode(decision.StatusCode);
    }

    private static async Task<IResult> CompleteResetAsync(
        HttpRequest request,
        ILocalPasswordResetService localPasswordResetService,
        CancellationToken cancellationToken)
    {
        if (!request.HasJsonContentType())
        {
            return InvalidAuthRequest();
        }

        var readResult = await AuthEndpointRequestValidation.ReadLimitedJsonObjectAsync<LocalPasswordResetCompleteEndpointRequest>(
            request,
            AllowedResetCompleteProperties,
            cancellationToken);
        if (readResult.Status == AuthJsonRequestStatus.UnsupportedFields)
        {
            return UnsupportedFields();
        }

        if (readResult.Status != AuthJsonRequestStatus.Valid
            || readResult.Request is null
            || !TryMapRequest(readResult.Request, out var completeRequest))
        {
            return InvalidAuthRequest();
        }

        var result = await localPasswordResetService.CompleteResetAsync(completeRequest, cancellationToken);
        return result.Status switch
        {
            LocalPasswordResetCompleteStatus.Completed => Results.NoContent(),
            LocalPasswordResetCompleteStatus.PersistenceFailed => ResetCompleteUnavailable(),
            _ => ResetCompleteFailed()
        };
    }

    private static bool TryMapRequest(
        LocalPasswordResetEndpointRequest endpointRequest,
        out LocalPasswordResetRequest resetRequest)
    {
        resetRequest = default!;

        if (!IsBoundedRequiredInput(endpointRequest.ResetIdentifier, ResetIdentifierMaxLength))
        {
            return false;
        }

        resetRequest = new LocalPasswordResetRequest(
            endpointRequest.ResetIdentifier,
            LocalSingleNodeSourceKey,
            RequestCorrelationId: null);
        return true;
    }

    private static bool TryMapRequest(
        LocalPasswordResetCompleteEndpointRequest endpointRequest,
        out LocalPasswordResetCompleteRequest completeRequest)
    {
        completeRequest = default!;

        if (!IsBoundedRequiredInput(endpointRequest.ResetMaterial, ResetMaterialMaxLength)
            || !IsBoundedRequiredInput(endpointRequest.NewPassword, PasswordMaxLength)
            || endpointRequest.NewPassword!.Length < PasswordMinLength)
        {
            return false;
        }

        completeRequest = new LocalPasswordResetCompleteRequest(
            endpointRequest.ResetMaterial,
            endpointRequest.NewPassword,
            RequestCorrelationId: null);
        return true;
    }

    private static bool IsBoundedRequiredInput(string? value, int maxLength)
    {
        return !string.IsNullOrWhiteSpace(value)
            && value.Length <= maxLength;
    }

    private static string? TryDeriveRecipientEmailAddress(string? submittedIdentifier)
    {
        if (string.IsNullOrWhiteSpace(submittedIdentifier)
            || submittedIdentifier.Length > ResetIdentifierMaxLength)
        {
            return null;
        }

        try
        {
            var address = new MailAddress(submittedIdentifier.Trim());
            return string.IsNullOrWhiteSpace(address.Address)
                ? null
                : address.Address;
        }
        catch (FormatException)
        {
            return null;
        }
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

    private static IResult ResetCompleteFailed()
    {
        return Results.Problem(
            title: ResetCompleteFailedTitle,
            detail: ResetCompleteFailedDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult ResetCompleteUnavailable()
    {
        return Results.Problem(
            title: ResetCompleteFailedTitle,
            detail: ResetCompleteUnavailableDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private sealed record LocalPasswordResetEndpointRequest(string? ResetIdentifier);

    private sealed record LocalPasswordResetCompleteEndpointRequest(
        string? ResetMaterial,
        string? NewPassword);
}
