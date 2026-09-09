# Windows updates

The installed app checks GitHub Releases at startup and every four hours. Press
Ctrl+Shift+U (or Alt, Help, Check for updates) to check manually. Clients choose
whether to download and when to restart. Save unfinished work before restarting.

Before installation, the backend exits and a separate SQLite process creates and
integrity-checks a snapshot. Installation is blocked if that process fails.
Backups remain in `%APPDATA%/billingsoftware/data/backups`, next to the persistent
database directory, outside the installation. Pre-update files start with
`database_pre-update_`. They are retained until manually removed. Existing database
import controls can restore a compatible snapshot; restoration is not automatic.

## Release a version

1. Install dependencies with `npm.cmd ci`, `npm.cmd --prefix server ci`, and
   `npm.cmd --prefix client ci`.
2. Increase the root package version: `npm.cmd version patch --no-git-tag-version`.
3. Run `npm.cmd run dist` to generate the Windows installer, blockmap and
   `latest.yml` in `dist`.
4. Create a GitHub release in `sahildafda/BillingSoftware` tagged `v<version>`.
   Attach the generated installer `.exe`, `.exe.blockmap`, and `latest.yml` from
   the same build. Publish the release as a normal release, not a prerelease.

Alternatively, set `GH_TOKEN` in your build terminal with release write access and
run `npm.cmd run release`. This uploads a **draft** release; review and publish it
on GitHub. Never embed this token in the application or commit it.

Release assets must be publicly readable without a client token. If the code repo
is private, use a separate public releases repository and change `build.publish`
in package.json before shipping the first installer.

Keep appId, package name, and product name stable to preserve installation/data
identity. Clients running an older build without this updater must install the
first updater-enabled build once. Subsequent updates use the app prompts.

## Validate before distributing

Run `node --test electron/updates.test.js server/dbBackup.test.js server/updateBackup.test.js`. On a Windows
test account install version A, enter sample data, publish a higher version B,
and check for updates. Confirm a verified pre-update snapshot exists and data is
preserved after restart. Also test Later, offline operation, and a backup failure
(e.g. deny writes to the test backup directory). Do not publish until this passes.
Use Windows code signing for production distribution; the existing builder
configuration does not require a signing certificate.
