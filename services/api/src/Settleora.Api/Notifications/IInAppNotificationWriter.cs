namespace Settleora.Api.Notifications;

internal interface IInAppNotificationWriter
{
    Task<InAppNotificationWriteResult> WriteAsync(
        InAppNotificationWriteRequest request,
        CancellationToken cancellationToken = default);
}
