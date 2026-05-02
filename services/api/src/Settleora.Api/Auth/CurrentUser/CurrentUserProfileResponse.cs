namespace Settleora.Api.Auth.CurrentUser;

internal sealed record CurrentUserProfileResponse(
    Guid Id,
    string DisplayName,
    string? DefaultCurrency);
