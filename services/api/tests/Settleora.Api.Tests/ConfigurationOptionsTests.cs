using Microsoft.Extensions.Configuration;
using Settleora.Api.Auth.Invitations;
using Settleora.Api.Auth.PasswordReset;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Configuration;

namespace Settleora.Api.Tests;

public sealed class ConfigurationOptionsTests
{
    [Fact]
    public void RuntimeOptionsBindFromConfiguration()
    {
        Dictionary<string, string?> values = new()
        {
            ["Settleora:Database:ConnectionString"] = "Host=postgres;Database=settleora",
            ["Settleora:RabbitMq:HostName"] = "rabbitmq",
            ["Settleora:RabbitMq:Port"] = "5673",
            ["Settleora:RabbitMq:UserName"] = "worker",
            ["Settleora:RabbitMq:Password"] = "example-password",
            ["Settleora:RabbitMq:VirtualHost"] = "/settleora",
            ["Settleora:Storage:Provider"] = "Local",
            ["Settleora:Storage:RootPath"] = "/var/lib/settleora/storage",
            ["Settleora:Auth:PasswordHashing:Algorithm"] = "argon2id",
            ["Settleora:Auth:PasswordHashing:PolicyVersion"] = "argon2id-v1",
            ["Settleora:Auth:PasswordHashing:Argon2idIterations"] = "3",
            ["Settleora:Auth:PasswordHashing:Argon2idMemorySizeBytes"] = "67108864",
            ["Settleora:Auth:PasswordHashing:VerifierMaxLength"] = "512",
            ["Settleora:Auth:PasswordHashing:ParametersMaxLength"] = "1024",
            ["Settleora:Auth:Sessions:CurrentAccessSessionDefaultLifetime"] = "08:00:00",
            ["Settleora:Auth:Sessions:CurrentAccessSessionMaxLifetime"] = "30.00:00:00",
            ["Settleora:Auth:Sessions:RefreshAccessSessionDefaultLifetime"] = "00:15:00",
            ["Settleora:Auth:Sessions:RefreshAccessSessionMaxLifetime"] = "00:30:00",
            ["Settleora:Auth:Sessions:RefreshIdleTimeout"] = "7.00:00:00",
            ["Settleora:Auth:Sessions:RefreshAbsoluteLifetime"] = "30.00:00:00",
            ["Settleora:Auth:Sessions:ClockSkewAllowance"] = "00:02:00",
            ["Settleora:Auth:PasswordReset:EmailDelivery:Enabled"] = "true",
            ["Settleora:Auth:PasswordReset:EmailDelivery:DeliveryMode"] = PasswordResetEmailDeliveryModes.ProductionSmtp,
            ["Settleora:Auth:PasswordReset:EmailDelivery:PublicBaseUrl"] = "https://settleora.example.invalid",
            ["Settleora:Auth:PasswordReset:EmailDelivery:ResetLinkPath"] = "/auth/password-reset",
            ["Settleora:Auth:PasswordReset:EmailDelivery:ResetLinkLifetime"] = "01:00:00",
            ["Settleora:Auth:Invitations:EmailDelivery:Enabled"] = "true",
            ["Settleora:Auth:Invitations:EmailDelivery:DeliveryMode"] = InvitationEmailDeliveryModes.ProductionSmtp,
            ["Settleora:Auth:Invitations:EmailDelivery:PublicBaseUrl"] = "https://settleora.example.invalid",
            ["Settleora:Auth:Invitations:EmailDelivery:InviteLinkPath"] = "/auth/invitations/accept"
        };

        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        var database = configuration.GetSection(DatabaseOptions.SectionName).Get<DatabaseOptions>();
        var rabbitMq = configuration.GetSection(RabbitMqOptions.SectionName).Get<RabbitMqOptions>();
        var storage = configuration.GetSection(StorageOptions.SectionName).Get<StorageOptions>();
        var passwordHashing = configuration.GetSection(PasswordHashingOptions.SectionName).Get<PasswordHashingOptions>();
        var authSessions = configuration.GetSection(AuthSessionPolicyOptions.SectionName).Get<AuthSessionPolicyOptions>();
        var passwordResetEmailDelivery = configuration
            .GetSection(PasswordResetEmailDeliveryOptions.SectionName)
            .Get<PasswordResetEmailDeliveryOptions>();
        var invitationEmailDelivery = configuration
            .GetSection(InvitationEmailDeliveryOptions.SectionName)
            .Get<InvitationEmailDeliveryOptions>();

        Assert.NotNull(database);
        Assert.NotNull(rabbitMq);
        Assert.NotNull(storage);
        Assert.NotNull(passwordHashing);
        Assert.NotNull(authSessions);
        Assert.NotNull(passwordResetEmailDelivery);
        Assert.NotNull(invitationEmailDelivery);
        Assert.Equal("Host=postgres;Database=settleora", database.ConnectionString);
        Assert.Equal("rabbitmq", rabbitMq.HostName);
        Assert.Equal(5673, rabbitMq.Port);
        Assert.Equal("worker", rabbitMq.UserName);
        Assert.Equal("example-password", rabbitMq.Password);
        Assert.Equal("/settleora", rabbitMq.VirtualHost);
        Assert.Equal("Local", storage.Provider);
        Assert.Equal("/var/lib/settleora/storage", storage.RootPath);
        Assert.Equal("argon2id", passwordHashing.Algorithm);
        Assert.Equal("argon2id-v1", passwordHashing.PolicyVersion);
        Assert.Equal(3, passwordHashing.Argon2idIterations);
        Assert.Equal(67_108_864, passwordHashing.Argon2idMemorySizeBytes);
        Assert.Equal(512, passwordHashing.VerifierMaxLength);
        Assert.Equal(1024, passwordHashing.ParametersMaxLength);
        Assert.Equal(TimeSpan.FromHours(8), authSessions.CurrentAccessSessionDefaultLifetime);
        Assert.Equal(TimeSpan.FromDays(30), authSessions.CurrentAccessSessionMaxLifetime);
        Assert.Equal(TimeSpan.FromMinutes(15), authSessions.RefreshAccessSessionDefaultLifetime);
        Assert.Equal(TimeSpan.FromMinutes(30), authSessions.RefreshAccessSessionMaxLifetime);
        Assert.Equal(TimeSpan.FromDays(7), authSessions.RefreshIdleTimeout);
        Assert.Equal(TimeSpan.FromDays(30), authSessions.RefreshAbsoluteLifetime);
        Assert.Equal(TimeSpan.FromMinutes(2), authSessions.ClockSkewAllowance);
        Assert.True(passwordResetEmailDelivery.Enabled);
        Assert.Equal(PasswordResetEmailDeliveryModes.ProductionSmtp, passwordResetEmailDelivery.DeliveryMode);
        Assert.Equal("https://settleora.example.invalid", passwordResetEmailDelivery.PublicBaseUrl);
        Assert.Equal("/auth/password-reset", passwordResetEmailDelivery.ResetLinkPath);
        Assert.Equal(TimeSpan.FromMinutes(60), passwordResetEmailDelivery.ResetLinkLifetime);
        Assert.True(invitationEmailDelivery.Enabled);
        Assert.Equal(InvitationEmailDeliveryModes.ProductionSmtp, invitationEmailDelivery.DeliveryMode);
        Assert.Equal("https://settleora.example.invalid", invitationEmailDelivery.PublicBaseUrl);
        Assert.Equal("/auth/invitations/accept", invitationEmailDelivery.InviteLinkPath);
    }
}
