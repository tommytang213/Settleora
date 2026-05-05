using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Files;

public sealed class FileObject
{
    public Guid Id { get; set; }

    public Guid OwnerUserProfileId { get; set; }

    public UserProfile OwnerUserProfile { get; set; } = null!;

    public Guid CreatedByUserProfileId { get; set; }

    public UserProfile CreatedByUserProfile { get; set; } = null!;

    public string Purpose { get; set; } = string.Empty;

    public string Status { get; set; } = FileObjectStatuses.Pending;

    public string ContentType { get; set; } = string.Empty;

    public string? OriginalFilename { get; set; }

    public long SizeBytes { get; set; }

    public string? Sha256Hash { get; set; }

    public string StorageProvider { get; set; } = string.Empty;

    public string StorageObjectKey { get; set; } = string.Empty;

    public string EncryptionMode { get; set; } = FileObjectEncryptionModes.ServerManaged;

    public string? VaultKeyRef { get; set; }

    public string? RetentionPolicy { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? DeletedAtUtc { get; set; }
}
