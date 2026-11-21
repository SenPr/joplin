import Logger, { LoggerWrapper } from '@joplin/utils/Logger';
import BaseItem from '../../models/BaseItem';
import TaskQueue from '../../TaskQueue';
import { RemoteItem } from '../../file-api';
import { BaseItemEntity } from '../database/types';
import { ApiCallFunction } from './utils/types';

export default class RemoteItemDownloader {
	private queue_: TaskQueue;
	private apiCall_: ApiCallFunction;

	public constructor(apiCall: ApiCallFunction, logger: Logger | LoggerWrapper) {
		this.queue_ = new TaskQueue('syncDownload', logger);
		this.apiCall_ = apiCall;
	}

	public stop() {
		return this.queue_.stop();
	}

	public queueDownloads(
		remotes: RemoteItem[],
		locals: BaseItemEntity[],
		supportsDeltaWithItems: boolean,
		supportsAccurateTimestamp: boolean,
		isCancelling: ()=> boolean,
	) {
		for (const remote of remotes) {
			if (isCancelling()) break;

			let needsToDownload = true;
			if (supportsAccurateTimestamp) {
				const local = locals.find(item => item.id === BaseItem.pathToId(remote.path));
				if (local && local.updated_time === remote.jop_updated_time) needsToDownload = false;
			}

			if (supportsDeltaWithItems) needsToDownload = false;

			if (needsToDownload) {
				this.queue_.push(remote.path, async () => {
					return this.apiCall_('get', remote.path);
				});
			}
		}
	}

	public async loadContent(remote: RemoteItem, supportsDeltaWithItems: boolean) {
		if (supportsDeltaWithItems) return remote.jopItem;

		const task = await this.queue_.waitForResult(remote.path);
		if (task.error) throw task.error;
		if (!task.result) return null;
		return await BaseItem.unserialize(task.result as string);
	}
}
