namespace Settleora.Api.Settlements;

internal sealed record SettlementRequestResponse(
    Guid Id,
    Guid SourceExpenseBillId,
    Guid? GroupId,
    Guid DebtorUserProfileId,
    Guid CreditorUserProfileId,
    string Amount,
    string Currency,
    string Status,
    Guid RequestedByUserProfileId,
    DateTimeOffset RequestedAtUtc,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc);
