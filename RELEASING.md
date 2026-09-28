# Releasing Noorden Browser

## Recommended version format

Use semantic versions, for example:

- `v0.1.0`
- `v0.2.0`
- `v1.0.0`

## Release files

Upload installers directly to the GitHub Release. Recommended names:

- `Noorden-Browser-1.0.0-Windows-x64.exe`
- `Noorden-Browser-1.0.0-Windows-x64.zip`
- `Noorden-Browser-1.0.0-macOS-arm64.dmg`
- `Noorden-Browser-1.0.0-macOS-x64.dmg`

## Steps

1. Build and test Windows and macOS versions.
2. Create a Git tag such as `v1.0.0`.
3. Create a GitHub Release from that tag.
4. Upload the installer files as release assets.
5. Add release notes describing changes and known issues.
