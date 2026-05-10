using System.Globalization;
using Settleora.Api.Domain.Settlements;

namespace Settleora.Api.Settlements;

internal sealed record SettlementBasketPreviewResponse(
    DateTimeOffset GeneratedAtUtc,
    string SelectionMode,
    string Direction,
    Guid DebtorUserProfileId,
    Guid CreditorUserProfileId,
    Guid CounterpartyUserProfileId,
    Guid? GroupId,
    string Currency,
    string ExactSelectedTotal,
    int LineCount,
    IReadOnlyList<SettlementBasketPreviewLineResponse> Lines)
{
    public static SettlementBasketPreviewResponse From(
        DateTimeOffset generatedAtUtc,
        string direction,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        Guid counterpartyUserProfileId,
        Guid? groupId,
        string currency,
        IReadOnlyList<SettlementBasketPreviewLineProjection> lines)
    {
        var exactSelectedTotal = lines.Sum(line => line.ExactAmount);
        return new SettlementBasketPreviewResponse(
            generatedAtUtc,
            SettlementBasketSelectionModes.PayAllOutstandingForCounterparty,
            direction,
            debtorUserProfileId,
            creditorUserProfileId,
            counterpartyUserProfileId,
            groupId,
            currency,
            FormatAmount(exactSelectedTotal),
            lines.Count,
            lines.Select(SettlementBasketPreviewLineResponse.From).ToArray());
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }
}
internal sealed record SettlementBasketPreviewLineResponse(
    Guid SourceExpenseBillId,
    Guid? SourceBillRevisionId,
    string SourceCandidateKey,
    string ExactAmount,
    string Currency,
    string CandidateBasis,
    DateTimeOffset CreatedAtUtc)
{
    public static SettlementBasketPreviewLineResponse From(SettlementBasketPreviewLineProjection line)
    {
        return new SettlementBasketPreviewLineResponse(
            line.SourceExpenseBillId,
            line.SourceBillRevisionId,
            line.SourceCandidateKey,
            SettlementBasketPreviewResponseFormat.FormatAmount(line.ExactAmount),
            line.Currency,
            line.CandidateBasis,
            line.CreatedAtUtc);
    }
}

internal sealed record SettlementBasketPreviewLineProjection(
    Guid SourceExpenseBillId,
    Guid? SourceBillRevisionId,
    string SourceCandidateKey,
    decimal ExactAmount,
    string Currency,
    string CandidateBasis,
    DateTimeOffset CreatedAtUtc);

internal static class SettlementBasketPreviewResponseFormat
{
    public static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }
}
