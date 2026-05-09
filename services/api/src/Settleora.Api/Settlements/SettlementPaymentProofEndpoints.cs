using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Storage;

namespace Settleora.Api.Settlements;

internal static class SettlementPaymentProofEndpoints
{
    private const long SettlementProofMaxSizeBytes = 5 * 1024 * 1024;
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string SettlementPaymentUnavailableTitle = "Settlement payment unavailable";
    private const string SettlementPaymentUnavailableDetail = "The requested settlement payment is unavailable.";
    private const string InvalidSettlementProofUploadTitle = "Invalid settlement proof upload";
    private const string InvalidSettlementProofUploadDetail = "The submitted settlement proof upload is invalid.";
    private const string SettlementProofConflictTitle = "Settlement proof conflict";
    private const string SettlementProofConflictDetail = "The settlement proof cannot be changed for the current settlement payment state.";
    private const string SettlementProofUploadFailedTitle = "Settlement proof upload failed";
    private const string SettlementProofUploadFailedDetail = "Unable to complete settlement proof upload.";
    private const string SettlementProofRemoveFailedTitle = "Settlement proof remove failed";
    private const string SettlementProofRemoveFailedDetail = "Unable to complete settlement proof removal.";
    private const string SettlementProofAccessFailedTitle = "Settlement proof access failed";
    private const string SettlementProofAccessFailedDetail = "Unable to complete settlement proof access.";
    private const string SettlementProofWorkflowName = "settlement_payment_proof";
    private const string SettlementProofAttachedAction = "settlement.proof_attached";
    private const string SettlementProofRemovedAction = "settlement.proof_removed";
    private const string SettlementProofReadAction = "settlement.proof_read";

    private static readonly string[] VisiblePaymentStatuses =
    [
        SettlementPaymentStatuses.MarkedPaid,
        SettlementPaymentStatuses.Confirmed,
        SettlementPaymentStatuses.Disputed,
        SettlementPaymentStatuses.Cancelled
    ];

    private static readonly string[] ActivePaymentStatuses =
    [
        SettlementPaymentStatuses.MarkedPaid,
        SettlementPaymentStatuses.Confirmed
    ];

    private static readonly string[] VisibleRequestStatuses =
    [
        SettlementRequestStatuses.Requested,
        SettlementRequestStatuses.PartiallyPaid,
        SettlementRequestStatuses.MarkedPaid,
        SettlementRequestStatuses.Confirmed,
        SettlementRequestStatuses.Disputed,
        SettlementRequestStatuses.Cancelled
    ];

    private static readonly string[] MutableRequestStatuses =
    [
        SettlementRequestStatuses.PartiallyPaid,
        SettlementRequestStatuses.MarkedPaid
    ];

    private static readonly string[] SupportedSettlementProofContentTypeValues =
    [
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/pdf"
    ];

    private static readonly IReadOnlyDictionary<string, string> SupportedSettlementProofContentTypes =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["image/png"] = "image/png",
            ["image/jpeg"] = "image/jpeg",
            ["image/webp"] = "image/webp",
            ["application/pdf"] = "application/pdf"
        };

    public static WebApplication MapSettlementPaymentProofEndpoints(this WebApplication app)
    {
        var settlementPayments = app.MapGroup("/api/v1/settlement-payments")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        settlementPayments.MapPost("/{paymentId:guid}/proof", AttachSettlementPaymentProofAsync);
        settlementPayments.MapGet("/{paymentId:guid}/proof", ListSettlementPaymentProofsAsync);
        settlementPayments.MapGet("/{paymentId:guid}/proof/{fileId:guid}/content", GetSettlementPaymentProofContentAsync);
        settlementPayments.MapDelete("/{paymentId:guid}/proof/{fileId:guid}", RemoveSettlementPaymentProofAsync);

        return app;
    }

    private static async Task<IResult> AttachSettlementPaymentProofAsync(
        Guid paymentId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ISettlementPaymentAuditWriter auditWriter,
        IFileObjectLifecycleService fileObjectLifecycleService,
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

        var uploadReadResult = await ReadSettlementProofUploadAsync(request, cancellationToken);
        if (!uploadReadResult.Succeeded || uploadReadResult.Upload is null)
        {
            return InvalidSettlementProofUpload(uploadReadResult.Errors);
        }

        var paymentContext = await LoadVisiblePaymentContextAsync(
            dbContext,
            paymentId,
            actor.UserProfileId,
            trackChanges: false,
            cancellationToken);
        if (paymentContext is null)
        {
            return SettlementPaymentUnavailable();
        }

        if (paymentContext.GroupId.HasValue)
        {
            var groupAuthorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
                paymentContext.GroupId.Value,
                cancellationToken);
            if (!groupAuthorizationResult.Allowed)
            {
                return MapAuthorizationFailure(groupAuthorizationResult);
            }
        }

        if (!CanMutateProof(paymentContext, actor.UserProfileId))
        {
            return SettlementPaymentUnavailable();
        }

        if (!CanChangeProofInCurrentState(paymentContext))
        {
            return SettlementProofConflict();
        }

        var upload = uploadReadResult.Upload;
        var createResult = await fileObjectLifecycleService.CreatePendingAsync(
            new CreateFileObjectPendingRequest(
                actor.AuthAccountId,
                actor.UserProfileId,
                actor.UserProfileId,
                FileObjectPurposes.SettlementProof,
                upload.ContentType,
                upload.Bytes.LongLength,
                OriginalFilename: null,
                Sha256Hash: upload.Sha256Hash,
                EncryptionMode: FileObjectEncryptionModes.ServerManaged),
            cancellationToken);
        if (!createResult.Succeeded || createResult.FileObject is null)
        {
            return SettlementProofUploadFailed();
        }

        var fileObject = await dbContext.Set<FileObject>()
            .SingleAsync(candidate => candidate.Id == createResult.FileObject.Id, cancellationToken);

        try
        {
            await using var content = new MemoryStream(upload.Bytes, writable: false);
            await storageProvider.WriteAsync(fileObject.StorageObjectKey, content, cancellationToken);
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            await fileObjectLifecycleService.MarkUploadFailedAsync(
                new FailFileObjectUploadRequest(
                    actor.AuthAccountId,
                    actor.UserProfileId,
                    createResult.FileObject.Id),
                cancellationToken);
            return SettlementProofUploadFailed();
        }

        var activeResult = await fileObjectLifecycleService.MarkActiveAsync(
            new CompleteFileObjectUploadRequest(
                actor.AuthAccountId,
                actor.UserProfileId,
                createResult.FileObject.Id),
            cancellationToken);
        if (!activeResult.Succeeded || activeResult.FileObject is null)
        {
            return SettlementProofUploadFailed();
        }

        var now = timeProvider.GetUtcNow();
        var attachment = new SettlementProofAttachment
        {
            SettlementPaymentId = paymentContext.SettlementPaymentId,
            FileObjectId = activeResult.FileObject.Id,
            CreatedByUserProfileId = actor.UserProfileId,
            CreatedAtUtc = now,
            RemovedAtUtc = null
        };
        dbContext.Set<SettlementProofAttachment>().Add(attachment);

        await WriteProofAuditAsync(
            auditWriter,
            actor.AuthAccountId,
            paymentContext,
            SettlementProofAttachedAction,
            "proof_attached",
            activeResult.FileObject.Id,
            now,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            await fileObjectLifecycleService.MarkDeletedAsync(
                new DeleteFileObjectRequest(
                    actor.AuthAccountId,
                    actor.UserProfileId,
                    activeResult.FileObject.Id),
                cancellationToken);
            return SettlementProofUploadFailed();
        }

        var savedAttachment = await LoadReadableProofAttachmentQuery(dbContext, paymentContext, activeResult.FileObject.Id)
            .SingleAsync(cancellationToken);
        return Results.Created(
            $"/api/v1/settlement-payments/{paymentContext.SettlementPaymentId:D}/proof/{activeResult.FileObject.Id:D}/content",
            SettlementPaymentProofResponse.From(savedAttachment));
    }

    private static async Task<IResult> ListSettlementPaymentProofsAsync(
        Guid paymentId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
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

        var paymentContext = await LoadVisiblePaymentContextAsync(
            dbContext,
            paymentId,
            actor.UserProfileId,
            trackChanges: false,
            cancellationToken);
        if (paymentContext is null)
        {
            return SettlementPaymentUnavailable();
        }

        if (paymentContext.GroupId.HasValue)
        {
            var groupAuthorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
                paymentContext.GroupId.Value,
                cancellationToken);
            if (!groupAuthorizationResult.Allowed)
            {
                return MapAuthorizationFailure(groupAuthorizationResult);
            }
        }

        var proofs = await LoadReadableProofAttachmentsQuery(dbContext, paymentContext)
            .OrderByDescending(attachment => attachment.CreatedAtUtc)
            .ThenByDescending(attachment => attachment.FileObject.UpdatedAtUtc)
            .ThenBy(attachment => attachment.FileObjectId)
            .ToArrayAsync(cancellationToken);

        return Results.Ok(new SettlementPaymentProofListResponse(
            proofs.Select(SettlementPaymentProofResponse.From).ToArray()));
    }

    private static async Task<IResult> GetSettlementPaymentProofContentAsync(
        Guid paymentId,
        Guid fileId,
        HttpResponse response,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ISettlementPaymentAuditWriter auditWriter,
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

        var paymentContext = await LoadVisiblePaymentContextAsync(
            dbContext,
            paymentId,
            actor.UserProfileId,
            trackChanges: false,
            cancellationToken);
        if (paymentContext is null)
        {
            return SettlementPaymentUnavailable();
        }

        if (paymentContext.GroupId.HasValue)
        {
            var groupAuthorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
                paymentContext.GroupId.Value,
                cancellationToken);
            if (!groupAuthorizationResult.Allowed)
            {
                return MapAuthorizationFailure(groupAuthorizationResult);
            }
        }

        var attachment = await LoadReadableProofAttachmentQuery(dbContext, paymentContext, fileId)
            .SingleOrDefaultAsync(cancellationToken);
        if (attachment is null)
        {
            return SettlementPaymentUnavailable();
        }

        Stream content;
        try
        {
            content = await storageProvider.OpenReadAsync(
                attachment.FileObject.StorageObjectKey,
                cancellationToken);
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            return SettlementPaymentUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        await WriteProofAuditAsync(
            auditWriter,
            actor.AuthAccountId,
            paymentContext,
            SettlementProofReadAction,
            "proof_read",
            attachment.FileObjectId,
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
            return SettlementProofAccessFailed();
        }

        response.Headers["X-Content-Type-Options"] = "nosniff";
        response.Headers["Content-Disposition"] = "attachment";
        return Results.File(content, attachment.FileObject.ContentType);
    }

    private static async Task<IResult> RemoveSettlementPaymentProofAsync(
        Guid paymentId,
        Guid fileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ISettlementPaymentAuditWriter auditWriter,
        IFileObjectLifecycleService fileObjectLifecycleService,
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

        var paymentContext = await LoadVisiblePaymentContextAsync(
            dbContext,
            paymentId,
            actor.UserProfileId,
            trackChanges: false,
            cancellationToken);
        if (paymentContext is null)
        {
            return SettlementPaymentUnavailable();
        }

        if (paymentContext.GroupId.HasValue)
        {
            var groupAuthorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
                paymentContext.GroupId.Value,
                cancellationToken);
            if (!groupAuthorizationResult.Allowed)
            {
                return MapAuthorizationFailure(groupAuthorizationResult);
            }
        }

        if (!CanMutateProof(paymentContext, actor.UserProfileId))
        {
            return SettlementPaymentUnavailable();
        }

        if (!CanChangeProofInCurrentState(paymentContext))
        {
            return SettlementProofConflict();
        }

        var attachment = await LoadReadableProofAttachmentQuery(dbContext, paymentContext, fileId, trackChanges: true)
            .Where(candidate => candidate.CreatedByUserProfileId == actor.UserProfileId
                && candidate.FileObject.OwnerUserProfileId == actor.UserProfileId
                && candidate.FileObject.CreatedByUserProfileId == actor.UserProfileId)
            .SingleOrDefaultAsync(cancellationToken);
        if (attachment is null)
        {
            return SettlementPaymentUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        attachment.RemovedAtUtc = now;

        await WriteProofAuditAsync(
            auditWriter,
            actor.AuthAccountId,
            paymentContext,
            SettlementProofRemovedAction,
            "proof_removed",
            attachment.FileObjectId,
            now,
            cancellationToken);

        var deleteResult = await fileObjectLifecycleService.MarkDeletedAsync(
            new DeleteFileObjectRequest(
                actor.AuthAccountId,
                actor.UserProfileId,
                attachment.FileObjectId),
            cancellationToken);
        if (!deleteResult.Succeeded)
        {
            dbContext.ChangeTracker.Clear();
            return SettlementProofRemoveFailed();
        }

        return Results.NoContent();
    }

    private static async Task<SettlementProofUploadReadResult> ReadSettlementProofUploadAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (!request.HasFormContentType)
        {
            errors["form"] = ["A multipart form with one file field is required."];
            return SettlementProofUploadReadResult.Invalid(errors);
        }

        IFormCollection form;
        try
        {
            form = await request.ReadFormAsync(cancellationToken);
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            errors["form"] = ["A multipart form with one file field is required."];
            return SettlementProofUploadReadResult.Invalid(errors);
        }

        if (form.Count != 0 || form.Files.Count != 1 || form.Files[0].Name != "file")
        {
            errors["form"] = ["A multipart form with one file field is required."];
            return SettlementProofUploadReadResult.Invalid(errors);
        }

        var file = form.Files[0];
        if (file.Length <= 0)
        {
            errors["file"] = ["A non-empty settlement proof file is required."];
            return SettlementProofUploadReadResult.Invalid(errors);
        }

        if (file.Length > SettlementProofMaxSizeBytes)
        {
            errors["file"] = ["The settlement proof file is too large."];
            return SettlementProofUploadReadResult.Invalid(errors);
        }

        var contentType = NormalizeSettlementProofContentType(file.ContentType);
        if (contentType is null)
        {
            errors["file"] = ["The settlement proof file type is not supported."];
            return SettlementProofUploadReadResult.Invalid(errors);
        }

        byte[] bytes;
        await using (var content = file.OpenReadStream())
        await using (var buffer = new MemoryStream((int)file.Length))
        {
            await content.CopyToAsync(buffer, cancellationToken);
            bytes = buffer.ToArray();
        }

        if (!HasExpectedSettlementProofSignature(contentType, bytes))
        {
            errors["file"] = ["The settlement proof file type is not supported."];
            return SettlementProofUploadReadResult.Invalid(errors);
        }

        return SettlementProofUploadReadResult.Valid(
            new SettlementProofUpload(
                contentType,
                bytes,
                Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant()));
    }

    private static IQueryable<SettlementProofAttachment> LoadReadableProofAttachmentsQuery(
        SettleoraDbContext dbContext,
        SettlementPaymentProofContext paymentContext,
        bool trackChanges = false)
    {
        var query = dbContext.Set<SettlementProofAttachment>()
            .Include(attachment => attachment.FileObject)
            .Where(attachment => attachment.SettlementPaymentId == paymentContext.SettlementPaymentId
                && attachment.RemovedAtUtc == null
                && attachment.CreatedByUserProfileId == paymentContext.PaidByUserProfileId
                && attachment.FileObject.DeletedAtUtc == null
                && attachment.FileObject.OwnerUserProfileId == paymentContext.PaidByUserProfileId
                && attachment.FileObject.CreatedByUserProfileId == paymentContext.PaidByUserProfileId
                && attachment.FileObject.Purpose == FileObjectPurposes.SettlementProof
                && attachment.FileObject.Status == FileObjectStatuses.Active
                && SupportedSettlementProofContentTypeValues.Contains(attachment.FileObject.ContentType));

        return trackChanges ? query : query.AsNoTracking();
    }

    private static IQueryable<SettlementProofAttachment> LoadReadableProofAttachmentQuery(
        SettleoraDbContext dbContext,
        SettlementPaymentProofContext paymentContext,
        Guid fileId,
        bool trackChanges = false)
    {
        return LoadReadableProofAttachmentsQuery(dbContext, paymentContext, trackChanges)
            .Where(attachment => attachment.FileObjectId == fileId);
    }

    private static async Task<SettlementPaymentProofContext?> LoadVisiblePaymentContextAsync(
        SettleoraDbContext dbContext,
        Guid paymentId,
        Guid actorUserProfileId,
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        var payments = dbContext.Set<SettlementPayment>();
        var query = trackChanges ? payments : payments.AsNoTracking();

        return await query
            .Where(payment => payment.Id == paymentId
                && payment.SettlementRequest.ArchivedAtUtc == null
                && payment.SettlementRequest.SourceExpenseBillId != null
                && payment.SettlementRequest.DebtorUserProfile.DeletedAtUtc == null
                && payment.SettlementRequest.CreditorUserProfile.DeletedAtUtc == null
                && payment.SettlementRequest.RequestedByUserProfile.DeletedAtUtc == null
                && payment.PaidByUserProfile.DeletedAtUtc == null
                && payment.ReceivedByUserProfile.DeletedAtUtc == null
                && payment.CreatedByUserProfile.DeletedAtUtc == null
                && payment.PaidByUserProfileId == payment.SettlementRequest.DebtorUserProfileId
                && payment.ReceivedByUserProfileId == payment.SettlementRequest.CreditorUserProfileId
                && payment.CreatedByUserProfileId == payment.SettlementRequest.DebtorUserProfileId
                && payment.Amount > 0m
                && payment.Amount <= SettlementConstraints.MoneyAmountMaxValue
                && payment.SettlementRequest.Amount > 0m
                && payment.SettlementRequest.Amount <= SettlementConstraints.MoneyAmountMaxValue
                && payment.Currency == payment.SettlementRequest.Currency
                && VisiblePaymentStatuses.Contains(payment.Status)
                && VisibleRequestStatuses.Contains(payment.SettlementRequest.Status)
                && (payment.SettlementRequest.DebtorUserProfileId == actorUserProfileId
                    || payment.SettlementRequest.CreditorUserProfileId == actorUserProfileId
                    || payment.SettlementRequest.RequestedByUserProfileId == actorUserProfileId)
                && (payment.SettlementRequest.GroupId == null
                    || (payment.SettlementRequest.GroupId != null
                        && payment.SettlementRequest.Group != null
                        && payment.SettlementRequest.Group.DeletedAtUtc == null
                        && payment.SettlementRequest.DebtorUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == payment.SettlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && payment.SettlementRequest.CreditorUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == payment.SettlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && payment.SettlementRequest.RequestedByUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == payment.SettlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && dbContext.Set<GroupMembership>().Any(membership =>
                            membership.GroupId == payment.SettlementRequest.GroupId.Value
                            && membership.UserProfileId == actorUserProfileId
                            && membership.Status == GroupMembershipStatuses.Active))))
            .Select(payment => new SettlementPaymentProofContext(
                payment.SettlementRequestId,
                payment.Id,
                payment.SettlementRequest.SourceExpenseBillId!.Value,
                payment.SettlementRequest.GroupId,
                payment.SettlementRequest.DebtorUserProfileId,
                payment.SettlementRequest.CreditorUserProfileId,
                payment.PaidByUserProfileId,
                payment.ReceivedByUserProfileId,
                payment.CreatedByUserProfileId,
                payment.SettlementRequest.Status,
                payment.Status,
                payment.Amount,
                payment.SettlementRequest.Payments
                    .Where(candidate => ActivePaymentStatuses.Contains(candidate.Status))
                    .Sum(candidate => candidate.Amount),
                payment.SettlementRequest.Amount,
                payment.Currency,
                payment.PaymentDate))
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static ValueTask WriteProofAuditAsync(
        ISettlementPaymentAuditWriter auditWriter,
        Guid actorAuthAccountId,
        SettlementPaymentProofContext paymentContext,
        string action,
        string actionCategory,
        Guid fileObjectId,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        return auditWriter.WriteAsync(
            new SettlementPaymentAuditEvent(
                SettlementProofWorkflowName,
                action,
                actorAuthAccountId,
                actorAuthAccountId,
                paymentContext.SettlementRequestId,
                paymentContext.SettlementPaymentId,
                paymentContext.SourceExpenseBillId,
                paymentContext.GroupId,
                paymentContext.GroupId.HasValue
                    ? SettlementRuntimePolicy.GroupMode
                    : SettlementRuntimePolicy.PersonalGroupMode,
                paymentContext.DebtorUserProfileId,
                paymentContext.CreditorUserProfileId,
                paymentContext.RequestStatus,
                paymentContext.RequestStatus,
                paymentContext.PaymentStatus,
                paymentContext.PaymentAmount,
                paymentContext.ActivePaymentCoverageAmount,
                paymentContext.RequestAmount,
                paymentContext.Currency,
                paymentContext.PaymentDate,
                occurredAtUtc,
                fileObjectId,
                actionCategory),
            cancellationToken);
    }

    private static bool CanMutateProof(
        SettlementPaymentProofContext paymentContext,
        Guid actorUserProfileId)
    {
        return paymentContext.PaidByUserProfileId == actorUserProfileId
            && paymentContext.CreatedByUserProfileId == actorUserProfileId
            && paymentContext.PaidByUserProfileId == paymentContext.DebtorUserProfileId
            && paymentContext.ReceivedByUserProfileId == paymentContext.CreditorUserProfileId;
    }

    private static bool CanChangeProofInCurrentState(SettlementPaymentProofContext paymentContext)
    {
        return paymentContext.PaymentStatus == SettlementPaymentStatuses.MarkedPaid
            && MutableRequestStatuses.Contains(paymentContext.RequestStatus);
    }

    private static string? NormalizeSettlementProofContentType(string? contentType)
    {
        if (contentType is null)
        {
            return null;
        }

        return SupportedSettlementProofContentTypes.TryGetValue(contentType.Trim(), out var normalized)
            ? normalized
            : null;
    }

    private static bool HasExpectedSettlementProofSignature(string contentType, byte[] bytes)
    {
        return contentType switch
        {
            "image/png" => bytes is [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ..],
            "image/jpeg" => bytes is [0xFF, 0xD8, 0xFF, ..],
            "image/webp" => bytes.Length >= 12
                && bytes[0] == 0x52
                && bytes[1] == 0x49
                && bytes[2] == 0x46
                && bytes[3] == 0x46
                && bytes[8] == 0x57
                && bytes[9] == 0x45
                && bytes[10] == 0x42
                && bytes[11] == 0x50,
            "application/pdf" => bytes is [0x25, 0x50, 0x44, 0x46, 0x2D, ..],
            _ => false
        };
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : SettlementPaymentUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult SettlementPaymentUnavailable()
    {
        return Results.Problem(
            title: SettlementPaymentUnavailableTitle,
            detail: SettlementPaymentUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidSettlementProofUpload(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidSettlementProofUploadTitle,
            detail: InvalidSettlementProofUploadDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult SettlementProofConflict()
    {
        return Results.Problem(
            title: SettlementProofConflictTitle,
            detail: SettlementProofConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult SettlementProofUploadFailed()
    {
        return Results.Problem(
            title: SettlementProofUploadFailedTitle,
            detail: SettlementProofUploadFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static IResult SettlementProofRemoveFailed()
    {
        return Results.Problem(
            title: SettlementProofRemoveFailedTitle,
            detail: SettlementProofRemoveFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static IResult SettlementProofAccessFailed()
    {
        return Results.Problem(
            title: SettlementProofAccessFailedTitle,
            detail: SettlementProofAccessFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private sealed record SettlementProofUpload(
        string ContentType,
        byte[] Bytes,
        string Sha256Hash);

    private sealed class SettlementProofUploadReadResult
    {
        private SettlementProofUploadReadResult(
            SettlementProofUpload? upload,
            IDictionary<string, string[]> errors)
        {
            Upload = upload;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public SettlementProofUpload? Upload { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static SettlementProofUploadReadResult Valid(SettlementProofUpload upload)
        {
            return new SettlementProofUploadReadResult(
                upload,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static SettlementProofUploadReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new SettlementProofUploadReadResult(null, errors);
        }
    }

    private sealed record SettlementPaymentProofContext(
        Guid SettlementRequestId,
        Guid SettlementPaymentId,
        Guid SourceExpenseBillId,
        Guid? GroupId,
        Guid DebtorUserProfileId,
        Guid CreditorUserProfileId,
        Guid PaidByUserProfileId,
        Guid ReceivedByUserProfileId,
        Guid CreatedByUserProfileId,
        string RequestStatus,
        string PaymentStatus,
        decimal PaymentAmount,
        decimal ActivePaymentCoverageAmount,
        decimal RequestAmount,
        string Currency,
        DateOnly PaymentDate);
}
