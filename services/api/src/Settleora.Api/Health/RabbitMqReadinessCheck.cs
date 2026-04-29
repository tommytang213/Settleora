using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Exceptions;
using Settleora.Api.Configuration;

namespace Settleora.Api.Health;

internal sealed class RabbitMqReadinessCheck : IRabbitMqReadinessCheck
{
    private static readonly TimeSpan ReadinessTimeout = TimeSpan.FromSeconds(2);

    private readonly IOptions<RabbitMqOptions> _rabbitMqOptions;

    public RabbitMqReadinessCheck(IOptions<RabbitMqOptions> rabbitMqOptions)
    {
        _rabbitMqOptions = rabbitMqOptions;
    }

    public async Task<bool> IsReadyAsync(CancellationToken cancellationToken)
    {
        var options = _rabbitMqOptions.Value;
        if (string.IsNullOrWhiteSpace(options.HostName)
            || string.IsNullOrWhiteSpace(options.UserName)
            || string.IsNullOrWhiteSpace(options.Password)
            || string.IsNullOrWhiteSpace(options.VirtualHost)
            || options.Port <= 0)
        {
            return false;
        }

        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(ReadinessTimeout);

            var factory = new ConnectionFactory
            {
                HostName = options.HostName,
                Port = options.Port,
                UserName = options.UserName,
                Password = options.Password,
                VirtualHost = options.VirtualHost,
                AutomaticRecoveryEnabled = false,
                RequestedConnectionTimeout = ReadinessTimeout,
                SocketReadTimeout = ReadinessTimeout,
                SocketWriteTimeout = ReadinessTimeout
            };

            await using var connection = await factory.CreateConnectionAsync(timeout.Token);

            return connection.IsOpen;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return false;
        }
        catch (Exception exception) when (IsReadinessFailure(exception))
        {
            return false;
        }
    }

    private static bool IsReadinessFailure(Exception exception)
    {
        return exception is BrokerUnreachableException
            or AuthenticationFailureException
            or ConnectFailureException
            or InvalidOperationException
            or TimeoutException
            or ArgumentException
            or FormatException;
    }
}
