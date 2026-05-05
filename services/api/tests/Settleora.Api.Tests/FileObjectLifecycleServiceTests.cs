using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Settleora.Api.Configuration;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Storage;

namespace Settleora.Api.Tests;

public sealed class FileObjectLifecycleServiceTests
{
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 5, 15, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset TransitionTimestamp = new(2026, 5, 5, 15, 30, 0, TimeSpan.Zero);
    private static readonly Guid ActorAuthAccountId = Guid.Parse("0fd7b540-7b99-4547-ae0d-662cb11b53ab");
    private static readonly Guid ActorUserProfileId = Guid.Parse("ff92b8de-40c5-4c76-924d-2dde4655acb9");
    private const string ValidSha256Hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    [Fact]
    public async Task CreatePendingCreatesMetadataObjectKeyAndUploadStartedAudit()
    {
        await using var dbContext = CreateDbContext();
        var timeProvider = new MutableTimeProvider(InitialTimestamp);
        var storageProvider = new TestFileObjectStorageProvider();
        var service = CreateService(dbContext, storageProvider, timeProvider);
        var actor = await SeedActorAsync(dbContext);

        var result = await service.CreatePendingAsync(new CreateFileObjectPendingRequest(
            actor.AuthAccountId,
            actor.UserProfileId,
            actor.UserProfileId,
            FileObjectPurposes.PaymentQr,
            " image/png ",
            4096,
            OriginalFilename: " secret-payment-qr.png ",
            Sha256Hash: ValidSha256Hash,
            EncryptionMode: FileObjectEncryptionModes.ServerManaged,
            VaultKeyRef: " vault-ref-1 ",
            RetentionPolicy: " keep_30_days "));

        Assert.Equal(FileObjectLifecycleResultStatus.Created, result.Status);
        Assert.True(result.Succeeded);
        Assert.NotNull(result.FileObject);
        Assert.Equal(FileObjectStatuses.Pending, result.FileObject!.Status);
        Assert.Equal("secret-payment-qr.png", result.FileObject.OriginalFilename);

        var fileObject = await dbContext.Set<FileObject>().SingleAsync();
        Assert.Equal(result.FileObject.Id, fileObject.Id);
        Assert.Equal(actor.UserProfileId, fileObject.OwnerUserProfileId);
        Assert.Equal(actor.UserProfileId, fileObject.CreatedByUserProfileId);
        Assert.Equal(FileObjectPurposes.PaymentQr, fileObject.Purpose);
        Assert.Equal(FileObjectStatuses.Pending, fileObject.Status);
        Assert.Equal("image/png", fileObject.ContentType);
        Assert.Equal("secret-payment-qr.png", fileObject.OriginalFilename);
        Assert.Equal(4096, fileObject.SizeBytes);
        Assert.Equal(ValidSha256Hash, fileObject.Sha256Hash);
        Assert.Equal(StorageProviderNames.Local, fileObject.StorageProvider);
        Assert.Equal(storageProvider.LastObjectKey, fileObject.StorageObjectKey);
        Assert.DoesNotContain("secret-payment-qr.png", fileObject.StorageObjectKey, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(FileObjectEncryptionModes.ServerManaged, fileObject.EncryptionMode);
        Assert.Equal("vault-ref-1", fileObject.VaultKeyRef);
        Assert.Equal("keep_30_days", fileObject.RetentionPolicy);
        Assert.Equal(InitialTimestamp, fileObject.CreatedAtUtc);
        Assert.Equal(InitialTimestamp, fileObject.UpdatedAtUtc);
        Assert.Null(fileObject.DeletedAtUtc);

        var auditEvent = await AssertSingleAuditEventAsync(dbContext, "file.upload_started");
        Assert.Equal(actor.AuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.Equal(actor.AuthAccountId, auditEvent.SubjectAuthAccountId);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.Equal(InitialTimestamp, auditEvent.OccurredAtUtc);

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson!);
        AssertAllowedAuditMetadataProperties(metadata, includesPreviousStatus: false);
        Assert.Equal("file_object_lifecycle", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(fileObject.Id.ToString("D"), metadata.RootElement.GetProperty("fileObjectId").GetString());
        Assert.Equal(FileObjectPurposes.PaymentQr, metadata.RootElement.GetProperty("purpose").GetString());
        Assert.Equal(FileObjectStatuses.Pending, metadata.RootElement.GetProperty("newStatus").GetString());
        Assert.Equal(StorageProviderNames.Local, metadata.RootElement.GetProperty("storageProvider").GetString());
        Assert.True(metadata.RootElement.GetProperty("rowCreated").GetBoolean());
    }

    [Fact]
    public async Task CreatePendingNormalizesBlankNullableFieldsToNull()
    {
        await using var dbContext = CreateDbContext();
        var service = CreateService(dbContext, new TestFileObjectStorageProvider(), new MutableTimeProvider(InitialTimestamp));
        var actor = await SeedActorAsync(dbContext);

        var result = await service.CreatePendingAsync(new CreateFileObjectPendingRequest(
            actor.AuthAccountId,
            actor.UserProfileId,
            actor.UserProfileId,
            FileObjectPurposes.ReceiptImage,
            "image/jpeg",
            0,
            OriginalFilename: "  ",
            Sha256Hash: "  ",
            VaultKeyRef: "  ",
            RetentionPolicy: "  "));

        Assert.Equal(FileObjectLifecycleResultStatus.Created, result.Status);
        Assert.NotNull(result.FileObject);
        Assert.Null(result.FileObject!.OriginalFilename);
        Assert.Null(result.FileObject.Sha256Hash);
        Assert.Null(result.FileObject.RetentionPolicy);

        var fileObject = await dbContext.Set<FileObject>().SingleAsync();
        Assert.Null(fileObject.OriginalFilename);
        Assert.Null(fileObject.Sha256Hash);
        Assert.Null(fileObject.VaultKeyRef);
        Assert.Null(fileObject.RetentionPolicy);
    }

    [Fact]
    public async Task CreatePendingRejectsUnsupportedPurpose()
    {
        await AssertInvalidCreateRequestAsync(request => request with
        {
            Purpose = "public_avatar"
        });
    }

    [Fact]
    public async Task CreatePendingRejectsUnsupportedEncryptionMode()
    {
        await AssertInvalidCreateRequestAsync(request => request with
        {
            EncryptionMode = "client_path"
        });
    }

    [Fact]
    public async Task CreatePendingRejectsNegativeSize()
    {
        await AssertInvalidCreateRequestAsync(request => request with
        {
            SizeBytes = -1
        });
    }

    [Fact]
    public async Task CreatePendingRejectsInvalidSha256Hash()
    {
        await AssertInvalidCreateRequestAsync(request => request with
        {
            Sha256Hash = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        });
    }

    [Fact]
    public async Task CreatePendingResultDoesNotExposeStorageInternals()
    {
        await using var dbContext = CreateDbContext();
        var storageProvider = new TestFileObjectStorageProvider();
        var service = CreateService(dbContext, storageProvider, new MutableTimeProvider(InitialTimestamp));
        var actor = await SeedActorAsync(dbContext);

        var result = await service.CreatePendingAsync(CreateValidPendingRequest(actor));
        var resultJson = JsonSerializer.Serialize(result);

        Assert.DoesNotContain("storageObjectKey", resultJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(storageProvider.LastObjectKey!, resultJson, StringComparison.Ordinal);
        Assert.DoesNotContain(storageProvider.RootPath, resultJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("rootPath", resultJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("physical", resultJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("path", resultJson, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PendingToActiveSucceedsAndWritesUploadCompletedAudit()
    {
        await using var dbContext = CreateDbContext();
        var timeProvider = new MutableTimeProvider(InitialTimestamp);
        var service = CreateService(dbContext, new TestFileObjectStorageProvider(), timeProvider);
        var actor = await SeedActorAsync(dbContext);
        var created = await service.CreatePendingAsync(CreateValidPendingRequest(actor));

        timeProvider.SetUtcNow(TransitionTimestamp);
        var result = await service.MarkActiveAsync(new CompleteFileObjectUploadRequest(
            actor.AuthAccountId,
            actor.UserProfileId,
            created.FileObject!.Id));

        Assert.Equal(FileObjectLifecycleResultStatus.Updated, result.Status);
        Assert.Equal(FileObjectStatuses.Active, result.FileObject!.Status);

        var fileObject = await dbContext.Set<FileObject>().SingleAsync();
        Assert.Equal(FileObjectStatuses.Active, fileObject.Status);
        Assert.Equal(InitialTimestamp, fileObject.CreatedAtUtc);
        Assert.Equal(TransitionTimestamp, fileObject.UpdatedAtUtc);
        Assert.Null(fileObject.DeletedAtUtc);

        var auditEvent = await AssertAuditEventAsync(dbContext, "file.upload_completed");
        Assert.Equal(TransitionTimestamp, auditEvent.OccurredAtUtc);
        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson!);
        AssertAllowedAuditMetadataProperties(metadata, includesPreviousStatus: true);
        Assert.Equal(FileObjectStatuses.Pending, metadata.RootElement.GetProperty("previousStatus").GetString());
        Assert.Equal(FileObjectStatuses.Active, metadata.RootElement.GetProperty("newStatus").GetString());
        Assert.False(metadata.RootElement.GetProperty("rowCreated").GetBoolean());
    }

    [Fact]
    public async Task PendingToUploadFailedSucceedsAndWritesUploadFailedAudit()
    {
        await using var dbContext = CreateDbContext();
        var timeProvider = new MutableTimeProvider(InitialTimestamp);
        var service = CreateService(dbContext, new TestFileObjectStorageProvider(), timeProvider);
        var actor = await SeedActorAsync(dbContext);
        var created = await service.CreatePendingAsync(CreateValidPendingRequest(actor));

        timeProvider.SetUtcNow(TransitionTimestamp);
        var result = await service.MarkUploadFailedAsync(new FailFileObjectUploadRequest(
            actor.AuthAccountId,
            actor.UserProfileId,
            created.FileObject!.Id));

        Assert.Equal(FileObjectLifecycleResultStatus.Updated, result.Status);
        Assert.Equal(FileObjectStatuses.UploadFailed, result.FileObject!.Status);

        var fileObject = await dbContext.Set<FileObject>().SingleAsync();
        Assert.Equal(FileObjectStatuses.UploadFailed, fileObject.Status);
        Assert.Equal(TransitionTimestamp, fileObject.UpdatedAtUtc);

        var auditEvent = await AssertAuditEventAsync(dbContext, "file.upload_failed");
        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson!);
        Assert.Equal(FileObjectStatuses.Pending, metadata.RootElement.GetProperty("previousStatus").GetString());
        Assert.Equal(FileObjectStatuses.UploadFailed, metadata.RootElement.GetProperty("newStatus").GetString());
    }

    [Fact]
    public async Task ActiveToDeletedAndDeletedToPurgedSucceedWithAudit()
    {
        await using var dbContext = CreateDbContext();
        var timeProvider = new MutableTimeProvider(InitialTimestamp);
        var service = CreateService(dbContext, new TestFileObjectStorageProvider(), timeProvider);
        var actor = await SeedActorAsync(dbContext);
        var created = await service.CreatePendingAsync(CreateValidPendingRequest(actor));

        await service.MarkActiveAsync(new CompleteFileObjectUploadRequest(
            actor.AuthAccountId,
            actor.UserProfileId,
            created.FileObject!.Id));

        timeProvider.SetUtcNow(TransitionTimestamp);
        var deleteResult = await service.MarkDeletedAsync(new DeleteFileObjectRequest(
            actor.AuthAccountId,
            actor.UserProfileId,
            created.FileObject.Id));

        Assert.Equal(FileObjectLifecycleResultStatus.Updated, deleteResult.Status);
        Assert.Equal(FileObjectStatuses.Deleted, deleteResult.FileObject!.Status);
        Assert.Equal(TransitionTimestamp, deleteResult.FileObject.DeletedAtUtc);

        timeProvider.SetUtcNow(TransitionTimestamp.AddMinutes(5));
        var purgeResult = await service.MarkPurgedAsync(new PurgeFileObjectRequest(
            actor.AuthAccountId,
            actor.UserProfileId,
            created.FileObject.Id));

        Assert.Equal(FileObjectLifecycleResultStatus.Updated, purgeResult.Status);
        Assert.Equal(FileObjectStatuses.Purged, purgeResult.FileObject!.Status);

        var fileObject = await dbContext.Set<FileObject>().SingleAsync();
        Assert.Equal(FileObjectStatuses.Purged, fileObject.Status);
        Assert.Equal(TransitionTimestamp, fileObject.DeletedAtUtc);
        Assert.Equal(TransitionTimestamp.AddMinutes(5), fileObject.UpdatedAtUtc);

        await AssertAuditEventAsync(dbContext, "file.deleted");
        await AssertAuditEventAsync(dbContext, "file.purged");
    }

    [Fact]
    public async Task InvalidTransitionReturnsInvalidTransitionAndDoesNotMutateOrAudit()
    {
        await using var dbContext = CreateDbContext();
        var service = CreateService(dbContext, new TestFileObjectStorageProvider(), new MutableTimeProvider(InitialTimestamp));
        var actor = await SeedActorAsync(dbContext);
        var created = await service.CreatePendingAsync(CreateValidPendingRequest(actor));

        var result = await service.MarkPurgedAsync(new PurgeFileObjectRequest(
            actor.AuthAccountId,
            actor.UserProfileId,
            created.FileObject!.Id));

        Assert.Equal(FileObjectLifecycleResultStatus.InvalidTransition, result.Status);
        Assert.Null(result.FileObject);

        var fileObject = await dbContext.Set<FileObject>().SingleAsync();
        Assert.Equal(FileObjectStatuses.Pending, fileObject.Status);
        Assert.Equal(InitialTimestamp, fileObject.UpdatedAtUtc);

        var auditEvents = await dbContext.Set<AuthAuditEvent>().ToListAsync();
        Assert.Single(auditEvents);
        Assert.Equal("file.upload_started", auditEvents[0].Action);
    }

    [Fact]
    public async Task MissingFileReturnsNotFoundAndDoesNotCreateAuditEvent()
    {
        await using var dbContext = CreateDbContext();
        var service = CreateService(dbContext, new TestFileObjectStorageProvider(), new MutableTimeProvider(InitialTimestamp));
        var actor = await SeedActorAsync(dbContext);

        var result = await service.MarkActiveAsync(new CompleteFileObjectUploadRequest(
            actor.AuthAccountId,
            actor.UserProfileId,
            Guid.Parse("93ec0b61-af61-495e-9ace-0840d0898e67")));

        Assert.Equal(FileObjectLifecycleResultStatus.NotFound, result.Status);
        Assert.Empty(await dbContext.Set<AuthAuditEvent>().ToListAsync());
    }

    [Fact]
    public async Task AuditMetadataExcludesOriginalFilenameObjectKeyPathsVaultRefsAndSensitiveContent()
    {
        await using var dbContext = CreateDbContext();
        var storageProvider = new TestFileObjectStorageProvider();
        var service = CreateService(dbContext, storageProvider, new MutableTimeProvider(InitialTimestamp));
        var actor = await SeedActorAsync(dbContext);
        const string originalFilename = "payment-handle-statement-rows-secret.png";
        const string vaultKeyRef = "vault-key-ref-secret";
        const string requestBodyLikeValue = "raw request body and file content should not appear";

        var result = await service.CreatePendingAsync(new CreateFileObjectPendingRequest(
            actor.AuthAccountId,
            actor.UserProfileId,
            actor.UserProfileId,
            FileObjectPurposes.StatementUpload,
            "text/csv",
            12,
            OriginalFilename: originalFilename,
            Sha256Hash: ValidSha256Hash,
            VaultKeyRef: vaultKeyRef,
            RetentionPolicy: requestBodyLikeValue));

        Assert.Equal(FileObjectLifecycleResultStatus.Created, result.Status);

        var auditEvent = await AssertSingleAuditEventAsync(dbContext, "file.upload_started");
        var metadataJson = auditEvent.SafeMetadataJson!;
        Assert.DoesNotContain(originalFilename, metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(storageProvider.LastObjectKey!, metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(storageProvider.RootPath, metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("root", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("physical", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("path", metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(vaultKeyRef, metadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(requestBodyLikeValue, metadataJson, StringComparison.OrdinalIgnoreCase);

        using var metadata = JsonDocument.Parse(metadataJson);
        AssertAllowedAuditMetadataProperties(metadata, includesPreviousStatus: false);
    }

    [Fact]
    public async Task FileObjectLifecycleRegistersServiceAndAuditWriter()
    {
        var services = new ServiceCollection();
        services.AddDbContext<SettleoraDbContext>(options =>
            options.UseInMemoryDatabase($"settleora-file-lifecycle-registration-{Guid.NewGuid():N}"));
        services.AddSingleton(Options.Create(new StorageOptions
        {
            Provider = StorageProviderNames.Local,
            RootPath = "test-storage-root"
        }));
        services.AddFileObjectStorage();

        await using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();

        Assert.IsType<LocalFileObjectStorageProvider>(
            scope.ServiceProvider.GetRequiredService<IFileObjectStorageProvider>());
        Assert.IsType<EfFileObjectLifecycleAuditWriter>(
            scope.ServiceProvider.GetRequiredService<IFileObjectLifecycleAuditWriter>());
        Assert.IsType<EfFileObjectLifecycleService>(
            scope.ServiceProvider.GetRequiredService<IFileObjectLifecycleService>());
        Assert.Same(
            TimeProvider.System,
            scope.ServiceProvider.GetRequiredService<TimeProvider>());
    }

    private static async Task AssertInvalidCreateRequestAsync(
        Func<CreateFileObjectPendingRequest, CreateFileObjectPendingRequest> mutateRequest)
    {
        await using var dbContext = CreateDbContext();
        var service = CreateService(dbContext, new TestFileObjectStorageProvider(), new MutableTimeProvider(InitialTimestamp));
        var actor = await SeedActorAsync(dbContext);
        var request = mutateRequest(CreateValidPendingRequest(actor));

        var result = await service.CreatePendingAsync(request);

        Assert.Equal(FileObjectLifecycleResultStatus.InvalidRequest, result.Status);
        Assert.Null(result.FileObject);
        Assert.Empty(await dbContext.Set<FileObject>().ToListAsync());
        Assert.Empty(await dbContext.Set<AuthAuditEvent>().ToListAsync());
    }

    private static EfFileObjectLifecycleService CreateService(
        SettleoraDbContext dbContext,
        TestFileObjectStorageProvider storageProvider,
        TimeProvider timeProvider)
    {
        return new EfFileObjectLifecycleService(
            dbContext,
            storageProvider,
            new EfFileObjectLifecycleAuditWriter(dbContext),
            timeProvider);
    }

    private static CreateFileObjectPendingRequest CreateValidPendingRequest(SeededActor actor)
    {
        return new CreateFileObjectPendingRequest(
            actor.AuthAccountId,
            actor.UserProfileId,
            actor.UserProfileId,
            FileObjectPurposes.ReceiptImage,
            "image/png",
            1234,
            OriginalFilename: "receipt.png",
            Sha256Hash: ValidSha256Hash,
            EncryptionMode: FileObjectEncryptionModes.ServerManaged,
            VaultKeyRef: null,
            RetentionPolicy: "receipt_retention");
    }

    private static async Task<SeededActor> SeedActorAsync(SettleoraDbContext dbContext)
    {
        var createdAtUtc = InitialTimestamp.AddHours(-1);
        var profile = new UserProfile
        {
            Id = ActorUserProfileId,
            DisplayName = "Lifecycle Actor",
            DefaultCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            DeletedAtUtc = null
        };
        var account = new AuthAccount
        {
            Id = ActorAuthAccountId,
            UserProfileId = profile.Id,
            UserProfile = profile,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            DisabledAtUtc = null,
            DeletedAtUtc = null
        };

        dbContext.Set<UserProfile>().Add(profile);
        dbContext.Set<AuthAccount>().Add(account);
        await dbContext.SaveChangesAsync();

        return new SeededActor(account.Id, profile.Id);
    }

    private static SettleoraDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase($"settleora-file-lifecycle-{Guid.NewGuid():N}")
            .Options;

        return new SettleoraDbContext(options);
    }

    private static async Task<AuthAuditEvent> AssertSingleAuditEventAsync(
        SettleoraDbContext dbContext,
        string expectedAction)
    {
        var auditEvent = await dbContext.Set<AuthAuditEvent>().SingleAsync();

        Assert.Equal(expectedAction, auditEvent.Action);
        Assert.NotNull(auditEvent.SafeMetadataJson);
        return auditEvent;
    }

    private static async Task<AuthAuditEvent> AssertAuditEventAsync(
        SettleoraDbContext dbContext,
        string expectedAction)
    {
        var auditEvent = await dbContext.Set<AuthAuditEvent>()
            .SingleAsync(auditEvent => auditEvent.Action == expectedAction);

        Assert.NotNull(auditEvent.SafeMetadataJson);
        return auditEvent;
    }

    private static void AssertAllowedAuditMetadataProperties(
        JsonDocument metadata,
        bool includesPreviousStatus)
    {
        var allowedProperties = new SortedSet<string>(
            [
                "workflowName",
                "fileObjectId",
                "purpose",
                "previousStatus",
                "newStatus",
                "storageProvider",
                "rowCreated"
            ],
            StringComparer.Ordinal);

        var propertyNames = metadata.RootElement
            .EnumerateObject()
            .Select(property => property.Name)
            .Order(StringComparer.Ordinal)
            .ToArray();

        Assert.All(propertyNames, propertyName => Assert.Contains(propertyName, allowedProperties));
        Assert.Contains("workflowName", propertyNames);
        Assert.Contains("fileObjectId", propertyNames);
        Assert.Contains("purpose", propertyNames);
        Assert.Contains("newStatus", propertyNames);
        Assert.Contains("storageProvider", propertyNames);
        Assert.Contains("rowCreated", propertyNames);

        if (includesPreviousStatus)
        {
            Assert.Contains("previousStatus", propertyNames);
        }
        else
        {
            Assert.DoesNotContain("previousStatus", propertyNames);
        }
    }

    private sealed record SeededActor(Guid AuthAccountId, Guid UserProfileId);

    private sealed class MutableTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public MutableTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }

        public void SetUtcNow(DateTimeOffset value)
        {
            utcNow = value;
        }
    }

    private sealed class TestFileObjectStorageProvider : IFileObjectStorageProvider
    {
        public string RootPath { get; } = "C:\\settleora-test-storage\\physical-root";

        public string ProviderName => StorageProviderNames.Local;

        public string? LastObjectKey { get; private set; }

        public string CreateObjectKey(
            string purpose,
            Guid fileObjectId,
            DateTimeOffset createdAtUtc)
        {
            var utc = createdAtUtc.ToUniversalTime();
            LastObjectKey = string.Join(
                '/',
                "file-objects",
                purpose,
                utc.Year.ToString("0000", System.Globalization.CultureInfo.InvariantCulture),
                utc.Month.ToString("00", System.Globalization.CultureInfo.InvariantCulture),
                utc.Day.ToString("00", System.Globalization.CultureInfo.InvariantCulture),
                fileObjectId.ToString("N"));
            return LastObjectKey;
        }

        public Task WriteAsync(
            string objectKey,
            Stream content,
            CancellationToken cancellationToken)
        {
            throw new NotSupportedException("Lifecycle tests use metadata-only file object creation.");
        }

        public Task<Stream> OpenReadAsync(
            string objectKey,
            CancellationToken cancellationToken)
        {
            throw new NotSupportedException("Lifecycle tests use metadata-only file object creation.");
        }

        public Task DeleteAsync(
            string objectKey,
            CancellationToken cancellationToken)
        {
            throw new NotSupportedException("Lifecycle tests use metadata-only file object creation.");
        }
    }
}
