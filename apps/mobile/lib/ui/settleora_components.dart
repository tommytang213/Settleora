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
        ? _AppButtonLabel(label: label)
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18),
              const SizedBox(width: 8),
              Flexible(child: _AppButtonLabel(label: label)),
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

class _AppButtonLabel extends StatelessWidget {
  const _AppButtonLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return ClipRect(
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.center,
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.visible,
          softWrap: false,
          textAlign: TextAlign.center,
        ),
      ),
    );
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

    return Semantics(
      container: true,
      label: label,
      child: ExcludeSemantics(
        child: DecoratedBox(
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
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: foreground,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class SettleoraStatusChip extends StatelessWidget {
  const SettleoraStatusChip({
    super.key,
    required this.label,
    this.icon,
    this.backgroundColor,
  });

  final String label;
  final IconData? icon;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    return Chip(
      visualDensity: VisualDensity.compact,
      backgroundColor:
          backgroundColor ??
          Theme.of(context).colorScheme.surfaceContainerHighest,
      avatar: icon == null ? null : Icon(icon, size: 16),
      label: Text(label),
    );
  }
}

class SettleoraCountChip extends StatelessWidget {
  const SettleoraCountChip({
    super.key,
    required this.label,
    required this.count,
    this.icon,
  });

  final String label;
  final int count;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Chip(
      visualDensity: VisualDensity.compact,
      avatar: icon == null ? null : Icon(icon, size: 16),
      label: Text('$label: $count'),
    );
  }
}

class SettleoraReadinessChip extends StatelessWidget {
  const SettleoraReadinessChip({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(label),
      visualDensity: VisualDensity.compact,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }
}

class SettleoraAssignedMemberChip extends StatelessWidget {
  const SettleoraAssignedMemberChip({
    super.key,
    required this.label,
    required this.avatarLabel,
  });

  final String label;
  final String avatarLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    return Chip(
      visualDensity: VisualDensity.compact,
      avatar: CircleAvatar(
        backgroundColor: colors.primary,
        foregroundColor: colors.onPrimary,
        child: Text(avatarLabel),
      ),
      label: Text(label, overflow: TextOverflow.ellipsis),
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

class MoneyText extends StatelessWidget {
  const MoneyText({
    super.key,
    required this.amount,
    required this.currencyCode,
    this.style,
    this.textAlign,
    this.maxLines = 1,
    this.overflow = TextOverflow.ellipsis,
    this.semanticLabel,
  });

  final String amount;
  final String currencyCode;
  final TextStyle? style;
  final TextAlign? textAlign;
  final int? maxLines;
  final TextOverflow? overflow;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final normalizedCurrency = currencyCode.trim().toUpperCase();
    final displayCurrency = normalizedCurrency.isEmpty
        ? 'Currency not set'
        : normalizedCurrency;
    final displayAmount = amount.trim().isEmpty ? '0' : amount.trim();
    final text = '$displayAmount $displayCurrency';
    final effectiveStyle = (style ?? Theme.of(context).textTheme.titleMedium)
        ?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]);

    return Semantics(
      label: semanticLabel ?? text,
      child: ExcludeSemantics(
        child: Text(
          text,
          maxLines: maxLines,
          overflow: overflow,
          textAlign: textAlign,
          style: effectiveStyle,
        ),
      ),
    );
  }
}

enum SettleoraSurfaceVariant { neutral, info, warning, danger, success }

class SettleoraCompactHeader extends StatelessWidget {
  const SettleoraCompactHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.leadingIcon,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final IconData? leadingIcon;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        if (leadingIcon != null) ...[
          CircleAvatar(
            radius: 20,
            backgroundColor: colors.primarySoft,
            foregroundColor: colors.primary,
            child: Icon(leadingIcon, size: 20),
          ),
          const SizedBox(width: SettleoraSpacing.sm),
        ],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                header: true,
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: SettleoraSpacing.xxs),
                Text(subtitle!, style: TextStyle(color: colors.textMuted)),
              ],
            ],
          ),
        ),
        if (trailing != null) ...[
          const SizedBox(width: SettleoraSpacing.sm),
          trailing!,
        ],
      ],
    );
  }
}

class SummaryCard extends StatelessWidget {
  const SummaryCard({
    super.key,
    required this.title,
    required this.value,
    this.caption,
    this.icon,
    this.variant = SettleoraSurfaceVariant.neutral,
  });

  final String title;
  final String value;
  final String? caption;
  final IconData? icon;
  final SettleoraSurfaceVariant variant;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (background, foreground) = _surfaceColors(context, variant);

    return AppCard(
      color: background,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Icon(icon, size: 20, color: foreground),
                const SizedBox(width: SettleoraSpacing.xs),
              ],
              Expanded(
                child: Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: foreground,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: SettleoraSpacing.xs),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerStart,
            child: Text(
              value,
              maxLines: 1,
              style: theme.textTheme.titleLarge?.copyWith(
                color: foreground,
                fontWeight: FontWeight.w800,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
          if (caption != null) ...[
            const SizedBox(height: SettleoraSpacing.xxs),
            Text(
              caption!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: foreground),
            ),
          ],
        ],
      ),
    );
  }
}

class StateCard extends StatelessWidget {
  const StateCard({
    super.key,
    required this.title,
    required this.message,
    this.icon,
    this.action,
    this.variant = SettleoraSurfaceVariant.neutral,
  });

  final String title;
  final String message;
  final IconData? icon;
  final Widget? action;
  final SettleoraSurfaceVariant variant;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final theme = Theme.of(context);
    final (background, foreground) = _surfaceColors(context, variant);

    return AppCard(
      color: background,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (icon != null) ...[
                CircleAvatar(
                  radius: 18,
                  backgroundColor: colors.surface.withValues(alpha: 0.72),
                  foregroundColor: foreground,
                  child: Icon(icon, size: 20),
                ),
                const SizedBox(width: SettleoraSpacing.sm),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: foreground,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: SettleoraSpacing.xxs),
                    Text(message, style: TextStyle(color: foreground)),
                  ],
                ),
              ),
            ],
          ),
          if (action != null) ...[
            const SizedBox(height: SettleoraSpacing.sm),
            Align(alignment: AlignmentDirectional.centerStart, child: action!),
          ],
        ],
      ),
    );
  }
}

class SettleoraMoneyChip extends StatelessWidget {
  const SettleoraMoneyChip({
    super.key,
    required this.amount,
    required this.currencyCode,
    this.variant = StatusChipVariant.neutral,
    this.icon,
  });

  final String amount;
  final String currencyCode;
  final StatusChipVariant variant;
  final IconData? icon;

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

    return DecoratedBox(
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 15, color: foreground),
              const SizedBox(width: 5),
            ],
            Flexible(
              child: MoneyText(
                amount: amount,
                currencyCode: currencyCode,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: foreground,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SettleoraInlinePanel extends StatelessWidget {
  const SettleoraInlinePanel({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.variant = SettleoraSurfaceVariant.neutral,
    this.action,
    this.children = const [],
  });

  final IconData icon;
  final String title;
  final String message;
  final SettleoraSurfaceVariant variant;
  final Widget? action;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final theme = Theme.of(context);
    final (background, foreground) = _surfaceColors(context, variant);

    return AppCard(
      color: background,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: colors.surface.withValues(alpha: 0.72),
                foregroundColor: foreground,
                child: Icon(icon, size: 20),
              ),
              const SizedBox(width: SettleoraSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: foreground,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: SettleoraSpacing.xxs),
                    Text(message, style: TextStyle(color: foreground)),
                  ],
                ),
              ),
            ],
          ),
          if (children.isNotEmpty) ...[
            const SizedBox(height: SettleoraSpacing.sm),
            ...children,
          ],
          if (action != null) ...[
            const SizedBox(height: SettleoraSpacing.sm),
            Align(alignment: AlignmentDirectional.centerStart, child: action!),
          ],
        ],
      ),
    );
  }
}

class SettleoraListRow extends StatelessWidget {
  const SettleoraListRow({
    super.key,
    required this.title,
    required this.subtitle,
    this.leadingIcon,
    this.trailing,
    this.onTap,
    this.backgroundColor,
  });

  final String title;
  final String subtitle;
  final IconData? leadingIcon;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final row = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 48),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: SettleoraSpacing.md,
          vertical: 12,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            if (leadingIcon != null) ...[
              CircleAvatar(
                radius: 20,
                backgroundColor: colors.primarySoft,
                foregroundColor: colors.primary,
                child: Icon(leadingIcon, size: 20),
              ),
              const SizedBox(width: SettleoraSpacing.sm),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: SettleoraSpacing.xxs),
                  Text(subtitle, style: TextStyle(color: colors.textMuted)),
                ],
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: SettleoraSpacing.sm),
              trailing!,
            ],
            if (onTap != null) ...[
              const SizedBox(width: SettleoraSpacing.xs),
              Icon(Icons.chevron_right, color: colors.textSubtle),
            ],
          ],
        ),
      ),
    );

    final child = onTap == null
        ? row
        : Semantics(
            button: true,
            label: '$title\n$subtitle',
            onTap: onTap,
            child: InkWell(
              onTap: onTap,
              excludeFromSemantics: true,
              borderRadius: BorderRadius.circular(SettleoraRadius.lg),
              child: row,
            ),
          );

    return AppCard(
      color: backgroundColor,
      padding: EdgeInsets.zero,
      child: child,
    );
  }
}

class SettleoraBottomSheetFrame extends StatelessWidget {
  const SettleoraBottomSheetFrame({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
    this.actions = const [],
  });

  final String title;
  final String? subtitle;
  final Widget child;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          SettleoraSpacing.md,
          SettleoraSpacing.xs,
          SettleoraSpacing.md,
          bottomInset + SettleoraSpacing.md,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SettleoraCompactHeader(title: title, subtitle: subtitle),
            const SizedBox(height: SettleoraSpacing.md),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * 0.7,
              ),
              child: SingleChildScrollView(child: child),
            ),
            if (actions.isNotEmpty) ...[
              const SizedBox(height: SettleoraSpacing.md),
              Wrap(
                spacing: SettleoraSpacing.xs,
                runSpacing: SettleoraSpacing.xs,
                alignment: WrapAlignment.end,
                children: actions,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

Future<T?> showSettleoraBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: builder,
  );
}

class SettleoraDialogFrame extends StatelessWidget {
  const SettleoraDialogFrame({
    super.key,
    required this.title,
    required this.message,
    required this.actions,
    this.icon,
    this.variant = SettleoraSurfaceVariant.neutral,
    this.child,
  });

  final String title;
  final String message;
  final List<Widget> actions;
  final IconData? icon;
  final SettleoraSurfaceVariant variant;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final (_, foreground) = _surfaceColors(context, variant);

    return AlertDialog(
      scrollable: child != null,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SettleoraRadius.lg),
      ),
      title: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            CircleAvatar(
              radius: 18,
              backgroundColor: colors.primarySoft,
              foregroundColor: foreground,
              child: Icon(icon, size: 20),
            ),
            const SizedBox(width: SettleoraSpacing.sm),
          ],
          Expanded(child: Text(title)),
        ],
      ),
      content: child == null
          ? Text(message)
          : Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(message),
                const SizedBox(height: SettleoraSpacing.md),
                child!,
              ],
            ),
      actions: actions,
    );
  }
}

class SettleoraStatePanel extends StatelessWidget {
  const SettleoraStatePanel({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.action,
    this.compact = false,
    this.compactAlignment = Alignment.center,
    this.compactPadding = const EdgeInsets.symmetric(
      vertical: SettleoraSpacing.sm,
    ),
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;
  final bool compact;
  final AlignmentGeometry compactAlignment;
  final EdgeInsetsGeometry compactPadding;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final theme = Theme.of(context);
    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: compact ? 28 : 42, color: colors.primary),
        SizedBox(height: compact ? SettleoraSpacing.xs : 14),
        Text(
          title,
          style: compact
              ? theme.textTheme.titleMedium
              : theme.textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 6),
        Text(message, textAlign: TextAlign.center),
        if (action != null) ...[const SizedBox(height: 14), action!],
      ],
    );

    if (compact) {
      return Align(
        alignment: compactAlignment,
        child: Padding(padding: compactPadding, child: content),
      );
    }

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(SettleoraSpacing.xl),
        child: content,
      ),
    );
  }
}

class SettleoraLoadingPanel extends StatelessWidget {
  const SettleoraLoadingPanel({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: label,
      liveRegion: true,
      child: ExcludeSemantics(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 14),
              Text(label),
            ],
          ),
        ),
      ),
    );
  }
}

class SettleoraSection extends StatelessWidget {
  const SettleoraSection({
    super.key,
    required this.title,
    required this.children,
    this.trailing,
    this.spacing = SettleoraSpacing.xs,
  });

  final String title;
  final List<Widget> children;
  final Widget? trailing;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Semantics(
                header: true,
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ),
            ?trailing,
          ],
        ),
        SizedBox(height: spacing),
        ...children,
      ],
    );
  }
}

class SettleoraKeyValueRow extends StatelessWidget {
  const SettleoraKeyValueRow({
    super.key,
    required this.label,
    required this.value,
    this.labelWidth = 112,
    this.spacing = 10,
    this.padding = const EdgeInsets.symmetric(vertical: 3),
    this.labelStyle,
    this.valueAlignment = Alignment.centerRight,
  });

  final String label;
  final Widget value;
  final double labelWidth;
  final double spacing;
  final EdgeInsetsGeometry padding;
  final TextStyle? labelStyle;
  final AlignmentGeometry valueAlignment;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: labelWidth,
            child: Text(
              label,
              style:
                  labelStyle ??
                  Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: colors.textSubtle),
            ),
          ),
          SizedBox(width: spacing),
          Expanded(
            child: Align(alignment: valueAlignment, child: value),
          ),
        ],
      ),
    );
  }
}

class SettleoraKeyValueText extends StatelessWidget {
  const SettleoraKeyValueText({
    super.key,
    required this.label,
    required this.value,
    this.labelWidth = 112,
    this.spacing = 10,
    this.padding = const EdgeInsets.symmetric(vertical: 3),
    this.labelStyle,
    this.valueAlignment = Alignment.centerRight,
    this.valueTextAlign = TextAlign.end,
  });

  final String label;
  final String value;
  final double labelWidth;
  final double spacing;
  final EdgeInsetsGeometry padding;
  final TextStyle? labelStyle;
  final AlignmentGeometry valueAlignment;
  final TextAlign valueTextAlign;

  @override
  Widget build(BuildContext context) {
    return SettleoraKeyValueRow(
      label: label,
      labelWidth: labelWidth,
      spacing: spacing,
      padding: padding,
      labelStyle: labelStyle,
      valueAlignment: valueAlignment,
      value: Text(value, textAlign: valueTextAlign),
    );
  }
}

class SettleoraKeyValueMoneyText extends StatelessWidget {
  const SettleoraKeyValueMoneyText({
    super.key,
    required this.label,
    required this.amount,
    required this.currencyCode,
    this.labelWidth = 112,
    this.spacing = 10,
    this.padding = const EdgeInsets.symmetric(vertical: 3),
    this.labelStyle,
    this.valueAlignment = Alignment.centerRight,
  });

  final String label;
  final String amount;
  final String currencyCode;
  final double labelWidth;
  final double spacing;
  final EdgeInsetsGeometry padding;
  final TextStyle? labelStyle;
  final AlignmentGeometry valueAlignment;

  @override
  Widget build(BuildContext context) {
    return SettleoraKeyValueRow(
      label: label,
      labelWidth: labelWidth,
      spacing: spacing,
      padding: padding,
      labelStyle: labelStyle,
      valueAlignment: valueAlignment,
      value: MoneyText(
        amount: amount,
        currencyCode: currencyCode,
        textAlign: TextAlign.end,
        style: Theme.of(context).textTheme.bodyMedium,
      ),
    );
  }
}

class InfoCard extends StatelessWidget {
  const InfoCard({
    super.key,
    required this.title,
    required this.message,
    this.icon = Icons.info_outline,
    this.action,
  });

  final String title;
  final String message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return StateCard(
      title: title,
      message: message,
      icon: icon,
      action: action,
      variant: SettleoraSurfaceVariant.info,
    );
  }
}

class WarningCard extends StatelessWidget {
  const WarningCard({
    super.key,
    required this.title,
    required this.message,
    this.icon = Icons.warning_amber_outlined,
    this.action,
  });

  final String title;
  final String message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return StateCard(
      title: title,
      message: message,
      icon: icon,
      action: action,
      variant: SettleoraSurfaceVariant.warning,
    );
  }
}

class SettingsRow extends StatelessWidget {
  const SettingsRow({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
    this.statusLabel,
    this.statusVariant = StatusChipVariant.neutral,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final String? statusLabel;
  final StatusChipVariant statusVariant;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final row = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 48),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: SettleoraSpacing.md,
          vertical: 12,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: colors.primarySoft,
              foregroundColor: colors.primary,
              child: Icon(icon, size: 20),
            ),
            const SizedBox(width: SettleoraSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: SettleoraSpacing.xxs),
                  Text(subtitle, style: TextStyle(color: colors.textMuted)),
                  if (statusLabel != null) ...[
                    const SizedBox(height: SettleoraSpacing.xs),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: StatusChip(
                        label: statusLabel!,
                        variant: statusVariant,
                        size: StatusChipSize.small,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (onTap != null)
              Icon(Icons.chevron_right, color: colors.textSubtle),
          ],
        ),
      ),
    );

    final child = onTap == null
        ? row
        : Semantics(
            button: true,
            label: '$title\n$subtitle',
            onTap: onTap,
            child: InkWell(
              onTap: onTap,
              excludeFromSemantics: true,
              borderRadius: BorderRadius.circular(SettleoraRadius.lg),
              child: row,
            ),
          );

    return AppCard(padding: EdgeInsets.zero, child: child);
  }
}

class VisualPreferenceUnsupportedReadout extends StatelessWidget {
  const VisualPreferenceUnsupportedReadout({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final textTheme = Theme.of(context).textTheme;

    // Appearance preferences are display-only and must never affect access,
    // money, settlement, privacy, security, audit, storage, or sync authority.
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.palette_outlined, color: colors.primary),
              const SizedBox(width: SettleoraSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Visual preferences', style: textTheme.titleSmall),
                    const SizedBox(height: SettleoraSpacing.xxs),
                    Text(
                      'The app currently uses the default Settleora Midnight theme.',
                      style: TextStyle(color: colors.textMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: SettleoraSpacing.sm),
          const _VisualPreferenceLine(
            label: 'Appearance',
            value: 'Appearance settings are coming later.',
          ),
        ],
      ),
    );
  }
}

class _VisualPreferenceLine extends StatelessWidget {
  const _VisualPreferenceLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return Padding(
      padding: const EdgeInsets.only(top: SettleoraSpacing.xs),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final isCompact = constraints.maxWidth < 340;
          final labelText = Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700),
          );
          final valueText = Text(
            value,
            style: TextStyle(color: colors.textMuted),
          );

          if (isCompact) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                labelText,
                const SizedBox(height: SettleoraSpacing.xxs),
                valueText,
              ],
            );
          }

          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(width: 126, child: labelText),
              Expanded(child: valueText),
            ],
          );
        },
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
    final titleColumn = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 2),
        Text(
          subtitle,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(color: colors.textSubtle),
        ),
      ],
    );
    final amountColumn = Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          amount,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
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
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final isCompact = constraints.maxWidth < 340;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            crossAxisAlignment: isCompact
                ? CrossAxisAlignment.start
                : CrossAxisAlignment.center,
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
                child: isCompact
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          titleColumn,
                          const SizedBox(height: 8),
                          Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: amountColumn,
                          ),
                        ],
                      )
                    : titleColumn,
              ),
              if (!isCompact) ...[
                const SizedBox(width: 12),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 132),
                  child: amountColumn,
                ),
              ],
            ],
          ),
        );
      },
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

enum SettleoraNavDestination { home, bills, groups, settle, more }

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
    const destinations = <SettleoraNavDestination>[
      SettleoraNavDestination.home,
      SettleoraNavDestination.bills,
      SettleoraNavDestination.groups,
      SettleoraNavDestination.settle,
      SettleoraNavDestination.more,
    ];
    final colors = context.settleoraColors;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: colors.border)),
        boxShadow: [
          BoxShadow(
            color: colors.primary.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(10, 6, 10, 8),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final maxWidth = constraints.maxWidth >= 640
                ? 560.0
                : constraints.maxWidth;

            return Center(
              heightFactor: 1,
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: maxWidth),
                child: DecoratedBox(
                  key: const Key('server-shell-bottom-nav'),
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(SettleoraRadius.xxl),
                    border: Border.all(color: colors.border),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 6,
                    ),
                    child: Row(
                      children: [
                        for (final destination in destinations)
                          Expanded(
                            child: _SettleoraBottomNavItem(
                              key: _keyForDestination(destination),
                              destination: destination,
                              selected: selected == destination,
                              enabled: onSelected != null,
                              onTap: () {
                                if (destination == selected) {
                                  return;
                                }
                                onSelected?.call(destination);
                              },
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Key _keyForDestination(SettleoraNavDestination destination) {
    return switch (destination) {
      SettleoraNavDestination.home => const Key('bottom-nav-home'),
      SettleoraNavDestination.bills => const Key('bottom-nav-bills'),
      SettleoraNavDestination.groups => const Key('bottom-nav-groups'),
      SettleoraNavDestination.settle => const Key('bottom-nav-settle'),
      SettleoraNavDestination.more => const Key('bottom-nav-more'),
    };
  }
}

class _SettleoraBottomNavItem extends StatelessWidget {
  const _SettleoraBottomNavItem({
    super.key,
    required this.destination,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final SettleoraNavDestination destination;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;
    final label = _label(destination);
    final foreground = selected ? colors.primary : colors.textMuted;
    final icon = selected ? _selectedIcon(destination) : _icon(destination);

    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(SettleoraRadius.xl),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 58),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: selected ? colors.primarySoft : Colors.transparent,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: SizedBox(
                    width: 50,
                    height: 30,
                    child: Icon(icon, color: foreground, size: 21),
                  ),
                ),
                const SizedBox(height: 3),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    label,
                    maxLines: 1,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: foreground,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w700,
                      letterSpacing: 0,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _label(SettleoraNavDestination destination) {
    return switch (destination) {
      SettleoraNavDestination.home => 'Home',
      SettleoraNavDestination.bills => 'Bills',
      SettleoraNavDestination.groups => 'Groups',
      SettleoraNavDestination.settle => 'Settle',
      SettleoraNavDestination.more => 'More',
    };
  }

  IconData _icon(SettleoraNavDestination destination) {
    return switch (destination) {
      SettleoraNavDestination.home => Icons.home_outlined,
      SettleoraNavDestination.bills => Icons.receipt_long_outlined,
      SettleoraNavDestination.groups => Icons.groups_outlined,
      SettleoraNavDestination.settle => Icons.payments_outlined,
      SettleoraNavDestination.more => Icons.more_horiz,
    };
  }

  IconData _selectedIcon(SettleoraNavDestination destination) {
    return switch (destination) {
      SettleoraNavDestination.home => Icons.home,
      SettleoraNavDestination.bills => Icons.receipt_long,
      SettleoraNavDestination.groups => Icons.groups,
      SettleoraNavDestination.settle => Icons.payments,
      SettleoraNavDestination.more => Icons.more_horiz,
    };
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
    return StateCard(
      title: title,
      message: message,
      icon: icon,
      action: action,
      variant: SettleoraSurfaceVariant.neutral,
    );
  }
}

class LoadingState extends StatelessWidget {
  const LoadingState({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.settleoraColors;

    return AppCard(
      child: Row(
        children: [
          const SizedBox.square(
            dimension: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: SettleoraSpacing.sm),
          Expanded(
            child: Text(message, style: TextStyle(color: colors.textMuted)),
          ),
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
    this.retryKey,
  });

  final String title;
  final String message;
  final VoidCallback? onRetry;
  final Key? retryKey;

  @override
  Widget build(BuildContext context) {
    return StateCard(
      title: title,
      message: message,
      icon: Icons.error_outline,
      action: onRetry == null
          ? null
          : AppButton(
              key: retryKey,
              label: 'Retry',
              icon: Icons.refresh,
              variant: AppButtonVariant.secondary,
              onPressed: onRetry,
            ),
      variant: SettleoraSurfaceVariant.danger,
    );
  }
}

(Color, Color) _surfaceColors(
  BuildContext context,
  SettleoraSurfaceVariant variant,
) {
  final colors = context.settleoraColors;

  return switch (variant) {
    SettleoraSurfaceVariant.neutral => (colors.surface, colors.text),
    SettleoraSurfaceVariant.info => (colors.infoSoft, colors.onInfoSoft),
    SettleoraSurfaceVariant.warning => (
      colors.warningSoft,
      colors.onWarningSoft,
    ),
    SettleoraSurfaceVariant.danger => (colors.dangerSoft, colors.onDangerSoft),
    SettleoraSurfaceVariant.success => (
      colors.successSoft,
      colors.onSuccessSoft,
    ),
  };
}
