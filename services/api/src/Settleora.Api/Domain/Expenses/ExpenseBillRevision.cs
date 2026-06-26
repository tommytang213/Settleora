using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Expenses;

public sealed class ExpenseBillRevision
{
    public Guid Id { get; set; }

    public Guid ExpenseBillId { get; set; }

    public ExpenseBill ExpenseBill { get; set; } = null!;

    public Guid ProposalCreatorUserProfileId { get; set; }

    public UserProfile ProposalCreatorUserProfile { get; set; } = null!;

    public Guid? SupersedesExpenseBillRevisionId { get; set; }

    public Guid? SupersededByExpenseBillRevisionId { get; set; }

    public int RevisionSequence { get; set; }

    public string Status { get; set; } = ExpenseBillRevisionStatuses.DraftRevision;

    public decimal TotalAmount { get; set; }

    public string TotalCurrency { get; set; } = string.Empty;

    public string CalculationHash { get; set; } = string.Empty;

    public string SnapshotSchemaVersion { get; set; } = BillRevisionSnapshotPolicyVersions.SnapshotSchemaVersion;

    public string MoneyPolicyVersion { get; set; } = BillRevisionSnapshotPolicyVersions.MoneyPolicyVersion;

    public string RoundingPolicyVersion { get; set; } = BillRevisionSnapshotPolicyVersions.RoundingPolicyVersion;

    public string BaselineSnapshotJson { get; set; } = string.Empty;

    public string ProposedSnapshotJson { get; set; } = string.Empty;

    public string AffectedUserSetHash { get; set; } = string.Empty;

    public string AffectedUserIdsJson { get; set; } = "[]";

    public string PayerConfirmationBasisHash { get; set; } = string.Empty;

    public string PayerConfirmationUserIdsJson { get; set; } = "[]";

    public string? UnsupportedDetailReason { get; set; }

    public string? RequestId { get; set; }

    public string? CorrelationId { get; set; }

    public DateTimeOffset? SubmittedAtUtc { get; set; }

    public DateTimeOffset? WithdrawnAtUtc { get; set; }

    public DateTimeOffset? SupersededAtUtc { get; set; }

    public DateTimeOffset? RejectedAtUtc { get; set; }

    public DateTimeOffset? AppliedAtUtc { get; set; }

    public DateTimeOffset? CancelledAtUtc { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public ICollection<ExpenseBillRevisionParticipant> Participants { get; } = new List<ExpenseBillRevisionParticipant>();

    public ICollection<ExpenseBillRevisionPayer> Payers { get; } = new List<ExpenseBillRevisionPayer>();

    public ICollection<ExpenseBillRevisionApproval> Approvals { get; } = new List<ExpenseBillRevisionApproval>();
}
