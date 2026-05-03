namespace Settleora.Api.Auth.Authorization;

internal sealed class BusinessAuthorizationResult
{
    private BusinessAuthorizationResult(BusinessAuthorizationFailureReason failureReason)
    {
        FailureReason = failureReason;
    }

    public bool Allowed => FailureReason is BusinessAuthorizationFailureReason.None;

    public BusinessAuthorizationFailureReason FailureReason { get; }

    public string Code => GetCode(FailureReason);

    public static BusinessAuthorizationResult Allow()
    {
        return new BusinessAuthorizationResult(BusinessAuthorizationFailureReason.None);
    }

    public static BusinessAuthorizationResult Deny(BusinessAuthorizationFailureReason failureReason)
    {
        if (failureReason is BusinessAuthorizationFailureReason.None)
        {
            throw new ArgumentException(
                "Allowed decisions must be created with Allow().",
                nameof(failureReason));
        }

        return new BusinessAuthorizationResult(failureReason);
    }

    public override string ToString()
    {
        return $"BusinessAuthorizationResult {{ Code = {Code} }}";
    }

    private static string GetCode(BusinessAuthorizationFailureReason failureReason)
    {
        return failureReason switch
        {
            BusinessAuthorizationFailureReason.None => "allowed",
            BusinessAuthorizationFailureReason.DeniedUnauthenticated => "denied_unauthenticated",
            BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed => "denied_not_found_or_not_allowed",
            BusinessAuthorizationFailureReason.DeniedInsufficientRole => "denied_insufficient_role",
            _ => "denied_not_found_or_not_allowed"
        };
    }
}
