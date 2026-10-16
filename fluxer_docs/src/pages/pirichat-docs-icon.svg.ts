// SPDX-License-Identifier: AGPL-3.0-or-later

import favicon from '@/assets/pirichat/favicon.svg?raw';

export const prerender = true;

export function GET(): Response {
	return new Response(favicon, {
		headers: {'Content-Type': 'image/svg+xml'},
	});
}
