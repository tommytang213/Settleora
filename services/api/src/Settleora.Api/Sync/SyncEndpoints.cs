using Settleora.Api.Auth.Authorization;
using Settleora.Api.RequestValidation;

namespace Settleora.Api.Sync;

internal static class SyncEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string InvalidSyncRequestTitle = "Invalid sync request";
    private const string InvalidSyncRequestDetail = "The submitted sync request is invalid.";
    private const string InvalidChangeFeedBodyMessage = "Sync change feed requests do not accept a body.";
    private const string SyncOperationUnavailableTitle = "Sync operation unavailable";
    private const string SyncOperationUnavailableDetail = "The requested sync operation is unavailable.";
    private const string SyncWriteFailedTitle = "Sync write failed";
    private const string SyncWriteFailedDetail = "Unable to complete sync operation write.";
    private static readonly string[] SupportedChangeFeedQueryFields = ["sinceVersion", "limit", "resourceType"];

    public static WebApplication MapSyncEndpoints(this WebApplication app)
    {
        var sync = app.MapGroup("/api/v1/sync")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        sync.MapPost("/operations", PostOperationAsync);
        sync.MapGet("/operations/{syncOperationId:guid}", GetOperationAsync);
        sync.MapGet("/changes", GetChangesAsync);

        return app;
    }

    private static async Task<IResult> PostOperationAsync(
        SyncOperationRequest request,
        ICurrentActorAccessor currentActorAccessor,
        SyncOperationService syncOperationService,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var result = await syncOperationService.ProcessOperationAsync(
            request,
            actor,
            cancellationToken);

        return result.Kind switch
        {
            SyncOperationProcessResultKind.Ok => Results.Ok(result.Response),
            SyncOperationProcessResultKind.InvalidRequest => InvalidSyncRequest(result.Error!),
            _ => SyncWriteFailed()
        };
    }

    private static async Task<IResult> GetOperationAsync(
        Guid syncOperationId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        SyncOperationService syncOperationService,
        CancellationToken cancellationToken)
    {
        if (UnsupportedRequestFieldGuards.RequestHasBody(request))
        {
            return InvalidSyncRequest("This sync operation readout does not accept a request body.");
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var result = await syncOperationService.GetOperationAsync(
            syncOperationId,
            actor,
            cancellationToken);

        return result.Kind is SyncOperationReadResultKind.Ok
            ? Results.Ok(result.Response)
            : SyncOperationUnavailable();
    }

    private static async Task<IResult> GetChangesAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        SyncOperationService syncOperationService,
        CancellationToken cancellationToken)
    {
        var readResult = ReadChangeFeedRequest(request);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidSyncRequest(readResult.Errors);
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var changeFeedRequest = readResult.Request;
        var result = await syncOperationService.ListChangesAsync(
            actor,
            changeFeedRequest.SinceVersion,
            changeFeedRequest.Limit,
            changeFeedRequest.ResourceType,
            cancellationToken);

        return result.Kind is SyncChangeFeedResultKind.Ok
            ? Results.Ok(result.Response)
            : InvalidSyncRequest(result.Error!);
    }

    private static ChangeFeedRequestReadResult ReadChangeFeedRequest(HttpRequest request)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        RejectUnsupportedChangeFeedQueryFields(request, errors);
        RejectChangeFeedBody(request, errors);

        var sinceVersion = ReadOptionalLong(request, "sinceVersion", errors);
        if (sinceVersion is < 0)
        {
            AddError(errors, "sinceVersion", "sinceVersion must be greater than or equal to zero.");
        }

        var limit = ReadOptionalInt(request, "limit", errors);
        if (limit is < 1)
        {
            AddError(errors, "limit", "limit must be greater than zero.");
        }

        var resourceType = ReadOptionalString(request, "resourceType", errors);
        if (!string.IsNullOrWhiteSpace(resourceType)
            && !StringComparer.Ordinal.Equals(resourceType, Domain.Sync.SyncResourceTypes.ExpenseBill))
        {
            AddError(errors, "resourceType", "resourceType is not supported.");
        }

        return errors.Count == 0
            ? ChangeFeedRequestReadResult.Valid(new ChangeFeedRequest(sinceVersion, limit, resourceType))
            : ChangeFeedRequestReadResult.Invalid(ToErrorDictionary(errors));
    }

    private static void RejectUnsupportedChangeFeedQueryFields(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        if (request.Query.Count == 0)
        {
            return;
        }

        foreach (var field in request.Query.Keys)
        {
            if (!SupportedChangeFeedQueryFields.Contains(field, StringComparer.Ordinal))
            {
                AddError(errors, "query", "Unsupported query fields are not allowed.");
                return;
            }
        }

        foreach (var supportedField in SupportedChangeFeedQueryFields)
        {
            if (request.Query.TryGetValue(supportedField, out var values)
                && values.Count > 1)
            {
                AddError(errors, supportedField, $"{supportedField} accepts only one value.");
            }
        }
    }

    private static void RejectChangeFeedBody(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        if (UnsupportedRequestFieldGuards.RequestHasBody(request))
        {
            AddError(errors, "body", InvalidChangeFeedBodyMessage);
        }
    }

    private static long? ReadOptionalLong(
        HttpRequest request,
        string field,
        Dictionary<string, List<string>> errors)
    {
        var value = ReadOptionalString(request, field, errors);
        if (value is null)
        {
            return null;
        }

        if (!long.TryParse(value, out var parsed))
        {
            AddError(errors, field, $"{field} must be an integer.");
            return null;
        }

        return parsed;
    }

    private static int? ReadOptionalInt(
        HttpRequest request,
        string field,
        Dictionary<string, List<string>> errors)
    {
        var value = ReadOptionalString(request, field, errors);
        if (value is null)
        {
            return null;
        }

        if (!int.TryParse(value, out var parsed))
        {
            AddError(errors, field, $"{field} must be an integer.");
            return null;
        }

        return parsed;
    }

    private static string? ReadOptionalString(
        HttpRequest request,
        string field,
        Dictionary<string, List<string>> errors)
    {
        if (!request.Query.TryGetValue(field, out var values) || values.Count == 0)
        {
            return null;
        }

        return values.Count > 1
            ? null
            : values.ToString();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult InvalidSyncRequest(string detail)
    {
        return Results.Problem(
            title: InvalidSyncRequestTitle,
            detail: detail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvalidSyncRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidSyncRequestTitle,
            detail: InvalidSyncRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult SyncWriteFailed()
    {
        return Results.Problem(
            title: SyncWriteFailedTitle,
            detail: SyncWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static IResult SyncOperationUnavailable()
    {
        return Results.Problem(
            title: SyncOperationUnavailableTitle,
            detail: SyncOperationUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static void AddError(
        Dictionary<string, List<string>> errors,
        string key,
        string message)
    {
        if (!errors.TryGetValue(key, out var values))
        {
            values = [];
            errors[key] = values;
        }

        if (!values.Contains(message, StringComparer.Ordinal))
        {
            values.Add(message);
        }
    }

    private static IDictionary<string, string[]> ToErrorDictionary(
        Dictionary<string, List<string>> errors)
    {
        return errors.ToDictionary(
            pair => pair.Key,
            pair => pair.Value.ToArray(),
            StringComparer.Ordinal);
    }

    private sealed record ChangeFeedRequest(
        long? SinceVersion,
        int? Limit,
        string? ResourceType);

    private sealed class ChangeFeedRequestReadResult
    {
        private ChangeFeedRequestReadResult(
            ChangeFeedRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public ChangeFeedRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static ChangeFeedRequestReadResult Valid(ChangeFeedRequest request)
        {
            return new ChangeFeedRequestReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static ChangeFeedRequestReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new ChangeFeedRequestReadResult(null, errors);
        }
    }
}
