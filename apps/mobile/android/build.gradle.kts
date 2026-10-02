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
// debug-bearing objects. Map its source and generated CMake paths before
// compilation so identical source yields the same build ID across worktrees.
subprojects {
    if (name == "jni") {
        plugins.withId("com.android.library") {
            extensions.configure<com.android.build.gradle.LibraryExtension> {
                val jniRoot = project.projectDir.parentFile.canonicalPath
                defaultConfig.externalNativeBuild.cmake.cFlags.add(
                    "-fdebug-prefix-map=$jniRoot=/usr/src/settleora-jni",
                )
                defaultConfig.externalNativeBuild.cmake.cFlags.add(
                    "-fdebug-compilation-dir=/usr/src/settleora-jni/build",
                )
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
