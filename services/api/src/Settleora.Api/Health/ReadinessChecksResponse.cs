using System.Text.Json.Serialization;

namespace Settleora.Api.Health;

internal sealed record ReadinessChecksResponse(
    string Postgres,
    [property: JsonPropertyName("rabbitmq")] string RabbitMq,
    string Storage);
