namespace Settleora.Api.Notifications;

internal sealed class SmtpEmailNotificationOptions
{
    public const string SectionName = "Notifications:SmtpEmail";

    public bool Enabled { get; set; }

    public string? Host { get; set; }

    public int Port { get; set; } = 587;

    public bool UseTls { get; set; } = true;

    public string? Username { get; set; }

    public string? Password { get; set; }

    public string? FromAddress { get; set; }

    public string? FromName { get; set; } = "Settleora";

    public int TimeoutSeconds { get; set; } = 30;

    public bool HasRequiredConnectionFields()
    {
        return !string.IsNullOrWhiteSpace(Host)
            && Port is > 0 and <= 65535
            && !string.IsNullOrWhiteSpace(FromAddress)
            && TimeoutSeconds is > 0 and <= 120;
    }
}
