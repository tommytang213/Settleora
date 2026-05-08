using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Money;

namespace Settleora.Api.Tests;

public sealed class SettlementCandidateDerivationServiceTests
{
    private static readonly Guid ParticipantOne = StableGuid(1);
    private static readonly Guid ParticipantTwo = StableGuid(2);
    private static readonly Guid ParticipantThree = StableGuid(3);
    private static readonly Guid ParticipantFour = StableGuid(4);
    private static readonly Guid GroupId = StableGuid(50);

    private readonly SettlementCandidateDerivationService service = new();

    [Fact]
    public void SettlementCandidateSimpleTwoPersonBillDerivesSingleCandidate()
    {
        var bill = CreateConfirmedBill();
        AddParticipant(bill, ParticipantOne, 50m);
        AddParticipant(bill, ParticipantTwo, 50m);
        AddPayer(bill, ParticipantOne, 100m);

        var result = service.DeriveCandidates(bill);

        AssertSucceeded(result);
        AssertMoney(100m, "USD", result.ParticipantTotal!);
        AssertMoney(100m, "USD", result.PayerContributionTotal!);
        var candidate = Assert.Single(result.Candidates);
        Assert.Equal(CandidateKey(bill.Id, ParticipantTwo, ParticipantOne, 50m, "USD"), candidate.CandidateKey);
        Assert.Equal(bill.Id, candidate.SourceExpenseBillId);
        Assert.Null(candidate.GroupId);
        Assert.Equal(ParticipantTwo, candidate.DebtorUserProfileId);
        Assert.Equal(ParticipantOne, candidate.CreditorUserProfileId);
        Assert.Equal(50m, candidate.Amount);
        Assert.Equal("USD", candidate.Currency);
        Assert.Equal(SettlementCandidateDerivationService.BasisConfirmedBillNetPositionV1, candidate.Basis);
        Assert.Equal(0, candidate.AllocationOrder);
        Assert.Equal(-50m, candidate.DebtorNetPositionAmount);
        Assert.Equal(50m, candidate.CreditorNetPositionAmount);
        AssertNetPosition(result, ParticipantOne, 100m, 50m, 50m, "creditor");
        AssertNetPosition(result, ParticipantTwo, 0m, 50m, -50m, "debtor");
    }

    [Fact]
    public void SettlementCandidateMultiParticipantOnePayerAllocatesDebtorsToCreditor()
    {
        var bill = CreateConfirmedBill();
        AddParticipant(bill, ParticipantOne, 30m);
        AddParticipant(bill, ParticipantTwo, 30m);
        AddParticipant(bill, ParticipantThree, 30m);
        AddPayer(bill, ParticipantOne, 90m);

        var result = service.DeriveCandidates(bill);

        AssertSucceeded(result);
        AssertCandidateSequence(
            result,
            [
                (ParticipantTwo, ParticipantOne, 30m),
                (ParticipantThree, ParticipantOne, 30m)
            ]);
    }

    [Fact]
    public void SettlementCandidateMultiPayerBillAllocatesMultipleDebtorsAndCreditors()
    {
        var bill = CreateConfirmedBill();
        AddParticipant(bill, ParticipantOne, 10m);
        AddParticipant(bill, ParticipantTwo, 50m);
        AddParticipant(bill, ParticipantThree, 20m);
        AddParticipant(bill, ParticipantFour, 70m);
        AddPayer(bill, ParticipantOne, 40m);
        AddPayer(bill, ParticipantTwo, 10m);
        AddPayer(bill, ParticipantThree, 50m);
        AddPayer(bill, ParticipantFour, 50m);

        var result = service.DeriveCandidates(bill);

        AssertSucceeded(result);
        AssertCandidateSequence(
            result,
            [
                (ParticipantTwo, ParticipantOne, 30m),
                (ParticipantTwo, ParticipantThree, 10m),
                (ParticipantFour, ParticipantThree, 20m)
            ]);
    }

    [Fact]
    public void SettlementCandidateExactZeroNetParticipantIsIgnored()
    {
        var bill = CreateConfirmedBill();
        AddParticipant(bill, ParticipantOne, 50m);
        AddParticipant(bill, ParticipantTwo, 50m);
        AddParticipant(bill, ParticipantThree, 50m);
        AddPayer(bill, ParticipantOne, 50m);
        AddPayer(bill, ParticipantTwo, 100m);

        var result = service.DeriveCandidates(bill);

        AssertSucceeded(result);
        var candidate = Assert.Single(result.Candidates);
        Assert.Equal(ParticipantThree, candidate.DebtorUserProfileId);
        Assert.Equal(ParticipantTwo, candidate.CreditorUserProfileId);
        Assert.Equal(50m, candidate.Amount);
        Assert.DoesNotContain(
            result.Candidates,
            candidate => candidate.DebtorUserProfileId == ParticipantOne
                || candidate.CreditorUserProfileId == ParticipantOne);
        AssertNetPosition(result, ParticipantOne, 50m, 50m, 0m, "balanced");
    }

    [Fact]
    public void SettlementCandidateOrderingIsDeterministicAcrossInputOrder()
    {
        var bill = CreateConfirmedBill();
        AddParticipant(bill, ParticipantFour, 70m);
        AddParticipant(bill, ParticipantTwo, 50m);
        AddParticipant(bill, ParticipantThree, 20m);
        AddParticipant(bill, ParticipantOne, 10m);
        AddPayer(bill, ParticipantFour, 50m);
        AddPayer(bill, ParticipantThree, 50m);
        AddPayer(bill, ParticipantTwo, 10m);
        AddPayer(bill, ParticipantOne, 40m);

        var firstResult = service.DeriveCandidates(bill);
        var secondResult = service.DeriveCandidates(bill);

        AssertSucceeded(firstResult);
        AssertSucceeded(secondResult);
        Assert.Equal(
            firstResult.Candidates.Select(candidate => candidate.CandidateKey).ToArray(),
            secondResult.Candidates.Select(candidate => candidate.CandidateKey).ToArray());
        AssertCandidateSequence(
            firstResult,
            [
                (ParticipantTwo, ParticipantOne, 30m),
                (ParticipantTwo, ParticipantThree, 10m),
                (ParticipantFour, ParticipantThree, 20m)
            ]);
    }

    [Fact]
    public void SettlementCandidatePersonalBillHasNullGroupId()
    {
        var bill = CreateConfirmedBill(groupId: null);
        AddParticipant(bill, ParticipantOne, 50m);
        AddParticipant(bill, ParticipantTwo, 50m);
        AddPayer(bill, ParticipantOne, 100m);

        var result = service.DeriveCandidates(bill);

        AssertSucceeded(result);
        Assert.Null(Assert.Single(result.Candidates).GroupId);
    }

    [Fact]
    public void SettlementCandidateGroupBillPreservesGroupId()
    {
        var bill = CreateConfirmedBill(groupId: GroupId);
        AddParticipant(bill, ParticipantOne, 50m);
        AddParticipant(bill, ParticipantTwo, 50m);
        AddPayer(bill, ParticipantOne, 100m);

        var result = service.DeriveCandidates(bill);

        AssertSucceeded(result);
        Assert.Equal(GroupId, Assert.Single(result.Candidates).GroupId);
    }

    [Fact]
    public void SettlementCandidateAlreadyBalancedBillReturnsClearNoCandidatesResult()
    {
        var bill = CreateConfirmedBill();
        AddParticipant(bill, ParticipantOne, 50m);
        AddParticipant(bill, ParticipantTwo, 50m);
        AddPayer(bill, ParticipantOne, 50m);
        AddPayer(bill, ParticipantTwo, 50m);

        var result = service.DeriveCandidates(bill);

        AssertFailure(result, "no_settlement_candidates", "bill");
    }

    [Theory]
    [InlineData(ExpenseBillStatuses.Draft)]
    [InlineData(ExpenseBillStatuses.PendingConfirmation)]
    [InlineData(ExpenseBillStatuses.Rejected)]
    [InlineData(ExpenseBillStatuses.Cancelled)]
    [InlineData(ExpenseBillStatuses.Finalized)]
    public void SettlementCandidateRejectsBillsThatAreNotConfirmed(string status)
    {
        var bill = CreateConfirmedBill(status: status);
        AddParticipant(bill, ParticipantOne, 50m);
        AddParticipant(bill, ParticipantTwo, 50m);
        AddPayer(bill, ParticipantOne, 100m);

        var result = service.DeriveCandidates(bill);

        AssertFailure(result, "bill_not_confirmed", "bill.status");
    }

    [Fact]
    public void SettlementCandidateRejectsArchivedBills()
    {
        var archivedAtBill = CreateConfirmedBill(archivedAtUtc: DateTimeOffset.UnixEpoch.AddDays(1));
        AddParticipant(archivedAtBill, ParticipantOne, 50m);
        AddParticipant(archivedAtBill, ParticipantTwo, 50m);
        AddPayer(archivedAtBill, ParticipantOne, 100m);

        var archivedStatusBill = CreateConfirmedBill(status: ExpenseBillStatuses.Archived);
        AddParticipant(archivedStatusBill, ParticipantOne, 50m);
        AddParticipant(archivedStatusBill, ParticipantTwo, 50m);
        AddPayer(archivedStatusBill, ParticipantOne, 100m);

        AssertFailure(service.DeriveCandidates(archivedAtBill), "bill_archived", "bill");
        AssertFailure(service.DeriveCandidates(archivedStatusBill), "bill_archived", "bill");
    }

    [Fact]
    public void SettlementCandidateRejectsMissingParticipantsOrPayers()
    {
        var noParticipantsBill = CreateConfirmedBill();
        AddPayer(noParticipantsBill, ParticipantOne, 100m);

        var noPayersBill = CreateConfirmedBill();
        AddParticipant(noPayersBill, ParticipantOne, 100m);

        AssertFailure(service.DeriveCandidates(noParticipantsBill), "no_participants", "participants");
        AssertFailure(service.DeriveCandidates(noPayersBill), "no_payers", "payers");
    }

    [Fact]
    public void SettlementCandidateRejectsMissingParticipantOrPayerIdentifiers()
    {
        var missingParticipantBill = CreateConfirmedBill();
        AddParticipant(missingParticipantBill, Guid.Empty, 100m);
        AddPayer(missingParticipantBill, ParticipantOne, 100m);

        var missingPayerBill = CreateConfirmedBill();
        AddParticipant(missingPayerBill, ParticipantOne, 100m);
        AddPayer(missingPayerBill, Guid.Empty, 100m);

        AssertFailure(
            service.DeriveCandidates(missingParticipantBill),
            "invalid_participant",
            "participants.user_profile_id");
        AssertFailure(
            service.DeriveCandidates(missingPayerBill),
            "invalid_payer",
            "payers.user_profile_id");
    }

    [Fact]
    public void SettlementCandidateRejectsInvalidUnsupportedAndMismatchedCurrencies()
    {
        var invalidBillCurrency = CreateConfirmedBill(currency: "usd");
        AddParticipant(invalidBillCurrency, ParticipantOne, 100m, "usd");
        AddPayer(invalidBillCurrency, ParticipantOne, 100m, "usd");

        var unsupportedBillCurrency = CreateConfirmedBill(currency: "ZZZ");
        AddParticipant(unsupportedBillCurrency, ParticipantOne, 100m, "ZZZ");
        AddPayer(unsupportedBillCurrency, ParticipantOne, 100m, "ZZZ");

        var unsupportedParticipantCurrency = CreateConfirmedBill();
        AddParticipant(unsupportedParticipantCurrency, ParticipantOne, 100m, "ZZZ");
        AddPayer(unsupportedParticipantCurrency, ParticipantOne, 100m);

        var mismatchedParticipantCurrency = CreateConfirmedBill();
        AddParticipant(mismatchedParticipantCurrency, ParticipantOne, 100m, "EUR");
        AddPayer(mismatchedParticipantCurrency, ParticipantOne, 100m);

        var mismatchedPayerCurrency = CreateConfirmedBill();
        AddParticipant(mismatchedPayerCurrency, ParticipantOne, 100m);
        AddPayer(mismatchedPayerCurrency, ParticipantOne, 100m, "EUR");

        AssertFailure(service.DeriveCandidates(invalidBillCurrency), "invalid_currency_format", "bill.currency");
        AssertFailure(service.DeriveCandidates(unsupportedBillCurrency), "unsupported_currency", "bill.currency");
        AssertFailure(
            service.DeriveCandidates(unsupportedParticipantCurrency),
            "unsupported_currency",
            "participants.resolved_share_currency");
        AssertFailure(
            service.DeriveCandidates(mismatchedParticipantCurrency),
            "currency_mismatch",
            "participants.resolved_share_currency");
        AssertFailure(service.DeriveCandidates(mismatchedPayerCurrency), "currency_mismatch", "payers.currency");
    }

    [Fact]
    public void SettlementCandidateRejectsNegativeParticipantSharesOrPayerContributions()
    {
        var negativeShareBill = CreateConfirmedBill();
        AddParticipant(negativeShareBill, ParticipantOne, -1m);
        AddPayer(negativeShareBill, ParticipantOne, 1m);

        var negativePayerBill = CreateConfirmedBill();
        AddParticipant(negativePayerBill, ParticipantOne, 1m);
        AddPayer(negativePayerBill, ParticipantOne, -1m);

        AssertFailure(
            service.DeriveCandidates(negativeShareBill),
            "negative_participant_share",
            "participants.resolved_share_amount");
        AssertFailure(
            service.DeriveCandidates(negativePayerBill),
            "negative_payer_contribution",
            "payers.amount");
    }

    [Fact]
    public void SettlementCandidateRejectsParticipantPayerTotalMismatchAfterRoundingPolicy()
    {
        var bill = CreateConfirmedBill();
        AddParticipant(bill, ParticipantOne, 10.004m);
        AddPayer(bill, ParticipantOne, 10.006m);

        var result = service.DeriveCandidates(bill);

        AssertFailure(result, "participant_payer_total_mismatch", "participants.resolved_share_amount");
    }

    [Fact]
    public void SettlementCandidateDerivationDoesNotMutateSourceBill()
    {
        var bill = CreateConfirmedBill(groupId: GroupId);
        AddParticipant(bill, ParticipantOne, 50m);
        AddParticipant(bill, ParticipantTwo, 50m);
        AddPayer(bill, ParticipantOne, 100m);
        var beforeSnapshot = SnapshotBill(bill);

        var result = service.DeriveCandidates(bill);

        AssertSucceeded(result);
        Assert.Equal(beforeSnapshot, SnapshotBill(bill));
        Assert.Empty(typeof(SettlementCandidateDerivationService).GetConstructors().Single().GetParameters());
    }

    [Fact]
    public void SettlementCandidateOpenApiAndGeneratedClientsExposePreviewRequestCreateAndReadOnlySettlementSurface()
    {
        var repoRoot = FindRepoRoot();
        var openApi = File.ReadAllText(Path.Combine(repoRoot, "packages/contracts/openapi/settleora.v1.yaml"));

        Assert.Contains("/api/v1/bills/{billId}/settlement-candidates", openApi, StringComparison.Ordinal);
        Assert.Contains("/api/v1/groups/{groupId}/bills/{billId}/settlement-candidates", openApi, StringComparison.Ordinal);
        Assert.Contains("listPersonalBillSettlementCandidates", openApi, StringComparison.Ordinal);
        Assert.Contains("listGroupBillSettlementCandidates", openApi, StringComparison.Ordinal);
        Assert.Contains("/api/v1/bills/{billId}/settlement-requests", openApi, StringComparison.Ordinal);
        Assert.Contains("/api/v1/groups/{groupId}/bills/{billId}/settlement-requests", openApi, StringComparison.Ordinal);
        Assert.Contains("createPersonalBillSettlementRequest", openApi, StringComparison.Ordinal);
        Assert.Contains("createGroupBillSettlementRequest", openApi, StringComparison.Ordinal);
        Assert.Contains("/api/v1/settlements", openApi, StringComparison.Ordinal);
        Assert.Contains("/api/v1/settlements/{settlementId}", openApi, StringComparison.Ordinal);
        Assert.Contains("listSettlementRequests", openApi, StringComparison.Ordinal);
        Assert.Contains("getSettlementRequest", openApi, StringComparison.Ordinal);
        Assert.Contains("SettlementCandidateListResponse", openApi, StringComparison.Ordinal);
        Assert.Contains("CreateSettlementRequestRequest", openApi, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestListResponse", openApi, StringComparison.Ordinal);
        Assert.Contains("SettlementRequestResponse", openApi, StringComparison.Ordinal);
        Assert.DoesNotContain("createSettlement", openApi, StringComparison.Ordinal);
        Assert.DoesNotContain("markSettlement", openApi, StringComparison.Ordinal);

        var generatedFiles = Directory.EnumerateFiles(
                Path.Combine(repoRoot, "packages/client-web/src/generated"),
                "*.*",
                SearchOption.AllDirectories)
            .Concat(Directory.EnumerateFiles(
                Path.Combine(repoRoot, "packages/client-dart/generated"),
                "*.*",
                SearchOption.AllDirectories))
            .Where(file => file.EndsWith(".ts", StringComparison.Ordinal)
                || file.EndsWith(".dart", StringComparison.Ordinal))
            .ToArray();

        Assert.NotEmpty(generatedFiles);
        var generatedContent = string.Join(
            "\n",
            generatedFiles.Select(File.ReadAllText));
        Assert.Contains("listPersonalBillSettlementCandidates", generatedContent, StringComparison.Ordinal);
        Assert.Contains("listGroupBillSettlementCandidates", generatedContent, StringComparison.Ordinal);
        Assert.Contains("createPersonalBillSettlementRequest", generatedContent, StringComparison.Ordinal);
        Assert.Contains("createGroupBillSettlementRequest", generatedContent, StringComparison.Ordinal);
        Assert.Contains("listSettlementRequests", generatedContent, StringComparison.Ordinal);
        Assert.Contains("getSettlementRequest", generatedContent, StringComparison.Ordinal);
        foreach (var generatedFile in generatedFiles)
        {
            var content = File.ReadAllText(generatedFile);
            Assert.DoesNotContain("createSettlement", content, StringComparison.Ordinal);
            Assert.DoesNotContain("markSettlement", content, StringComparison.Ordinal);
        }
    }

    private static ExpenseBill CreateConfirmedBill(
        string currency = "USD",
        Guid? groupId = null,
        string status = ExpenseBillStatuses.Confirmed,
        DateTimeOffset? archivedAtUtc = null)
    {
        return new ExpenseBill
        {
            Id = StableGuid(100),
            CreatedByUserProfileId = ParticipantOne,
            GroupId = groupId,
            BillDate = new DateOnly(2026, 5, 8),
            Status = status,
            TotalAmount = 0m,
            TotalCurrency = currency,
            CreatedAtUtc = DateTimeOffset.UnixEpoch,
            UpdatedAtUtc = DateTimeOffset.UnixEpoch,
            ArchivedAtUtc = archivedAtUtc
        };
    }

    private static void AddParticipant(
        ExpenseBill bill,
        Guid participantId,
        decimal resolvedShareAmount,
        string currency = "USD")
    {
        bill.Participants.Add(new ExpenseBillParticipant
        {
            ExpenseBillId = bill.Id,
            UserProfileId = participantId,
            Status = ExpenseBillParticipantStatuses.Accepted,
            ResolvedShareAmount = resolvedShareAmount,
            ResolvedShareCurrency = currency,
            AcceptedAtUtc = DateTimeOffset.UnixEpoch,
            CreatedAtUtc = DateTimeOffset.UnixEpoch,
            UpdatedAtUtc = DateTimeOffset.UnixEpoch
        });
    }

    private static void AddPayer(
        ExpenseBill bill,
        Guid payerId,
        decimal amount,
        string currency = "USD")
    {
        bill.Payers.Add(new ExpenseBillPayer
        {
            Id = StableGuid(500 + bill.Payers.Count),
            ExpenseBillId = bill.Id,
            UserProfileId = payerId,
            Amount = amount,
            Currency = currency,
            CreatedAtUtc = DateTimeOffset.UnixEpoch,
            UpdatedAtUtc = DateTimeOffset.UnixEpoch
        });
    }

    private static void AssertSucceeded(SettlementCandidateDerivationResult result)
    {
        Assert.True(result.Succeeded, result.Failure?.ToString() ?? result.Code);
    }

    private static void AssertFailure(
        SettlementCandidateDerivationResult result,
        string expectedCode,
        string expectedField)
    {
        Assert.False(result.Succeeded);
        Assert.NotNull(result.Failure);
        Assert.Equal(expectedCode, result.Code);
        Assert.Equal(expectedField, result.Failure!.Field);
        Assert.Empty(result.Candidates);
        Assert.Empty(result.NetPositions);
    }

    private static void AssertMoney(
        decimal expectedAmount,
        string expectedCurrency,
        MoneyAmount money)
    {
        Assert.Equal(expectedAmount, money.Amount);
        Assert.Equal(expectedCurrency, money.Currency.Value);
    }

    private static void AssertNetPosition(
        SettlementCandidateDerivationResult result,
        Guid userProfileId,
        decimal expectedPayerContribution,
        decimal expectedResolvedShare,
        decimal expectedNetPosition,
        string expectedPositionCategory)
    {
        var netPosition = Assert.Single(result.NetPositions, position => position.UserProfileId == userProfileId);
        Assert.Equal(expectedPayerContribution, netPosition.PayerContributionAmount);
        Assert.Equal(expectedResolvedShare, netPosition.ResolvedShareAmount);
        Assert.Equal(expectedNetPosition, netPosition.NetPositionAmount);
        Assert.Equal("USD", netPosition.Currency);
        Assert.Equal(expectedPositionCategory, netPosition.PositionCategory);
    }

    private static void AssertCandidateSequence(
        SettlementCandidateDerivationResult result,
        IReadOnlyList<(Guid DebtorUserProfileId, Guid CreditorUserProfileId, decimal Amount)> expectedCandidates)
    {
        Assert.Equal(
            expectedCandidates,
            result.Candidates
                .Select(candidate => (candidate.DebtorUserProfileId, candidate.CreditorUserProfileId, candidate.Amount))
                .ToArray());
        Assert.Equal(
            Enumerable.Range(0, result.Candidates.Count).ToArray(),
            result.Candidates.Select(candidate => candidate.AllocationOrder).ToArray());
    }

    private static string CandidateKey(
        Guid sourceBillId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        decimal amount,
        string currency)
    {
        return FormattableString.Invariant(
            $"bill:{sourceBillId:D}:debtor:{debtorUserProfileId:D}:creditor:{creditorUserProfileId:D}:amount:{amount:0.0000}:currency:{currency}");
    }

    private static string SnapshotBill(ExpenseBill bill)
    {
        var participants = bill.Participants
            .OrderBy(participant => participant.UserProfileId)
            .Select(participant => FormattableString.Invariant(
                $"{participant.UserProfileId:D}:{participant.Status}:{participant.ResolvedShareAmount:0.0000}:{participant.ResolvedShareCurrency}"));
        var payers = bill.Payers
            .OrderBy(payer => payer.Id)
            .Select(payer => FormattableString.Invariant(
                $"{payer.Id:D}:{payer.UserProfileId:D}:{payer.Amount:0.0000}:{payer.Currency}"));

        return string.Join(
            "|",
            [
                bill.Id.ToString("D"),
                bill.GroupId?.ToString("D") ?? string.Empty,
                bill.Status,
                bill.ArchivedAtUtc?.ToString("O") ?? string.Empty,
                string.Join(",", participants),
                string.Join(",", payers)
            ]);
    }

    private static string FindRepoRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "PROGRAM_ARCHITECTURE.md")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException($"Could not find repo root from {AppContext.BaseDirectory}.");
    }

    private static Guid StableGuid(int value)
    {
        return new Guid($"00000000-0000-0000-0000-{value:000000000000}");
    }
}
