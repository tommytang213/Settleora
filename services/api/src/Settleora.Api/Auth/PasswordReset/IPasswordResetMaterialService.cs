namespace Settleora.Api.Auth.PasswordReset;

internal interface IPasswordResetMaterialService
{
    PasswordResetMaterial CreateMaterial();

    string DeriveLookupHash(string? submittedMaterial);
}
