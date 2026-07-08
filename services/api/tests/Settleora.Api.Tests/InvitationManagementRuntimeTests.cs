using System.Net.Mail;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.Invitations;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Notifications;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class InvitationManagementRuntimeTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string InvitationsPath = "/api/v1/admin/auth/invitations";
    private const string WrongRawToken = "wrong-visible-invitation-management-session-token";
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 7, 8, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = InitialTimestamp.AddMinutes(10);
    private static readonly DateTimeOffset MutationTimestamp = InitialTimestamp.AddMinutes(20);

    private readonly WebApplicationFactory<Program> factory;

    public InvitationManagementRuntimeTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task OwnerCanCreateListAndGetInvitationWithoutRawSecretExposure()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(MutationTimestamp);
        using var createRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        createRequest.Content = JsonContent(
            """{"contactIdentifierKind":"email","contactIdentifier":"  New.User@Example.COM  ","targetSystemRole":"user"}""");
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        AssertSafeInvitationContent(createContent);
        using var createPayload = JsonDocument.Parse(createContent);
        var createdInvitation = createPayload.RootElement.GetProperty("invitation");
        var invitationId = createdInvitation.GetProperty("id").GetGuid();
        Assert.Equal("pending", createdInvitation.GetProperty("status").GetString());
        Assert.Equal("email", createdInvitation.GetProperty("contactIdentifierKind").GetString());
        Assert.Equal("email:***", createdInvitation.GetProperty("contactDisplay").GetString());
        Assert.Equal("user", createdInvitation.GetProperty("targetSystemRole").GetString());
        Assert.Equal("disabled_by_admin", createdInvitation.GetProperty("deliveryState").GetString());
        Assert.Equal(session.AuthAccountId, createdInvitation.GetProperty("invitedByAuthAccountId").GetGuid());
        Assert.Equal(session.UserProfileId, createdInvitation.GetProperty("invitedByUserProfileId").GetGuid());

        using var listRequest = CreateBearerRequest(HttpMethod.Get, InvitationsPath, session.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        var listContent = await listResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        AssertSafeInvitationContent(listContent);
        using (var listPayload = JsonDocument.Parse(listContent))
        {
            var listedInvitation = Assert.Single(listPayload.RootElement.GetProperty("invitations").EnumerateArray());
            Assert.Equal(invitationId, listedInvitation.GetProperty("id").GetGuid());
            Assert.Equal("unknown", listedInvitation.GetProperty("deliveryState").GetString());
        }

        using var getRequest = CreateBearerRequest(HttpMethod.Get, $"{InvitationsPath}/{invitationId:D}", session.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var getContent = await getResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        AssertSafeInvitationContent(getContent);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var invitation = await dbContext.Set<AuthInvitation>().SingleAsync();
        Assert.Equal("new.user@example.com", invitation.ContactIdentifierNormalized);
        Assert.StartsWith("auth-invitation-sha256:v1:", invitation.InvitationSecretHash, StringComparison.Ordinal);
        Assert.Equal("sha256-v1", invitation.InvitationSecretHashVersion);
        Assert.DoesNotContain("New.User@Example.COM", invitation.InvitationSecretHash, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("raw", invitation.InvitationSecretHash, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task NormalUserAndAnonymousCallersCannotAccessAdminInvitationManagement()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.User], "Normal User");
        using var client = testFactory.CreateClient();

        using var anonymousList = await client.GetAsync(InvitationsPath);
        using var invalidTokenList = await client.SendAsync(CreateBearerRequest(HttpMethod.Get, InvitationsPath, WrongRawToken));
        using var userList = await client.SendAsync(CreateBearerRequest(HttpMethod.Get, InvitationsPath, session.RawSessionToken));
        using var userCreateRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        userCreateRequest.Content = JsonContent(
            """{"contactIdentifierKind":"email","contactIdentifier":"blocked@example.com","targetSystemRole":"user"}""");
        using var userCreate = await client.SendAsync(userCreateRequest);

        Assert.Equal(HttpStatusCode.Unauthorized, anonymousList.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, invalidTokenList.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, userList.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, userCreate.StatusCode);
    }

    [Fact]
    public async Task DefaultOffPolicyBlocksCreateAndResendButDoesNotBlockRevoke()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Admin], "Admin Actor");
        var invitationId = await SeedPendingInvitationAsync(testFactory, session, "pending@example.com");
        using var client = testFactory.CreateClient();

        using var createRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        createRequest.Content = JsonContent(
            """{"contactIdentifierKind":"email","contactIdentifier":"blocked@example.com","targetSystemRole":"user"}""");
        using var createResponse = await client.SendAsync(createRequest);
        using var resendRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/resend", session.RawSessionToken);
        resendRequest.Content = JsonContent("""{}""");
        using var resendResponse = await client.SendAsync(resendRequest);
        using var revokeRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/revoke", session.RawSessionToken);
        revokeRequest.Content = JsonContent("""{"reason":"admin_requested"}""");
        using var revokeResponse = await client.SendAsync(revokeRequest);

        Assert.Equal(HttpStatusCode.Forbidden, createResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, resendResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, revokeResponse.StatusCode);
    }

    [Theory]
    [InlineData("sms", "invitee@example.com", "user")]
    [InlineData("email", "invitee@example.com", "admin")]
    [InlineData("email", "not-an-email", "user")]
    public async Task CreateRejectsUnsupportedContactKindTargetRoleAndInvalidEmail(
        string contactIdentifierKind,
        string contactIdentifier,
        string targetRole)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var createRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        createRequest.Content = JsonContent(
            $$"""{"contactIdentifierKind":"{{contactIdentifierKind}}","contactIdentifier":"{{contactIdentifier}}","targetSystemRole":"{{targetRole}}"}""");
        using var createResponse = await client.SendAsync(createRequest);
        var content = await createResponse.Content.ReadAsStringAsync();

        Assert.True(
            createResponse.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Conflict,
            $"Unexpected status: {createResponse.StatusCode}");
        AssertSafeInvitationContent(content);
    }

    [Fact]
    public async Task DuplicatePendingInvitationReturnsConflict()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        using var client = testFactory.CreateClient();

        for (var index = 0; index < 2; index++)
        {
            using var createRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
            createRequest.Content = JsonContent(
                """{"contactIdentifierKind":"email","contactIdentifier":"duplicate@example.com","targetSystemRole":"user"}""");
            using var response = await client.SendAsync(createRequest);
            Assert.Equal(index == 0 ? HttpStatusCode.Created : HttpStatusCode.Conflict, response.StatusCode);
        }
    }

    [Fact]
    public async Task RevokePendingInvitationWritesBoundedAuditAndRejectsRepeatedTerminalRevoke()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        var invitationId = await SeedPendingInvitationAsync(testFactory, session, "revoke@example.com");
        using var client = testFactory.CreateClient();

        using var revokeRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/revoke", session.RawSessionToken);
        revokeRequest.Content = JsonContent("""{"reason":"admin_requested"}""");
        using var revokeResponse = await client.SendAsync(revokeRequest);
        var revokeContent = await revokeResponse.Content.ReadAsStringAsync();
        using var repeatRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/revoke", session.RawSessionToken);
        repeatRequest.Content = JsonContent("""{}""");
        using var repeatResponse = await client.SendAsync(repeatRequest);

        Assert.Equal(HttpStatusCode.OK, revokeResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, repeatResponse.StatusCode);
        AssertSafeInvitationContent(revokeContent);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var invitation = await dbContext.Set<AuthInvitation>().SingleAsync(invitation => invitation.Id == invitationId);
        var audit = await dbContext.Set<AuthAuditEvent>().SingleAsync(audit => audit.Action == "invitation.revoked");
        Assert.Equal(AuthInvitationStatuses.Revoked, invitation.Status);
        Assert.Equal(session.AuthAccountId, invitation.RevokedByAuthAccountId);
        Assert.Equal(session.AuthAccountId, audit.ActorAuthAccountId);
        Assert.Null(audit.SubjectAuthAccountId);
        AssertSafeInvitationContent(audit.SafeMetadataJson ?? string.Empty);
        Assert.Contains(invitationId.ToString("D"), audit.SafeMetadataJson, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CreateWithDeliveryNotRequestedDoesNotComposeOrSend()
    {
        var testContext = CreateFactory(configureServices: services =>
        {
            services.RemoveAll<IInvitationEmailTemplateComposer>();
            services.RemoveAll<IInvitationEmailSender>();
            services.AddSingleton<IInvitationEmailTemplateComposer, ThrowingInvitationEmailTemplateComposer>();
            services.AddSingleton<IInvitationEmailSender, ThrowingInvitationEmailSender>();
        });
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var createRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        createRequest.Content = JsonContent(
            """{"contactIdentifierKind":"email","contactIdentifier":"no.delivery@example.com","targetSystemRole":"user","deliveryRequested":false}""");
        using var response = await client.SendAsync(createRequest);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        AssertSafeInvitationContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(
            "not_requested",
            payload.RootElement.GetProperty("invitation").GetProperty("deliveryState").GetString());
    }

    [Fact]
    public async Task CreateWithUnavailableDeliveryReturnsSafeNonSentStateWithoutTransportCall()
    {
        var transport = new CapturingSmtpEmailTransport();
        var testContext = CreateFactory(configureServices: services =>
        {
            services.RemoveAll<ISmtpEmailTransport>();
            services.AddSingleton<ISmtpEmailTransport>(transport);
        });
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var createRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        createRequest.Content = JsonContent(
            """{"contactIdentifierKind":"email","contactIdentifier":"unavailable.delivery@example.com","targetSystemRole":"user","deliveryRequested":true}""");
        using var response = await client.SendAsync(createRequest);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.False(transport.WasCalled);
        AssertSafeInvitationContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(
            "disabled_by_admin",
            payload.RootElement.GetProperty("invitation").GetProperty("deliveryState").GetString());
    }

    [Fact]
    public async Task CreateWithConfiguredProductionSmtpAttemptsOneSafeEmailHandoff()
    {
        var transport = new CapturingSmtpEmailTransport();
        var testContext = CreateFactory(
            configuration: CreateProductionEmailConfiguration(),
            configureServices: services =>
            {
                services.RemoveAll<ISmtpEmailTransport>();
                services.AddSingleton<ISmtpEmailTransport>(transport);
            });
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var createRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        createRequest.Content = JsonContent(
            """{"contactIdentifierKind":"email","contactIdentifier":"smtp.delivery@example.invalid","targetSystemRole":"user","deliveryRequested":true}""");
        using var response = await client.SendAsync(createRequest);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(1, transport.SendAttemptCount);
        Assert.Equal("smtp.delivery@example.invalid", transport.To);
        Assert.Equal(InvitationEmailTemplateComposer.TemplateSubject, transport.Subject);
        Assert.Contains("invitationSecret=", transport.Body, StringComparison.Ordinal);
        AssertSafeInvitationContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(
            "sent",
            payload.RootElement.GetProperty("invitation").GetProperty("deliveryState").GetString());
    }

    [Theory]
    [InlineData(InvitationEmailDeliveryModes.LocalSink, "http://localhost:5173")]
    [InlineData(InvitationEmailDeliveryModes.TestSink, "http://127.0.0.1:5173")]
    public async Task CreateWithSinkModeDoesNotCallSmtpOrClaimProviderSent(
        string deliveryMode,
        string publicBaseUrl)
    {
        var transport = new CapturingSmtpEmailTransport();
        var testContext = CreateFactory(
            configuration: CreateSinkEmailConfiguration(deliveryMode, publicBaseUrl),
            configureServices: services =>
            {
                services.RemoveAll<ISmtpEmailTransport>();
                services.AddSingleton<ISmtpEmailTransport>(transport);
            });
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var createRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        createRequest.Content = JsonContent(
            """{"contactIdentifierKind":"email","contactIdentifier":"sink.delivery@example.invalid","targetSystemRole":"user","deliveryRequested":true}""");
        using var response = await client.SendAsync(createRequest);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.False(transport.WasCalled);
        AssertSafeInvitationContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(
            "queued",
            payload.RootElement.GetProperty("invitation").GetProperty("deliveryState").GetString());
        Assert.NotEqual(
            "sent",
            payload.RootElement.GetProperty("invitation").GetProperty("deliveryState").GetString());
    }

    [Fact]
    public async Task ProviderExceptionMapsToSafeFailedStateWithoutRawDiagnostics()
    {
        var transport = new CapturingSmtpEmailTransport
        {
            ExceptionToThrow = new SmtpException(
                SmtpStatusCode.GeneralFailure,
                "raw provider diagnostic with smtp-password-placeholder")
        };
        var testContext = CreateFactory(
            configuration: CreateProductionEmailConfiguration(),
            configureServices: services =>
            {
                services.RemoveAll<ISmtpEmailTransport>();
                services.AddSingleton<ISmtpEmailTransport>(transport);
            });
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var createRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        createRequest.Content = JsonContent(
            """{"contactIdentifierKind":"email","contactIdentifier":"provider.failure@example.invalid","targetSystemRole":"user","deliveryRequested":true}""");
        using var response = await client.SendAsync(createRequest);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(1, transport.SendAttemptCount);
        AssertSafeInvitationContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(
            "failed",
            payload.RootElement.GetProperty("invitation").GetProperty("deliveryState").GetString());

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var deliveryAudit = await dbContext.Set<AuthAuditEvent>()
            .SingleAsync(audit => audit.Action == "invitation.delivery_result");
        AssertSafeInvitationContent(deliveryAudit.SafeMetadataJson ?? string.Empty);
        Assert.DoesNotContain("raw provider diagnostic", deliveryAudit.SafeMetadataJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("smtp-password-placeholder", deliveryAudit.SafeMetadataJson, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ResendWithDeliveryNotRequestedDoesNotRotate()
    {
        var testContext = CreateFactory(configureServices: services =>
        {
            services.RemoveAll<IInvitationEmailTemplateComposer>();
            services.RemoveAll<IInvitationEmailSender>();
            services.AddSingleton<IInvitationEmailTemplateComposer, ThrowingInvitationEmailTemplateComposer>();
            services.AddSingleton<IInvitationEmailSender, ThrowingInvitationEmailSender>();
        });
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Admin], "Admin Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        var invitationId = await SeedPendingInvitationAsync(testFactory, session, "resend.not.requested@example.com");
        var beforeHash = await ReadInvitationHashAsync(testFactory, invitationId);
        using var client = testFactory.CreateClient();

        using var resendRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/resend", session.RawSessionToken);
        resendRequest.Content = JsonContent("""{"deliveryRequested":false}""");
        using var response = await client.SendAsync(resendRequest);
        var content = await response.Content.ReadAsStringAsync();
        var afterHash = await ReadInvitationHashAsync(testFactory, invitationId);

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Equal(beforeHash, afterHash);
        AssertSafeInvitationContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(
            "not_requested",
            payload.RootElement.GetProperty("invitation").GetProperty("deliveryState").GetString());
    }

    [Fact]
    public async Task ResendWithUnavailableDeliveryDoesNotRotateOrClaimDelivery()
    {
        var transport = new CapturingSmtpEmailTransport();
        var testContext = CreateFactory(configureServices: services =>
        {
            services.RemoveAll<ISmtpEmailTransport>();
            services.AddSingleton<ISmtpEmailTransport>(transport);
        });
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Admin], "Admin Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        var invitationId = await SeedPendingInvitationAsync(testFactory, session, "resend.unavailable@example.com");
        var beforeHash = await ReadInvitationHashAsync(testFactory, invitationId);
        using var client = testFactory.CreateClient();

        using var resendRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/resend", session.RawSessionToken);
        resendRequest.Content = JsonContent("""{"deliveryRequested":true}""");
        using var response = await client.SendAsync(resendRequest);
        var content = await response.Content.ReadAsStringAsync();
        var afterHash = await ReadInvitationHashAsync(testFactory, invitationId);

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.False(transport.WasCalled);
        Assert.Equal(beforeHash, afterHash);
        AssertSafeInvitationContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(
            "disabled_by_admin",
            payload.RootElement.GetProperty("invitation").GetProperty("deliveryState").GetString());
    }

    [Fact]
    public async Task ResendWithReadyDeliveryRotatesHashAndOnlyDeliveredSecretCanRedeem()
    {
        var transport = new CapturingSmtpEmailTransport();
        var testContext = CreateFactory(
            configuration: CreateProductionEmailConfiguration(),
            configureServices: services =>
            {
                services.RemoveAll<ISmtpEmailTransport>();
                services.AddSingleton<ISmtpEmailTransport>(transport);
            });
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Admin], "Admin Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        const string oldRawInvitationSecret = "old-resend-raw-invitation-material";
        var invitationId = await SeedPendingInvitationAsync(
            testFactory,
            session,
            "resend.ready@example.invalid",
            oldRawInvitationSecret);
        var beforeHash = await ReadInvitationHashAsync(testFactory, invitationId);
        using var client = testFactory.CreateClient();

        using var resendRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/resend", session.RawSessionToken);
        resendRequest.Content = JsonContent("""{"deliveryRequested":true}""");
        using var resendResponse = await client.SendAsync(resendRequest);
        var resendContent = await resendResponse.Content.ReadAsStringAsync();
        var afterHash = await ReadInvitationHashAsync(testFactory, invitationId);
        var deliveredRawInvitationSecret = ExtractInvitationSecretFromBody(transport.Body);

        Assert.Equal(HttpStatusCode.Accepted, resendResponse.StatusCode);
        Assert.NotEqual(beforeHash, afterHash);
        Assert.Equal(1, transport.SendAttemptCount);
        AssertSafeInvitationContent(resendContent);
        AssertDoesNotContainSensitiveFragment(resendContent, "delivered raw invitation material", deliveredRawInvitationSecret);
        using (var payload = JsonDocument.Parse(resendContent))
        {
            Assert.Equal(
                "sent",
                payload.RootElement.GetProperty("invitation").GetProperty("deliveryState").GetString());
        }

        using var oldAccept = await client.PostAsync(
            "/api/v1/auth/invitations/accept",
            JsonContent(CreateAcceptJson(oldRawInvitationSecret, "Old Secret User", "correct horse battery staple")));
        using var newAccept = await client.PostAsync(
            "/api/v1/auth/invitations/accept",
            JsonContent(CreateAcceptJson(deliveredRawInvitationSecret, "New Secret User", "correct horse battery staple")));
        var oldAcceptContent = await oldAccept.Content.ReadAsStringAsync();
        var newAcceptContent = await newAccept.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, oldAccept.StatusCode);
        Assert.Equal(HttpStatusCode.OK, newAccept.StatusCode);
        AssertSafeInvitationContent(oldAcceptContent);
        AssertSafeInvitationContent(newAcceptContent);
        AssertDoesNotContainSensitiveFragment(newAcceptContent, "delivered raw invitation material", deliveredRawInvitationSecret);
    }

    [Fact]
    public async Task ResendDoesNotFakeDeliverySuccessOrLeakSecretMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Admin], "Admin Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        var invitationId = await SeedPendingInvitationAsync(testFactory, session, "resend@example.com");
        using var client = testFactory.CreateClient();

        using var resendRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/resend", session.RawSessionToken);
        resendRequest.Content = JsonContent("""{"deliveryRequested":true}""");
        using var resendResponse = await client.SendAsync(resendRequest);
        var resendContent = await resendResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Accepted, resendResponse.StatusCode);
        AssertSafeInvitationContent(resendContent);
        using var payload = JsonDocument.Parse(resendContent);
        Assert.Equal(
            "disabled_by_admin",
            payload.RootElement.GetProperty("invitation").GetProperty("deliveryState").GetString());
        Assert.NotEqual(
            "sent",
            payload.RootElement.GetProperty("invitation").GetProperty("deliveryState").GetString());

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var audit = await dbContext.Set<AuthAuditEvent>().SingleAsync(audit => audit.Action == "invitation.resend_requested");
        AssertSafeInvitationContent(audit.SafeMetadataJson ?? string.Empty);
        Assert.Contains("disabled_by_admin", audit.SafeMetadataJson, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CreateThrottlingPreventsAdditionalRowsDeliveryAndRawMaterialExposure()
    {
        var transport = new CapturingSmtpEmailTransport();
        var testContext = CreateFactory(
            configuration: CreateProductionEmailConfiguration(),
            configureServices: services =>
            {
                services.AddSingleton(CreateStrictInvitationAbuseOptions());
                services.RemoveAll<ISmtpEmailTransport>();
                services.AddSingleton<ISmtpEmailTransport>(transport);
            });
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var allowedRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        allowedRequest.Content = JsonContent(
            """{"contactIdentifierKind":"email","contactIdentifier":"throttle.create@example.invalid","targetSystemRole":"user","deliveryRequested":false}""");
        using var allowedResponse = await client.SendAsync(allowedRequest);

        using var throttledRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        throttledRequest.Content = JsonContent(
            """{"contactIdentifierKind":"email","contactIdentifier":"throttle.create@example.invalid","targetSystemRole":"user","deliveryRequested":true}""");
        using var throttledResponse = await client.SendAsync(throttledRequest);
        var throttledContent = await throttledResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, allowedResponse.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, throttledResponse.StatusCode);
        Assert.False(transport.WasCalled);
        AssertSafeInvitationContent(throttledContent);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        Assert.Equal(1, await dbContext.Set<AuthInvitation>().CountAsync());
    }

    [Fact]
    public async Task ResendThrottlingPreventsHashRotationAndDeliveryHandoff()
    {
        var transport = new CapturingSmtpEmailTransport();
        var testContext = CreateFactory(
            configuration: CreateProductionEmailConfiguration(),
            configureServices: services =>
            {
                services.AddSingleton(CreateStrictInvitationAbuseOptions());
                services.RemoveAll<ISmtpEmailTransport>();
                services.AddSingleton<ISmtpEmailTransport>(transport);
            });
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Admin], "Admin Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        var invitationId = await SeedPendingInvitationAsync(testFactory, session, "throttle.resend@example.invalid");
        var beforeHash = await ReadInvitationHashAsync(testFactory, invitationId);
        using var client = testFactory.CreateClient();

        using var allowedRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/resend", session.RawSessionToken);
        allowedRequest.Content = JsonContent("""{"deliveryRequested":false}""");
        using var allowedResponse = await client.SendAsync(allowedRequest);

        using var throttledRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/resend", session.RawSessionToken);
        throttledRequest.Content = JsonContent("""{"deliveryRequested":true}""");
        using var throttledResponse = await client.SendAsync(throttledRequest);
        var throttledContent = await throttledResponse.Content.ReadAsStringAsync();
        var afterHash = await ReadInvitationHashAsync(testFactory, invitationId);

        Assert.Equal(HttpStatusCode.Accepted, allowedResponse.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, throttledResponse.StatusCode);
        Assert.Equal(beforeHash, afterHash);
        Assert.False(transport.WasCalled);
        AssertSafeInvitationContent(throttledContent);
    }

    private FactoryTestContext CreateFactory(
        IReadOnlyDictionary<string, string?>? configuration = null,
        Action<IServiceCollection>? configureServices = null)
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new InvitationManagementTestTimeProvider(InitialTimestamp);
        var testFactory = factory.WithWebHostBuilder(builder =>
        {
            if (configuration is not null)
            {
                builder.ConfigureAppConfiguration((_, configurationBuilder) =>
                {
                    configurationBuilder.AddInMemoryCollection(configuration);
                });
            }

            builder.ConfigureServices(services =>
            {
                services.RemoveAll<SettleoraDbContext>();
                services.RemoveAll<DbContextOptions>();
                services.RemoveAll<DbContextOptions<SettleoraDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<SettleoraDbContext>>();
                services.AddDbContext<SettleoraDbContext>(options => options.UseInMemoryDatabase(databaseName));

                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(timeProvider);
                configureServices?.Invoke(services);
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task EnableInvitationPolicyAsync(
        WebApplicationFactory<Program> testFactory,
        Guid actorAuthAccountId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        dbContext.Set<AuthInvitationPolicy>().Add(new AuthInvitationPolicy
        {
            Id = Guid.NewGuid(),
            PolicyVersion = 1,
            Status = AuthInvitationPolicyStatuses.Active,
            CapabilityState = AuthInvitationCapabilityStates.Enabled,
            PendingInviteGraceWhenDisabled = false,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            ChangedByAuthAccountId = actorAuthAccountId
        });
        await dbContext.SaveChangesAsync();
    }

    private static async Task<Guid> SeedPendingInvitationAsync(
        WebApplicationFactory<Program> testFactory,
        SeededSession actor,
        string normalizedEmail,
        string? rawInvitationSecret = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var invitationId = Guid.NewGuid();
        var invitationHash = rawInvitationSecret is null
            ? $"test-auth-invitation-sha256:v1:{Guid.NewGuid():N}"
            : InvitationSecretHasher.DeriveInvitationSecretHash(rawInvitationSecret);
        dbContext.Set<AuthInvitation>().Add(new AuthInvitation
        {
            Id = invitationId,
            Status = AuthInvitationStatuses.Pending,
            ContactIdentifierKind = AuthInvitationContactIdentifierKinds.Email,
            ContactIdentifierNormalized = normalizedEmail,
            InvitationSecretHash = invitationHash,
            InvitationSecretHashVersion = InvitationSecretHasher.HashVersion,
            TargetSystemRole = SystemRoles.User,
            InvitedByAuthAccountId = actor.AuthAccountId,
            InvitedByUserProfileId = actor.UserProfileId,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            ExpiresAtUtc = InitialTimestamp.AddDays(7)
        });
        await dbContext.SaveChangesAsync();
        return invitationId;
    }

    private static async Task<string> ReadInvitationHashAsync(
        WebApplicationFactory<Program> testFactory,
        Guid invitationId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        return await dbContext.Set<AuthInvitation>()
            .Where(invitation => invitation.Id == invitationId)
            .Select(invitation => invitation.InvitationSecretHash)
            .SingleAsync();
    }

    private static IReadOnlyDictionary<string, string?> CreateProductionEmailConfiguration()
    {
        return new Dictionary<string, string?>(StringComparer.Ordinal)
        {
            [$"{InvitationEmailDeliveryOptions.SectionName}:Enabled"] = "true",
            [$"{InvitationEmailDeliveryOptions.SectionName}:DeliveryMode"] = InvitationEmailDeliveryModes.ProductionSmtp,
            [$"{InvitationEmailDeliveryOptions.SectionName}:PublicBaseUrl"] = "https://settleora.example.invalid",
            [$"{InvitationEmailDeliveryOptions.SectionName}:InviteLinkPath"] = "/auth/invitations/accept",
            [$"{SmtpEmailNotificationOptions.SectionName}:Enabled"] = "true",
            [$"{SmtpEmailNotificationOptions.SectionName}:Host"] = "smtp-host-placeholder",
            [$"{SmtpEmailNotificationOptions.SectionName}:Port"] = "2525",
            [$"{SmtpEmailNotificationOptions.SectionName}:UseTls"] = "true",
            [$"{SmtpEmailNotificationOptions.SectionName}:Username"] = "smtp-username-placeholder",
            [$"{SmtpEmailNotificationOptions.SectionName}:Password"] = "smtp-password-placeholder",
            [$"{SmtpEmailNotificationOptions.SectionName}:FromAddress"] = "from-address-placeholder@example.invalid",
            [$"{SmtpEmailNotificationOptions.SectionName}:FromName"] = "Settleora",
            [$"{SmtpEmailNotificationOptions.SectionName}:TimeoutSeconds"] = "10"
        };
    }

    private static IReadOnlyDictionary<string, string?> CreateSinkEmailConfiguration(
        string deliveryMode,
        string publicBaseUrl)
    {
        return new Dictionary<string, string?>(StringComparer.Ordinal)
        {
            [$"{InvitationEmailDeliveryOptions.SectionName}:Enabled"] = "true",
            [$"{InvitationEmailDeliveryOptions.SectionName}:DeliveryMode"] = deliveryMode,
            [$"{InvitationEmailDeliveryOptions.SectionName}:PublicBaseUrl"] = publicBaseUrl,
            [$"{InvitationEmailDeliveryOptions.SectionName}:InviteLinkPath"] = "/auth/invitations/accept"
        };
    }

    private static InvitationAbusePolicyOptions CreateStrictInvitationAbuseOptions()
    {
        return new InvitationAbusePolicyOptions
        {
            Window = TimeSpan.FromMinutes(15),
            ThrottleDuration = TimeSpan.FromMinutes(5),
            EntryRetention = TimeSpan.FromHours(1),
            SourceLimit = 10,
            ActorLimit = 10,
            SubjectLimit = 1,
            ActorSubjectLimit = 1,
            GlobalLimit = 100
        };
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        InvitationManagementTestTimeProvider timeProvider,
        IReadOnlyList<string> roles,
        string displayName)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
        var account = await SeedAccountAsync(testFactory, displayName, roles);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Invitation management test",
                UserAgentSummary: "Invitation management test agent",
                NetworkAddressHash: "invitation-management-test-network",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededSession(
            account.AuthAccountId,
            account.UserProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            sessionCreationResult.SessionExpiresAtUtc.Value);
    }

    private static async Task<SeededAccount> SeedAccountAsync(
        WebApplicationFactory<Program> testFactory,
        string displayName,
        IReadOnlyList<string> roles)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
            DefaultCurrency = "USD",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });

        foreach (var role in roles)
        {
            dbContext.Set<SystemRoleAssignment>().Add(new SystemRoleAssignment
            {
                AuthAccountId = authAccountId,
                Role = role,
                AssignedAtUtc = InitialTimestamp
            });
        }

        await dbContext.SaveChangesAsync();
        return new SeededAccount(authAccountId, userProfileId);
    }

    private static HttpRequestMessage CreateBearerRequest(HttpMethod method, string path, string rawSessionToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", rawSessionToken);
        return request;
    }

    private static StringContent JsonContent(string json)
    {
        return new StringContent(json, Encoding.UTF8, "application/json");
    }

    private static string CreateAcceptJson(string rawSecret, string displayName, string password)
    {
        return $$"""
            {"invitationSecret":"{{rawSecret}}","displayName":"{{displayName}}","localPassword":"{{password}}"}
            """;
    }

    private static string ExtractInvitationSecretFromBody(string? body)
    {
        Assert.False(string.IsNullOrWhiteSpace(body));
        const string marker = "invitationSecret=";
        var markerIndex = body!.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(markerIndex >= 0, "Expected captured invitation email body to contain invitation material marker.");
        var encoded = body[(markerIndex + marker.Length)..]
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)[0]
            .Trim();
        return Uri.UnescapeDataString(encoded);
    }

    private static void AssertSafeInvitationContent(string content)
    {
        var forbiddenFragments = new[]
        {
            "raw",
            "secret",
            "link",
            "token",
            "password",
            "credential",
            "requestBody",
            "providerPayload",
            "providerDiagnostics",
            "smtp",
            "sessionToken",
            "refresh",
            "New.User@Example.COM",
            "new.user@example.com",
            "duplicate@example.com",
            "revoke@example.com",
            "resend@example.com",
            "no.delivery@example.com",
            "unavailable.delivery@example.com",
            "smtp.delivery@example.invalid",
            "sink.delivery@example.invalid",
            "provider.failure@example.invalid",
            "resend.not.requested@example.com",
            "resend.unavailable@example.com",
            "resend.ready@example.invalid",
            "throttle.create@example.invalid",
            "throttle.resend@example.invalid",
            "old-resend-raw-invitation-material"
        };

        foreach (var fragment in forbiddenFragments)
        {
            AssertDoesNotContainSensitiveFragment(content, "sensitive invitation content", fragment);
        }
    }

    private static void AssertDoesNotContainSensitiveFragment(string content, string safeLabel, string fragment)
    {
        // Avoid xUnit string containment assertions here because failure output can echo checked bearer material.
        if (content.Contains(fragment, StringComparison.OrdinalIgnoreCase))
        {
            throw new Xunit.Sdk.XunitException($"Redaction check failed for {safeLabel}.");
        }
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        InvitationManagementTestTimeProvider TimeProvider);

    private sealed record SeededAccount(Guid AuthAccountId, Guid UserProfileId);

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset ExpiresAtUtc);

    private sealed class InvitationManagementTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public InvitationManagementTestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }

        public void SetUtcNow(DateTimeOffset value)
        {
            utcNow = value;
        }
    }

    private sealed class CapturingSmtpEmailTransport : ISmtpEmailTransport
    {
        public bool WasCalled { get; private set; }

        public int SendAttemptCount { get; private set; }

        public string? To { get; private set; }

        public string? Subject { get; private set; }

        public string? Body { get; private set; }

        public Exception? ExceptionToThrow { get; set; }

        public Task SendAsync(
            SmtpEmailNotificationOptions options,
            MailMessage message,
            CancellationToken cancellationToken)
        {
            WasCalled = true;
            SendAttemptCount++;
            To = message.To.Single().Address;
            Subject = message.Subject;
            Body = message.Body;

            if (ExceptionToThrow is not null)
            {
                throw ExceptionToThrow;
            }

            return Task.CompletedTask;
        }
    }

    private sealed class ThrowingInvitationEmailTemplateComposer : IInvitationEmailTemplateComposer
    {
        public InvitationEmailTemplateCompositionResult Compose(InvitationEmailTemplateCompositionRequest request)
        {
            throw new InvalidOperationException("Template composition should not be called for this test path.");
        }
    }

    private sealed class ThrowingInvitationEmailSender : IInvitationEmailSender
    {
        public Task<InvitationEmailSendResult> SendAsync(
            InvitationEmailSendRequest request,
            CancellationToken cancellationToken = default)
        {
            throw new InvalidOperationException("Invitation email sender should not be called for this test path.");
        }
    }
}
