pluginManagement {
    val flutterSdkPath =
        run {
            val properties = java.util.Properties()
            file("local.properties").inputStream().use { properties.load(it) }
            val flutterSdkPath = properties.getProperty("flutter.sdk")
            require(flutterSdkPath != null) { "flutter.sdk not set in local.properties" }
            flutterSdkPath
        }

    includeBuild("$flutterSdkPath/packages/flutter_tools/gradle")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

// Dependency verification metadata is the Linux release-evidence collector's
// authenticated dependency allowlist. Other hosts keep their ordinary Gradle
// behavior so the Linux-only AAPT2 checksum cannot break macOS/Windows builds.
gradle.startParameter.dependencyVerificationMode =
    if (providers.gradleProperty("settleoraReleaseEvidence").orNull == "true") {
        org.gradle.api.artifacts.verification.DependencyVerificationMode.STRICT
    } else {
        org.gradle.api.artifacts.verification.DependencyVerificationMode.OFF
    }

// Release-evidence collectors enable offline mode after the checksum-verified
// dependency cache has been populated.
if (providers.gradleProperty("settleoraReleaseOffline").orNull == "true") {
    gradle.startParameter.isOffline = true
}

plugins {
    id("dev.flutter.flutter-plugin-loader") version "1.0.0"
    id("com.android.application") version "8.11.1" apply false
    id("org.jetbrains.kotlin.android") version "2.2.20" apply false
}

include(":app")
