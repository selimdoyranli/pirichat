---
# SPDX-License-Identifier: AGPL-3.0-or-later
title: Downloads
description: Where the pirichat desktop app is published.
---

The pirichat desktop app for macOS, Windows and Linux is on the [download page](https://pirichat.online/indir). The page detects your platform and lists the current packages.

## Package origin

Packages are served from `https://dl.pirichat.online`, a static origin that needs no credential. Only the `stable` channel is published.

```
GET https://dl.pirichat.online/desktop/stable/{platform}/{arch}/latest
```

`platform` is `darwin`, `win32` or `linux`, and `arch` is `x64` or `arm64`. The `latest` document is JSON naming the current `version`, its `pub_date`, and under `files` one entry per package format with its `url` and `sha256`. The macOS packages are universal builds, so both macOS architectures name the same files.
