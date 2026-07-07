namespace Settleora.Api.Auth.PasswordReset;

internal interface IPasswordResetPublicResponsePolicy
{
    PasswordResetPublicRequestResponseDecision DecideForRequest(
        PasswordResetEmailDeliveryResult deliveryResult);
}

internal sealed class PasswordResetPublicResponsePolicy : IPasswordResetPublicResponsePolicy
{
    public PasswordResetPublicRequestResponseDecision DecideForRequest(
        PasswordResetEmailDeliveryResult deliveryResult)
    {
        ArgumentNullException.ThrowIfNull(deliveryResult);

        return PasswordResetPublicRequestResponseDecision.Accepted(
            deliveryResult.Category,
            deliveryResult.ProviderCategory,
            deliveryResult.FailureCategories);
    }
}

internal sealed record PasswordResetPublicRequestResponseDecision(
    int StatusCode,
    string PublicCategory,
    string BodyKind,
    bool IncludeRetryAfter,
    string InternalDeliveryCategory,
    string? InternalProviderCategory = null,
    IReadOnlyList<string>? InternalFailureCategories = null)
{
    public static PasswordResetPublicRequestResponseDecision Accepted(
        string internalDeliveryCategory,
        string? internalProviderCategory = null,
        IReadOnlyList<string>? internalFailureCategories = null)
    {
        return new PasswordResetPublicRequestResponseDecision(
            StatusCode: StatusCodes.Status202Accepted,
            PublicCategory: PasswordResetPublicRequestResponseCategories.Accepted,
            BodyKind: PasswordResetPublicRequestResponseBodyKinds.None,
            IncludeRetryAfter: false,
            InternalDeliveryCategory: internalDeliveryCategory,
            InternalProviderCategory: internalProviderCategory,
            InternalFailureCategories: internalFailureCategories);
    }

    public override string ToString()
    {
        return string.Join(
            " ",
            nameof(PasswordResetPublicRequestResponseDecision),
            $"StatusCode={StatusCode}",
            $"PublicCategory={PublicCategory}",
            $"BodyKind={BodyKind}",
            $"IncludeRetryAfter={IncludeRetryAfter}",
            $"InternalDeliveryCategory={InternalDeliveryCategory}",
            $"InternalProviderCategory={InternalProviderCategory ?? "none"}",
            $"InternalFailureCategories={string.Join(",", InternalFailureCategories ?? [])}");
    }
}

internal static class PasswordResetPublicRequestResponseCategories
{
    public const string Accepted = "accepted";
}

internal static class PasswordResetPublicRequestResponseBodyKinds
{
    public const string None = "none";
}
