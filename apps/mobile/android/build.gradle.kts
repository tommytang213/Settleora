allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

// Flutter integration_test requests runner 1.2+, but Espresso 3.3.0 already
// selects runner 1.3.0 at runtime. Align only that legacy API declaration so
// compile/runtime consistency also resolves offline; allow the app to upgrade it.
// Register before evaluationDependsOn(":app") can evaluate Flutter plugins.
subprojects {
    if (name == "integration_test") {
        configurations.matching { it.name == "api" }.configureEach {
            dependencies.withType<ExternalModuleDependency>().configureEach {
                if (group == "androidx.test" && name == "runner" && version == "1.2+") {
                    version { require("1.3.0") }
                }
            }
        }
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// The locked jni plugin builds libdartjni.so with a SHA-1 ELF build ID from
// debug-bearing objects. Map its source, generated CMake, and selected NDK
// paths before compilation so the build ID is independent of install roots.
subprojects {
    if (name == "jni") {
        plugins.withId("com.android.library") {
            extensions.configure<com.android.build.api.variant.LibraryAndroidComponentsExtension> {
                finalizeDsl { androidDsl ->
                    val jniRoot = project.projectDir.parentFile.canonicalPath
                    val ndkRoot = sdkComponents.ndkDirectory.get().asFile.absolutePath
                    androidDsl.defaultConfig.externalNativeBuild.cmake.cFlags.add(
                        "-fdebug-prefix-map=$jniRoot=/usr/src/settleora-jni",
                    )
                    androidDsl.defaultConfig.externalNativeBuild.cmake.cFlags.add(
                        "-fdebug-compilation-dir=/usr/src/settleora-jni/build",
                    )
                    androidDsl.defaultConfig.externalNativeBuild.cmake.cFlags.add(
                        "-fdebug-prefix-map=$ndkRoot=/usr/src/settleora-ndk",
                    )
                }
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
