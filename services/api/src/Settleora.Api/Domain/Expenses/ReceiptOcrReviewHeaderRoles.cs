namespace Settleora.Api.Domain.Expenses;

public static class ReceiptOcrReviewHeaderRoles
{
    public const string Subtotal = "subtotal";
    public const string Tax = "tax";
    public const string ServiceCharge = "service_charge";
    public const string Discount = "discount";

    public static bool IsSupported(string? role) => role is Subtotal or Tax or ServiceCharge or Discount;
}
