namespace Settleora.Api.Domain.Expenses;

public static class BillCsvImportSessionStatuses
{
    public const string NeedsCorrection = "needs_correction";
    public const string ReadyForConfirmation = "ready_for_confirmation";
    public const string Confirmed = "confirmed";
    public const string Discarded = "discarded";
    public const string Expired = "expired";
}
