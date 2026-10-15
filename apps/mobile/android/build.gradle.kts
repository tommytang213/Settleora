allprojects {
    repositories {
        google()
        mavenCentral()
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
