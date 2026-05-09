using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Storage;
using Settleora.Api.Users.PaymentDetails;

namespace Settleora.Api.Settlements;

internal static class SettlementCounterpartyPaymentDetailsEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string PaymentDetailsUnavailableTitle = "Payment details unavailable";
    private const string PaymentDetailsUnavailableDetail = "The requested payment details are unavailable.";
    private const string PaymentDetailsAccessFailedTitle = "Payment details access failed";
    private const string PaymentDetailsAccessFailedDetail = "Unable to complete payment details access.";
    private const string PaymentDetailsViewedByCounterpartyAction = "payment_details.viewed_by_counterparty";
    private const string CounterpartyReadWorkflowName = "payment_details_counterparty_read";
    private const string DetailsReadCategory = "details_read";
    private const string QrContentReadCategory = "qr_content_read";

    private static readonly IReadOnlyDictionary<string, string> SupportedPaymentQrContentTypes =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["image/png"] = "image/png",
            ["image/jpeg"] = "image/jpeg",
            ["image/webp"] = "image/webp"
        };

    public static WebApplication MapSettlementCounterpartyPaymentDetailsEndpoints(this WebApplication app)
    {
        var settlements = app.MapGroup("/api/v1/settlements")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        settlements.MapGet(
            "/{settlementId:guid}/counterparties/{userProfileId:guid}/payment-details",
            GetCounterpartyPaymentDetailsAsync);
        settlements.MapGet(
            "/{settlementId:guid}/counterparties/{userProfileId:guid}/payment-details/qr/content",
            GetCounterpartyPaymentDetailsQrContentAsync);

        return app;
    }

    private static async Task<IResult> GetCounterpartyPaymentDetailsAsync(
        Guid settlementId,
        Guid userProfileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IPaymentDetailsAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
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

        var counterpartyContext = await LoadCounterpartyContextAsync(
            dbContext,
            settlementId,
            actor.UserProfileId,
            userProfileId,
            cancellationToken);
        if (counterpartyContext is null)
        {
            return PaymentDetailsUnavailable();
        }

        if (counterpartyContext.GroupId.HasValue)
        {
            var groupAuthorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
                counterpartyContext.GroupId.Value,
                cancellationToken);
            if (!groupAuthorizationResult.Allowed)
            {
                return MapAuthorizationFailure(groupAuthorizationResult);
            }
        }

        var response = MapResponse(counterpartyContext);
        var qrFileObjectId = response.IsConfigured ? response.QrFile?.Id : null;
        var now = timeProvider.GetUtcNow();
        await WriteCounterpartyAccessAuditAsync(
            auditWriter,
            actor,
            counterpartyContext,
            response.IsConfigured,
            DetailsReadCategory,
            qrFileObjectId,
            now,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return PaymentDetailsAccessFailed();
        }

        return Results.Ok(response);
    }

    private static async Task<IResult> GetCounterpartyPaymentDetailsQrContentAsync(
        Guid settlementId,
        Guid userProfileId,
        HttpResponse response,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IPaymentDetailsAuditWriter auditWriter,
        IFileObjectStorageProvider storageProvider,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
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

        var counterpartyContext = await LoadCounterpartyContextAsync(
            dbContext,
            settlementId,
            actor.UserProfileId,
            userProfileId,
            cancellationToken);
        if (counterpartyContext is null)
        {
            return PaymentDetailsUnavailable();
        }

        if (counterpartyContext.GroupId.HasValue)
        {
            var groupAuthorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
                counterpartyContext.GroupId.Value,
                cancellationToken);
            if (!groupAuthorizationResult.Allowed)
            {
                return MapAuthorizationFailure(groupAuthorizationResult);
            }
        }

        var paymentProfile = counterpartyContext.PaymentProfile;
        var fileObject = paymentProfile?.QrFileObject;
        if (!CanExposePaymentProfile(paymentProfile, counterpartyContext.GroupId)
            || paymentProfile?.QrFileObjectId is null
            || !IsReadablePaymentQrFile(fileObject, counterpartyContext.TargetUserProfileId))
        {
            return PaymentDetailsUnavailable();
        }

        Stream content;
        try
        {
            content = await storageProvider.OpenReadAsync(fileObject!.StorageObjectKey, cancellationToken);
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            return PaymentDetailsUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        await WriteCounterpartyAccessAuditAsync(
            auditWriter,
            actor,
            counterpartyContext,
            isConfigured: true,
            QrContentReadCategory,
            fileObject!.Id,
            now,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            await content.DisposeAsync();
            return PaymentDetailsAccessFailed();
        }

        response.Headers["X-Content-Type-Options"] = "nosniff";
        response.Headers["Content-Disposition"] = "attachment";
        return Results.File(content, fileObject.ContentType);
    }

    private static async Task<CounterpartyPaymentDetailsContext?> LoadCounterpartyContextAsync(
        SettleoraDbContext dbContext,
        Guid settlementId,
        Guid actorUserProfileId,
        Guid targetUserProfileId,
        CancellationToken cancellationToken)
    {
        if (actorUserProfileId == targetUserProfileId)
        {
            return null;
        }

        var settlementContext = await dbContext.Set<SettlementRequest>()
            .AsNoTracking()
            .Where(settlementRequest => settlementRequest.Id == settlementId
                && settlementRequest.ArchivedAtUtc == null
                && settlementRequest.SourceExpenseBillId != null
                && settlementRequest.DebtorUserProfile.DeletedAtUtc == null
                && settlementRequest.CreditorUserProfile.DeletedAtUtc == null
                && settlementRequest.RequestedByUserProfile.DeletedAtUtc == null
                && ((settlementRequest.DebtorUserProfileId == actorUserProfileId
                        && settlementRequest.CreditorUserProfileId == targetUserProfileId)
                    || (settlementRequest.CreditorUserProfileId == actorUserProfileId
                        && settlementRequest.DebtorUserProfileId == targetUserProfileId))
                && (settlementRequest.GroupId == null
                    || (settlementRequest.GroupId != null
                        && settlementRequest.Group != null
                        && settlementRequest.Group.DeletedAtUtc == null
                        && settlementRequest.DebtorUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == settlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && settlementRequest.CreditorUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == settlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && settlementRequest.RequestedByUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == settlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && dbContext.Set<GroupMembership>().Any(membership =>
                            membership.GroupId == settlementRequest.GroupId.Value
                            && membership.UserProfileId == actorUserProfileId
                            && membership.Status == GroupMembershipStatuses.Active))))
            .Select(settlementRequest => new SettlementCounterpartyContext(
                settlementRequest.Id,
                settlementRequest.GroupId,
                settlementRequest.DebtorUserProfileId,
                settlementRequest.CreditorUserProfileId))
            .SingleOrDefaultAsync(cancellationToken);
        if (settlementContext is null)
        {
            return null;
        }

        var targetAuthAccountId = await dbContext.Set<AuthAccount>()
            .AsNoTracking()
            .Where(authAccount => authAccount.UserProfileId == targetUserProfileId
                && authAccount.Status == AuthAccountStatuses.Active
                && authAccount.UserProfile.DeletedAtUtc == null)
            .Select(authAccount => (Guid?)authAccount.Id)
            .SingleOrDefaultAsync(cancellationToken);
        if (targetAuthAccountId is null)
        {
            return null;
        }

        var paymentProfile = await dbContext.Set<UserPaymentProfile>()
            .AsNoTracking()
            .Include(profile => profile.UserProfile)
            .Include(profile => profile.QrFileObject)
            .Where(profile => profile.UserProfileId == targetUserProfileId
                && profile.DeletedAtUtc == null
                && profile.UserProfile.DeletedAtUtc == null)
            .SingleOrDefaultAsync(cancellationToken);

        return new CounterpartyPaymentDetailsContext(
            settlementContext.SettlementRequestId,
            settlementContext.GroupId,
            actorUserProfileId,
            targetUserProfileId,
            targetAuthAccountId.Value,
            settlementContext.DebtorUserProfileId,
            settlementContext.CreditorUserProfileId,
            paymentProfile);
    }

    private static SettlementCounterpartyPaymentDetailsResponse MapResponse(
        CounterpartyPaymentDetailsContext counterpartyContext)
    {
        var paymentProfile = counterpartyContext.PaymentProfile;
        var visibilityApplied = paymentProfile?.Visibility ?? UserPaymentProfileVisibilities.Default;
        if (!CanExposePaymentProfile(paymentProfile, counterpartyContext.GroupId))
        {
            return new SettlementCounterpartyPaymentDetailsResponse(
                counterpartyContext.TargetUserProfileId,
                IsConfigured: false,
                PreferredMethodLabel: null,
                PaymentHandle: null,
                PaymentNote: null,
                visibilityApplied,
                QrFile: null);
        }

        return new SettlementCounterpartyPaymentDetailsResponse(
            counterpartyContext.TargetUserProfileId,
            IsConfigured: true,
            paymentProfile!.PreferredMethodLabel,
            paymentProfile.PaymentHandle,
            paymentProfile.PaymentNote,
            visibilityApplied,
            MapQrFileResponse(paymentProfile.QrFileObject, counterpartyContext.TargetUserProfileId));
    }

    private static SettlementCounterpartyPaymentDetailsQrFileResponse? MapQrFileResponse(
        FileObject? fileObject,
        Guid targetUserProfileId)
    {
        return IsReadablePaymentQrFile(fileObject, targetUserProfileId)
            ? new SettlementCounterpartyPaymentDetailsQrFileResponse(
                fileObject!.Id,
                fileObject.ContentType,
                fileObject.SizeBytes,
                fileObject.UpdatedAtUtc)
            : null;
    }

    private static bool CanExposePaymentProfile(UserPaymentProfile? paymentProfile, Guid? groupId)
    {
        return paymentProfile is not null
            && paymentProfile.DeletedAtUtc is null
            && paymentProfile.UserProfile.DeletedAtUtc is null
            && (paymentProfile.Visibility == UserPaymentProfileVisibilities.SettlementCounterpartiesOnly
                || (paymentProfile.Visibility == UserPaymentProfileVisibilities.GroupMembersWhenShared
                    && groupId.HasValue));
    }

    private static bool IsReadablePaymentQrFile(FileObject? fileObject, Guid targetUserProfileId)
    {
        return fileObject is not null
            && fileObject.DeletedAtUtc is null
            && fileObject.OwnerUserProfileId == targetUserProfileId
            && fileObject.CreatedByUserProfileId == targetUserProfileId
            && StringComparer.Ordinal.Equals(fileObject.Purpose, FileObjectPurposes.PaymentQr)
            && StringComparer.Ordinal.Equals(fileObject.Status, FileObjectStatuses.Active)
            && SupportedPaymentQrContentTypes.ContainsKey(fileObject.ContentType);
    }

    private static ValueTask WriteCounterpartyAccessAuditAsync(
        IPaymentDetailsAuditWriter auditWriter,
        AuthenticatedActor actor,
        CounterpartyPaymentDetailsContext counterpartyContext,
        bool isConfigured,
        string changeCategory,
        Guid? qrFileObjectId,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        var paymentProfile = counterpartyContext.PaymentProfile;
        return auditWriter.WriteAsync(
            new PaymentDetailsAuditEvent(
                PaymentDetailsViewedByCounterpartyAction,
                actor.AuthAccountId,
                counterpartyContext.TargetAuthAccountId,
                paymentProfile?.Id,
                RowCreated: false,
                [changeCategory],
                PreviousVisibility: null,
                NewVisibility: paymentProfile?.Visibility,
                occurredAtUtc,
                QrFileObjectId: qrFileObjectId,
                ChangeCategory: changeCategory,
                WorkflowName: CounterpartyReadWorkflowName,
                SettlementRequestId: counterpartyContext.SettlementRequestId,
                ActorUserProfileId: counterpartyContext.ActorUserProfileId,
                TargetUserProfileId: counterpartyContext.TargetUserProfileId,
                GroupId: counterpartyContext.GroupId,
                GroupMode: counterpartyContext.GroupId.HasValue
                    ? SettlementRuntimePolicy.GroupMode
                    : SettlementRuntimePolicy.PersonalGroupMode,
                Relationship: ResolveRelationship(counterpartyContext),
                IsConfigured: isConfigured),
            cancellationToken);
    }

    private static string ResolveRelationship(CounterpartyPaymentDetailsContext counterpartyContext)
    {
        return counterpartyContext.ActorUserProfileId == counterpartyContext.DebtorUserProfileId
            ? "debtor_to_creditor"
            : "creditor_to_debtor";
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : PaymentDetailsUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult PaymentDetailsUnavailable()
    {
        return Results.Problem(
            title: PaymentDetailsUnavailableTitle,
            detail: PaymentDetailsUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult PaymentDetailsAccessFailed()
    {
        return Results.Problem(
            title: PaymentDetailsAccessFailedTitle,
            detail: PaymentDetailsAccessFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private sealed record SettlementCounterpartyContext(
        Guid SettlementRequestId,
        Guid? GroupId,
        Guid DebtorUserProfileId,
        Guid CreditorUserProfileId);

    private sealed record CounterpartyPaymentDetailsContext(
        Guid SettlementRequestId,
        Guid? GroupId,
        Guid ActorUserProfileId,
        Guid TargetUserProfileId,
        Guid TargetAuthAccountId,
        Guid DebtorUserProfileId,
        Guid CreditorUserProfileId,
        UserPaymentProfile? PaymentProfile);
}
