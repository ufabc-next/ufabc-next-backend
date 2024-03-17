import type { History, HistoryModel } from '../types';

export async function createHistory(
  historyModel: HistoryModel,
  history: History,
) {
  const createdHistory = await historyModel.create(history);
  return createdHistory;
}

export async function getHistoryByRA(historyModel: HistoryModel, ra: number) {
  const history = await historyModel.find({ ra });
  return history;
}

export async function getHistoryByID(historyModel: HistoryModel, id: string) {
  const history = await historyModel.findOne({ _id: id });
  return history;
}
