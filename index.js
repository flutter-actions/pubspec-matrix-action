const fs = require("node:fs")
const fetch = require('node-fetch');
const semver = require('semver');
const YAML = require("yaml")
const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const github = require('@actions/github');
const { compareVersions } = require('compare-versions');
const { version } = require("node:os");

const runner = {
  os: process.env['RUNNER_OS'] ?? 'linux',
  arch: process.env['RUNNER_ARCH'] ?? 'x64'
}

const parseStrictInput= (strict = "false") => {
  return strict === "true" ? true : false
}

async function main() {
  const inputs = {
    strict: parseStrictInput(core.getInput('strict')),
  }

  // Parse pubspec.yaml file
  const file = fs.readFileSync('./pubspec.yaml', 'utf8')
  const Pubspec = YAML.parse(file)

  // Check if the pubspec.yaml file contains the environment key
  if (!Pubspec.environment) {
    core.setFailed("The pubspec.yaml file does not contain the environment key")
    return
  }
  if (!Pubspec.environment.sdk) {
    core.warning("The pubspec.yaml file does not contain the environment.sdk key for Dart SDK")
  }
  if (!Pubspec.environment.flutter) {
    core.setFailed("The pubspec.yaml file does not contain the environment.flutter key for Flutter SDK")
    return
  }

  // Print the input variables
  if (inputs.strict) {
    core.info("Strict mode is enabled")
  }

  core.info("Pubspec environment:")
  core.info(`  - Dart SDK version: ${Pubspec.environment.sdk}`)
  core.info(`  - Flutter SDK version: ${Pubspec.environment.flutter}`)

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
  core.info("Processing Flutter release manifest:")
  for (const release of flutterReleaseManifest.releases) {
    // Check if the release satisfied the channel constraint, if any is provided process all releases
    // Otherwise, only process releases that match the specified channel
    if (inputs.channel !== 'any') {
      if (release.channel !== inputs.channel) {
        continue
      }
    }

    let __message = "  -"

    // Check if the release satisfies the version constraint in the pubspec.yaml file
    if (release.version) {
      if (!semver.satisfies(release.version, Pubspec.environment.flutter)) {
        continue
      }
      matrix.flutter.push(release.version)
      __message += ` Flutter SDK version: (v${release.version}, ${release.channel})`
    }

    // Check if the release satisfies the Dart SDK version constraint in the pubspec.yaml file
    if (release.dart_sdk_version) {
      if (inputs.strict && !semver.satisfies(release.dart_sdk_version, Pubspec.environment.sdk)) {
        core.info(`Skipping Dart SDK version: (v${release.dart_sdk_version}), the version does not satisfy the constraint in the pubspec.yaml file`)
        continue
      }
      matrix.dart.push(release.dart_sdk_version)
      __message += `, Dart SDK version: (v${release.version})`
    }

    core.info(__message)
  }

  // Remove duplicates and empty matrix
  for (const key in matrix) {
    const items = matrix[key]
    if (items.length === 0) {
      delete matrix[key]
    } else {
      matrix[key] = Array.from(new Set(matrix[key]))
    }
  }

  core.info("")
  core.info("Matrix:")
  core.info(JSON.stringify({ matrix }, null, 2))

  // Set the output variables
  core.setOutput('matrix', JSON.stringify(matrix))
  core.setOutput('dart', JSON.stringify(matrix.dart))
  core.setOutput('flutter', JSON.stringify(matrix.flutter))
}

main()
