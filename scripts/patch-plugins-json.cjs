// Capacitor sync hook: post-sync patches
// 1. Adds AudioRecorder custom plugin to capacitor.plugins.json
// 2. Adds VoskASR custom plugin to capacitor.plugins.json
// 3. Patches android/capacitor-cordova-android-plugins/build.gradle for AGP 9.x
// Runs AFTER npx cap sync

var fs = require("fs");
var path = require("path");

// ── 1. capacitor.plugins.json ──
var pluginsJsonPath = path.join(
  __dirname,
  "../android/app/src/main/assets/capacitor.plugins.json"
);

var customPlugins = [
  {
    pkg: "AudioRecorder",
    classpath: "com.eggli.flashcards.plugins.AudioRecorderPlugin"
  },
  {
    pkg: "VoskASR",
    classpath: "com.eggli.flashcards.plugins.VoskASRPlugin"
  },
  {
    pkg: "TailscaleVPN",
    classpath: "com.eggli.flashcards.plugins.TailscaleVPNPlugin"
  },
  {
    pkg: "SystemFloatingWindow",
    classpath: "com.eggli.flashcards.plugins.SystemFloatingWindowPlugin"
  }
];

if (!fs.existsSync(pluginsJsonPath)) {
  console.log("[patch-plugins-json] capacitor.plugins.json not found, creating.");
  var dir = path.dirname(pluginsJsonPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  var initialPlugins = customPlugins.slice();
  fs.writeFileSync(
    pluginsJsonPath,
    JSON.stringify(initialPlugins, null, "\t") + "\n",
    "utf8"
  );
  console.log("[patch-plugins-json] Created capacitor.plugins.json with custom plugins");
} else {
  try {
    var content = fs.readFileSync(pluginsJsonPath, "utf8");
    var plugins = JSON.parse(content);
    var changed = false;

    customPlugins.forEach(function (cp) {
      var exists = plugins.some(function (p) {
        return p.pkg === cp.pkg;
      });
      if (!exists) {
        plugins.push(cp);
        changed = true;
        console.log("[patch-plugins-json] Added " + cp.pkg + " to capacitor.plugins.json");
      }
    });

    if (changed) {
      fs.writeFileSync(
        pluginsJsonPath,
        JSON.stringify(plugins, null, "\t") + "\n",
        "utf8"
      );
    } else {
      console.log("[patch-plugins-json] All custom plugins already present, skipping.");
    }
  } catch (e) {
    console.error("[patch-plugins-json] Error:", e.message);
  }
}

// ── 2. capacitor-cordova-android-plugins/build.gradle ──
var cordovaBuildGradle = path.join(
  __dirname,
  "../android/capacitor-cordova-android-plugins/build.gradle"
);

if (!fs.existsSync(cordovaBuildGradle)) {
  console.log("[patch-cordova-plugins] cordova build.gradle not found, skipping.");
  process.exit(0);
}

try {
  var gradleContent = fs.readFileSync(cordovaBuildGradle, "utf8");
  var patchedGradle = gradleContent
    .replace(/com\.android\.tools\.build:gradle:8\.\d+\.\d+/g, "com.android.tools.build:gradle:9.2.1")
    .replace(/flatDir\s*\{[^}]*\}\s*\n?/g, "");

  if (gradleContent !== patchedGradle) {
    fs.writeFileSync(cordovaBuildGradle, patchedGradle, "utf8");
    console.log("[patch-cordova-plugins] cordova build.gradle patched (AGP 9.x, flatDir removed)");
  } else {
    console.log("[patch-cordova-plugins] cordova build.gradle already patched, skipping.");
  }
} catch (e) {
  console.error("[patch-cordova-plugins] Error:", e.message);
}
