import 'package:flutter/material.dart';

import 'recurring_bill_repository.dart';

class SettleoraRecurringBillScreen extends StatefulWidget {
  const SettleoraRecurringBillScreen({super.key, required this.repository});

  final SettleoraRecurringBillRepository repository;

  @override
  State<SettleoraRecurringBillScreen> createState() =>
      _SettleoraRecurringBillScreenState();
}

class _SettleoraRecurringBillScreenState
    extends State<SettleoraRecurringBillScreen> {
  bool _isLoading = true;
  String? _generatingKey;
  List<SettleoraRecurringBillTemplateSummary> _templates = const [];
  List<SettleoraRecurringBillForecastOccurrence> _forecast = const [];
  SettleoraRecurringBillFailure? _failure;
  SettleoraRecurringBillFailure? _actionFailure;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _failure = null;
      _actionFailure = null;
    });

    try {
      final templates = await widget.repository.listTemplates(maxItems: 100);
      final forecast = await widget.repository.listForecast(limit: 30);
      if (!mounted) {
        return;
      }

      setState(() {
        _templates = templates;
        _forecast = forecast;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraRecurringBillFailure.from(error);
        _templates = const [];
        _forecast = const [];
        _isLoading = false;
      });
    }
  }

  Future<void> _openTemplate(
    SettleoraRecurringBillTemplateSummary template,
  ) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettleoraRecurringBillDetailScreen(
          repository: widget.repository,
          templateId: template.id,
        ),
      ),
    );

    if (mounted) {
      await _load();
    }
  }

  Future<void> _generateDraft(
    SettleoraRecurringBillForecastOccurrence occurrence,
  ) async {
    final operationKey = _operationKey(occurrence);
    if (_generatingKey != null || !occurrence.canGenerateDraft) {
      return;
    }

    setState(() {
      _generatingKey = operationKey;
      _actionFailure = null;
    });

    try {
      final result = await widget.repository.generateDraft(
        templateId: occurrence.templateId,
        occurrenceDate: occurrence.occurrenceDate,
      );
      if (!mounted) {
        return;
      }

      _showSnackBar(
        'Draft generated: ${_money(result.totalAmount, result.totalCurrency)}.',
      );
      await _load();
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _actionFailure = SettleoraRecurringBillFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _generatingKey = null;
        });
      }
    }
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final actionFailure = _actionFailure;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Recurring bills'),
        actions: [
          IconButton(
            key: const Key('recurring-bill-refresh'),
            tooltip: 'Refresh',
            onPressed: _isLoading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const _LoadingPanel(label: 'Loading recurring bills');
            }

            final failure = _failure;
            if (failure != null) {
              return _FailurePanel(failure: failure, onRetry: _load);
            }

            return RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  if (actionFailure != null) ...[
                    _InlineFailure(failure: actionFailure),
                    const SizedBox(height: 12),
                  ],
                  _Section(
                    title: 'Templates',
                    children: [
                      if (_templates.isEmpty)
                        const _StatePanel(
                          icon: Icons.event_repeat_outlined,
                          title: 'No recurring bills',
                          message:
                              'Recurring bill templates visible to this account will appear here.',
                          compact: true,
                        )
                      else
                        for (
                          var index = 0;
                          index < _templates.length;
                          index += 1
                        )
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _TemplateTile(
                              key: ValueKey('recurring-bill-template-$index'),
                              template: _templates[index],
                              onTap: () => _openTemplate(_templates[index]),
                            ),
                          ),
                    ],
                  ),
                  const SizedBox(height: 22),
                  _Section(
                    title: 'Forecast',
                    children: [
                      if (_forecast.isEmpty)
                        const _StatePanel(
                          icon: Icons.calendar_month_outlined,
                          title: 'No forecast',
                          message:
                              'Upcoming recurring bill occurrences will appear here.',
                          compact: true,
                        )
                      else
                        for (
                          var index = 0;
                          index < _forecast.length;
                          index += 1
                        )
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _ForecastTile(
                              occurrence: _forecast[index],
                              buttonKey: ValueKey(
                                'recurring-bill-generate-$index',
                              ),
                              isGenerating:
                                  _generatingKey ==
                                  _operationKey(_forecast[index]),
                              onGenerate: () =>
                                  _generateDraft(_forecast[index]),
                            ),
                          ),
                    ],
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class SettleoraRecurringBillDetailScreen extends StatefulWidget {
  const SettleoraRecurringBillDetailScreen({
    super.key,
    required this.repository,
    required this.templateId,
  });

  final SettleoraRecurringBillRepository repository;
  final String templateId;

  @override
  State<SettleoraRecurringBillDetailScreen> createState() =>
      _SettleoraRecurringBillDetailScreenState();
}

class _SettleoraRecurringBillDetailScreenState
    extends State<SettleoraRecurringBillDetailScreen> {
  bool _isLoading = true;
  SettleoraRecurringBillTemplateDetail? _template;
  SettleoraRecurringBillFailure? _failure;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _failure = null;
    });

    try {
      final template = await widget.repository.getTemplate(widget.templateId);
      if (!mounted) {
        return;
      }

      setState(() {
        _template = template;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraRecurringBillFailure.from(error);
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Recurring bill'),
        actions: [
          IconButton(
            key: const Key('recurring-bill-detail-refresh'),
            tooltip: 'Refresh',
            onPressed: _isLoading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (_isLoading) {
              return const _LoadingPanel(label: 'Loading recurring bill');
            }

            final failure = _failure;
            if (failure != null) {
              return _FailurePanel(failure: failure, onRetry: _load);
            }

            final template = _template;
            if (template == null) {
              return _FailurePanel(
                failure: const SettleoraRecurringBillFailure(
                  kind: SettleoraRecurringBillFailureKind.unavailable,
                  message: 'The recurring bill is no longer available.',
                ),
                onRetry: _load,
              );
            }

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              children: [
                _TemplateHeader(template: template),
                const SizedBox(height: 20),
                _Section(
                  title: 'Schedule',
                  children: [
                    _KeyValueText(
                      label: 'Frequency',
                      value: settleoraRecurringBillScheduleLabel(
                        template.schedule,
                      ),
                    ),
                    _KeyValueText(
                      label: 'Start',
                      value: template.schedule.startDate,
                    ),
                    if (template.schedule.endDate != null)
                      _KeyValueText(
                        label: 'End',
                        value: template.schedule.endDate!,
                      ),
                    if (template.schedule.dueOffsetDays != null)
                      _KeyValueText(
                        label: 'Due offset',
                        value: '${template.schedule.dueOffsetDays} days',
                      ),
                    if (template.nextOccurrenceDate != null)
                      _KeyValueText(
                        label: 'Next',
                        value: template.nextOccurrenceDate!,
                      ),
                  ],
                ),
                const SizedBox(height: 20),
                _Section(
                  title: 'Details',
                  children: [
                    _KeyValueText(
                      label: 'Scope',
                      value: template.isGroupScoped ? 'Group' : 'Personal',
                    ),
                    _KeyValueText(
                      label: 'Updated',
                      value: _formatTimestamp(template.updatedAtUtc),
                    ),
                    if (template.archivedAtUtc != null)
                      _KeyValueText(
                        label: 'Archived',
                        value: _formatTimestamp(template.archivedAtUtc!),
                      ),
                    _KeyValueText(
                      label: 'Payload',
                      value: 'Version ${template.payloadVersion}',
                    ),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _TemplateTile extends StatelessWidget {
  const _TemplateTile({super.key, required this.template, required this.onTap});

  final SettleoraRecurringBillTemplateSummary template;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        onTap: onTap,
        leading: const CircleAvatar(child: Icon(Icons.event_repeat_outlined)),
        title: Text(
          template.displayName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_money(template.forecastAmount, template.forecastCurrency)),
              const SizedBox(height: 4),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  _SoftChip(
                    label: settleoraRecurringBillTemplateStatusLabel(
                      template.status,
                    ),
                    icon: Icons.assignment_outlined,
                  ),
                  _SoftChip(
                    label: settleoraRecurringBillScheduleLabel(
                      template.schedule,
                    ),
                    icon: Icons.schedule_outlined,
                  ),
                  if (template.isGroupScoped)
                    const _SoftChip(
                      label: 'Group',
                      icon: Icons.groups_outlined,
                    ),
                ],
              ),
              if (template.nextOccurrenceDate != null) ...[
                const SizedBox(height: 6),
                Text('Next: ${template.nextOccurrenceDate}'),
              ],
            ],
          ),
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

class _ForecastTile extends StatelessWidget {
  const _ForecastTile({
    required this.occurrence,
    required this.buttonKey,
    required this.isGenerating,
    required this.onGenerate,
  });

  final SettleoraRecurringBillForecastOccurrence occurrence;
  final Key buttonKey;
  final bool isGenerating;
  final VoidCallback onGenerate;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.only(top: 2),
                  child: Icon(Icons.calendar_month_outlined),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        occurrence.displayName,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${occurrence.occurrenceDate} - ${_money(occurrence.forecastAmount, occurrence.forecastCurrency)}',
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                _SoftChip(
                  label: settleoraRecurringBillOccurrenceStatusLabel(
                    occurrence.status,
                  ),
                  icon: Icons.assignment_outlined,
                ),
                if (occurrence.dueDate != null)
                  _SoftChip(
                    label: 'Due ${occurrence.dueDate}',
                    icon: Icons.event_available_outlined,
                  ),
                if (occurrence.isGroupScoped)
                  const _SoftChip(label: 'Group', icon: Icons.groups_outlined),
              ],
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: OutlinedButton.icon(
                key: buttonKey,
                onPressed: occurrence.canGenerateDraft && !isGenerating
                    ? onGenerate
                    : null,
                icon: isGenerating
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.note_add_outlined),
                label: Text(
                  occurrence.draftGenerated
                      ? 'Draft Generated'
                      : 'Generate Draft',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TemplateHeader extends StatelessWidget {
  const _TemplateHeader({required this.template});

  final SettleoraRecurringBillTemplateDetail template;

  @override
  Widget build(BuildContext context) {
    final description = template.description?.trim();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          template.displayName,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 10),
        _KeyValueText(
          label: 'Status',
          value: settleoraRecurringBillTemplateStatusLabel(template.status),
        ),
        _KeyValueText(
          label: 'Estimate',
          value: _money(template.forecastAmount, template.forecastCurrency),
        ),
        if (description != null && description.isNotEmpty)
          _KeyValueText(label: 'Description', value: description),
      ],
    );
  }
}

class _FailurePanel extends StatelessWidget {
  const _FailurePanel({required this.failure, required this.onRetry});

  final SettleoraRecurringBillFailure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _StatePanel(
      icon: _failureIcon(failure.kind),
      title: failure.title,
      message: failure.message,
      action: OutlinedButton.icon(
        key: const Key('recurring-bill-retry'),
        onPressed: onRetry,
        icon: const Icon(Icons.refresh),
        label: const Text('Retry'),
      ),
    );
  }
}

class _InlineFailure extends StatelessWidget {
  const _InlineFailure({required this.failure});

  final SettleoraRecurringBillFailure failure;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.error),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(
              _failureIcon(failure.kind),
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(failure.message)),
          ],
        ),
      ),
    );
  }
}

class _StatePanel extends StatelessWidget {
  const _StatePanel({
    required this.icon,
    required this.title,
    required this.message,
    this.action,
    this.compact = false,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: compact ? 28 : 42,
          color: Theme.of(context).colorScheme.primary,
        ),
        SizedBox(height: compact ? 8 : 14),
        Text(
          title,
          style: compact
              ? Theme.of(context).textTheme.titleMedium
              : Theme.of(context).textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 6),
        Text(message, textAlign: TextAlign.center),
        if (action != null) ...[const SizedBox(height: 14), action!],
      ],
    );

    if (compact) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: content,
      );
    }

    return Center(
      child: Padding(padding: const EdgeInsets.all(24), child: content),
    );
  }
}

class _LoadingPanel extends StatelessWidget {
  const _LoadingPanel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 14),
          Text(label),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 10),
        ...children,
      ],
    );
  }
}

class _KeyValueText extends StatelessWidget {
  const _KeyValueText({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 112,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(value, textAlign: TextAlign.end)),
        ],
      ),
    );
  }
}

class _SoftChip extends StatelessWidget {
  const _SoftChip({required this.label, required this.icon});

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Chip(
      visualDensity: VisualDensity.compact,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
      avatar: Icon(icon, size: 16),
      label: Text(label),
    );
  }
}

IconData _failureIcon(SettleoraRecurringBillFailureKind kind) {
  return switch (kind) {
    SettleoraRecurringBillFailureKind.sessionRequired => Icons.lock_outline,
    SettleoraRecurringBillFailureKind.sessionExpired => Icons.lock_outline,
    SettleoraRecurringBillFailureKind.denied => Icons.no_accounts_outlined,
    SettleoraRecurringBillFailureKind.unavailable =>
      Icons.visibility_off_outlined,
    SettleoraRecurringBillFailureKind.conflict => Icons.sync_problem_outlined,
    SettleoraRecurringBillFailureKind.validation =>
      Icons.report_problem_outlined,
    SettleoraRecurringBillFailureKind.network => Icons.cloud_off_outlined,
    SettleoraRecurringBillFailureKind.server => Icons.error_outline,
  };
}

String _money(String amount, String currency) {
  return '$amount $currency';
}

String _formatTimestamp(DateTime value) {
  return value.toLocal().toString().split('.').first;
}

String _operationKey(SettleoraRecurringBillForecastOccurrence occurrence) {
  return '${occurrence.templateId}|${occurrence.occurrenceDate}';
}
