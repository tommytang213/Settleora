using Settleora.Api.Users.SelfProfile;

namespace Settleora.Api.Auth.Bootstrap;

internal sealed record BootstrapLocalOwnerResponse(
    SelfUserProfileResponse UserProfile,
    IReadOnlyList<string> Roles);
