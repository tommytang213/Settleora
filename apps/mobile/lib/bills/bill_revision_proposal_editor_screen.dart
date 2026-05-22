import 'package:flutter/material.dart';

import 'bill_revision_repository.dart';

enum SettleoraBillRevisionProposalEditorMode { create, revise }

class SettleoraBillRevisionProposalEditorScreen extends StatefulWidget {
  SettleoraBillRevisionProposalEditorScreen.revise({
    super.key,
    required this.repository,
    required SettleoraBillRevision revision,
    required this.billLabel,
  }) : mode = SettleoraBillRevisionProposalEditorMode.revise,
       billId = revision.billId,
       revisionId = revision.id,
       initialProposal = null,
       initialRevision = revision,
       onCreate = null;

  const SettleoraBillRevisionProposalEditorScreen.create({
    super.key,
    required this.repository,
    required this.billId,
    required this.billLabel,
    required this.initialProposal,
    this.onCreate,
  }) : mode = SettleoraBillRevisionProposalEditorMode.create,
       revisionId = null,
       initialRevision = null;

  final SettleoraBillRevisionRepository repository;
  final SettleoraBillRevisionProposalEditorMode mode;
  final String billId;
  final String? revisionId;
  final String billLabel;
  final SettleoraBillRevision? initialRevision;
  final SettleoraBillRevisionProposalSnapshot? initialProposal;
  final Future<SettleoraBillRevision> Function(
    SettleoraBillRevisionProposalSnapshot proposal,
  )?
  onCreate;

  @override
  State<SettleoraBillRevisionProposalEditorScreen> createState() =>
      _SettleoraBillRevisionProposalEditorScreenState();
}

class _SettleoraBillRevisionProposalEditorScreenState
    extends State<SettleoraBillRevisionProposalEditorScreen> {
  late final TextEditingController _totalAmountController;
  late final TextEditingController _totalCurrencyController;
  late final List<_ParticipantEditorRow> _participants;
  late final List<_PayerEditorRow> _payers;

  bool _isSaving = false;
  String? _validationMessage;
  SettleoraBillRevisionFailure? _failure;

  @override
  void initState() {
    super.initState();
    final proposal = _initialProposal();
    _totalAmountController = TextEditingController(text: proposal.totalAmount);
    _totalCurrencyController = TextEditingController(
      text: proposal.totalCurrency,
    );
    _participants = proposal.participants
        .map(
          (row) => _ParticipantEditorRow(
            userProfileId: row.userProfileId,
            amountController: TextEditingController(
              text: row.resolvedShareAmount,
            ),
            currencyController: TextEditingController(
              text: row.resolvedShareCurrency,
            ),
          ),
        )
        .toList(growable: false);
    _payers = proposal.payers
        .map(
          (row) => _PayerEditorRow(
            userProfileId: row.userProfileId,
            amountController: TextEditingController(text: row.amount),
            currencyController: TextEditingController(text: row.currency),
          ),
        )
        .toList(growable: false);
  }

  @override
  void dispose() {
    _totalAmountController.dispose();
    _totalCurrencyController.dispose();
    for (final participant in _participants) {
      participant.dispose();
    }
    for (final payer in _payers) {
      payer.dispose();
    }
    super.dispose();
  }

  SettleoraBillRevisionProposalSnapshot _initialProposal() {
    final revision = widget.initialRevision;
    if (revision != null) {
      return SettleoraBillRevisionProposalSnapshot(
        totalAmount: revision.totalAmount,
        totalCurrency: revision.totalCurrency,
        participants: revision.participants
            .map(
              (participant) => SettleoraBillRevisionProposalParticipantRow(
                userProfileId: participant.userProfileId,
                resolvedShareAmount: participant.resolvedShareAmount,
                resolvedShareCurrency: participant.resolvedShareCurrency,
              ),
            )
            .toList(growable: false),
        payers: revision.payers
            .map(
              (payer) => SettleoraBillRevisionProposalPayerRow(
                userProfileId: payer.userProfileId,
                amount: payer.amount,
                currency: payer.currency,
              ),
            )
            .toList(growable: false),
      );
    }

    final proposal = widget.initialProposal;
    if (proposal != null) {
      return proposal;
    }

    return const SettleoraBillRevisionProposalSnapshot(
      totalAmount: '',
      totalCurrency: '',
      participants: [],
      payers: [],
    );
  }

  Future<void> _save() async {
    if (_isSaving) {
      return;
    }

    final proposal = _buildProposal();
    if (proposal == null) {
      return;
    }

    setState(() {
      _isSaving = true;
      _failure = null;
    });

    try {
      final saved = switch (widget.mode) {
        SettleoraBillRevisionProposalEditorMode.create =>
          await _createWithFreshCapability(proposal),
        SettleoraBillRevisionProposalEditorMode.revise =>
          await _reviseWithFreshCapability(proposal),
      };

      if (!mounted) {
        return;
      }

      Navigator.of(context).pop(saved);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _failure = SettleoraBillRevisionFailure.from(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  Future<SettleoraBillRevision> _createWithFreshCapability(
    SettleoraBillRevisionProposalSnapshot proposal,
  ) {
    final onCreate = widget.onCreate;
    if (onCreate != null) {
      return onCreate(proposal);
    }

    return widget.repository.createBillRevision(widget.billId, proposal);
  }

  Future<SettleoraBillRevision> _reviseWithFreshCapability(
    SettleoraBillRevisionProposalSnapshot proposal,
  ) async {
    final revisionId = widget.revisionId;
    if (revisionId == null || revisionId.trim().isEmpty) {
      throw const SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.validation,
        message: 'Choose a revision before revising this proposal.',
      );
    }

    final fresh = await widget.repository.getBillRevision(
      widget.billId,
      revisionId,
    );
    if (!fresh.canRevise) {
      throw const SettleoraBillRevisionFailure(
        kind: SettleoraBillRevisionFailureKind.conflict,
        message:
            'This proposal can no longer be revised. Review the refreshed revision before trying again.',
      );
    }

    return widget.repository.reviseBillRevision(
      fresh.billId,
      fresh.id,
      proposal,
    );
  }

  SettleoraBillRevisionProposalSnapshot? _buildProposal() {
    final totalAmount = _totalAmountController.text.trim();
    final totalCurrency = _totalCurrencyController.text.trim();
    final participantRows = <SettleoraBillRevisionProposalParticipantRow>[];
    final payerRows = <SettleoraBillRevisionProposalPayerRow>[];

    if (totalAmount.isEmpty) {
      return _setValidation('Enter a proposal total amount before saving.');
    }
    if (totalCurrency.isEmpty) {
      return _setValidation('Choose a proposal total currency before saving.');
    }
    if (_participants.isEmpty) {
      return _setValidation(
        'At least one participant share is required before saving.',
      );
    }
    if (_payers.isEmpty) {
      return _setValidation(
        'At least one payer contribution is required before saving.',
      );
    }

    for (var index = 0; index < _participants.length; index += 1) {
      final row = _participants[index];
      final amount = row.amountController.text.trim();
      final currency = row.currencyController.text.trim();
      if (amount.isEmpty || currency.isEmpty) {
        return _setValidation(
          'Enter amount and currency for participant ${index + 1}.',
        );
      }
      participantRows.add(
        SettleoraBillRevisionProposalParticipantRow(
          userProfileId: row.userProfileId,
          resolvedShareAmount: amount,
          resolvedShareCurrency: currency,
        ),
      );
    }

    for (var index = 0; index < _payers.length; index += 1) {
      final row = _payers[index];
      final amount = row.amountController.text.trim();
      final currency = row.currencyController.text.trim();
      if (amount.isEmpty || currency.isEmpty) {
        return _setValidation(
          'Enter amount and currency for payer ${index + 1}.',
        );
      }
      payerRows.add(
        SettleoraBillRevisionProposalPayerRow(
          userProfileId: row.userProfileId,
          amount: amount,
          currency: currency,
        ),
      );
    }

    setState(() {
      _validationMessage = null;
    });

    return SettleoraBillRevisionProposalSnapshot(
      totalAmount: totalAmount,
      totalCurrency: totalCurrency,
      participants: participantRows,
      payers: payerRows,
    );
  }

  SettleoraBillRevisionProposalSnapshot? _setValidation(String message) {
    setState(() {
      _validationMessage = message;
      _failure = null;
    });
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.mode == SettleoraBillRevisionProposalEditorMode.revise
        ? 'Revise proposal'
        : 'Create proposal';

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [
          TextButton.icon(
            key: const Key('bill-revision-proposal-save'),
            onPressed: _isSaving ? null : _save,
            icon: _isSaving
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: const Text('Save'),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            if (_isSaving) ...[
              const LinearProgressIndicator(),
              const SizedBox(height: 12),
            ],
            if (_validationMessage != null) ...[
              _InlineValidationMessage(message: _validationMessage!),
              const SizedBox(height: 12),
            ],
            if (_failure != null) ...[
              _InlineFailure(failure: _failure!),
              const SizedBox(height: 12),
            ],
            _EditorSummaryPanel(billLabel: widget.billLabel, mode: widget.mode),
            const SizedBox(height: 14),
            _Section(
              title: 'Proposal total',
              icon: Icons.payments_outlined,
              children: [
                TextField(
                  key: const Key('proposal-total-amount'),
                  controller: _totalAmountController,
                  enabled: !_isSaving,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Total amount',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  key: const Key('proposal-total-currency'),
                  controller: _totalCurrencyController,
                  enabled: !_isSaving,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                    labelText: 'Total currency',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _Section(
              title: 'Participant shares',
              icon: Icons.group_outlined,
              children: [
                for (var index = 0; index < _participants.length; index += 1)
                  _ParticipantRowEditor(
                    index: index,
                    row: _participants[index],
                    enabled: !_isSaving,
                  ),
              ],
            ),
            const SizedBox(height: 14),
            _Section(
              title: 'Payer contributions',
              icon: Icons.account_balance_wallet_outlined,
              children: [
                for (var index = 0; index < _payers.length; index += 1)
                  _PayerRowEditor(
                    index: index,
                    row: _payers[index],
                    enabled: !_isSaving,
                  ),
              ],
            ),
            const SizedBox(height: 14),
            const _LocalPreviewPanel(),
            const SizedBox(height: 14),
            const _UnsupportedDetailsPanel(),
          ],
        ),
      ),
    );
  }
}

class _ParticipantEditorRow {
  const _ParticipantEditorRow({
    required this.userProfileId,
    required this.amountController,
    required this.currencyController,
  });

  final String userProfileId;
  final TextEditingController amountController;
  final TextEditingController currencyController;

  void dispose() {
    amountController.dispose();
    currencyController.dispose();
  }
}

class _PayerEditorRow {
  const _PayerEditorRow({
    required this.userProfileId,
    required this.amountController,
    required this.currencyController,
  });

  final String userProfileId;
  final TextEditingController amountController;
  final TextEditingController currencyController;

  void dispose() {
    amountController.dispose();
    currencyController.dispose();
  }
}

class _EditorSummaryPanel extends StatelessWidget {
  const _EditorSummaryPanel({required this.billLabel, required this.mode});

  final String billLabel;
  final SettleoraBillRevisionProposalEditorMode mode;

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: 'Proposal editor',
      icon: Icons.edit_note_outlined,
      children: [
        _KeyValueText(label: 'Bill', value: billLabel),
        _KeyValueText(
          label: 'Mode',
          value: mode == SettleoraBillRevisionProposalEditorMode.revise
              ? 'Revise existing proposal'
              : 'Create draft proposal',
        ),
        const SizedBox(height: 6),
        const Text(
          'Settleora will validate final totals, participant shares, payer contributions, permissions, and current bill state on the server.',
        ),
        if (mode == SettleoraBillRevisionProposalEditorMode.revise) ...[
          const SizedBox(height: 8),
          const Text(
            'Saving a replacement supersedes this proposal. Previous approvals on this proposal do not carry over.',
          ),
        ],
      ],
    );
  }
}

class _ParticipantRowEditor extends StatelessWidget {
  const _ParticipantRowEditor({
    required this.index,
    required this.row,
    required this.enabled,
  });

  final int index;
  final _ParticipantEditorRow row;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return _MoneyRowEditor(
      title: 'Participant ${index + 1}',
      profileId: row.userProfileId,
      amountKey: ValueKey('proposal-participant-$index-amount'),
      currencyKey: ValueKey('proposal-participant-$index-currency'),
      amountController: row.amountController,
      currencyController: row.currencyController,
      amountLabel: 'Share amount',
      currencyLabel: 'Share currency',
      enabled: enabled,
    );
  }
}

class _PayerRowEditor extends StatelessWidget {
  const _PayerRowEditor({
    required this.index,
    required this.row,
    required this.enabled,
  });

  final int index;
  final _PayerEditorRow row;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return _MoneyRowEditor(
      title: 'Payer ${index + 1}',
      profileId: row.userProfileId,
      amountKey: ValueKey('proposal-payer-$index-amount'),
      currencyKey: ValueKey('proposal-payer-$index-currency'),
      amountController: row.amountController,
      currencyController: row.currencyController,
      amountLabel: 'Contribution amount',
      currencyLabel: 'Contribution currency',
      enabled: enabled,
    );
  }
}

class _MoneyRowEditor extends StatelessWidget {
  const _MoneyRowEditor({
    required this.title,
    required this.profileId,
    required this.amountKey,
    required this.currencyKey,
    required this.amountController,
    required this.currencyController,
    required this.amountLabel,
    required this.currencyLabel,
    required this.enabled,
  });

  final String title;
  final String profileId;
  final Key amountKey;
  final Key currencyKey;
  final TextEditingController amountController;
  final TextEditingController currencyController;
  final String amountLabel;
  final String currencyLabel;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 4),
              Text('Profile ${_shortId(profileId)}'),
              const SizedBox(height: 10),
              TextField(
                key: amountKey,
                controller: amountController,
                enabled: enabled,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(
                  labelText: amountLabel,
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                key: currencyKey,
                controller: currencyController,
                enabled: enabled,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(
                  labelText: currencyLabel,
                  border: const OutlineInputBorder(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LocalPreviewPanel extends StatelessWidget {
  const _LocalPreviewPanel();

  @override
  Widget build(BuildContext context) {
    return const _Section(
      title: 'Local preview',
      icon: Icons.visibility_outlined,
      children: [
        Text(
          'This is a local pre-submit preview, not authoritative bill truth. The server response and review context remain the source of truth after save.',
        ),
      ],
    );
  }
}

class _UnsupportedDetailsPanel extends StatelessWidget {
  const _UnsupportedDetailsPanel();

  @override
  Widget build(BuildContext context) {
    const unsupported = [
      'Item-level edits',
      'Item split edits',
      'Adjustments',
      'Attachments',
      'Receipt or OCR review',
      'Notes or metadata detail diffs',
    ];

    return _Section(
      title: 'Unsupported in this editor',
      icon: Icons.info_outline,
      children: [
        const Text(
          'The current proposal contract supports only aggregate total, participant shares, and payer contributions.',
        ),
        const SizedBox(height: 8),
        for (final item in unsupported)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.lock_outline, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text(item)),
              ],
            ),
          ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.icon,
    required this.children,
  });

  final String title;
  final IconData icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: 22),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ...children,
          ],
        ),
      ),
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
            width: 96,
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

class _InlineValidationMessage extends StatelessWidget {
  const _InlineValidationMessage({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.report_problem_outlined,
              color: Theme.of(context).colorScheme.onErrorContainer,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onErrorContainer,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InlineFailure extends StatelessWidget {
  const _InlineFailure({required this.failure});

  final SettleoraBillRevisionFailure failure;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.sync_problem_outlined,
              color: Theme.of(context).colorScheme.onErrorContainer,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    failure.title,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: Theme.of(context).colorScheme.onErrorContainer,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    failure.message,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onErrorContainer,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _shortId(String value) {
  if (value.length <= 8) {
    return value;
  }

  return value.substring(0, 8);
}
