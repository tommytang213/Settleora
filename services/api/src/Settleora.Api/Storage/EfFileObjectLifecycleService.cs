using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Files;
using Settleora.Api.Persistence;

namespace Settleora.Api.Storage;

internal sealed class EfFileObjectLifecycleService : IFileObjectLifecycleService
{
    private const string UploadStartedAction = "file.upload_started";
    private const string UploadCompletedAction = "file.upload_completed";
    private const string UploadFailedAction = "file.upload_failed";
    private const string DeletedAction = "file.deleted";
    private const string PurgedAction = "file.purged";

    private readonly SettleoraDbContext dbContext;
    private readonly IFileObjectStorageProvider storageProvider;
    private readonly IFileObjectLifecycleAuditWriter auditWriter;
    private readonly TimeProvider timeProvider;

    public EfFileObjectLifecycleService(
        SettleoraDbContext dbContext,
        IFileObjectStorageProvider storageProvider,
        IFileObjectLifecycleAuditWriter auditWriter,
        TimeProvider timeProvider)
    {
        this.dbContext = dbContext;
        this.storageProvider = storageProvider;
        this.auditWriter = auditWriter;
        this.timeProvider = timeProvider;
    }

    public async Task<FileObjectLifecycleResult> CreatePendingAsync(
        CreateFileObjectPendingRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!TryNormalizeCreateRequest(request, out var normalizedRequest)
            || request.OwnerUserProfileId != request.ActorUserProfileId
            || !IsSupportedStorageProvider(storageProvider.ProviderName))
        {
            return FileObjectLifecycleResult.InvalidRequest();
        }

        if (!await IsActorAvailableAsync(
            request.ActorAuthAccountId,
            request.ActorUserProfileId,
            cancellationToken))
        {
            return FileObjectLifecycleResult.InvalidRequest();
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        var fileObjectId = Guid.NewGuid();
        var storageObjectKey = storageProvider.CreateObjectKey(
            normalizedRequest.Purpose,
            fileObjectId,
            occurredAtUtc);
        if (string.IsNullOrWhiteSpace(storageObjectKey)
            || storageObjectKey.Length > FileObjectConstraints.StorageObjectKeyMaxLength)
        {
            throw new InvalidOperationException("The registered storage provider generated an invalid file object key.");
        }

        var fileObject = new FileObject
        {
            Id = fileObjectId,
            OwnerUserProfileId = request.OwnerUserProfileId,
            CreatedByUserProfileId = request.ActorUserProfileId,
            Purpose = normalizedRequest.Purpose,
            Status = FileObjectStatuses.Pending,
            ContentType = normalizedRequest.ContentType,
            OriginalFilename = normalizedRequest.OriginalFilename,
            SizeBytes = request.SizeBytes,
            Sha256Hash = normalizedRequest.Sha256Hash,
            StorageProvider = storageProvider.ProviderName,
            StorageObjectKey = storageObjectKey,
            EncryptionMode = normalizedRequest.EncryptionMode,
            VaultKeyRef = normalizedRequest.VaultKeyRef,
            RetentionPolicy = normalizedRequest.RetentionPolicy,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc,
            DeletedAtUtc = null
        };

        dbContext.Set<FileObject>().Add(fileObject);
        await WriteAuditAsync(
            UploadStartedAction,
            request.ActorAuthAccountId,
            fileObject,
            previousStatus: null,
            newStatus: FileObjectStatuses.Pending,
            rowCreated: true,
            occurredAtUtc,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return FileObjectLifecycleResult.WriteFailed();
        }

        return FileObjectLifecycleResult.Created(fileObject);
    }

    public Task<FileObjectLifecycleResult> MarkActiveAsync(
        CompleteFileObjectUploadRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        return TransitionAsync(
            request.ActorAuthAccountId,
            request.ActorUserProfileId,
            request.FileObjectId,
            [FileObjectStatuses.Pending, FileObjectStatuses.UploadFailed],
            FileObjectStatuses.Active,
            UploadCompletedAction,
            setDeletedAtUtc: false,
            cancellationToken);
    }

    public Task<FileObjectLifecycleResult> MarkUploadFailedAsync(
        FailFileObjectUploadRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        return TransitionAsync(
            request.ActorAuthAccountId,
            request.ActorUserProfileId,
            request.FileObjectId,
            [FileObjectStatuses.Pending],
            FileObjectStatuses.UploadFailed,
            UploadFailedAction,
            setDeletedAtUtc: false,
            cancellationToken);
    }

    public Task<FileObjectLifecycleResult> MarkDeletedAsync(
        DeleteFileObjectRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        return TransitionAsync(
            request.ActorAuthAccountId,
            request.ActorUserProfileId,
            request.FileObjectId,
            [FileObjectStatuses.Active, FileObjectStatuses.Quarantined],
            FileObjectStatuses.Deleted,
            DeletedAction,
            setDeletedAtUtc: true,
            cancellationToken);
    }

    public Task<FileObjectLifecycleResult> MarkPurgedAsync(
        PurgeFileObjectRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        return TransitionAsync(
            request.ActorAuthAccountId,
            request.ActorUserProfileId,
            request.FileObjectId,
            [FileObjectStatuses.Deleted, FileObjectStatuses.UploadFailed],
            FileObjectStatuses.Purged,
            PurgedAction,
            setDeletedAtUtc: false,
            cancellationToken);
    }

    private async Task<FileObjectLifecycleResult> TransitionAsync(
        Guid actorAuthAccountId,
        Guid actorUserProfileId,
        Guid fileObjectId,
        IReadOnlyList<string> allowedPreviousStatuses,
        string newStatus,
        string action,
        bool setDeletedAtUtc,
        CancellationToken cancellationToken)
    {
        if (actorAuthAccountId == Guid.Empty
            || actorUserProfileId == Guid.Empty
            || fileObjectId == Guid.Empty
            || !IsSupportedStorageProvider(storageProvider.ProviderName))
        {
            return FileObjectLifecycleResult.InvalidRequest();
        }

        if (!await IsActorAvailableAsync(actorAuthAccountId, actorUserProfileId, cancellationToken))
        {
            return FileObjectLifecycleResult.InvalidRequest();
        }

        var fileObject = await dbContext.Set<FileObject>()
            .SingleOrDefaultAsync(
                fileObject => fileObject.Id == fileObjectId
                    && (fileObject.OwnerUserProfileId == actorUserProfileId
                        || fileObject.CreatedByUserProfileId == actorUserProfileId),
                cancellationToken);

        if (fileObject is null)
        {
            return FileObjectLifecycleResult.NotFound();
        }

        if (!allowedPreviousStatuses.Contains(fileObject.Status, StringComparer.Ordinal))
        {
            return FileObjectLifecycleResult.InvalidTransition();
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        var previousStatus = fileObject.Status;
        fileObject.Status = newStatus;
        fileObject.UpdatedAtUtc = occurredAtUtc;
        if (setDeletedAtUtc)
        {
            fileObject.DeletedAtUtc = occurredAtUtc;
        }

        await WriteAuditAsync(
            action,
            actorAuthAccountId,
            fileObject,
            previousStatus,
            newStatus,
            rowCreated: false,
            occurredAtUtc,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return FileObjectLifecycleResult.WriteFailed();
        }

        return FileObjectLifecycleResult.Updated(fileObject);
    }

    private async Task<bool> IsActorAvailableAsync(
        Guid actorAuthAccountId,
        Guid actorUserProfileId,
        CancellationToken cancellationToken)
    {
        if (actorAuthAccountId == Guid.Empty || actorUserProfileId == Guid.Empty)
        {
            return false;
        }

        return await dbContext.Set<AuthAccount>()
            .AsNoTracking()
            .AnyAsync(
                account => account.Id == actorAuthAccountId
                    && account.UserProfileId == actorUserProfileId
                    && account.Status == AuthAccountStatuses.Active
                    && account.DisabledAtUtc == null
                    && account.DeletedAtUtc == null
                    && account.UserProfile.DeletedAtUtc == null,
                cancellationToken);
    }

    private ValueTask WriteAuditAsync(
        string action,
        Guid actorAuthAccountId,
        FileObject fileObject,
        string? previousStatus,
        string newStatus,
        bool rowCreated,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        return auditWriter.WriteAsync(
            new FileObjectLifecycleAuditEvent(
                action,
                actorAuthAccountId,
                actorAuthAccountId,
                fileObject.Id,
                fileObject.Purpose,
                previousStatus,
                newStatus,
                fileObject.StorageProvider,
                rowCreated,
                occurredAtUtc),
            cancellationToken);
    }

    private static bool TryNormalizeCreateRequest(
        CreateFileObjectPendingRequest request,
        out NormalizedCreateFileObjectRequest normalizedRequest)
    {
        normalizedRequest = default;
        if (request.ActorAuthAccountId == Guid.Empty
            || request.ActorUserProfileId == Guid.Empty
            || request.OwnerUserProfileId == Guid.Empty
            || request.SizeBytes < 0
            || !TryNormalizeRequiredText(
                request.Purpose,
                FileObjectConstraints.PurposeMaxLength,
                out var purpose)
            || !FileObjectPurposes.IsSupported(purpose)
            || !TryNormalizeRequiredText(
                request.ContentType,
                FileObjectConstraints.ContentTypeMaxLength,
                out var contentType)
            || !TryNormalizeOptionalText(
                request.OriginalFilename,
                FileObjectConstraints.OriginalFilenameMaxLength,
                out var originalFilename)
            || !TryNormalizeSha256Hash(request.Sha256Hash, out var sha256Hash)
            || !TryNormalizeOptionalText(
                request.EncryptionMode,
                FileObjectConstraints.EncryptionModeMaxLength,
                out var encryptionMode)
            || encryptionMode is null
            || !FileObjectEncryptionModes.IsSupported(encryptionMode)
            || !TryNormalizeOptionalText(
                request.VaultKeyRef,
                FileObjectConstraints.VaultKeyRefMaxLength,
                out var vaultKeyRef)
            || !TryNormalizeOptionalText(
                request.RetentionPolicy,
                FileObjectConstraints.RetentionPolicyMaxLength,
                out var retentionPolicy))
        {
            return false;
        }

        normalizedRequest = new NormalizedCreateFileObjectRequest(
            purpose,
            contentType,
            originalFilename,
            sha256Hash,
            encryptionMode,
            vaultKeyRef,
            retentionPolicy);
        return true;
    }

    private static bool TryNormalizeRequiredText(
        string? value,
        int maxLength,
        out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
        {
            return false;
        }

        normalized = trimmed;
        return true;
    }

    private static bool TryNormalizeOptionalText(
        string? value,
        int maxLength,
        out string? normalized)
    {
        normalized = null;
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
        {
            return false;
        }

        normalized = trimmed;
        return true;
    }

    private static bool TryNormalizeSha256Hash(string? value, out string? normalized)
    {
        normalized = null;
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        var trimmed = value.Trim();
        if (trimmed.Length != FileObjectConstraints.Sha256HashMaxLength)
        {
            return false;
        }

        foreach (var character in trimmed)
        {
            if (character is not (>= 'a' and <= 'f' or >= '0' and <= '9'))
            {
                return false;
            }
        }

        normalized = trimmed;
        return true;
    }

    private static bool IsSupportedStorageProvider(string providerName)
    {
        return string.Equals(providerName, StorageProviderNames.Local, StringComparison.Ordinal);
    }

    private readonly record struct NormalizedCreateFileObjectRequest(
        string Purpose,
        string ContentType,
        string? OriginalFilename,
        string? Sha256Hash,
        string EncryptionMode,
        string? VaultKeyRef,
        string? RetentionPolicy);
}
