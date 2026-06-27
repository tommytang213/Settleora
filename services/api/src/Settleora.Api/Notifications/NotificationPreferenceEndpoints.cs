using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Notifications;

internal static class NotificationPreferenceEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string InvalidPreferenceRequestTitle = "Invalid notification preference request";
    private const string InvalidPreferenceRequestDetail = "The submitted notification preference request is invalid.";
    private const string InvalidPreferenceReadoutBodyDetail = "This notification preference readout does not accept a request body.";
    private const string PreferenceWriteFailedTitle = "Notification preference write failed";
    private const string PreferenceWriteFailedDetail = "Unable to persist notification preferences.";

    public static WebApplication MapNotificationPreferenceEndpoints(this WebApplication app)
    {
        var notifications = app.MapGroup("/api/v1/notifications")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        notifications.MapGet("/preferences", GetPreferencesAsync);
        notifications.MapPut("/preferences", PutPreferencesAsync);

        return app;
    }

    private static async Task<IResult> GetPreferencesAsync(
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

        var preference = await VisiblePreference(dbContext, actor.UserProfileId, trackChanges: false)
            .SingleOrDefaultAsync(cancellationToken);

        return Results.Ok(NotificationPreferenceResponse.From(preference));
    }

    private static async Task<IResult> PutPreferencesAsync(
        NotificationPreferenceUpdateRequest? updateRequest,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (request.Query.Count > 0)
        {
            return InvalidPreferenceRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["query"] = ["Unsupported query fields are not allowed."]
            });
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var validation = Validate(updateRequest);
        if (validation.Count > 0)
        {
            return InvalidPreferenceRequest(validation);
        }

        var now = timeProvider.GetUtcNow();
        var preference = await VisiblePreference(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(cancellationToken);

        if (preference is null)
        {
            preference = new UserNotificationPreference
            {
                UserProfileId = actor.UserProfileId,
                CreatedAtUtc = now
            };
            dbContext.Set<UserNotificationPreference>().Add(preference);
        }

        Apply(preference, updateRequest!, now);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return Results.Problem(
                title: PreferenceWriteFailedTitle,
                detail: PreferenceWriteFailedDetail,
                statusCode: StatusCodes.Status500InternalServerError);
        }

        return Results.Ok(NotificationPreferenceResponse.From(preference));
    }

    private static IQueryable<UserNotificationPreference> VisiblePreference(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId,
        bool trackChanges)
    {
        var query = dbContext.Set<UserNotificationPreference>()
            .Where(preference => preference.UserProfileId == actorUserProfileId
                && preference.UserProfile.DeletedAtUtc == null);

        return trackChanges ? query : query.AsNoTracking();
    }

    private static void Apply(
        UserNotificationPreference preference,
        NotificationPreferenceUpdateRequest request,
        DateTimeOffset updatedAtUtc)
    {
        preference.InAppEnabled = request.InAppEnabled!.Value;
        preference.BillsEnabled = request.Categories!.Bills ?? true;
        preference.SettlementsEnabled = request.Categories.Settlements ?? true;
        preference.RecurringEnabled = request.Categories.Recurring ?? true;
        preference.SyncSecurityEnabled = true;
        preference.QuietHoursEnabled = request.QuietHours!.Enabled!.Value;
        preference.QuietHoursStartHour = request.QuietHours.StartHour!.Value;
        preference.QuietHoursEndHour = request.QuietHours.EndHour!.Value;
        preference.DeliveryTiming = request.DeliveryTiming!;
        preference.UpdatedAtUtc = updatedAtUtc;
    }

    private static IDictionary<string, string[]> Validate(NotificationPreferenceUpdateRequest? request)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (request is null)
        {
            AddError(errors, "body", "A notification preference request body is required.");
            return ToErrorDictionary(errors);
        }

        if (request.InAppEnabled is null)
        {
            AddError(errors, "inAppEnabled", "inAppEnabled is required.");
        }

        if (request.Categories is null)
        {
            AddError(errors, "categories", "categories is required.");
        }
        else if (request.Categories.SyncSecurity is false)
        {
            AddError(errors, "categories.syncSecurity", "Sync and security notifications are required and cannot be disabled.");
        }

        if (request.QuietHours is null)
        {
            AddError(errors, "quietHours", "quietHours is required.");
        }
        else
        {
            if (request.QuietHours.Enabled is null)
            {
                AddError(errors, "quietHours.enabled", "quietHours.enabled is required.");
            }

            ValidateHour(request.QuietHours.StartHour, "quietHours.startHour", errors);
            ValidateHour(request.QuietHours.EndHour, "quietHours.endHour", errors);
        }

        if (!NotificationPreferenceDeliveryTimings.IsSupported(request.DeliveryTiming))
        {
            AddError(errors, "deliveryTiming", "deliveryTiming must be immediate or digest_readout.");
        }

        return ToErrorDictionary(errors);
    }

    private static void ValidateHour(
        int? value,
        string field,
        Dictionary<string, List<string>> errors)
    {
        if (value is null)
        {
            AddError(errors, field, $"{field} is required.");
            return;
        }

        if (value is < 0 or > 23)
        {
            AddError(errors, field, $"{field} must be between 0 and 23.");
        }
    }

    private static bool TryRejectNoBodyReadEnvelope(HttpRequest request, out IResult result)
    {
        if (request.Query.Count > 0)
        {
            result = InvalidPreferenceRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["query"] = ["Unsupported query fields are not allowed."]
            });
            return true;
        }

        if (RequestHasBody(request))
        {
            result = InvalidPreferenceRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["body"] = [InvalidPreferenceReadoutBodyDetail]
            });
            return true;
        }

        result = null!;
        return false;
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult InvalidPreferenceRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidPreferenceRequestTitle,
            detail: InvalidPreferenceRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
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
}
