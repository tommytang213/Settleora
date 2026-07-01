using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Notifications;

internal sealed class PushNotificationSender : IPushNotificationSender
{
    private readonly SettleoraDbContext dbContext;
    private readonly PushNotificationOptions options;
    private readonly IPushTokenProtector tokenProtector;
    private readonly IPushNotificationProvider provider;

    public PushNotificationSender(
        SettleoraDbContext dbContext,
        IOptions<PushNotificationOptions> options,
        IPushTokenProtector tokenProtector,
        IPushNotificationProvider provider)
    {
        this.dbContext = dbContext;
        this.options = options.Value;
        this.tokenProtector = tokenProtector;
        this.provider = provider;
    }

    public async Task<PushNotificationSendResult> SendAsync(
        PushNotificationSendRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!options.Enabled)
        {
            return PushNotificationSendResult.DisabledByConfiguration();
        }

        var activeTokens = await dbContext.Set<PushDeviceToken>()
            .AsNoTracking()
            .Where(token => token.UserProfileId == request.RecipientUserProfileId
                && token.Status == PushDeviceTokenStatuses.Active
                && (token.PermissionState == PushDeviceTokenPermissionStates.Authorized
                    || token.PermissionState == PushDeviceTokenPermissionStates.Provisional))
            .OrderBy(token => token.LastSeenAtUtc)
            .Select(token => new
            {
                token.Id,
                token.Platform,
                token.Provider,
                token.AppBuildEnvironment,
                token.ProtectedTokenBlob
            })
            .ToListAsync(cancellationToken);
        if (activeTokens.Count == 0)
        {
            return PushNotificationSendResult.NoActiveDeviceTokens();
        }

        var providerTokens = new List<PushProviderToken>(activeTokens.Count);
        foreach (var token in activeTokens)
        {
            providerTokens.Add(new PushProviderToken(
                token.Id,
                token.Platform,
                token.Provider,
                token.AppBuildEnvironment,
                tokenProtector.Unprotect(token.ProtectedTokenBlob)));
        }

        var providerResult = await provider.SendAsync(
            new PushProviderSendRequest(
                PushNotificationPayloadBuilder.Build(request),
                providerTokens),
            cancellationToken);

        return MapProviderResult(providerResult);
    }

    private static PushNotificationSendResult MapProviderResult(PushProviderSendResult providerResult)
    {
        if (providerResult.Accepted)
        {
            return PushNotificationSendResult.AcceptedByProvider();
        }

        if (providerResult.Unconfigured)
        {
            return PushNotificationSendResult.ProviderUnconfigured();
        }

        if (providerResult.Retryable)
        {
            return PushNotificationSendResult.FailedTransient(providerResult.Category);
        }

        return PushNotificationSendResult.FailedPermanent(providerResult.Category);
    }
}

internal sealed class DisabledPushNotificationProvider : IPushNotificationProvider
{
    public Task<PushProviderSendResult> SendAsync(
        PushProviderSendRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        return Task.FromResult(PushProviderSendResult.ProviderUnconfigured());
    }
}
