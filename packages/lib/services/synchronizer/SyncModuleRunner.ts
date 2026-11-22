export enum SyncModuleName {
	Initialization = 'initialization',
	DeleteRemote = 'delete_remote',
	UpdateRemote = 'update_remote',
	Delta = 'delta',
	Finalization = 'finalization',
}

export class SyncModuleError extends Error {
	public readonly moduleName: SyncModuleName;
	public readonly cause: Error;

	public constructor(moduleName: SyncModuleName, cause: Error) {
		super(cause.message);
		this.name = 'SyncModuleError';
		this.moduleName = moduleName;
		this.cause = cause;

		const source = cause as Error & { code?: unknown; details?: unknown };
		if (source.code !== undefined) (this as Error & { code?: unknown }).code = source.code;
		if (source.details !== undefined) (this as Error & { details?: unknown }).details = source.details;
	}
}

export const runSyncModule = async (moduleName: SyncModuleName, operation: ()=> Promise<void>): Promise<void> => {
	try {
		await operation();
	} catch (error) {
		throw new SyncModuleError(moduleName, error instanceof Error ? error : new Error(String(error)));
	}
};

export const unwrapSyncModuleError = (error: unknown) => {
	if (error instanceof SyncModuleError) return error.cause;
	return error as Error & { code?: string; details?: unknown };
};
