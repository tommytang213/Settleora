namespace Settleora.Api.Domain.Auth;

public static class AuthSecurityPolicySupportModes
{
    public const string Disabled = "disabled";
    public const string Optional = "optional";
    public const string RequiredForAdmins = "required_for_admins";
    public const string RequiredForAllUsers = "required_for_all_users";
    public const string PolicyPendingEnrollment = "policy_pending_enrollment";
}
