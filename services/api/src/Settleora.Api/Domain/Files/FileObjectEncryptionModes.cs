namespace Settleora.Api.Domain.Files;

public static class FileObjectEncryptionModes
{
    public const string ServerManaged = "server_managed";
    public const string RecoverableUserVault = "recoverable_user_vault";
    public const string StrictUserVaultFuture = "strict_user_vault_future";

    public static bool IsSupported(string encryptionMode)
    {
        return encryptionMode is ServerManaged
            or RecoverableUserVault
            or StrictUserVaultFuture;
    }
}
