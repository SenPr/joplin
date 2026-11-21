import Logger, { LogLevel } from '@joplin/utils/Logger';
import Setting from '../../../models/Setting';
import { setupDatabaseAndSynchronizer, switchClient } from '../../../testing/test-utils';
import Plugin from '../Plugin';
import JoplinSettings from './JoplinSettings';
import manifestFromObject from '../utils/manifestFromObject';

const createPluginSettingsApi = () => {
	const manifest = manifestFromObject({
		manifest_version: 1,
		id: 'com.example.deprecation-test',
		name: 'Deprecation Test Plugin',
		version: '1.0.0',
		app_min_version: '1.0.0',
	});
	const plugin = new Plugin('/test/plugin', manifest, '', () => {}, '/test/plugin-data');
	return new JoplinSettings(plugin);
};

describe('JoplinSettings deprecation warnings', () => {
	beforeEach(async () => {
		await setupDatabaseAndSynchronizer(1);
		await switchClient(1);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	test('should warn when calling a deprecated method and still return its normal result', async () => {
		const api = createPluginSettingsApi();
		const expectedValue = Setting.value('sync.target');
		const loggerSpy = jest.spyOn(Logger.globalLogger, 'log');

		await expect(api.globalValue('sync.target')).resolves.toBe(expectedValue);

		expect(loggerSpy).toHaveBeenCalledWith(
			LogLevel.Warn,
			'Plugin',
			expect.stringContaining('DEPRECATION NOTICE'),
		);
	});

	test('should not warn when calling a non-deprecated method', async () => {
		const api = createPluginSettingsApi();
		const expectedValue = Setting.value('sync.target');
		const loggerSpy = jest.spyOn(Logger.globalLogger, 'log');

		await expect(api.globalValues(['sync.target'])).resolves.toEqual([expectedValue]);

		expect(loggerSpy).not.toHaveBeenCalledWith(
			LogLevel.Warn,
			'Plugin',
			expect.anything(),
		);
	});
});
