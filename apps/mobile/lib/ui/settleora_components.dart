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
    final colors = context.settleoraColors;
    Widget item(
      SettleoraNavDestination destination,
      IconData icon,
      String label,
    ) {
      final active = selected == destination;
      final isSettle = destination == SettleoraNavDestination.settle;
      final foreground = isSettle
          ? colors.onPrimary
          : active
          ? colors.primary
          : colors.textSubtle;
      final background = isSettle
          ? colors.primary
          : active
          ? colors.primarySoft
          : Colors.transparent;

      return Expanded(
        child: Semantics(
          key: Key('bottom-nav-${destination.name}'),
          selected: active,
          button: true,
          child: InkWell(
            borderRadius: BorderRadius.circular(SettleoraRadius.md),
            onTap: onSelected == null ? null : () => onSelected!(destination),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: background,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 13,
                        vertical: 7,
                      ),
                      child: Icon(icon, size: 21, color: foreground),
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: active && !isSettle
                          ? colors.primary
                          : colors.textSubtle,
                      fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                      letterSpacing: 0,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return SafeArea(
      top: false,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border(top: BorderSide(color: colors.border)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 6),
          child: Row(
            children: [
              item(SettleoraNavDestination.home, Icons.home_rounded, 'Home'),
              item(
                SettleoraNavDestination.bills,
                Icons.receipt_long_rounded,
                'Bills',
              ),
              item(
                SettleoraNavDestination.groups,
                Icons.groups_rounded,
                'Groups',
              ),
              item(
                SettleoraNavDestination.settle,
                Icons.handshake_rounded,
                'Settle',
              ),
              item(
                SettleoraNavDestination.receipts,
                Icons.receipt_long_rounded,
                'Receipts',
              ),
              item(
                SettleoraNavDestination.profile,
                Icons.person_rounded,
                'Profile',
              ),
            ],
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
