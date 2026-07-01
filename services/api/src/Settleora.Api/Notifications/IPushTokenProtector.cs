namespace Settleora.Api.Notifications;

internal interface IPushTokenProtector
{
    PushTokenProtectionResult Protect(string rawToken);

    string Unprotect(string protectedTokenBlob);
}

internal sealed record PushTokenProtectionResult(
    string ProtectedTokenBlob,
    string ProtectionKeyId,
    string ProtectionPurpose);
