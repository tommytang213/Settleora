using Settleora.Api.Domain.Expenses;

namespace Settleora.Api.Expenses.RecurringBills;

internal static class RecurringBillDraftBuilder
{
    public static ExpenseBill CreateDraftBill(
        Guid? groupId,
        Guid ownerUserProfileId,
        Guid actorUserProfileId,
        string? merchantName,
        DateOnly billDate,
        RecurringBillTemplatePayload payload,
        DateTimeOffset now)
    {
        var bill = new ExpenseBill
        {
            Id = Guid.NewGuid(),
            CreatedByUserProfileId = actorUserProfileId,
            BillOwnerUserProfileId = groupId is null ? ownerUserProfileId : actorUserProfileId,
            GroupId = groupId,
            MerchantName = merchantName,
            BillDate = billDate,
            Status = ExpenseBillStatuses.Draft,
            TotalAmount = 0m,
            TotalCurrency = payload.Currency,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        foreach (var participantId in ResolveParticipantIds(payload, ownerUserProfileId, actorUserProfileId, groupId is not null))
        {
            bill.Participants.Add(new ExpenseBillParticipant
            {
                ExpenseBillId = bill.Id,
                UserProfileId = participantId,
                Status = ExpenseBillParticipantStatuses.PendingAcceptance,
                ResolvedShareAmount = 0m,
                ResolvedShareCurrency = payload.Currency,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        for (var itemIndex = 0; itemIndex < payload.Items.Count; itemIndex++)
        {
            var itemPayload = payload.Items[itemIndex];
            var item = new ExpenseBillItem
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = bill.Id,
                Name = itemPayload.Name,
                Note = itemPayload.Note,
                Amount = itemPayload.Amount,
                Currency = itemPayload.Currency,
                SortOrder = itemIndex,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            IReadOnlyList<RecurringBillTemplatePayloadItemSplit> splits = itemPayload.Splits.Count == 0 && groupId is null
                ? [new RecurringBillTemplatePayloadItemSplit(
                    ownerUserProfileId,
                    ExpenseBillItemSplitMethods.ExactAmount,
                    itemPayload.Amount,
                    0)]
                : itemPayload.Splits;

            foreach (var splitPayload in splits)
            {
                item.Splits.Add(new ExpenseBillItemSplit
                {
                    Id = Guid.NewGuid(),
                    ExpenseBillItemId = item.Id,
                    UserProfileId = splitPayload.UserProfileId,
                    SplitMethod = splitPayload.SplitMethod,
                    BasisValue = splitPayload.BasisValue,
                    ResolvedAmount = 0m,
                    ResolvedCurrency = itemPayload.Currency,
                    AllocationOrder = splitPayload.AllocationOrder,
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now
                });
            }

            bill.Items.Add(item);
        }

        for (var adjustmentIndex = 0; adjustmentIndex < payload.Adjustments.Count; adjustmentIndex++)
        {
            var adjustmentPayload = payload.Adjustments[adjustmentIndex];
            bill.Adjustments.Add(new ExpenseBillAdjustment
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = bill.Id,
                Type = adjustmentPayload.Type,
                Direction = adjustmentPayload.Direction,
                AllocationMethod = adjustmentPayload.AllocationMethod,
                Amount = adjustmentPayload.Amount,
                Currency = adjustmentPayload.Currency,
                ReasonNote = adjustmentPayload.ReasonNote,
                SortOrder = adjustmentIndex,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        return bill;
    }

    public static void AddPayers(
        ExpenseBill bill,
        Guid defaultPayerUserProfileId,
        Guid actorUserProfileId,
        RecurringBillTemplatePayload payload,
        decimal resolvedBillTotal,
        string resolvedCurrency,
        DateTimeOffset now)
    {
        if (payload.Payers.Count == 0)
        {
            var defaultPayer = new ExpenseBillPayer
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = bill.Id,
                UserProfileId = defaultPayerUserProfileId,
                Amount = resolvedBillTotal,
                Currency = resolvedCurrency,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            ExpenseBillPayerConfirmationPolicy.ApplyCreatedBy(defaultPayer, actorUserProfileId, now);
            bill.Payers.Add(defaultPayer);
            return;
        }

        foreach (var payerPayload in payload.Payers)
        {
            var payer = new ExpenseBillPayer
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = bill.Id,
                UserProfileId = payerPayload.UserProfileId,
                Amount = payerPayload.Amount,
                Currency = payerPayload.Currency,
                PaymentMethodLabelSnapshot = payerPayload.PaymentMethodLabelSnapshot,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            ExpenseBillPayerConfirmationPolicy.ApplyCreatedBy(payer, actorUserProfileId, now);
            bill.Payers.Add(payer);
        }
    }

    public static void ApplyCalculation(
        ExpenseBill bill,
        ExpenseBillCalculationResult calculation)
    {
        bill.TotalAmount = calculation.BillTotal!.Amount;
        bill.TotalCurrency = calculation.BillTotal.Currency.Value;

        var splitsById = bill.Items
            .SelectMany(item => item.Splits)
            .ToDictionary(split => split.Id);
        foreach (var calculatedSplit in calculation.ItemSplits)
        {
            var split = splitsById[calculatedSplit.ExpenseBillItemSplitId];
            split.ResolvedAmount = calculatedSplit.ResolvedAmount;
            split.ResolvedCurrency = calculatedSplit.ResolvedCurrency;
            split.ReceivedResidualMinorUnit = calculatedSplit.ReceivedResidualMinorUnit;
        }

        var participantsById = bill.Participants.ToDictionary(participant => participant.UserProfileId);
        foreach (var calculatedShare in calculation.ParticipantShares)
        {
            var participant = participantsById[calculatedShare.UserProfileId];
            participant.ResolvedShareAmount = calculatedShare.ResolvedShareAmount;
            participant.ResolvedShareCurrency = calculatedShare.ResolvedShareCurrency;
            participant.Status = calculatedShare.Status;
        }
    }

    public static IReadOnlySet<Guid> ReferencedProfileIds(
        RecurringBillTemplatePayload payload,
        Guid ownerUserProfileId,
        Guid actorUserProfileId,
        bool isGroupTemplate)
    {
        var profileIds = new HashSet<Guid>();
        foreach (var split in payload.Items.SelectMany(item => item.Splits))
        {
            profileIds.Add(split.UserProfileId);
        }

        foreach (var payer in payload.Payers)
        {
            profileIds.Add(payer.UserProfileId);
        }

        if (payload.Payers.Count == 0)
        {
            profileIds.Add(isGroupTemplate ? actorUserProfileId : ownerUserProfileId);
        }

        if (!isGroupTemplate)
        {
            profileIds.Add(ownerUserProfileId);
        }

        return profileIds;
    }

    private static IReadOnlyList<Guid> ResolveParticipantIds(
        RecurringBillTemplatePayload payload,
        Guid ownerUserProfileId,
        Guid actorUserProfileId,
        bool isGroupTemplate)
    {
        var participantIds = new List<Guid>();
        foreach (var split in payload.Items.SelectMany(item => item.Splits))
        {
            AddParticipantId(participantIds, split.UserProfileId);
        }

        if (!isGroupTemplate
            && payload.Items.Any(item => item.Splits.Count == 0))
        {
            AddParticipantId(participantIds, ownerUserProfileId);
        }

        if (payload.Payers.Count == 0)
        {
            AddParticipantId(participantIds, isGroupTemplate ? actorUserProfileId : ownerUserProfileId);
        }
        else
        {
            foreach (var payer in payload.Payers)
            {
                AddParticipantId(participantIds, payer.UserProfileId);
            }
        }

        return participantIds;
    }

    private static void AddParticipantId(
        ICollection<Guid> participantIds,
        Guid participantId)
    {
        if (!participantIds.Contains(participantId))
        {
            participantIds.Add(participantId);
        }
    }
}
