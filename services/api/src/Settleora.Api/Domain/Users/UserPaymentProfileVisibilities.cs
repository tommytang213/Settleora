namespace Settleora.Api.Domain.Users;

public static class UserPaymentProfileVisibilities
{
    public const string Private = "private";
    public const string SettlementCounterpartiesOnly = "settlement_counterparties_only";
    public const string GroupMembersWhenShared = "group_members_when_shared";

    public const string Default = SettlementCounterpartiesOnly;

    public static bool IsSupported(string visibility)
    {
        return visibility is Private
            or SettlementCounterpartiesOnly
            or GroupMembersWhenShared;
    }
}
