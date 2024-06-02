[GitHub Action]: https://github.com/flutter-actions/setup-flutter
[MIT License]: https://github.com/flutter-actions/setup-flutter/blob/main/LICENSE

# About
This [GitHub Action] generates a matrix of Dart and Flutter SDK versions from a `pubspec.yaml` file.

## Usage
```yaml
name: test

on:
  push:

jobs:
  build:
      runs-on: ubuntu-latest

      steps:
      - uses: actions/checkout@v2

      - name: Generate matrix from pubspec.yaml
        uses: flutter-actions/pubspec-matrix-action@v1
        with:
          pubspec: 'pubspec.yaml'
```
