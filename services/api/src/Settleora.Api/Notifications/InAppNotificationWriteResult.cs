namespace Settleora.Api.Notifications;

internal sealed class InAppNotificationWriteResult
{
    private InAppNotificationWriteResult(bool succeeded)
    {
        Succeeded = succeeded;
    }

    public bool Succeeded { get; }

    public static InAppNotificationWriteResult Created()
    {
        return new InAppNotificationWriteResult(succeeded: true);
    }

    public static InAppNotificationWriteResult Skipped()
    {
        return new InAppNotificationWriteResult(succeeded: false);
    }
}
