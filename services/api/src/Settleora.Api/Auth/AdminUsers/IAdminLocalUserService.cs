using Settleora.Api.Auth.Authorization;

namespace Settleora.Api.Auth.AdminUsers;

internal interface IAdminLocalUserService
{
    Task<AdminLocalUserCreationResult> CreateLocalUserAsync(
        AdminLocalUserCreationRequest request,
        AuthenticatedActor actor,
        CancellationToken cancellationToken = default);
}
