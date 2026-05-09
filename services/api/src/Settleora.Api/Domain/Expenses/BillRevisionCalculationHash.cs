using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Settleora.Api.Domain.Expenses;

internal static class BillRevisionCalculationHash
{
    public static string Create(BillRevisionProposalSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        var builder = new StringBuilder();
        builder.Append("bill-revision-v1|");
        builder.Append(FormatAmount(snapshot.TotalAmount));
        builder.Append('|');
        builder.Append(snapshot.TotalCurrency);

        foreach (var participant in snapshot.Participants.OrderBy(participant => participant.UserProfileId))
        {
            builder.Append("|p:");
            builder.Append(participant.UserProfileId.ToString("D"));
            builder.Append(':');
            builder.Append(FormatAmount(participant.ResolvedShareAmount));
            builder.Append(':');
            builder.Append(participant.ResolvedShareCurrency);
        }

        foreach (var payer in snapshot.Payers.OrderBy(payer => payer.UserProfileId))
        {
            builder.Append("|pay:");
            builder.Append(payer.UserProfileId.ToString("D"));
            builder.Append(':');
            builder.Append(FormatAmount(payer.Amount));
            builder.Append(':');
            builder.Append(payer.Currency);
        }

        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString()));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.0000", CultureInfo.InvariantCulture);
    }
}
