namespace Settleora.Api.Domain.Sync;

public static class SyncOperationTypes
{
    public const string BillArchive = "bill_archive";
    public const string BillRestore = "bill_restore";

    public static bool IsSupported(string value)
    {
        return value is BillArchive or BillRestore;
    }
}
