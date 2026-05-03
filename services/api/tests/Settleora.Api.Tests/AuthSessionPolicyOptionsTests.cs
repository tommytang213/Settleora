using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Sessions;

namespace Settleora.Api.Tests;

public sealed class AuthSessionPolicyOptionsTests
{
    [Fact]
    public void DefaultsPreserveCurrentAccessSessionsAndDefineFutureRefreshPolicy()
    {
        var options = new AuthSessionPolicyOptions();

        Assert.Equal(TimeSpan.FromHours(8), options.CurrentAccessSessionDefaultLifetime);
        Assert.Equal(TimeSpan.FromDays(30), options.CurrentAccessSessionMaxLifetime);
        Assert.Equal(TimeSpan.FromMinutes(15), options.RefreshAccessSessionDefaultLifetime);
        Assert.Equal(TimeSpan.FromMinutes(30), options.RefreshAccessSessionMaxLifetime);
        Assert.Equal(TimeSpan.FromDays(7), options.RefreshIdleTimeout);
        Assert.Equal(TimeSpan.FromDays(30), options.RefreshAbsoluteLifetime);
        Assert.Equal(TimeSpan.FromMinutes(2), options.ClockSkewAllowance);
        Assert.Empty(options.GetValidationFailures());
    }

    [Theory]
    [InlineData("Settleora:Auth:Sessions:CurrentAccessSessionDefaultLifetime", "00:00:00")]
    [InlineData("Settleora:Auth:Sessions:CurrentAccessSessionDefaultLifetime", "31.00:00:00")]
    [InlineData("Settleora:Auth:Sessions:RefreshAccessSessionDefaultLifetime", "00:45:00")]
    [InlineData("Settleora:Auth:Sessions:RefreshAccessSessionMaxLifetime", "8.00:00:01")]
    [InlineData("Settleora:Auth:Sessions:RefreshIdleTimeout", "31.00:00:00")]
    [InlineData("Settleora:Auth:Sessions:ClockSkewAllowance", "00:03:00")]
    public void InvalidConfigurationValuesAreRejected(string key, string value)
    {
        Dictionary<string, string?> values = new()
        {
            [key] = value
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();
        var services = new ServiceCollection();
        services.AddAuthSessionRuntime(configuration);

        using var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<AuthSessionPolicyOptions>>();

        var exception = Assert.Throws<OptionsValidationException>(() => options.Value);
        Assert.Contains(AuthSessionPolicyOptions.SectionName, string.Join(Environment.NewLine, exception.Failures));
    }

    [Fact]
    public void AuthSessionPolicyConfigurationExamplesDoNotContainCredentialMaterial()
    {
        string[] documentPaths =
        [
            "docs/architecture/AUTH_REFRESH_TOKEN_ROTATION_POLICY.md",
            "services/api/README.md"
        ];
        var examples = documentPaths
            .Select(ReadRepoText)
            .SelectMany(ExtractFencedBlocks)
            .Where(IsAuthSessionPolicyExample)
            .ToArray();

        Assert.NotEmpty(examples);
        foreach (var example in examples)
        {
            Assert.DoesNotContain("token", example, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("hash", example, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("secret", example, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("password", example, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("credential", example, StringComparison.OrdinalIgnoreCase);
        }
    }

    private static bool IsAuthSessionPolicyExample(string example)
    {
        return example.Contains(AuthSessionPolicyOptions.SectionName, StringComparison.Ordinal)
            || example.Contains("Settleora__Auth__Sessions", StringComparison.Ordinal)
            || example.Contains("\"Sessions\"", StringComparison.Ordinal);
    }

    private static IEnumerable<string> ExtractFencedBlocks(string text)
    {
        using StringReader reader = new(text);
        StringBuilder? block = null;

        while (reader.ReadLine() is { } line)
        {
            if (line.TrimStart().StartsWith("```", StringComparison.Ordinal))
            {
                if (block is null)
                {
                    block = new StringBuilder();
                }
                else
                {
                    yield return block.ToString();
                    block = null;
                }

                continue;
            }

            block?.AppendLine(line);
        }
    }

    private static string ReadRepoText(string relativePath)
    {
        return File.ReadAllText(Path.Combine(FindRepoRoot(), relativePath));
    }

    private static string FindRepoRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "PROGRAM_ARCHITECTURE.md")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new InvalidOperationException("Could not locate the Settleora repository root.");
    }
}
