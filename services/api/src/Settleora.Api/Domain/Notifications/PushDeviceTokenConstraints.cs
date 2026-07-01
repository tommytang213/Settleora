namespace Settleora.Api.Domain.Notifications;

public static class PushDeviceTokenConstraints
{
    public const int PlatformMaxLength = 16;
    public const int ProviderMaxLength = 16;
    public const int AppBuildEnvironmentMaxLength = 32;
    public const int PermissionStateMaxLength = 32;
    public const int StatusMaxLength = 32;
    public const int StatusReasonMaxLength = 120;
    public const int TokenFingerprintMaxLength = 128;
    public const int ProtectedTokenBlobMaxLength = 8192;
    public const int ProtectionKeyIdMaxLength = 120;
    public const int ProtectionPurposeMaxLength = 120;
    public const int DeviceInstallationHashMaxLength = 128;
    public const int ProviderFeedbackCategoryMaxLength = 120;
}
