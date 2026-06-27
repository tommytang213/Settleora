using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.RecurringBills;
using Settleora.Api.Domain.Users;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.RecurringBills;

internal static class RecurringBillEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string RecurringBillUnavailableTitle = "Recurring bill unavailable";
    private const string RecurringBillUnavailableDetail = "The requested recurring bill is unavailable.";
    private const string InvalidRecurringBillRequestTitle = "Invalid recurring bill request";
    private const string InvalidRecurringBillRequestDetail = "The submitted recurring bill request is invalid.";
    private const string RecurringBillConflictTitle = "Recurring bill conflict";
    private const string RecurringBillConflictDetail = "The requested recurring bill action conflicts with current state.";
    private const string RecurringBillWriteFailedTitle = "Recurring bill write failed";
    private const string RecurringBillWriteFailedDetail = "Unable to complete recurring bill write.";
    private const string RecurringBillReadFailedTitle = "Recurring bill read failed";
    private const string RecurringBillReadFailedDetail = "Unable to read recurring bill data.";
    private const string TemplateCreatedAction = "recurring_bill.template_created";
    private const string TemplateUpdatedAction = "recurring_bill.template_updated";
    private const string TemplatePausedAction = "recurring_bill.template_paused";
    private const string TemplateResumedAction = "recurring_bill.template_resumed";
    private const string TemplateArchivedAction = "recurring_bill.template_archived";
    private const string DraftGeneratedAction = "recurring_bill.draft_generated";
    private const string DueSoonSummaryTemplate = "Recurring bill due on {0}.";
    private const string PersonalGroupMode = "personal";
    private const string GroupMode = "group";

    public static WebApplication MapRecurringBillEndpoints(this WebApplication app)
    {
        var recurringBills = app.MapGroup("/api/v1/recurring-bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        recurringBills.MapPost("", CreateTemplateAsync);
        recurringBills.MapGet("", ListTemplatesAsync);
        recurringBills.MapGet("/forecast", ListForecastAsync);
        recurringBills.MapGet("/{templateId:guid}", GetTemplateAsync);
        recurringBills.MapPatch("/{templateId:guid}", UpdateTemplateAsync);
        recurringBills.MapPost("/{templateId:guid}/pause", PauseTemplateAsync);
        recurringBills.MapPost("/{templateId:guid}/resume", ResumeTemplateAsync);
        recurringBills.MapPost("/{templateId:guid}/archive", ArchiveTemplateAsync);
        recurringBills.MapPost("/{templateId:guid}/occurrences/{occurrenceDate}/generate-draft", GenerateDraftAsync);

        return app;
    }

    private static async Task<IResult> CreateTemplateAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IRecurringBillAuditWriter auditWriter,
        RecurringBillScheduleService scheduleService,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await ReadCreateRequestAsync(request, scheduleService, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidRecurringBillRequest(readResult.Errors);
        }

        var writeRequest = readResult.Request;
        var authorizationResult = writeRequest.GroupId is null
            ? await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken)
            : await businessAuthorizationService.CanAccessGroupAsync(writeRequest.GroupId.Value, cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var activeMemberIds = writeRequest.GroupId is null
            ? null
            : await LoadActiveGroupMemberIdsAsync(dbContext, writeRequest.GroupId.Value, cancellationToken);
        if (!PayloadReferencesVisibleProfiles(
            writeRequest.Payload,
            actor.UserProfileId,
            actor.UserProfileId,
            writeRequest.GroupId,
            activeMemberIds))
        {
            return RecurringBillUnavailable();
        }

        var previewResult = CalculatePayloadPreview(
            writeRequest.GroupId,
            actor.UserProfileId,
            actor.UserProfileId,
            writeRequest.MerchantName,
            writeRequest.Schedule.StartDate,
            writeRequest.Payload,
            calculationService,
            timeProvider.GetUtcNow());
        if (!previewResult.Succeeded)
        {
            return InvalidRecurringBillRequest(previewResult.Failure!);
        }

        var now = timeProvider.GetUtcNow();
        var nextOccurrenceDate = scheduleService.GetNextOccurrenceOnOrAfter(
            writeRequest.Schedule,
            writeRequest.Schedule.StartDate);
        var template = new RecurringBillTemplate
        {
            Id = Guid.NewGuid(),
            OwnerUserProfileId = actor.UserProfileId,
            CreatedByUserProfileId = actor.UserProfileId,
            GroupId = writeRequest.GroupId,
            MerchantName = writeRequest.MerchantName,
            Description = writeRequest.Description,
            ScheduleType = writeRequest.Schedule.ScheduleType,
            IntervalCount = writeRequest.Schedule.IntervalCount,
            IntervalDays = writeRequest.Schedule.IntervalDays,
            StartDate = writeRequest.Schedule.StartDate,
            EndDate = writeRequest.Schedule.EndDate,
            DueOffsetDays = writeRequest.Schedule.DueOffsetDays,
            NextOccurrenceDate = nextOccurrenceDate,
            Status = RecurringBillTemplateStatuses.Active,
            PayloadVersion = 1,
            PayloadJson = RecurringBillTemplatePayloadCodec.Serialize(writeRequest.Payload),
            ForecastAmount = previewResult.BillTotal!.Amount,
            ForecastCurrency = previewResult.BillTotal.Currency,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.Set<RecurringBillTemplate>().Add(template);
        await auditWriter.WriteAsync(
            CreateAuditEvent(TemplateCreatedAction, actor, template, occurrenceDate: null, generatedBillId: null, now),
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return RecurringBillWriteFailed();
        }

        return Results.Created($"/api/v1/recurring-bills/{template.Id:D}", MapTemplateResponse(template));
    }

    private static async Task<IResult> ListTemplatesAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var filterResult = ReadListFilter(request);
        if (!filterResult.Succeeded || filterResult.Filter is null)
        {
            return InvalidRecurringBillRequest(filterResult.Errors);
        }

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

        var templates = await VisibleTemplates(dbContext, actor.UserProfileId, trackChanges: false)
            .Where(template => filterResult.Filter.Status == null || template.Status == filterResult.Filter.Status)
            .Where(template => filterResult.Filter.GroupId == null || template.GroupId == filterResult.Filter.GroupId)
            .Where(template => filterResult.Filter.FromDate == null || template.EndDate == null || template.EndDate >= filterResult.Filter.FromDate)
            .Where(template => filterResult.Filter.ToDate == null || template.StartDate <= filterResult.Filter.ToDate)
            .OrderBy(template => template.NextOccurrenceDate ?? template.StartDate)
            .ThenBy(template => template.CreatedAtUtc)
            .ThenBy(template => template.Id)
            .ToListAsync(cancellationToken);

        return Results.Ok(new RecurringBillTemplateListResponse(
            templates.Select(MapTemplateResponse).ToArray()));
    }

    private static async Task<IResult> GetTemplateAsync(
        Guid templateId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var readEnvelopeResult = ReadTemplateReadEnvelope(request);
        if (!readEnvelopeResult.Succeeded)
        {
            return InvalidRecurringBillRequest(readEnvelopeResult.Errors);
        }

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

        var template = await VisibleTemplates(dbContext, actor.UserProfileId, trackChanges: false)
            .SingleOrDefaultAsync(candidate => candidate.Id == templateId, cancellationToken);
        return template is null
            ? RecurringBillUnavailable()
            : Results.Ok(MapTemplateResponse(template));
    }

    private static async Task<IResult> UpdateTemplateAsync(
        Guid templateId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IRecurringBillAuditWriter auditWriter,
        RecurringBillScheduleService scheduleService,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var patchResult = await ReadPatchRequestAsync(request, scheduleService, cancellationToken);
        if (!patchResult.Succeeded || patchResult.Request is null)
        {
            return InvalidRecurringBillRequest(patchResult.Errors);
        }

        var template = await VisibleTemplates(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(candidate => candidate.Id == templateId, cancellationToken);
        if (template is null)
        {
            return RecurringBillUnavailable();
        }

        if (template.Status == RecurringBillTemplateStatuses.Archived)
        {
            return RecurringBillConflict();
        }

        var authorizationResult = template.GroupId is null
            ? await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken)
            : await businessAuthorizationService.CanAccessGroupAsync(template.GroupId.Value, cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var existingPayload = RecurringBillTemplatePayloadCodec.Deserialize(template.PayloadJson);
        if (existingPayload is null)
        {
            return RecurringBillReadFailed();
        }

        var patchRequest = patchResult.Request;
        RecurringBillTemplatePayload? patchPayload = null;
        if (patchRequest.BillPayloadElement is not null)
        {
            var payloadReadResult = RecurringBillTemplatePayloadReader.Read(
                patchRequest.BillPayloadElement.Value,
                template.GroupId is not null,
                new Dictionary<string, List<string>>(StringComparer.Ordinal));
            if (!payloadReadResult.Succeeded || payloadReadResult.Payload is null)
            {
                return InvalidRecurringBillRequest(payloadReadResult.Errors);
            }

            patchPayload = payloadReadResult.Payload;
        }

        var nextSchedule = patchRequest.Schedule ?? CreateSchedule(template);
        var nextPayload = patchPayload ?? existingPayload;
        var activeMemberIds = template.GroupId is null
            ? null
            : await LoadActiveGroupMemberIdsAsync(dbContext, template.GroupId.Value, cancellationToken);
        if (!PayloadReferencesVisibleProfiles(
            nextPayload,
            template.OwnerUserProfileId,
            actor.UserProfileId,
            template.GroupId,
            activeMemberIds))
        {
            return RecurringBillUnavailable();
        }

        var nextMerchantName = patchRequest.MerchantNameSpecified
            ? patchRequest.MerchantName
            : template.MerchantName;
        var previewResult = CalculatePayloadPreview(
            template.GroupId,
            template.OwnerUserProfileId,
            actor.UserProfileId,
            nextMerchantName,
            nextSchedule.StartDate,
            nextPayload,
            calculationService,
            timeProvider.GetUtcNow());
        if (!previewResult.Succeeded)
        {
            return InvalidRecurringBillRequest(previewResult.Failure!);
        }

        var now = timeProvider.GetUtcNow();
        if (patchRequest.MerchantNameSpecified)
        {
            template.MerchantName = patchRequest.MerchantName;
        }

        if (patchRequest.DescriptionSpecified)
        {
            template.Description = patchRequest.Description;
        }

        template.ScheduleType = nextSchedule.ScheduleType;
        template.IntervalCount = nextSchedule.IntervalCount;
        template.IntervalDays = nextSchedule.IntervalDays;
        template.StartDate = nextSchedule.StartDate;
        template.EndDate = nextSchedule.EndDate;
        template.DueOffsetDays = nextSchedule.DueOffsetDays;
        template.NextOccurrenceDate = scheduleService.GetNextOccurrenceOnOrAfter(
            nextSchedule,
            DateOnly.FromDateTime(now.UtcDateTime));
        template.PayloadJson = RecurringBillTemplatePayloadCodec.Serialize(nextPayload);
        template.ForecastAmount = previewResult.BillTotal!.Amount;
        template.ForecastCurrency = previewResult.BillTotal.Currency;
        template.UpdatedAtUtc = now;

        await auditWriter.WriteAsync(
            CreateAuditEvent(TemplateUpdatedAction, actor, template, occurrenceDate: null, generatedBillId: null, now),
            cancellationToken);

        return await SaveAndReturnTemplateAsync(dbContext, template, cancellationToken);
    }

    private static async Task<IResult> PauseTemplateAsync(
        Guid templateId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IRecurringBillAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return await ChangeTemplateStatusAsync(
            templateId,
            request,
            RecurringBillTemplateStatuses.Paused,
            TemplatePausedAction,
            currentActorAccessor,
            auditWriter,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static async Task<IResult> ResumeTemplateAsync(
        Guid templateId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IRecurringBillAuditWriter auditWriter,
        RecurringBillScheduleService scheduleService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (RequestHasBody(request))
        {
            return InvalidRecurringBillNoBody();
        }

        var template = await VisibleTemplates(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(candidate => candidate.Id == templateId, cancellationToken);
        if (template is null)
        {
            return RecurringBillUnavailable();
        }

        if (template.Status == RecurringBillTemplateStatuses.Archived)
        {
            return RecurringBillConflict();
        }

        var now = timeProvider.GetUtcNow();
        template.Status = RecurringBillTemplateStatuses.Active;
        template.NextOccurrenceDate = scheduleService.GetNextOccurrenceOnOrAfter(
            CreateSchedule(template),
            DateOnly.FromDateTime(now.UtcDateTime));
        template.UpdatedAtUtc = now;
        await auditWriter.WriteAsync(
            CreateAuditEvent(TemplateResumedAction, actor, template, occurrenceDate: null, generatedBillId: null, now),
            cancellationToken);

        return await SaveAndReturnTemplateAsync(dbContext, template, cancellationToken);
    }

    private static async Task<IResult> ArchiveTemplateAsync(
        Guid templateId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IRecurringBillAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (RequestHasBody(request))
        {
            return InvalidRecurringBillNoBody();
        }

        var template = await VisibleTemplates(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(candidate => candidate.Id == templateId, cancellationToken);
        if (template is null)
        {
            return RecurringBillUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        template.Status = RecurringBillTemplateStatuses.Archived;
        template.ArchivedAtUtc ??= now;
        template.NextOccurrenceDate = null;
        template.UpdatedAtUtc = now;
        await auditWriter.WriteAsync(
            CreateAuditEvent(TemplateArchivedAction, actor, template, occurrenceDate: null, generatedBillId: null, now),
            cancellationToken);

        return await SaveAndReturnTemplateAsync(dbContext, template, cancellationToken);
    }

    private static async Task<IResult> ListForecastAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IInAppNotificationWriter notificationWriter,
        RecurringBillScheduleService scheduleService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var forecastFilterResult = ReadForecastFilter(request, timeProvider);
        if (!forecastFilterResult.Succeeded || forecastFilterResult.Filter is null)
        {
            return InvalidRecurringBillRequest(forecastFilterResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var filter = forecastFilterResult.Filter;
        var templates = await VisibleTemplates(dbContext, actor.UserProfileId, trackChanges: false)
            .Include(template => template.Occurrences)
            .Where(template => template.Status == RecurringBillTemplateStatuses.Active)
            .Where(template => filter.GroupId == null || template.GroupId == filter.GroupId)
            .OrderBy(template => template.NextOccurrenceDate ?? template.StartDate)
            .ThenBy(template => template.Id)
            .ToListAsync(cancellationToken);

        var occurrences = new List<RecurringBillForecastOccurrenceResponse>();
        foreach (var template in templates)
        {
            var schedule = CreateSchedule(template);
            foreach (var scheduledOccurrence in scheduleService.GenerateOccurrences(
                schedule,
                filter.FromDate,
                filter.ToDate,
                filter.Limit))
            {
                var persistedOccurrence = template.Occurrences
                    .SingleOrDefault(occurrence => occurrence.OccurrenceDate == scheduledOccurrence.OccurrenceDate);
                occurrences.Add(new RecurringBillForecastOccurrenceResponse(
                    template.Id,
                    persistedOccurrence?.Id,
                    template.GroupId,
                    scheduledOccurrence.OccurrenceDate,
                    persistedOccurrence?.DueDate ?? scheduledOccurrence.DueDate,
                    persistedOccurrence?.Status ?? RecurringBillOccurrenceStatuses.Forecasted,
                    persistedOccurrence?.Status == RecurringBillOccurrenceStatuses.DraftGenerated,
                    persistedOccurrence?.GeneratedExpenseBillId,
                    FormatAmount(template.ForecastAmount),
                    template.ForecastCurrency,
                    template.MerchantName));
            }
        }

        var responseOccurrences = occurrences
            .OrderBy(occurrence => occurrence.OccurrenceDate)
            .ThenBy(occurrence => occurrence.TemplateId)
            .Take(filter.Limit)
            .ToArray();

        var dueSoonWriteSucceeded = await WriteDueSoonNotificationsAsync(
            notificationWriter,
            dbContext,
            templates,
            responseOccurrences,
            actor.UserProfileId,
            timeProvider.GetUtcNow(),
            cancellationToken);
        if (!dueSoonWriteSucceeded)
        {
            return RecurringBillWriteFailed();
        }

        return Results.Ok(new RecurringBillForecastListResponse(responseOccurrences));
    }

    private static async Task<IResult> GenerateDraftAsync(
        Guid templateId,
        string occurrenceDate,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IRecurringBillAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
        RecurringBillScheduleService scheduleService,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (RequestHasBody(request))
        {
            return InvalidRecurringBillNoBody();
        }

        if (!DateOnly.TryParseExact(
            occurrenceDate,
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var parsedOccurrenceDate))
        {
            return InvalidRecurringBillRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["occurrenceDate"] = ["Occurrence date must be a yyyy-MM-dd date string."]
            });
        }

        var template = await VisibleTemplates(dbContext, actor.UserProfileId, trackChanges: true)
            .Include(candidate => candidate.Occurrences)
            .SingleOrDefaultAsync(candidate => candidate.Id == templateId, cancellationToken);
        if (template is null)
        {
            return RecurringBillUnavailable();
        }

        if (template.Status is RecurringBillTemplateStatuses.Paused or RecurringBillTemplateStatuses.Archived)
        {
            return RecurringBillConflict();
        }

        var schedule = CreateSchedule(template);
        if (!scheduleService.ContainsOccurrence(schedule, parsedOccurrenceDate))
        {
            return InvalidRecurringBillRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["occurrenceDate"] = ["Occurrence date is not generated by this recurring bill schedule."]
            });
        }

        var existingOccurrence = template.Occurrences
            .SingleOrDefault(occurrence => occurrence.OccurrenceDate == parsedOccurrenceDate);
        if (existingOccurrence is not null
            && existingOccurrence.Status == RecurringBillOccurrenceStatuses.DraftGenerated
            && existingOccurrence.GeneratedExpenseBillId is not null)
        {
            var existingBill = await dbContext.Set<ExpenseBill>()
                .AsNoTracking()
                .SingleOrDefaultAsync(
                    bill => bill.Id == existingOccurrence.GeneratedExpenseBillId.Value,
                    cancellationToken);
            return existingBill is null
                ? RecurringBillConflict()
                : Results.Ok(MapGenerateDraftResponse(template, existingOccurrence, existingBill));
        }

        if (existingOccurrence is not null
            && existingOccurrence.Status is RecurringBillOccurrenceStatuses.Skipped or RecurringBillOccurrenceStatuses.Cancelled)
        {
            return RecurringBillConflict();
        }

        var payload = RecurringBillTemplatePayloadCodec.Deserialize(template.PayloadJson);
        if (payload is null)
        {
            return RecurringBillReadFailed();
        }

        var activeMemberIds = template.GroupId is null
            ? null
            : await LoadActiveGroupMemberIdsAsync(dbContext, template.GroupId.Value, cancellationToken);
        if (!PayloadReferencesVisibleProfiles(
            payload,
            template.OwnerUserProfileId,
            actor.UserProfileId,
            template.GroupId,
            activeMemberIds))
        {
            return RecurringBillUnavailable();
        }

        var scheduled = scheduleService.GenerateOccurrences(
                schedule,
                parsedOccurrenceDate,
                parsedOccurrenceDate,
                limit: 1)
            .Single();
        var now = timeProvider.GetUtcNow();
        var bill = RecurringBillDraftBuilder.CreateDraftBill(
            template.GroupId,
            template.OwnerUserProfileId,
            actor.UserProfileId,
            template.MerchantName,
            parsedOccurrenceDate,
            payload,
            now);

        var initialCalculation = calculationService.Calculate(bill);
        if (!initialCalculation.Succeeded)
        {
            return InvalidRecurringBillRequest(initialCalculation.Failure!);
        }

        RecurringBillDraftBuilder.ApplyCalculation(bill, initialCalculation);
        RecurringBillDraftBuilder.AddPayers(
            bill,
            template.GroupId is null ? template.OwnerUserProfileId : actor.UserProfileId,
            actor.UserProfileId,
            payload,
            initialCalculation.BillTotal!.Amount,
            initialCalculation.BillTotal.Currency.Value,
            now);

        var finalCalculation = calculationService.Calculate(bill);
        if (!finalCalculation.Succeeded)
        {
            return InvalidRecurringBillRequest(finalCalculation.Failure!);
        }

        RecurringBillDraftBuilder.ApplyCalculation(bill, finalCalculation);

        var occurrence = existingOccurrence ?? new RecurringBillOccurrence
        {
            Id = Guid.NewGuid(),
            RecurringBillTemplateId = template.Id,
            OccurrenceDate = parsedOccurrenceDate,
            CreatedAtUtc = now
        };
        occurrence.DueDate = scheduled.DueDate;
        occurrence.Status = RecurringBillOccurrenceStatuses.DraftGenerated;
        occurrence.GeneratedExpenseBillId = bill.Id;
        occurrence.GeneratedByUserProfileId = actor.UserProfileId;
        occurrence.GeneratedAtUtc = now;
        occurrence.UpdatedAtUtc = now;

        if (existingOccurrence is null)
        {
            dbContext.Set<RecurringBillOccurrence>().Add(occurrence);
        }

        template.NextOccurrenceDate = scheduleService.GetNextOccurrenceOnOrAfter(
            schedule,
            parsedOccurrenceDate.AddDays(1));
        template.UpdatedAtUtc = now;
        dbContext.Set<ExpenseBill>().Add(bill);
        await auditWriter.WriteAsync(
            CreateAuditEvent(
                DraftGeneratedAction,
                actor,
                template,
                parsedOccurrenceDate,
                bill.Id,
                now),
            cancellationToken);
        await InAppNotificationEvents.WriteRecurringDraftGeneratedNotificationAsync(
            notificationWriter,
            template,
            occurrence,
            bill,
            actor.UserProfileId,
            now,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return RecurringBillWriteFailed();
        }

        return Results.Created(
            $"/api/v1/bills/{bill.Id:D}",
            MapGenerateDraftResponse(template, occurrence, bill));
    }

    private static async Task<IResult> ChangeTemplateStatusAsync(
        Guid templateId,
        HttpRequest request,
        string nextStatus,
        string auditAction,
        ICurrentActorAccessor currentActorAccessor,
        IRecurringBillAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (RequestHasBody(request))
        {
            return InvalidRecurringBillNoBody();
        }

        var template = await VisibleTemplates(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(candidate => candidate.Id == templateId, cancellationToken);
        if (template is null)
        {
            return RecurringBillUnavailable();
        }

        if (template.Status == RecurringBillTemplateStatuses.Archived)
        {
            return RecurringBillConflict();
        }

        var now = timeProvider.GetUtcNow();
        template.Status = nextStatus;
        template.UpdatedAtUtc = now;
        await auditWriter.WriteAsync(
            CreateAuditEvent(auditAction, actor, template, occurrenceDate: null, generatedBillId: null, now),
            cancellationToken);

        return await SaveAndReturnTemplateAsync(dbContext, template, cancellationToken);
    }

    private static async Task<IResult> SaveAndReturnTemplateAsync(
        SettleoraDbContext dbContext,
        RecurringBillTemplate template,
        CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return RecurringBillWriteFailed();
        }

        return Results.Ok(MapTemplateResponse(template));
    }

    private static async Task<bool> WriteDueSoonNotificationsAsync(
        IInAppNotificationWriter notificationWriter,
        SettleoraDbContext dbContext,
        IReadOnlyCollection<RecurringBillTemplate> templates,
        IReadOnlyCollection<RecurringBillForecastOccurrenceResponse> occurrences,
        Guid actorUserProfileId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (occurrences.Count == 0)
        {
            return true;
        }

        var templatesById = templates.ToDictionary(template => template.Id);
        var createdAny = false;
        foreach (var occurrence in occurrences)
        {
            if (occurrence.Status != RecurringBillOccurrenceStatuses.Forecasted
                || occurrence.DraftGenerated
                || !templatesById.TryGetValue(occurrence.TemplateId, out var template))
            {
                continue;
            }

            var safeSummary = DueSoonSummary(occurrence.DueDate ?? occurrence.OccurrenceDate);
            var actionUrl = $"/api/v1/recurring-bills/{template.Id:D}";
            var duplicateExists = await dbContext.Set<InAppNotification>()
                .AsNoTracking()
                .AnyAsync(notification => notification.RecipientUserProfileId == actorUserProfileId
                    && notification.ActorUserProfileId == actorUserProfileId
                    && notification.EventType == InAppNotificationEventTypes.RecurringBillDueSoon
                    && notification.SubjectType == InAppNotificationSubjectTypes.RecurringBillOccurrence
                    && notification.GroupId == template.GroupId
                    && notification.RecurringBillTemplateId == template.Id
                    && notification.SafeSummary == safeSummary
                    && notification.ActionUrl == actionUrl,
                    cancellationToken);
            if (duplicateExists)
            {
                continue;
            }

            var result = await notificationWriter.WriteAsync(
                new InAppNotificationWriteRequest(
                    actorUserProfileId,
                    actorUserProfileId,
                    InAppNotificationEventTypes.RecurringBillDueSoon,
                    InAppNotificationPriorities.Attention,
                    InAppNotificationSubjectTypes.RecurringBillOccurrence,
                    TitleKey(InAppNotificationEventTypes.RecurringBillDueSoon),
                    MessageKey(InAppNotificationEventTypes.RecurringBillDueSoon),
                    now,
                    SafeSummary: safeSummary,
                    ActionUrl: actionUrl,
                    GroupId: template.GroupId,
                    RecurringBillTemplateId: template.Id,
                    AllowSelfNotification: true),
                cancellationToken);
            createdAny |= result.Succeeded;
        }

        if (!createdAny)
        {
            return true;
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return false;
        }
    }

    private static IQueryable<RecurringBillTemplate> VisibleTemplates(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId,
        bool trackChanges)
    {
        var query = dbContext.Set<RecurringBillTemplate>()
            .Where(template => template.OwnerUserProfile.DeletedAtUtc == null
                && ((template.GroupId == null && template.OwnerUserProfileId == actorUserProfileId)
                    || (template.GroupId != null
                        && template.Group != null
                        && template.Group.DeletedAtUtc == null
                        && template.Group.Memberships.Any(membership => membership.UserProfileId == actorUserProfileId
                            && membership.Status == GroupMembershipStatuses.Active
                            && membership.UserProfile.DeletedAtUtc == null))));

        return trackChanges ? query : query.AsNoTracking();
    }

    private static async Task<HashSet<Guid>> LoadActiveGroupMemberIdsAsync(
        SettleoraDbContext dbContext,
        Guid groupId,
        CancellationToken cancellationToken)
    {
        return await dbContext.Set<GroupMembership>()
            .AsNoTracking()
            .Where(membership => membership.GroupId == groupId
                && membership.Status == GroupMembershipStatuses.Active
                && membership.Group.DeletedAtUtc == null
                && membership.UserProfile.DeletedAtUtc == null)
            .Select(membership => membership.UserProfileId)
            .ToHashSetAsync(cancellationToken);
    }

    private static bool PayloadReferencesVisibleProfiles(
        RecurringBillTemplatePayload payload,
        Guid ownerUserProfileId,
        Guid actorUserProfileId,
        Guid? groupId,
        IReadOnlySet<Guid>? activeMemberIds)
    {
        var referencedProfileIds = RecurringBillDraftBuilder.ReferencedProfileIds(
            payload,
            ownerUserProfileId,
            actorUserProfileId,
            groupId is not null);

        if (groupId is null)
        {
            return referencedProfileIds.All(profileId => profileId == ownerUserProfileId);
        }

        return activeMemberIds is not null
            && activeMemberIds.Contains(actorUserProfileId)
            && referencedProfileIds.All(activeMemberIds.Contains);
    }

    private static BillPreviewResult CalculatePayloadPreview(
        Guid? groupId,
        Guid ownerUserProfileId,
        Guid actorUserProfileId,
        string? merchantName,
        DateOnly billDate,
        RecurringBillTemplatePayload payload,
        ExpenseBillCalculationService calculationService,
        DateTimeOffset now)
    {
        var bill = RecurringBillDraftBuilder.CreateDraftBill(
            groupId,
            ownerUserProfileId,
            actorUserProfileId,
            merchantName,
            billDate,
            payload,
            now);
        var initialCalculation = calculationService.Calculate(bill);
        if (!initialCalculation.Succeeded)
        {
            return BillPreviewResult.Failed(initialCalculation.Failure!);
        }

        RecurringBillDraftBuilder.ApplyCalculation(bill, initialCalculation);
        RecurringBillDraftBuilder.AddPayers(
            bill,
            groupId is null ? ownerUserProfileId : actorUserProfileId,
            actorUserProfileId,
            payload,
            initialCalculation.BillTotal!.Amount,
            initialCalculation.BillTotal.Currency.Value,
            now);
        var finalCalculation = calculationService.Calculate(bill);
        return finalCalculation.Succeeded
            ? BillPreviewResult.Success(new BillPreviewTotal(
                finalCalculation.BillTotal!.Amount,
                finalCalculation.BillTotal.Currency.Value))
            : BillPreviewResult.Failed(finalCalculation.Failure!);
    }

    private static RecurringBillTemplateResponse MapTemplateResponse(RecurringBillTemplate template)
    {
        return new RecurringBillTemplateResponse(
            template.Id,
            template.OwnerUserProfileId,
            template.GroupId,
            template.MerchantName,
            template.Description,
            template.Status,
            new RecurringBillScheduleResponse(
                template.ScheduleType,
                template.IntervalCount,
                template.IntervalDays,
                template.StartDate,
                template.EndDate,
                template.DueOffsetDays),
            FormatAmount(template.ForecastAmount),
            template.ForecastCurrency,
            MapPayloadResponse(template.PayloadJson),
            template.NextOccurrenceDate,
            template.PayloadVersion,
            template.CreatedAtUtc,
            template.UpdatedAtUtc,
            template.ArchivedAtUtc);
    }

    private static RecurringBillTemplatePayloadResponse? MapPayloadResponse(string payloadJson)
    {
        var payload = RecurringBillTemplatePayloadCodec.Deserialize(payloadJson);
        return payload is null ? null : MapPayloadResponse(payload);
    }

    private static RecurringBillTemplatePayloadResponse MapPayloadResponse(RecurringBillTemplatePayload payload)
    {
        return new RecurringBillTemplatePayloadResponse(
            payload.Currency,
            payload.Items
                .Select(item => new RecurringBillTemplatePayloadItemResponse(
                    item.Name,
                    item.Note,
                    FormatAmount(item.Amount),
                    item.Currency,
                    item.Splits
                        .Select(split => new RecurringBillTemplatePayloadItemSplitResponse(
                            split.UserProfileId,
                            split.SplitMethod,
                            split.BasisValue is null ? null : FormatAmount(split.BasisValue.Value),
                            split.AllocationOrder))
                        .ToArray()))
                .ToArray(),
            payload.Adjustments
                .Select(adjustment => new RecurringBillTemplatePayloadAdjustmentResponse(
                    adjustment.Type,
                    adjustment.Direction,
                    adjustment.AllocationMethod,
                    FormatAmount(adjustment.Amount),
                    adjustment.Currency,
                    adjustment.ReasonNote))
                .ToArray(),
            payload.Payers
                .Select(payer => new RecurringBillTemplatePayloadPayerResponse(
                    payer.UserProfileId,
                    FormatAmount(payer.Amount),
                    payer.Currency,
                    payer.PaymentMethodLabelSnapshot))
                .ToArray());
    }

    private static RecurringBillGenerateDraftResponse MapGenerateDraftResponse(
        RecurringBillTemplate template,
        RecurringBillOccurrence occurrence,
        ExpenseBill bill)
    {
        return new RecurringBillGenerateDraftResponse(
            template.Id,
            occurrence.Id,
            occurrence.OccurrenceDate,
            occurrence.DueDate,
            occurrence.Status,
            bill.Id,
            bill.Status,
            FormatAmount(bill.TotalAmount),
            bill.TotalCurrency);
    }

    private static RecurringBillAuditEvent CreateAuditEvent(
        string action,
        AuthenticatedActor actor,
        RecurringBillTemplate template,
        DateOnly? occurrenceDate,
        Guid? generatedBillId,
        DateTimeOffset now)
    {
        return new RecurringBillAuditEvent(
            action,
            actor.AuthAccountId,
            actor.AuthAccountId,
            template.Id,
            template.GroupId,
            template.GroupId is null ? PersonalGroupMode : GroupMode,
            template.Status,
            occurrenceDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            generatedBillId,
            template.ForecastCurrency,
            template.ForecastAmount,
            now);
    }

    private static RecurringBillSchedule CreateSchedule(RecurringBillTemplate template)
    {
        return new RecurringBillSchedule(
            template.ScheduleType,
            template.IntervalCount,
            template.IntervalDays,
            template.StartDate,
            template.EndDate,
            template.DueOffsetDays);
    }

    private static async Task<TemplateCreateReadResult> ReadCreateRequestAsync(
        HttpRequest request,
        RecurringBillScheduleService scheduleService,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var document = await ReadJsonDocumentAsync(request, errors, cancellationToken);
        if (document is null)
        {
            return TemplateCreateReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return TemplateCreateReadResult.Invalid(ToErrorDictionary(errors));
            }

            var groupId = document.RootElement.TryGetProperty("groupId", out var groupIdElement)
                ? ReadNullableGuid(groupIdElement, "groupId", "Group ID", errors)
                : null;
            string? merchantName = null;
            string? description = null;
            RecurringBillSchedule? schedule = null;
            RecurringBillTemplatePayload? payload = null;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "groupId":
                        break;
                    case "merchantName":
                        merchantName = ReadNullableText(
                            property.Value,
                            "merchantName",
                            "Merchant name",
                            RecurringBillConstraints.MerchantNameMaxLength,
                            errors);
                        break;
                    case "description":
                        description = ReadNullableText(
                            property.Value,
                            "description",
                            "Description",
                            RecurringBillConstraints.DescriptionMaxLength,
                            errors);
                        break;
                    case "schedule":
                        schedule = ReadSchedule(property.Value, scheduleService, errors);
                        break;
                    case "billPayload":
                        payload = RecurringBillTemplatePayloadReader
                            .Read(property.Value, groupId is not null, errors)
                            .Payload;
                        break;
                    default:
                        AddUnsupportedFieldError(errors);
                        break;
                }
            }

            if (schedule is null)
            {
                AddError(errors, "schedule", "Schedule is required.");
            }

            if (payload is null)
            {
                AddError(errors, "billPayload", "Bill payload is required.");
            }

            return errors.Count == 0
                ? TemplateCreateReadResult.Valid(new TemplateCreateRequest(
                    groupId,
                    merchantName,
                    description,
                    schedule!,
                    payload!))
                : TemplateCreateReadResult.Invalid(ToErrorDictionary(errors));
        }
    }

    private static async Task<TemplatePatchReadResult> ReadPatchRequestAsync(
        HttpRequest request,
        RecurringBillScheduleService scheduleService,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var document = await ReadJsonDocumentAsync(request, errors, cancellationToken);
        if (document is null)
        {
            return TemplatePatchReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return TemplatePatchReadResult.Invalid(ToErrorDictionary(errors));
            }

            string? merchantName = null;
            var merchantNameSpecified = false;
            string? description = null;
            var descriptionSpecified = false;
            RecurringBillSchedule? schedule = null;
            JsonElement? billPayloadElement = null;
            var hasAnySupportedField = false;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "merchantName":
                        hasAnySupportedField = true;
                        merchantNameSpecified = true;
                        merchantName = ReadNullableText(
                            property.Value,
                            "merchantName",
                            "Merchant name",
                            RecurringBillConstraints.MerchantNameMaxLength,
                            errors);
                        break;
                    case "description":
                        hasAnySupportedField = true;
                        descriptionSpecified = true;
                        description = ReadNullableText(
                            property.Value,
                            "description",
                            "Description",
                            RecurringBillConstraints.DescriptionMaxLength,
                            errors);
                        break;
                    case "schedule":
                        hasAnySupportedField = true;
                        schedule = ReadSchedule(property.Value, scheduleService, errors);
                        break;
                    case "billPayload":
                        hasAnySupportedField = true;
                        billPayloadElement = property.Value.Clone();
                        break;
                    default:
                        AddUnsupportedFieldError(errors);
                        break;
                }
            }

            if (!hasAnySupportedField)
            {
                AddError(errors, "body", "At least one supported update field is required.");
            }

            return errors.Count == 0
                ? TemplatePatchReadResult.Valid(new TemplatePatchRequest(
                    merchantNameSpecified,
                    merchantName,
                    descriptionSpecified,
                    description,
                    schedule,
                    billPayloadElement))
                : TemplatePatchReadResult.Invalid(ToErrorDictionary(errors));
        }
    }

    private static async Task<JsonDocument?> ReadJsonDocumentAsync(
        HttpRequest request,
        Dictionary<string, List<string>> errors,
        CancellationToken cancellationToken)
    {
        if (!request.HasJsonContentType())
        {
            AddError(errors, "body", "A JSON object body is required.");
            return null;
        }

        try
        {
            return await JsonDocument.ParseAsync(
                request.Body,
                cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return null;
        }
        catch (BadHttpRequestException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return null;
        }
    }

    private static RecurringBillSchedule? ReadSchedule(
        JsonElement value,
        RecurringBillScheduleService scheduleService,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.Object)
        {
            AddError(errors, "schedule", "Schedule must be an object.");
            return null;
        }

        string? scheduleType = null;
        int? intervalCount = null;
        int? intervalDays = null;
        DateOnly? startDate = null;
        DateOnly? endDate = null;
        int? dueOffsetDays = null;

        foreach (var property in value.EnumerateObject())
        {
            switch (property.Name)
            {
                case "type":
                    scheduleType = ReadScheduleType(property.Value, "schedule.type", errors);
                    break;
                case "intervalCount":
                    intervalCount = ReadPositiveInt(property.Value, "schedule.intervalCount", errors);
                    break;
                case "intervalDays":
                    intervalDays = ReadPositiveInt(property.Value, "schedule.intervalDays", errors);
                    break;
                case "startDate":
                    startDate = ReadDate(property.Value, "schedule.startDate", errors);
                    break;
                case "endDate":
                    endDate = ReadNullableDate(property.Value, "schedule.endDate", errors);
                    break;
                case "dueOffsetDays":
                    dueOffsetDays = ReadNullableInt(property.Value, "schedule.dueOffsetDays", errors);
                    break;
                default:
                    AddUnsupportedFieldError(errors);
                    break;
            }
        }

        if (scheduleType is null)
        {
            AddError(errors, "schedule.type", "Schedule type is required.");
        }

        if (startDate is null)
        {
            AddError(errors, "schedule.startDate", "Schedule start date is required.");
        }

        if (scheduleType is null || startDate is null)
        {
            return null;
        }

        var schedule = new RecurringBillSchedule(
            scheduleType,
            intervalCount,
            intervalDays,
            startDate.Value,
            endDate,
            dueOffsetDays);
        var validationResult = scheduleService.Validate(schedule);
        foreach (var error in validationResult.Errors)
        {
            foreach (var message in error.Value)
            {
                AddError(errors, error.Key, message);
            }
        }

        return schedule;
    }

    private static TemplateListFilterReadResult ReadListFilter(HttpRequest request)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        RejectTemplateListRequestBody(request, errors);
        RejectUnsupportedTemplateListQueryFields(request, errors);

        var status = ReadOptionalQueryString(request, "status", errors);
        if (status is not null && !RecurringBillTemplateStatuses.IsSupported(status))
        {
            AddError(errors, "status", "Recurring template status is not supported.");
        }

        var groupId = ReadOptionalQueryGuid(request, "groupId", errors);
        var fromDate = ReadOptionalQueryDate(request, "fromDate", errors);
        var toDate = ReadOptionalQueryDate(request, "toDate", errors);
        if (fromDate is not null && toDate is not null && toDate < fromDate)
        {
            AddError(errors, "toDate", "To date must be on or after from date.");
        }

        return errors.Count == 0
            ? TemplateListFilterReadResult.Valid(new TemplateListFilter(status, groupId, fromDate, toDate))
            : TemplateListFilterReadResult.Invalid(ToErrorDictionary(errors));
    }

    private static TemplateReadEnvelopeResult ReadTemplateReadEnvelope(HttpRequest request)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        RejectTemplateReadRequestBody(request, errors);
        if (request.Query.Count > 0)
        {
            AddError(errors, "query", "Unsupported query fields are not allowed.");
        }

        return errors.Count == 0
            ? TemplateReadEnvelopeResult.Valid()
            : TemplateReadEnvelopeResult.Invalid(ToErrorDictionary(errors));
    }

    private static void RejectTemplateListRequestBody(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        if (RequestHasBody(request))
        {
            AddError(errors, "body", "Recurring bill template list requests do not accept a body.");
        }
    }

    private static void RejectTemplateReadRequestBody(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        if (RequestHasBody(request))
        {
            AddError(errors, "body", "Recurring bill template read requests do not accept a body.");
        }
    }

    private static void RejectUnsupportedTemplateListQueryFields(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        foreach (var field in request.Query.Keys)
        {
            if (!string.Equals(field, "status", StringComparison.Ordinal)
                && !string.Equals(field, "groupId", StringComparison.Ordinal)
                && !string.Equals(field, "fromDate", StringComparison.Ordinal)
                && !string.Equals(field, "toDate", StringComparison.Ordinal))
            {
                AddError(errors, "query", "Unsupported query fields are not allowed.");
                return;
            }
        }
    }

    private static ForecastFilterReadResult ReadForecastFilter(
        HttpRequest request,
        TimeProvider timeProvider)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        RejectForecastRequestBody(request, errors);
        RejectUnsupportedForecastQueryFields(request, errors);

        var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);
        var fromDate = ReadOptionalForecastQueryDate(request, "fromDate", errors) ?? today;
        var toDate = ReadOptionalForecastQueryDate(request, "toDate", errors) ?? fromDate.AddDays(60);
        var limit = ReadOptionalForecastQueryInt(request, "limit", errors) ?? 50;
        var groupId = ReadOptionalForecastQueryGuid(request, "groupId", errors);

        if (toDate < fromDate)
        {
            AddError(errors, "toDate", "To date must be on or after from date.");
        }

        if (limit is <= 0 or > RecurringBillConstraints.MaxForecastOccurrences)
        {
            AddError(errors, "limit", $"Limit must be between 1 and {RecurringBillConstraints.MaxForecastOccurrences}.");
        }

        return errors.Count == 0
            ? ForecastFilterReadResult.Valid(new ForecastFilter(fromDate, toDate, limit, groupId))
            : ForecastFilterReadResult.Invalid(ToErrorDictionary(errors));
    }

    private static void RejectForecastRequestBody(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        if (RequestHasBody(request))
        {
            AddError(errors, "body", "Recurring bill forecast requests do not accept a body.");
        }
    }

    private static void RejectUnsupportedForecastQueryFields(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        foreach (var field in request.Query.Keys)
        {
            if (!string.Equals(field, "fromDate", StringComparison.Ordinal)
                && !string.Equals(field, "toDate", StringComparison.Ordinal)
                && !string.Equals(field, "limit", StringComparison.Ordinal)
                && !string.Equals(field, "groupId", StringComparison.Ordinal))
            {
                AddError(errors, "query", "Unsupported query fields are not allowed.");
                return;
            }
        }
    }

    private static string? ReadOptionalForecastQueryString(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        if (!request.Query.TryGetValue(key, out var values) || values.Count == 0)
        {
            return null;
        }

        if (values.Count > 1)
        {
            AddError(errors, key, "Only one value is supported.");
            return null;
        }

        return values.ToString();
    }

    private static Guid? ReadOptionalForecastQueryGuid(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        var value = ReadOptionalForecastQueryString(request, key, errors);
        if (value is null)
        {
            return null;
        }

        if (!Guid.TryParse(value, out var parsed) || parsed == Guid.Empty)
        {
            AddError(errors, key, $"{key} must be a valid non-empty GUID.");
            return null;
        }

        return parsed;
    }

    private static DateOnly? ReadOptionalForecastQueryDate(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        var value = ReadOptionalForecastQueryString(request, key, errors);
        if (value is null)
        {
            return null;
        }

        if (!DateOnly.TryParseExact(
            value,
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var parsed))
        {
            AddError(errors, key, $"{key} must be a yyyy-MM-dd date string.");
            return null;
        }

        return parsed;
    }

    private static int? ReadOptionalForecastQueryInt(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        var value = ReadOptionalForecastQueryString(request, key, errors);
        if (value is null)
        {
            return null;
        }

        if (!int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var parsed))
        {
            AddError(errors, key, $"{key} must be an integer.");
            return null;
        }

        return parsed;
    }

    private static string? ReadOptionalQueryString(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>>? errors = null)
    {
        if (!request.Query.TryGetValue(key, out var values) || values.Count == 0)
        {
            return null;
        }

        if (values.Count > 1)
        {
            if (errors is not null)
            {
                AddError(errors, key, "Only one value is supported.");
            }

            return null;
        }

        return values.ToString();
    }

    private static Guid? ReadOptionalQueryGuid(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        var value = ReadOptionalQueryString(request, key, errors);
        if (value is null)
        {
            return null;
        }

        if (!Guid.TryParse(value, out var parsed) || parsed == Guid.Empty)
        {
            AddError(errors, key, $"{key} must be a valid non-empty GUID.");
            return null;
        }

        return parsed;
    }

    private static DateOnly? ReadOptionalQueryDate(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        var value = ReadOptionalQueryString(request, key, errors);
        if (value is null)
        {
            return null;
        }

        if (!DateOnly.TryParseExact(
            value,
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var parsed))
        {
            AddError(errors, key, $"{key} must be a yyyy-MM-dd date string.");
            return null;
        }

        return parsed;
    }

    private static int? ReadOptionalQueryInt(
        HttpRequest request,
        string key,
        Dictionary<string, List<string>> errors)
    {
        var value = ReadOptionalQueryString(request, key, errors);
        if (value is null)
        {
            return null;
        }

        if (!int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var parsed))
        {
            AddError(errors, key, $"{key} must be an integer.");
            return null;
        }

        return parsed;
    }

    private static Guid? ReadNullableGuid(
        JsonElement value,
        string errorKey,
        string label,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String
            || !Guid.TryParse(value.GetString(), out var parsed)
            || parsed == Guid.Empty)
        {
            AddError(errors, errorKey, $"{label} must be a valid non-empty GUID string.");
            return null;
        }

        return parsed;
    }

    private static string? ReadScheduleType(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, "Schedule type is not supported.");
            return null;
        }

        var scheduleType = value.GetString();
        if (!RecurringBillScheduleTypes.IsSupported(scheduleType))
        {
            AddError(errors, errorKey, "Schedule type is not supported.");
            return null;
        }

        return scheduleType;
    }

    private static int? ReadPositiveInt(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.Number
            || !value.TryGetInt32(out var parsed))
        {
            AddError(errors, errorKey, "Value must be a positive integer.");
            return null;
        }

        return parsed;
    }

    private static int? ReadNullableInt(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.Number
            || !value.TryGetInt32(out var parsed))
        {
            AddError(errors, errorKey, "Value must be an integer.");
            return null;
        }

        return parsed;
    }

    private static DateOnly? ReadDate(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String
            || !DateOnly.TryParseExact(
                value.GetString(),
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var parsed))
        {
            AddError(errors, errorKey, "Date must be a yyyy-MM-dd date string.");
            return null;
        }

        return parsed;
    }

    private static DateOnly? ReadNullableDate(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        return value.ValueKind is JsonValueKind.Null
            ? null
            : ReadDate(value, errorKey, errors);
    }

    private static string? ReadNullableText(
        JsonElement value,
        string errorKey,
        string label,
        int maxLength,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, $"{label} must be a string.");
            return null;
        }

        var trimmed = value.GetString()?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            AddError(errors, errorKey, $"{label} must not be blank when supplied.");
            return null;
        }

        if (trimmed.Length > maxLength)
        {
            AddError(errors, errorKey, $"{label} is too long.");
            return null;
        }

        return trimmed;
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : RecurringBillUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult RecurringBillUnavailable()
    {
        return Results.Problem(
            title: RecurringBillUnavailableTitle,
            detail: RecurringBillUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidRecurringBillRequest(ExpenseBillCalculationFailure failure)
    {
        return InvalidRecurringBillRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            [NormalizeCalculationField(failure.Field)] = [failure.Message]
        });
    }

    private static IResult InvalidRecurringBillRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidRecurringBillRequestTitle,
            detail: InvalidRecurringBillRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvalidRecurringBillNoBody()
    {
        return InvalidRecurringBillRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["body"] = ["This recurring bill action does not accept a request body."]
        });
    }

    private static IResult RecurringBillConflict()
    {
        return Results.Problem(
            title: RecurringBillConflictTitle,
            detail: RecurringBillConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult RecurringBillWriteFailed()
    {
        return Results.Problem(
            title: RecurringBillWriteFailedTitle,
            detail: RecurringBillWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static IResult RecurringBillReadFailed()
    {
        return Results.Problem(
            title: RecurringBillReadFailedTitle,
            detail: RecurringBillReadFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static bool RequestHasBody(HttpRequest request)
    {
        return request.ContentLength.GetValueOrDefault() > 0
            || request.Headers.TryGetValue("Transfer-Encoding", out var transferEncoding)
            && transferEncoding.Count > 0;
    }

    private static string NormalizeCalculationField(string field)
    {
        return field switch
        {
            "bill.currency" => "billPayload.currency",
            "items.amount" => "billPayload.items.amount",
            "items.currency" => "billPayload.items.currency",
            "items.splits.basis_value" => "billPayload.items.splits.basisValue",
            "items.splits.split_method" => "billPayload.items.splits.splitMethod",
            "adjustments.amount" => "billPayload.adjustments.amount",
            "adjustments.currency" => "billPayload.adjustments.currency",
            "adjustments.allocation_method" => "billPayload.adjustments.allocationMethod",
            "payers.amount" => "billPayload.payers.amount",
            "payers.currency" => "billPayload.payers.currency",
            "payers.user_profile_id" => "billPayload.payers.userProfileId",
            "participants.user_profile_id" => "billPayload.participants.userProfileId",
            _ => field
        };
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private static string DueSoonSummary(DateOnly dueDate)
    {
        return string.Format(
            CultureInfo.InvariantCulture,
            DueSoonSummaryTemplate,
            dueDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
    }

    private static string TitleKey(string eventType)
    {
        return $"notifications.{eventType}.title";
    }

    private static string MessageKey(string eventType)
    {
        return $"notifications.{eventType}.message";
    }

    private static void AddUnsupportedFieldError(Dictionary<string, List<string>> errors)
    {
        AddError(errors, "body", "Unsupported fields are not allowed.");
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

    private sealed record TemplateCreateRequest(
        Guid? GroupId,
        string? MerchantName,
        string? Description,
        RecurringBillSchedule Schedule,
        RecurringBillTemplatePayload Payload);

    private sealed record TemplatePatchRequest(
        bool MerchantNameSpecified,
        string? MerchantName,
        bool DescriptionSpecified,
        string? Description,
        RecurringBillSchedule? Schedule,
        JsonElement? BillPayloadElement);

    private sealed record TemplateListFilter(
        string? Status,
        Guid? GroupId,
        DateOnly? FromDate,
        DateOnly? ToDate);

    private sealed record ForecastFilter(
        DateOnly FromDate,
        DateOnly ToDate,
        int Limit,
        Guid? GroupId);

    private sealed record BillPreviewTotal(
        decimal Amount,
        string Currency);

    private sealed class BillPreviewResult
    {
        private BillPreviewResult(
            BillPreviewTotal? billTotal,
            ExpenseBillCalculationFailure? failure)
        {
            BillTotal = billTotal;
            Failure = failure;
        }

        public bool Succeeded => Failure is null;

        public BillPreviewTotal? BillTotal { get; }

        public ExpenseBillCalculationFailure? Failure { get; }

        public static BillPreviewResult Success(BillPreviewTotal billTotal)
        {
            return new BillPreviewResult(billTotal, failure: null);
        }

        public static BillPreviewResult Failed(ExpenseBillCalculationFailure failure)
        {
            return new BillPreviewResult(billTotal: null, failure);
        }
    }

    private sealed class TemplateCreateReadResult
    {
        private TemplateCreateReadResult(
            TemplateCreateRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public TemplateCreateRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static TemplateCreateReadResult Valid(TemplateCreateRequest request)
        {
            return new TemplateCreateReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static TemplateCreateReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new TemplateCreateReadResult(null, errors);
        }
    }

    private sealed class TemplatePatchReadResult
    {
        private TemplatePatchReadResult(
            TemplatePatchRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public TemplatePatchRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static TemplatePatchReadResult Valid(TemplatePatchRequest request)
        {
            return new TemplatePatchReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static TemplatePatchReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new TemplatePatchReadResult(null, errors);
        }
    }

    private sealed class TemplateListFilterReadResult
    {
        private TemplateListFilterReadResult(
            TemplateListFilter? filter,
            IDictionary<string, string[]> errors)
        {
            Filter = filter;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public TemplateListFilter? Filter { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static TemplateListFilterReadResult Valid(TemplateListFilter filter)
        {
            return new TemplateListFilterReadResult(
                filter,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static TemplateListFilterReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new TemplateListFilterReadResult(null, errors);
        }
    }

    private sealed class TemplateReadEnvelopeResult
    {
        private TemplateReadEnvelopeResult(IDictionary<string, string[]> errors)
        {
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public IDictionary<string, string[]> Errors { get; }

        public static TemplateReadEnvelopeResult Valid()
        {
            return new TemplateReadEnvelopeResult(new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static TemplateReadEnvelopeResult Invalid(IDictionary<string, string[]> errors)
        {
            return new TemplateReadEnvelopeResult(errors);
        }
    }

    private sealed class ForecastFilterReadResult
    {
        private ForecastFilterReadResult(
            ForecastFilter? filter,
            IDictionary<string, string[]> errors)
        {
            Filter = filter;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public ForecastFilter? Filter { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static ForecastFilterReadResult Valid(ForecastFilter filter)
        {
            return new ForecastFilterReadResult(
                filter,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static ForecastFilterReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new ForecastFilterReadResult(null, errors);
        }
    }
}
