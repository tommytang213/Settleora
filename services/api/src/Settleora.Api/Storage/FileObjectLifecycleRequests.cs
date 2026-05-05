using Settleora.Api.Domain.Files;

namespace Settleora.Api.Storage;

internal sealed record CreateFileObjectPendingRequest(
    Guid ActorAuthAccountId,
    Guid ActorUserProfileId,
    Guid OwnerUserProfileId,
    string Purpose,
    string ContentType,
    long SizeBytes,
    string? OriginalFilename = null,
    string? Sha256Hash = null,
    string? EncryptionMode = FileObjectEncryptionModes.ServerManaged,
    string? VaultKeyRef = null,
    string? RetentionPolicy = null);

internal sealed record CompleteFileObjectUploadRequest(
    Guid ActorAuthAccountId,
    Guid ActorUserProfileId,
    Guid FileObjectId);

internal sealed record FailFileObjectUploadRequest(
    Guid ActorAuthAccountId,
    Guid ActorUserProfileId,
    Guid FileObjectId);

internal sealed record DeleteFileObjectRequest(
    Guid ActorAuthAccountId,
    Guid ActorUserProfileId,
    Guid FileObjectId);

internal sealed record PurgeFileObjectRequest(
    Guid ActorAuthAccountId,
    Guid ActorUserProfileId,
    Guid FileObjectId);
