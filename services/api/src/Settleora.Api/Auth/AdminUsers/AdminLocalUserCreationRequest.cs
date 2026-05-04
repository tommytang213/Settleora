namespace Settleora.Api.Auth.AdminUsers;

internal sealed record AdminLocalUserCreationRequest(
    string NormalizedIdentifier,
    string PlaintextPassword,
    string DisplayName,
    string? DefaultCurrency);
