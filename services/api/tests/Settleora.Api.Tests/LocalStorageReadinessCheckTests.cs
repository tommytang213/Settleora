using Microsoft.Extensions.Options;
using Settleora.Api.Configuration;
using Settleora.Api.Storage;

namespace Settleora.Api.Tests;

public sealed class LocalStorageReadinessCheckTests
{
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task IsReadyAsyncReturnsFalseWhenRootPathIsMissing(string rootPath)
    {
        var readinessCheck = CreateReadinessCheck("Local", rootPath);

        var isReady = await readinessCheck.IsReadyAsync(CancellationToken.None);

        Assert.False(isReady);
    }

    [Fact]
    public async Task IsReadyAsyncReturnsFalseWhenProviderIsUnsupported()
    {
        using var tempDirectory = new TemporaryDirectory();
        var readinessCheck = CreateReadinessCheck("S3", tempDirectory.Path);

        var isReady = await readinessCheck.IsReadyAsync(CancellationToken.None);

        Assert.False(isReady);
    }

    [Fact]
    public async Task IsReadyAsyncReturnsTrueWhenLocalRootCanBeCreatedAndAccessed()
    {
        using var tempDirectory = new TemporaryDirectory();
        var rootPath = Path.Combine(tempDirectory.Path, "storage-root");
        var readinessCheck = CreateReadinessCheck("Local", rootPath);

        var isReady = await readinessCheck.IsReadyAsync(CancellationToken.None);

        Assert.True(isReady);
        Assert.True(Directory.Exists(rootPath));
    }

    private static LocalStorageReadinessCheck CreateReadinessCheck(string provider, string rootPath)
    {
        return new LocalStorageReadinessCheck(Options.Create(new StorageOptions
        {
            Provider = provider,
            RootPath = rootPath
        }));
    }

    private sealed class TemporaryDirectory : IDisposable
    {
        public string Path { get; } = System.IO.Path.Combine(
            System.IO.Path.GetTempPath(),
            "settleora-storage-tests",
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
