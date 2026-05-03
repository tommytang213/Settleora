namespace Settleora.Api.Auth.Authorization;

internal enum BusinessAuthorizationFailureReason
{
    None = 0,
    DeniedUnauthenticated,
    DeniedNotFoundOrNotAllowed,
    DeniedInsufficientRole
}
