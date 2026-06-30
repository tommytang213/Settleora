namespace Settleora.Api.Notifications;

internal interface INotificationDecisionEnvelopeResolver
{
    NotificationDecisionEnvelope Resolve(NotificationDecisionEnvelopeRequest request);
}

