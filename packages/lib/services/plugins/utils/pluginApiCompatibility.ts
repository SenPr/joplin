import { compareVersions } from 'compare-versions';
import { PluginManifest } from './types';

export enum PluginApiCompatibilityStatus {
	Supported = 'supported',
	Deprecated = 'deprecated',
	Unsupported = 'unsupported',
}

export interface PluginApiCompatibility {
	status: PluginApiCompatibilityStatus;
	requiredVersion: string|undefined;
	currentVersion: string;
}

export const oldestSupportedPluginApiVersion = '1.0.0';
export const deprecatedPluginApiVersionThreshold = '1.9.0';

export const getPluginApiCompatibility = (
	currentVersion: string,
	manifest: Pick<PluginManifest, 'plugin_api_version'>,
): PluginApiCompatibility => {
	const requiredVersion = manifest.plugin_api_version;
	if (!requiredVersion) {
		return {
			status: PluginApiCompatibilityStatus.Supported,
			requiredVersion,
			currentVersion,
		};
	}

	if (compareVersions(requiredVersion, currentVersion) > 0) {
		return {
			status: PluginApiCompatibilityStatus.Unsupported,
			requiredVersion,
			currentVersion,
		};
	}

	if (compareVersions(requiredVersion, oldestSupportedPluginApiVersion) < 0) {
		return {
			status: PluginApiCompatibilityStatus.Unsupported,
			requiredVersion,
			currentVersion,
		};
	}

	if (compareVersions(requiredVersion, deprecatedPluginApiVersionThreshold) < 0) {
		return {
			status: PluginApiCompatibilityStatus.Deprecated,
			requiredVersion,
			currentVersion,
		};
	}

	return {
		status: PluginApiCompatibilityStatus.Supported,
		requiredVersion,
		currentVersion,
	};
};

export const describePluginApiIncompatibility = (compatibility: PluginApiCompatibility): string|undefined => {
	if (!compatibility.requiredVersion) return undefined;
	if (compatibility.status === PluginApiCompatibilityStatus.Unsupported) {
		return `This plugin requires Plugin API version ${compatibility.requiredVersion}, but Joplin currently provides ${compatibility.currentVersion}.`;
	}
	return undefined;
};
