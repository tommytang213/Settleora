using Settleora.Api.Auth.Authorization;

namespace Settleora.Api.Notifications;

internal static class AdminNotificationPolicyEndpoints
{
    public static WebApplication MapAdminNotificationPolicyEndpoints(this WebApplication app)
    {
        var adminPolicy = app.MapGroup("/api/v1/admin/notification-policy")
            .RequireAuthorization(SettleoraAuthorizationPolicies.SystemRoleOwnerOrAdmin);

        adminPolicy.MapGet("", GetPolicyReadoutAsync);

        return app;
    }

    private static async Task<IResult> GetPolicyReadoutAsync(
        HttpRequest request,
        IAdminNotificationPolicyReadoutService readoutService,
        CancellationToken cancellationToken)
    {
        if (request.Query.Count > 0)
        {
            return Results.ValidationProblem(
                new Dictionary<string, string[]>(StringComparer.Ordinal)
                {
                    ["query"] = ["Unsupported query fields are not allowed."]
                },
                title: "Invalid notification policy readout request",
                detail: "The submitted notification policy readout request is invalid.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        if (RequestHasBody(request))
        {
            return Results.ValidationProblem(
                new Dictionary<string, string[]>(StringComparer.Ordinal)
                {
                    ["body"] = ["This notification policy readout does not accept a request body."]
                },
                title: "Invalid notification policy readout request",
                detail: "The submitted notification policy readout request is invalid.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var readout = await readoutService.GetReadoutAsync(cancellationToken);
        return Results.Ok(readout);
    }

    private static bool RequestHasBody(HttpRequest request)
    {
        return (request.ContentLength ?? 0) > 0
            || request.Headers.ContainsKey("Transfer-Encoding");
    }
}
