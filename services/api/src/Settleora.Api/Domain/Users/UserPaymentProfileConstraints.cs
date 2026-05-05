namespace Settleora.Api.Domain.Users;

public static class UserPaymentProfileConstraints
{
    public const int PreferredMethodLabelMaxLength = 120;
    public const int PaymentHandleMaxLength = 320;
    public const int PaymentNoteMaxLength = 1000;
    public const int VisibilityMaxLength = 40;
}
