import 'package:flutter/material.dart';

import '../ui/settleora_components.dart';
import '../ui/settleora_theme.dart';

enum DashboardPreviewVariant {
  defaultTop,
  defaultScrolled,
  newUser,
  offline,
  reviewTop,
  reviewScrolled,
}

class DashboardPreviewScreen extends StatefulWidget {
  const DashboardPreviewScreen({
    super.key,
    this.initialVariant = DashboardPreviewVariant.defaultTop,
  });

  final DashboardPreviewVariant initialVariant;

  @override
  State<DashboardPreviewScreen> createState() => _DashboardPreviewScreenState();
}

class _DashboardPreviewScreenState extends State<DashboardPreviewScreen> {
  late DashboardPreviewVariant _variant = widget.initialVariant;

  @override
  Widget build(BuildContext context) {
    final state = DashboardPreviewState.forVariant(_variant);
    return SettleoraScreenScaffold(
      title: 'Dashboard Preview',
      padding: EdgeInsets.zero,
      bottomNavigationBar: const SettleoraBottomNav(
        selected: SettleoraNavDestination.home,
      ),
      body: Column(
        children: [
          _VariantSelector(selected: _variant, onChanged: _changeVariant),
          Expanded(
            child: DashboardScreen(
              state: state,
              initialScrollOffset: state.initialScrollOffset,
            ),
          ),
        ],
      ),
    );
  }

  void _changeVariant(DashboardPreviewVariant variant) {
    setState(() {
      _variant = variant;
    });
  }
}

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({
    super.key,
    required this.state,
    this.initialScrollOffset = 0,
  });

  final DashboardPreviewState state;
  final double initialScrollOffset;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late final ScrollController _controller;

  @override
  void initState() {
    super.initState();
    _controller = ScrollController(
      initialScrollOffset: widget.initialScrollOffset,
    );
  }

  @override
  void didUpdateWidget(DashboardScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.state.variant != widget.state.variant) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _controller.hasClients) {
          _controller.jumpTo(widget.initialScrollOffset);
        }
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final state = widget.state;
    return DecoratedBox(
      decoration: BoxDecoration(color: colors.canvas),
      child: ListView(
        key: const PageStorageKey<String>('dashboard-preview-scroll'),
        controller: _controller,
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
        children: [
          _DashboardHeader(state: state),
          const SizedBox(height: 16),
          if (state.warningBanner != null) ...[
            _WarningBanner(message: state.warningBanner!),
            const SizedBox(height: 12),
          ],
          if (state.welcomeMode) ...[
            _WelcomeCard(state: state),
            const SizedBox(height: 14),
          ],
          Row(
            children: [
              Expanded(
                child: MetricCard(
                  label: 'You owe',
                  amount: state.youOwe,
                  caption: state.youOweCaption,
                  variant: StatusChipVariant.danger,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: MetricCard(
                  label: "You're owed",
                  amount: state.youAreOwed,
                  caption: state.youAreOwedCaption,
                  variant: StatusChipVariant.success,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _QuickActions(welcomeMode: state.welcomeMode),
          const SizedBox(height: 18),
          if (state.checklist.isNotEmpty) ...[
            _Checklist(items: state.checklist),
            const SizedBox(height: 18),
          ],
          _SectionCard(
            title: 'Upcoming Bills',
            trailing: StatusChip(
              label: '${state.upcomingBills.length}',
              size: StatusChipSize.small,
            ),
            children: state.upcomingBills
                .map(
                  (item) => AmountStatusRow(
                    title: item.title,
                    subtitle: item.subtitle,
                    amount: item.amount,
                    status: item.status,
                    statusVariant: item.variant,
                    leading: item.icon,
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: 'Group Activity',
            children: state.groupActivity
                .map(
                  (item) => AmountStatusRow(
                    title: item.title,
                    subtitle: item.subtitle,
                    amount: item.amount,
                    status: item.status,
                    statusVariant: item.variant,
                    leading: item.icon,
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: 'Receipts to Review',
            trailing: state.receiptReviewCount == 0
                ? null
                : StatusChip(
                    label: '${state.receiptReviewCount}',
                    variant: StatusChipVariant.warning,
                    size: StatusChipSize.small,
                  ),
            children: state.receipts
                .map(
                  (item) => AmountStatusRow(
                    title: item.title,
                    subtitle: item.subtitle,
                    amount: item.amount,
                    status: item.status,
                    statusVariant: item.variant,
                    leading: item.icon,
                  ),
                )
                .toList(),
          ),
          if (state.approvalIssues.isNotEmpty) ...[
            const SizedBox(height: 14),
            _SectionCard(
              title: 'Approval Issues',
              children: state.approvalIssues
                  .map(
                    (item) => AmountStatusRow(
                      title: item.title,
                      subtitle: item.subtitle,
                      amount: item.amount,
                      status: item.status,
                      statusVariant: item.variant,
                      leading: item.icon,
                    ),
                  )
                  .toList(),
            ),
          ],
          const SizedBox(height: 14),
          _SettlementSuggestion(state: state),
          const SizedBox(height: 14),
          const _DashboardReadinessNotice(),
          if (state.pendingSync.isNotEmpty) ...[
            const SizedBox(height: 14),
            _SectionCard(
              title: 'Pending Sync',
              children: state.pendingSync
                  .map(
                    (item) => AmountStatusRow(
                      title: item.title,
                      subtitle: item.subtitle,
                      amount: item.amount,
                      status: item.status,
                      statusVariant: item.variant,
                      leading: item.icon,
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 14),
            const LoadingState(
              message: 'Waiting to reconnect for live updates',
            ),
          ],
        ],
      ),
    );
  }
}

class DashboardPreviewState {
  const DashboardPreviewState({
    required this.variant,
    required this.greeting,
    required this.statusLabel,
    required this.statusVariant,
    required this.statusIcon,
    required this.youOwe,
    required this.youAreOwed,
    required this.upcomingBills,
    required this.groupActivity,
    required this.receipts,
    required this.settlementTitle,
    required this.settlementSubtitle,
    required this.settlementAmount,
    required this.settlementAction,
    this.youOweCaption,
    this.youAreOwedCaption,
    this.warningBanner,
    this.welcomeMode = false,
    this.checklist = const [],
    this.pendingSync = const [],
    this.approvalIssues = const [],
    this.initialScrollOffset = 0,
  });

  factory DashboardPreviewState.forVariant(DashboardPreviewVariant variant) {
    final base = DashboardPreviewState(
      variant: variant,
      greeting: 'Good evening, Alex',
      statusLabel: 'Secure sync',
      statusVariant: StatusChipVariant.success,
      statusIcon: Icons.verified_user_outlined,
      youOwe: r'$128.40',
      youOweCaption: 'Across 3 bills',
      youAreOwed: r'$284.15',
      youAreOwedCaption: 'From 5 friends',
      upcomingBills: const [
        DashboardRowData(
          title: 'Rent split',
          subtitle: 'Home - due tomorrow',
          amount: r'$92.50',
          status: 'Due',
          variant: StatusChipVariant.warning,
          icon: Icons.home_work_outlined,
        ),
        DashboardRowData(
          title: 'Market run',
          subtitle: 'Dinner Club - today',
          amount: r'$35.90',
          status: 'Open',
          variant: StatusChipVariant.info,
          icon: Icons.shopping_bag_outlined,
        ),
      ],
      groupActivity: const [
        DashboardRowData(
          title: 'Dinner Club',
          subtitle: 'Mina added 4 receipt items',
          amount: r'$74.20',
          status: 'Updated',
          variant: StatusChipVariant.info,
          icon: Icons.groups_outlined,
        ),
        DashboardRowData(
          title: 'Tokyo Trip',
          subtitle: 'Sam accepted their share',
          amount: r'$118.00',
          status: 'Accepted',
          variant: StatusChipVariant.success,
          icon: Icons.flight_takeoff_outlined,
        ),
      ],
      receipts: const [
        DashboardRowData(
          title: 'Cafe receipt',
          subtitle: '2 uncertain lines',
          amount: r'$18.60',
          status: 'Review',
          variant: StatusChipVariant.warning,
          icon: Icons.receipt_long_outlined,
        ),
      ],
      settlementTitle: 'Suggested settlement',
      settlementSubtitle: 'Pay Jordan to clear two outstanding lines.',
      settlementAmount: r'$64.25',
      settlementAction: 'Review',
    );

    return switch (variant) {
      DashboardPreviewVariant.defaultTop => base,
      DashboardPreviewVariant.defaultScrolled => base.copyWith(
        initialScrollOffset: 360,
      ),
      DashboardPreviewVariant.newUser => base.copyWith(
        greeting: 'Welcome, Alex',
        statusLabel: 'Setup ready',
        statusVariant: StatusChipVariant.info,
        statusIcon: Icons.lock_outline,
        youOwe: r'$0.00',
        youOweCaption: 'No shared bills yet',
        youAreOwed: r'$0.00',
        youAreOwedCaption: 'Start with a group',
        welcomeMode: true,
        checklist: const [
          ChecklistItem('Create your first group', false),
          ChecklistItem('Scan your first receipt', false),
          ChecklistItem('Enable sync encryption', true),
        ],
        upcomingBills: const [],
        groupActivity: const [],
        receipts: const [],
        settlementTitle: 'No settlements yet',
        settlementSubtitle:
            'Settlement suggestions appear after shared bills are accepted.',
        settlementAmount: r'$0.00',
        settlementAction: 'Start',
      ),
      DashboardPreviewVariant.offline => base.copyWith(
        statusLabel: 'Offline',
        statusVariant: StatusChipVariant.warning,
        statusIcon: Icons.cloud_off_outlined,
        warningBanner:
            'Working offline. Cached balances are shown until sync resumes.',
        youOweCaption: 'Cached 8 min ago',
        youAreOwedCaption: 'Cached 8 min ago',
        pendingSync: const [
          DashboardRowData(
            title: 'Receipt edits',
            subtitle: 'Cafe receipt waiting to upload',
            amount: '2 items',
            status: 'Queued',
            variant: StatusChipVariant.warning,
            icon: Icons.sync_outlined,
          ),
          DashboardRowData(
            title: 'Bill archive',
            subtitle: 'Market run pending server sync',
            amount: '1 task',
            status: 'Queued',
            variant: StatusChipVariant.warning,
            icon: Icons.inventory_2_outlined,
          ),
        ],
      ),
      DashboardPreviewVariant.reviewTop => base.copyWith(
        statusLabel: 'Action needed',
        statusVariant: StatusChipVariant.warning,
        statusIcon: Icons.priority_high_rounded,
        warningBanner:
            'Receipts need review before affected bills can be finalized.',
        receipts: const [
          DashboardRowData(
            title: 'Sushi receipt',
            subtitle: 'Tax group mismatch',
            amount: r'$86.70',
            status: 'Review',
            variant: StatusChipVariant.warning,
            icon: Icons.receipt_long_outlined,
          ),
          DashboardRowData(
            title: 'Pharmacy receipt',
            subtitle: 'One unknown discount line',
            amount: r'$22.15',
            status: 'Issue',
            variant: StatusChipVariant.danger,
            icon: Icons.receipt_long_outlined,
          ),
        ],
        approvalIssues: const [
          DashboardRowData(
            title: 'Dinner Club approval',
            subtitle: 'Mina needs to confirm payer change',
            amount: r'$14.80',
            status: 'Blocked',
            variant: StatusChipVariant.danger,
            icon: Icons.rule_folder_outlined,
          ),
        ],
      ),
      DashboardPreviewVariant.reviewScrolled => base.copyWith(
        statusLabel: 'Action needed',
        statusVariant: StatusChipVariant.warning,
        statusIcon: Icons.priority_high_rounded,
        warningBanner:
            'Receipts need review before affected bills can be finalized.',
        initialScrollOffset: 420,
        receipts: const [
          DashboardRowData(
            title: 'Sushi receipt',
            subtitle: 'Tax group mismatch',
            amount: r'$86.70',
            status: 'Review',
            variant: StatusChipVariant.warning,
            icon: Icons.receipt_long_outlined,
          ),
          DashboardRowData(
            title: 'Pharmacy receipt',
            subtitle: 'One unknown discount line',
            amount: r'$22.15',
            status: 'Issue',
            variant: StatusChipVariant.danger,
            icon: Icons.receipt_long_outlined,
          ),
        ],
        approvalIssues: const [
          DashboardRowData(
            title: 'Dinner Club approval',
            subtitle: 'Mina needs to confirm payer change',
            amount: r'$14.80',
            status: 'Blocked',
            variant: StatusChipVariant.danger,
            icon: Icons.rule_folder_outlined,
          ),
        ],
      ),
    };
  }

  final DashboardPreviewVariant variant;
  final String greeting;
  final String statusLabel;
  final StatusChipVariant statusVariant;
  final IconData statusIcon;
  final String youOwe;
  final String youAreOwed;
  final String? youOweCaption;
  final String? youAreOwedCaption;
  final String? warningBanner;
  final bool welcomeMode;
  final List<ChecklistItem> checklist;
  final List<DashboardRowData> upcomingBills;
  final List<DashboardRowData> groupActivity;
  final List<DashboardRowData> receipts;
  final List<DashboardRowData> pendingSync;
  final List<DashboardRowData> approvalIssues;
  final String settlementTitle;
  final String settlementSubtitle;
  final String settlementAmount;
  final String settlementAction;
  final double initialScrollOffset;

  int get receiptReviewCount => receipts.length;

  DashboardPreviewState copyWith({
    String? greeting,
    String? statusLabel,
    StatusChipVariant? statusVariant,
    IconData? statusIcon,
    String? youOwe,
    String? youAreOwed,
    String? youOweCaption,
    String? youAreOwedCaption,
    String? warningBanner,
    bool? welcomeMode,
    List<ChecklistItem>? checklist,
    List<DashboardRowData>? upcomingBills,
    List<DashboardRowData>? groupActivity,
    List<DashboardRowData>? receipts,
    List<DashboardRowData>? pendingSync,
    List<DashboardRowData>? approvalIssues,
    String? settlementTitle,
    String? settlementSubtitle,
    String? settlementAmount,
    String? settlementAction,
    double? initialScrollOffset,
  }) {
    return DashboardPreviewState(
      variant: variant,
      greeting: greeting ?? this.greeting,
      statusLabel: statusLabel ?? this.statusLabel,
      statusVariant: statusVariant ?? this.statusVariant,
      statusIcon: statusIcon ?? this.statusIcon,
      youOwe: youOwe ?? this.youOwe,
      youAreOwed: youAreOwed ?? this.youAreOwed,
      youOweCaption: youOweCaption ?? this.youOweCaption,
      youAreOwedCaption: youAreOwedCaption ?? this.youAreOwedCaption,
      warningBanner: warningBanner ?? this.warningBanner,
      welcomeMode: welcomeMode ?? this.welcomeMode,
      checklist: checklist ?? this.checklist,
      upcomingBills: upcomingBills ?? this.upcomingBills,
      groupActivity: groupActivity ?? this.groupActivity,
      receipts: receipts ?? this.receipts,
      pendingSync: pendingSync ?? this.pendingSync,
      approvalIssues: approvalIssues ?? this.approvalIssues,
      settlementTitle: settlementTitle ?? this.settlementTitle,
      settlementSubtitle: settlementSubtitle ?? this.settlementSubtitle,
      settlementAmount: settlementAmount ?? this.settlementAmount,
      settlementAction: settlementAction ?? this.settlementAction,
      initialScrollOffset: initialScrollOffset ?? this.initialScrollOffset,
    );
  }
}

class DashboardRowData {
  const DashboardRowData({
    required this.title,
    required this.subtitle,
    required this.amount,
    required this.status,
    required this.variant,
    required this.icon,
  });

  final String title;
  final String subtitle;
  final String amount;
  final String status;
  final StatusChipVariant variant;
  final IconData icon;
}

class ChecklistItem {
  const ChecklistItem(this.label, this.complete);

  final String label;
  final bool complete;
}

class _VariantSelector extends StatelessWidget {
  const _VariantSelector({required this.selected, required this.onChanged});

  final DashboardPreviewVariant selected;
  final ValueChanged<DashboardPreviewVariant> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(bottom: BorderSide(color: colors.border)),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
        child: Row(
          children: DashboardPreviewVariant.values.map((variant) {
            final active = selected == variant;
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(_variantLabel(variant)),
                selected: active,
                onSelected: (_) => onChanged(variant),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  String _variantLabel(DashboardPreviewVariant variant) {
    return switch (variant) {
      DashboardPreviewVariant.defaultTop => 'Default',
      DashboardPreviewVariant.defaultScrolled => 'Default scrolled',
      DashboardPreviewVariant.newUser => 'New user',
      DashboardPreviewVariant.offline => 'Offline',
      DashboardPreviewVariant.reviewTop => 'Review',
      DashboardPreviewVariant.reviewScrolled => 'Review scrolled',
    };
  }
}

class _DashboardHeader extends StatelessWidget {
  const _DashboardHeader({required this.state});

  final DashboardPreviewState state;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                state.greeting,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 3),
              Text('Dashboard', style: TextStyle(color: colors.textMuted)),
            ],
          ),
        ),
        StatusChip(
          label: state.statusLabel,
          icon: state.statusIcon,
          variant: state.statusVariant,
        ),
      ],
    );
  }
}

class _WarningBanner extends StatelessWidget {
  const _WarningBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    return AppCard(
      color: colors.warningSoft,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, color: colors.onWarningSoft),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: colors.onWarningSoft,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WelcomeCard extends StatelessWidget {
  const _WelcomeCard({required this.state});

  final DashboardPreviewState state;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    return AppCard(
      color: colors.primary,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Your shared-money dashboard preview is ready',
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(color: colors.onPrimary),
          ),
          const SizedBox(height: 6),
          Text(
            'Create a group or scan a receipt to start route-based review. Full group workspace dashboards and saved layouts are future work.',
            style: TextStyle(color: colors.onPrimary.withValues(alpha: 0.82)),
          ),
        ],
      ),
    );
  }
}

class _DashboardReadinessNotice extends StatelessWidget {
  const _DashboardReadinessNotice();

  @override
  Widget build(BuildContext context) {
    return const _SectionCard(
      title: 'Dashboard Readiness',
      children: [
        Text(
          'Cards are presentation hints only. Visibility here is not authorization, financial truth, sync acceptance, or full offline cache hydration.',
        ),
        SizedBox(height: 8),
        Text(
          'Group bills, settlements, recurring bills, reports, notifications, and receipt review refresh their details before actions are submitted.',
        ),
        SizedBox(height: 8),
        Text(
          'Unsupported: group dashboard personalization persistence, saved layouts, saved dashboard profiles, per-group defaults, and saved cross-surface search/filter views.',
        ),
      ],
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.welcomeMode});

  final bool welcomeMode;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: AppButton(
            label: welcomeMode ? 'New Group' : 'Add Bill',
            icon: welcomeMode ? Icons.group_add_outlined : Icons.add,
            onPressed: () {},
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: AppButton(
            label: 'Scan Receipt',
            icon: Icons.document_scanner_outlined,
            variant: AppButtonVariant.soft,
            onPressed: () {},
          ),
        ),
      ],
    );
  }
}

class _Checklist extends StatelessWidget {
  const _Checklist({required this.items});

  final List<ChecklistItem> items;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      title: 'Get Started',
      children: items.map((item) {
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              Icon(
                item.complete
                    ? Icons.check_circle
                    : Icons.radio_button_unchecked,
                color: item.complete
                    ? context.settleoraColors.onSuccessSoft
                    : context.settleoraColors.textSubtle,
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(item.label)),
            ],
          ),
        );
      }).toList(),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.children,
    this.trailing,
  });

  final String title;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
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
          const SizedBox(height: 8),
          if (children.isEmpty)
            EmptyState(
              icon: Icons.inbox_outlined,
              title: 'Nothing here yet',
              message: 'New activity will appear here.',
            )
          else
            ...children,
        ],
      ),
    );
  }
}

class _SettlementSuggestion extends StatelessWidget {
  const _SettlementSuggestion({required this.state});

  final DashboardPreviewState state;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    return AppCard(
      color: colors.infoSoft,
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: colors.surface,
            foregroundColor: colors.onInfoSoft,
            child: const Icon(Icons.handshake_outlined),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  state.settlementTitle,
                  style: Theme.of(
                    context,
                  ).textTheme.titleMedium?.copyWith(color: colors.onInfoSoft),
                ),
                const SizedBox(height: 4),
                Text(
                  state.settlementSubtitle,
                  style: TextStyle(color: colors.onInfoSoft),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                state.settlementAmount,
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(color: colors.onInfoSoft),
              ),
              const SizedBox(height: 6),
              StatusChip(
                label: state.settlementAction,
                variant: StatusChipVariant.info,
                size: StatusChipSize.small,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
