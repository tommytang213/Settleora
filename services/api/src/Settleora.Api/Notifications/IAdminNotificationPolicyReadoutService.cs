namespace Settleora.Api.Notifications;

internal interface IAdminNotificationPolicyReadoutService
{
    Task<AdminNotificationPolicyReadoutResponse> GetReadoutAsync(CancellationToken cancellationToken);
}
