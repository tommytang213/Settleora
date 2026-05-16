using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Users;

namespace Settleora.Api.Domain.RecurringBills;

public sealed class RecurringBillOccurrence
{
    public Guid Id { get; set; }

    public Guid RecurringBillTemplateId { get; set; }

    public RecurringBillTemplate RecurringBillTemplate { get; set; } = null!;

    public DateOnly OccurrenceDate { get; set; }

    public DateOnly? DueDate { get; set; }

    public string Status { get; set; } = RecurringBillOccurrenceStatuses.Forecasted;

    public Guid? GeneratedExpenseBillId { get; set; }

    public ExpenseBill? GeneratedExpenseBill { get; set; }

    public Guid? GeneratedByUserProfileId { get; set; }

    public UserProfile? GeneratedByUserProfile { get; set; }

    public DateTimeOffset? GeneratedAtUtc { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}
