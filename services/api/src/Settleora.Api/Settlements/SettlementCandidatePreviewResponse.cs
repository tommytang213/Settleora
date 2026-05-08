namespace Settleora.Api.Settlements;

internal sealed record SettlementCandidateListResponse(
    IReadOnlyList<SettlementCandidateResponse> Candidates);

internal sealed record SettlementCandidateResponse(
    string CandidateKey,
    Guid SourceExpenseBillId,
    Guid? GroupId,
    Guid DebtorUserProfileId,
    Guid CreditorUserProfileId,
    string Amount,
    string Currency,
    string Basis,
    int AllocationOrder);
