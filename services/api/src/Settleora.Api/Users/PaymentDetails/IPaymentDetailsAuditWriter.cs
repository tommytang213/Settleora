namespace Settleora.Api.Users.PaymentDetails;

internal interface IPaymentDetailsAuditWriter
{
    ValueTask WriteAsync(
        PaymentDetailsAuditEvent auditEvent,
        CancellationToken cancellationToken);
}
