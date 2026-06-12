import 'package:flutter/material.dart';

import 'settleora_theme.dart';

enum AppButtonVariant { primary, secondary, soft, destructive }

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.variant = AppButtonVariant.primary,
    this.expanded = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final AppButtonVariant variant;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final foreground = switch (variant) {
      AppButtonVariant.primary => colors.onPrimary,
      AppButtonVariant.secondary => colors.primary,
      AppButtonVariant.soft => colors.primary,
      AppButtonVariant.destructive => colors.onDangerSoft,
    };
    final background = switch (variant) {
      AppButtonVariant.primary => colors.primary,
      AppButtonVariant.secondary => colors.surface,
      AppButtonVariant.soft => colors.primarySoft,
      AppButtonVariant.destructive => colors.dangerSoft,
    };
    final border = variant == AppButtonVariant.secondary
        ? BorderSide(color: colors.borderStrong)
        : BorderSide.none;
    final child = icon == null
        ? Text(label)
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18),
              const SizedBox(width: 8),
              Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
            ],
          );
    final button = FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: background,
        foregroundColor: foreground,
        disabledBackgroundColor: colors.border,
        disabledForegroundColor: colors.textSubtle,
        side: border,
      ),
      child: child,
    );

    return expanded ? SizedBox(width: double.infinity, child: button) : button;
  }
}

enum StatusChipVariant { success, warning, danger, info, neutral }

enum StatusChipSize { small, regular }

class StatusChip extends StatelessWidget {
  const StatusChip({
    super.key,
    required this.label,
    this.icon,
    this.variant = StatusChipVariant.neutral,
    this.size = StatusChipSize.regular,
  });

  final String label;
  final IconData? icon;
  final StatusChipVariant variant;
  final StatusChipSize size;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final (background, foreground) = switch (variant) {
      StatusChipVariant.success => (colors.successSoft, colors.onSuccessSoft),
      StatusChipVariant.warning => (colors.warningSoft, colors.onWarningSoft),
      StatusChipVariant.danger => (colors.dangerSoft, colors.onDangerSoft),
      StatusChipVariant.info => (colors.infoSoft, colors.onInfoSoft),
      StatusChipVariant.neutral => (colors.primarySoft, colors.textMuted),
    };
    final isSmall = size == StatusChipSize.small;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: isSmall ? 8 : 10,
          vertical: isSmall ? 4 : 6,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: isSmall ? 13 : 15, color: foreground),
              const SizedBox(width: 5),
            ],
            Text(
              label,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: foreground,
                fontWeight: FontWeight.w800,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding, this.color});

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color ?? colors.surface,
        borderRadius: BorderRadius.circular(SettleoraRadius.lg),
        border: Border.all(color: colors.border),
      ),
      child: Padding(
        padding: padding ?? const EdgeInsets.all(SettleoraSpacing.md),
        child: child,
      ),
    );
  }
}

class MetricCard extends StatelessWidget {
  const MetricCard({
    super.key,
    required this.label,
    required this.amount,
    required this.variant,
    this.caption,
  });

  final String label;
  final String amount;
  final StatusChipVariant variant;
  final String? caption;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final (background, foreground) = switch (variant) {
      StatusChipVariant.success => (colors.successSoft, colors.onSuccessSoft),
      StatusChipVariant.danger => (colors.dangerSoft, colors.onDangerSoft),
      StatusChipVariant.warning => (colors.warningSoft, colors.onWarningSoft),
      StatusChipVariant.info => (colors.infoSoft, colors.onInfoSoft),
      StatusChipVariant.neutral => (colors.primarySoft, colors.textMuted),
    };
    return AppCard(
      color: background,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: foreground,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            amount,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              color: foreground,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          if (caption != null) ...[
            const SizedBox(height: 4),
            Text(caption!, style: TextStyle(color: foreground)),
          ],
        ],
      ),
    );
  }
}

class AmountStatusRow extends StatelessWidget {
  const AmountStatusRow({
    super.key,
    required this.title,
    required this.subtitle,
    required this.amount,
    required this.status,
    this.statusVariant = StatusChipVariant.neutral,
    this.leading,
  });

  final String title;
  final String subtitle;
  final String amount;
  final String status;
  final StatusChipVariant statusVariant;
  final IconData? leading;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          if (leading != null) ...[
            CircleAvatar(
              radius: 20,
              backgroundColor: colors.primarySoft,
              foregroundColor: colors.primary,
              child: Icon(leading, size: 20),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 2),
                Text(subtitle, style: TextStyle(color: colors.textSubtle)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                amount,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 4),
              StatusChip(
                label: status,
                variant: statusVariant,
                size: StatusChipSize.small,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    required this.label,
    this.controller,
    this.hintText,
    this.keyboardType,
    this.enabled = true,
  });

  final String label;
  final TextEditingController? controller;
  final String? hintText;
  final TextInputType? keyboardType;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      enabled: enabled,
      decoration: InputDecoration(labelText: label, hintText: hintText),
    );
  }
}

enum SettleoraNavDestination { home, bills, groups, settle, receipts, profile }

class SettleoraBottomNav extends StatelessWidget {
  const SettleoraBottomNav({
    super.key,
    required this.selected,
    this.onSelected,
  });

  final SettleoraNavDestination selected;
  final ValueChanged<SettleoraNavDestination>? onSelected;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    const destinations = <SettleoraNavDestination>[
      SettleoraNavDestination.home,
      SettleoraNavDestination.bills,
      SettleoraNavDestination.groups,
      SettleoraNavDestination.settle,
      SettleoraNavDestination.receipts,
      SettleoraNavDestination.profile,
    ];
    final selectedIndex = destinations.indexOf(selected);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        border: Border(top: BorderSide(color: colorScheme.outlineVariant)),
      ),
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(8, 4, 8, 6),
        child: Center(
          heightFactor: 1,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: NavigationBar(
              key: const Key('server-shell-bottom-nav'),
              height: 64,
              selectedIndex: selectedIndex < 0 ? 0 : selectedIndex,
              labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
              indicatorShape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(999),
              ),
              onDestinationSelected: onSelected == null
                  ? null
                  : (index) {
                      final destination = destinations[index];
                      if (destination == selected) {
                        return;
                      }

                      onSelected!(destination);
                    },
              destinations: const [
                NavigationDestination(
                  key: Key('bottom-nav-home'),
                  icon: Icon(Icons.home_outlined, size: 22),
                  selectedIcon: Icon(Icons.home, size: 22),
                  label: 'Home',
                ),
                NavigationDestination(
                  key: Key('bottom-nav-bills'),
                  icon: Icon(Icons.receipt_long_outlined, size: 22),
                  selectedIcon: Icon(Icons.receipt_long, size: 22),
                  label: 'Bills',
                ),
                NavigationDestination(
                  key: Key('bottom-nav-groups'),
                  icon: Icon(Icons.groups_outlined, size: 22),
                  selectedIcon: Icon(Icons.groups, size: 22),
                  label: 'Groups',
                ),
                NavigationDestination(
                  key: Key('bottom-nav-settle'),
                  icon: Icon(Icons.account_balance_wallet_outlined, size: 22),
                  selectedIcon: Icon(Icons.account_balance_wallet, size: 22),
                  label: 'Settle',
                ),
                NavigationDestination(
                  key: Key('bottom-nav-receipts'),
                  icon: Icon(Icons.document_scanner_outlined, size: 22),
                  selectedIcon: Icon(Icons.document_scanner, size: 22),
                  label: 'Receipts',
                ),
                NavigationDestination(
                  key: Key('bottom-nav-profile'),
                  icon: Icon(Icons.person_outline, size: 22),
                  selectedIcon: Icon(Icons.person, size: 22),
                  label: 'Profile',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class SettleoraScreenScaffold extends StatelessWidget {
  const SettleoraScreenScaffold({
    super.key,
    required this.body,
    this.title,
    this.actions,
    this.bottomNavigationBar,
    this.padding = const EdgeInsets.fromLTRB(16, 12, 16, 24),
  });

  final Widget body;
  final String? title;
  final List<Widget>? actions;
  final Widget? bottomNavigationBar;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: title == null
          ? null
          : AppBar(title: Text(title!), actions: actions),
      bottomNavigationBar: bottomNavigationBar,
      body: SafeArea(
        child: Padding(padding: padding, child: body),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    return AppCard(
      child: Column(
        children: [
          Icon(icon, color: colors.textSubtle, size: 34),
          const SizedBox(height: 10),
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: colors.textMuted),
          ),
          if (action != null) ...[const SizedBox(height: 14), action!],
        ],
      ),
    );
  }
}

class LoadingState extends StatelessWidget {
  const LoadingState({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Row(
        children: [
          const SizedBox.square(
            dimension: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: 12),
          Expanded(child: Text(message)),
        ],
      ),
    );
  }
}

class ErrorState extends StatelessWidget {
  const ErrorState({
    super.key,
    required this.title,
    required this.message,
    this.onRetry,
  });

  final String title;
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(message),
          if (onRetry != null) ...[
            const SizedBox(height: 12),
            AppButton(
              label: 'Retry',
              icon: Icons.refresh,
              variant: AppButtonVariant.secondary,
              onPressed: onRetry,
            ),
          ],
        ],
      ),
    );
  }
}
