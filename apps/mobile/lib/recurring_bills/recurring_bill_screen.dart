import 'package:flutter/material.dart';

import 'recurring_bill_repository.dart';

class SettleoraRecurringBillScreen extends StatefulWidget {
  const SettleoraRecurringBillScreen({
    super.key,
    required this.repository,
    this.openNeedsDraftOnStart = false,
  });

  final SettleoraRecurringBillRepository repository;
  final bool openNeedsDraftOnStart;

  @override
  State<SettleoraRecurringBillScreen> createState() =>
      _SettleoraRecurringBillScreenState();
}

class _SettleoraRecurringBillScreenState
    extends State<SettleoraRecurringBillScreen> {
  late final TextEditingController _searchController;
  bool _isLoading = true;
  String? _generatingKey;
  List<SettleoraRecurringBillTemplateSummary> _templates = const [];
  List<SettleoraRecurringBillForecastOccurrence> _forecast = const [];
  _RecurringTemplateFilter _templateFilter = _RecurringTemplateFilter.all;
  _RecurringForecastFilter _forecastFilter = _RecurringForecastFilter.all;
  String _searchQuery = '';
  SettleoraRecurringBillFailure? _failure;
  SettleoraRecurringBillFailure? _actionFailure;

  @override
  void initState() {
    super.initState();
    if (widget.openNeedsDraftOnStart) {
      _forecastFilter = _RecurringForecastFilter.needsDraft;
    }
    _searchController = TextEditingController();
    _searchController.addListener(_handleSearchChanged);
    Future<void>.microtask(_load);
  }

  @override
  void dispose() {
    _searchController.removeListener(_handleSearchChanged);
    _searchController.dispose();
    super.dispose();
  }

  void _handleSearchChanged() {
    final nextQuery = _searchController.text.trim();
    if (nextQuery == _searchQuery) {
      return;
    }

    setState(() {
      _searchQuery = nextQuery;
    });
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

    final confirmed = await _confirmDraftGeneration(occurrence);
    if (!mounted) {
      return;
    }
    if (!confirmed) {
      setState(() {
        _generatingKey = null;
      });
      return;
    }

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

  Future<bool> _confirmDraftGeneration(
    SettleoraRecurringBillForecastOccurrence occurrence,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Generate draft?'),
          content: Text(
            'Settleora will ask the server to create a draft bill for '
            '${occurrence.displayName} on ${occurrence.occurrenceDate}. '
            'Estimated total: '
            '${_money(occurrence.forecastAmount, occurrence.forecastCurrency)}.',
          ),
          actions: [
            TextButton(
              key: const Key('recurring-bill-generate-cancel'),
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton.icon(
              key: const Key('recurring-bill-generate-confirm'),
              onPressed: () => Navigator.of(context).pop(true),
              icon: const Icon(Icons.note_add_outlined),
              label: const Text('Generate draft'),
            ),
          ],
        );
      },
    );

    return confirmed ?? false;
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  void _selectTemplateFilter(_RecurringTemplateFilter filter) {
    if (filter == _templateFilter) {
      return;
    }

    setState(() {
      _templateFilter = filter;
    });
  }

  void _selectForecastFilter(_RecurringForecastFilter filter) {
    if (filter == _forecastFilter) {
      return;
    }

    setState(() {
      _forecastFilter = filter;
    });
  }

  void _clearDiscoveryState() {
    setState(() {
      _templateFilter = _RecurringTemplateFilter.all;
      _forecastFilter = _RecurringForecastFilter.all;
      _searchQuery = '';
      _searchController.clear();
    });
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
                  _RecurringBillDiscoveryControls(
                    controller: _searchController,
                    selectedTemplateFilter: _templateFilter,
                    selectedForecastFilter: _forecastFilter,
                    templateCounts: _RecurringTemplateFilterCounts.from(
                      templates: _templates,
                    ),
                    forecastCounts: _RecurringForecastFilterCounts.from(
                      forecast: _forecast,
                    ),
                    hasActiveDiscovery: _hasActiveDiscovery,
                    onTemplateFilterSelected: _selectTemplateFilter,
                    onForecastFilterSelected: _selectForecastFilter,
                    onClear: _clearDiscoveryState,
                  ),
                  const SizedBox(height: 20),
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
                      else if (_visibleTemplates.isEmpty)
                        const _StatePanel(
                          icon: Icons.search_off_outlined,
                          title: 'No matching templates',
                          message:
                              'Adjust the search or template filters to show recurring bills again.',
                          compact: true,
                        )
                      else
                        for (
                          var index = 0;
                          index < _visibleTemplates.length;
                          index += 1
                        )
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _TemplateTile(
                              key: ValueKey('recurring-bill-template-$index'),
                              template: _visibleTemplates[index],
                              onTap: () =>
                                  _openTemplate(_visibleTemplates[index]),
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
                      else if (_visibleForecast.isEmpty)
                        const _StatePanel(
                          icon: Icons.search_off_outlined,
                          title: 'No matching forecast',
                          message:
                              'Adjust the search or forecast filters to show upcoming occurrences again.',
                          compact: true,
                        )
                      else
                        for (
                          var index = 0;
                          index < _visibleForecast.length;
                          index += 1
                        )
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _ForecastTile(
                              occurrence: _visibleForecast[index],
                              buttonKey: ValueKey(
                                'recurring-bill-generate-$index',
                              ),
                              isGenerating:
                                  _generatingKey ==
                                  _operationKey(_visibleForecast[index]),
                              onGenerate: () =>
                                  _generateDraft(_visibleForecast[index]),
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

  bool get _hasActiveDiscovery {
    return _searchQuery.isNotEmpty ||
        _templateFilter != _RecurringTemplateFilter.all ||
        _forecastFilter != _RecurringForecastFilter.all;
  }

  List<SettleoraRecurringBillTemplateSummary> get _visibleTemplates {
    final queryTerms = _searchTerms(_searchQuery);
    return _templates
        .where((template) {
          if (!_templateFilter.matches(template)) {
            return false;
          }
          if (queryTerms.isEmpty) {
            return true;
          }

          final searchText = _templateSearchText(template);
          return queryTerms.every(searchText.contains);
        })
        .toList(growable: false);
  }

  List<SettleoraRecurringBillForecastOccurrence> get _visibleForecast {
    final queryTerms = _searchTerms(_searchQuery);
    return _forecast
        .where((occurrence) {
          if (!_forecastFilter.matches(occurrence)) {
            return false;
          }
          if (queryTerms.isEmpty) {
            return true;
          }

          final searchText = _forecastSearchText(occurrence);
          return queryTerms.every(searchText.contains);
        })
        .toList(growable: false);
  }
}

enum _RecurringTemplateFilter {
  all(label: 'All'),
  active(label: 'Active'),
  inactive(label: 'Inactive'),
  personal(label: 'Personal'),
  group(label: 'Group');

  const _RecurringTemplateFilter({required this.label});

  final String label;

  String get key {
    return switch (this) {
      _RecurringTemplateFilter.all => 'all',
      _RecurringTemplateFilter.active => 'active',
      _RecurringTemplateFilter.inactive => 'inactive',
      _RecurringTemplateFilter.personal => 'personal',
      _RecurringTemplateFilter.group => 'group',
    };
  }

  bool matches(SettleoraRecurringBillTemplateSummary template) {
    return switch (this) {
      _RecurringTemplateFilter.all => true,
      _RecurringTemplateFilter.active =>
        template.status == SettleoraRecurringBillTemplateStatusValues.active,
      _RecurringTemplateFilter.inactive =>
        template.status != SettleoraRecurringBillTemplateStatusValues.active,
      _RecurringTemplateFilter.personal => !template.isGroupScoped,
      _RecurringTemplateFilter.group => template.isGroupScoped,
    };
  }
}

class _RecurringTemplateFilterCounts {
  const _RecurringTemplateFilterCounts(this._counts);

  factory _RecurringTemplateFilterCounts.from({
    required List<SettleoraRecurringBillTemplateSummary> templates,
  }) {
    return _RecurringTemplateFilterCounts({
      for (final filter in _RecurringTemplateFilter.values)
        filter: templates.where(filter.matches).length,
    });
  }

  final Map<_RecurringTemplateFilter, int> _counts;

  int count(_RecurringTemplateFilter filter) => _counts[filter] ?? 0;
}

enum _RecurringForecastFilter {
  all(label: 'All'),
  needsDraft(label: 'Needs draft'),
  draftGenerated(label: 'Draft generated'),
  closed(label: 'Closed'),
  personal(label: 'Personal'),
  group(label: 'Group');

  const _RecurringForecastFilter({required this.label});

  final String label;

  String get key {
    return switch (this) {
      _RecurringForecastFilter.all => 'all',
      _RecurringForecastFilter.needsDraft => 'needs-draft',
      _RecurringForecastFilter.draftGenerated => 'draft-generated',
      _RecurringForecastFilter.closed => 'closed',
      _RecurringForecastFilter.personal => 'personal',
      _RecurringForecastFilter.group => 'group',
    };
  }

  bool matches(SettleoraRecurringBillForecastOccurrence occurrence) {
    return switch (this) {
      _RecurringForecastFilter.all => true,
      _RecurringForecastFilter.needsDraft => occurrence.canGenerateDraft,
      _RecurringForecastFilter.draftGenerated => occurrence.draftGenerated,
      _RecurringForecastFilter.closed =>
        occurrence.status ==
                SettleoraRecurringBillOccurrenceStatusValues.cancelled ||
            occurrence.status ==
                SettleoraRecurringBillOccurrenceStatusValues.skipped,
      _RecurringForecastFilter.personal => !occurrence.isGroupScoped,
      _RecurringForecastFilter.group => occurrence.isGroupScoped,
    };
  }
}

class _RecurringForecastFilterCounts {
  const _RecurringForecastFilterCounts(this._counts);

  factory _RecurringForecastFilterCounts.from({
    required List<SettleoraRecurringBillForecastOccurrence> forecast,
  }) {
    return _RecurringForecastFilterCounts({
      for (final filter in _RecurringForecastFilter.values)
        filter: forecast.where(filter.matches).length,
    });
  }

  final Map<_RecurringForecastFilter, int> _counts;

  int count(_RecurringForecastFilter filter) => _counts[filter] ?? 0;
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
                      label: 'Next step',
                      value: _templateGuidance(template),
                    ),
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
                    _KeyValueText(
                      label: 'Due timing',
                      value: _scheduleDueCopy(template.schedule),
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
                    if (template.nextOccurrenceDate == null)
                      const _KeyValueText(
                        label: 'Next',
                        value:
                            'No upcoming occurrence is available from the server.',
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
              Text(_templateDueSummary(template)),
              const SizedBox(height: 4),
              Text(
                template.isGroupScoped ? 'Shared group bill' : 'Personal bill',
              ),
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
                        _money(
                          occurrence.forecastAmount,
                          occurrence.forecastCurrency,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(_occurrenceDueSummary(occurrence)),
                      const SizedBox(height: 4),
                      Text(_occurrenceGuidance(occurrence)),
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

String _templateDueSummary(SettleoraRecurringBillTemplateSummary template) {
  final next = template.nextOccurrenceDate;
  final scope = template.isGroupScoped ? 'shared' : 'personal';
  final status = template.status;
  if (status == SettleoraRecurringBillTemplateStatusValues.archived) {
    return 'Archived; no future generation is available here.';
  }
  if (status == SettleoraRecurringBillTemplateStatusValues.paused) {
    return 'Paused; no new drafts will be generated until resumed.';
  }
  if (next == null) {
    return 'No upcoming $scope schedule is available.';
  }

  return 'Next occurrence: $next.';
}

String _templateGuidance(SettleoraRecurringBillTemplateSummary template) {
  final next = template.nextOccurrenceDate;
  return switch (template.status) {
    SettleoraRecurringBillTemplateStatusValues.active when next != null =>
      'Watch the forecast for the next draft opportunity on $next.',
    SettleoraRecurringBillTemplateStatusValues.active =>
      'This template is active, but the server did not return a next occurrence.',
    SettleoraRecurringBillTemplateStatusValues.paused =>
      'This template is paused. Mobile can show it, but pause and resume actions are not available in this surface yet.',
    SettleoraRecurringBillTemplateStatusValues.archived =>
      'This template is archived. Mobile keeps it read-only and does not offer future generation.',
    _ =>
      'Mobile is showing the server-provided recurring bill state without local lifecycle changes.',
  };
}

String _scheduleDueCopy(SettleoraRecurringBillSchedule schedule) {
  final offset = schedule.dueOffsetDays;
  if (offset == null) {
    return 'No due offset is configured.';
  }
  if (offset == 0) {
    return 'Due on the occurrence date.';
  }
  if (offset == 1) {
    return 'Due 1 day after each occurrence.';
  }

  return 'Due $offset days after each occurrence.';
}

String _occurrenceDueSummary(
  SettleoraRecurringBillForecastOccurrence occurrence,
) {
  final dueDate = occurrence.dueDate;
  final occurrenceCopy = 'Occurrence: ${occurrence.occurrenceDate}.';
  if (dueDate == null) {
    return '$occurrenceCopy No due date was returned.';
  }

  return '$occurrenceCopy Due: $dueDate.';
}

String _occurrenceGuidance(
  SettleoraRecurringBillForecastOccurrence occurrence,
) {
  if (occurrence.draftGenerated) {
    return 'A draft already exists for this occurrence.';
  }

  return switch (occurrence.status) {
    SettleoraRecurringBillOccurrenceStatusValues.forecasted =>
      'Review the estimate, then generate a draft when you are ready.',
    SettleoraRecurringBillOccurrenceStatusValues.skipped =>
      'This occurrence was skipped and has no mobile action.',
    SettleoraRecurringBillOccurrenceStatusValues.cancelled =>
      'This occurrence was cancelled and has no future action.',
    _ => 'This forecast is read-only in mobile for the current server state.',
  };
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

class _RecurringBillDiscoveryControls extends StatelessWidget {
  const _RecurringBillDiscoveryControls({
    required this.controller,
    required this.selectedTemplateFilter,
    required this.selectedForecastFilter,
    required this.templateCounts,
    required this.forecastCounts,
    required this.hasActiveDiscovery,
    required this.onTemplateFilterSelected,
    required this.onForecastFilterSelected,
    required this.onClear,
  });

  final TextEditingController controller;
  final _RecurringTemplateFilter selectedTemplateFilter;
  final _RecurringForecastFilter selectedForecastFilter;
  final _RecurringTemplateFilterCounts templateCounts;
  final _RecurringForecastFilterCounts forecastCounts;
  final bool hasActiveDiscovery;
  final ValueChanged<_RecurringTemplateFilter> onTemplateFilterSelected;
  final ValueChanged<_RecurringForecastFilter> onForecastFilterSelected;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          key: const Key('recurring-bill-search'),
          controller: controller,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            labelText: 'Search recurring bills',
            prefixIcon: const Icon(Icons.search),
            border: const OutlineInputBorder(),
            suffixIcon: controller.text.isEmpty
                ? null
                : IconButton(
                    key: const Key('recurring-bill-search-clear'),
                    tooltip: 'Clear search',
                    onPressed: controller.clear,
                    icon: const Icon(Icons.close),
                  ),
          ),
        ),
        const SizedBox(height: 12),
        _FilterChipRow(
          label: 'Templates',
          children: [
            for (final filter in _RecurringTemplateFilter.values)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  key: Key('recurring-bill-template-filter-${filter.key}'),
                  label: Text(
                    '${filter.label} (${templateCounts.count(filter)})',
                  ),
                  selected: selectedTemplateFilter == filter,
                  onSelected: (_) => onTemplateFilterSelected(filter),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        _FilterChipRow(
          label: 'Forecast',
          children: [
            for (final filter in _RecurringForecastFilter.values)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  key: Key('recurring-bill-forecast-filter-${filter.key}'),
                  label: Text(
                    '${filter.label} (${forecastCounts.count(filter)})',
                  ),
                  selected: selectedForecastFilter == filter,
                  onSelected: (_) => onForecastFilterSelected(filter),
                ),
              ),
          ],
        ),
        if (hasActiveDiscovery) ...[
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              key: const Key('recurring-bill-clear-discovery'),
              onPressed: onClear,
              icon: const Icon(Icons.filter_alt_off_outlined),
              label: const Text('Clear filters'),
            ),
          ),
        ],
      ],
    );
  }
}

class _FilterChipRow extends StatelessWidget {
  const _FilterChipRow({required this.label, required this.children});

  final String label;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 6),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: children),
        ),
      ],
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

List<String> _searchTerms(String query) {
  return query
      .toLowerCase()
      .split(RegExp(r'\s+'))
      .where((term) => term.isNotEmpty)
      .toList(growable: false);
}

String _templateSearchText(SettleoraRecurringBillTemplateSummary template) {
  return [
    template.displayName,
    template.description,
    template.forecastAmount,
    template.forecastCurrency,
    _money(template.forecastAmount, template.forecastCurrency),
    settleoraRecurringBillTemplateStatusLabel(template.status),
    settleoraRecurringBillScheduleLabel(template.schedule),
    _templateDueSummary(template),
    template.nextOccurrenceDate,
    template.isGroupScoped ? 'Group shared group bill' : 'Personal bill',
  ].whereType<String>().join(' ').toLowerCase();
}

String _forecastSearchText(
  SettleoraRecurringBillForecastOccurrence occurrence,
) {
  return [
    occurrence.displayName,
    occurrence.forecastAmount,
    occurrence.forecastCurrency,
    _money(occurrence.forecastAmount, occurrence.forecastCurrency),
    settleoraRecurringBillOccurrenceStatusLabel(occurrence.status),
    _occurrenceDueSummary(occurrence),
    _occurrenceGuidance(occurrence),
    occurrence.occurrenceDate,
    occurrence.dueDate,
    occurrence.draftGenerated ? 'Draft generated' : 'Needs draft',
    occurrence.canGenerateDraft ? 'Can generate draft' : null,
    occurrence.isGroupScoped ? 'Group shared group bill' : 'Personal bill',
  ].whereType<String>().join(' ').toLowerCase();
}
