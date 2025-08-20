import type { Mongo } from "meteor/mongo";

// Define a base document type for Meteor collections
export interface BaseDocument {
  _id?: string;
  [key: string]: unknown;
}

// Define update options type for Meteor
export interface UpdateOptions {
  multi?: boolean;
  upsert?: boolean;
  [key: string]: unknown;
}

export type JobStatus = "queued" | "processing" | "done" | "failed";

export interface Job {
  _id?: string;
  targetCollection: string;
  targetId: string;
  handler: string;
  args?: unknown;
  dueAt: Date;
  status: JobStatus;
  attempts: number;
  leasedUntil?: Date;
  workerId?: string;
  lastError?: string;
  createdAt: Date;
}

export interface HandlerResult {
  selector?: Mongo.Selector<BaseDocument>;
  modifier?: Mongo.Modifier<BaseDocument>;
  options?: UpdateOptions;
  delete?: boolean;
  noop?: boolean;
}

export type UpdateHandler = (
  doc: BaseDocument | null,
  args: any,
  ctx: { now: Date; jobId: string }
) => HandlerResult | null | Promise<HandlerResult | null>;

export interface ScheduleParams<H extends string = string> {
  targetId: string;
  delaySeconds: number;
  handler: H;
  args?: unknown;
}

export interface DefineHandlersReturn<H extends Record<string, UpdateHandler>> {
  scheduleUpdate: (params: ScheduleParams<keyof H & string>) => Promise<string>;
}

export interface ConfigureOptions {
  pollMs?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
}
