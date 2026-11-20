rootProject.name = "CloudstreamPlugins"

// This file sets what projects are included. All new projects should get automatically included unless specified in "disabled" variable.

val disabled = listOf<String>()

File(rootDir, ".").listFiles()?.filter { it.isDirectory }?.forEach { dir ->
    if (!disabled.contains(dir.name) && File(dir, "build.gradle.kts").exists()) {
        include(dir.name)
    }
}


// To only include a single project, comment out the previous lines (except the first one), and include your plugin like so:
// include("PluginName")
