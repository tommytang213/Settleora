import 'package:flutter/material.dart';

import '../future_bills/future_bill_repository.dart';
import '../groups/group_repository.dart';
import '../ui/settleora_form_fields.dart';
import 'recurring_bill_repository.dart';

class SettleoraRecurringBillScreen extends StatefulWidget {
  const SettleoraRecurringBillScreen({
    super.key,
    required this.repository,
    this.futureBillRepository,
    this.groupRepository,
    this.openNeedsDraftOnStart = false,
  });

  final SettleoraRecurringBillRepository repository;
  final SettleoraFutureBillRepository? futureBillRepository;
  final SettleoraGroupRepository? groupRepository;
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
  String? _futureBillCancellingId;
  List<SettleoraRecurringBillTemplateSummary> _templates = const [];
  List<SettleoraRecurringBillForecastOccurrence> _forecast = const [];
  List<SettleoraFutureBillSummary> _futureBills = const [];
  _RecurringTemplateFilter _templateFilter = _RecurringTemplateFilter.all;
  _RecurringForecastFilter _forecastFilter = _RecurringForecastFilter.all;
  String _searchQuery = '';
  SettleoraRecurringBillFailure? _failure;
  SettleoraRecurringBillFailure? _actionFailure;
  SettleoraFutureBillFailure? _futureBillFailure;
  SettleoraFutureBillFailure? _futureBillActionFailure;
  SettleoraRecurringBillDraftResult? _lastDraftResult;
  String? _draftRefreshWarning;

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
      _futureBillFailure = null;
      _futureBillActionFailure = null;
      _draftRefreshWarning = null;
    });

    try {
      final templates = await widget.repository.listTemplates(maxItems: 100);
      final forecast = await widget.repository.listForecast(limit: 30);
      final futureBillRepository = widget.futureBillRepository;
      var futureBills = const <SettleoraFutureBillSummary>[];
      SettleoraFutureBillFailure? futureBillFailure;
      if (futureBillRepository != null) {
        try {
          futureBills = await futureBillRepository.listFutureBills(
            maxItems: 100,
          );
        } catch (error) {
          futureBillFailure = SettleoraFutureBillFailure.from(error);
        }
      }
      if (!mounted) {
        return;
      }

      setState(() {
        _templates = templates;
        _forecast = forecast;
        _futureBills = futureBills;
        _futureBillFailure = futureBillFailure;
        _isLoading = false;
        _lastDraftResult = _reconciledDraftResult(_lastDraftResult, forecast);
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraRecurringBillFailure.from(error);
        _templates = const [];
        _forecast = const [];
        _futureBills = const [];
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

  Future<void> _openCreateFutureBill() async {
    final futureBillRepository = widget.futureBillRepository;
    if (futureBillRepository == null) {
      return;
    }

    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => SettleoraFutureBillFormScreen.create(
          repository: futureBillRepository,
          groupRepository: widget.groupRepository,
        ),
      ),
    );

    if (mounted && changed == true) {
      _showSnackBar('Upcoming bill saved. Refreshing server state.');
      await _load();
    }
  }

  Future<void> _openFutureBill(SettleoraFutureBillSummary futureBill) async {
    final futureBillRepository = widget.futureBillRepository;
    if (futureBillRepository == null) {
      return;
    }

    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => SettleoraFutureBillDetailScreen(
          repository: futureBillRepository,
          futureBillId: futureBill.id,
        ),
      ),
    );

    if (mounted && changed == true) {
      await _load();
    }
  }

  Future<void> _cancelFutureBill(SettleoraFutureBillSummary futureBill) async {
    final futureBillRepository = widget.futureBillRepository;
    if (futureBillRepository == null ||
        _futureBillCancellingId != null ||
        !futureBill.canCancel) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel future bill?'),
        content: const Text(
          'This archives the draft upcoming bill. It does not record it as paid or affect settlements.',
        ),
        actions: [
          TextButton(
            key: const Key('future-bill-cancel-dismiss'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep'),
          ),
          FilledButton(
            key: const Key('future-bill-cancel-confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Cancel future bill'),
          ),
        ],
      ),
    );

    if (!mounted || confirmed != true) {
      return;
    }

    setState(() {
      _futureBillCancellingId = futureBill.id;
      _futureBillActionFailure = null;
    });

    try {
      await futureBillRepository.cancelFutureBill(futureBill.id);
      if (!mounted) {
        return;
      }
      _showSnackBar('Future bill cancelled.');
      await _load();
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _futureBillActionFailure = SettleoraFutureBillFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _futureBillCancellingId = null;
        });
      }
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
        'Draft ready: ${_money(result.totalAmount, result.totalCurrency)}.',
      );
      setState(() {
        _lastDraftResult = result;
        _forecast = _forecastWithDraftResult(_forecast, result);
      });
      await _refreshAfterDraftGeneration(result);
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

  Future<void> _refreshAfterDraftGeneration(
    SettleoraRecurringBillDraftResult result,
  ) async {
    try {
      final templates = await widget.repository.listTemplates(maxItems: 100);
      final forecast = await widget.repository.listForecast(limit: 30);
      if (!mounted) {
        return;
      }

      setState(() {
        _templates = templates;
        _forecast = forecast;
        _lastDraftResult = _reconciledDraftResult(result, forecast);
        _draftRefreshWarning = null;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _lastDraftResult = result;
        _draftRefreshWarning =
            'Draft generation succeeded, but the latest recurring bill state could not be refreshed. Refresh server state to reconcile the forecast without generating another draft.';
      });
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
    final draftRefreshWarning = _draftRefreshWarning;
    final lastDraftResult = _lastDraftResult;

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
                  if (lastDraftResult != null) ...[
                    _GeneratedDraftPanel(
                      result: lastDraftResult,
                      refreshWarning: draftRefreshWarning,
                      onRefresh: _load,
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (widget.futureBillRepository != null) ...[
                    _Section(
                      title: 'Upcoming one-time bills',
                      trailing: FilledButton.icon(
                        key: const Key('future-bill-create'),
                        onPressed: _openCreateFutureBill,
                        icon: const Icon(Icons.add),
                        label: const Text('Save upcoming bill'),
                      ),
                      children: [
                        const _StatePanel(
                          icon: Icons.event_available_outlined,
                          title: 'Future bill',
                          message:
                              'This is not recorded as paid yet. This does not affect settlements until you post or confirm it later.',
                          compact: true,
                        ),
                        if (_futureBillFailure != null) ...[
                          const SizedBox(height: 10),
                          _FutureBillInlineFailure(
                            failure: _futureBillFailure!,
                          ),
                        ],
                        if (_futureBillActionFailure != null) ...[
                          const SizedBox(height: 10),
                          _FutureBillInlineFailure(
                            failure: _futureBillActionFailure!,
                          ),
                        ],
                        const SizedBox(height: 10),
                        if (_futureBills.isEmpty)
                          const _StatePanel(
                            icon: Icons.receipt_long_outlined,
                            title: 'No upcoming one-time bills',
                            message:
                                'One-time future bills visible to this account will appear here.',
                            compact: true,
                          )
                        else if (_visibleFutureBills.isEmpty)
                          const _StatePanel(
                            icon: Icons.search_off_outlined,
                            title: 'No matching one-time bills',
                            message:
                                'No loaded one-time future bills match this search. Clear search to review loaded server rows.',
                            compact: true,
                          )
                        else
                          for (
                            var index = 0;
                            index < _visibleFutureBills.length;
                            index += 1
                          )
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: _FutureBillTile(
                                futureBill: _visibleFutureBills[index],
                                cancelButtonKey: ValueKey(
                                  'future-bill-cancel-$index',
                                ),
                                isCancelling:
                                    _futureBillCancellingId ==
                                    _visibleFutureBills[index].id,
                                onTap: () =>
                                    _openFutureBill(_visibleFutureBills[index]),
                                onCancel: () => _cancelFutureBill(
                                  _visibleFutureBills[index],
                                ),
                              ),
                            ),
                      ],
                    ),
                    const SizedBox(height: 22),
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
                              'No loaded recurring templates match these local filters. Clear filters to review loaded server rows; no-match is not a server search or recurring authority result.',
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
                              'No loaded forecast occurrences match these filters. Refresh or adjust filters if you expected to see more recurring bills.',
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

  List<SettleoraFutureBillSummary> get _visibleFutureBills {
    final queryTerms = _searchTerms(_searchQuery);
    return _futureBills
        .where((futureBill) {
          if (queryTerms.isEmpty) {
            return true;
          }

          final searchText = [
            futureBill.displayName,
            futureBill.dueDate,
            futureBill.status,
            futureBill.totalAmount,
            futureBill.totalCurrency,
          ].join(' ').toLowerCase();
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
  late final List<_PayloadItemControllers> _itemControllers;
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
    _currencyController = TextEditingController(
      text: template?.billPayload?.currency ?? 'USD',
    );
    final payloadItems = template?.billPayload?.items;
    _itemControllers = payloadItems == null || payloadItems.isEmpty
        ? [_PayloadItemControllers.empty()]
        : payloadItems
              .map(_PayloadItemControllers.fromPayloadItem)
              .toList(growable: false);
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
    for (final item in _itemControllers) {
      item.dispose();
    }
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
            billPayload: _editablePayloadDraft(),
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
            items: _payloadItemDrafts(),
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

  Future<void> _pickDate(TextEditingController controller) async {
    final currentValue = _parseIsoDate(controller.text.trim());
    final now = DateTime.now();
    final initialDate = currentValue ?? DateTime(now.year, now.month, now.day);
    final selected = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (selected == null || !mounted) {
      return;
    }

    setState(() {
      controller.text = _formatIsoDate(selected);
    });
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

  SettleoraRecurringBillTemplatePayloadDraft? _editablePayloadDraft() {
    final payload = widget.template?.billPayload;
    if (payload == null) {
      return null;
    }

    return SettleoraRecurringBillTemplatePayloadDraft(
      currency: _currencyController.text,
      items: _payloadItemDrafts(),
      adjustments: payload.adjustments,
      payers: payload.payers,
    );
  }

  List<SettleoraRecurringBillTemplatePayloadItemDraft> _payloadItemDrafts() {
    return _itemControllers
        .map(
          (item) => SettleoraRecurringBillTemplatePayloadItemDraft(
            name: item.nameController.text,
            amount: item.amountController.text,
            note: item.noteController.text,
            currency: widget.isEditing ? item.currencyController.text : null,
            splits: item.splits,
          ),
        )
        .toList(growable: false);
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
                const SizedBox(height: 12),
                _RecurringTemplateFormPreviewPanel(isEditing: isEditing),
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
                      decoration: InputDecoration(
                        labelText: 'Start date (YYYY-MM-DD)',
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          key: const Key(
                            'recurring-bill-form-start-date-picker',
                          ),
                          tooltip: 'Pick start date',
                          onPressed: _isSaving
                              ? null
                              : () => _pickDate(_startDateController),
                          icon: const Icon(Icons.calendar_month_outlined),
                        ),
                      ),
                      validator: (value) =>
                          _isoDateValidator(value, required: true),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('recurring-bill-form-end-date'),
                      controller: _endDateController,
                      decoration: InputDecoration(
                        labelText: 'End date (optional)',
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          key: const Key('recurring-bill-form-end-date-picker'),
                          tooltip: 'Pick end date',
                          onPressed: _isSaving
                              ? null
                              : () => _pickDate(_endDateController),
                          icon: const Icon(Icons.event_available_outlined),
                        ),
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
                if (!isEditing || widget.template?.billPayload != null) ...[
                  const SizedBox(height: 20),
                  _Section(
                    title: 'Template Payload',
                    children: [
                      if (isEditing) ...[
                        const _EditablePayloadNotice(),
                        const SizedBox(height: 12),
                      ],
                      CurrencySelector(
                        key: const Key('recurring-bill-form-currency'),
                        value: _currencyController.text,
                        label: 'Currency',
                        validator: _currencyValidator,
                        enabled: !_isSaving,
                        semanticLabel: 'Recurring bill currency selector',
                        onChanged: (currency) {
                          setState(() {
                            _currencyController.text = currency ?? '';
                          });
                        },
                      ),
                      const SizedBox(height: 12),
                      for (
                        var index = 0;
                        index < _itemControllers.length;
                        index += 1
                      )
                        _RecurringPayloadItemFields(
                          index: index,
                          item: _itemControllers[index],
                          enabled: !_isSaving,
                          showItemCurrency: isEditing,
                        ),
                      if (isEditing) ...[
                        _PayloadUnsupportedState(
                          payload: widget.template!.billPayload!,
                        ),
                      ],
                    ],
                  ),
                ] else if (isEditing) ...[
                  const SizedBox(height: 20),
                  const _UnsupportedPayloadShapePanel(),
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

class _PayloadItemControllers {
  _PayloadItemControllers({
    required this.nameController,
    required this.amountController,
    required this.noteController,
    required this.currencyController,
    required this.splits,
  });

  factory _PayloadItemControllers.empty() {
    return _PayloadItemControllers(
      nameController: TextEditingController(),
      amountController: TextEditingController(),
      noteController: TextEditingController(),
      currencyController: TextEditingController(text: 'USD'),
      splits: const [],
    );
  }

  factory _PayloadItemControllers.fromPayloadItem(
    SettleoraRecurringBillTemplatePayloadItem item,
  ) {
    return _PayloadItemControllers(
      nameController: TextEditingController(text: item.name),
      amountController: TextEditingController(text: item.amount),
      noteController: TextEditingController(text: item.note ?? ''),
      currencyController: TextEditingController(text: item.currency),
      splits: item.splits,
    );
  }

  final TextEditingController nameController;
  final TextEditingController amountController;
  final TextEditingController noteController;
  final TextEditingController currencyController;
  final List<SettleoraRecurringBillTemplatePayloadItemSplit> splits;

  void dispose() {
    nameController.dispose();
    amountController.dispose();
    noteController.dispose();
    currencyController.dispose();
  }
}

class _RecurringPayloadItemFields extends StatelessWidget {
  const _RecurringPayloadItemFields({
    required this.index,
    required this.item,
    required this.enabled,
    required this.showItemCurrency,
  });

  final int index;
  final _PayloadItemControllers item;
  final bool enabled;
  final bool showItemCurrency;

  @override
  Widget build(BuildContext context) {
    final keySuffix = index == 0 ? '' : '-$index';
    return Padding(
      padding: EdgeInsets.only(bottom: showItemCurrency ? 16 : 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (showItemCurrency) ...[
            Text(
              'Item ${index + 1}',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 10),
          ],
          TextFormField(
            key: Key('recurring-bill-form-item-name$keySuffix'),
            controller: item.nameController,
            enabled: enabled,
            decoration: const InputDecoration(
              labelText: 'Item name',
              border: OutlineInputBorder(),
            ),
            validator: (value) =>
                _requiredTextValidator(value, 'item name', 240),
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: Key('recurring-bill-form-item-amount$keySuffix'),
            controller: item.amountController,
            enabled: enabled,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Item amount',
              border: OutlineInputBorder(),
            ),
            validator: _amountValidator,
          ),
          const SizedBox(height: 12),
          if (showItemCurrency) ...[
            CurrencySelector(
              key: Key('recurring-bill-form-item-currency$keySuffix'),
              value: item.currencyController.text,
              label: 'Item currency',
              validator: _currencyValidator,
              enabled: enabled,
              semanticLabel: 'Recurring bill item currency selector',
              onChanged: (currency) {
                item.currencyController.text = currency ?? '';
              },
            ),
            const SizedBox(height: 12),
          ],
          TextFormField(
            key: Key('recurring-bill-form-item-note$keySuffix'),
            controller: item.noteController,
            enabled: enabled,
            decoration: const InputDecoration(
              labelText: 'Item note',
              border: OutlineInputBorder(),
            ),
            validator: (value) => _maxLengthValidator(value, 1000, 'item note'),
          ),
          if (item.splits.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              '${item.splits.length} existing split ${item.splits.length == 1 ? 'row is' : 'rows are'} preserved on save. Advanced split editing is not available for this template yet.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _EditablePayloadNotice extends StatelessWidget {
  const _EditablePayloadNotice();

  @override
  Widget build(BuildContext context) {
    return const _StatePanel(
      icon: Icons.edit_note_outlined,
      title: 'Safe template payload',
      message:
          'These fields update the recurring template only. They do not edit generated bills, paid bills, settlements, forecast truth, or draft-generation history.',
      compact: true,
    );
  }
}

class _PayloadUnsupportedState extends StatelessWidget {
  const _PayloadUnsupportedState({required this.payload});

  final SettleoraRecurringBillTemplatePayload payload;

  @override
  Widget build(BuildContext context) {
    final splitCount = payload.items.fold<int>(
      0,
      (sum, item) => sum + item.splits.length,
    );
    final adjustmentCount = payload.adjustments.length;
    final payerCount = payload.payers.length;
    if (splitCount == 0 && adjustmentCount == 0 && payerCount == 0) {
      return const SizedBox.shrink();
    }

    return _StatePanel(
      icon: Icons.account_tree_outlined,
      title: 'Advanced payload preserved',
      message:
          'This template includes $splitCount split row(s), $payerCount payer row(s), and $adjustmentCount adjustment row(s). Mobile preserves those supported details on save, but advanced split, payer, and adjustment editing is not available yet.',
      compact: true,
    );
  }
}

class _UnsupportedPayloadShapePanel extends StatelessWidget {
  const _UnsupportedPayloadShapePanel();

  @override
  Widget build(BuildContext context) {
    return const _StatePanel(
      icon: Icons.lock_outline,
      title: 'Payload editing unavailable',
      message:
          'The server did not return a safe editable payload for this recurring template. Schedule and template text can still be saved without replacing unknown bill payload structure.',
      compact: true,
    );
  }
}

class SettleoraFutureBillDetailScreen extends StatefulWidget {
  const SettleoraFutureBillDetailScreen({
    super.key,
    required this.repository,
    required this.futureBillId,
  });

  final SettleoraFutureBillRepository repository;
  final String futureBillId;

  @override
  State<SettleoraFutureBillDetailScreen> createState() =>
      _SettleoraFutureBillDetailScreenState();
}

class _SettleoraFutureBillDetailScreenState
    extends State<SettleoraFutureBillDetailScreen> {
  bool _isLoading = true;
  bool _isCancelling = false;
  bool _isPosting = false;
  SettleoraFutureBillDetail? _futureBill;
  SettleoraFutureBillFailure? _failure;
  SettleoraFutureBillFailure? _actionFailure;

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
      final futureBill = await widget.repository.getFutureBill(
        widget.futureBillId,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _futureBill = futureBill;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _failure = SettleoraFutureBillFailure.from(error);
        _isLoading = false;
      });
    }
  }

  Future<void> _openEdit() async {
    final futureBill = _futureBill;
    if (futureBill == null || !futureBill.canCancel) {
      return;
    }

    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => SettleoraFutureBillFormScreen.edit(
          repository: widget.repository,
          futureBill: futureBill,
        ),
      ),
    );

    if (mounted && changed == true) {
      await _load();
    }
  }

  Future<void> _cancel() async {
    final futureBill = _futureBill;
    if (futureBill == null ||
        _isCancelling ||
        _isPosting ||
        !futureBill.canCancel) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel future bill?'),
        content: const Text(
          'This archives the draft upcoming bill. It does not record it as paid or affect settlements.',
        ),
        actions: [
          TextButton(
            key: const Key('future-bill-detail-cancel-dismiss'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep'),
          ),
          FilledButton(
            key: const Key('future-bill-detail-cancel-confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Cancel future bill'),
          ),
        ],
      ),
    );

    if (!mounted || confirmed != true) {
      return;
    }

    setState(() {
      _isCancelling = true;
      _actionFailure = null;
    });

    try {
      final updated = await widget.repository.cancelFutureBill(futureBill.id);
      if (!mounted) {
        return;
      }
      setState(() {
        _futureBill = updated;
      });
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Future bill cancelled.')));
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _actionFailure = SettleoraFutureBillFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isCancelling = false;
        });
      }
    }
  }

  Future<void> _post() async {
    final futureBill = _futureBill;
    if (futureBill == null ||
        _isPosting ||
        _isCancelling ||
        !futureBill.canPost) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Post future bill?'),
        content: const Text(
          'Posting turns this upcoming bill into the bill workflow. Personal bills may become confirmed immediately. Shared or group bills may move to pending confirmation and wait for other participants to accept. Settlement impact only becomes effective after confirmation.',
        ),
        actions: [
          TextButton(
            key: const Key('future-bill-detail-post-dismiss'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Not now'),
          ),
          FilledButton.icon(
            key: const Key('future-bill-detail-post-confirm'),
            onPressed: () => Navigator.of(context).pop(true),
            icon: const Icon(Icons.publish_outlined),
            label: const Text('Post future bill'),
          ),
        ],
      ),
    );

    if (!mounted || confirmed != true) {
      return;
    }

    setState(() {
      _isPosting = true;
      _actionFailure = null;
    });

    try {
      final updated = await widget.repository.postFutureBill(futureBill.id);
      if (!mounted) {
        return;
      }
      setState(() {
        _futureBill = updated;
      });
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(_postSuccessMessage(updated))));
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _actionFailure = SettleoraFutureBillFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isPosting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final futureBill = _futureBill;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Future bill'),
        actions: [
          if (futureBill != null && futureBill.canCancel)
            IconButton(
              key: const Key('future-bill-detail-edit'),
              tooltip: 'Edit future bill',
              onPressed: _isLoading || _isCancelling || _isPosting
                  ? null
                  : _openEdit,
              icon: const Icon(Icons.edit_outlined),
            ),
          IconButton(
            key: const Key('future-bill-detail-refresh'),
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
              return const _LoadingPanel(label: 'Loading future bill');
            }
            final failure = _failure;
            if (failure != null) {
              return _FutureBillFailurePanel(failure: failure, onRetry: _load);
            }
            if (futureBill == null) {
              return _FutureBillFailurePanel(
                failure: const SettleoraFutureBillFailure(
                  kind: SettleoraFutureBillFailureKind.unavailable,
                  message: 'The future bill is no longer available.',
                ),
                onRetry: _load,
              );
            }

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              children: [
                _FutureBillHeader(futureBill: futureBill),
                const SizedBox(height: 16),
                const _FutureBillAuthorityPanel(),
                if (_actionFailure != null) ...[
                  const SizedBox(height: 12),
                  _FutureBillInlineFailure(failure: _actionFailure!),
                ],
                const SizedBox(height: 20),
                if (futureBill.canPost) ...[
                  FilledButton.icon(
                    key: const Key('future-bill-detail-post'),
                    onPressed: _isPosting ? null : _post,
                    icon: _isPosting
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.publish_outlined),
                    label: Text(_isPosting ? 'Posting' : 'Post future bill'),
                  ),
                  const SizedBox(height: 10),
                ],
                if (futureBill.canCancel)
                  OutlinedButton.icon(
                    key: const Key('future-bill-detail-cancel'),
                    onPressed: _isCancelling || _isPosting ? null : _cancel,
                    icon: _isCancelling
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.archive_outlined),
                    label: Text(
                      _isCancelling ? 'Cancelling' : 'Cancel future bill',
                    ),
                  ),
                const SizedBox(height: 20),
                _Section(
                  title: 'Items',
                  children: [
                    if (futureBill.items.isEmpty)
                      const _StatePanel(
                        icon: Icons.receipt_long_outlined,
                        title: 'No item rows',
                        message:
                            'The server did not return item detail rows for this future bill.',
                        compact: true,
                      )
                    else
                      for (final item in futureBill.items)
                        _KeyValueText(
                          label: item.name,
                          value: _money(item.amount, item.currency),
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

String _postSuccessMessage(SettleoraFutureBillDetail futureBill) {
  if (futureBill.status == SettleoraFutureBillStatusValues.confirmed &&
      futureBill.settlementEffective) {
    return 'Future bill posted and confirmed. It is now settlement-effective.';
  }
  if (futureBill.status ==
          SettleoraFutureBillStatusValues.pendingConfirmation &&
      !futureBill.settlementEffective) {
    return 'Future bill posted and waiting for participant confirmation. It is not settlement-effective yet.';
  }

  final settlementCopy = futureBill.settlementEffective
      ? 'Settlement-effective.'
      : 'Not settlement-effective yet.';
  return 'Future bill posted. ${settleoraFutureBillStatusLabel(futureBill.status)}. $settlementCopy';
}

class SettleoraFutureBillFormScreen extends StatefulWidget {
  const SettleoraFutureBillFormScreen.create({
    super.key,
    required this.repository,
    this.groupRepository,
  }) : futureBill = null;

  const SettleoraFutureBillFormScreen.edit({
    super.key,
    required this.repository,
    required this.futureBill,
  }) : groupRepository = null;

  final SettleoraFutureBillRepository repository;
  final SettleoraGroupRepository? groupRepository;
  final SettleoraFutureBillDetail? futureBill;

  bool get isEditing => futureBill != null;

  @override
  State<SettleoraFutureBillFormScreen> createState() =>
      _SettleoraFutureBillFormScreenState();
}

class _SettleoraFutureBillFormScreenState
    extends State<SettleoraFutureBillFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _merchantController;
  late final TextEditingController _amountController;
  late final TextEditingController _noteController;
  late final TextEditingController _dueDateController;
  String _currency = 'USD';
  String _selectedGroupId = '';
  bool _isLoadingGroups = false;
  bool _isLoadingMembers = false;
  List<SettleoraGroup> _groups = const [];
  List<SettleoraGroupMember> _members = const [];
  Set<String> _selectedParticipantIds = <String>{};
  bool _isSaving = false;
  SettleoraFutureBillFailure? _failure;
  SettleoraGroupFailure? _groupFailure;

  @override
  void initState() {
    super.initState();
    final futureBill = widget.futureBill;
    _merchantController = TextEditingController(
      text: futureBill?.merchantName ?? '',
    );
    _amountController = TextEditingController(
      text: futureBill?.totalAmount ?? '',
    );
    _noteController = TextEditingController(
      text: futureBill?.items.isNotEmpty == true
          ? futureBill!.items.first.note ?? ''
          : '',
    );
    _dueDateController = TextEditingController(text: futureBill?.dueDate ?? '');
    _currency = futureBill?.totalCurrency ?? 'USD';
    if (!widget.isEditing && widget.groupRepository != null) {
      Future<void>.microtask(_loadGroups);
    }
  }

  @override
  void dispose() {
    _merchantController.dispose();
    _amountController.dispose();
    _noteController.dispose();
    _dueDateController.dispose();
    super.dispose();
  }

  Future<void> _loadGroups() async {
    final groupRepository = widget.groupRepository;
    if (groupRepository == null || widget.isEditing) {
      return;
    }

    setState(() {
      _isLoadingGroups = true;
      _groupFailure = null;
    });

    try {
      final groups = await groupRepository.listGroups();
      if (!mounted) {
        return;
      }
      setState(() {
        _groups = groups
            .where(
              (group) =>
                  group.currentUserStatus ==
                  SettleoraGroupMembershipStatusValues.active,
            )
            .toList(growable: false);
        _isLoadingGroups = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _groupFailure = SettleoraGroupFailure.from(error);
        _isLoadingGroups = false;
      });
    }
  }

  Future<void> _selectGroup(String groupId) async {
    if (_isSaving || _selectedGroupId == groupId) {
      return;
    }

    setState(() {
      _selectedGroupId = groupId;
      _members = const [];
      _selectedParticipantIds = <String>{};
      _groupFailure = null;
    });

    if (groupId.trim().isEmpty) {
      return;
    }

    await _loadMembers(groupId);
  }

  Future<void> _loadMembers(String groupId) async {
    final groupRepository = widget.groupRepository;
    if (groupRepository == null) {
      return;
    }

    setState(() {
      _isLoadingMembers = true;
      _groupFailure = null;
    });

    try {
      final members = await groupRepository.listGroupMembers(groupId);
      if (!mounted) {
        return;
      }
      final activeMembers = members
          .where(
            (member) =>
                member.status == SettleoraGroupMembershipStatusValues.active,
          )
          .toList(growable: false);
      setState(() {
        _members = activeMembers;
        _selectedParticipantIds = {
          for (final member in activeMembers) member.userProfileId,
        };
        _isLoadingMembers = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _groupFailure = SettleoraGroupFailure.from(error);
        _isLoadingMembers = false;
      });
    }
  }

  void _toggleParticipant(String userProfileId, bool selected) {
    if (_isSaving) {
      return;
    }

    setState(() {
      final next = Set<String>.of(_selectedParticipantIds);
      if (selected) {
        next.add(userProfileId);
      } else {
        next.remove(userProfileId);
      }
      _selectedParticipantIds = next;
    });
  }

  Future<void> _pickDueDate() async {
    final currentValue = _parseIsoDate(_dueDateController.text.trim());
    final now = DateTime.now();
    final initialDate =
        currentValue ?? DateTime(now.year, now.month, now.day + 1);
    final selected = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(2100),
    );
    if (selected == null || !mounted) {
      return;
    }

    setState(() {
      _dueDateController.text = _formatIsoDate(selected);
    });
  }

  Future<void> _save() async {
    if (_isSaving || !_formKey.currentState!.validate()) {
      return;
    }
    if (!widget.isEditing &&
        _selectedGroupId.trim().isNotEmpty &&
        _selectedParticipantIds.isEmpty) {
      setState(() {
        _failure = const SettleoraFutureBillFailure(
          kind: SettleoraFutureBillFailureKind.validation,
          message:
              'Choose at least one active group member for this future bill equal split.',
        );
      });
      return;
    }

    setState(() {
      _isSaving = true;
      _failure = null;
    });

    try {
      if (widget.isEditing) {
        await widget.repository.updateFutureBill(
          futureBillId: widget.futureBill!.id,
          draft: SettleoraFutureBillUpdateDraft(
            merchantName: _merchantController.text,
            dueDate: _dueDateController.text,
          ),
        );
      } else {
        await widget.repository.createFutureBill(
          SettleoraFutureBillCreateDraft(
            merchantName: _merchantController.text,
            amount: _amountController.text,
            currency: _currency,
            dueDate: _dueDateController.text,
            note: _noteController.text,
            groupId: _selectedGroupId.trim().isEmpty ? null : _selectedGroupId,
            participantUserProfileIds: _selectedParticipantIds.toList(
              growable: false,
            ),
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
        _failure = SettleoraFutureBillFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.isEditing;
    return Scaffold(
      appBar: AppBar(
        title: Text(isEditing ? 'Edit future bill' : 'New future bill'),
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _FutureBillAuthorityPanel(),
                if (!isEditing) ...[
                  const SizedBox(height: 12),
                  _FutureBillGroupAuthoringSection(
                    groups: _groups,
                    members: _members,
                    selectedGroupId: _selectedGroupId,
                    selectedParticipantIds: _selectedParticipantIds,
                    isLoadingGroups: _isLoadingGroups,
                    isLoadingMembers: _isLoadingMembers,
                    groupFailure: _groupFailure,
                    groupRepositoryAvailable: widget.groupRepository != null,
                    enabled: !_isSaving,
                    onGroupSelected: _selectGroup,
                    onParticipantToggled: _toggleParticipant,
                    onRetryGroups: _loadGroups,
                    onRetryMembers: () {
                      final groupId = _selectedGroupId.trim();
                      if (groupId.isNotEmpty) {
                        _loadMembers(groupId);
                      }
                    },
                  ),
                ],
                if (_failure != null) ...[
                  const SizedBox(height: 12),
                  _FutureBillInlineFailure(failure: _failure!),
                ],
                const SizedBox(height: 18),
                TextFormField(
                  key: const Key('future-bill-form-merchant'),
                  controller: _merchantController,
                  enabled: !_isSaving,
                  decoration: const InputDecoration(
                    labelText: 'Merchant or name',
                    border: OutlineInputBorder(),
                  ),
                  validator: (value) => _maxLengthValidator(value, 200, 'name'),
                ),
                const SizedBox(height: 12),
                if (!isEditing) ...[
                  MoneyAmountCurrencyField(
                    amountKey: const Key('future-bill-form-amount'),
                    currencyKey: const Key('future-bill-form-currency'),
                    amountController: _amountController,
                    currencyValue: _currency,
                    onCurrencyChanged: (currency) {
                      setState(() {
                        _currency = currency ?? '';
                      });
                    },
                    amountLabel: 'Amount',
                    currencyLabel: 'Currency',
                    enabled: !_isSaving,
                    amountValidator: _amountValidator,
                    currencyValidator: _currencyValidator,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    key: const Key('future-bill-form-note'),
                    controller: _noteController,
                    enabled: !_isSaving,
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      labelText: 'Note',
                      border: OutlineInputBorder(),
                    ),
                    validator: (value) =>
                        _maxLengthValidator(value, 1000, 'note'),
                  ),
                  const SizedBox(height: 12),
                ] else
                  _StatePanel(
                    icon: Icons.lock_outline,
                    title: 'Amount editing unavailable',
                    message:
                        'This future bill API currently supports name and due date updates only. Amount, currency, participants, and split changes are follow-up work.',
                    compact: true,
                  ),
                if (isEditing) const SizedBox(height: 12),
                TextFormField(
                  key: const Key('future-bill-form-due-date'),
                  controller: _dueDateController,
                  enabled: !_isSaving,
                  decoration: InputDecoration(
                    labelText: 'Due date (YYYY-MM-DD)',
                    border: const OutlineInputBorder(),
                    suffixIcon: IconButton(
                      key: const Key('future-bill-form-due-date-picker'),
                      tooltip: 'Pick due date',
                      onPressed: _isSaving ? null : _pickDueDate,
                      icon: const Icon(Icons.calendar_month_outlined),
                    ),
                  ),
                  validator: (value) =>
                      _isoDateValidator(value, required: true),
                ),
                const SizedBox(height: 22),
                FilledButton.icon(
                  key: const Key('future-bill-form-save'),
                  onPressed: _isSaving ? null : _save,
                  icon: _isSaving
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(_isSaving ? 'Saving' : 'Save upcoming bill'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FutureBillGroupAuthoringSection extends StatelessWidget {
  const _FutureBillGroupAuthoringSection({
    required this.groups,
    required this.members,
    required this.selectedGroupId,
    required this.selectedParticipantIds,
    required this.isLoadingGroups,
    required this.isLoadingMembers,
    required this.groupFailure,
    required this.groupRepositoryAvailable,
    required this.enabled,
    required this.onGroupSelected,
    required this.onParticipantToggled,
    required this.onRetryGroups,
    required this.onRetryMembers,
  });

  final List<SettleoraGroup> groups;
  final List<SettleoraGroupMember> members;
  final String selectedGroupId;
  final Set<String> selectedParticipantIds;
  final bool isLoadingGroups;
  final bool isLoadingMembers;
  final SettleoraGroupFailure? groupFailure;
  final bool groupRepositoryAvailable;
  final bool enabled;
  final ValueChanged<String> onGroupSelected;
  final void Function(String userProfileId, bool selected) onParticipantToggled;
  final VoidCallback onRetryGroups;
  final VoidCallback onRetryMembers;

  bool get _groupSelected => selectedGroupId.trim().isNotEmpty;

  @override
  Widget build(BuildContext context) {
    if (!groupRepositoryAvailable) {
      return const _StatePanel(
        icon: Icons.group_off_outlined,
        title: 'Personal one-time bill',
        message:
            'Group authoring is unavailable because this screen does not have a server-mode group source. Do not enter fake people or IDs.',
        compact: true,
      );
    }

    final failure = groupFailure;
    return _Section(
      title: 'Bill scope and split',
      children: [
        DropdownButtonFormField<String>(
          key: const Key('future-bill-form-group'),
          initialValue: selectedGroupId,
          decoration: const InputDecoration(
            labelText: 'Scope',
            border: OutlineInputBorder(),
          ),
          items: [
            const DropdownMenuItem<String>(
              value: '',
              child: Text('Personal future bill'),
            ),
            for (final group in groups)
              DropdownMenuItem<String>(
                value: group.id,
                child: Text(group.displayName),
              ),
          ],
          onChanged: enabled && !isLoadingGroups
              ? (value) => onGroupSelected(value ?? '')
              : null,
        ),
        if (isLoadingGroups) ...[
          const SizedBox(height: 10),
          const LinearProgressIndicator(),
          const SizedBox(height: 8),
          Text(
            'Loading visible groups.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
        if (failure != null) ...[
          const SizedBox(height: 10),
          _GroupAuthoringFailure(
            failure: failure,
            onRetry: _groupSelected ? onRetryMembers : onRetryGroups,
          ),
        ],
        if (!_groupSelected && !isLoadingGroups && failure == null) ...[
          const SizedBox(height: 10),
          const _StatePanel(
            icon: Icons.person_outline,
            title: 'Personal upcoming bill',
            message:
                'Save this as your own future bill, or choose a visible group to author an equal split among active members.',
            compact: true,
          ),
        ],
        if (_groupSelected) ...[
          const SizedBox(height: 12),
          const _StatePanel(
            icon: Icons.call_split_outlined,
            title: 'Equal split preview',
            message:
                'Selected active members become equal split participants in the create payload. The server validates group access, membership, money, and payer policy before saving. This is not posted or settlement-effective.',
            compact: true,
          ),
          if (isLoadingMembers) ...[
            const SizedBox(height: 10),
            const LinearProgressIndicator(),
            const SizedBox(height: 8),
            Text(
              'Loading active group members.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ] else if (members.isEmpty && failure == null) ...[
            const SizedBox(height: 10),
            const _StatePanel(
              icon: Icons.group_off_outlined,
              title: 'No active members',
              message:
                  'This group did not return active member data that can safely author a future bill split.',
              compact: true,
            ),
          ] else ...[
            const SizedBox(height: 10),
            Text(
              'Participants (${selectedParticipantIds.length} selected)',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 6),
            for (final member in members)
              CheckboxListTile(
                key: ValueKey(
                  'future-bill-form-member-${member.userProfileId}',
                ),
                value: selectedParticipantIds.contains(member.userProfileId),
                onChanged: enabled
                    ? (selected) => onParticipantToggled(
                        member.userProfileId,
                        selected ?? false,
                      )
                    : null,
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                title: Text(member.safeDisplayName),
                subtitle: Text(settleoraGroupRoleLabel(member.role)),
              ),
          ],
        ],
      ],
    );
  }
}

class _GroupAuthoringFailure extends StatelessWidget {
  const _GroupAuthoringFailure({required this.failure, required this.onRetry});

  final SettleoraGroupFailure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _StatePanel(
      icon: Icons.error_outline,
      title: failure.title,
      message: failure.message,
      compact: true,
      action: OutlinedButton.icon(
        key: const Key('future-bill-form-group-retry'),
        onPressed: onRetry,
        icon: const Icon(Icons.refresh),
        label: const Text('Retry'),
      ),
    );
  }
}

class _FutureBillTile extends StatelessWidget {
  const _FutureBillTile({
    required this.futureBill,
    required this.cancelButtonKey,
    required this.isCancelling,
    required this.onTap,
    required this.onCancel,
  });

  final SettleoraFutureBillSummary futureBill;
  final Key cancelButtonKey;
  final bool isCancelling;
  final VoidCallback onTap;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        onTap: onTap,
        leading: const CircleAvatar(child: Icon(Icons.event_available)),
        title: Text(futureBill.displayName),
        subtitle: Text(
          'Due ${futureBill.dueDate} - ${settleoraFutureBillStatusLabel(futureBill.status)} - Not paid yet',
        ),
        trailing: Wrap(
          spacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(_money(futureBill.totalAmount, futureBill.totalCurrency)),
            if (futureBill.canCancel)
              IconButton(
                key: cancelButtonKey,
                tooltip: 'Cancel future bill',
                onPressed: isCancelling ? null : onCancel,
                icon: isCancelling
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.archive_outlined),
              ),
          ],
        ),
      ),
    );
  }
}

class _FutureBillHeader extends StatelessWidget {
  const _FutureBillHeader({required this.futureBill});

  final SettleoraFutureBillDetail futureBill;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          futureBill.displayName,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 10),
        _KeyValueText(
          label: 'Amount',
          value: _money(futureBill.totalAmount, futureBill.totalCurrency),
        ),
        _KeyValueText(label: 'Due date', value: futureBill.dueDate),
        _KeyValueText(
          label: 'Status',
          value: settleoraFutureBillStatusLabel(futureBill.status),
        ),
        _KeyValueText(
          label: 'Settlements',
          value: futureBill.settlementEffective
              ? 'Settlement-effective'
              : 'Does not affect settlements',
        ),
      ],
    );
  }
}

class _FutureBillAuthorityPanel extends StatelessWidget {
  const _FutureBillAuthorityPanel();

  @override
  Widget build(BuildContext context) {
    return const _StatePanel(
      icon: Icons.upcoming_outlined,
      title: 'Upcoming obligation',
      message:
          'This is not recorded as paid yet. This does not affect settlements until the API confirms it through the bill workflow.',
      compact: true,
    );
  }
}

class _FutureBillFailurePanel extends StatelessWidget {
  const _FutureBillFailurePanel({required this.failure, required this.onRetry});

  final SettleoraFutureBillFailure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _StatePanel(
      icon: Icons.error_outline,
      title: failure.title,
      message: failure.message,
      action: OutlinedButton.icon(
        key: const Key('future-bill-retry'),
        onPressed: onRetry,
        icon: const Icon(Icons.refresh),
        label: const Text('Retry'),
      ),
    );
  }
}

class _FutureBillInlineFailure extends StatelessWidget {
  const _FutureBillInlineFailure({required this.failure});

  final SettleoraFutureBillFailure failure;

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
              Icons.error_outline,
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
                if (occurrence.generatedBillId != null)
                  const _SoftChip(
                    label: 'Draft context',
                    icon: Icons.receipt_long_outlined,
                  ),
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
                  occurrence.draftGenerated ? 'Draft Ready' : 'Generate Draft',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

List<SettleoraRecurringBillForecastOccurrence> _forecastWithDraftResult(
  List<SettleoraRecurringBillForecastOccurrence> forecast,
  SettleoraRecurringBillDraftResult result,
) {
  var replaced = false;
  final updated = forecast
      .map((occurrence) {
        final sameOccurrence =
            occurrence.templateId == result.templateId &&
            occurrence.occurrenceDate == result.occurrenceDate;
        if (!sameOccurrence) {
          return occurrence;
        }

        replaced = true;
        return SettleoraRecurringBillForecastOccurrence(
          templateId: occurrence.templateId,
          occurrenceId: result.occurrenceId,
          occurrenceDate: occurrence.occurrenceDate,
          dueDate: result.dueDate ?? occurrence.dueDate,
          status: result.occurrenceStatus,
          draftGenerated: true,
          generatedBillId: result.generatedBillId,
          forecastAmount: result.totalAmount,
          forecastCurrency: result.totalCurrency,
          merchantName: occurrence.merchantName,
          isGroupScoped: occurrence.isGroupScoped,
        );
      })
      .toList(growable: false);

  if (replaced) {
    return updated;
  }

  return forecast;
}

SettleoraRecurringBillDraftResult? _reconciledDraftResult(
  SettleoraRecurringBillDraftResult? result,
  List<SettleoraRecurringBillForecastOccurrence> forecast,
) {
  if (result == null) {
    return null;
  }

  final stillGenerated = forecast.any((occurrence) {
    return occurrence.templateId == result.templateId &&
        occurrence.occurrenceDate == result.occurrenceDate &&
        occurrence.draftGenerated &&
        occurrence.generatedBillId == result.generatedBillId;
  });

  return stillGenerated ? result : null;
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
    return 'A draft exists for this occurrence. Open it from Bills, or refresh recurring bills to reconcile the latest server state.';
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
          Text(
            'Search and filters narrow loaded template and forecast rows only. Draft generation, group access, recurrence, participants, money, and audit remain API-authoritative.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 6),
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
          'Settleora checks recurrence, group membership, access, money, generated drafts, and audit before changes are saved.',
      compact: compact,
    );
  }
}

class _RecurringTemplateFormPreviewPanel extends StatelessWidget {
  const _RecurringTemplateFormPreviewPanel({required this.isEditing});

  final bool isEditing;

  @override
  Widget build(BuildContext context) {
    return _StatePanel(
      icon: Icons.preview_outlined,
      title: isEditing ? 'Template update only' : 'Recurring template only',
      message: isEditing
          ? 'Saving updates the recurring template fields supported by the current API. Existing generated bills are not changed here.'
          : 'Saving creates a recurring template and refreshes server forecast rows. It does not generate, record, or mark any bill paid.',
      compact: true,
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

class _GeneratedDraftPanel extends StatelessWidget {
  const _GeneratedDraftPanel({
    required this.result,
    required this.refreshWarning,
    required this.onRefresh,
  });

  final SettleoraRecurringBillDraftResult result;
  final String? refreshWarning;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final warning = refreshWarning;
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
            Text(
              'Generated draft ready',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 6),
            Text(
              'The server returned a ${result.billStatus} bill for ${result.occurrenceDate}: ${_money(result.totalAmount, result.totalCurrency)}. Mobile does not recalculate the draft; refresh recurring bills to reconcile server state.',
            ),
            const SizedBox(height: 6),
            const Text(
              'Open the draft from Bills. This recurring screen does not have a safe generated-bill route in the current shell.',
            ),
            if (warning != null) ...[const SizedBox(height: 10), Text(warning)],
            const SizedBox(height: 10),
            OutlinedButton.icon(
              key: const Key('recurring-bill-refresh-after-generate'),
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
  const _Section({required this.title, required this.children, this.trailing});

  final String title;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            ?trailing,
          ],
        ),
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

DateTime? _parseIsoDate(String value) {
  if (_isoDateValidator(value, required: false) != null || value.isEmpty) {
    return null;
  }
  final parts = value.split('-');
  return DateTime(
    int.parse(parts[0]),
    int.parse(parts[1]),
    int.parse(parts[2]),
  );
}

String _formatIsoDate(DateTime value) {
  final year = value.year.toString().padLeft(4, '0');
  final month = value.month.toString().padLeft(2, '0');
  final day = value.day.toString().padLeft(2, '0');
  return '$year-$month-$day';
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
