import { afterAllCleanUp, fileApi, setupDatabaseAndSynchronizer, sleep, synchronizerStart, switchClient } from '../../testing/test-utils';
import Folder from '../../models/Folder';
import Note from '../../models/Note';
import BaseItem from '../../models/BaseItem';

describe('Synchronizer.remoteItems', () => {
	beforeEach(async () => {
		await setupDatabaseAndSynchronizer(1);
		await setupDatabaseAndSynchronizer(2);
		await switchClient(1);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	afterAll(async () => {
		await afterAllCleanUp();
	});

	it('downloads remote items and creates them locally', async () => {
		const folder = await Folder.save({ title: 'Remote folder' });
		const note = await Note.save({ title: 'Remote note', body: 'Remote body', parent_id: folder.id });
		await synchronizerStart();

		await switchClient(2);
		const get = fileApi().get.bind(fileApi());
		const getSpy = jest.spyOn(fileApi(), 'get').mockImplementation((path, options) => get(path, options));

		await synchronizerStart();

		expect(getSpy).toHaveBeenCalledWith(`${note.id}.md`);
		expect(await Folder.load(folder.id)).toMatchObject({ title: 'Remote folder' });
		expect(await Note.load(note.id)).toMatchObject({
			title: 'Remote note',
			body: 'Remote body',
			parent_id: folder.id,
		});
	});

	it('applies downloaded updates to existing local items', async () => {
		const folder = await Folder.save({ title: 'Folder' });
		const note = await Note.save({ title: 'Original title', body: 'Original body', parent_id: folder.id });
		await synchronizerStart();

		await switchClient(2);
		await synchronizerStart();

		await switchClient(1);
		await Note.save({ id: note.id, title: 'Updated title', body: 'Updated body' });
		await synchronizerStart();

		await switchClient(2);
		await synchronizerStart();

		expect(await Note.load(note.id)).toMatchObject({
			title: 'Updated title',
			body: 'Updated body',
			parent_id: folder.id,
		});
	});

	it('deletes local items that were deleted remotely', async () => {
		const folder = await Folder.save({ title: 'Folder' });
		const note = await Note.save({ title: 'Remote note', parent_id: folder.id });
		await synchronizerStart();

		await switchClient(2);
		await synchronizerStart();

		await switchClient(1);
		await Note.delete(note.id);
		await synchronizerStart();

		await switchClient(2);
		await synchronizerStart();

		expect(await Note.load(note.id)).toBeUndefined();
		expect(await Folder.load(folder.id)).toBeDefined();
	});

	it('preserves local data after a failed download and retries successfully', async () => {
		const folder = await Folder.save({ title: 'Folder' });
		const note = await Note.save({ title: 'Original title', parent_id: folder.id });
		await synchronizerStart();

		await switchClient(2);
		await synchronizerStart();

		await switchClient(1);
		await Note.save({ id: note.id, title: 'Remote update' });
		await synchronizerStart();

		await switchClient(2);
		const get = fileApi().get.bind(fileApi());
		let shouldFail = true;
		jest.spyOn(fileApi(), 'get').mockImplementation((path, options) => {
			if (path === `${note.id}.md` && shouldFail) {
				shouldFail = false;
				return Promise.reject(new Error('Download failed'));
			}
			return get(path, options);
		});

		await expect(synchronizerStart(2, { syncSteps: ['delta'], throwOnError: true })).rejects.toThrow('Download failed');
		expect(await Note.load(note.id)).toMatchObject({ title: 'Original title' });

		await synchronizerStart(2, { syncSteps: ['delta'] });
		expect(await Note.load(note.id)).toMatchObject({ title: 'Remote update' });
	});

	it('preserves a newer local change and resolves it as a conflict on the next sync', async () => {
		const folder = await Folder.save({ title: 'Folder' });
		const note = await Note.save({ title: 'Original title', parent_id: folder.id });
		await synchronizerStart();

		await switchClient(2);
		await synchronizerStart();
		await sleep(0.1);
		await Note.save({ id: note.id, title: 'Remote change' });
		await synchronizerStart();

		await switchClient(1);
		const loadItemsByIds = BaseItem.loadItemsByIds.bind(BaseItem);
		const loadItemsByIdsSpy = jest.spyOn(BaseItem, 'loadItemsByIds').mockImplementation(async ids => {
			const items = await loadItemsByIds(ids);
			if (ids.includes(note.id)) {
				await sleep(0.1);
				await Note.save({ id: note.id, title: 'Newer local change' });
			}
			return items;
		});

		try {
			await synchronizerStart(null, { syncSteps: ['delta'] });
		} finally {
			loadItemsByIdsSpy.mockRestore();
		}

		expect((await Note.load(note.id)).title).toBe('Newer local change');

		await synchronizerStart();

		expect((await Note.load(note.id)).title).toBe('Remote change');
		expect((await Note.conflictedNotes()).map(conflictedNote => conflictedNote.title)).toContain('Newer local change');
	});
});
