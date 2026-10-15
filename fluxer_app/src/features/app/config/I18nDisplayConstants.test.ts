// SPDX-License-Identifier: AGPL-3.0-or-later

import * as constants from '@app/features/app/config/I18nDisplayConstants';
import {describe, expect, it} from 'vitest';

describe('premium display constants', () => {
	it('exports Pirichat Plus names for cold boot and translated placeholders', () => {
		expect(constants).toMatchObject({
			PREMIUM_PRODUCT_NAME: 'Pirichat Plus',
			PREMIUM_PRODUCT_FULL_NAME: 'Pirichat Plus',
		});
	});
});
