namespace Settleora.Api.Storage;

internal interface IFileObjectStorageProvider
{
    string ProviderName { get; }

    string CreateObjectKey(string purpose, Guid fileObjectId, DateTimeOffset createdAtUtc);

    Task WriteAsync(string objectKey, Stream content, CancellationToken cancellationToken);

    Task<Stream> OpenReadAsync(string objectKey, CancellationToken cancellationToken);

    Task DeleteAsync(string objectKey, CancellationToken cancellationToken);
}
