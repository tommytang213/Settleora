namespace Settleora.Api.Auth.PasswordHashing;

internal interface IPasswordHashingService
{
    PasswordHashResult HashPassword(string plaintextPassword);

    PasswordVerificationResult VerifyPassword(string submittedPassword, StoredPasswordHash storedHash);

    PasswordRehashDecision CheckRehashRequired(StoredPasswordHash storedHash);
}
