namespace Settleora.Api.Users.SelfProfile;

internal sealed record SelfUserProfileResponse(
    Guid Id,
    string DisplayName,
    string? DefaultCurrency,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc);
