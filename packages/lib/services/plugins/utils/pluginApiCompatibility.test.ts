import {
	getPluginApiCompatibility,
	PluginApiCompatibilityStatus,
	describePluginApiIncompatibility,
} from './pluginApiCompatibility';

describe('pluginApiCompatibility', () => {
	test('should support a plugin that declares no API version', () => {
		expect(getPluginApiCompatibility('1.10.0', {}).status).toBe(PluginApiCompatibilityStatus.Supported);
	});

	test('should mark an older API version as deprecated while remaining compatible', () => {
		expect(getPluginApiCompatibility('1.10.0', { plugin_api_version: '1.8.0' }).status)
			.toBe(PluginApiCompatibilityStatus.Deprecated);
	});

	test('should mark a future API version as unsupported', () => {
		const compatibility = getPluginApiCompatibility('1.10.0', { plugin_api_version: '1.11.0' });
		expect(compatibility.status).toBe(PluginApiCompatibilityStatus.Unsupported);
		expect(describePluginApiIncompatibility(compatibility))
			.toContain('requires Plugin API version 1.11.0');
	});

	test('should mark an API version below the oldest supported version as unsupported', () => {
		expect(getPluginApiCompatibility('1.10.0', { plugin_api_version: '0.9.0' }).status)
			.toBe(PluginApiCompatibilityStatus.Unsupported);
	});
});
