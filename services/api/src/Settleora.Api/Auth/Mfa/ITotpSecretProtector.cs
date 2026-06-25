using Microsoft.AspNetCore.DataProtection;

namespace Settleora.Api.Auth.Mfa;

internal interface ITotpSecretProtector
{
    string Protect(byte[] secret);

    byte[] Unprotect(string protectedPayload);
}

internal sealed class DataProtectionTotpSecretProtector : ITotpSecretProtector
{
    private readonly IDataProtector protector;

    public DataProtectionTotpSecretProtector(IDataProtectionProvider dataProtectionProvider)
    {
        protector = dataProtectionProvider.CreateProtector("Settleora.Auth.TotpSecret.v1");
    }

    public string Protect(byte[] secret)
    {
        return protector.Protect(Convert.ToBase64String(secret));
    }

    public byte[] Unprotect(string protectedPayload)
    {
        return Convert.FromBase64String(protector.Unprotect(protectedPayload));
    }
}
