namespace Settleora.Api.Auth.Invitations;

internal sealed class InvitationAbusePolicyOptions
{
    public static InvitationAbusePolicyOptions Default { get; } = new();

    public TimeSpan Window { get; init; } = TimeSpan.FromMinutes(15);

    public TimeSpan ThrottleDuration { get; init; } = TimeSpan.FromMinutes(5);

    public TimeSpan EntryRetention { get; init; } = TimeSpan.FromHours(1);

    public int SourceLimit { get; init; } = 30;

    public int ActorLimit { get; init; } = 20;

    public int SubjectLimit { get; init; } = 5;

    public int ActorSubjectLimit { get; init; } = 3;

    public int GlobalLimit { get; init; } = 200;

    public void Validate()
    {
        RequirePositive(Window, nameof(Window));
        RequirePositive(ThrottleDuration, nameof(ThrottleDuration));
        RequirePositive(EntryRetention, nameof(EntryRetention));
        RequirePositive(SourceLimit, nameof(SourceLimit));
        RequirePositive(ActorLimit, nameof(ActorLimit));
        RequirePositive(SubjectLimit, nameof(SubjectLimit));
        RequirePositive(ActorSubjectLimit, nameof(ActorSubjectLimit));
        RequirePositive(GlobalLimit, nameof(GlobalLimit));

        if (EntryRetention < Window)
        {
            throw new InvalidOperationException("Invitation abuse policy retention must cover the counting window.");
        }

        if (EntryRetention < ThrottleDuration)
        {
            throw new InvalidOperationException("Invitation abuse policy retention must cover the throttle duration.");
        }
    }

    private static void RequirePositive(TimeSpan value, string name)
    {
        if (value <= TimeSpan.Zero)
        {
            throw new InvalidOperationException($"{name} must be positive.");
        }
    }

    private static void RequirePositive(int value, string name)
    {
        if (value <= 0)
        {
            throw new InvalidOperationException($"{name} must be positive.");
        }
    }
}
