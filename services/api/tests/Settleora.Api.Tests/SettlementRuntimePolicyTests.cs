using Microsoft.AspNetCore.Http;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Settlements;

namespace Settleora.Api.Tests;

public sealed class SettlementRuntimePolicyTests
{
    [Fact]
    public void RequestHasBodyDetectsContentLengthAndChunkedTransferEncoding()
    {
        var emptyRequest = new DefaultHttpContext().Request;
        Assert.False(SettlementRuntimePolicy.RequestHasBody(emptyRequest));

        var zeroLengthRequest = new DefaultHttpContext().Request;
        zeroLengthRequest.ContentLength = 0;
        Assert.False(SettlementRuntimePolicy.RequestHasBody(zeroLengthRequest));

        var explicitBodyRequest = new DefaultHttpContext().Request;
        explicitBodyRequest.ContentLength = 1;
        Assert.True(SettlementRuntimePolicy.RequestHasBody(explicitBodyRequest));

        var chunkedBodyRequest = new DefaultHttpContext().Request;
        chunkedBodyRequest.Headers.TransferEncoding = "chunked";
        Assert.True(SettlementRuntimePolicy.RequestHasBody(chunkedBodyRequest));
    }

    [Theory]
    [InlineData(SettlementPaymentStatuses.MarkedPaid, true)]
    [InlineData(SettlementPaymentStatuses.Confirmed, true)]
    [InlineData(SettlementPaymentStatuses.Disputed, false)]
    [InlineData(SettlementPaymentStatuses.Cancelled, false)]
    [InlineData("unsupported_status", false)]
    [InlineData(null, false)]
    public void IsActivePaymentStatusKeepsCoverageStatusesNarrow(
        string? status,
        bool expected)
    {
        Assert.Equal(expected, SettlementRuntimePolicy.IsActivePaymentStatus(status));
    }

    [Theory]
    [InlineData(50, 50, 50, SettlementRequestStatuses.Confirmed)]
    [InlineData(50, 50, 20, SettlementRequestStatuses.MarkedPaid)]
    [InlineData(50, 20, 20, SettlementRequestStatuses.PartiallyPaid)]
    [InlineData(50, 0, 0, SettlementRequestStatuses.Requested)]
    public void RecomputeSettlementRequestStatusUsesActiveAndConfirmedCoverage(
        decimal requestAmount,
        decimal activePaymentCoverage,
        decimal confirmedPaymentCoverage,
        string expectedStatus)
    {
        Assert.Equal(
            expectedStatus,
            SettlementRuntimePolicy.RecomputeSettlementRequestStatus(
                requestAmount,
                activePaymentCoverage,
                confirmedPaymentCoverage));
    }
}
