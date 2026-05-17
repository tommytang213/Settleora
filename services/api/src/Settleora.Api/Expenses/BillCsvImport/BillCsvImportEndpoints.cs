using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.VisualBasic.FileIO;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Users;
using Settleora.Api.Expenses.GroupBills;
using Settleora.Api.Expenses.PersonalBills;
using Settleora.Api.Money;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.BillCsvImport;

internal static class BillCsvImportEndpoints
{
    private const int MaxCsvBytes = 64 * 1024;
    private const int MaxDataRows = 100;
    private const int ClientBillKeyMaxLength = 120;
    private const string CsvContentType = "text/csv";
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string BillImportUnavailableTitle = "Bill import unavailable";
    private const string BillImportUnavailableDetail = "The requested bill import is unavailable.";
    private const string InvalidBillImportRequestTitle = "Invalid bill CSV import request";
    private const string InvalidBillImportRequestDetail = "The submitted bill CSV import request is invalid.";
    private const string BillImportWriteFailedTitle = "Bill import write failed";
    private const string BillImportWriteFailedDetail = "Unable to complete bill CSV import.";
    private const string BillCsvImportedAction = "bill.csv_imported";
    private const string PersonalGroupMode = "personal";
    private const string GroupMode = "group";

    private static readonly string[] SupportedHeaders =
    [
        "clientBillKey",
        "merchantName",
        "billDate",
        "currency",
        "itemName",
        "itemAmount",
        "itemNote",
        "payerUserProfileId",
        "splitUserProfileId",
        "splitMethod",
        "splitBasisValue"
    ];

    private static readonly string[] RequiredHeaders =
    [
        "clientBillKey",
        "billDate",
        "currency",
        "itemName",
        "itemAmount"
    ];

    private static readonly HashSet<string> SupportedHeaderSet =
        SupportedHeaders.ToHashSet(StringComparer.Ordinal);

    public static WebApplication MapBillCsvImportEndpoints(this WebApplication app)
    {
        var personalBills = app.MapGroup("/api/v1/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        personalBills.MapPost("/import.csv", ImportPersonalBillsCsvAsync);

        var groupBills = app.MapGroup("/api/v1/groups/{groupId:guid}/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        groupBills.MapPost("/import.csv", ImportGroupBillsCsvAsync);

        return app;
    }

    private static async Task<IResult> ImportPersonalBillsCsvAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IPersonalBillAuditWriter auditWriter,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var csvReadResult = await ReadCsvBodyAsync(request, cancellationToken);
        if (!csvReadResult.Succeeded)
        {
            return InvalidBillImportRequest(csvReadResult.Errors);
        }

        var planResult = BuildImportPlan(
            csvReadResult.CsvText!,
            ImportScope.Personal,
            actor.UserProfileId,
            null,
            null,
            calculationService,
            timeProvider);
        if (!planResult.Succeeded)
        {
            return planResult.ErrorResult is not null
                ? planResult.ErrorResult
                : Results.Ok(planResult.Response);
        }

        foreach (var bill in planResult.Bills)
        {
            dbContext.Set<ExpenseBill>().Add(bill);
            await auditWriter.WriteAsync(
                new PersonalBillAuditEvent(
                    BillCsvImportedAction,
                    actor.AuthAccountId,
                    actor.AuthAccountId,
                    bill.Id,
                    PersonalGroupMode,
                    bill.Status,
                    bill.Items.Count,
                    bill.Adjustments.Count,
                    bill.Participants.Count,
                    bill.TotalCurrency,
                    bill.TotalAmount,
                    bill.CreatedAtUtc),
                cancellationToken);
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return BillImportWriteFailed();
        }

        return Results.Ok(planResult.Response);
    }

    private static async Task<IResult> ImportGroupBillsCsvAsync(
        Guid groupId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IGroupBillAuditWriter auditWriter,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var activeGroupMemberIds = await LoadActiveGroupMemberIdsAsync(
            dbContext,
            groupId,
            cancellationToken);
        if (!activeGroupMemberIds.Contains(actor.UserProfileId))
        {
            return BillImportUnavailable();
        }

        var csvReadResult = await ReadCsvBodyAsync(request, cancellationToken);
        if (!csvReadResult.Succeeded)
        {
            return InvalidBillImportRequest(csvReadResult.Errors);
        }

        var planResult = BuildImportPlan(
            csvReadResult.CsvText!,
            ImportScope.Group,
            actor.UserProfileId,
            groupId,
            activeGroupMemberIds,
            calculationService,
            timeProvider);
        if (!planResult.Succeeded)
        {
            return planResult.ErrorResult is not null
                ? planResult.ErrorResult
                : Results.Ok(planResult.Response);
        }

        foreach (var bill in planResult.Bills)
        {
            dbContext.Set<ExpenseBill>().Add(bill);
            await auditWriter.WriteAsync(
                new GroupBillAuditEvent(
                    BillCsvImportedAction,
                    actor.AuthAccountId,
                    actor.AuthAccountId,
                    bill.Id,
                    groupId,
                    GroupMode,
                    bill.Status,
                    bill.Items.Count,
                    bill.Adjustments.Count,
                    bill.Participants.Count,
                    bill.Payers.Count,
                    bill.TotalCurrency,
                    bill.TotalAmount,
                    bill.CreatedAtUtc),
                cancellationToken);
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return BillImportWriteFailed();
        }

        return Results.Ok(planResult.Response);
    }

    private static async Task<HashSet<Guid>> LoadActiveGroupMemberIdsAsync(
        SettleoraDbContext dbContext,
        Guid groupId,
        CancellationToken cancellationToken)
    {
        return await dbContext.Set<GroupMembership>()
            .AsNoTracking()
            .Where(membership => membership.GroupId == groupId
                && membership.Status == GroupMembershipStatuses.Active
                && membership.Group.DeletedAtUtc == null
                && membership.UserProfile.DeletedAtUtc == null)
            .Select(membership => membership.UserProfileId)
            .ToHashSetAsync(cancellationToken);
    }

    private static async Task<CsvBodyReadResult> ReadCsvBodyAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (!HasCsvContentType(request.ContentType))
        {
            errors["body"] = ["A text/csv request body is required."];
            return CsvBodyReadResult.Invalid(errors);
        }

        if (request.ContentLength is > MaxCsvBytes)
        {
            errors["body"] = [$"CSV body must be {MaxCsvBytes} bytes or smaller."];
            return CsvBodyReadResult.Invalid(errors);
        }

        await using var memoryStream = new MemoryStream();
        var buffer = new byte[8192];
        var totalBytes = 0;
        int bytesRead;
        while ((bytesRead = await request.Body.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken)) > 0)
        {
            totalBytes += bytesRead;
            if (totalBytes > MaxCsvBytes)
            {
                errors["body"] = [$"CSV body must be {MaxCsvBytes} bytes or smaller."];
                return CsvBodyReadResult.Invalid(errors);
            }

            await memoryStream.WriteAsync(buffer.AsMemory(0, bytesRead), cancellationToken);
        }

        if (totalBytes == 0)
        {
            errors["body"] = ["CSV body is required."];
            return CsvBodyReadResult.Invalid(errors);
        }

        memoryStream.Position = 0;
        using var reader = new StreamReader(
            memoryStream,
            new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true),
            detectEncodingFromByteOrderMarks: true,
            bufferSize: 1024,
            leaveOpen: true);

        string csvText;
        try
        {
            csvText = await reader.ReadToEndAsync(cancellationToken);
        }
        catch (DecoderFallbackException)
        {
            errors["body"] = ["CSV body must be valid UTF-8 text."];
            return CsvBodyReadResult.Invalid(errors);
        }

        if (string.IsNullOrWhiteSpace(csvText))
        {
            errors["body"] = ["CSV body is required."];
            return CsvBodyReadResult.Invalid(errors);
        }

        return CsvBodyReadResult.Valid(csvText);
    }

    private static BillCsvImportPlanResult BuildImportPlan(
        string csvText,
        ImportScope scope,
        Guid actorUserProfileId,
        Guid? groupId,
        IReadOnlySet<Guid>? activeGroupMemberIds,
        ExpenseBillCalculationService calculationService,
        TimeProvider timeProvider)
    {
        var parseResult = ParseCsv(csvText);
        if (!parseResult.Succeeded)
        {
            return BillCsvImportPlanResult.Failed(InvalidBillImportRequest(parseResult.Errors));
        }

        var records = parseResult.Records;
        if (records.Count == 0)
        {
            var rejectedResponse = CreateRejectedResponse(
                rowCount: 0,
                [new BillCsvImportRowErrorResponse(1, "header", "missing_header", "CSV header row is required.")]);
            return BillCsvImportPlanResult.Failed(rejectedResponse);
        }

        var rowCount = records.Count - 1;
        if (rowCount > MaxDataRows)
        {
            var errors = new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["body"] = [$"CSV import supports at most {MaxDataRows} data rows."]
            };
            return BillCsvImportPlanResult.Failed(InvalidBillImportRequest(errors));
        }

        var headerResult = ReadHeader(records[0]);
        if (!headerResult.Succeeded)
        {
            var rejectedResponse = CreateRejectedResponse(rowCount, headerResult.Errors);
            return BillCsvImportPlanResult.Failed(rejectedResponse);
        }

        var rowErrors = new List<BillCsvImportRowErrorResponse>();
        var rows = new List<BillCsvImportRow>();
        foreach (var record in records.Skip(1))
        {
            var row = ReadRow(
                record,
                headerResult.HeaderIndexes,
                scope,
                actorUserProfileId,
                activeGroupMemberIds,
                rowErrors);
            if (row is not null)
            {
                rows.Add(row);
            }
        }

        if (rowCount == 0)
        {
            rowErrors.Add(new BillCsvImportRowErrorResponse(
                records[0].RowNumber,
                "body",
                "no_data_rows",
                "At least one CSV data row is required."));
        }

        AddGroupedBillValidationErrors(rows, rowErrors);
        if (rowErrors.Count > 0)
        {
            return BillCsvImportPlanResult.Failed(CreateRejectedResponse(rowCount, rowErrors));
        }

        var now = timeProvider.GetUtcNow();
        var bills = new List<ExpenseBill>();
        var summaries = new List<BillCsvImportedBillSummaryResponse>();
        foreach (var rowGroup in rows.GroupBy(row => row.ClientBillKey, StringComparer.Ordinal))
        {
            var groupRows = rowGroup.OrderBy(row => row.RowNumber).ToArray();
            var bill = CreateBill(
                groupRows,
                scope,
                actorUserProfileId,
                groupId,
                now);

            var calculation = calculationService.Calculate(bill);
            if (!calculation.Succeeded)
            {
                rowErrors.Add(new BillCsvImportRowErrorResponse(
                    groupRows[0].RowNumber,
                    NormalizeCalculationField(calculation.Failure!.Field),
                    calculation.Failure.Code,
                    calculation.Failure.Message));
                continue;
            }

            ApplyCalculation(bill, calculation);
            bills.Add(bill);
            summaries.Add(MapSummary(bill));
        }

        if (rowErrors.Count > 0)
        {
            return BillCsvImportPlanResult.Failed(CreateRejectedResponse(rowCount, rowErrors));
        }

        var response = new BillCsvImportResponse(
            rowCount,
            bills.Count,
            RejectedRowCount: 0,
            Errors: [],
            Bills: summaries);
        return BillCsvImportPlanResult.Success(response, bills);
    }

    private static CsvParseResult ParseCsv(string csvText)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        using var stringReader = new StringReader(csvText);
        using var parser = new TextFieldParser(stringReader)
        {
            TextFieldType = FieldType.Delimited,
            HasFieldsEnclosedInQuotes = true,
            TrimWhiteSpace = false
        };
        parser.SetDelimiters(",");

        var records = new List<CsvRecord>();
        try
        {
            while (!parser.EndOfData)
            {
                var lineNumber = parser.LineNumber;
                var fields = parser.ReadFields() ?? [];
                if (fields.Length == 1 && string.IsNullOrWhiteSpace(fields[0]))
                {
                    continue;
                }

                records.Add(new CsvRecord((int)Math.Max(lineNumber, 1), fields));
            }
        }
        catch (MalformedLineException)
        {
            errors["body"] = ["CSV body is malformed."];
            return CsvParseResult.Invalid(errors);
        }

        return CsvParseResult.Valid(records);
    }

    private static HeaderReadResult ReadHeader(CsvRecord headerRecord)
    {
        var errors = new List<BillCsvImportRowErrorResponse>();
        var indexes = new Dictionary<string, int>(StringComparer.Ordinal);

        for (var index = 0; index < headerRecord.Fields.Count; index++)
        {
            var header = TrimUtf8Bom(headerRecord.Fields[index]).Trim();
            if (header.Length == 0)
            {
                errors.Add(new BillCsvImportRowErrorResponse(
                    headerRecord.RowNumber,
                    "header",
                    "blank_header",
                    "CSV headers must not be blank."));
                continue;
            }

            if (!SupportedHeaderSet.Contains(header))
            {
                errors.Add(new BillCsvImportRowErrorResponse(
                    headerRecord.RowNumber,
                    "header",
                    "unsupported_column",
                    "CSV contains an unsupported column."));
                continue;
            }

            if (!indexes.TryAdd(header, index))
            {
                errors.Add(new BillCsvImportRowErrorResponse(
                    headerRecord.RowNumber,
                    "header",
                    "duplicate_column",
                    "CSV headers must be unique."));
            }
        }

        foreach (var requiredHeader in RequiredHeaders)
        {
            if (!indexes.ContainsKey(requiredHeader))
            {
                errors.Add(new BillCsvImportRowErrorResponse(
                    headerRecord.RowNumber,
                    requiredHeader,
                    "missing_required_column",
                    "CSV is missing a required column."));
            }
        }

        return errors.Count == 0
            ? HeaderReadResult.Valid(indexes)
            : HeaderReadResult.Invalid(errors);
    }

    private static BillCsvImportRow? ReadRow(
        CsvRecord record,
        IReadOnlyDictionary<string, int> headerIndexes,
        ImportScope scope,
        Guid actorUserProfileId,
        IReadOnlySet<Guid>? activeGroupMemberIds,
        List<BillCsvImportRowErrorResponse> errors)
    {
        if (record.Fields.Count > headerIndexes.Count)
        {
            AddRowError(
                errors,
                record.RowNumber,
                "row",
                "invalid_column_count",
                "CSV row has more fields than the header row.");
            return null;
        }

        var clientBillKey = ReadRequiredText(
            Cell(record, headerIndexes, "clientBillKey"),
            record.RowNumber,
            "clientBillKey",
            "Client bill key",
            ClientBillKeyMaxLength,
            errors);
        var merchantName = ReadOptionalText(
            Cell(record, headerIndexes, "merchantName"),
            record.RowNumber,
            "merchantName",
            "Merchant name",
            ExpenseBillConstraints.MerchantNameMaxLength,
            errors);
        var billDate = ReadBillDate(
            Cell(record, headerIndexes, "billDate"),
            record.RowNumber,
            errors);
        var currency = ReadCurrency(
            Cell(record, headerIndexes, "currency"),
            record.RowNumber,
            "currency",
            errors);
        var itemName = ReadRequiredText(
            Cell(record, headerIndexes, "itemName"),
            record.RowNumber,
            "itemName",
            "Item name",
            ExpenseBillConstraints.ItemNameMaxLength,
            errors);
        var itemNote = ReadOptionalText(
            Cell(record, headerIndexes, "itemNote"),
            record.RowNumber,
            "itemNote",
            "Item note",
            ExpenseBillConstraints.NoteMaxLength,
            errors);
        var itemAmount = currency is null
            ? null
            : ReadMoneyAmount(
                Cell(record, headerIndexes, "itemAmount"),
                currency,
                record.RowNumber,
                "itemAmount",
                errors);
        var splitMethod = ReadSplitMethod(
            Cell(record, headerIndexes, "splitMethod"),
            record.RowNumber,
            errors);
        var splitBasisValue = currency is null || itemAmount is null
            ? null
            : ReadSplitBasisValue(
                Cell(record, headerIndexes, "splitBasisValue"),
                splitMethod,
                itemAmount.Value,
                currency,
                record.RowNumber,
                errors);
        var splitUserProfileId = ReadOptionalUserProfileId(
            Cell(record, headerIndexes, "splitUserProfileId"),
            record.RowNumber,
            "splitUserProfileId",
            errors);
        var payerUserProfileId = ReadOptionalUserProfileId(
            Cell(record, headerIndexes, "payerUserProfileId"),
            record.RowNumber,
            "payerUserProfileId",
            errors);

        if (scope is ImportScope.Personal)
        {
            if (splitUserProfileId is not null && splitUserProfileId.Value != actorUserProfileId)
            {
                AddRowError(
                    errors,
                    record.RowNumber,
                    "splitUserProfileId",
                    "personal_profile_mismatch",
                    "Personal bill split profile must match the authenticated actor.");
            }

            if (payerUserProfileId is not null && payerUserProfileId.Value != actorUserProfileId)
            {
                AddRowError(
                    errors,
                    record.RowNumber,
                    "payerUserProfileId",
                    "personal_profile_mismatch",
                    "Personal bill payer profile must match the authenticated actor.");
            }

            splitUserProfileId = actorUserProfileId;
            payerUserProfileId = actorUserProfileId;
        }
        else
        {
            if (splitUserProfileId is null)
            {
                AddRowError(
                    errors,
                    record.RowNumber,
                    "splitUserProfileId",
                    "split_profile_required",
                    "Group bill split user profile ID is required.");
            }
            else if (!activeGroupMemberIds!.Contains(splitUserProfileId.Value))
            {
                AddRowError(
                    errors,
                    record.RowNumber,
                    "splitUserProfileId",
                    "group_member_unavailable",
                    "Referenced group participant is unavailable.");
            }

            if (payerUserProfileId is null)
            {
                payerUserProfileId = actorUserProfileId;
            }
            else if (!activeGroupMemberIds!.Contains(payerUserProfileId.Value))
            {
                AddRowError(
                    errors,
                    record.RowNumber,
                    "payerUserProfileId",
                    "group_member_unavailable",
                    "Referenced group payer is unavailable.");
            }
        }

        return clientBillKey is not null
            && billDate is not null
            && currency is not null
            && itemName is not null
            && itemAmount is not null
            && splitMethod is not null
            && splitUserProfileId is not null
            && payerUserProfileId is not null
            && (!RequiresSplitBasis(splitMethod) || splitBasisValue is not null)
            ? new BillCsvImportRow(
                record.RowNumber,
                clientBillKey,
                merchantName,
                billDate.Value,
                currency,
                itemName,
                itemAmount.Value,
                itemNote,
                payerUserProfileId.Value,
                splitUserProfileId.Value,
                splitMethod,
                splitBasisValue)
            : null;
    }

    private static void AddGroupedBillValidationErrors(
        IReadOnlyList<BillCsvImportRow> rows,
        List<BillCsvImportRowErrorResponse> errors)
    {
        foreach (var rowGroup in rows.GroupBy(row => row.ClientBillKey, StringComparer.Ordinal))
        {
            var first = rowGroup.OrderBy(row => row.RowNumber).First();
            foreach (var row in rowGroup)
            {
                if (!string.Equals(row.MerchantName, first.MerchantName, StringComparison.Ordinal))
                {
                    AddRowError(
                        errors,
                        row.RowNumber,
                        "merchantName",
                        "bill_field_mismatch",
                        "Rows with the same clientBillKey must use the same merchant name.");
                }

                if (row.BillDate != first.BillDate)
                {
                    AddRowError(
                        errors,
                        row.RowNumber,
                        "billDate",
                        "bill_field_mismatch",
                        "Rows with the same clientBillKey must use the same bill date.");
                }

                if (!string.Equals(row.Currency, first.Currency, StringComparison.Ordinal))
                {
                    AddRowError(
                        errors,
                        row.RowNumber,
                        "currency",
                        "bill_field_mismatch",
                        "Rows with the same clientBillKey must use the same currency.");
                }
            }
        }
    }

    private static ExpenseBill CreateBill(
        IReadOnlyList<BillCsvImportRow> rows,
        ImportScope scope,
        Guid actorUserProfileId,
        Guid? groupId,
        DateTimeOffset now)
    {
        var first = rows[0];
        var bill = new ExpenseBill
        {
            Id = Guid.NewGuid(),
            CreatedByUserProfileId = actorUserProfileId,
            BillOwnerUserProfileId = actorUserProfileId,
            GroupId = groupId,
            MerchantName = first.MerchantName,
            BillDate = first.BillDate,
            Status = ExpenseBillStatuses.Draft,
            TotalAmount = 0m,
            TotalCurrency = first.Currency,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        var participantIds = rows
            .Select(row => row.SplitUserProfileId)
            .Concat(rows.Select(row => row.PayerUserProfileId))
            .Distinct()
            .OrderBy(id => id)
            .ToArray();
        if (scope is ImportScope.Personal)
        {
            participantIds = [actorUserProfileId];
        }

        foreach (var participantId in participantIds)
        {
            bill.Participants.Add(new ExpenseBillParticipant
            {
                ExpenseBillId = bill.Id,
                UserProfileId = participantId,
                Status = ExpenseBillParticipantStatuses.PendingAcceptance,
                ResolvedShareAmount = 0m,
                ResolvedShareCurrency = first.Currency,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        for (var index = 0; index < rows.Count; index++)
        {
            var row = rows[index];
            var item = new ExpenseBillItem
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = bill.Id,
                Name = row.ItemName,
                Note = row.ItemNote,
                Amount = row.ItemAmount,
                Currency = row.Currency,
                SortOrder = index,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            item.Splits.Add(new ExpenseBillItemSplit
            {
                Id = Guid.NewGuid(),
                ExpenseBillItemId = item.Id,
                UserProfileId = row.SplitUserProfileId,
                SplitMethod = row.SplitMethod,
                BasisValue = row.SplitBasisValue,
                ResolvedAmount = 0m,
                ResolvedCurrency = row.Currency,
                AllocationOrder = 0,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
            bill.Items.Add(item);
        }

        foreach (var payerGroup in rows.GroupBy(row => row.PayerUserProfileId).OrderBy(group => group.Key))
        {
            var payer = new ExpenseBillPayer
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = bill.Id,
                UserProfileId = payerGroup.Key,
                Amount = payerGroup.Sum(row => row.ItemAmount),
                Currency = first.Currency,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            ExpenseBillPayerConfirmationPolicy.ApplyCreatedBy(payer, actorUserProfileId, now);
            bill.Payers.Add(payer);
        }

        return bill;
    }

    private static void ApplyCalculation(
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

    private static BillCsvImportedBillSummaryResponse MapSummary(ExpenseBill bill)
    {
        return new BillCsvImportedBillSummaryResponse(
            bill.Id,
            bill.GroupId,
            bill.BillDate,
            bill.Status,
            FormatAmount(bill.TotalAmount),
            bill.TotalCurrency,
            bill.Items.Count(item => item.DeletedAtUtc is null),
            bill.Participants.Count,
            bill.Payers.Count);
    }

    private static BillCsvImportResponse CreateRejectedResponse(
        int rowCount,
        IReadOnlyList<BillCsvImportRowErrorResponse> errors)
    {
        var orderedErrors = errors
            .OrderBy(error => error.RowNumber)
            .ThenBy(error => error.Field, StringComparer.Ordinal)
            .ThenBy(error => error.Code, StringComparer.Ordinal)
            .ToArray();
        var rejectedRowCount = orderedErrors
            .Where(error => error.RowNumber > 1)
            .Select(error => error.RowNumber)
            .Distinct()
            .Count();
        if (rejectedRowCount == 0 && orderedErrors.Any(error => error.RowNumber <= 1))
        {
            rejectedRowCount = rowCount;
        }

        return new BillCsvImportResponse(
            rowCount,
            ImportedBillCount: 0,
            rejectedRowCount,
            orderedErrors,
            Bills: []);
    }

    private static string Cell(
        CsvRecord record,
        IReadOnlyDictionary<string, int> headerIndexes,
        string header)
    {
        if (!headerIndexes.TryGetValue(header, out var index) || index >= record.Fields.Count)
        {
            return string.Empty;
        }

        return record.Fields[index].Trim();
    }

    private static string? ReadRequiredText(
        string submittedText,
        int rowNumber,
        string field,
        string displayName,
        int maxLength,
        List<BillCsvImportRowErrorResponse> errors)
    {
        if (submittedText.Length == 0)
        {
            AddRowError(errors, rowNumber, field, "required", $"{displayName} is required.");
            return null;
        }

        if (submittedText.Length > maxLength)
        {
            AddRowError(errors, rowNumber, field, "too_long", $"{displayName} is too long.");
            return null;
        }

        return submittedText;
    }

    private static string? ReadOptionalText(
        string submittedText,
        int rowNumber,
        string field,
        string displayName,
        int maxLength,
        List<BillCsvImportRowErrorResponse> errors)
    {
        if (submittedText.Length == 0)
        {
            return null;
        }

        if (submittedText.Length > maxLength)
        {
            AddRowError(errors, rowNumber, field, "too_long", $"{displayName} is too long.");
            return null;
        }

        return submittedText;
    }

    private static DateOnly? ReadBillDate(
        string submittedDate,
        int rowNumber,
        List<BillCsvImportRowErrorResponse> errors)
    {
        if (!DateOnly.TryParseExact(
            submittedDate,
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var billDate))
        {
            AddRowError(
                errors,
                rowNumber,
                "billDate",
                "invalid_date",
                "Bill date must be a yyyy-MM-dd date string.");
            return null;
        }

        return billDate;
    }

    private static string? ReadCurrency(
        string submittedCurrency,
        int rowNumber,
        string field,
        List<BillCsvImportRowErrorResponse> errors)
    {
        if (!CurrencyCode.TryCreate(submittedCurrency, out var currency))
        {
            AddRowError(
                errors,
                rowNumber,
                field,
                "invalid_currency_format",
                "Currency must be an uppercase three-letter code.");
            return null;
        }

        var supportedResult = SupportedCurrencyPolicy.Default.ValidateSupported(currency, field);
        if (!supportedResult.Succeeded)
        {
            AddRowError(errors, rowNumber, field, supportedResult.Code, supportedResult.Message);
            return null;
        }

        return currency.Value;
    }

    private static decimal? ReadMoneyAmount(
        string submittedAmount,
        string currency,
        int rowNumber,
        string field,
        List<BillCsvImportRowErrorResponse> errors)
    {
        var validationResult = MoneyAmount.TryParse(
            submittedAmount,
            currency,
            MoneyValidationOptions.Default with
            {
                AmountField = field,
                CurrencyField = "currency"
            },
            SupportedCurrencyPolicy.Default,
            out var moneyAmount);
        if (!validationResult.Succeeded)
        {
            AddRowError(errors, rowNumber, validationResult.Field, validationResult.Code, validationResult.Message);
            return null;
        }

        return moneyAmount.Amount;
    }

    private static string? ReadSplitMethod(
        string submittedSplitMethod,
        int rowNumber,
        List<BillCsvImportRowErrorResponse> errors)
    {
        if (submittedSplitMethod.Length == 0)
        {
            return ExpenseBillItemSplitMethods.ExactAmount;
        }

        if (!ExpenseBillItemSplitMethods.IsSupported(submittedSplitMethod))
        {
            AddRowError(
                errors,
                rowNumber,
                "splitMethod",
                "unsupported_split_method",
                "Split method is not supported.");
            return null;
        }

        return submittedSplitMethod;
    }

    private static decimal? ReadSplitBasisValue(
        string submittedBasisValue,
        string? splitMethod,
        decimal itemAmount,
        string currency,
        int rowNumber,
        List<BillCsvImportRowErrorResponse> errors)
    {
        if (splitMethod is null)
        {
            return null;
        }

        if (splitMethod is ExpenseBillItemSplitMethods.ExactAmount)
        {
            if (submittedBasisValue.Length == 0)
            {
                return itemAmount;
            }

            return ReadMoneyAmount(
                submittedBasisValue,
                currency,
                rowNumber,
                "splitBasisValue",
                errors);
        }

        if (!RequiresSplitBasis(splitMethod))
        {
            if (submittedBasisValue.Length != 0)
            {
                AddRowError(
                    errors,
                    rowNumber,
                    "splitBasisValue",
                    "unsupported_split_basis",
                    "Split basis value must be blank for equal split rows.");
            }

            return null;
        }

        if (submittedBasisValue.Length == 0)
        {
            AddRowError(
                errors,
                rowNumber,
                "splitBasisValue",
                "missing_split_basis",
                "Split basis value is required for this split method.");
            return null;
        }

        if (!IsPlainDecimalString(submittedBasisValue)
            || !decimal.TryParse(
                submittedBasisValue,
                NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture,
                out var basisValue)
            || decimal.Abs(basisValue) > MoneyAmount.MaxAbsStorageAmount)
        {
            AddRowError(
                errors,
                rowNumber,
                "splitBasisValue",
                "invalid_decimal_format",
                "Split basis value must be a plain base-10 decimal string.");
            return null;
        }

        return basisValue;
    }

    private static Guid? ReadOptionalUserProfileId(
        string submittedUserProfileId,
        int rowNumber,
        string field,
        List<BillCsvImportRowErrorResponse> errors)
    {
        if (submittedUserProfileId.Length == 0)
        {
            return null;
        }

        if (!Guid.TryParse(submittedUserProfileId, out var userProfileId))
        {
            AddRowError(
                errors,
                rowNumber,
                field,
                "invalid_user_profile_id",
                "User profile ID must be a UUID string.");
            return null;
        }

        return userProfileId;
    }

    private static string NormalizeCalculationField(string field)
    {
        return field switch
        {
            "bill.currency" => "currency",
            "items.amount" => "itemAmount",
            "items.currency" => "currency",
            "items.splits.basis_value" => "splitBasisValue",
            "items.splits.split_method" => "splitMethod",
            "participants.user_profile_id" => "splitUserProfileId",
            "payers.amount" => "payerUserProfileId",
            "payers.currency" => "currency",
            "payers.user_profile_id" => "payerUserProfileId",
            _ => field
        };
    }

    private static bool RequiresSplitBasis(string? splitMethod)
    {
        return splitMethod is ExpenseBillItemSplitMethods.ExactAmount
            or ExpenseBillItemSplitMethods.Percentage
            or ExpenseBillItemSplitMethods.Ratio
            or ExpenseBillItemSplitMethods.ShareWeight;
    }

    private static bool IsPlainDecimalString(string value)
    {
        var index = 0;
        if (value[0] is '-')
        {
            index = 1;
            if (index == value.Length)
            {
                return false;
            }
        }

        var integerDigits = 0;
        var fractionalDigits = 0;
        var decimalPointSeen = false;

        for (; index < value.Length; index++)
        {
            var character = value[index];
            if (character is >= '0' and <= '9')
            {
                if (decimalPointSeen)
                {
                    fractionalDigits++;
                }
                else
                {
                    integerDigits++;
                }

                continue;
            }

            if (character is '.' && !decimalPointSeen)
            {
                decimalPointSeen = true;
                continue;
            }

            return false;
        }

        return integerDigits > 0 && (!decimalPointSeen || fractionalDigits > 0);
    }

    private static void AddRowError(
        List<BillCsvImportRowErrorResponse> errors,
        int rowNumber,
        string field,
        string code,
        string message)
    {
        var error = new BillCsvImportRowErrorResponse(rowNumber, field, code, message);
        if (!errors.Contains(error))
        {
            errors.Add(error);
        }
    }

    private static bool HasCsvContentType(string? contentType)
    {
        if (contentType is null)
        {
            return false;
        }

        var mediaType = contentType.Split(';', 2)[0].Trim();
        return string.Equals(mediaType, CsvContentType, StringComparison.OrdinalIgnoreCase);
    }

    private static string TrimUtf8Bom(string value)
    {
        return value.Length > 0 && value[0] == '\uFEFF'
            ? value[1..]
            : value;
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : BillImportUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult BillImportUnavailable()
    {
        return Results.Problem(
            title: BillImportUnavailableTitle,
            detail: BillImportUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidBillImportRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidBillImportRequestTitle,
            detail: InvalidBillImportRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult BillImportWriteFailed()
    {
        return Results.Problem(
            title: BillImportWriteFailedTitle,
            detail: BillImportWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private enum ImportScope
    {
        Personal,
        Group
    }

    private sealed record CsvBodyReadResult(
        string? CsvText,
        IDictionary<string, string[]> Errors)
    {
        public bool Succeeded => Errors.Count == 0;

        public static CsvBodyReadResult Valid(string csvText)
        {
            return new CsvBodyReadResult(csvText, new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static CsvBodyReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new CsvBodyReadResult(null, errors);
        }
    }

    private sealed record CsvRecord(
        int RowNumber,
        IReadOnlyList<string> Fields);

    private sealed record CsvParseResult(
        IReadOnlyList<CsvRecord> Records,
        IDictionary<string, string[]> Errors)
    {
        public bool Succeeded => Errors.Count == 0;

        public static CsvParseResult Valid(IReadOnlyList<CsvRecord> records)
        {
            return new CsvParseResult(records, new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static CsvParseResult Invalid(IDictionary<string, string[]> errors)
        {
            return new CsvParseResult([], errors);
        }
    }

    private sealed record HeaderReadResult(
        IReadOnlyDictionary<string, int> HeaderIndexes,
        IReadOnlyList<BillCsvImportRowErrorResponse> Errors)
    {
        public bool Succeeded => Errors.Count == 0;

        public static HeaderReadResult Valid(IReadOnlyDictionary<string, int> headerIndexes)
        {
            return new HeaderReadResult(headerIndexes, []);
        }

        public static HeaderReadResult Invalid(IReadOnlyList<BillCsvImportRowErrorResponse> errors)
        {
            return new HeaderReadResult(
                new Dictionary<string, int>(StringComparer.Ordinal),
                errors);
        }
    }

    private sealed record BillCsvImportRow(
        int RowNumber,
        string ClientBillKey,
        string? MerchantName,
        DateOnly BillDate,
        string Currency,
        string ItemName,
        decimal ItemAmount,
        string? ItemNote,
        Guid PayerUserProfileId,
        Guid SplitUserProfileId,
        string SplitMethod,
        decimal? SplitBasisValue);

    private sealed record BillCsvImportPlanResult(
        BillCsvImportResponse? Response,
        IReadOnlyList<ExpenseBill> Bills,
        IResult? ErrorResult)
    {
        public bool Succeeded => ErrorResult is null && Response is not null && Response.Errors.Count == 0;

        public static BillCsvImportPlanResult Success(
            BillCsvImportResponse response,
            IReadOnlyList<ExpenseBill> bills)
        {
            return new BillCsvImportPlanResult(response, bills, null);
        }

        public static BillCsvImportPlanResult Failed(BillCsvImportResponse response)
        {
            return new BillCsvImportPlanResult(response, [], null);
        }

        public static BillCsvImportPlanResult Failed(IResult errorResult)
        {
            return new BillCsvImportPlanResult(null, [], errorResult);
        }
    }
}

internal sealed record BillCsvImportResponse(
    int RowCount,
    int ImportedBillCount,
    int RejectedRowCount,
    IReadOnlyList<BillCsvImportRowErrorResponse> Errors,
    IReadOnlyList<BillCsvImportedBillSummaryResponse> Bills);

internal sealed record BillCsvImportRowErrorResponse(
    int RowNumber,
    string Field,
    string Code,
    string Message);

internal sealed record BillCsvImportedBillSummaryResponse(
    Guid BillId,
    Guid? GroupId,
    DateOnly BillDate,
    string Status,
    string TotalAmount,
    string TotalCurrency,
    int ItemCount,
    int ParticipantCount,
    int PayerCount);
