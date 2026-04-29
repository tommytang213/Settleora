using Microsoft.Extensions.Options;
using Settleora.Api.Configuration;

namespace Settleora.Api.Storage;

internal sealed class LocalStorageReadinessCheck : IStorageReadinessCheck
{
    private readonly IOptions<StorageOptions> _storageOptions;

    public LocalStorageReadinessCheck(IOptions<StorageOptions> storageOptions)
    {
        _storageOptions = storageOptions;
    }

    public Task<bool> IsReadyAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var options = _storageOptions.Value;
        if (!string.Equals(options.Provider, StorageProviderNames.Local, StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(options.RootPath))
        {
            return Task.FromResult(false);
        }

        try
        {
            var directory = Directory.CreateDirectory(options.RootPath);
            _ = Directory.GetFileSystemEntries(directory.FullName);

            return Task.FromResult(Directory.Exists(directory.FullName));
        }
        catch (Exception exception) when (IsReadinessFailure(exception))
        {
            return Task.FromResult(false);
        }
    }

    private static bool IsReadinessFailure(Exception exception)
    {
        return exception is UnauthorizedAccessException
            or IOException
            or ArgumentException
            or NotSupportedException;
    }
}
