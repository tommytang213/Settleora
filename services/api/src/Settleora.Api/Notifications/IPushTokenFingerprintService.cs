namespace Settleora.Api.Notifications;

internal interface IPushTokenFingerprintService
{
    bool IsAvailable { get; }

    string CreateTokenFingerprint(string provider, string appBuildEnvironment, string rawToken);

    string CreateDeviceInstallationHash(string deviceInstallationId);
}
