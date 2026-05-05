using Settleora.Api.Domain.Files;

namespace Settleora.Api.Storage;

internal enum FileObjectLifecycleResultStatus
{
    Created,
    Updated,
    NotFound,
    InvalidTransition,
    InvalidRequest,
    WriteFailed
}

internal sealed class FileObjectLifecycleResult
{
    private FileObjectLifecycleResult(
        FileObjectLifecycleResultStatus status,
        FileObjectLifecycleMetadata? fileObject)
    {
        Status = status;
        FileObject = fileObject;
    }

    public FileObjectLifecycleResultStatus Status { get; }

    public bool Succeeded => Status is FileObjectLifecycleResultStatus.Created
        or FileObjectLifecycleResultStatus.Updated;

    public FileObjectLifecycleMetadata? FileObject { get; }

    public static FileObjectLifecycleResult Created(FileObject fileObject)
    {
        return new FileObjectLifecycleResult(
            FileObjectLifecycleResultStatus.Created,
            FileObjectLifecycleMetadata.FromFileObject(fileObject));
    }

    public static FileObjectLifecycleResult Updated(FileObject fileObject)
    {
        return new FileObjectLifecycleResult(
            FileObjectLifecycleResultStatus.Updated,
            FileObjectLifecycleMetadata.FromFileObject(fileObject));
    }

    public static FileObjectLifecycleResult NotFound()
    {
        return new FileObjectLifecycleResult(
            FileObjectLifecycleResultStatus.NotFound,
            fileObject: null);
    }

    public static FileObjectLifecycleResult InvalidTransition()
    {
        return new FileObjectLifecycleResult(
            FileObjectLifecycleResultStatus.InvalidTransition,
            fileObject: null);
    }

    public static FileObjectLifecycleResult InvalidRequest()
    {
        return new FileObjectLifecycleResult(
            FileObjectLifecycleResultStatus.InvalidRequest,
            fileObject: null);
    }

    public static FileObjectLifecycleResult WriteFailed()
    {
        return new FileObjectLifecycleResult(
            FileObjectLifecycleResultStatus.WriteFailed,
            fileObject: null);
    }
}

internal sealed record FileObjectLifecycleMetadata(
    Guid Id,
    Guid OwnerUserProfileId,
    Guid CreatedByUserProfileId,
    string Purpose,
    string Status,
    string ContentType,
    string? OriginalFilename,
    long SizeBytes,
    string? Sha256Hash,
    string EncryptionMode,
    string? RetentionPolicy,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? DeletedAtUtc)
{
    public static FileObjectLifecycleMetadata FromFileObject(FileObject fileObject)
    {
        return new FileObjectLifecycleMetadata(
            fileObject.Id,
            fileObject.OwnerUserProfileId,
            fileObject.CreatedByUserProfileId,
            fileObject.Purpose,
            fileObject.Status,
            fileObject.ContentType,
            fileObject.OriginalFilename,
            fileObject.SizeBytes,
            fileObject.Sha256Hash,
            fileObject.EncryptionMode,
            fileObject.RetentionPolicy,
            fileObject.CreatedAtUtc,
            fileObject.UpdatedAtUtc,
            fileObject.DeletedAtUtc);
    }
}
