using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.RequestValidation;
using Settleora.Api.Storage;

namespace Settleora.Api.Users.PaymentDetails;

internal static partial class SelfPaymentDetailsEndpoints
{
    private const long PaymentQrMaxSizeBytes = 2 * 1024 * 1024;
    private const string PaymentQrAttachedAction = "payment_details.qr_attached";
    private const string PaymentQrReplacedAction = "payment_details.qr_replaced";
    private const string PaymentQrRemovedAction = "payment_details.qr_removed";
    private const string InvalidPaymentQrUploadTitle = "Invalid payment QR upload";
    private const string InvalidPaymentQrUploadDetail = "The submitted payment QR upload is invalid.";
    private const string InvalidPaymentQrReadTitle = "Invalid payment QR read";
    private const string InvalidPaymentQrReadDetail = "The submitted payment QR read request is invalid.";
    private const string PaymentQrReadBodyMessage = "Payment QR read requests do not accept a request body.";
    private const string PaymentQrUploadFailedTitle = "Payment QR upload failed";
    private const string PaymentQrUploadFailedDetail = "Unable to complete payment QR upload.";
    private const string PaymentQrRemoveFailedTitle = "Payment QR remove failed";
    private const string PaymentQrRemoveFailedDetail = "Unable to complete payment QR removal.";

    private static readonly IReadOnlyDictionary<string, string> SupportedPaymentQrContentTypes =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["image/png"] = "image/png",
            ["image/jpeg"] = "image/jpeg",
            ["image/webp"] = "image/webp"
        };

    private static void MapSelfPaymentDetailsQrEndpoints(WebApplication app)
    {
        app.MapPost("/api/v1/users/me/payment-details/qr", AttachSelfPaymentQrAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        app.MapDelete("/api/v1/users/me/payment-details/qr", RemoveSelfPaymentQrAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        app.MapGet("/api/v1/users/me/payment-details/qr/content", GetSelfPaymentQrContentAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
    }

    private static async Task<IResult> AttachSelfPaymentQrAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IPaymentDetailsAuditWriter auditWriter,
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

        if (UnsupportedRequestFieldGuards.TryRejectQueryFields(
            request,
            InvalidPaymentQrUploadTitle,
            InvalidPaymentQrUploadDetail,
            out var queryRejection))
        {
            return queryRejection;
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var uploadReadResult = await ReadPaymentQrUploadAsync(request, cancellationToken);
        if (!uploadReadResult.Succeeded || uploadReadResult.Upload is null)
        {
            return InvalidPaymentQrUpload(uploadReadResult.Errors);
        }

        var upload = uploadReadResult.Upload;
        var createResult = await fileObjectLifecycleService.CreatePendingAsync(
            new CreateFileObjectPendingRequest(
                actor.AuthAccountId,
                actor.UserProfileId,
                actor.UserProfileId,
                FileObjectPurposes.PaymentQr,
                upload.ContentType,
                upload.Bytes.LongLength,
                OriginalFilename: null,
                Sha256Hash: upload.Sha256Hash,
                EncryptionMode: FileObjectEncryptionModes.ServerManaged),
            cancellationToken);
        if (!createResult.Succeeded || createResult.FileObject is null)
        {
            return PaymentQrUploadFailed();
        }

        var fileObject = await dbContext.Set<FileObject>()
            .SingleAsync(fileObject => fileObject.Id == createResult.FileObject.Id, cancellationToken);

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
            return PaymentQrUploadFailed();
        }

        var activeResult = await fileObjectLifecycleService.MarkActiveAsync(
            new CompleteFileObjectUploadRequest(
                actor.AuthAccountId,
                actor.UserProfileId,
                createResult.FileObject.Id),
            cancellationToken);
        if (!activeResult.Succeeded || activeResult.FileObject is null)
        {
            return PaymentQrUploadFailed();
        }

        var now = timeProvider.GetUtcNow();
        var paymentProfile = await LoadActivePaymentProfileAsync(
            dbContext,
            actor.UserProfileId,
            trackChanges: true,
            cancellationToken);
        var isCreated = paymentProfile is null;
        var previousQrFileObjectId = paymentProfile?.QrFileObjectId;

        if (paymentProfile is null)
        {
            paymentProfile = new UserPaymentProfile
            {
                Id = Guid.NewGuid(),
                UserProfileId = actor.UserProfileId,
                Visibility = UserPaymentProfileVisibilities.Default,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            dbContext.Set<UserPaymentProfile>().Add(paymentProfile);
        }

        paymentProfile.QrFileObjectId = activeResult.FileObject.Id;
        paymentProfile.UpdatedAtUtc = now;

        var action = previousQrFileObjectId is null
            ? PaymentQrAttachedAction
            : PaymentQrReplacedAction;
        await auditWriter.WriteAsync(
            new PaymentDetailsAuditEvent(
                action,
                actor.AuthAccountId,
                actor.AuthAccountId,
                paymentProfile.Id,
                isCreated,
                ["qr_file"],
                PreviousVisibility: null,
                NewVisibility: null,
                OccurredAtUtc: now,
                QrFileObjectId: activeResult.FileObject.Id,
                ChangeCategory: previousQrFileObjectId is null ? "qr_attached" : "qr_replaced"),
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
            return PaymentQrUploadFailed();
        }

        if (previousQrFileObjectId is { } previousFileObjectId
            && previousFileObjectId != activeResult.FileObject.Id)
        {
            await fileObjectLifecycleService.MarkDeletedAsync(
                new DeleteFileObjectRequest(
                    actor.AuthAccountId,
                    actor.UserProfileId,
                    previousFileObjectId),
                cancellationToken);
        }

        var updatedPaymentProfile = await LoadActivePaymentProfileAsync(
            dbContext,
            actor.UserProfileId,
            trackChanges: false,
            cancellationToken);
        return Results.Ok(MapResponse(updatedPaymentProfile));
    }

    private static async Task<IResult> RemoveSelfPaymentQrAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IPaymentDetailsAuditWriter auditWriter,
        IFileObjectLifecycleService fileObjectLifecycleService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (UnsupportedRequestFieldGuards.TryRejectQueryFields(
            request,
            InvalidPaymentQrUploadTitle,
            InvalidPaymentQrUploadDetail,
            out var queryRejection))
        {
            return queryRejection;
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var paymentProfile = await LoadActivePaymentProfileAsync(
            dbContext,
            actor.UserProfileId,
            trackChanges: true,
            cancellationToken);
        if (paymentProfile?.QrFileObjectId is not { } qrFileObjectId)
        {
            return Results.NoContent();
        }

        var now = timeProvider.GetUtcNow();
        paymentProfile.QrFileObjectId = null;
        paymentProfile.UpdatedAtUtc = now;

        await auditWriter.WriteAsync(
            new PaymentDetailsAuditEvent(
                PaymentQrRemovedAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                paymentProfile.Id,
                RowCreated: false,
                ["qr_file"],
                PreviousVisibility: null,
                NewVisibility: null,
                OccurredAtUtc: now,
                QrFileObjectId: qrFileObjectId,
                ChangeCategory: "qr_removed"),
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return PaymentQrRemoveFailed();
        }

        await fileObjectLifecycleService.MarkDeletedAsync(
            new DeleteFileObjectRequest(
                actor.AuthAccountId,
                actor.UserProfileId,
                qrFileObjectId),
            cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> GetSelfPaymentQrContentAsync(
        HttpRequest request,
        HttpResponse response,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IFileObjectStorageProvider storageProvider,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (TryRejectPaymentQrReadEnvelope(request, out var readEnvelopeRejection))
        {
            return readEnvelopeRejection;
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

        var paymentProfile = await LoadActivePaymentProfileAsync(
            dbContext,
            actor.UserProfileId,
            trackChanges: false,
            cancellationToken);
        var fileObject = paymentProfile?.QrFileObject;
        if (paymentProfile?.QrFileObjectId is null
            || !IsReadablePaymentQrFile(fileObject, actor.UserProfileId))
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

        response.Headers["X-Content-Type-Options"] = "nosniff";
        response.Headers["Content-Disposition"] = "attachment";
        return Results.File(content, fileObject!.ContentType);
    }

    private static bool IsReadablePaymentQrFile(FileObject? fileObject, Guid actorUserProfileId)
    {
        return fileObject is not null
            && fileObject.DeletedAtUtc is null
            && fileObject.OwnerUserProfileId == actorUserProfileId
            && fileObject.CreatedByUserProfileId == actorUserProfileId
            && StringComparer.Ordinal.Equals(fileObject.Purpose, FileObjectPurposes.PaymentQr)
            && StringComparer.Ordinal.Equals(fileObject.Status, FileObjectStatuses.Active)
            && SupportedPaymentQrContentTypes.ContainsKey(fileObject.ContentType);
    }

    private static bool TryRejectPaymentQrReadEnvelope(HttpRequest request, out IResult result)
    {
        return UnsupportedRequestFieldGuards.TryRejectNoBodyReadEnvelope(
            request,
            InvalidPaymentQrReadTitle,
            InvalidPaymentQrReadDetail,
            PaymentQrReadBodyMessage,
            out result);
    }

    private static async Task<PaymentQrUploadReadResult> ReadPaymentQrUploadAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (!request.HasFormContentType)
        {
            errors["form"] = ["A multipart form with one file field is required."];
            return PaymentQrUploadReadResult.Invalid(errors);
        }

        IFormCollection form;
        try
        {
            form = await request.ReadFormAsync(cancellationToken);
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            errors["form"] = ["A multipart form with one file field is required."];
            return PaymentQrUploadReadResult.Invalid(errors);
        }

        if (form.Count != 0 || form.Files.Count != 1 || form.Files[0].Name != "file")
        {
            errors["form"] = ["A multipart form with one file field is required."];
            return PaymentQrUploadReadResult.Invalid(errors);
        }

        var file = form.Files[0];
        if (file.Length <= 0)
        {
            errors["file"] = ["A non-empty QR image file is required."];
            return PaymentQrUploadReadResult.Invalid(errors);
        }

        if (file.Length > PaymentQrMaxSizeBytes)
        {
            errors["file"] = ["The QR image file is too large."];
            return PaymentQrUploadReadResult.Invalid(errors);
        }

        var contentType = NormalizePaymentQrContentType(file.ContentType);
        if (contentType is null)
        {
            errors["file"] = ["The QR image file type is not supported."];
            return PaymentQrUploadReadResult.Invalid(errors);
        }

        byte[] bytes;
        await using (var content = file.OpenReadStream())
        await using (var buffer = new MemoryStream((int)file.Length))
        {
            await content.CopyToAsync(buffer, cancellationToken);
            bytes = buffer.ToArray();
        }

        if (!HasExpectedPaymentQrSignature(contentType, bytes))
        {
            errors["file"] = ["The QR image file type is not supported."];
            return PaymentQrUploadReadResult.Invalid(errors);
        }

        return PaymentQrUploadReadResult.Valid(
            new PaymentQrUpload(
                contentType,
                bytes,
                Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant()));
    }

    private static string? NormalizePaymentQrContentType(string? contentType)
    {
        if (contentType is null)
        {
            return null;
        }

        return SupportedPaymentQrContentTypes.TryGetValue(contentType.Trim(), out var normalized)
            ? normalized
            : null;
    }

    private static bool HasExpectedPaymentQrSignature(string contentType, byte[] bytes)
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
            _ => false
        };
    }

    private static IResult InvalidPaymentQrUpload(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidPaymentQrUploadTitle,
            detail: InvalidPaymentQrUploadDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult PaymentQrUploadFailed()
    {
        return Results.Problem(
            title: PaymentQrUploadFailedTitle,
            detail: PaymentQrUploadFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static IResult PaymentQrRemoveFailed()
    {
        return Results.Problem(
            title: PaymentQrRemoveFailedTitle,
            detail: PaymentQrRemoveFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private sealed record PaymentQrUpload(
        string ContentType,
        byte[] Bytes,
        string Sha256Hash);

    private sealed class PaymentQrUploadReadResult
    {
        private PaymentQrUploadReadResult(
            PaymentQrUpload? upload,
            IDictionary<string, string[]> errors)
        {
            Upload = upload;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public PaymentQrUpload? Upload { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static PaymentQrUploadReadResult Valid(PaymentQrUpload upload)
        {
            return new PaymentQrUploadReadResult(
                upload,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static PaymentQrUploadReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new PaymentQrUploadReadResult(null, errors);
        }
    }
}
