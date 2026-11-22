import { runSyncModule, SyncModuleError, SyncModuleName, unwrapSyncModuleError } from './SyncModuleRunner';

describe('SyncModuleRunner', () => {
	test('runs modules and preserves their successful result', async () => {
		const calls: string[] = [];

		await runSyncModule(SyncModuleName.UpdateRemote, async () => {
			calls.push('update_remote');
		});

		expect(calls).toEqual(['update_remote']);
	});

	test('stops execution and identifies the failed module', async () => {
		const error = new Error('module failed');

		await expect(runSyncModule(SyncModuleName.Delta, async () => {
			throw error;
		})).rejects.toMatchObject({
			moduleName: SyncModuleName.Delta,
			cause: error,
		});
	});

	test('unwraps a module error back to the original error', async () => {
		const error = Object.assign(new Error('module failed'), { code: 'testCode', details: 'testDetails' });
		let thrownError: unknown = null;

		try {
			await runSyncModule(SyncModuleName.DeleteRemote, async () => {
				throw error;
			});
		} catch (moduleError) {
			thrownError = moduleError;
		}

		expect(thrownError).toBeInstanceOf(SyncModuleError);
		expect(unwrapSyncModuleError(thrownError)).toBe(error);
	});
});
