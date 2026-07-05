using Settleora.Api.Auth.Authorization;

namespace Settleora.Api.Auth.PasswordChange;

internal sealed record CurrentAccountPasswordChangeRequest(
    AuthenticatedActor Actor,
    string CurrentPassword,
    string NewPassword);
