# AI Insights Architecture

## Purpose

AI Insights is a Day 3 optional feature layer for reports, suggestions, explanations, and natural-language exploration.

AI must not replace deterministic financial calculations or API authorization.

## Principles

- AI suggests; backend/domain services remain authoritative.
- AI must not decide settlement balances.
- AI must not bypass authorization.
- AI must not silently mutate records.
- AI must not receive sensitive data by default.
- AI usage should be auditable.

## Provider modes

Supported modes:

```text
disabled
app_default
external_openai_compatible
self_hosted
```

## Provider settings

Suggested settings:

```text
provider_type
base_url nullable
model_name nullable
api_key_secret_ref nullable
timeout_seconds
max_output_tokens
data_sharing_mode
is_enabled
```

## Data sharing modes

```text
metadata_only
summary_only
full_context
local_only_full_context
```

Default should be `summary_only` or `metadata_only`.

## Provider abstraction

Suggested interface:

```csharp
public interface IAiInsightProvider
{
    Task<AiInsightResult> GenerateReportAsync(
        AiInsightRequest request,
        CancellationToken cancellationToken);

    Task<CategorySuggestionResult> SuggestCategoryAsync(
        CategorySuggestionRequest request,
        CancellationToken cancellationToken);
}
```

Provider implementations:

```text
NoopAiInsightProvider
AppDefaultAiInsightProvider
OpenAiCompatibleProvider
OllamaProvider
CustomHttpAiProvider
```

## Authorized data access

AI request preparation must use the same API/domain authorization rules as normal reports.

Rule:

```text
If a user cannot view a bill/report normally, AI cannot reveal it indirectly.
```

## Deterministic-first reporting

Backend services calculate:

- Totals.
- Balances.
- Percentages.
- Category sums.
- Forecast values.
- Statement mismatch flags.
- Settlement suggestions.

AI explains/summarizes those deterministic results.

## Supported Day 3 features

- Auto-category suggestions.
- Merchant cleanup suggestions.
- Monthly insight summaries.
- Natural-language report Q&A.
- Anomaly explanations.
- Receipt cleanup suggestions.
- Budget explanation assistant.

## Sensitive data rules

Do not send externally by default:

- Raw receipt images.
- Full OCR text.
- Statement rows.
- Payment profile details.
- Secrets/tokens.
- Unnecessary notes that may contain sensitive data.

## Audit

Audit events should cover:

- AI provider settings changed.
- AI enabled/disabled.
- AI request generated where audit policy requires it.
- AI suggestion accepted/rejected where it changes records.
- AI data sharing mode changed.

## Non-goals

- AI as accounting authority.
- AI deciding payment obligations.
- AI auto-approving bills/refunds/locks.
- AI raw-data export by default.
