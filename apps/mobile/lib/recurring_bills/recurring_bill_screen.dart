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

  Future<void> _openCreateTemplate() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => SettleoraRecurringBillTemplateFormScreen.create(
          repository: widget.repository,
        ),
      ),
    );

    if (mounted && changed == true) {
      _showSnackBar('Recurring bill saved. Refreshing server state.');
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
            key: const Key('recurring-bill-create'),
            tooltip: 'Create recurring bill',
            onPressed: _isLoading ? null : _openCreateTemplate,
            icon: const Icon(Icons.add),
          ),
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

enum _TemplateLifecycleAction {
  pause(key: 'pause'),
  resume(key: 'resume'),
  archive(key: 'archive');

  const _TemplateLifecycleAction({required this.key});

  final String key;
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
  SettleoraRecurringBillFailure? _actionFailure;
  String? _refreshWarning;
  _TemplateLifecycleAction? _inFlightAction;

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
      _refreshWarning = null;
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

  Future<void> _openEditTemplate() async {
    final template = _template;
    if (template == null ||
        template.status ==
            SettleoraRecurringBillTemplateStatusValues.archived) {
      return;
    }

    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => SettleoraRecurringBillTemplateFormScreen.edit(
          repository: widget.repository,
          template: template,
        ),
      ),
    );

    if (mounted && changed == true) {
      await _refreshAfterMutation('Recurring bill updated.');
    }
  }

  Future<void> _runLifecycleAction(_TemplateLifecycleAction action) async {
    final template = _template;
    if (template == null || _inFlightAction != null) {
      return;
    }
    if (!_canRunLifecycleAction(template, action)) {
      return;
    }

    final confirmed = await _confirmLifecycleAction(action, template);
    if (!mounted || !confirmed) {
      return;
    }

    setState(() {
      _inFlightAction = action;
      _actionFailure = null;
      _refreshWarning = null;
    });

    try {
      final updated = switch (action) {
        _TemplateLifecycleAction.pause => await widget.repository.pauseTemplate(
          template.id,
        ),
        _TemplateLifecycleAction.resume =>
          await widget.repository.resumeTemplate(template.id),
        _TemplateLifecycleAction.archive =>
          await widget.repository.archiveTemplate(template.id),
      };
      if (!mounted) {
        return;
      }
      setState(() {
        _template = updated;
      });
      await _refreshAfterMutation(_lifecycleSuccessMessage(action));
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
          _inFlightAction = null;
        });
      }
    }
  }

  Future<void> _refreshAfterMutation(String successMessage) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final refreshed = await widget.repository.getTemplate(widget.templateId);
      if (!mounted) {
        return;
      }
      setState(() {
        _template = refreshed;
        _actionFailure = null;
        _refreshWarning = null;
      });
      messenger.showSnackBar(SnackBar(content: Text(successMessage)));
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _refreshWarning =
            '$successMessage Server accepted the change, but the latest recurring bill state could not be refreshed.';
      });
    }
  }

  Future<bool> _confirmLifecycleAction(
    _TemplateLifecycleAction action,
    SettleoraRecurringBillTemplateDetail template,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${_lifecycleVerb(action)} recurring bill?'),
        content: Text(
          '${_lifecycleConfirmationCopy(action)} The server will re-check authorization and template state before applying this change.',
        ),
        actions: [
          TextButton(
            key: const Key('recurring-bill-lifecycle-cancel'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: Key('recurring-bill-${action.key}-confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(_lifecycleVerb(action)),
          ),
        ],
      ),
    );

    return confirmed ?? false;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Recurring bill'),
        actions: [
          if (_template != null &&
              _template!.status !=
                  SettleoraRecurringBillTemplateStatusValues.archived)
            IconButton(
              key: const Key('recurring-bill-detail-edit'),
              tooltip: 'Edit recurring bill',
              onPressed: _isLoading || _inFlightAction != null
                  ? null
                  : _openEditTemplate,
              icon: const Icon(Icons.edit_outlined),
            ),
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
                const SizedBox(height: 16),
                _ServerAuthorityPanel(compact: true),
                if (_actionFailure != null) ...[
                  const SizedBox(height: 12),
                  _InlineFailure(failure: _actionFailure!),
                ],
                if (_refreshWarning != null) ...[
                  const SizedBox(height: 12),
                  _RefreshWarningPanel(
                    message: _refreshWarning!,
                    onRefresh: _load,
                  ),
                ],
                const SizedBox(height: 20),
                _TemplateLifecycleActions(
                  template: template,
                  inFlightAction: _inFlightAction,
                  onPause: () =>
                      _runLifecycleAction(_TemplateLifecycleAction.pause),
                  onResume: () =>
                      _runLifecycleAction(_TemplateLifecycleAction.resume),
                  onArchive: () =>
                      _runLifecycleAction(_TemplateLifecycleAction.archive),
                ),
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

class SettleoraRecurringBillTemplateFormScreen extends StatefulWidget {
  const SettleoraRecurringBillTemplateFormScreen.create({
    super.key,
    required this.repository,
  }) : template = null;

  const SettleoraRecurringBillTemplateFormScreen.edit({
    super.key,
    required this.repository,
    required this.template,
  });

  final SettleoraRecurringBillRepository repository;
  final SettleoraRecurringBillTemplateDetail? template;

  bool get isEditing => template != null;

  @override
  State<SettleoraRecurringBillTemplateFormScreen> createState() =>
      _SettleoraRecurringBillTemplateFormScreenState();
}

class _SettleoraRecurringBillTemplateFormScreenState
    extends State<SettleoraRecurringBillTemplateFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _merchantController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _groupIdController;
  late final TextEditingController _startDateController;
  late final TextEditingController _endDateController;
  late final TextEditingController _intervalController;
  late final TextEditingController _dueOffsetController;
  late final TextEditingController _currencyController;
  late final TextEditingController _itemNameController;
  late final TextEditingController _itemAmountController;
  late final TextEditingController _itemNoteController;
  String _scheduleType = SettleoraRecurringBillScheduleTypeValues.monthly;
  bool _isSaving = false;
  SettleoraRecurringBillFailure? _failure;

  @override
  void initState() {
    super.initState();
    final template = widget.template;
    final schedule = template?.schedule;
    _merchantController = TextEditingController(
      text: template?.merchantName ?? '',
    );
    _descriptionController = TextEditingController(
      text: template?.description ?? '',
    );
    _groupIdController = TextEditingController();
    _startDateController = TextEditingController(
      text: schedule?.startDate ?? '',
    );
    _endDateController = TextEditingController(text: schedule?.endDate ?? '');
    _scheduleType =
        schedule?.type ?? SettleoraRecurringBillScheduleTypeValues.monthly;
    _intervalController = TextEditingController(
      text:
          (schedule?.type ==
                      SettleoraRecurringBillScheduleTypeValues
                          .customIntervalDays
                  ? schedule?.intervalDays
                  : schedule?.intervalCount ?? 1)
              .toString(),
    );
    _dueOffsetController = TextEditingController(
      text: schedule?.dueOffsetDays?.toString() ?? '0',
    );
    _currencyController = TextEditingController(text: 'USD');
    _itemNameController = TextEditingController();
    _itemAmountController = TextEditingController();
    _itemNoteController = TextEditingController();
  }

  @override
  void dispose() {
    _merchantController.dispose();
    _descriptionController.dispose();
    _groupIdController.dispose();
    _startDateController.dispose();
    _endDateController.dispose();
    _intervalController.dispose();
    _dueOffsetController.dispose();
    _currencyController.dispose();
    _itemNameController.dispose();
    _itemAmountController.dispose();
    _itemNoteController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_isSaving) {
      return;
    }
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isSaving = true;
      _failure = null;
    });

    try {
      if (widget.isEditing) {
        await widget.repository.updateTemplate(
          templateId: widget.template!.id,
          draft: SettleoraRecurringBillUpdateDraft(
            merchantName: _merchantController.text,
            description: _descriptionController.text,
            schedule: _scheduleDraft(),
          ),
        );
      } else {
        await widget.repository.createTemplate(
          SettleoraRecurringBillCreateDraft(
            groupId: _groupIdController.text,
            merchantName: _merchantController.text,
            description: _descriptionController.text,
            schedule: _scheduleDraft(),
            currency: _currencyController.text,
            items: [
              SettleoraRecurringBillTemplatePayloadItemDraft(
                name: _itemNameController.text,
                amount: _itemAmountController.text,
                note: _itemNoteController.text,
              ),
            ],
          ),
        );
      }
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _failure = SettleoraRecurringBillFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  SettleoraRecurringBillScheduleDraft _scheduleDraft() {
    final interval = int.parse(_intervalController.text.trim());
    final dueOffset = int.tryParse(_dueOffsetController.text.trim());
    return SettleoraRecurringBillScheduleDraft(
      type: _scheduleType,
      intervalCount:
          _scheduleType ==
              SettleoraRecurringBillScheduleTypeValues.customIntervalDays
          ? null
          : interval,
      intervalDays:
          _scheduleType ==
              SettleoraRecurringBillScheduleTypeValues.customIntervalDays
          ? interval
          : null,
      startDate: _startDateController.text,
      endDate: _endDateController.text,
      dueOffsetDays: dueOffset,
    );
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.isEditing;
    return Scaffold(
      appBar: AppBar(
        title: Text(isEditing ? 'Edit recurring bill' : 'New recurring bill'),
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _ServerAuthorityPanel(compact: false),
                if (_failure != null) ...[
                  const SizedBox(height: 12),
                  _InlineFailure(failure: _failure!),
                ],
                const SizedBox(height: 18),
                _Section(
                  title: 'Template',
                  children: [
                    TextFormField(
                      key: const Key('recurring-bill-form-merchant'),
                      controller: _merchantController,
                      decoration: const InputDecoration(
                        labelText: 'Merchant or name',
                        border: OutlineInputBorder(),
                      ),
                      validator: (value) =>
                          _maxLengthValidator(value, 200, 'name'),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('recurring-bill-form-description'),
                      controller: _descriptionController,
                      minLines: 2,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'Description',
                        border: OutlineInputBorder(),
                      ),
                      validator: (value) =>
                          _maxLengthValidator(value, 1000, 'description'),
                    ),
                    if (!isEditing) ...[
                      const SizedBox(height: 12),
                      TextFormField(
                        key: const Key('recurring-bill-form-group-id'),
                        controller: _groupIdController,
                        decoration: const InputDecoration(
                          labelText: 'Group ID (optional)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 20),
                _Section(
                  title: 'Schedule',
                  children: [
                    DropdownButtonFormField<String>(
                      key: const Key('recurring-bill-form-schedule-type'),
                      initialValue: _scheduleType,
                      decoration: const InputDecoration(
                        labelText: 'Frequency',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'weekly',
                          child: Text('Weekly'),
                        ),
                        DropdownMenuItem(
                          value: 'monthly',
                          child: Text('Monthly'),
                        ),
                        DropdownMenuItem(
                          value: 'yearly',
                          child: Text('Yearly'),
                        ),
                        DropdownMenuItem(
                          value: 'custom_interval_days',
                          child: Text('Custom days'),
                        ),
                      ],
                      onChanged: _isSaving
                          ? null
                          : (value) {
                              if (value != null) {
                                setState(() => _scheduleType = value);
                              }
                            },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('recurring-bill-form-interval'),
                      controller: _intervalController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Interval',
                        border: OutlineInputBorder(),
                      ),
                      validator: _intervalValidator,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('recurring-bill-form-start-date'),
                      controller: _startDateController,
                      decoration: const InputDecoration(
                        labelText: 'Start date (YYYY-MM-DD)',
                        border: OutlineInputBorder(),
                      ),
                      validator: (value) =>
                          _isoDateValidator(value, required: true),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('recurring-bill-form-end-date'),
                      controller: _endDateController,
                      decoration: const InputDecoration(
                        labelText: 'End date (optional)',
                        border: OutlineInputBorder(),
                      ),
                      validator: (value) =>
                          _isoDateValidator(value, required: false),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('recurring-bill-form-due-offset'),
                      controller: _dueOffsetController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Due offset days',
                        border: OutlineInputBorder(),
                      ),
                      validator: _dueOffsetValidator,
                    ),
                  ],
                ),
                if (!isEditing) ...[
                  const SizedBox(height: 20),
                  _Section(
                    title: 'Bill Payload',
                    children: [
                      TextFormField(
                        key: const Key('recurring-bill-form-currency'),
                        controller: _currencyController,
                        textCapitalization: TextCapitalization.characters,
                        decoration: const InputDecoration(
                          labelText: 'Currency',
                          border: OutlineInputBorder(),
                        ),
                        validator: _currencyValidator,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        key: const Key('recurring-bill-form-item-name'),
                        controller: _itemNameController,
                        decoration: const InputDecoration(
                          labelText: 'Item name',
                          border: OutlineInputBorder(),
                        ),
                        validator: (value) =>
                            _requiredTextValidator(value, 'item name', 240),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        key: const Key('recurring-bill-form-item-amount'),
                        controller: _itemAmountController,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(
                          labelText: 'Item amount',
                          border: OutlineInputBorder(),
                        ),
                        validator: _amountValidator,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        key: const Key('recurring-bill-form-item-note'),
                        controller: _itemNoteController,
                        decoration: const InputDecoration(
                          labelText: 'Item note',
                          border: OutlineInputBorder(),
                        ),
                        validator: (value) =>
                            _maxLengthValidator(value, 1000, 'item note'),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 22),
                FilledButton.icon(
                  key: const Key('recurring-bill-form-save'),
                  onPressed: _isSaving ? null : _save,
                  icon: _isSaving
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(_isSaving ? 'Saving' : 'Save'),
                ),
              ],
            ),
          ),
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
      'This template is paused. Resume asks the server to recompute the next occurrence.',
    SettleoraRecurringBillTemplateStatusValues.archived =>
      'This template is archived. Mobile keeps it read-only and does not offer future generation.',
    _ =>
      'Mobile is showing the server-provided recurring bill state without local lifecycle changes.',
  };
}

bool _canRunLifecycleAction(
  SettleoraRecurringBillTemplateDetail template,
  _TemplateLifecycleAction action,
) {
  return switch (action) {
    _TemplateLifecycleAction.pause =>
      template.status == SettleoraRecurringBillTemplateStatusValues.active,
    _TemplateLifecycleAction.resume =>
      template.status == SettleoraRecurringBillTemplateStatusValues.paused,
    _TemplateLifecycleAction.archive =>
      template.status != SettleoraRecurringBillTemplateStatusValues.archived,
  };
}

String _lifecycleVerb(_TemplateLifecycleAction action) {
  return switch (action) {
    _TemplateLifecycleAction.pause => 'Pause',
    _TemplateLifecycleAction.resume => 'Resume',
    _TemplateLifecycleAction.archive => 'Archive',
  };
}

String _lifecycleSuccessMessage(_TemplateLifecycleAction action) {
  return switch (action) {
    _TemplateLifecycleAction.pause => 'Recurring bill paused.',
    _TemplateLifecycleAction.resume => 'Recurring bill resumed.',
    _TemplateLifecycleAction.archive => 'Recurring bill archived.',
  };
}

String _lifecycleConfirmationCopy(_TemplateLifecycleAction action) {
  return switch (action) {
    _TemplateLifecycleAction.pause =>
      'Paused templates stay readable but cannot generate new drafts.',
    _TemplateLifecycleAction.resume =>
      'Resuming asks the server to make the template active again.',
    _TemplateLifecycleAction.archive =>
      'Archiving makes the recurring bill read-only and stops future generation.',
  };
}

String _lifecycleAvailabilityCopy(
  SettleoraRecurringBillTemplateDetail template,
) {
  return switch (template.status) {
    SettleoraRecurringBillTemplateStatusValues.active =>
      'Active templates can be paused or archived after confirmation.',
    SettleoraRecurringBillTemplateStatusValues.paused =>
      'Paused templates can be resumed or archived after confirmation.',
    SettleoraRecurringBillTemplateStatusValues.archived =>
      'Archived templates are terminal in mobile.',
    _ => 'Refresh server state before changing this recurring bill lifecycle.',
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

class _ServerAuthorityPanel extends StatelessWidget {
  const _ServerAuthorityPanel({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return _StatePanel(
      icon: Icons.verified_user_outlined,
      title: 'Server checked',
      message:
          'The server validates recurrence, group membership, authorization, money, generated drafts, and audit. Mobile only submits form fields and renders returned state.',
      compact: compact,
    );
  }
}

class _RefreshWarningPanel extends StatelessWidget {
  const _RefreshWarningPanel({required this.message, required this.onRefresh});

  final String message;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outline),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(message),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              key: const Key('recurring-bill-refresh-after-mutation'),
              onPressed: onRefresh,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh server state'),
            ),
          ],
        ),
      ),
    );
  }
}

class _TemplateLifecycleActions extends StatelessWidget {
  const _TemplateLifecycleActions({
    required this.template,
    required this.inFlightAction,
    required this.onPause,
    required this.onResume,
    required this.onArchive,
  });

  final SettleoraRecurringBillTemplateDetail template;
  final _TemplateLifecycleAction? inFlightAction;
  final VoidCallback onPause;
  final VoidCallback onResume;
  final VoidCallback onArchive;

  @override
  Widget build(BuildContext context) {
    final archived =
        template.status == SettleoraRecurringBillTemplateStatusValues.archived;
    if (archived) {
      return const _StatePanel(
        icon: Icons.archive_outlined,
        title: 'Archived template',
        message:
            'Archived recurring bills are read-only in mobile and cannot be resumed or edited.',
        compact: true,
      );
    }

    final paused =
        template.status == SettleoraRecurringBillTemplateStatusValues.paused;
    return _Section(
      title: 'Lifecycle',
      children: [
        Text(_lifecycleAvailabilityCopy(template)),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          alignment: WrapAlignment.end,
          children: [
            if (!paused)
              _LifecycleButton(
                key: const Key('recurring-bill-pause'),
                action: _TemplateLifecycleAction.pause,
                inFlightAction: inFlightAction,
                label: 'Pause',
                icon: Icons.pause_circle_outline,
                onPressed: onPause,
              ),
            if (paused)
              _LifecycleButton(
                key: const Key('recurring-bill-resume'),
                action: _TemplateLifecycleAction.resume,
                inFlightAction: inFlightAction,
                label: 'Resume',
                icon: Icons.play_circle_outline,
                onPressed: onResume,
              ),
            _LifecycleButton(
              key: const Key('recurring-bill-archive'),
              action: _TemplateLifecycleAction.archive,
              inFlightAction: inFlightAction,
              label: 'Archive',
              icon: Icons.archive_outlined,
              onPressed: onArchive,
            ),
          ],
        ),
      ],
    );
  }
}

class _LifecycleButton extends StatelessWidget {
  const _LifecycleButton({
    super.key,
    required this.action,
    required this.inFlightAction,
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  final _TemplateLifecycleAction action;
  final _TemplateLifecycleAction? inFlightAction;
  final String label;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final inFlight = inFlightAction == action;
    return OutlinedButton.icon(
      onPressed: inFlightAction == null ? onPressed : null,
      icon: inFlight
          ? const SizedBox.square(
              dimension: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Icon(icon),
      label: Text(inFlight ? '$label...' : label),
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

String? _requiredTextValidator(String? value, String field, int maxLength) {
  final trimmed = value?.trim() ?? '';
  if (trimmed.isEmpty) {
    return 'Enter $field.';
  }
  if (trimmed.length > maxLength) {
    return 'Shorten $field.';
  }

  return null;
}

String? _maxLengthValidator(String? value, int maxLength, String field) {
  final trimmed = value?.trim() ?? '';
  if (trimmed.length > maxLength) {
    return 'Shorten $field.';
  }

  return null;
}

String? _intervalValidator(String? value) {
  final parsed = int.tryParse(value?.trim() ?? '');
  if (parsed == null || parsed < 1 || parsed > 3660) {
    return 'Enter an interval from 1 to 3660.';
  }

  return null;
}

String? _dueOffsetValidator(String? value) {
  final trimmed = value?.trim() ?? '';
  if (trimmed.isEmpty) {
    return null;
  }
  final parsed = int.tryParse(trimmed);
  if (parsed == null || parsed < -365 || parsed > 365) {
    return 'Enter a due offset from -365 to 365.';
  }

  return null;
}

String? _currencyValidator(String? value) {
  if (!RegExp(r'^[A-Za-z]{3}$').hasMatch(value?.trim() ?? '')) {
    return 'Enter a three-letter currency.';
  }

  return null;
}

String? _amountValidator(String? value) {
  if (!RegExp(r'^\d+(\.\d{1,4})?$').hasMatch(value?.trim() ?? '')) {
    return 'Enter an amount using digits and an optional decimal.';
  }

  return null;
}

String? _isoDateValidator(String? value, {required bool required}) {
  final trimmed = value?.trim() ?? '';
  if (trimmed.isEmpty) {
    return required ? 'Enter a date.' : null;
  }
  final parts = trimmed.split('-');
  if (parts.length != 3 ||
      parts[0].length != 4 ||
      parts[1].length != 2 ||
      parts[2].length != 2) {
    return 'Use YYYY-MM-DD.';
  }
  final year = int.tryParse(parts[0]);
  final month = int.tryParse(parts[1]);
  final day = int.tryParse(parts[2]);
  if (year == null || month == null || day == null) {
    return 'Use YYYY-MM-DD.';
  }
  final parsed = DateTime.utc(year, month, day);
  if (parsed.year != year || parsed.month != month || parsed.day != day) {
    return 'Use a real calendar date.';
  }

  return null;
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
