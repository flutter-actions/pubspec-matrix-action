[GitHub Action]: https://github.com/flutter-actions/setup-flutter
[MIT License]: https://github.com/flutter-actions/setup-flutter/blob/main/LICENSE

> [!NOTE]
> This action is still in development and may not work as expected.

# About
This [GitHub Action] generates a matrix of Dart and Flutter SDK versions from a `pubspec.yaml` file.

## Usage
```yaml
name: test

on:
  push:

jobs:
  pubspec:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - id: pubspec
      name: Generate matrix from pubspec.yaml
      uses: flutter-actions/pubspec-matrix-action@v1
      with:
        pubspec: 'pubspec.yaml'
    outputs:
      matrix: ${{ steps.pubspec.outputs.matrix }}

  test:
    needs: pubspec
    runs-on: ubuntu-latest
    strategy:
      matrix: ${{fromJson(needs.pubspec.outputs.matrix)}}
    steps:
    - uses: actions/checkout@v4

    - uses: flutter-actions/setup-flutter@v2
      with:
        version: ${{ matrix.flutter }}
        channel: stable

    - run: flutter pub get
    - run: flutter test

```

**Example**

<picture>
    <source srcset=".github/assets/screenshot-dark.png"  media="(prefers-color-scheme: dark)">
    <img src=".github/assets/screenshot-light.png">
</picture>

# License

Licensed under the [MIT License].
