using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class AuthenticatedApiPolicyBaselineTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly EndpointAuthorizationExpectation[] PublicEndpointAllowlist =
    [
        new("GET", "/health", "Liveness probe exposes only service status."),
        new("GET", "/health/ready", "Readiness probe exposes bounded dependency status only."),
        new("GET", "/api/v1/auth/bootstrap/status", "Fresh-deployment bootstrap status is needed before sign-in."),
        new("POST", "/api/v1/auth/bootstrap/local-owner", "First-owner bootstrap is setup-only while no account exists."),
        new("POST", "/api/v1/auth/sign-in", "Legacy local sign-in must accept credentials before a session exists."),
        new("POST", "/api/v1/auth/local/sign-in", "Local-session sign-in must accept credentials before a session exists."),
        new("POST", "/api/v1/auth/refresh", "Refresh rotates the submitted refresh credential without bearer auth."),
        new("POST", "/api/v1/auth/invitations/accept", "Invitation acceptance must allow unauthenticated redemption attempts without issuing a session."),
        new("POST", "/api/v1/auth/password-reset/request", "Local password reset requests must remain anonymous and enumeration-safe."),
        new("POST", "/api/v1/auth/password-reset/complete", "Local password reset completion must accept submitted reset material before a session exists."),
        new("POST", "/api/v1/auth/passkeys/sign-in/options", "Passkey sign-in ceremony options must start before a session exists."),
        new("POST", "/api/v1/auth/passkeys/sign-in/complete", "Passkey sign-in ceremony completion validates assertions before a session exists."),
        new("POST", "/api/v1/auth/mfa/challenges", "MFA challenges can be created for pending auth flows before a full session exists."),
        new("POST", "/api/v1/auth/mfa/challenges/{mfaChallengeId:guid}/totp/verify", "TOTP challenge verification can complete a pending auth flow before a full session exists."),
        new("POST", "/api/v1/auth/mfa/challenges/{mfaChallengeId:guid}/recovery-code/verify", "Recovery-code challenge verification can complete a pending auth flow before a full session exists.")
    ];

    private static readonly HashSet<string> PublicEndpointKeys = PublicEndpointAllowlist
        .Select(endpoint => GetEndpointKey(endpoint.HttpMethod, endpoint.RoutePattern))
        .ToHashSet(StringComparer.Ordinal);

    private readonly WebApplicationFactory<Program> factory;

    public AuthenticatedApiPolicyBaselineTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public void ApiEndpointMetadataRequiresExplicitAuthorizationOrPublicAllowlist()
    {
        var routeEndpoints = factory.Services
            .GetRequiredService<IEnumerable<EndpointDataSource>>()
            .SelectMany(dataSource => dataSource.Endpoints)
            .OfType<RouteEndpoint>()
            .Where(endpoint => IsPolicyControlledRoute(endpoint.RoutePattern.RawText))
            .SelectMany(ExpandEndpointMethods)
            .OrderBy(endpoint => endpoint.RoutePattern, StringComparer.Ordinal)
            .ThenBy(endpoint => endpoint.HttpMethod, StringComparer.Ordinal)
            .ToArray();

        Assert.NotEmpty(routeEndpoints);

        var actualPublicKeys = new HashSet<string>(StringComparer.Ordinal);
        var failures = new List<string>();

        foreach (var endpoint in routeEndpoints)
        {
            var key = GetEndpointKey(endpoint.HttpMethod, endpoint.RoutePattern);
            var allowsAnonymous = endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null;
            var authorizeData = endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>();
            var hasAuthorization = authorizeData.Count > 0;

            if (PublicEndpointKeys.Contains(key))
            {
                actualPublicKeys.Add(key);
                if (!allowsAnonymous)
                {
                    failures.Add($"{key} is public allowlisted but lacks AllowAnonymous metadata.");
                }

                if (hasAuthorization)
                {
                    failures.Add($"{key} is public allowlisted but also has authorization metadata.");
                }

                continue;
            }

            if (!hasAuthorization)
            {
                failures.Add($"{key} is not public allowlisted and lacks authorization metadata.");
            }

            if (allowsAnonymous)
            {
                failures.Add($"{key} is not public allowlisted but has AllowAnonymous metadata.");
            }
        }

        var missingPublicEndpoints = PublicEndpointKeys
            .Except(actualPublicKeys, StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToArray();
        failures.AddRange(missingPublicEndpoints.Select(key => $"{key} is public allowlisted but not mapped."));

        Assert.True(failures.Count == 0, string.Join(Environment.NewLine, failures));
    }

    [Theory]
    [InlineData("GET", "/api/v1/auth/current-user")]
    [InlineData("GET", "/api/v1/auth/me")]
    [InlineData("GET", "/api/v1/auth/mfa/factors")]
    [InlineData("GET", "/api/v1/auth/recovery-codes")]
    [InlineData("GET", "/api/v1/users/me/profile")]
    [InlineData("GET", "/api/v1/users/me/payment-details")]
    [InlineData("GET", "/api/v1/users/me/payment-details/qr/content")]
    [InlineData("GET", "/api/v1/groups")]
    [InlineData("GET", "/api/v1/groups/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/members")]
    [InlineData("GET", "/api/v1/groups/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bills")]
    [InlineData("GET", "/api/v1/bills")]
    [InlineData("GET", "/api/v1/bills/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/attachments")]
    [InlineData("GET", "/api/v1/receipt-ocr-reviews")]
    [InlineData("GET", "/api/v1/settlements")]
    [InlineData("GET", "/api/v1/settlement-balances")]
    [InlineData("GET", "/api/v1/settlement-payments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")]
    [InlineData("POST", "/api/v1/settlements/baskets/preview")]
    [InlineData("GET", "/api/v1/recurring-bills")]
    [InlineData("GET", "/api/v1/future-bills")]
    [InlineData("GET", "/api/v1/manual-finance/summary")]
    [InlineData("GET", "/api/v1/notifications")]
    [InlineData("GET", "/api/v1/reports/monthly")]
    [InlineData("GET", "/api/v1/sync/changes")]
    [InlineData("GET", "/api/v1/admin/users")]
    public async Task RepresentativeBusinessEndpointsRejectAnonymousRequests(
        string method,
        string path)
    {
        using var testFactory = CreateFactory();
        using var client = testFactory.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), path);

        using var response = await client.SendAsync(request);

        Assert.Contains(
            response.StatusCode,
            new[] { HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden });
    }

    [Fact]
    public async Task IntentionalPublicEndpointsRemainAnonymous()
    {
        using var testFactory = CreateFactory();
        using var client = testFactory.CreateClient();

        using var healthResponse = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, healthResponse.StatusCode);

        using var readinessResponse = await client.GetAsync("/health/ready");
        Assert.NotEqual(HttpStatusCode.Unauthorized, readinessResponse.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, readinessResponse.StatusCode);

        using var bootstrapStatusResponse = await client.GetAsync("/api/v1/auth/bootstrap/status");
        Assert.Equal(HttpStatusCode.OK, bootstrapStatusResponse.StatusCode);

        using var bootstrapResponse = await client.PostAsync(
            "/api/v1/auth/bootstrap/local-owner",
            CreateJsonContent(new { }));
        Assert.Equal(HttpStatusCode.BadRequest, bootstrapResponse.StatusCode);

        using var signInResponse = await client.PostAsync(
            "/api/v1/auth/sign-in",
            CreateJsonContent(new { }));
        await AssertProblemTitleAsync(signInResponse, HttpStatusCode.Unauthorized, "Sign-in failed");

        using var localSignInResponse = await client.PostAsync(
            "/api/v1/auth/local/sign-in",
            CreateJsonContent(new { }));
        await AssertProblemTitleAsync(localSignInResponse, HttpStatusCode.Unauthorized, "Sign-in failed");

        using var refreshResponse = await client.PostAsync(
            "/api/v1/auth/refresh",
            CreateJsonContent(new { }));
        await AssertProblemTitleAsync(refreshResponse, HttpStatusCode.Unauthorized, "Refresh failed");

        using var passkeyOptionsResponse = await client.PostAsync(
            "/api/v1/auth/passkeys/sign-in/options",
            CreateJsonContent(new { }));
        Assert.Equal(HttpStatusCode.OK, passkeyOptionsResponse.StatusCode);

        using var passkeyCompleteResponse = await client.PostAsync(
            "/api/v1/auth/passkeys/sign-in/complete",
            CreateJsonContent(new { }));
        await AssertProblemTitleAsync(passkeyCompleteResponse, HttpStatusCode.BadRequest, "Invalid auth request");
    }

    private WebApplicationFactory<Program> CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        return factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<SettleoraDbContext>();
                services.RemoveAll<DbContextOptions>();
                services.RemoveAll<DbContextOptions<SettleoraDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<SettleoraDbContext>>();
                services.AddDbContext<SettleoraDbContext>(options =>
                {
                    options.UseInMemoryDatabase(databaseName);
                });
            });
        });
    }

    private static IEnumerable<EndpointMetadataSnapshot> ExpandEndpointMethods(RouteEndpoint endpoint)
    {
        var httpMethods = endpoint.Metadata
            .GetMetadata<HttpMethodMetadata>()?
            .HttpMethods
            .Order(StringComparer.Ordinal)
            .ToArray();

        if (httpMethods is null || httpMethods.Length == 0)
        {
            yield break;
        }

        foreach (var httpMethod in httpMethods)
        {
            var routePattern = endpoint.RoutePattern.RawText
                ?? endpoint.RoutePattern.ToString()
                ?? string.Empty;

            yield return new EndpointMetadataSnapshot(
                httpMethod,
                routePattern,
                endpoint.Metadata);
        }
    }

    private static bool IsPolicyControlledRoute(string? routePattern)
    {
        return routePattern is not null
            && (routePattern.StartsWith("/api/v1", StringComparison.Ordinal)
                || routePattern.StartsWith("/health", StringComparison.Ordinal));
    }

    private static StringContent CreateJsonContent(object value)
    {
        return new StringContent(
            JsonSerializer.Serialize(value),
            Encoding.UTF8,
            "application/json");
    }

    private static async Task AssertProblemTitleAsync(
        HttpResponseMessage response,
        HttpStatusCode expectedStatusCode,
        string expectedTitle)
    {
        Assert.Equal(expectedStatusCode, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var content = await response.Content.ReadAsStringAsync();
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(expectedTitle, payload.RootElement.GetProperty("title").GetString());
    }

    private static string GetEndpointKey(string httpMethod, string routePattern)
    {
        return $"{httpMethod} {routePattern}";
    }

    private sealed record EndpointAuthorizationExpectation(
        string HttpMethod,
        string RoutePattern,
        string Reason);

    private sealed record EndpointMetadataSnapshot(
        string HttpMethod,
        string RoutePattern,
        EndpointMetadataCollection Metadata);
}
