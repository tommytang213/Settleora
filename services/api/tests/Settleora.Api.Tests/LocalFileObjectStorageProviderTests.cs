using System.Text;
using Microsoft.Extensions.Options;
using Settleora.Api.Configuration;
using Settleora.Api.Domain.Files;
using Settleora.Api.Storage;

namespace Settleora.Api.Tests;

public sealed class LocalFileObjectStorageProviderTests
{
    [Fact]
    public void CreateObjectKeyUsesOnlyServerOwnedSegments()
    {
        using var tempDirectory = new TemporaryDirectory();
        var provider = CreateProvider(StorageProviderNames.Local, tempDirectory.Path);
        var fileObjectId = Guid.Parse("c7c2ca5e-6296-4ee9-8d69-87c1178fcf6e");
        var createdAtUtc = new DateTimeOffset(2026, 5, 5, 12, 30, 0, TimeSpan.Zero);
        const string userFilename = "my receipt 2026.png";

        var objectKey = provider.CreateObjectKey(FileObjectPurposes.PaymentQr, fileObjectId, createdAtUtc);

        Assert.Equal(
            "file-objects/payment_qr/2026/05/05/c7c2ca5e62964ee98d6987c1178fcf6e",
            objectKey);
        Assert.DoesNotContain(userFilename, objectKey, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\\", objectKey, StringComparison.Ordinal);
        Assert.DoesNotContain("..", objectKey, StringComparison.Ordinal);
    }

    [Fact]
    public void CreateObjectKeyRejectsUnsupportedPurpose()
    {
        using var tempDirectory = new TemporaryDirectory();
        var provider = CreateProvider(StorageProviderNames.Local, tempDirectory.Path);

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            provider.CreateObjectKey("../../../avatars", Guid.NewGuid(), DateTimeOffset.UtcNow));
    }

    [Fact]
    public void ResolveObjectPathStaysUnderConfiguredRoot()
    {
        using var tempDirectory = new TemporaryDirectory();
        var provider = CreateProvider(StorageProviderNames.Local, tempDirectory.Path);
        var fileObjectId = Guid.Parse("2f9d5b09-2a47-44e4-9f26-419a162c732e");
        var objectKey = provider.CreateObjectKey(
            FileObjectPurposes.ReceiptImage,
            fileObjectId,
            new DateTimeOffset(2026, 5, 5, 0, 0, 0, TimeSpan.Zero));

        var objectPath = provider.ResolveObjectPath(objectKey);
        var rootPath = EnsureTrailingDirectorySeparator(Path.GetFullPath(tempDirectory.Path));

        Assert.StartsWith(rootPath, objectPath, GetPathComparison());
        Assert.EndsWith(
            Path.Combine(
                "file-objects",
                "receipt_image",
                "2026",
                "05",
                "05",
                "2f9d5b092a4744e49f26419a162c732e"),
            objectPath,
            GetPathComparison());
    }

    [Theory]
    [InlineData("../outside")]
    [InlineData("file-objects/../../outside")]
    [InlineData("file-objects/receipt_image/2026/05/05/../../../../outside")]
    [InlineData("file-objects//receipt_image")]
    [InlineData("file-objects/receipt_image/./object")]
    [InlineData("file-objects\\receipt_image\\object")]
    [InlineData("file-objects/receipt image/object")]
    [InlineData("file-objects/receipt_image/object.txt")]
    [InlineData("file-objects/receipt_image/%2e%2e/outside")]
    [InlineData("file-objects/receipt_image/outside?name=value")]
    public void ResolveObjectPathRejectsTraversalAndUnsupportedKeys(string objectKey)
    {
        using var tempDirectory = new TemporaryDirectory();
        var provider = CreateProvider(StorageProviderNames.Local, tempDirectory.Path);

        Assert.Throws<ArgumentException>(() => provider.ResolveObjectPath(objectKey));
    }

    [Fact]
    public async Task WriteOpenReadAndDeleteRejectTraversalKeysBeforeTouchingDisk()
    {
        using var tempDirectory = new TemporaryDirectory();
        var provider = CreateProvider(StorageProviderNames.Local, tempDirectory.Path);
        const string traversalKey = "file-objects/receipt_image/2026/05/05/../../../../outside";

        Assert.Empty(Directory.EnumerateFileSystemEntries(
            tempDirectory.Path,
            "*",
            SearchOption.AllDirectories));

        await Assert.ThrowsAsync<ArgumentException>(() =>
            provider.WriteAsync(traversalKey, new MemoryStream([1, 2, 3]), CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() =>
            provider.OpenReadAsync(traversalKey, CancellationToken.None));
        await Assert.ThrowsAsync<ArgumentException>(() =>
            provider.DeleteAsync(traversalKey, CancellationToken.None));
        Assert.Empty(Directory.EnumerateFileSystemEntries(
            tempDirectory.Path,
            "*",
            SearchOption.AllDirectories));
    }

    [Fact]
    public void ResolveObjectPathRejectsAbsoluteKeys()
    {
        using var tempDirectory = new TemporaryDirectory();
        var provider = CreateProvider(StorageProviderNames.Local, tempDirectory.Path);
        var absoluteObjectKey = Path.GetFullPath(Path.Combine(tempDirectory.Path, "..", "outside"));

        Assert.Throws<ArgumentException>(() => provider.ResolveObjectPath(absoluteObjectKey));
    }

    [Fact]
    public async Task WriteOpenReadAndDeleteStayInsideTempRoot()
    {
        using var tempDirectory = new TemporaryDirectory();
        var provider = CreateProvider(StorageProviderNames.Local, tempDirectory.Path);
        var objectKey = provider.CreateObjectKey(
            FileObjectPurposes.SupportingAttachment,
            Guid.Parse("aa1616ea-90ec-42ca-85b8-5549211a7daa"),
            new DateTimeOffset(2026, 5, 5, 0, 0, 0, TimeSpan.Zero));
        var bytes = Encoding.UTF8.GetBytes("storage foundation test payload");

        await provider.WriteAsync(objectKey, new MemoryStream(bytes), CancellationToken.None);

        await using (var readStream = await provider.OpenReadAsync(objectKey, CancellationToken.None))
        using (var reader = new StreamReader(readStream, Encoding.UTF8))
        {
            Assert.Equal("storage foundation test payload", await reader.ReadToEndAsync(CancellationToken.None));
        }

        var objectPath = provider.ResolveObjectPath(objectKey);
        Assert.True(File.Exists(objectPath));

        await provider.DeleteAsync(objectKey, CancellationToken.None);

        Assert.False(File.Exists(objectPath));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void ResolveObjectPathFailsSafelyWhenRootPathIsMissing(string rootPath)
    {
        var provider = CreateProvider(StorageProviderNames.Local, rootPath);

        Assert.Throws<InvalidOperationException>(() =>
            provider.ResolveObjectPath("file-objects/receipt_image/2026/05/05/2f9d5b092a4744e49f26419a162c732e"));
    }

    [Fact]
    public void ResolveObjectPathFailsSafelyWhenProviderIsUnsupported()
    {
        using var tempDirectory = new TemporaryDirectory();
        var provider = CreateProvider("s3", tempDirectory.Path);

        Assert.Throws<InvalidOperationException>(() =>
            provider.ResolveObjectPath("file-objects/receipt_image/2026/05/05/2f9d5b092a4744e49f26419a162c732e"));
    }

    [Fact]
    public void StorageFoundationDoesNotAddFileApiResponseTypes()
    {
        var responseTypes = typeof(LocalFileObjectStorageProvider)
            .Assembly
            .GetTypes()
            .Where(type => type.Namespace?.Contains(".Files", StringComparison.Ordinal) is true
                && type.Name.EndsWith("Response", StringComparison.Ordinal))
            .ToArray();

        Assert.Empty(responseTypes);
    }

    private static LocalFileObjectStorageProvider CreateProvider(string provider, string rootPath)
    {
        return new LocalFileObjectStorageProvider(Options.Create(new StorageOptions
        {
            Provider = provider,
            RootPath = rootPath
        }));
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

    private sealed class TemporaryDirectory : IDisposable
    {
        public string Path { get; } = System.IO.Path.Combine(
            System.IO.Path.GetTempPath(),
            "settleora-file-object-storage-tests",
            Guid.NewGuid().ToString("N"));

        public TemporaryDirectory()
        {
            Directory.CreateDirectory(Path);
        }

        public void Dispose()
        {
            if (Directory.Exists(Path))
            {
                Directory.Delete(Path, recursive: true);
            }
        }
    }
}
