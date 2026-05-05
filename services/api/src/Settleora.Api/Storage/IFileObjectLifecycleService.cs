namespace Settleora.Api.Storage;

internal interface IFileObjectLifecycleService
{
    Task<FileObjectLifecycleResult> CreatePendingAsync(
        CreateFileObjectPendingRequest request,
        CancellationToken cancellationToken = default);

    Task<FileObjectLifecycleResult> MarkActiveAsync(
        CompleteFileObjectUploadRequest request,
        CancellationToken cancellationToken = default);

    Task<FileObjectLifecycleResult> MarkUploadFailedAsync(
        FailFileObjectUploadRequest request,
        CancellationToken cancellationToken = default);

    Task<FileObjectLifecycleResult> MarkDeletedAsync(
        DeleteFileObjectRequest request,
        CancellationToken cancellationToken = default);

    Task<FileObjectLifecycleResult> MarkPurgedAsync(
        PurgeFileObjectRequest request,
        CancellationToken cancellationToken = default);
}
