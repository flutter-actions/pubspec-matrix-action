const fs = require("node:fs")
const path = require("node:path")
const semver = require('semver');
const YAML = require("yaml")
const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const { compareVersions } = require('compare-versions');

const runner = {
  os: process.env['RUNNER_OS'] || 'Linux',
  arch: process.env['RUNNER_ARCH'] || 'x64',
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
    platform: String(core.getInput('platform') || runner.os).toLowerCase(),
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

  await core.group("pubspec.yaml", () => {
    if (Pubspec.environment.sdk) core.info(`- Dart SDK version: ${Pubspec.environment.sdk}`)
    if (Pubspec.environment.flutter) core.info(`- Flutter SDK version: ${Pubspec.environment.flutter}`)
  })

  // Download the Flutter release manifest
  const flutterReleaseManifestUrl = `https://storage.googleapis.com/flutter_infra_release/releases/releases_${inputs.platform}.json`
  core.info("Downloading Flutter release manifest from: " + flutterReleaseManifestUrl)
  const flutterReleaseManifestFile = await tc.downloadTool(flutterReleaseManifestUrl).catch((error) => {
    core.setFailed(`Failed to download Flutter release manifest: ${error}`)
    
  })
  const flutterReleaseManifestJson = fs.readFileSync(flutterReleaseManifestFile, 'utf8')
  const flutterReleaseManifest = JSON.parse(flutterReleaseManifestJson)

  // Prepare the matrix for the Dart and Flutter SDK versions
  const outputs = {
    release: [],
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
      
      const msg = []
      let flutter_sdk_version = release.version
      let dart_sdk_version = release.dart_sdk_version
  
      // Check if the release satisfies the version constraint in the pubspec.yaml file
      if (flutter_sdk_version) {
        if (!semver.satisfies(flutter_sdk_version, Pubspec.environment.flutter)) {
          continue
        }
        msg.push(`Flutter SDK version: (v${flutter_sdk_version}, ${release.channel})`)
      }
  
      // Check if the release satisfies the Dart SDK version constraint in the pubspec.yaml file
      if (Pubspec.environment.sdk && dart_sdk_version) {
        if (inputs.strict && !semver.satisfies(dart_sdk_version, Pubspec.environment.sdk)) {
          core.info(`Skipping Dart SDK version: (v${dart_sdk_version}), the version does not satisfy the constraint in the pubspec.yaml file`)
          continue
        }
        msg.push(`Dart SDK version: (v${flutter_sdk_version})`)
      } else if (Pubspec.environment.sdk && !dart_sdk_version) {
        core.warning(`The release ${flutter_sdk_version} does not contain the Dart SDK version information.`)
        core.warning("Using the exact Dart SDK version from the pubspec.yaml file")
        dart_sdk_version = Pubspec.environment.sdk.replace(/\^|<=?|>=?/, '')
      }

      // Remove the leading "v" from the versions
      flutter_sdk_version = flutter_sdk_version.replace(/^v/, '')
      dart_sdk_version = dart_sdk_version.replace(/^v/, '')

      // Add value to outputs
      if (!outputs.flutter.includes(flutter_sdk_version)) {
        outputs.release.push({ flutter: flutter_sdk_version, dart: dart_sdk_version })
      }
      outputs.flutter.push(flutter_sdk_version)
      outputs.dart.push(dart_sdk_version)
  
      core.info(`- ${msg.join(", ")} satisfies the constraints in the "pubspec.yaml" file`)
    }
  })

  // Remove duplicates and empty matrix
  for (const key in outputs) {
    if (Object.hasOwnProperty.call(outputs, key)) {
      await core.group(`Post-processing for ${labelsMap[key]}`, async () => {
        const items = outputs[key]
        if (items.length === 0) {
          core.info(`- Remove the "${key}" from the matrix to avoid empty arrays which will cause the job to fail`)
          delete outputs[key]
        } else {
          if (key !== 'matrix') {
            core.info("- Removing duplicates and sorting the versions")
            outputs[key] = Array
              .from(new Set(outputs[key])) // Remove duplicates
              .sort(compareVersions) // Sort the versions
          }
        }
      })
    }
  }


  // Show a summary of the matrix
  await core.group("Matrix summary", () => core.info(JSON.stringify(outputs, null, 2)))

  // Set the output variables
  core.setOutput('matrix', JSON.stringify({ release: outputs.release }))
  if ('dart' in outputs) {
    core.setOutput('dart', JSON.stringify(outputs.dart))
  }
  if ('flutter' in outputs) {
    core.setOutput('flutter', JSON.stringify(outputs.flutter))
  }
}

main()
