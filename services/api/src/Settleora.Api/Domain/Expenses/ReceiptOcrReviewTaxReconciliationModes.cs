namespace Settleora.Api.Domain.Expenses;

public static class ReceiptOcrReviewTaxReconciliationModes
{
    public const string AddToBase = "add_to_base";
    public const string AlreadyInBase = "already_in_base";
    public const string Unresolved = "unresolved";

    public static bool IsSupported(string? value) => value is AddToBase or AlreadyInBase or Unresolved;
}
