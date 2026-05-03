using Settleora.Api.Domain.Auth;

namespace Settleora.Api.Auth.Authorization;

internal static class SettleoraAuthorizationPolicies
{
    public const string AuthenticatedUser = "Settleora.AuthenticatedUser";
    public const string SystemRoleOwner = "Settleora.SystemRole.Owner";
    public const string SystemRoleAdmin = "Settleora.SystemRole.Admin";
    public const string SystemRoleUser = "Settleora.SystemRole.User";

    public static bool IsSupportedSystemRole(string role)
    {
        return role is SystemRoles.Owner or SystemRoles.Admin or SystemRoles.User;
    }

    public static int CompareSystemRoles(string left, string right)
    {
        var sortIndexComparison = GetSystemRoleSortIndex(left).CompareTo(GetSystemRoleSortIndex(right));
        return sortIndexComparison != 0
            ? sortIndexComparison
            : StringComparer.Ordinal.Compare(left, right);
    }

    private static int GetSystemRoleSortIndex(string role)
    {
        return role switch
        {
            SystemRoles.Owner => 0,
            SystemRoles.Admin => 1,
            SystemRoles.User => 2,
            _ => int.MaxValue
        };
    }
}
