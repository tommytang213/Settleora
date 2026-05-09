using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.Expenses;

public sealed class ExpenseBill
{
    public Guid Id { get; set; }

    public Guid CreatedByUserProfileId { get; set; }

    public UserProfile CreatedByUserProfile { get; set; } = null!;

    public Guid BillOwnerUserProfileId { get; set; }

    public UserProfile BillOwnerUserProfile { get; set; } = null!;

    public Guid? ActiveAcceptedBillRevisionId { get; set; }

    public Guid? GroupId { get; set; }

    public UserGroup? Group { get; set; }

    public string? MerchantName { get; set; }

    public DateOnly BillDate { get; set; }

    public string Status { get; set; } = ExpenseBillStatuses.Draft;

    public decimal TotalAmount { get; set; }

    public string TotalCurrency { get; set; } = string.Empty;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? ArchivedAtUtc { get; set; }

    public ICollection<ExpenseBillItem> Items { get; } = new List<ExpenseBillItem>();

    public ICollection<ExpenseBillParticipant> Participants { get; } = new List<ExpenseBillParticipant>();

    public ICollection<ExpenseBillPayer> Payers { get; } = new List<ExpenseBillPayer>();

    public ICollection<ExpenseBillAdjustment> Adjustments { get; } = new List<ExpenseBillAdjustment>();

    public ICollection<ExpenseBillAttachment> Attachments { get; } = new List<ExpenseBillAttachment>();

    public ICollection<ExpenseBillRevision> Revisions { get; } = new List<ExpenseBillRevision>();
}
