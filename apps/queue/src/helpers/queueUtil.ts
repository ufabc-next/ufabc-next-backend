import { Config } from '@/config/config';
import {
  Queue,
  Worker,
  type RedisOptions,
  type Processor,
  type WorkerOptions,
} from 'bullmq';

const connection = {
  username: Config.REDIS_USER,
  password: Config.REDIS_PASSWORD,
  host: Config.HOST,
  port: Config.REDIS_PORT,
} satisfies RedisOptions;

/**
 * Creates a queue with the given name
 * creates a connection in every instance(aka if you have 3 instances, it will create 3 connections)
 * */
export const createQueue = (name: string) => new Queue(name, { connection });

/**
 * Creates a worker attached to a given queue
 * */
export function createWorker<TJobData>(
  queueName: string,
  processor?: Processor<TJobData>,
  opts?: WorkerOptions,
) {
  return new Worker(queueName, processor, { connection, ...opts });
}