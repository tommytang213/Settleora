using Settleora.Api.Domain.Notifications;

namespace Settleora.Api.Notifications;

internal sealed record PushDeviceTokenResponse(
    Guid Id,
    string Platform,
    string Provider,
    string AppBuildEnvironment,
    string PermissionState,
    string Status,
    DateTimeOffset LastSeenAtUtc,
    DateTimeOffset RegisteredAtUtc,
    DateTimeOffset? RotatedAtUtc,
    DateTimeOffset? RevokedAtUtc,
    DateTimeOffset? StaleAtUtc,
    bool ReplacedPriorToken)
{
    public static PushDeviceTokenResponse From(PushDeviceToken token, bool replacedPriorToken)
    {
        return new PushDeviceTokenResponse(
            token.Id,
            token.Platform,
            token.Provider,
            token.AppBuildEnvironment,
            token.PermissionState,
            token.Status,
            token.LastSeenAtUtc,
            token.RegisteredAtUtc,
            token.RotatedAtUtc,
            token.RevokedAtUtc,
            token.StaleAtUtc,
            replacedPriorToken);
    }
}

internal sealed record PushDeviceTokenRegisterRequest(
    string? Platform,
    string? Provider,
    string? Token,
    string? DeviceInstallationId,
    string? AppBuildEnvironment,
    string? PermissionState,
    DateTimeOffset? ClientObservedAtUtc);

internal sealed record PushDeviceTokenRevokeRequest(
    string? Platform,
    string? Provider,
    string? Token,
    string? DeviceInstallationId,
    string? AppBuildEnvironment);
