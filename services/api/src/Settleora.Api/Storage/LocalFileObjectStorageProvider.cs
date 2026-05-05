using System.Globalization;
using Microsoft.Extensions.Options;
using Settleora.Api.Configuration;
using Settleora.Api.Domain.Files;

namespace Settleora.Api.Storage;

internal sealed class LocalFileObjectStorageProvider : IFileObjectStorageProvider
{
    private const int BufferSize = 81920;

    private readonly IOptions<StorageOptions> storageOptions;

    public LocalFileObjectStorageProvider(IOptions<StorageOptions> storageOptions)
    {
        this.storageOptions = storageOptions;
    }

    public string ProviderName => StorageProviderNames.Local;

    public string CreateObjectKey(
        string purpose,
        Guid fileObjectId,
        DateTimeOffset createdAtUtc)
    {
        if (!FileObjectPurposes.IsSupported(purpose))
        {
            throw new ArgumentOutOfRangeException(nameof(purpose), "Unsupported file object purpose.");
        }

        if (fileObjectId == Guid.Empty)
        {
            throw new ArgumentException("File object ID must be server generated before object key creation.", nameof(fileObjectId));
        }

        var utc = createdAtUtc.ToUniversalTime();

        return string.Join(
            '/',
            "file-objects",
            purpose,
            utc.Year.ToString("0000", CultureInfo.InvariantCulture),
            utc.Month.ToString("00", CultureInfo.InvariantCulture),
            utc.Day.ToString("00", CultureInfo.InvariantCulture),
            fileObjectId.ToString("N"));
    }

    public async Task WriteAsync(
        string objectKey,
        Stream content,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(content);
        cancellationToken.ThrowIfCancellationRequested();

        var objectPath = ResolveObjectPath(objectKey);
        var directory = Path.GetDirectoryName(objectPath);
        if (string.IsNullOrWhiteSpace(directory))
        {
            throw new InvalidOperationException("Local storage object path did not resolve to a file directory.");
        }

        Directory.CreateDirectory(directory);

        await using var fileStream = new FileStream(
            objectPath,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            BufferSize,
            useAsync: true);

        await content.CopyToAsync(fileStream, cancellationToken);
    }

    public Task<Stream> OpenReadAsync(
        string objectKey,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var objectPath = ResolveObjectPath(objectKey);
        Stream stream = new FileStream(
            objectPath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            BufferSize,
            useAsync: true);

        return Task.FromResult(stream);
    }

    public Task DeleteAsync(
        string objectKey,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var objectPath = ResolveObjectPath(objectKey);
        if (File.Exists(objectPath))
        {
            File.Delete(objectPath);
        }

        return Task.CompletedTask;
    }

    internal string ResolveObjectPath(string objectKey)
    {
        var rootPath = GetValidatedRootPath();
        ValidateObjectKey(objectKey);

        var rootFullPath = EnsureTrailingDirectorySeparator(Path.GetFullPath(rootPath));
        var objectPath = Path.GetFullPath(
            Path.Combine(
                [rootFullPath, .. objectKey.Split('/', StringSplitOptions.None)]));

        if (!objectPath.StartsWith(rootFullPath, GetPathComparison()))
        {
            throw new ArgumentException("Storage object key resolved outside the configured local storage root.", nameof(objectKey));
        }

        return objectPath;
    }

    private string GetValidatedRootPath()
    {
        var options = storageOptions.Value;
        if (!string.Equals(options.Provider, StorageProviderNames.Local, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Configured storage provider is not supported by local file object storage.");
        }

        if (string.IsNullOrWhiteSpace(options.RootPath))
        {
            throw new InvalidOperationException("A non-blank storage root path is required for local file object storage.");
        }

        return options.RootPath;
    }

    private static void ValidateObjectKey(string objectKey)
    {
        if (string.IsNullOrWhiteSpace(objectKey))
        {
            throw new ArgumentException("Storage object key is required.", nameof(objectKey));
        }

        if (objectKey.Length > FileObjectConstraints.StorageObjectKeyMaxLength)
        {
            throw new ArgumentException("Storage object key exceeds the maximum allowed length.", nameof(objectKey));
        }

        if (Path.IsPathRooted(objectKey) || Path.IsPathFullyQualified(objectKey))
        {
            throw new ArgumentException("Storage object key must be relative to the configured storage root.", nameof(objectKey));
        }

        if (objectKey.Contains('\\', StringComparison.Ordinal) || objectKey.Contains(':', StringComparison.Ordinal))
        {
            throw new ArgumentException("Storage object key contains unsupported path characters.", nameof(objectKey));
        }

        var segments = objectKey.Split('/', StringSplitOptions.None);
        if (segments.Length is 0)
        {
            throw new ArgumentException("Storage object key must include server-owned path segments.", nameof(objectKey));
        }

        foreach (var segment in segments)
        {
            if (segment is "" or "." or "..")
            {
                throw new ArgumentException("Storage object key contains unsafe path segments.", nameof(objectKey));
            }

            foreach (var character in segment)
            {
                if (!IsSafeObjectKeyCharacter(character))
                {
                    throw new ArgumentException("Storage object key contains unsupported path characters.", nameof(objectKey));
                }
            }
        }
    }

    private static bool IsSafeObjectKeyCharacter(char character)
    {
        return character is >= 'a' and <= 'z'
            or >= '0' and <= '9'
            or '_'
            or '-';
    }

    private static string EnsureTrailingDirectorySeparator(string path)
    {
        return Path.EndsInDirectorySeparator(path)
            ? path
            : path + Path.DirectorySeparatorChar;
    }

    private static StringComparison GetPathComparison()
    {
        return OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
    }
}
