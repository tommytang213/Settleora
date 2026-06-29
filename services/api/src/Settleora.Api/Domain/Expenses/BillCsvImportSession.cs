using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Expenses;

public sealed class BillCsvImportSession
{
    public Guid Id { get; set; }

    public Guid AuthAccountId { get; set; }

    public AuthAccount AuthAccount { get; set; } = null!;

    public Guid AuthSessionId { get; set; }

    public AuthSession AuthSession { get; set; } = null!;

    public Guid ActorUserProfileId { get; set; }

    public UserProfile ActorUserProfile { get; set; } = null!;

    public string Scope { get; set; } = BillCsvImportSessionScopes.Personal;

    public Guid? GroupId { get; set; }

    public UserGroup? Group { get; set; }

    public string Status { get; set; } = BillCsvImportSessionStatuses.ReadyForConfirmation;

    public string PayloadDigest { get; set; } = string.Empty;

    public string PreflightResultVersion { get; set; } = string.Empty;

    public string ConfirmationChallengeId { get; set; } = string.Empty;

    public string ReviewJson { get; set; } = string.Empty;

    public string CandidateJson { get; set; } = "[]";

    public int RowCount { get; set; }

    public int AcceptedRowCount { get; set; }

    public int WarningRowCount { get; set; }

    public int RejectedRowCount { get; set; }

    public int DuplicateCandidateRowCount { get; set; }

    public DateTimeOffset ExpiresAtUtc { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? ConfirmedAtUtc { get; set; }

    public DateTimeOffset? DiscardedAtUtc { get; set; }
}
