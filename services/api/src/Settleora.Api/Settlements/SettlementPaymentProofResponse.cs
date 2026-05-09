using Settleora.Api.Domain.Settlements;

namespace Settleora.Api.Settlements;

internal sealed record SettlementPaymentProofListResponse(
    IReadOnlyList<SettlementPaymentProofResponse> Proofs);

internal sealed record SettlementPaymentProofResponse(
    Guid FileId,
    Guid SettlementPaymentId,
    string ContentType,
    long SizeBytes,
    DateTimeOffset UploadedAtUtc,
    DateTimeOffset UpdatedAtUtc)
{
    public static SettlementPaymentProofResponse From(SettlementProofAttachment attachment)
    {
        return new SettlementPaymentProofResponse(
            attachment.FileObjectId,
            attachment.SettlementPaymentId,
            attachment.FileObject.ContentType,
            attachment.FileObject.SizeBytes,
            attachment.CreatedAtUtc,
            attachment.FileObject.UpdatedAtUtc);
    }
}
