using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.BillSearch;

internal static class ExpenseBillSearchQueries
{
    public static IQueryable<ExpenseBill> VisiblePersonalBills(
        SettleoraDbContext dbContext,
        Guid userProfileId)
    {
        return dbContext.Set<ExpenseBill>()
            .AsNoTracking()
            .Where(bill => (bill.CreatedByUserProfileId == userProfileId
                    || bill.Participants.Any(participant => participant.UserProfileId == userProfileId))
                && bill.GroupId == null
                && bill.ArchivedAtUtc == null
                && bill.CreatedByUserProfile.DeletedAtUtc == null);
    }

    public static IQueryable<ExpenseBill> VisibleGroupBills(
        SettleoraDbContext dbContext,
        Guid groupId)
    {
        return dbContext.Set<ExpenseBill>()
            .AsNoTracking()
            .Where(bill => bill.GroupId == groupId
                && bill.ArchivedAtUtc == null
                && bill.Group != null
                && bill.Group.DeletedAtUtc == null
                && bill.CreatedByUserProfile.DeletedAtUtc == null);
    }

    public static IQueryable<ExpenseBill> WithBillDetails(
        this IQueryable<ExpenseBill> query)
    {
        return query
            .Include(bill => bill.Items)
                .ThenInclude(item => item.Splits)
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .Include(bill => bill.Adjustments);
    }

    public static IQueryable<ExpenseBill> ApplySearchFilter(
        this IQueryable<ExpenseBill> query,
        ExpenseBillSearchFilter filter)
    {
        if (filter.FromDate is not null)
        {
            query = query.Where(bill => bill.BillDate >= filter.FromDate.Value);
        }

        if (filter.ToDate is not null)
        {
            query = query.Where(bill => bill.BillDate <= filter.ToDate.Value);
        }

        if (filter.Status is not null)
        {
            query = query.Where(bill => bill.Status == filter.Status);
        }

        if (filter.ReconciliationStatus is not null)
        {
            query = query.Where(bill => bill.ReconciliationStatus == filter.ReconciliationStatus);
        }

        if (filter.Currency is not null)
        {
            query = query.Where(bill => bill.TotalCurrency == filter.Currency);
        }

        if (filter.Merchant is not null)
        {
            var merchantFilter = filter.Merchant.ToUpperInvariant();
            query = query.Where(bill => bill.MerchantName != null
                && bill.MerchantName.ToUpper().Contains(merchantFilter));
        }

        if (filter.Search is not null)
        {
            var searchFilter = filter.Search.ToUpperInvariant();
            query = query.Where(bill => (bill.MerchantName != null
                    && bill.MerchantName.ToUpper().Contains(searchFilter))
                || bill.Items.Any(item => item.DeletedAtUtc == null
                    && (item.Name.ToUpper().Contains(searchFilter)
                        || (item.Note != null && item.Note.ToUpper().Contains(searchFilter))))
                || bill.Adjustments.Any(adjustment => adjustment.ReasonNote != null
                    && adjustment.ReasonNote.ToUpper().Contains(searchFilter)));
        }

        return query;
    }

    public static IOrderedQueryable<ExpenseBill> OrderForList(
        this IQueryable<ExpenseBill> query)
    {
        return query
            .OrderByDescending(bill => bill.BillDate)
            .ThenByDescending(bill => bill.CreatedAtUtc)
            .ThenByDescending(bill => bill.Id);
    }
}
