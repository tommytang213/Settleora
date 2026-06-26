namespace Settleora.Api.Domain.Expenses;

internal static class BillRevisionCalculationHash
{
    public static string Create(BillRevisionProposalSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        return BillRevisionSnapshotFoundation
            .Materialize(snapshot, snapshot, [], [])
            .CalculationHash;
    }
}
