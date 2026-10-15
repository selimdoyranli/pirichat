// SPDX-License-Identifier: AGPL-3.0-or-later

import {BUILD_CHANNEL, type BuildChannel} from '@electron/common/BuildChannel';

const DESKTOP_APP_NAMES: Record<BuildChannel, string> = {
	stable: 'Pirichat',
	canary: 'Pirichat Canary',
	development: 'Pirichat Development',
};
const DESKTOP_ARTIFACT_PRODUCT_NAMES: Record<BuildChannel, string> = {
	stable: 'Pirichat',
	canary: 'Pirichat-Canary',
	development: 'Pirichat-Development',
};
const MACOS_BUNDLE_IDS: Record<BuildChannel, string> = {
	stable: 'online.pirichat.desktop',
	canary: 'online.pirichat.desktop.canary',
	development: 'online.pirichat.desktop.development',
};
const LINUX_DESKTOP_ENTRY_IDS: Record<BuildChannel, string> = {
	stable: 'pirichat',
	canary: 'pirichat-canary',
	development: 'pirichat-development',
};
const LEGACY_LINUX_DESKTOP_ENTRY_IDS: Record<BuildChannel, string> = {
	stable: 'pirichat',
	canary: 'pirichat-canary',
	development: 'pirichat-development',
};
const LINUX_PORTAL_SESSION_TOKENS: Record<BuildChannel, string> = {
	stable: 'pirichat_global_shortcuts',
	canary: 'pirichat_canary_global_shortcuts',
	development: 'pirichat_development_global_shortcuts',
};
const WINDOWS_VELOPACK_IDS: Record<BuildChannel, string> = {
	stable: 'pirichat_desktop',
	canary: 'pirichat_desktop_canary',
	development: 'pirichat_desktop_development',
};
const WINDOWS_APP_USER_MODEL_IDS: Record<BuildChannel, string> = {
	stable: 'online.pirichat.desktop',
	canary: 'online.pirichat.desktop.canary',
	development: 'online.pirichat.desktop.development',
};
const WINDOWS_TOAST_ACTIVATOR_CLSIDS: Record<BuildChannel, string> = {
	stable: '{0BF67325-4A5A-4569-8C6B-19BFB4FDADE2}',
	canary: '{424B6C9C-B547-4DCA-9F9E-6045FF8EAE27}',
	development: '{A3D2E6BD-0F62-4E18-A0C9-7B015734712C}',
};

export const DESKTOP_APP_NAME = DESKTOP_APP_NAMES[BUILD_CHANNEL];
export const DESKTOP_ARTIFACT_PRODUCT_NAME = DESKTOP_ARTIFACT_PRODUCT_NAMES[BUILD_CHANNEL];
export const MACOS_BUNDLE_ID = MACOS_BUNDLE_IDS[BUILD_CHANNEL];
export const LINUX_DESKTOP_ENTRY_ID = LINUX_DESKTOP_ENTRY_IDS[BUILD_CHANNEL];
export const LINUX_PORTAL_SESSION_TOKEN = LINUX_PORTAL_SESSION_TOKENS[BUILD_CHANNEL];
export const LEGACY_LINUX_DESKTOP_ENTRY_ID = LEGACY_LINUX_DESKTOP_ENTRY_IDS[BUILD_CHANNEL];
export const LINUX_ICON_NAME = LEGACY_LINUX_DESKTOP_ENTRY_IDS[BUILD_CHANNEL];
export const WINDOWS_SHORTCUT_AUTHOR = 'Pirichat';
export const WINDOWS_VELOPACK_ID = WINDOWS_VELOPACK_IDS[BUILD_CHANNEL];
export const WINDOWS_LEGACY_SQUIRREL_ID = 'fluxer_app';
export const WINDOWS_APP_USER_MODEL_ID = WINDOWS_APP_USER_MODEL_IDS[BUILD_CHANNEL];
export const WINDOWS_LEGACY_APP_USER_MODEL_IDS = [`velopack.${WINDOWS_VELOPACK_ID}`];
export const WINDOWS_TOAST_ACTIVATOR_CLSID = WINDOWS_TOAST_ACTIVATOR_CLSIDS[BUILD_CHANNEL];
export const WINDOWS_STORE_IDENTITY_NAME = 'Pirichat.Pirichat';
