import 'package:flutter/material.dart';

class SettleoraColors extends ThemeExtension<SettleoraColors> {
  const SettleoraColors({
    required this.canvas,
    required this.surface,
    required this.primary,
    required this.onPrimary,
    required this.primarySoft,
    required this.accent,
    required this.accentSoft,
    required this.successSoft,
    required this.onSuccessSoft,
    required this.warningSoft,
    required this.onWarningSoft,
    required this.dangerSoft,
    required this.onDangerSoft,
    required this.infoSoft,
    required this.onInfoSoft,
    required this.border,
    required this.borderStrong,
    required this.text,
    required this.textMuted,
    required this.textSubtle,
  });

  final Color canvas;
  final Color surface;
  final Color primary;
  final Color onPrimary;
  final Color primarySoft;
  final Color accent;
  final Color accentSoft;
  final Color successSoft;
  final Color onSuccessSoft;
  final Color warningSoft;
  final Color onWarningSoft;
  final Color dangerSoft;
  final Color onDangerSoft;
  final Color infoSoft;
  final Color onInfoSoft;
  final Color border;
  final Color borderStrong;
  final Color text;
  final Color textMuted;
  final Color textSubtle;

  static const light = SettleoraColors(
    canvas: Color(0xFFF7F2EC),
    surface: Colors.white,
    primary: Color(0xFFA94713),
    onPrimary: Colors.white,
    primarySoft: Color(0xFFFFE8D6),
    accent: Color(0xFF0F766E),
    accentSoft: Color(0xFFE0F2F1),
    successSoft: Color(0xFFE6F5EE),
    onSuccessSoft: Color(0xFF14532D),
    warningSoft: Color(0xFFFEF3E0),
    onWarningSoft: Color(0xFF744700),
    dangerSoft: Color(0xFFFDE8EB),
    onDangerSoft: Color(0xFF981B2F),
    infoSoft: Color(0xFFE6EEFF),
    onInfoSoft: Color(0xFF1E3A8A),
    border: Color(0x1FA94713),
    borderStrong: Color(0x3DA94713),
    text: Color(0xFF111827),
    textMuted: Color(0xFF4B5563),
    textSubtle: Color(0xFF6B7280),
  );

  @override
  SettleoraColors copyWith({
    Color? canvas,
    Color? surface,
    Color? primary,
    Color? onPrimary,
    Color? primarySoft,
    Color? accent,
    Color? accentSoft,
    Color? successSoft,
    Color? onSuccessSoft,
    Color? warningSoft,
    Color? onWarningSoft,
    Color? dangerSoft,
    Color? onDangerSoft,
    Color? infoSoft,
    Color? onInfoSoft,
    Color? border,
    Color? borderStrong,
    Color? text,
    Color? textMuted,
    Color? textSubtle,
  }) {
    return SettleoraColors(
      canvas: canvas ?? this.canvas,
      surface: surface ?? this.surface,
      primary: primary ?? this.primary,
      onPrimary: onPrimary ?? this.onPrimary,
      primarySoft: primarySoft ?? this.primarySoft,
      accent: accent ?? this.accent,
      accentSoft: accentSoft ?? this.accentSoft,
      successSoft: successSoft ?? this.successSoft,
      onSuccessSoft: onSuccessSoft ?? this.onSuccessSoft,
      warningSoft: warningSoft ?? this.warningSoft,
      onWarningSoft: onWarningSoft ?? this.onWarningSoft,
      dangerSoft: dangerSoft ?? this.dangerSoft,
      onDangerSoft: onDangerSoft ?? this.onDangerSoft,
      infoSoft: infoSoft ?? this.infoSoft,
      onInfoSoft: onInfoSoft ?? this.onInfoSoft,
      border: border ?? this.border,
      borderStrong: borderStrong ?? this.borderStrong,
      text: text ?? this.text,
      textMuted: textMuted ?? this.textMuted,
      textSubtle: textSubtle ?? this.textSubtle,
    );
  }

  @override
  SettleoraColors lerp(ThemeExtension<SettleoraColors>? other, double t) {
    if (other is! SettleoraColors) {
      return this;
    }
    return SettleoraColors(
      canvas: Color.lerp(canvas, other.canvas, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      primary: Color.lerp(primary, other.primary, t)!,
      onPrimary: Color.lerp(onPrimary, other.onPrimary, t)!,
      primarySoft: Color.lerp(primarySoft, other.primarySoft, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      accentSoft: Color.lerp(accentSoft, other.accentSoft, t)!,
      successSoft: Color.lerp(successSoft, other.successSoft, t)!,
      onSuccessSoft: Color.lerp(onSuccessSoft, other.onSuccessSoft, t)!,
      warningSoft: Color.lerp(warningSoft, other.warningSoft, t)!,
      onWarningSoft: Color.lerp(onWarningSoft, other.onWarningSoft, t)!,
      dangerSoft: Color.lerp(dangerSoft, other.dangerSoft, t)!,
      onDangerSoft: Color.lerp(onDangerSoft, other.onDangerSoft, t)!,
      infoSoft: Color.lerp(infoSoft, other.infoSoft, t)!,
      onInfoSoft: Color.lerp(onInfoSoft, other.onInfoSoft, t)!,
      border: Color.lerp(border, other.border, t)!,
      borderStrong: Color.lerp(borderStrong, other.borderStrong, t)!,
      text: Color.lerp(text, other.text, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      textSubtle: Color.lerp(textSubtle, other.textSubtle, t)!,
    );
  }
}

abstract final class SettleoraSpacing {
  static const double xxs = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 20;
  static const double xl = 24;
  static const double xxl = 32;
}

abstract final class SettleoraRadius {
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 22;
  static const double xl = 24;
  static const double xxl = 32;
}

abstract final class SettleoraTheme {
  static ThemeData light() {
    final colors = SettleoraColors.light;
    final scheme = ColorScheme.fromSeed(
      seedColor: colors.primary,
      brightness: Brightness.light,
      primary: colors.primary,
      onPrimary: colors.onPrimary,
      surface: colors.surface,
      error: colors.onDangerSoft,
      outline: colors.borderStrong,
      outlineVariant: colors.border,
    );
    final textTheme = Typography.blackMountainView.apply(
      bodyColor: colors.text,
      displayColor: colors.text,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: colors.canvas,
      extensions: const [SettleoraColors.light],
      textTheme: textTheme.copyWith(
        headlineSmall: textTheme.headlineSmall?.copyWith(
          fontWeight: FontWeight.w800,
          letterSpacing: 0,
        ),
        titleLarge: textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          letterSpacing: 0,
        ),
        titleMedium: textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: 0,
        ),
        titleSmall: textTheme.titleSmall?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: 0,
        ),
        labelLarge: textTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: 0,
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: colors.canvas,
        foregroundColor: colors.text,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: colors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SettleoraRadius.lg),
          side: BorderSide(color: colors.border),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(SettleoraRadius.md),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(SettleoraRadius.md),
          borderSide: BorderSide(color: colors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(SettleoraRadius.md),
          borderSide: BorderSide(color: colors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(SettleoraRadius.md),
          borderSide: BorderSide(color: colors.primary, width: 1.4),
        ),
      ),
    );
  }
}

extension SettleoraThemeX on BuildContext {
  SettleoraColors get settleoraColors =>
      Theme.of(this).extension<SettleoraColors>() ?? SettleoraColors.light;
}
