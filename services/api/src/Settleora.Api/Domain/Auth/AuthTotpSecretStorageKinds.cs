namespace Settleora.Api.Domain.Auth;

public static class AuthTotpSecretStorageKinds
{
    public const string None = "none";
    public const string ProtectedReference = "protected_reference";
    public const string EncryptedPayload = "encrypted_payload";
}
