using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;

namespace Settleora.Api.Auth.Invitations;

internal static class InvitationSecretHasher
{
    public const string HashVersion = "sha256-v1";

    private const int InvitationSecretByteLength = 32;
    private const string InvitationSecretHashPrefix = "auth-invitation-sha256:v1:";
    private const string InvitationSecretPurpose = "auth_invitation";

    public static string CreateRawInvitationSecret()
    {
        return WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(InvitationSecretByteLength));
    }

    public static string DeriveInvitationSecretHash(string rawInvitationSecret)
    {
        var payload = $"{InvitationSecretPurpose}:{rawInvitationSecret}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
        return InvitationSecretHashPrefix + WebEncoders.Base64UrlEncode(hash);
    }

    public static string DeriveSafeAttemptKey(string rawInvitationSecret)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(rawInvitationSecret));
        return "invite-secret-sha256:" + WebEncoders.Base64UrlEncode(hash);
    }
}
