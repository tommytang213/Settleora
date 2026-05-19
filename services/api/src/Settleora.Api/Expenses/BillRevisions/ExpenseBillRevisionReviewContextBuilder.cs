using System.Globalization;
using Settleora.Api.Domain.Expenses;

namespace Settleora.Api.Expenses.BillRevisions;

internal static class ExpenseBillRevisionReviewContextBuilder
{
    private const string BaselineTypeNoPriorBaseline = "no_prior_baseline";
    private const string BaselineTypeActiveAcceptedBill = "active_accepted_bill";
    private const string BaselineTypePreviousRevisionApproval = "previous_revision_approval";
    private const string BaselineTypePreviousRevisionRejection = "previous_revision_rejection";
    private const string DefaultViewModeFullBill = "full_bill";
    private const string DefaultViewModeChangedOnly = "changed_only";
    private const string FullViewReasonNoPriorBaseline = "no_prior_baseline_full_bill_recommended";
    private const string FullViewReasonBaselineAvailable = "baseline_available_full_view_optional";
    private const string SupportStatusSupported = "supported";
    private const string SupportStatusUnsupported = "unsupported_in_current_revision_snapshot";
    private const string ViewerImpactAffected = "viewer_affected";
    private const string ViewerImpactUnaffected = "viewer_unaffected";
    private const string ViewerImpactNotAvailable = "not_available";
    private const string DirectViewerMoneyImpact = "direct_viewer_money_impact";
    private const string DirectViewerPayerImpact = "direct_viewer_payer_impact";
    private const string BillContextImpact = "bill_context";
    private const string NoDirectViewerImpact = "no_direct_viewer_impact";

    private static readonly string[] UnsupportedCategories =
    [
        "item",
        "item_split",
        "adjustment",
        "attachment_receipt_ocr_review",
        "note_metadata"
    ];

    public static ExpenseBillRevisionReviewContextResponse Build(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid viewerUserProfileId)
    {
        ArgumentNullException.ThrowIfNull(bill);
        ArgumentNullException.ThrowIfNull(revision);

        var proposedSnapshot = BillRevisionReviewSnapshot.FromRevision(revision);
        var baseline = ResolveBaseline(bill, revision, viewerUserProfileId);
        var comparisonSnapshot = baseline.Snapshot ?? BillRevisionReviewSnapshot.FromBill(bill);
        var changes = BuildChanges(
            revision.Id,
            comparisonSnapshot,
            proposedSnapshot,
            viewerUserProfileId)
            .OrderBy(change => change.ChangeScope, StringComparer.Ordinal)
            .ThenBy(change => change.RelatedUserProfileId)
            .ThenBy(change => change.ChangeType, StringComparer.Ordinal)
            .ToArray();
        var changeSummary = BuildChangeSummary(changes).ToArray();
        var defaultViewMode = baseline.Response.BaselineType == BaselineTypeNoPriorBaseline
            ? DefaultViewModeFullBill
            : DefaultViewModeChangedOnly;
        var fullViewRecommendedReason = baseline.Response.BaselineType == BaselineTypeNoPriorBaseline
            ? FullViewReasonNoPriorBaseline
            : FullViewReasonBaselineAvailable;

        return new ExpenseBillRevisionReviewContextResponse(
            viewerUserProfileId,
            baseline.Response,
            defaultViewMode,
            fullViewRecommendedReason,
            BuildViewerFinancialImpact(baseline.Snapshot, proposedSnapshot, revision, viewerUserProfileId),
            changeSummary,
            changes,
            [
                "last_view_without_approval_or_rejection_not_persisted",
                "item_split_attachment_note_diff_unsupported_in_current_revision_snapshot"
            ]);
    }

    private static ResolvedReviewBaseline ResolveBaseline(
        ExpenseBill bill,
        ExpenseBillRevision revision,
        Guid viewerUserProfileId)
    {
        var previousReview = bill.Revisions
            .Where(candidate => candidate.Id != revision.Id)
            .SelectMany(candidate => candidate.Approvals
                .Where(approval => approval.ParticipantUserProfileId == viewerUserProfileId)
                .Select(approval => new PreviousReview(candidate, approval, ReviewTimestamp(approval))))
            .Where(candidate => candidate.ReviewedAtUtc is not null)
            .OrderByDescending(candidate => candidate.ReviewedAtUtc)
            .ThenByDescending(candidate => candidate.Revision.UpdatedAtUtc)
            .ThenByDescending(candidate => candidate.Revision.Id)
            .FirstOrDefault();
        if (previousReview is not null)
        {
            var baselineType = previousReview.Approval.RejectedAtUtc is not null
                ? BaselineTypePreviousRevisionRejection
                : BaselineTypePreviousRevisionApproval;

            return new ResolvedReviewBaseline(
                new ExpenseBillRevisionReviewBaselineResponse(
                    baselineType,
                    previousReview.Revision.Id,
                    previousReview.Revision.Status,
                    previousReview.ReviewedAtUtc,
                    "derived_from_previous_revision_approval_state"),
                BillRevisionReviewSnapshot.FromRevision(previousReview.Revision));
        }

        if (HasActiveAcceptedBillBaseline(bill, viewerUserProfileId))
        {
            return new ResolvedReviewBaseline(
                new ExpenseBillRevisionReviewBaselineResponse(
                    BaselineTypeActiveAcceptedBill,
                    bill.ActiveAcceptedBillRevisionId,
                    null,
                    ActiveBaselineTimestamp(bill, viewerUserProfileId),
                    "derived_from_current_active_bill_acceptance_or_payer_confirmation"),
                BillRevisionReviewSnapshot.FromBill(bill));
        }

        return new ResolvedReviewBaseline(
            new ExpenseBillRevisionReviewBaselineResponse(
                BaselineTypeNoPriorBaseline,
                null,
                null,
                null,
                "no_safe_prior_acceptance_review_or_rejection_found"),
            Snapshot: null);
    }

    private static bool HasActiveAcceptedBillBaseline(ExpenseBill bill, Guid viewerUserProfileId)
    {
        var participant = bill.Participants.SingleOrDefault(candidate => candidate.UserProfileId == viewerUserProfileId);
        if (participant?.Status == ExpenseBillParticipantStatuses.Accepted
            && participant.AcceptedAtUtc is not null)
        {
            return true;
        }

        if (bill.Payers.Any(payer =>
                payer.UserProfileId == viewerUserProfileId
                && payer.PayerConfirmationStatus == ExpenseBillPayerConfirmationStatuses.Confirmed))
        {
            return true;
        }

        return bill.BillOwnerUserProfileId == viewerUserProfileId
            && bill.Status == ExpenseBillStatuses.Confirmed;
    }

    private static DateTimeOffset? ActiveBaselineTimestamp(ExpenseBill bill, Guid viewerUserProfileId)
    {
        var participantAcceptedAt = bill.Participants
            .Where(participant => participant.UserProfileId == viewerUserProfileId)
            .Select(participant => participant.AcceptedAtUtc)
            .FirstOrDefault(timestamp => timestamp is not null);
        if (participantAcceptedAt is not null)
        {
            return participantAcceptedAt;
        }

        var payerConfirmedAt = bill.Payers
            .Where(payer => payer.UserProfileId == viewerUserProfileId)
            .Select(payer => payer.PayerConfirmedAtUtc)
            .FirstOrDefault(timestamp => timestamp is not null);

        return payerConfirmedAt ?? bill.UpdatedAtUtc;
    }

    private static DateTimeOffset? ReviewTimestamp(ExpenseBillRevisionApproval approval)
    {
        return approval.RejectedAtUtc
            ?? approval.ApprovedAtUtc;
    }

    private static ExpenseBillRevisionViewerFinancialImpactResponse BuildViewerFinancialImpact(
        BillRevisionReviewSnapshot? baselineSnapshot,
        BillRevisionReviewSnapshot proposedSnapshot,
        ExpenseBillRevision revision,
        Guid viewerUserProfileId)
    {
        var previousShare = baselineSnapshot?.Participants.GetValueOrDefault(viewerUserProfileId);
        var proposedShare = proposedSnapshot.Participants.GetValueOrDefault(viewerUserProfileId);
        var previousPayer = baselineSnapshot?.Payers.GetValueOrDefault(viewerUserProfileId);
        var proposedPayer = proposedSnapshot.Payers.GetValueOrDefault(viewerUserProfileId);
        var revisionParticipant = revision.Participants.SingleOrDefault(participant =>
            participant.UserProfileId == viewerUserProfileId);
        var revisionPayer = revision.Payers.SingleOrDefault(payer =>
            payer.UserProfileId == viewerUserProfileId);
        var affected = revisionParticipant?.AffectedByRevision == true
            || HasMoneyChanged(previousPayer, proposedPayer)
            || revisionPayer?.RequiresPayerConfirmation == true;

        return new ExpenseBillRevisionViewerFinancialImpactResponse(
            ToMoneyValue(previousShare),
            ToMoneyValue(proposedShare),
            DeltaMoneyValue(previousShare, proposedShare),
            affected,
            proposedPayer is not null,
            proposedPayer is null
                ? null
                : new ExpenseBillRevisionPayerFinancialImpactResponse(
                    ToMoneyValue(previousPayer),
                    ToMoneyValue(proposedPayer),
                    DeltaMoneyValue(previousPayer, proposedPayer),
                    revisionPayer?.RequiresPayerConfirmation ?? false,
                    revisionPayer?.PayerConfirmationStatus));
    }

    private static IEnumerable<ExpenseBillRevisionChangeCategorySummaryResponse> BuildChangeSummary(
        IReadOnlyCollection<ExpenseBillRevisionChangeResponse> changes)
    {
        foreach (var category in new[] { "bill_total", "participant_share", "payer_contribution", "payer_role" })
        {
            var categoryChanges = changes.Where(change => change.ChangeScope == category).ToArray();
            yield return new ExpenseBillRevisionChangeCategorySummaryResponse(
                category,
                SupportStatusSupported,
                categoryChanges.Length,
                categoryChanges.Any(change => change.ViewerImpact is DirectViewerMoneyImpact or DirectViewerPayerImpact)
                    ? ViewerImpactAffected
                    : ViewerImpactUnaffected);
        }

        foreach (var category in UnsupportedCategories)
        {
            yield return new ExpenseBillRevisionChangeCategorySummaryResponse(
                category,
                SupportStatusUnsupported,
                0,
                ViewerImpactNotAvailable);
        }
    }

    private static IEnumerable<ExpenseBillRevisionChangeResponse> BuildChanges(
        Guid revisionId,
        BillRevisionReviewSnapshot before,
        BillRevisionReviewSnapshot after,
        Guid viewerUserProfileId)
    {
        if (before.TotalAmount != after.TotalAmount
            || !StringComparer.Ordinal.Equals(before.TotalCurrency, after.TotalCurrency))
        {
            yield return new ExpenseBillRevisionChangeResponse(
                $"revision:{revisionId:D}:bill_total",
                "bill_total_changed",
                "bill_total",
                "totalAmount",
                null,
                DisplayValue(before.TotalAmount, before.TotalCurrency),
                DisplayValue(after.TotalAmount, after.TotalCurrency),
                BillContextImpact,
                $"Bill total changed from {FormatMoneyDisplay(before.TotalAmount, before.TotalCurrency)} to {FormatMoneyDisplay(after.TotalAmount, after.TotalCurrency)}.",
                "total_amount_or_currency_changed");
        }

        foreach (var userProfileId in before.Participants.Keys.Concat(after.Participants.Keys).Distinct().OrderBy(id => id))
        {
            var beforeParticipant = before.Participants.GetValueOrDefault(userProfileId);
            var afterParticipant = after.Participants.GetValueOrDefault(userProfileId);
            if (!HasMoneyChanged(beforeParticipant, afterParticipant))
            {
                continue;
            }

            var changeType = beforeParticipant is null
                ? "participant_share_added"
                : afterParticipant is null
                    ? "participant_share_removed"
                    : "participant_share_changed";
            yield return new ExpenseBillRevisionChangeResponse(
                $"revision:{revisionId:D}:participant_share:{userProfileId:D}",
                changeType,
                "participant_share",
                $"participants[{userProfileId:D}].resolvedShareAmount",
                userProfileId,
                ToDisplayValue(beforeParticipant),
                ToDisplayValue(afterParticipant),
                userProfileId == viewerUserProfileId ? DirectViewerMoneyImpact : NoDirectViewerImpact,
                AccessibleParticipantLabel(beforeParticipant, afterParticipant, userProfileId == viewerUserProfileId),
                "participant_share_amount_or_currency_changed");
        }

        foreach (var userProfileId in before.Payers.Keys.Concat(after.Payers.Keys).Distinct().OrderBy(id => id))
        {
            var beforePayer = before.Payers.GetValueOrDefault(userProfileId);
            var afterPayer = after.Payers.GetValueOrDefault(userProfileId);
            if (!HasMoneyChanged(beforePayer, afterPayer))
            {
                continue;
            }

            var changeType = beforePayer is null
                ? "payer_role_added"
                : afterPayer is null
                    ? "payer_role_removed"
                    : "payer_contribution_changed";
            var changeScope = beforePayer is null || afterPayer is null
                ? "payer_role"
                : "payer_contribution";

            yield return new ExpenseBillRevisionChangeResponse(
                $"revision:{revisionId:D}:{changeScope}:{userProfileId:D}",
                changeType,
                changeScope,
                $"payers[{userProfileId:D}].amount",
                userProfileId,
                ToDisplayValue(beforePayer),
                ToDisplayValue(afterPayer),
                userProfileId == viewerUserProfileId ? DirectViewerPayerImpact : NoDirectViewerImpact,
                AccessiblePayerLabel(beforePayer, afterPayer, userProfileId == viewerUserProfileId),
                beforePayer is null || afterPayer is null
                    ? "payer_role_added_or_removed"
                    : "payer_contribution_amount_or_currency_changed");
        }
    }

    private static ExpenseBillRevisionMoneyValueResponse? ToMoneyValue(ReviewMoney? value)
    {
        return value is null
            ? null
            : new ExpenseBillRevisionMoneyValueResponse(FormatAmount(value.Amount), value.Currency);
    }

    private static ExpenseBillRevisionMoneyValueResponse? DeltaMoneyValue(ReviewMoney? before, ReviewMoney? after)
    {
        if (before is null
            || after is null
            || !StringComparer.Ordinal.Equals(before.Currency, after.Currency))
        {
            return null;
        }

        return new ExpenseBillRevisionMoneyValueResponse(
            FormatAmount(after.Amount - before.Amount),
            after.Currency);
    }

    private static ExpenseBillRevisionDisplayValueResponse? ToDisplayValue(ReviewMoney? value)
    {
        return value is null
            ? null
            : DisplayValue(value.Amount, value.Currency);
    }

    private static ExpenseBillRevisionDisplayValueResponse DisplayValue(decimal amount, string currency)
    {
        return new ExpenseBillRevisionDisplayValueResponse(
            FormatMoneyDisplay(amount, currency),
            FormatAmount(amount),
            currency);
    }

    private static bool HasMoneyChanged(ReviewMoney? before, ReviewMoney? after)
    {
        if (before is null || after is null)
        {
            return before is not null || after is not null;
        }

        return before.Amount != after.Amount
            || !StringComparer.Ordinal.Equals(before.Currency, after.Currency);
    }

    private static string AccessibleParticipantLabel(ReviewMoney? before, ReviewMoney? after, bool viewerSpecific)
    {
        var prefix = viewerSpecific ? "Your share" : "Participant share";
        return AccessibleMoneyChangeLabel(prefix, before, after);
    }

    private static string AccessiblePayerLabel(ReviewMoney? before, ReviewMoney? after, bool viewerSpecific)
    {
        var prefix = viewerSpecific ? "Your payer contribution" : "Payer contribution";
        return AccessibleMoneyChangeLabel(prefix, before, after);
    }

    private static string AccessibleMoneyChangeLabel(string prefix, ReviewMoney? before, ReviewMoney? after)
    {
        if (before is null && after is not null)
        {
            return $"{prefix} added at {FormatMoneyDisplay(after.Amount, after.Currency)}.";
        }

        if (before is not null && after is null)
        {
            return $"{prefix} removed from {FormatMoneyDisplay(before.Amount, before.Currency)}.";
        }

        if (before is not null && after is not null)
        {
            return $"{prefix} changed from {FormatMoneyDisplay(before.Amount, before.Currency)} to {FormatMoneyDisplay(after.Amount, after.Currency)}.";
        }

        return $"{prefix} unchanged.";
    }

    private static string FormatMoneyDisplay(decimal amount, string currency)
    {
        return $"{currency} {FormatAmount(amount)}";
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private sealed record ResolvedReviewBaseline(
        ExpenseBillRevisionReviewBaselineResponse Response,
        BillRevisionReviewSnapshot? Snapshot);

    private sealed record PreviousReview(
        ExpenseBillRevision Revision,
        ExpenseBillRevisionApproval Approval,
        DateTimeOffset? ReviewedAtUtc);

    private sealed record ReviewMoney(
        decimal Amount,
        string Currency);

    private sealed record BillRevisionReviewSnapshot(
        decimal TotalAmount,
        string TotalCurrency,
        IReadOnlyDictionary<Guid, ReviewMoney> Participants,
        IReadOnlyDictionary<Guid, ReviewMoney> Payers)
    {
        public static BillRevisionReviewSnapshot FromBill(ExpenseBill bill)
        {
            return new BillRevisionReviewSnapshot(
                bill.TotalAmount,
                bill.TotalCurrency,
                bill.Participants.ToDictionary(
                    participant => participant.UserProfileId,
                    participant => new ReviewMoney(
                        participant.ResolvedShareAmount,
                        participant.ResolvedShareCurrency)),
                bill.Payers
                    .GroupBy(payer => payer.UserProfileId)
                    .ToDictionary(
                        group => group.Key,
                        group =>
                        {
                            var first = group.First();
                            return new ReviewMoney(
                                group.Sum(payer => payer.Amount),
                                first.Currency);
                        }));
        }

        public static BillRevisionReviewSnapshot FromRevision(ExpenseBillRevision revision)
        {
            return new BillRevisionReviewSnapshot(
                revision.TotalAmount,
                revision.TotalCurrency,
                revision.Participants.ToDictionary(
                    participant => participant.UserProfileId,
                    participant => new ReviewMoney(
                        participant.ResolvedShareAmount,
                        participant.ResolvedShareCurrency)),
                revision.Payers.ToDictionary(
                    payer => payer.UserProfileId,
                    payer => new ReviewMoney(
                        payer.Amount,
                        payer.Currency)));
        }
    }
}
