namespace Settleora.Api.Domain.Notifications;

public static class NotificationPolicyEventFamilies
{
    public const string Bills = "bills";
    public const string Settlements = "settlements";
    public const string Recurring = "recurring";
    public const string Ocr = "ocr";
    public const string Sync = "sync";
    public const string AuthSecurity = "auth_security";

    public static readonly string[] DefaultReadoutFamilies =
    [
        Bills,
        Settlements,
        Recurring,
        Ocr,
        Sync,
        AuthSecurity
    ];

    public static bool IsSupported(string? value)
    {
        return value is Bills
            or Settlements
            or Recurring
            or Ocr
            or Sync
            or AuthSecurity;
    }
}
