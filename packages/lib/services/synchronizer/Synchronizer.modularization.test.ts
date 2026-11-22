import Folder from '../../models/Folder';
import Note from '../../models/Note';
import { remoteNotesAndFolders } from '../../testing/test-utils-synchronizer';
import { afterAllCleanUp, fileApi, setupDatabaseAndSynchronizer, synchronizer, synchronizerStart, switchClient } from '../../testing/test-utils';

describe('Synchronizer modularization', () => {
	beforeEach(async () => {
		await setupDatabaseAndSynchronizer(1);
		await setupDatabaseAndSynchronizer(2);
		await switchClient(1);
		synchronizer().dispatch = jest.fn();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	afterAll(async () => {
		await afterAllCleanUp();
	});

	test('preserves the existing upload and download behaviour', async () => {
		const folder = await Folder.save({ title: 'folder' });
		const note = await Note.save({ title: 'note', parent_id: folder.id });

		await synchronizerStart();
		await switchClient(2);
		await synchronizerStart();

		expect(await Folder.load(folder.id)).toMatchObject({ title: 'folder' });
		expect(await Note.load(note.id)).toMatchObject({ title: 'note', parent_id: folder.id });
		expect(await remoteNotesAndFolders()).toHaveLength(2);
	});

	test('returns to idle and completes the sync when a module fails', async () => {
		const error = new Error('initialization failed');
		jest.spyOn(fileApi(), 'initialize').mockRejectedValueOnce(error);

		await expect(synchronizerStart(null, { throwOnError: false })).resolves.toBeDefined();

		expect(synchronizer().state()).toBe('idle');
		expect(synchronizer().dispatch).toHaveBeenCalledWith({
			type: 'SYNC_COMPLETED',
			isFullSync: true,
		});
	});

	test('logs the failed module and original error clearly', async () => {
		const error = new Error('initialization failed');
		jest.spyOn(fileApi(), 'initialize').mockRejectedValueOnce(error);
		const consoleLogs = [
			jest.spyOn(console, 'log').mockImplementation(() => {}),
			jest.spyOn(console, 'info').mockImplementation(() => {}),
			jest.spyOn(console, 'warn').mockImplementation(() => {}),
			jest.spyOn(console, 'error').mockImplementation(() => {}),
		];

		await synchronizerStart(null, { throwOnError: false });

		expect(consoleLogs.some(log => log.mock.calls.some(call => call.includes(error) && call.some(value => String(value).includes('Synchronizer module "initialization" failed:'))))).toBe(true);
	});
});
