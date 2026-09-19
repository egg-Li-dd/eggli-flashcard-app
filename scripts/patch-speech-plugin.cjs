// Capacitor sync hook: patches all plugin build.gradle files for AGP 9.x compatibility
// - Upgrades AGP classpath 8.x → 9.2.1
// - Normalizes compileSdk/targetSdk and Java source/target across all plugins
// Runs BEFORE npx cap sync

var fs = require("fs");
var path = require("path");

function patchFile(relPath, replacements, label) {
  var fullPath = path.join(__dirname, "..", relPath);
  if (!fs.existsSync(fullPath)) {
    console.log("[patch] " + label + " not found, skipping.");
    return false;
  }

  var content = fs.readFileSync(fullPath, "utf8");
  var patched = content;
  for (var i = 0; i < replacements.length; i++) {
    var r = replacements[i];
    patched = patched.replace(r.from, r.to);
  }

  if (content !== patched) {
    fs.writeFileSync(fullPath, patched, "utf8");
    console.log("[patch] " + label + " patched for AGP 9.x");
    return true;
  } else {
    console.log("[patch] " + label + " already patched, skipping.");
    return false;
  }
}

// ── 1. @capacitor-community/speech-recognition ──
patchFile(
  "node_modules/@capacitor-community/speech-recognition/android/build.gradle",
  [
    { from: /proguard-android\.txt/g, to: "proguard-android-optimize.txt" },
    { from: /com\.android\.tools\.build:gradle:8\.\d+\.\d+/g, to: "com.android.tools.build:gradle:9.2.1" },
    { from: /compileSdk project\.hasProperty\('compileSdkVersion'\) \? rootProject\.ext\.compileSdkVersion : 35/g,
      to: "compileSdk project.hasProperty('compileSdkVersion') ? rootProject.ext.compileSdkVersion : 36" },
    { from: /targetSdkVersion project\.hasProperty\('targetSdkVersion'\) \? rootProject\.ext\.targetSdkVersion : 35/g,
      to: "targetSdkVersion project.hasProperty('targetSdkVersion') ? rootProject.ext.targetSdkVersion : 36" },
    { from: /JavaVersion\.VERSION_26/g, to: "JavaVersion.VERSION_21" }
  ],
  "speech-recognition build.gradle"
);

// ── 2. @capacitor/filesystem ──
patchFile(
  "node_modules/@capacitor/filesystem/android/build.gradle",
  [
    { from: /com\.android\.tools\.build:gradle:8\.\d+\.\d+/g, to: "com.android.tools.build:gradle:9.2.1" }
  ],
  "filesystem build.gradle"
);

// ── 3. @capacitor/app ──
patchFile(
  "node_modules/@capacitor/app/android/build.gradle",
  [
    { from: /com\.android\.tools\.build:gradle:8\.\d+\.\d+/g, to: "com.android.tools.build:gradle:9.2.1" }
  ],
  "app build.gradle"
);

// ── 4. @capacitor/android (core framework) ──
patchFile(
  "node_modules/@capacitor/android/capacitor/build.gradle",
  [
    { from: /com\.android\.tools\.build:gradle:8\.\d+\.\d+/g, to: "com.android.tools.build:gradle:9.2.1" }
  ],
  "capacitor-android build.gradle"
);
