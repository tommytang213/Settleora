using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class GroupBillEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string GroupsPath = "/api/v1/groups";
    private const string GroupBillCreatedAction = "bill.created";
    private const string WrongRawToken = "visible-wrong-group-bill-session-token";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 7, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 7, 12, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 7, 12, 30, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public GroupBillEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PostGroupBillCreatesDraftBillForActiveMemberWithServerCalculationAndSafeAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Bill Actor");
        var member = await SeedAccountAsync(testFactory, "Group Bill Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Dinner Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(member.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, actorSession.AuthSessionId);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            BillsPath(groupId),
            actorSession.RawSessionToken,
            JsonSerializer.Serialize(new
            {
                merchantName = "  Night Market  ",
                billDate = "2026-05-07",
                currency = "USD",
                items = new[]
                {
                    new
                    {
                        name = "  Dinner  ",
                        note = "  Shared noodles  ",
                        amount = "12.00",
                        splits = new[]
                        {
                            new
                            {
                                userProfileId = actorSession.UserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "7.00",
                                allocationOrder = 0
                            },
                            new
                            {
                                userProfileId = member.UserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "5.00",
                                allocationOrder = 1
                            }
                        }
                    }
                },
                adjustments = new[]
                {
                    new
                    {
                        type = ExpenseBillAdjustmentTypes.ServiceCharge,
                        direction = ExpenseBillAdjustmentDirections.Charge,
                        allocationMethod = ExpenseBillAdjustmentAllocationMethods.Equal,
                        amount = "2.00",
                        reasonNote = "  Tip  "
                    }
                },
                payers = new[]
                {
                    new
                    {
                        userProfileId = actorSession.UserProfileId,
                        amount = "9.00",
                        paymentMethodLabelSnapshot = "  Cash  "
                    },
                    new
                    {
                        userProfileId = member.UserProfileId,
                        amount = "5.00",
                        paymentMethodLabelSnapshot = "  Card  "
                    }
                }
            }));

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeGroupBillResponseContent(content, actorSession.RawSessionToken, sessionTokenHash);

        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        var billId = root.GetProperty("id").GetGuid();

        Assert.Equal($"/api/v1/groups/{groupId:D}/bills/{billId:D}", response.Headers.Location?.OriginalString);
        Assert.Equal(groupId, root.GetProperty("groupId").GetGuid());
        Assert.Equal("Night Market", root.GetProperty("merchantName").GetString());
        Assert.Equal("2026-05-07", root.GetProperty("billDate").GetString());
        Assert.Equal(ExpenseBillStatuses.Draft, root.GetProperty("status").GetString());
        Assert.Equal("14", root.GetProperty("totalAmount").GetString());
        Assert.Equal("USD", root.GetProperty("totalCurrency").GetString());
        Assert.Equal(WriteTimestamp, root.GetProperty("createdAtUtc").GetDateTimeOffset());
        Assert.Equal(WriteTimestamp, root.GetProperty("updatedAtUtc").GetDateTimeOffset());

        var item = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal("Dinner", item.GetProperty("name").GetString());
        Assert.Equal("Shared noodles", item.GetProperty("note").GetString());
        Assert.Equal("12", item.GetProperty("amount").GetString());

        var splits = item.GetProperty("splits").EnumerateArray().ToArray();
        Assert.Equal([actorSession.UserProfileId, member.UserProfileId], splits.Select(split => split.GetProperty("userProfileId").GetGuid()).ToArray());
        Assert.Equal(["7", "5"], splits.Select(split => split.GetProperty("resolvedAmount").GetString()!).ToArray());

        var participants = root.GetProperty("participants").EnumerateArray()
            .Select(participant => new
            {
                UserProfileId = participant.GetProperty("userProfileId").GetGuid(),
                ResolvedShareAmount = participant.GetProperty("resolvedShareAmount").GetString()!
            })
            .ToArray();
        var participantShares = participants.ToDictionary(
            participant => participant.UserProfileId,
            participant => participant.ResolvedShareAmount);
        Assert.Equal("8", participantShares[actorSession.UserProfileId]);
        Assert.Equal("6", participantShares[member.UserProfileId]);

        var payers = root.GetProperty("payers").EnumerateArray().ToArray();
        var payerResponses = payers
            .ToDictionary(
                payer => payer.GetProperty("userProfileId").GetGuid(),
                payer => new
                {
                    Amount = payer.GetProperty("amount").GetString()!,
                    PaymentMethodLabelSnapshot = payer.GetProperty("paymentMethodLabelSnapshot").GetString()!
                });
        Assert.Equal(["5", "9"], payerResponses.Values.Select(payer => payer.Amount).Order().ToArray());
        Assert.Equal("9", payerResponses[actorSession.UserProfileId].Amount);
        Assert.Equal("Cash", payerResponses[actorSession.UserProfileId].PaymentMethodLabelSnapshot);
        Assert.Equal("5", payerResponses[member.UserProfileId].Amount);
        Assert.Equal("Card", payerResponses[member.UserProfileId].PaymentMethodLabelSnapshot);

        var adjustment = Assert.Single(root.GetProperty("adjustments").EnumerateArray());
        Assert.Equal(ExpenseBillAdjustmentTypes.ServiceCharge, adjustment.GetProperty("type").GetString());
        Assert.Equal("2", adjustment.GetProperty("amount").GetString());
        Assert.Equal("Tip", adjustment.GetProperty("reasonNote").GetString());

        var allocations = root.GetProperty("calculatedAdjustmentAllocations").EnumerateArray().ToArray();
        Assert.Equal(2, allocations.Length);
        Assert.All(allocations, allocation => Assert.Equal("1", allocation.GetProperty("allocatedAmount").GetString()));

        var bill = await ReadBillAsync(testFactory, billId);
        Assert.Equal(groupId, bill.GroupId);
        Assert.Equal(actorSession.UserProfileId, bill.CreatedByUserProfileId);
        Assert.Equal("Night Market", bill.MerchantName);
        Assert.Equal(14m, bill.TotalAmount);
        Assert.Equal("USD", bill.TotalCurrency);
        Assert.Equal(2, bill.Participants.Count);
        Assert.Single(bill.Items);
        Assert.Equal(2, bill.Items.Single().Splits.Count);
        Assert.Single(bill.Adjustments);
        Assert.Equal(2, bill.Payers.Count);

        var auditEvent = await AssertSingleGroupBillAuditEventAsync(
            testFactory,
            actorSession.AuthAccountId,
            billId,
            groupId,
            WriteTimestamp);
        AssertGroupBillAuditMetadata(
            auditEvent,
            billId,
            groupId,
            ExpenseBillStatuses.Draft,
            itemCount: 1,
            adjustmentCount: 1,
            participantCount: 2,
            payerCount: 2,
            currency: "USD",
            totalAmount: "14");
        AssertSafeGroupBillAuditContent(
            auditEvent,
            actorSession.RawSessionToken,
            "Night Market",
            "Dinner",
            "Shared noodles",
            "Tip",
            "Cash",
            "Card");
    }

    [Fact]
    public async Task PostGroupBillDefaultsOmittedPayersToAuthenticatedActor()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Default Payer Actor");
        var member = await SeedAccountAsync(testFactory, "Default Payer Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Default Payer Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(member.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            BillsPath(groupId),
            actorSession.RawSessionToken,
            CreateGroupBillContent(actorSession.UserProfileId, member.UserProfileId, includePayers: false));

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var payer = Assert.Single(payload.RootElement.GetProperty("payers").EnumerateArray());
        Assert.Equal(actorSession.UserProfileId, payer.GetProperty("userProfileId").GetGuid());
        Assert.Equal("10", payer.GetProperty("amount").GetString());

        var bill = await ReadBillAsync(testFactory, payload.RootElement.GetProperty("id").GetGuid());
        var persistedPayer = Assert.Single(bill.Payers);
        Assert.Equal(actorSession.UserProfileId, persistedPayer.UserProfileId);
        Assert.Equal(10m, persistedPayer.Amount);
    }

    [Fact]
    public async Task PostGroupBillRejectsUnauthenticatedRequest()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var groupId = Guid.NewGuid();
        using var client = testFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, BillsPath(groupId))
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response);
    }

    [Fact]
    public async Task PostGroupBillRejectsActorWhoIsNotActiveGroupMemberWithoutAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Unrelated Actor");
        var owner = await SeedAccountAsync(testFactory, "Hidden Owner", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            owner.UserProfileId,
            "Hidden Group",
            InitialTimestamp,
            null,
            new MembershipSeed(owner.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            BillsPath(groupId),
            actorSession.RawSessionToken,
            CreateGroupBillContent(owner.UserProfileId, owner.UserProfileId, includePayers: false));

        using var response = await client.SendAsync(request);

        await AssertGroupBillUnavailableProblemAsync(response);
        await AssertNoBillsCreatedByAsync(testFactory, actorSession.UserProfileId);
        await AssertNoGroupBillAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task PostGroupBillRejectsClientSubmittedIdentityFieldsWithoutEchoingValues()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Identity Actor");
        var member = await SeedAccountAsync(testFactory, "Identity Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Identity Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(member.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var requestBody = JsonSerializer.Serialize(new
        {
            merchantName = "Visible Merchant",
            billDate = "2026-05-07",
            currency = "USD",
            createdByUserProfileId = Guid.NewGuid(),
            groupId = Guid.NewGuid(),
            authAccountId = Guid.NewGuid(),
            authSessionId = Guid.NewGuid(),
            rawSessionToken = "visible-group-bill-token",
            items = new[]
            {
                new
                {
                    name = "Lunch",
                    amount = "10.00",
                    splits = new[]
                    {
                        new
                        {
                            userProfileId = actorSession.UserProfileId,
                            splitMethod = ExpenseBillItemSplitMethods.Equal
                        }
                    }
                }
            }
        });
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            BillsPath(groupId),
            actorSession.RawSessionToken,
            requestBody);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        await AssertInvalidGroupBillRequestProblemAsync(response, content);
        Assert.Contains("Unsupported fields are not allowed.", content);
        Assert.DoesNotContain("createdByUserProfileId", content);
        Assert.DoesNotContain("authAccountId", content);
        Assert.DoesNotContain("authSessionId", content);
        Assert.DoesNotContain("visible-group-bill-token", content);
        await AssertNoBillsCreatedByAsync(testFactory, actorSession.UserProfileId);
        await AssertNoGroupBillAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task PostGroupBillRejectsSplitParticipantWhoIsNotActiveGroupMember()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Split Actor");
        var outsideUser = await SeedAccountAsync(testFactory, "Outside Split User", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Split Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            BillsPath(groupId),
            actorSession.RawSessionToken,
            CreateGroupBillContent(actorSession.UserProfileId, outsideUser.UserProfileId, includePayers: false));

        using var response = await client.SendAsync(request);

        await AssertGroupBillUnavailableProblemAsync(response);
        await AssertNoBillsCreatedByAsync(testFactory, actorSession.UserProfileId);
        await AssertNoGroupBillAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task PostGroupBillRejectsPayerWhoIsNotActiveGroupMember()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Payer Actor");
        var outsidePayer = await SeedAccountAsync(testFactory, "Outside Payer", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Payer Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            BillsPath(groupId),
            actorSession.RawSessionToken,
            JsonSerializer.Serialize(new
            {
                billDate = "2026-05-07",
                currency = "USD",
                items = new[]
                {
                    new
                    {
                        name = "Lunch",
                        amount = "10.00",
                        splits = new[]
                        {
                            new
                            {
                                userProfileId = actorSession.UserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.Equal
                            }
                        }
                    }
                },
                payers = new[]
                {
                    new
                    {
                        userProfileId = outsidePayer.UserProfileId,
                        amount = "10.00"
                    }
                }
            }));

        using var response = await client.SendAsync(request);

        await AssertGroupBillUnavailableProblemAsync(response);
        await AssertNoBillsCreatedByAsync(testFactory, actorSession.UserProfileId);
        await AssertNoGroupBillAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task PostGroupBillRejectsMismatchedPayerTotals()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Mismatch Actor");
        var member = await SeedAccountAsync(testFactory, "Mismatch Member", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Mismatch Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(member.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            BillsPath(groupId),
            actorSession.RawSessionToken,
            JsonSerializer.Serialize(new
            {
                billDate = "2026-05-07",
                currency = "USD",
                items = new[]
                {
                    new
                    {
                        name = "Lunch",
                        amount = "10.00",
                        splits = new[]
                        {
                            new
                            {
                                userProfileId = actorSession.UserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "5.00"
                            },
                            new
                            {
                                userProfileId = member.UserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "5.00"
                            }
                        }
                    }
                },
                payers = new[]
                {
                    new
                    {
                        userProfileId = actorSession.UserProfileId,
                        amount = "9.99"
                    }
                }
            }));

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        await AssertInvalidGroupBillRequestProblemAsync(response, content);
        Assert.Contains("Payer contribution totals must equal the resolved bill total.", content);
        await AssertNoBillsCreatedByAsync(testFactory, actorSession.UserProfileId);
        await AssertNoGroupBillAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task GetGroupBillListReturnsOnlyBillsForRouteGroup()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "List Actor");
        var other = await SeedAccountAsync(testFactory, "List Other", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "List Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(other.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var otherGroupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Other List Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(other.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var olderBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId,
            [actorSession.UserProfileId, other.UserProfileId],
            "Older Route Group Bill",
            InitialTimestamp.AddMinutes(1));
        var newerBillId = await SeedBillAsync(
            testFactory,
            other.UserProfileId,
            groupId,
            [actorSession.UserProfileId, other.UserProfileId],
            "Newer Route Group Bill",
            InitialTimestamp.AddMinutes(2));
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId,
            [actorSession.UserProfileId],
            "Archived Route Group Bill",
            InitialTimestamp.AddMinutes(3),
            archivedAtUtc: ValidationTimestamp);
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            null,
            [actorSession.UserProfileId],
            "Personal Bill",
            InitialTimestamp.AddMinutes(4));
        await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            otherGroupId,
            [actorSession.UserProfileId, other.UserProfileId],
            "Other Group Bill",
            InitialTimestamp.AddMinutes(5));
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, BillsPath(groupId), actorSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var bills = payload.RootElement.GetProperty("bills")
            .EnumerateArray()
            .Select(bill => new
            {
                Id = bill.GetProperty("id").GetGuid(),
                GroupId = bill.GetProperty("groupId").GetGuid(),
                MerchantName = bill.GetProperty("merchantName").GetString()!
            })
            .ToArray();

        Assert.Equal([newerBillId, olderBillId], bills.Select(bill => bill.Id).ToArray());
        Assert.All(bills, bill => Assert.Equal(groupId, bill.GroupId));
        Assert.Equal(["Newer Route Group Bill", "Older Route Group Bill"], bills.Select(bill => bill.MerchantName).ToArray());
    }

    [Fact]
    public async Task GetGroupBillListAndReadRejectUnsupportedQueryFieldsWithoutSideEffectsOrEcho()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Query Actor");
        var other = await SeedAccountAsync(testFactory, "Group Query Other", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actor.UserProfileId,
            "Visible Query Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(other.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var hiddenGroupId = await SeedGroupAsync(
            testFactory,
            other.UserProfileId,
            "Hidden Query Group",
            InitialTimestamp,
            null,
            new MembershipSeed(other.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var visibleBillId = await SeedBillAsync(
            testFactory,
            actor.UserProfileId,
            groupId,
            [actor.UserProfileId, other.UserProfileId],
            "Visible Query Group Bill",
            InitialTimestamp.AddMinutes(2));
        var hiddenBillId = await SeedBillAsync(
            testFactory,
            other.UserProfileId,
            hiddenGroupId,
            [other.UserProfileId],
            "Hidden Query Group Bill",
            InitialTimestamp.AddMinutes(3));
        var beforeCounts = await CountProtectedBillRowsAsync(testFactory);
        var unsupportedQuery = string.Join(
            "&",
            $"billId={hiddenBillId:D}",
            $"groupId={hiddenGroupId:D}",
            $"participantUserProfileId={other.UserProfileId:D}",
            $"payerUserProfileId={other.UserProfileId:D}",
            $"settlementId={Guid.NewGuid():D}",
            $"paymentId={Guid.NewGuid():D}",
            $"fileId={Guid.NewGuid():D}",
            $"ocrJobId={Guid.NewGuid():D}",
            "merchantName=Hidden Query Group Bill",
            "hiddenSelector=Hidden Query Group Selector");
        using var client = testFactory.CreateClient();

        using (var listRequest = CreateBearerRequest(HttpMethod.Get, $"{BillsPath(groupId)}?{unsupportedQuery}", actor.RawSessionToken))
        using (var listResponse = await client.SendAsync(listRequest))
        {
            var content = await listResponse.Content.ReadAsStringAsync();
            await AssertInvalidGroupBillRequestProblemAsync(listResponse, content);
            Assert.Contains("Unsupported query fields are not allowed.", content);
            AssertValidationResponseIsBounded(content, hiddenBillId, hiddenGroupId, other.UserProfileId, "Hidden Query");
            Assert.DoesNotContain("Visible Query Group Bill", content);
        }

        using (var readRequest = CreateBearerRequest(HttpMethod.Get, $"{BillsPath(groupId, visibleBillId)}?{unsupportedQuery}", actor.RawSessionToken))
        using (var readResponse = await client.SendAsync(readRequest))
        {
            var content = await readResponse.Content.ReadAsStringAsync();
            await AssertInvalidGroupBillRequestProblemAsync(readResponse, content);
            Assert.Contains("Unsupported query fields are not allowed.", content);
            AssertValidationResponseIsBounded(content, hiddenBillId, hiddenGroupId, other.UserProfileId, "Hidden Query");
            Assert.DoesNotContain("Visible Query Group Bill", content);
        }

        Assert.Equal(beforeCounts, await CountProtectedBillRowsAsync(testFactory));
        await AssertNoGroupBillAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task GetGroupBillListAndReadRejectBodiesWithoutSideEffectsOrEcho()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Body Actor");
        var other = await SeedAccountAsync(testFactory, "Group Body Other", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actor.UserProfileId,
            "Visible Body Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(other.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var hiddenGroupId = await SeedGroupAsync(
            testFactory,
            other.UserProfileId,
            "Hidden Body Group",
            InitialTimestamp,
            null,
            new MembershipSeed(other.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var visibleBillId = await SeedBillAsync(
            testFactory,
            actor.UserProfileId,
            groupId,
            [actor.UserProfileId, other.UserProfileId],
            "Visible Body Group Bill",
            InitialTimestamp.AddMinutes(2));
        var hiddenBillId = await SeedBillAsync(
            testFactory,
            other.UserProfileId,
            hiddenGroupId,
            [other.UserProfileId],
            "Hidden Body Group Bill",
            InitialTimestamp.AddMinutes(3));
        var beforeCounts = await CountProtectedBillRowsAsync(testFactory);
        var body = JsonSerializer.Serialize(new
        {
            billId = hiddenBillId,
            groupId = hiddenGroupId,
            participantUserProfileId = other.UserProfileId,
            payerUserProfileId = other.UserProfileId,
            settlementId = Guid.NewGuid(),
            paymentId = Guid.NewGuid(),
            fileId = Guid.NewGuid(),
            ocrJobId = Guid.NewGuid(),
            merchantName = "Hidden Body Group Bill"
        });
        using var client = testFactory.CreateClient();

        using (var listRequest = CreateJsonRequest(HttpMethod.Get, $"{BillsPath(groupId)}?status={ExpenseBillStatuses.Draft}", actor.RawSessionToken, body))
        using (var listResponse = await client.SendAsync(listRequest))
        {
            var content = await listResponse.Content.ReadAsStringAsync();
            await AssertInvalidGroupBillRequestProblemAsync(listResponse, content);
            Assert.Contains("Group bill list requests do not accept a body.", content);
            AssertValidationResponseIsBounded(content, hiddenBillId, hiddenGroupId, other.UserProfileId, "Hidden Body");
            Assert.DoesNotContain("Visible Body Group Bill", content);
        }

        using (var readRequest = CreateJsonRequest(HttpMethod.Get, BillsPath(groupId, visibleBillId), actor.RawSessionToken, body))
        using (var readResponse = await client.SendAsync(readRequest))
        {
            var content = await readResponse.Content.ReadAsStringAsync();
            await AssertInvalidGroupBillRequestProblemAsync(readResponse, content);
            Assert.Contains("Group bill read requests do not accept a body.", content);
            AssertValidationResponseIsBounded(content, hiddenBillId, hiddenGroupId, other.UserProfileId, "Hidden Body");
            Assert.DoesNotContain("Visible Body Group Bill", content);
        }

        Assert.Equal(beforeCounts, await CountProtectedBillRowsAsync(testFactory));
        await AssertNoGroupBillAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task GetGroupBillListRejectsDuplicateAndInvalidSingletonQueryValues()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group Filter Actor");
        var groupId = await SeedGroupAsync(
            testFactory,
            actor.UserProfileId,
            "Filter Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actor.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        await SeedBillAsync(
            testFactory,
            actor.UserProfileId,
            groupId,
            [actor.UserProfileId],
            "Visible Filter Group Bill",
            InitialTimestamp.AddMinutes(1));
        var beforeCounts = await CountProtectedBillRowsAsync(testFactory);
        using var client = testFactory.CreateClient();

        using (var duplicateRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{BillsPath(groupId)}?fromDate=2026-05-01&fromDate=2026-05-02&limit=10&limit=20",
            actor.RawSessionToken))
        using (var duplicateResponse = await client.SendAsync(duplicateRequest))
        {
            var content = await duplicateResponse.Content.ReadAsStringAsync();
            await AssertInvalidGroupBillRequestProblemAsync(duplicateResponse, content);
            Assert.Contains("\"fromDate\":[\"Only one value is supported.\"]", content);
            Assert.Contains("\"limit\":[\"Only one value is supported.\"]", content);
            Assert.DoesNotContain("Visible Filter Group Bill", content);
        }

        using (var invalidRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{BillsPath(groupId)}?fromDate=not-a-date&status=not-a-status&currency=usd&limit=9999&merchant=HiddenInvalidMerchant",
            actor.RawSessionToken))
        using (var invalidResponse = await client.SendAsync(invalidRequest))
        {
            var content = await invalidResponse.Content.ReadAsStringAsync();
            await AssertInvalidGroupBillRequestProblemAsync(invalidResponse, content);
            Assert.Contains("From date must be a yyyy-MM-dd date string.", content);
            Assert.Contains("Bill status is not supported.", content);
            Assert.Contains("Currency must be an uppercase three-letter code.", content);
            Assert.Contains("Limit must be between 1 and 200.", content);
            Assert.DoesNotContain("not-a-date", content);
            Assert.DoesNotContain("not-a-status", content);
            Assert.DoesNotContain("HiddenInvalidMerchant", content);
            Assert.DoesNotContain("Visible Filter Group Bill", content);
        }

        Assert.Equal(beforeCounts, await CountProtectedBillRowsAsync(testFactory));
    }

    [Fact]
    public async Task GetGroupBillByIdFailsClosedForUnavailableBillOrNonMemberAccess()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Get Actor");
        var other = await SeedAccountAsync(testFactory, "Get Other", InitialTimestamp.AddMinutes(1));
        var groupId = await SeedGroupAsync(
            testFactory,
            actorSession.UserProfileId,
            "Get Group",
            InitialTimestamp,
            null,
            new MembershipSeed(actorSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(other.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var otherGroupId = await SeedGroupAsync(
            testFactory,
            other.UserProfileId,
            "Hidden Other Group",
            InitialTimestamp,
            null,
            new MembershipSeed(other.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var unavailableRequests = new[]
        {
            BillsPath(groupId, Guid.NewGuid()),
            BillsPath(groupId, await SeedBillAsync(testFactory, actorSession.UserProfileId, groupId, [actorSession.UserProfileId], "Archived Bill", InitialTimestamp, archivedAtUtc: ValidationTimestamp)),
            BillsPath(groupId, await SeedBillAsync(testFactory, actorSession.UserProfileId, null, [actorSession.UserProfileId], "Personal Bill", InitialTimestamp)),
            BillsPath(groupId, await SeedBillAsync(testFactory, other.UserProfileId, otherGroupId, [other.UserProfileId], "Other Group Bill", InitialTimestamp)),
            BillsPath(otherGroupId, await SeedBillAsync(testFactory, other.UserProfileId, otherGroupId, [other.UserProfileId], "Non Member Bill", InitialTimestamp.AddMinutes(1)))
        };
        using var client = testFactory.CreateClient();

        foreach (var path in unavailableRequests)
        {
            using var request = CreateBearerRequest(HttpMethod.Get, path, actorSession.RawSessionToken);
            using var response = await client.SendAsync(request);

            await AssertGroupBillUnavailableProblemAsync(response);
        }
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new GroupBillTestTimeProvider(InitialTimestamp);
        var testFactory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<SettleoraDbContext>();
                services.RemoveAll<DbContextOptions>();
                services.RemoveAll<DbContextOptions<SettleoraDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<SettleoraDbContext>>();
                services.AddDbContext<SettleoraDbContext>(options =>
                {
                    options.UseInMemoryDatabase(databaseName);
                });

                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(timeProvider);
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        GroupBillTestTimeProvider timeProvider,
        string displayName)
    {
        var account = await SeedAccountAsync(testFactory, displayName, InitialTimestamp);
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Group bill endpoint test",
                UserAgentSummary: "Group bill endpoint test user agent",
                NetworkAddressHash: "group-bill-endpoint-test-network",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededSession(
            account.AuthAccountId,
            account.UserProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            sessionCreationResult.SessionExpiresAtUtc.Value);
    }

    private static async Task<SeededAccount> SeedAccountAsync(
        WebApplicationFactory<Program> testFactory,
        string displayName,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
            DefaultCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
        return new SeededAccount(authAccountId, userProfileId);
    }

    private static async Task<Guid> SeedGroupAsync(
        WebApplicationFactory<Program> testFactory,
        Guid creatorProfileId,
        string name,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? deletedAtUtc,
        params MembershipSeed[] memberships)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var groupId = Guid.NewGuid();

        dbContext.Set<UserGroup>().Add(new UserGroup
        {
            Id = groupId,
            Name = name,
            CreatedByUserProfileId = creatorProfileId,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            DeletedAtUtc = deletedAtUtc
        });

        foreach (var membership in memberships)
        {
            dbContext.Set<GroupMembership>().Add(new GroupMembership
            {
                GroupId = groupId,
                UserProfileId = membership.UserProfileId,
                Role = membership.Role,
                Status = membership.Status,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        await dbContext.SaveChangesAsync();
        return groupId;
    }

    private static async Task<Guid> SeedBillAsync(
        WebApplicationFactory<Program> testFactory,
        Guid creatorProfileId,
        Guid? groupId,
        IReadOnlyList<Guid> participantProfileIds,
        string merchantName,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? archivedAtUtc = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var billId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var participantShare = decimal.Round(10m / participantProfileIds.Count, 4);

        var bill = new ExpenseBill
        {
            Id = billId,
            CreatedByUserProfileId = creatorProfileId,
            GroupId = groupId,
            MerchantName = merchantName,
            BillDate = DateOnly.FromDateTime(createdAtUtc.UtcDateTime),
            Status = ExpenseBillStatuses.Draft,
            TotalAmount = 10m,
            TotalCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            ArchivedAtUtc = archivedAtUtc
        };
        var item = new ExpenseBillItem
        {
            Id = itemId,
            ExpenseBillId = billId,
            Name = "Seeded Group Bill Item",
            Amount = 10m,
            Currency = "USD",
            SortOrder = 0,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };

        for (var index = 0; index < participantProfileIds.Count; index++)
        {
            var participantId = participantProfileIds[index];
            bill.Participants.Add(new ExpenseBillParticipant
            {
                ExpenseBillId = billId,
                UserProfileId = participantId,
                Status = ExpenseBillParticipantStatuses.PendingAcceptance,
                ResolvedShareAmount = participantShare,
                ResolvedShareCurrency = "USD",
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
            item.Splits.Add(new ExpenseBillItemSplit
            {
                Id = Guid.NewGuid(),
                ExpenseBillItemId = itemId,
                UserProfileId = participantId,
                SplitMethod = ExpenseBillItemSplitMethods.Equal,
                ResolvedAmount = participantShare,
                ResolvedCurrency = "USD",
                AllocationOrder = index,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        bill.Items.Add(item);
        bill.Payers.Add(new ExpenseBillPayer
        {
            Id = Guid.NewGuid(),
            ExpenseBillId = billId,
            UserProfileId = creatorProfileId,
            Amount = 10m,
            Currency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        dbContext.Set<ExpenseBill>().Add(bill);
        await dbContext.SaveChangesAsync();
        return billId;
    }

    private static async Task<ExpenseBill> ReadBillAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBill>()
            .Include(bill => bill.Items)
                .ThenInclude(item => item.Splits)
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .Include(bill => bill.Adjustments)
            .SingleAsync(bill => bill.Id == billId);
    }

    private static async Task<string> ReadSessionTokenHashAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthSession>()
            .Where(session => session.Id == authSessionId)
            .Select(session => session.SessionTokenHash)
            .SingleAsync();
    }

    private static async Task AssertNoBillsCreatedByAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var billCount = await dbContext.Set<ExpenseBill>()
            .CountAsync(bill => bill.CreatedByUserProfileId == userProfileId);

        Assert.Equal(0, billCount);
    }

    private static async Task<ProtectedBillRowCounts> CountProtectedBillRowsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new ProtectedBillRowCounts(
            await dbContext.Set<ExpenseBill>().CountAsync(),
            await dbContext.Set<ExpenseBillItem>().CountAsync(),
            await dbContext.Set<ExpenseBillItemSplit>().CountAsync(),
            await dbContext.Set<ExpenseBillParticipant>().CountAsync(),
            await dbContext.Set<ExpenseBillPayer>().CountAsync(),
            await dbContext.Set<ExpenseBillAdjustment>().CountAsync());
    }

    private static void AssertValidationResponseIsBounded(
        string content,
        Guid hiddenBillId,
        Guid hiddenGroupId,
        Guid hiddenUserProfileId,
        string hiddenTextPrefix)
    {
        Assert.DoesNotContain(hiddenBillId.ToString("D"), content);
        Assert.DoesNotContain(hiddenGroupId.ToString("D"), content);
        Assert.DoesNotContain(hiddenUserProfileId.ToString("D"), content);
        Assert.DoesNotContain(hiddenTextPrefix, content);
        Assert.DoesNotContain("settlementId", content);
        Assert.DoesNotContain("paymentId", content);
        Assert.DoesNotContain("fileId", content);
        Assert.DoesNotContain("ocrJobId", content);
    }

    private static async Task<AuthAuditEvent> AssertSingleGroupBillAuditEventAsync(
        WebApplicationFactory<Program> testFactory,
        Guid expectedAuthAccountId,
        Guid expectedBillId,
        Guid expectedGroupId,
        DateTimeOffset expectedOccurredAtUtc)
    {
        var auditEvent = Assert.Single(await ReadGroupBillAuditEventsAsync(testFactory));

        Assert.Equal(GroupBillCreatedAction, auditEvent.Action);
        Assert.Equal(expectedAuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.Equal(expectedAuthAccountId, auditEvent.SubjectAuthAccountId);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.Equal(expectedOccurredAtUtc, auditEvent.OccurredAtUtc);
        Assert.Null(auditEvent.CorrelationId);
        Assert.Null(auditEvent.RequestId);
        Assert.Contains(
            expectedBillId.ToString("D"),
            auditEvent.SafeMetadataJson ?? string.Empty,
            StringComparison.Ordinal);
        Assert.Contains(
            expectedGroupId.ToString("D"),
            auditEvent.SafeMetadataJson ?? string.Empty,
            StringComparison.Ordinal);

        return auditEvent;
    }

    private static async Task AssertNoGroupBillAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        Assert.Empty(await ReadGroupBillAuditEventsAsync(testFactory));
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadGroupBillAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        var events = await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action == GroupBillCreatedAction)
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Id)
            .ToArrayAsync();

        return events
            .Where(auditEvent => IsGroupBillAuditEvent(auditEvent))
            .ToArray();
    }

    private static bool IsGroupBillAuditEvent(AuthAuditEvent auditEvent)
    {
        if (auditEvent.SafeMetadataJson is null)
        {
            return false;
        }

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);
        return metadata.RootElement.TryGetProperty("workflowName", out var workflowName)
            && workflowName.GetString() == "group_bill";
    }

    private static void AssertGroupBillAuditMetadata(
        AuthAuditEvent auditEvent,
        Guid expectedBillId,
        Guid expectedGroupId,
        string expectedStatus,
        int itemCount,
        int adjustmentCount,
        int participantCount,
        int payerCount,
        string currency,
        string totalAmount)
    {
        Assert.NotNull(auditEvent.SafeMetadataJson);
        Assert.True(auditEvent.SafeMetadataJson!.Length <= 4096);

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);
        var propertyNames = metadata.RootElement
            .EnumerateObject()
            .Select(property => property.Name)
            .Order(StringComparer.Ordinal)
            .ToArray();
        var expectedPropertyNames = new[]
        {
            "adjustmentCount",
            "billId",
            "currency",
            "groupId",
            "groupMode",
            "itemCount",
            "participantCount",
            "payerCount",
            "status",
            "totalAmount",
            "workflowName"
        };
        Assert.Equal(expectedPropertyNames, propertyNames);

        Assert.Equal("group_bill", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(expectedBillId.ToString("D"), metadata.RootElement.GetProperty("billId").GetString());
        Assert.Equal(expectedGroupId.ToString("D"), metadata.RootElement.GetProperty("groupId").GetString());
        Assert.Equal("group", metadata.RootElement.GetProperty("groupMode").GetString());
        Assert.Equal(expectedStatus, metadata.RootElement.GetProperty("status").GetString());
        Assert.Equal(itemCount, metadata.RootElement.GetProperty("itemCount").GetInt32());
        Assert.Equal(adjustmentCount, metadata.RootElement.GetProperty("adjustmentCount").GetInt32());
        Assert.Equal(participantCount, metadata.RootElement.GetProperty("participantCount").GetInt32());
        Assert.Equal(payerCount, metadata.RootElement.GetProperty("payerCount").GetInt32());
        Assert.Equal(currency, metadata.RootElement.GetProperty("currency").GetString());
        Assert.Equal(totalAmount, metadata.RootElement.GetProperty("totalAmount").GetString());
    }

    private static void AssertSafeGroupBillAuditContent(
        AuthAuditEvent auditEvent,
        params string[] forbiddenValues)
    {
        var auditText = string.Join(
            "\n",
            auditEvent.Action,
            auditEvent.Outcome,
            auditEvent.SafeMetadataJson ?? string.Empty);
        var lowerAuditText = auditText.ToLowerInvariant();

        foreach (var forbiddenValue in forbiddenValues)
        {
            Assert.DoesNotContain(forbiddenValue, auditText);
        }

        Assert.DoesNotContain("merchant", lowerAuditText);
        Assert.DoesNotContain("itemname", lowerAuditText);
        Assert.DoesNotContain("note", lowerAuditText);
        Assert.DoesNotContain("payment", lowerAuditText);
        Assert.DoesNotContain("method", lowerAuditText);
        Assert.DoesNotContain("label", lowerAuditText);
        Assert.DoesNotContain("request", lowerAuditText);
        Assert.DoesNotContain("body", lowerAuditText);
        Assert.DoesNotContain("auth", lowerAuditText);
        Assert.DoesNotContain("session", lowerAuditText);
        Assert.DoesNotContain("credential", lowerAuditText);
        Assert.DoesNotContain("token", lowerAuditText);
        Assert.DoesNotContain("hash", lowerAuditText);
        Assert.DoesNotContain("password", lowerAuditText);
        Assert.DoesNotContain("provider", lowerAuditText);
        Assert.DoesNotContain("payload", lowerAuditText);
        Assert.DoesNotContain("storage", lowerAuditText);
        Assert.DoesNotContain("path", lowerAuditText);
        Assert.DoesNotContain("file", lowerAuditText);
        Assert.DoesNotContain("object", lowerAuditText);
        Assert.DoesNotContain("vault", lowerAuditText);
        Assert.DoesNotContain("ocr", lowerAuditText);
    }

    private static void AssertSafeGroupBillResponseContent(
        string content,
        params string[] forbiddenValues)
    {
        var lowerContent = content.ToLowerInvariant();

        foreach (var forbiddenValue in forbiddenValues)
        {
            Assert.DoesNotContain(forbiddenValue, content);
        }

        Assert.DoesNotContain("auth", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("createdBy", content);
        Assert.DoesNotContain("account", lowerContent);
    }

    private static HttpRequestMessage CreateBearerRequest(
        HttpMethod method,
        string path,
        string rawSessionToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreateJsonRequest(
        HttpMethod method,
        string path,
        string rawSessionToken,
        string json)
    {
        var request = CreateBearerRequest(method, path, rawSessionToken);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        return request;
    }

    private static string BillsPath(Guid groupId)
    {
        return $"{GroupsPath}/{groupId:D}/bills";
    }

    private static string BillsPath(Guid groupId, Guid billId)
    {
        return $"{BillsPath(groupId)}/{billId:D}";
    }

    private static string CreateGroupBillContent(
        Guid firstUserProfileId,
        Guid secondUserProfileId,
        bool includePayers)
    {
        if (includePayers)
        {
            return JsonSerializer.Serialize(new
            {
                billDate = "2026-05-07",
                currency = "USD",
                items = new[]
                {
                    new
                    {
                        name = "Lunch",
                        amount = "10.00",
                        splits = new[]
                        {
                            new
                            {
                                userProfileId = firstUserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "5.00"
                            },
                            new
                            {
                                userProfileId = secondUserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "5.00"
                            }
                        }
                    }
                },
                payers = new[]
                {
                    new
                    {
                        userProfileId = firstUserProfileId,
                        amount = "10.00"
                    }
                }
            });
        }

        return JsonSerializer.Serialize(new
            {
                billDate = "2026-05-07",
                currency = "USD",
                items = new[]
                {
                    new
                    {
                        name = "Lunch",
                        amount = "10.00",
                        splits = new[]
                        {
                            new
                            {
                                userProfileId = firstUserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "5.00"
                            },
                            new
                            {
                                userProfileId = secondUserProfileId,
                                splitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                                basisValue = "5.00"
                            }
                        }
                    }
                }
            });
    }

    private static async Task AssertInvalidGroupBillRequestProblemAsync(
        HttpResponseMessage response,
        string? content = null)
    {
        content ??= await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid group bill request", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted group bill request is invalid.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertGroupBillUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Group bill unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested group bill is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertUnauthenticatedProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(WrongRawToken, content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Authentication is required to access this resource.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        GroupBillTestTimeProvider TimeProvider);

    private sealed record SeededAccount(
        Guid AuthAccountId,
        Guid UserProfileId);

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset SessionExpiresAtUtc);

    private sealed record MembershipSeed(
        Guid UserProfileId,
        string Role,
        string Status);

    private sealed record ProtectedBillRowCounts(
        int Bills,
        int Items,
        int ItemSplits,
        int Participants,
        int Payers,
        int Adjustments);

    private sealed class GroupBillTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public GroupBillTestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }

        public void SetUtcNow(DateTimeOffset value)
        {
            utcNow = value;
        }
    }
}
