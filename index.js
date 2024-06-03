const fs = require("node:fs")
const path = require("node:path")
const semver = require('semver');
const YAML = require("yaml")
const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const { compareVersions } = require('compare-versions');

const runner = {
  os: String(process.env['RUNNER_OS'] ?? 'linux').toLowerCase(),
  arch: String(process.env['RUNNER_ARCH'] ?? 'x64').toLowerCase(),
}

const parseStrictInput= (strict = "false") => {
  return strict === "true" ? true : false
}

const labelsMap = {
  dart: "Dart SDK",
  flutter: "Flutter SDK",
}

async function main() {
  const inputs = {
    pubspec: core.getInput('pubspec') || './pubspec.yaml',
    channel: core.getInput('channel') || 'any',
    strict: parseStrictInput(core.getInput('strict')),
  }

  // Print the input variables
  if (inputs.strict) {
    core.info("Strict mode is enabled")
  }

  // Parse pubspec.yaml file
  const pubspecFile = path.resolve(inputs.pubspec)
  core.info("Parsing pubspec.yaml file: " + pubspecFile)

  const file = fs.readFileSync(pubspecFile, 'utf8')
  const Pubspec = YAML.parse(file)

  // Check if the pubspec.yaml file contains the environment key
  if (!Pubspec.environment) {
    core.setFailed("The pubspec.yaml file does not contain the environment key")
    return
  }
  if (inputs.strict && !Pubspec.environment.sdk) {
    core.warning("The pubspec.yaml file does not contain the environment.sdk key for Dart SDK")
    return
  }
  if (!Pubspec.environment.flutter) {
    core.setFailed("The pubspec.yaml file does not contain the environment.flutter key for Flutter SDK")
    return
  }

  core.group("pubspec.yaml", () => {
    if (Pubspec.environment.sdk) core.info(`  - Dart SDK version: ${Pubspec.environment.sdk}`)
    if (Pubspec.environment.flutter) core.info(`  - Flutter SDK version: ${Pubspec.environment.flutter}`)
  })

  // Download the Flutter release manifest
  const flutterReleaseManifestUrl = `https://storage.googleapis.com/flutter_infra_release/releases/releases_${runner.os}.json`
  core.info("Downloading Flutter release manifest from: " + flutterReleaseManifestUrl)
  const flutterReleaseManifestFile = await tc.downloadTool(flutterReleaseManifestUrl).catch((error) => {
    core.setFailed(`Failed to download Flutter release manifest: ${error}`)
    
  })
  const flutterReleaseManifestJson = fs.readFileSync(flutterReleaseManifestFile, 'utf8')
  const flutterReleaseManifest = JSON.parse(flutterReleaseManifestJson)

  // Prepare the matrix for the Dart and Flutter SDK versions
  const matrix = {
    dart: [],
    flutter: [],
  }

  // Process the Flutter release manifest
  await core.group("Processing Flutter release manifest...", () => {
    for (const release of flutterReleaseManifest.releases) {
      // Check if the release satisfied the channel constraint, if any is provided process all releases
      // Otherwise, only process releases that match the specified channel
      if (inputs.channel && inputs.channel !== 'any') {
        if (release.channel !== inputs.channel) {
          continue
        }
      }
  
      let __message = "-"
  
      // Check if the release satisfies the version constraint in the pubspec.yaml file
      if (release.version) {
        if (!semver.satisfies(release.version, Pubspec.environment.flutter)) {
          continue
        }
        matrix.flutter.push(release.version)
        __message += ` Flutter SDK version: (v${release.version}, ${release.channel})`
      }
  
      // Check if the release satisfies the Dart SDK version constraint in the pubspec.yaml file
      if (Pubspec.environment.sdk && release.dart_sdk_version) {
        if (inputs.strict && !semver.satisfies(release.dart_sdk_version, Pubspec.environment.sdk)) {
          core.info(`Skipping Dart SDK version: (v${release.dart_sdk_version}), the version does not satisfy the constraint in the pubspec.yaml file`)
          continue
        }
        matrix.dart.push(release.dart_sdk_version)
        __message += `, Dart SDK version: (v${release.version})`
      }
  
      core.info(__message)
      __message = "" // Reset the message
    }
  })

  // Remove duplicates and empty matrix
  for (const key in matrix) {
    await core.group(`Post-processing for ${labelsMap[key]}`, async () => {
      const items = matrix[key]
      if (items.length === 0) {
        core.info(`- Remove the "${key}" from the matrix to avoid empty arrays which will cause the job to fail`)
        delete matrix[key]
      } else {
        core.info("- Removing duplicates and sorting the versions")
        matrix[key] = Array
                      .from(new Set(matrix[key])) // Remove duplicates
                      .sort(compareVersions) // Sort the versions
      }
    })
  }


  // Show a summary of the matrix
  await core.group("Matrix summary", () => core.info(JSON.stringify({ matrix }, null, 2)))

  // Set the output variables
  core.setOutput('matrix', JSON.stringify(matrix))
  core.setOutput('dart', JSON.stringify(matrix.dart))
  core.setOutput('flutter', JSON.stringify(matrix.flutter))
}

main()
