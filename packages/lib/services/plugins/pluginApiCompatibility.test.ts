import { mkdirp, writeFile } from 'fs-extra';
import { join } from 'path';
import Logger, { LogLevel } from '@joplin/utils/Logger';
import PluginService from './PluginService';
import manifestFromObject from './utils/manifestFromObject';
import { setupDatabaseAndSynchronizer, switchClient } from '../../testing/test-utils';
import Setting from '../../models/Setting';
import MockPluginRunner from './testing/MockPluginRunner';
import MockPlatformImplementation from './testing/MockPlatformImplementation';
import reducer, { State, defaultState } from '../../reducer';
import { Action, createStore } from 'redux';

const currentPluginApiVersion = '1.10.0';

const defaultManifest = {
	manifest_version: 1,
	id: 'com.example.plugin-api-version',
	name: 'Plugin API Version Test',
	version: '1.0.0',
	app_min_version: '1.0.0',
	platforms: ['desktop', 'mobile'],
};

const createMockReduxStore = () => createStore((state: State = defaultState, action: Action<string>) => reducer(state, action));

const compatibilityCases: [string, string|undefined, boolean][] = [
	['should allow a manifest with no required plugin API version', undefined, true],
	['should allow a required plugin API version equal to the current version', '1.10.0', true],
	['should allow a required plugin API version lower than the current version', '1.8.0', true],
	['should reject a required plugin API version higher than the current version', '1.11.0', false],
	['should compare plugin API versions numerically rather than lexicographically', '1.9.0', true],
	['should allow a prerelease requirement older than the current stable version', '1.10.0-beta.1', true],
];

describe('plugin API version compatibility', () => {
	beforeEach(async () => {
		await setupDatabaseAndSynchronizer(1);
		await switchClient(1);
	});

	afterEach(async () => {
		for (const id of PluginService.instance().pluginIds) {
			await PluginService.instance().unloadPlugin(id);
		}
		await PluginService.instance().destroy();
		jest.restoreAllMocks();
	});

	test.each(compatibilityCases)('%s', async (_description, requiredVersion, compatible) => {
		const service = PluginService.instance();
		service.initialize(currentPluginApiVersion, new MockPlatformImplementation(), new MockPluginRunner(), createMockReduxStore());

		const manifest = requiredVersion === undefined
			? { ...defaultManifest }
			: { ...defaultManifest, plugin_api_version: requiredVersion };
		expect(service.isCompatible(manifest)).toBe(compatible);
	});

	test('should parse an optional required plugin API version from the manifest', () => {
		const manifest = manifestFromObject({
			...defaultManifest,
			plugin_api_version: currentPluginApiVersion,
		});

		expect(manifest).toHaveProperty('plugin_api_version', currentPluginApiVersion);
	});

	test('should reject a malformed required plugin API version', () => {
		expect(() => manifestFromObject({
			...defaultManifest,
			plugin_api_version: 'not-a-version',
		})).toThrow();
	});

	test('should reject a required plugin API version with the wrong type', () => {
		expect(() => manifestFromObject({
			...defaultManifest,
			plugin_api_version: 1.10,
		})).toThrow();
	});

	test('should disable an incompatible plugin and warn with its name and required and current API versions', async () => {
		const pluginId = 'com.example.plugin-api-version-incompatible';
		const pluginDir = join(Setting.value('pluginDir'), pluginId);
		await mkdirp(pluginDir);
		await writeFile(join(pluginDir, 'manifest.json'), JSON.stringify({
			...defaultManifest,
			id: pluginId,
			name: 'Incompatible API Plugin',
			plugin_api_version: '1.11.0',
		}), 'utf-8');
		await writeFile(join(pluginDir, 'index.js'), 'joplin.plugins.register({ onStart: async function() {} });', 'utf-8');

		const runner = new MockPluginRunner();
		const service = PluginService.instance();
		service.initialize(currentPluginApiVersion, new MockPlatformImplementation(), runner, createMockReduxStore());
		const loggerSpy = jest.spyOn(Logger.globalLogger, 'log');

		await service.loadAndRunPlugins(Setting.value('pluginDir'), Setting.value('plugins.states'));

		expect(runner.runningPluginIds).not.toContain(pluginId);
		expect(service.plugins[pluginId].running).toBe(false);
		const warningText = loggerSpy.mock.calls
			.filter(([level]) => level === LogLevel.Warn)
			.map(([, , ...message]) => message.join(' '))
			.join('\n');
		expect(warningText).toContain('Incompatible API Plugin');
		expect(warningText).toContain('1.11.0');
		expect(warningText).toContain(currentPluginApiVersion);

	});
});
