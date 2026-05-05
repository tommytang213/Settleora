namespace Settleora.Api.Domain.Files;

public static class FileObjectConstraints
{
    public const int PurposeMaxLength = 40;
    public const int StatusMaxLength = 32;
    public const int ContentTypeMaxLength = 120;
    public const int OriginalFilenameMaxLength = 255;
    public const int Sha256HashMaxLength = 64;
    public const int StorageProviderMaxLength = 40;
    public const int StorageObjectKeyMaxLength = 512;
    public const int EncryptionModeMaxLength = 40;
    public const int VaultKeyRefMaxLength = 255;
    public const int RetentionPolicyMaxLength = 120;
}
