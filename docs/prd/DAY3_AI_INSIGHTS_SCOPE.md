# Settleora Day 3 AI Insights Scope

## Purpose

Day 3 introduces optional AI-assisted reporting, categorization, cleanup, and insight generation.

AI must remain an insight and suggestion layer. It must not become the source of financial truth, bypass authorization, or silently mutate money records.

## Day 3 features

### AI provider settings

Users/admins can configure AI mode:

```text
disabled
app_default
external_openai_compatible
self_hosted
```

Supported settings:

- Provider type.
- Base URL for custom/self-hosted provider.
- Model name.
- API key, optional depending on provider.
- Timeout seconds.
- Max output size.
- Data sharing level.
- Test connection.

### Data sharing modes

Recommended modes:

```text
metadata_only
summary_only
full_context
local_only_full_context
```

Default should be `summary_only` or `metadata_only`.

Raw receipt images, full OCR text, payment details, and statement contents must not be sent to external AI providers by default.

### Auto-category suggestions

AI can suggest categories based on:

- Merchant.
- OCR text.
- Line items.
- Prior user choices.
- Group type.
- Notes.
- Payment method.

AI suggestions must be editable. Silent application requires explicit trusted rules.

### Merchant cleanup suggestions

AI can suggest merchant normalization:

- Alias mapping.
- Canonical merchant name.
- Repeated merchant grouping.

User confirmation is required unless a user-approved rule already exists.

### Monthly AI summary

AI can generate natural-language summaries from deterministic backend report data.

Examples:

- Spending increased/decreased by category.
- Largest merchants.
- Unsettled amounts.
- Upcoming recurring bills.
- Possible duplicates.
- FX-driven variance.

Backend calculates numbers. AI explains them.

### Natural-language report Q&A

Users can ask questions against authorized data:

- What did this group spend most on?
- Who still owes me money?
- Which receipts need review?
- Why was this month higher than last month?

AI must only receive/query data the requesting user is authorized to access.

### Anomaly explanation

AI can explain deterministic anomaly flags:

- Duplicate-looking expenses.
- Unusual amount for merchant.
- Recurring bill increased.
- Statement mismatch.
- FX/card posted amount variance.
- Post-lock adjustment.

AI may summarize or explain; deterministic services should produce the actual flags.

### Receipt cleanup assistant

AI can assist with:

- Suggesting category.
- Suggesting merchant cleanup.
- Explaining item-total mismatch.
- Identifying likely tax/service/tip lines.
- Suggesting duplicate candidates.

AI must not finalize corrections without user or backend validation.

## Provider abstraction

Recommended interface concept:

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

## Guardrails

- AI must not decide settlement balances.
- AI must not bypass authorization.
- AI must not silently change financial records.
- AI must not send raw receipt/OCR/statement/payment data unless explicitly configured.
- AI output must be marked as suggestion or insight.
- AI usage should be auditable.
- Backend deterministic calculations remain authoritative.

## Non-goals

- AI as accounting authority.
- AI-only reconciliation.
- AI bank dispute filing.
- AI auto-approval of bills/refunds/locks.
- Sending sensitive data to external providers by default.
