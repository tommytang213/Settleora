namespace Settleora.Api.Domain.Sync;

public static class SyncResourceTypes
{
    public const string ExpenseBill = "expense_bill";

    public static bool IsSupported(string value)
    {
        return value is ExpenseBill;
    }
}
