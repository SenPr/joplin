import Logger from '@joplin/utils/Logger';
import BaseItem from '../../models/BaseItem';
import TaskQueue from '../../TaskQueue';
import { RemoteItem } from '../../file-api';
import { BaseItemEntity } from '../database/types';
import RemoteItemDownloader from './RemoteItemDownloader';
import { ApiCallFunction } from './utils/types';

type QueuedTask = {
	id: string;
	callback: ()=> Promise<unknown>;
};

const createDownloader = (apiCall: ApiCallFunction) => {
	const queuedTasks: QueuedTask[] = [];
	const pushSpy = jest.spyOn(TaskQueue.prototype, 'push').mockImplementation((id, callback) => {
		queuedTasks.push({ id, callback });
	});

	return {
		downloader: new RemoteItemDownloader(apiCall, Logger.create('RemoteItemDownloader.test')),
		queuedTasks,
		pushSpy,
	};
};

const remoteItem = (id: string, properties: Partial<RemoteItem> = {}): RemoteItem => ({
	id,
	path: `${id}.md`,
	...properties,
});

describe('RemoteItemDownloader', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('queues and loads a downloaded item', async () => {
		const remote = remoteItem('note-id');
		const content = { id: remote.id, title: 'Downloaded note' };
		const apiCall: ApiCallFunction = jest.fn(async () => 'serialized item');
		const { downloader, queuedTasks, pushSpy } = createDownloader(apiCall);
		jest.spyOn(TaskQueue.prototype, 'waitForResult').mockResolvedValue({
			id: remote.path,
			result: 'serialized item',
		});
		const unserializeSpy = jest.spyOn(BaseItem, 'unserialize').mockResolvedValue(content);

		downloader.queueDownloads([remote], [], false, false, () => false);

		expect(pushSpy).toHaveBeenCalledWith(remote.path, expect.any(Function));
		await expect(queuedTasks[0].callback()).resolves.toBe('serialized item');
		expect(apiCall).toHaveBeenCalledWith('get', remote.path);
		await expect(downloader.loadContent(remote, false)).resolves.toBe(content);
		expect(unserializeSpy).toHaveBeenCalledWith('serialized item');
	});

	it('propagates a failed download', async () => {
		const remote = remoteItem('note-id');
		const downloadError = new Error('Download failed');
		const apiCall: ApiCallFunction = jest.fn(async (): Promise<unknown> => {
			throw downloadError;
		});
		const { downloader, queuedTasks } = createDownloader(apiCall);
		jest.spyOn(TaskQueue.prototype, 'waitForResult').mockResolvedValue({
			id: remote.path,
			result: null,
			error: downloadError,
		});

		downloader.queueDownloads([remote], [], false, false, () => false);

		await expect(queuedTasks[0].callback()).rejects.toBe(downloadError);
		await expect(downloader.loadContent(remote, false)).rejects.toBe(downloadError);
	});

	it('stops queueing when cancellation is requested', () => {
		const remotes = [remoteItem('first'), remoteItem('second')];
		const apiCall: ApiCallFunction = jest.fn(async (): Promise<unknown> => null);
		const { downloader, queuedTasks } = createDownloader(apiCall);
		let cancellationChecks = 0;

		downloader.queueDownloads(remotes, [], false, false, () => ++cancellationChecks > 1);

		expect(queuedTasks.map(task => task.id)).toEqual([remotes[0].path]);
		expect(apiCall).not.toHaveBeenCalled();
	});

	it('skips downloads for inline delta items and matching accurate timestamps', async () => {
		const inlineItem = { id: 'inline-note', title: 'From delta' };
		const inlineRemote = remoteItem(inlineItem.id, { jopItem: inlineItem });
		const timestampRemote = remoteItem('timestamp-note', { jop_updated_time: 123 });
		const locals: BaseItemEntity[] = [{ id: 'timestamp-note', updated_time: 123 }];
		const apiCall: ApiCallFunction = jest.fn(async (): Promise<unknown> => null);
		const { downloader, queuedTasks, pushSpy } = createDownloader(apiCall);

		downloader.queueDownloads([inlineRemote], [], true, false, () => false);
		downloader.queueDownloads([timestampRemote], locals, false, true, () => false);

		expect(pushSpy).not.toHaveBeenCalled();
		expect(queuedTasks).toHaveLength(0);
		await expect(downloader.loadContent(inlineRemote, true)).resolves.toBe(inlineItem);
		expect(apiCall).not.toHaveBeenCalled();
	});
});
