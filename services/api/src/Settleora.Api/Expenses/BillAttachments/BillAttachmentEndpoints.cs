using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Storage;

namespace Settleora.Api.Expenses.BillAttachments;

internal static class BillAttachmentEndpoints
{
    private const long BillAttachmentMaxSizeBytes = 5 * 1024 * 1024;
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string BillUnavailableTitle = "Bill unavailable";
    private const string BillUnavailableDetail = "The requested bill is unavailable.";
    private const string InvalidBillAttachmentUploadTitle = "Invalid bill attachment upload";
    private const string InvalidBillAttachmentUploadDetail = "The submitted bill attachment upload is invalid.";
    private const string BillAttachmentConflictTitle = "Bill attachment conflict";
    private const string BillAttachmentConflictDetail = "The bill attachment cannot be changed for the current bill state.";
    private const string BillAttachmentUploadFailedTitle = "Bill attachment upload failed";
    private const string BillAttachmentUploadFailedDetail = "Unable to complete bill attachment upload.";
    private const string BillAttachmentRemoveFailedTitle = "Bill attachment remove failed";
    private const string BillAttachmentRemoveFailedDetail = "Unable to complete bill attachment removal.";
    private const string BillAttachmentAccessFailedTitle = "Bill attachment access failed";
    private const string BillAttachmentAccessFailedDetail = "Unable to complete bill attachment access.";
    private const string PersonalGroupMode = "personal";
    private const string GroupMode = "group";
    private const string AttachmentAttachedAction = "bill_attachment.attached";
    private const string AttachmentRemovedAction = "bill_attachment.removed";
    private const string AttachmentReadAction = "bill_attachment.content_read";

    private static readonly string[] VisibleBillStatuses =
    [
        ExpenseBillStatuses.Draft,
        ExpenseBillStatuses.PendingConfirmation,
        ExpenseBillStatuses.Confirmed,
        ExpenseBillStatuses.Rejected,
        ExpenseBillStatuses.Finalized
    ];

    private static readonly string[] MutableBillStatuses =
    [
        ExpenseBillStatuses.Draft,
        ExpenseBillStatuses.PendingConfirmation,
        ExpenseBillStatuses.Confirmed,
        ExpenseBillStatuses.Rejected
    ];

    private static readonly string[] SupportedReceiptContentTypeValues =
    [
        "image/png",
        "image/jpeg",
        "image/webp"
    ];

    private static readonly string[] SupportedSupportingContentTypeValues =
    [
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/pdf"
    ];

    private static readonly IReadOnlyDictionary<string, string> SupportedBillAttachmentContentTypes =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["image/png"] = "image/png",
            ["image/jpeg"] = "image/jpeg",
            ["image/webp"] = "image/webp",
            ["application/pdf"] = "application/pdf"
        };

    private static readonly HashSet<string> AllowedAttachmentFormFields =
    [
        "purpose"
    ];

    public static WebApplication MapBillAttachmentEndpoints(this WebApplication app)
    {
        var bills = app.MapGroup("/api/v1/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        bills.MapPost("/{billId:guid}/attachments", AttachPersonalBillAttachmentAsync);
        bills.MapGet("/{billId:guid}/attachments", ListPersonalBillAttachmentsAsync);
        bills.MapGet("/{billId:guid}/attachments/{fileId:guid}/content", GetPersonalBillAttachmentContentAsync);
        bills.MapDelete("/{billId:guid}/attachments/{fileId:guid}", RemovePersonalBillAttachmentAsync);

        var groupBills = app.MapGroup("/api/v1/groups/{groupId:guid}/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        groupBills.MapPost("/{billId:guid}/attachments", AttachGroupBillAttachmentAsync);
        groupBills.MapGet("/{billId:guid}/attachments", ListGroupBillAttachmentsAsync);
        groupBills.MapGet("/{billId:guid}/attachments/{fileId:guid}/content", GetGroupBillAttachmentContentAsync);
        groupBills.MapDelete("/{billId:guid}/attachments/{fileId:guid}", RemoveGroupBillAttachmentAsync);

        return app;
    }

    private static Task<IResult> AttachPersonalBillAttachmentAsync(
        Guid billId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillAttachmentAuditWriter auditWriter,
        IFileObjectLifecycleService fileObjectLifecycleService,
        IFileObjectStorageProvider storageProvider,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return AttachBillAttachmentAsync(
            routeGroupId: null,
            billId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            fileObjectLifecycleService,
            storageProvider,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static Task<IResult> AttachGroupBillAttachmentAsync(
        Guid groupId,
        Guid billId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillAttachmentAuditWriter auditWriter,
        IFileObjectLifecycleService fileObjectLifecycleService,
        IFileObjectStorageProvider storageProvider,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return AttachBillAttachmentAsync(
            groupId,
            billId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            fileObjectLifecycleService,
            storageProvider,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static async Task<IResult> AttachBillAttachmentAsync(
        Guid? routeGroupId,
        Guid billId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillAttachmentAuditWriter auditWriter,
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

        var scopeAuthorizationResult = await AuthorizeScopeAsync(
            businessAuthorizationService,
            actor.UserProfileId,
            routeGroupId,
            cancellationToken);
        if (!scopeAuthorizationResult.Allowed)
        {
            return MapAuthorizationFailure(scopeAuthorizationResult);
        }

        var uploadReadResult = await ReadBillAttachmentUploadAsync(request, cancellationToken);
        if (!uploadReadResult.Succeeded || uploadReadResult.Upload is null)
        {
            return InvalidBillAttachmentUpload(uploadReadResult.Errors);
        }

        var billContext = await LoadVisibleBillContextAsync(
            dbContext,
            routeGroupId,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (billContext is null)
        {
            return BillUnavailable();
        }

        if (!CanMutateAttachments(billContext, actor.UserProfileId))
        {
            return BillUnavailable();
        }

        if (!CanChangeAttachmentsInCurrentState(billContext))
        {
            return BillAttachmentConflict();
        }

        var upload = uploadReadResult.Upload;
        var createResult = await fileObjectLifecycleService.CreatePendingAsync(
            new CreateFileObjectPendingRequest(
                actor.AuthAccountId,
                actor.UserProfileId,
                actor.UserProfileId,
                upload.FileObjectPurpose,
                upload.ContentType,
                upload.Bytes.LongLength,
                OriginalFilename: null,
                Sha256Hash: upload.Sha256Hash,
                EncryptionMode: FileObjectEncryptionModes.ServerManaged),
            cancellationToken);
        if (!createResult.Succeeded || createResult.FileObject is null)
        {
            return BillAttachmentUploadFailed();
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
            return BillAttachmentUploadFailed();
        }

        var activeResult = await fileObjectLifecycleService.MarkActiveAsync(
            new CompleteFileObjectUploadRequest(
                actor.AuthAccountId,
                actor.UserProfileId,
                createResult.FileObject.Id),
            cancellationToken);
        if (!activeResult.Succeeded || activeResult.FileObject is null)
        {
            await fileObjectLifecycleService.MarkUploadFailedAsync(
                new FailFileObjectUploadRequest(
                    actor.AuthAccountId,
                    actor.UserProfileId,
                    createResult.FileObject.Id),
                cancellationToken);
            return BillAttachmentUploadFailed();
        }

        var now = timeProvider.GetUtcNow();
        var attachment = new ExpenseBillAttachment
        {
            ExpenseBillId = billContext.BillId,
            FileObjectId = activeResult.FileObject.Id,
            Purpose = upload.AttachmentPurpose,
            CreatedByUserProfileId = actor.UserProfileId,
            CreatedAtUtc = now,
            RemovedAtUtc = null
        };
        dbContext.Set<ExpenseBillAttachment>().Add(attachment);

        await WriteAttachmentAuditAsync(
            auditWriter,
            actor.AuthAccountId,
            billContext,
            AttachmentAttachedAction,
            "attachment_attached",
            activeResult.FileObject.Id,
            upload.AttachmentPurpose,
            upload.FileObjectPurpose,
            upload.ContentType,
            upload.Bytes.LongLength,
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
            return BillAttachmentUploadFailed();
        }

        var savedAttachment = await LoadReadableAttachmentQuery(
                dbContext,
                billContext,
                activeResult.FileObject.Id)
            .SingleAsync(cancellationToken);
        return Results.Created(
            CreateAttachmentContentPath(billContext, activeResult.FileObject.Id),
            BillAttachmentResponse.From(savedAttachment));
    }

    private static Task<IResult> ListPersonalBillAttachmentsAsync(
        Guid billId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        return ListBillAttachmentsAsync(
            routeGroupId: null,
            billId,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            cancellationToken);
    }

    private static Task<IResult> ListGroupBillAttachmentsAsync(
        Guid groupId,
        Guid billId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        return ListBillAttachmentsAsync(
            groupId,
            billId,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            cancellationToken);
    }

    private static async Task<IResult> ListBillAttachmentsAsync(
        Guid? routeGroupId,
        Guid billId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var scopeAuthorizationResult = await AuthorizeScopeAsync(
            businessAuthorizationService,
            actor.UserProfileId,
            routeGroupId,
            cancellationToken);
        if (!scopeAuthorizationResult.Allowed)
        {
            return MapAuthorizationFailure(scopeAuthorizationResult);
        }

        var billContext = await LoadVisibleBillContextAsync(
            dbContext,
            routeGroupId,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (billContext is null)
        {
            return BillUnavailable();
        }

        var attachments = await LoadReadableAttachmentsQuery(dbContext, billContext)
            .OrderByDescending(attachment => attachment.CreatedAtUtc)
            .ThenByDescending(attachment => attachment.FileObject.UpdatedAtUtc)
            .ThenBy(attachment => attachment.FileObjectId)
            .ToArrayAsync(cancellationToken);

        return Results.Ok(new BillAttachmentListResponse(
            attachments.Select(BillAttachmentResponse.From).ToArray()));
    }

    private static Task<IResult> GetPersonalBillAttachmentContentAsync(
        Guid billId,
        Guid fileId,
        HttpResponse response,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillAttachmentAuditWriter auditWriter,
        IFileObjectStorageProvider storageProvider,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return GetBillAttachmentContentAsync(
            routeGroupId: null,
            billId,
            fileId,
            response,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            storageProvider,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static Task<IResult> GetGroupBillAttachmentContentAsync(
        Guid groupId,
        Guid billId,
        Guid fileId,
        HttpResponse response,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillAttachmentAuditWriter auditWriter,
        IFileObjectStorageProvider storageProvider,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return GetBillAttachmentContentAsync(
            groupId,
            billId,
            fileId,
            response,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            storageProvider,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static async Task<IResult> GetBillAttachmentContentAsync(
        Guid? routeGroupId,
        Guid billId,
        Guid fileId,
        HttpResponse response,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillAttachmentAuditWriter auditWriter,
        IFileObjectStorageProvider storageProvider,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var scopeAuthorizationResult = await AuthorizeScopeAsync(
            businessAuthorizationService,
            actor.UserProfileId,
            routeGroupId,
            cancellationToken);
        if (!scopeAuthorizationResult.Allowed)
        {
            return MapAuthorizationFailure(scopeAuthorizationResult);
        }

        var billContext = await LoadVisibleBillContextAsync(
            dbContext,
            routeGroupId,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (billContext is null)
        {
            return BillUnavailable();
        }

        var attachment = await LoadReadableAttachmentQuery(dbContext, billContext, fileId)
            .SingleOrDefaultAsync(cancellationToken);
        if (attachment is null)
        {
            return BillUnavailable();
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
            return BillUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        await WriteAttachmentAuditAsync(
            auditWriter,
            actor.AuthAccountId,
            billContext,
            AttachmentReadAction,
            "attachment_content_read",
            attachment.FileObjectId,
            attachment.Purpose,
            attachment.FileObject.Purpose,
            attachment.FileObject.ContentType,
            attachment.FileObject.SizeBytes,
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
            return BillAttachmentAccessFailed();
        }

        response.Headers["X-Content-Type-Options"] = "nosniff";
        response.Headers["Content-Disposition"] = "attachment";
        return Results.File(content, attachment.FileObject.ContentType);
    }

    private static Task<IResult> RemovePersonalBillAttachmentAsync(
        Guid billId,
        Guid fileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillAttachmentAuditWriter auditWriter,
        IFileObjectLifecycleService fileObjectLifecycleService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return RemoveBillAttachmentAsync(
            routeGroupId: null,
            billId,
            fileId,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            fileObjectLifecycleService,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static Task<IResult> RemoveGroupBillAttachmentAsync(
        Guid groupId,
        Guid billId,
        Guid fileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillAttachmentAuditWriter auditWriter,
        IFileObjectLifecycleService fileObjectLifecycleService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        return RemoveBillAttachmentAsync(
            groupId,
            billId,
            fileId,
            currentActorAccessor,
            businessAuthorizationService,
            auditWriter,
            fileObjectLifecycleService,
            dbContext,
            timeProvider,
            cancellationToken);
    }

    private static async Task<IResult> RemoveBillAttachmentAsync(
        Guid? routeGroupId,
        Guid billId,
        Guid fileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IExpenseBillAttachmentAuditWriter auditWriter,
        IFileObjectLifecycleService fileObjectLifecycleService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var scopeAuthorizationResult = await AuthorizeScopeAsync(
            businessAuthorizationService,
            actor.UserProfileId,
            routeGroupId,
            cancellationToken);
        if (!scopeAuthorizationResult.Allowed)
        {
            return MapAuthorizationFailure(scopeAuthorizationResult);
        }

        var billContext = await LoadVisibleBillContextAsync(
            dbContext,
            routeGroupId,
            billId,
            actor.UserProfileId,
            cancellationToken);
        if (billContext is null)
        {
            return BillUnavailable();
        }

        if (!CanMutateAttachments(billContext, actor.UserProfileId))
        {
            return BillUnavailable();
        }

        if (!CanChangeAttachmentsInCurrentState(billContext))
        {
            return BillAttachmentConflict();
        }

        var attachment = await LoadReadableAttachmentQuery(dbContext, billContext, fileId, trackChanges: true)
            .Where(candidate => candidate.CreatedByUserProfileId == actor.UserProfileId
                && candidate.FileObject.OwnerUserProfileId == actor.UserProfileId
                && candidate.FileObject.CreatedByUserProfileId == actor.UserProfileId)
            .SingleOrDefaultAsync(cancellationToken);
        if (attachment is null)
        {
            return BillUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        attachment.RemovedAtUtc = now;

        await WriteAttachmentAuditAsync(
            auditWriter,
            actor.AuthAccountId,
            billContext,
            AttachmentRemovedAction,
            "attachment_removed",
            attachment.FileObjectId,
            attachment.Purpose,
            attachment.FileObject.Purpose,
            attachment.FileObject.ContentType,
            attachment.FileObject.SizeBytes,
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
            return BillAttachmentRemoveFailed();
        }

        return Results.NoContent();
    }

    private static async Task<BillAttachmentUploadReadResult> ReadBillAttachmentUploadAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (!request.HasFormContentType)
        {
            errors["form"] = ["A multipart form with one file field and one purpose field is required."];
            return BillAttachmentUploadReadResult.Invalid(errors);
        }

        IFormCollection form;
        try
        {
            form = await request.ReadFormAsync(cancellationToken);
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            errors["form"] = ["A multipart form with one file field and one purpose field is required."];
            return BillAttachmentUploadReadResult.Invalid(errors);
        }

        foreach (var fieldName in form.Keys)
        {
            if (!AllowedAttachmentFormFields.Contains(fieldName))
            {
                errors[fieldName] = ["Field is not supported for bill attachment upload."];
            }
        }

        if (!form.TryGetValue("purpose", out var purposeValues)
            || purposeValues.Count != 1)
        {
            errors["purpose"] = ["A single attachment purpose field is required."];
        }

        if (form.Files.Count != 1 || form.Files[0].Name != "file")
        {
            errors["file"] = ["A single bill attachment file field is required."];
        }

        if (errors.Count > 0)
        {
            return BillAttachmentUploadReadResult.Invalid(errors);
        }

        var attachmentPurpose = NormalizeAttachmentPurpose(purposeValues[0]);
        if (attachmentPurpose is null)
        {
            errors["purpose"] = ["Attachment purpose is not supported."];
            return BillAttachmentUploadReadResult.Invalid(errors);
        }

        var file = form.Files[0];
        if (file.Length <= 0)
        {
            errors["file"] = ["A non-empty bill attachment file is required."];
            return BillAttachmentUploadReadResult.Invalid(errors);
        }

        if (file.Length > BillAttachmentMaxSizeBytes)
        {
            errors["file"] = ["The bill attachment file is too large."];
            return BillAttachmentUploadReadResult.Invalid(errors);
        }

        var contentType = NormalizeBillAttachmentContentType(file.ContentType);
        if (contentType is null || !IsContentTypeAllowedForPurpose(attachmentPurpose, contentType))
        {
            errors["file"] = ["The bill attachment file type is not supported."];
            return BillAttachmentUploadReadResult.Invalid(errors);
        }

        byte[] bytes;
        await using (var content = file.OpenReadStream())
        await using (var buffer = new MemoryStream((int)file.Length))
        {
            await content.CopyToAsync(buffer, cancellationToken);
            bytes = buffer.ToArray();
        }

        if (!HasExpectedBillAttachmentSignature(contentType, bytes))
        {
            errors["file"] = ["The bill attachment file type is not supported."];
            return BillAttachmentUploadReadResult.Invalid(errors);
        }

        return BillAttachmentUploadReadResult.Valid(
            new BillAttachmentUpload(
                attachmentPurpose,
                MapFileObjectPurpose(attachmentPurpose),
                contentType,
                bytes,
                Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant()));
    }

    private static async Task<BusinessAuthorizationResult> AuthorizeScopeAsync(
        IBusinessAuthorizationService businessAuthorizationService,
        Guid actorUserProfileId,
        Guid? routeGroupId,
        CancellationToken cancellationToken)
    {
        return routeGroupId.HasValue
            ? await businessAuthorizationService.CanAccessGroupAsync(routeGroupId.Value, cancellationToken)
            : await businessAuthorizationService.CanAccessProfileAsync(actorUserProfileId, cancellationToken);
    }

    private static IQueryable<ExpenseBillAttachment> LoadReadableAttachmentsQuery(
        SettleoraDbContext dbContext,
        BillAttachmentContext billContext,
        bool trackChanges = false)
    {
        var query = dbContext.Set<ExpenseBillAttachment>()
            .Include(attachment => attachment.FileObject)
            .Where(attachment => attachment.ExpenseBillId == billContext.BillId
                && attachment.RemovedAtUtc == null
                && attachment.CreatedByUserProfile.DeletedAtUtc == null
                && attachment.FileObject.DeletedAtUtc == null
                && attachment.FileObject.OwnerUserProfileId == attachment.CreatedByUserProfileId
                && attachment.FileObject.CreatedByUserProfileId == attachment.CreatedByUserProfileId
                && attachment.FileObject.Status == FileObjectStatuses.Active
                && ((attachment.Purpose == ExpenseBillAttachmentPurposes.Receipt
                        && attachment.FileObject.Purpose == FileObjectPurposes.ReceiptImage
                        && SupportedReceiptContentTypeValues.Contains(attachment.FileObject.ContentType))
                    || (attachment.Purpose == ExpenseBillAttachmentPurposes.SupportingAttachment
                        && attachment.FileObject.Purpose == FileObjectPurposes.SupportingAttachment
                        && SupportedSupportingContentTypeValues.Contains(attachment.FileObject.ContentType))));

        return trackChanges ? query : query.AsNoTracking();
    }

    private static IQueryable<ExpenseBillAttachment> LoadReadableAttachmentQuery(
        SettleoraDbContext dbContext,
        BillAttachmentContext billContext,
        Guid fileId,
        bool trackChanges = false)
    {
        return LoadReadableAttachmentsQuery(dbContext, billContext, trackChanges)
            .Where(attachment => attachment.FileObjectId == fileId);
    }

    private static async Task<BillAttachmentContext?> LoadVisibleBillContextAsync(
        SettleoraDbContext dbContext,
        Guid? routeGroupId,
        Guid billId,
        Guid actorUserProfileId,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Set<ExpenseBill>().AsNoTracking();
        if (routeGroupId.HasValue)
        {
            query = query.Where(bill => bill.GroupId == routeGroupId.Value
                && bill.Group != null
                && bill.Group.DeletedAtUtc == null
                && dbContext.Set<GroupMembership>().Any(membership =>
                    membership.GroupId == routeGroupId.Value
                    && membership.UserProfileId == actorUserProfileId
                    && membership.Status == GroupMembershipStatuses.Active));
        }
        else
        {
            query = query.Where(bill => bill.GroupId == null);
        }

        return await query
            .Where(bill => bill.Id == billId
                && bill.ArchivedAtUtc == null
                && VisibleBillStatuses.Contains(bill.Status)
                && bill.CreatedByUserProfile.DeletedAtUtc == null
                && bill.BillOwnerUserProfile.DeletedAtUtc == null
                && (bill.CreatedByUserProfileId == actorUserProfileId
                    || bill.BillOwnerUserProfileId == actorUserProfileId
                    || bill.Participants.Any(participant => participant.UserProfileId == actorUserProfileId)
                    || bill.Payers.Any(payer => payer.UserProfileId == actorUserProfileId)))
            .Select(bill => new BillAttachmentContext(
                bill.Id,
                bill.GroupId,
                bill.CreatedByUserProfileId,
                bill.BillOwnerUserProfileId,
                bill.Status))
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static ValueTask WriteAttachmentAuditAsync(
        IExpenseBillAttachmentAuditWriter auditWriter,
        Guid actorAuthAccountId,
        BillAttachmentContext billContext,
        string action,
        string actionCategory,
        Guid fileObjectId,
        string attachmentPurpose,
        string filePurpose,
        string contentType,
        long sizeBytes,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        return auditWriter.WriteAsync(
            new ExpenseBillAttachmentAuditEvent(
                action,
                actorAuthAccountId,
                actorAuthAccountId,
                billContext.BillId,
                billContext.GroupId,
                billContext.GroupId.HasValue ? GroupMode : PersonalGroupMode,
                billContext.BillStatus,
                fileObjectId,
                attachmentPurpose,
                filePurpose,
                contentType,
                sizeBytes,
                actionCategory,
                occurredAtUtc),
            cancellationToken);
    }

    private static bool CanMutateAttachments(
        BillAttachmentContext billContext,
        Guid actorUserProfileId)
    {
        return billContext.CreatedByUserProfileId == actorUserProfileId
            || billContext.BillOwnerUserProfileId == actorUserProfileId;
    }

    private static bool CanChangeAttachmentsInCurrentState(BillAttachmentContext billContext)
    {
        return MutableBillStatuses.Contains(billContext.BillStatus);
    }

    private static string? NormalizeAttachmentPurpose(string? purpose)
    {
        if (purpose is null)
        {
            return null;
        }

        var trimmed = purpose.Trim();
        return ExpenseBillAttachmentPurposes.IsSupported(trimmed)
            ? trimmed
            : null;
    }

    private static string MapFileObjectPurpose(string attachmentPurpose)
    {
        return attachmentPurpose is ExpenseBillAttachmentPurposes.Receipt
            ? FileObjectPurposes.ReceiptImage
            : FileObjectPurposes.SupportingAttachment;
    }

    private static string? NormalizeBillAttachmentContentType(string? contentType)
    {
        if (contentType is null)
        {
            return null;
        }

        return SupportedBillAttachmentContentTypes.TryGetValue(contentType.Trim(), out var normalized)
            ? normalized
            : null;
    }

    private static bool IsContentTypeAllowedForPurpose(string attachmentPurpose, string contentType)
    {
        return attachmentPurpose switch
        {
            ExpenseBillAttachmentPurposes.Receipt => SupportedReceiptContentTypeValues.Contains(contentType),
            ExpenseBillAttachmentPurposes.SupportingAttachment => SupportedSupportingContentTypeValues.Contains(contentType),
            _ => false
        };
    }

    private static bool HasExpectedBillAttachmentSignature(string contentType, byte[] bytes)
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

    private static string CreateAttachmentContentPath(
        BillAttachmentContext billContext,
        Guid fileId)
    {
        return billContext.GroupId.HasValue
            ? $"/api/v1/groups/{billContext.GroupId.Value:D}/bills/{billContext.BillId:D}/attachments/{fileId:D}/content"
            : $"/api/v1/bills/{billContext.BillId:D}/attachments/{fileId:D}/content";
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : BillUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult BillUnavailable()
    {
        return Results.Problem(
            title: BillUnavailableTitle,
            detail: BillUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidBillAttachmentUpload(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidBillAttachmentUploadTitle,
            detail: InvalidBillAttachmentUploadDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult BillAttachmentConflict()
    {
        return Results.Problem(
            title: BillAttachmentConflictTitle,
            detail: BillAttachmentConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult BillAttachmentUploadFailed()
    {
        return Results.Problem(
            title: BillAttachmentUploadFailedTitle,
            detail: BillAttachmentUploadFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static IResult BillAttachmentRemoveFailed()
    {
        return Results.Problem(
            title: BillAttachmentRemoveFailedTitle,
            detail: BillAttachmentRemoveFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static IResult BillAttachmentAccessFailed()
    {
        return Results.Problem(
            title: BillAttachmentAccessFailedTitle,
            detail: BillAttachmentAccessFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private sealed record BillAttachmentUpload(
        string AttachmentPurpose,
        string FileObjectPurpose,
        string ContentType,
        byte[] Bytes,
        string Sha256Hash);

    private sealed class BillAttachmentUploadReadResult
    {
        private BillAttachmentUploadReadResult(
            BillAttachmentUpload? upload,
            IDictionary<string, string[]> errors)
        {
            Upload = upload;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public BillAttachmentUpload? Upload { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static BillAttachmentUploadReadResult Valid(BillAttachmentUpload upload)
        {
            return new BillAttachmentUploadReadResult(
                upload,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static BillAttachmentUploadReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new BillAttachmentUploadReadResult(null, errors);
        }
    }

    private sealed record BillAttachmentContext(
        Guid BillId,
        Guid? GroupId,
        Guid CreatedByUserProfileId,
        Guid BillOwnerUserProfileId,
        string BillStatus);
}
