namespace Settleora.Api.Notifications;

internal interface INotificationDecisionPolicyResolver
{
    Task<NotificationDecisionEnvelope> ResolveAsync(
        NotificationDecisionEnvelopeRequest request,
        CancellationToken cancellationToken);
}
