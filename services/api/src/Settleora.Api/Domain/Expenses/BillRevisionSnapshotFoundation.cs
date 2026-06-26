using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Settleora.Api.Domain.Expenses;

internal static class BillRevisionSnapshotPolicyVersions
{
    public const string SnapshotSchemaVersion = "bill-revision-snapshot.v1";
    public const string MoneyPolicyVersion = "money-policy.v1";
    public const string RoundingPolicyVersion = "rounding-policy.v1";
}

internal static class BillRevisionSnapshotFoundation
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public static BillRevisionSnapshotMaterialization Materialize(
        BillRevisionProposalSnapshot baselineSnapshot,
        BillRevisionProposalSnapshot proposedSnapshot,
        IReadOnlyCollection<Guid> affectedUserIds,
        IReadOnlyCollection<Guid> payerConfirmationUserIds)
    {
        ArgumentNullException.ThrowIfNull(baselineSnapshot);
        ArgumentNullException.ThrowIfNull(proposedSnapshot);

        var baselineJson = SerializeSnapshot("baseline", baselineSnapshot);
        var proposedJson = SerializeSnapshot("proposed", proposedSnapshot);
        var affectedIdsJson = SerializeIds(affectedUserIds);
        var payerIdsJson = SerializeIds(payerConfirmationUserIds);
        return new BillRevisionSnapshotMaterialization(
            baselineJson,
            proposedJson,
            ComputeHash($"affected|{proposedJson}|{affectedIdsJson}"),
            affectedIdsJson,
            ComputeHash($"payer-confirmation|{proposedJson}|{payerIdsJson}"),
            payerIdsJson,
            ComputeCalculationHash(proposedJson));
    }

    public static string ComputeCalculationHash(string proposedSnapshotJson)
    {
        return ComputeHash(
            string.Join(
                '|',
                BillRevisionSnapshotPolicyVersions.SnapshotSchemaVersion,
                BillRevisionSnapshotPolicyVersions.MoneyPolicyVersion,
                BillRevisionSnapshotPolicyVersions.RoundingPolicyVersion,
                proposedSnapshotJson));
    }

    public static bool IsApplyBasisSupported(ExpenseBillRevision revision)
    {
        ArgumentNullException.ThrowIfNull(revision);

        return revision.UnsupportedDetailReason is null
            && StringComparer.Ordinal.Equals(
                revision.SnapshotSchemaVersion,
                BillRevisionSnapshotPolicyVersions.SnapshotSchemaVersion)
            && StringComparer.Ordinal.Equals(
                revision.MoneyPolicyVersion,
                BillRevisionSnapshotPolicyVersions.MoneyPolicyVersion)
            && StringComparer.Ordinal.Equals(
                revision.RoundingPolicyVersion,
                BillRevisionSnapshotPolicyVersions.RoundingPolicyVersion)
            && !string.IsNullOrWhiteSpace(revision.ProposedSnapshotJson)
            && StringComparer.Ordinal.Equals(
                revision.CalculationHash,
                ComputeCalculationHash(revision.ProposedSnapshotJson));
    }

    private static string SerializeSnapshot(string snapshotRole, BillRevisionProposalSnapshot snapshot)
    {
        var envelope = new BillRevisionSnapshotEnvelope(
            BillRevisionSnapshotPolicyVersions.SnapshotSchemaVersion,
            BillRevisionSnapshotPolicyVersions.MoneyPolicyVersion,
            BillRevisionSnapshotPolicyVersions.RoundingPolicyVersion,
            snapshotRole,
            FormatAmount(snapshot.TotalAmount),
            snapshot.TotalCurrency,
            snapshot.Participants
                .OrderBy(participant => participant.UserProfileId)
                .Select(participant => new BillRevisionSnapshotParticipant(
                    participant.UserProfileId,
                    FormatAmount(participant.ResolvedShareAmount),
                    participant.ResolvedShareCurrency))
                .ToArray(),
            snapshot.Payers
                .OrderBy(payer => payer.UserProfileId)
                .Select(payer => new BillRevisionSnapshotPayer(
                    payer.UserProfileId,
                    FormatAmount(payer.Amount),
                    payer.Currency))
                .ToArray(),
            snapshot.AttachmentFileIds.OrderBy(id => id).ToArray(),
            snapshot.ReceiptOcrReviewIds.OrderBy(id => id).ToArray());

        return JsonSerializer.Serialize(envelope, JsonOptions);
    }

    private static string SerializeIds(IReadOnlyCollection<Guid> ids)
    {
        return JsonSerializer.Serialize(ids.OrderBy(id => id).ToArray(), JsonOptions);
    }

    private static string ComputeHash(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.0000", CultureInfo.InvariantCulture);
    }
}

internal sealed record BillRevisionSnapshotMaterialization(
    string BaselineSnapshotJson,
    string ProposedSnapshotJson,
    string AffectedUserSetHash,
    string AffectedUserIdsJson,
    string PayerConfirmationBasisHash,
    string PayerConfirmationUserIdsJson,
    string CalculationHash);

internal sealed record BillRevisionSnapshotEnvelope(
    string SnapshotSchemaVersion,
    string MoneyPolicyVersion,
    string RoundingPolicyVersion,
    string SnapshotRole,
    string TotalAmount,
    string TotalCurrency,
    IReadOnlyList<BillRevisionSnapshotParticipant> Participants,
    IReadOnlyList<BillRevisionSnapshotPayer> Payers,
    IReadOnlyList<Guid> AttachmentFileIds,
    IReadOnlyList<Guid> ReceiptOcrReviewIds);

internal sealed record BillRevisionSnapshotParticipant(
    Guid UserProfileId,
    string ResolvedShareAmount,
    string ResolvedShareCurrency);

internal sealed record BillRevisionSnapshotPayer(
    Guid UserProfileId,
    string Amount,
    string Currency);
