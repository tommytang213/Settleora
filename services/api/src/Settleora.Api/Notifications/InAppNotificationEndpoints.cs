using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Notifications;

internal static class InAppNotificationEndpoints
{
    private const int DefaultLimit = 50;
    private const int MaxLimit = 100;
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string NotificationUnavailableTitle = "Notification unavailable";
    private const string NotificationUnavailableDetail = "The requested notification is unavailable.";
    private const string InvalidNotificationRequestTitle = "Invalid notification request";
    private const string InvalidNotificationRequestDetail = "The submitted notification request is invalid.";
    private const string InvalidNotificationListBodyDetail = "This notification readout does not accept a request body.";
    private const string InvalidNotificationNoBodyDetail = "This notification action does not accept a request body.";
    private const string NotificationWriteFailedTitle = "Notification write failed";
    private const string NotificationWriteFailedDetail = "Unable to complete notification write.";
    private static readonly string[] SupportedListQueryFields = ["status", "limit", "before"];

    public static WebApplication MapInAppNotificationEndpoints(this WebApplication app)
    {
        var notifications = app.MapGroup("/api/v1/notifications")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        notifications.MapGet("", ListNotificationsAsync);
        notifications.MapGet("/summary", GetNotificationSummaryAsync);
        notifications.MapPost("/read", MarkAllReadableNotificationsReadAsync);
        notifications.MapPost("/{notificationId:guid}/read", MarkNotificationReadAsync);
        notifications.MapPost("/{notificationId:guid}/archive", ArchiveNotificationAsync);

        return app;
    }

    private static async Task<IResult> ListNotificationsAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var filterResult = ReadListFilter(request);
        if (!filterResult.Succeeded || filterResult.Filter is null)
        {
            return InvalidNotificationRequest(filterResult.Errors);
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var filter = filterResult.Filter;
        var query = VisibleNotifications(dbContext, actor.UserProfileId, trackChanges: false);
        query = filter.Status switch
        {
            null => query.Where(notification => notification.Status != InAppNotificationStatuses.Archived),
            InAppNotificationStatuses.Archived => query.Where(notification => notification.Status == InAppNotificationStatuses.Archived),
            _ => query.Where(notification => notification.Status == filter.Status
                && notification.ArchivedAtUtc == null)
        };

        if (filter.Before is not null)
        {
            query = query.Where(notification => notification.CreatedAtUtc < filter.Before.Value);
        }

        var notifications = await query
            .OrderByDescending(notification => notification.CreatedAtUtc)
            .ThenByDescending(notification => notification.Id)
            .Take(filter.Limit)
            .ToArrayAsync(cancellationToken);

        return Results.Ok(new InAppNotificationListResponse(
            notifications.Select(InAppNotificationResponse.From).ToArray()));
    }

    private static async Task<IResult> GetNotificationSummaryAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (TryRejectNoBodyReadEnvelope(request, out var invalidReadEnvelope))
        {
            return invalidReadEnvelope;
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var notifications = await VisibleNotifications(dbContext, actor.UserProfileId, trackChanges: false)
            .Where(notification => notification.ArchivedAtUtc == null
                && notification.Status == InAppNotificationStatuses.Unread)
            .Select(notification => new
            {
                notification.Priority
            })
            .ToArrayAsync(cancellationToken);

        return Results.Ok(new InAppNotificationSummaryResponse(
            notifications.Length,
            notifications.Count(notification => notification.Priority == InAppNotificationPriorities.Attention),
            notifications.Count(notification => notification.Priority == InAppNotificationPriorities.Urgent)));
    }

    private static async Task<IResult> MarkNotificationReadAsync(
        Guid notificationId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (RequestHasBody(request))
        {
            return InvalidNotificationNoBody();
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var notification = await VisibleNotifications(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == notificationId
                    && candidate.ArchivedAtUtc == null,
                cancellationToken);
        if (notification is null)
        {
            return NotificationUnavailable();
        }

        if (notification.Status == InAppNotificationStatuses.Unread)
        {
            var now = timeProvider.GetUtcNow();
            notification.Status = InAppNotificationStatuses.Read;
            notification.ReadAtUtc = now;
        }

        return await SaveAndReturnAsync(dbContext, notification, cancellationToken);
    }

    private static async Task<IResult> MarkAllReadableNotificationsReadAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (RequestHasBody(request))
        {
            return InvalidNotificationNoBody();
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var now = timeProvider.GetUtcNow();
        var notifications = await VisibleNotifications(dbContext, actor.UserProfileId, trackChanges: true)
            .Where(notification => notification.ArchivedAtUtc == null
                && notification.Status == InAppNotificationStatuses.Unread)
            .ToArrayAsync(cancellationToken);

        foreach (var notification in notifications)
        {
            notification.Status = InAppNotificationStatuses.Read;
            notification.ReadAtUtc = now;
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return NotificationWriteFailed();
        }

        return await GetNotificationSummaryAsync(request, currentActorAccessor, dbContext, cancellationToken);
    }

    private static async Task<IResult> ArchiveNotificationAsync(
        Guid notificationId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (RequestHasBody(request))
        {
            return InvalidNotificationNoBody();
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var notification = await VisibleNotifications(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(candidate => candidate.Id == notificationId, cancellationToken);
        if (notification is null)
        {
            return NotificationUnavailable();
        }

        if (notification.Status != InAppNotificationStatuses.Archived)
        {
            var now = timeProvider.GetUtcNow();
            notification.Status = InAppNotificationStatuses.Archived;
            notification.ArchivedAtUtc = now;
            notification.ReadAtUtc ??= now;
        }

        return await SaveAndReturnAsync(dbContext, notification, cancellationToken);
    }

    private static IQueryable<InAppNotification> VisibleNotifications(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId,
        bool trackChanges)
    {
        var query = dbContext.Set<InAppNotification>()
            .Where(notification => notification.RecipientUserProfileId == actorUserProfileId
                && notification.RecipientUserProfile.DeletedAtUtc == null
                && (notification.ActorUserProfileId == null
                    || notification.ActorUserProfile!.DeletedAtUtc == null));

        return trackChanges ? query : query.AsNoTracking();
    }

    private static async Task<IResult> SaveAndReturnAsync(
        SettleoraDbContext dbContext,
        InAppNotification notification,
        CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return NotificationWriteFailed();
        }

        return Results.Ok(InAppNotificationResponse.From(notification));
    }

    private static ListFilterReadResult ReadListFilter(HttpRequest request)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        AddUnsupportedQueryFieldErrors(request, SupportedListQueryFields, errors);

        if (RequestHasBody(request))
        {
            AddError(errors, "body", InvalidNotificationListBodyDetail);
        }

        var status = ReadOptionalQueryString(request, "status");
        if (status is not null && !InAppNotificationStatuses.IsSupported(status))
        {
            AddError(errors, "status", "Notification status is not supported.");
        }

        var limit = ReadOptionalQueryInt(request, "limit", errors) ?? DefaultLimit;
        if (limit is <= 0 or > MaxLimit)
        {
            AddError(errors, "limit", $"Limit must be between 1 and {MaxLimit}.");
        }

        var before = ReadOptionalQueryDateTimeOffset(request, "before", errors);

        return errors.Count == 0
            ? ListFilterReadResult.Valid(new NotificationListFilter(status, limit, before))
            : ListFilterReadResult.Invalid(ToErrorDictionary(errors));
    }

    private static string? ReadOptionalQueryString(HttpRequest request, string key)
    {
        return request.Query.TryGetValue(key, out var values) && values != StringValues.Empty
            ? values.ToString()
            : null;
    }

    private static void AddUnsupportedQueryFieldErrors(
        HttpRequest request,
        IReadOnlyCollection<string> supportedFields,
        Dictionary<string, List<string>> errors)
    {
        if (request.Query.Count == 0)
        {
            return;
        }

        foreach (var field in request.Query.Keys)
        {
            if (!supportedFields.Contains(field, StringComparer.Ordinal))
            {
                AddError(errors, "query", "Unsupported query fields are not allowed.");
                return;
            }
        }

        foreach (var supportedField in supportedFields)
        {
            if (request.Query.TryGetValue(supportedField, out var values)
                && values.Count > 1)
            {
                AddError(errors, supportedField, $"{supportedField} accepts only one value.");
            }
        }
    }

    private static bool TryRejectNoBodyReadEnvelope(HttpRequest request, out IResult result)
    {
        if (request.Query.Count > 0)
        {
            result = InvalidNotificationRequest(
                new Dictionary<string, string[]>(StringComparer.Ordinal)
                {
                    ["query"] = ["Unsupported query fields are not allowed."]
                });
            return true;
        }

        if (RequestHasBody(request))
        {
            result = InvalidNotificationRequest(
                new Dictionary<string, string[]>(StringComparer.Ordinal)
                {
                    ["body"] = [InvalidNotificationListBodyDetail]
                });
            return true;
        }

        result = null!;
        return false;
    }

    private static int? ReadOptionalQueryInt(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        var value = ReadOptionalQueryString(request, key);
        if (value is null)
        {
            return null;
        }

        if (!int.TryParse(value, out var parsed))
        {
            AddError(errors, key, $"{key} must be an integer.");
            return null;
        }

        return parsed;
    }

    private static DateTimeOffset? ReadOptionalQueryDateTimeOffset(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        var value = ReadOptionalQueryString(request, key);
        if (value is null)
        {
            return null;
        }

        if (!DateTimeOffset.TryParse(value, out var parsed))
        {
            AddError(errors, key, $"{key} must be an ISO 8601 date-time string.");
            return null;
        }

        return parsed.ToUniversalTime();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult NotificationUnavailable()
    {
        return Results.Problem(
            title: NotificationUnavailableTitle,
            detail: NotificationUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidNotificationRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidNotificationRequestTitle,
            detail: InvalidNotificationRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvalidNotificationNoBody()
    {
        return Results.ValidationProblem(
            new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["body"] = [InvalidNotificationNoBodyDetail]
            },
            title: InvalidNotificationRequestTitle,
            detail: InvalidNotificationNoBodyDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult NotificationWriteFailed()
    {
        return Results.Problem(
            title: NotificationWriteFailedTitle,
            detail: NotificationWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static bool RequestHasBody(HttpRequest request)
    {
        return request.ContentLength.GetValueOrDefault() > 0
            || request.Headers.TryGetValue("Transfer-Encoding", out var transferEncoding)
            && transferEncoding.Count > 0;
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

    private sealed record NotificationListFilter(
        string? Status,
        int Limit,
        DateTimeOffset? Before);

    private sealed class ListFilterReadResult
    {
        private ListFilterReadResult(
            NotificationListFilter? filter,
            IDictionary<string, string[]> errors)
        {
            Filter = filter;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public NotificationListFilter? Filter { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static ListFilterReadResult Valid(NotificationListFilter filter)
        {
            return new ListFilterReadResult(
                filter,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static ListFilterReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new ListFilterReadResult(null, errors);
        }
    }
}
