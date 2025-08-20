import type { Mongo } from "meteor/mongo";
import type {
  UpdateHandler,
  Job,
  ScheduleParams,
  DefineHandlersReturn,
  ConfigureOptions,
  BaseDocument,
} from "./types";
import { startWorker, Jobs } from "./worker";

let collectionMap: Record<string, Mongo.Collection<BaseDocument>> = {};

export function setCollections(
  map: Record<string, Mongo.Collection<BaseDocument>>
) {
  collectionMap = { ...map };
}

function resolveCollection(name: string): Mongo.Collection<BaseDocument> {
  const coll = collectionMap[name];
  if (!coll) {
    throw new Error(
      `Unknown collection "${name}". Call setCollections({ ${name} }) first.`
    );
  }
  return coll;
}

function parseHandler(handler: string): { collection: string; name: string } {
  const idx = handler.indexOf(".");
  if (idx <= 0) {
    throw new Error(`Handler key must be "CollectionName.handler": ${handler}`);
  }
  return { collection: handler.slice(0, idx), name: handler };
}

const HANDLERS = new Map<string, UpdateHandler>();

export function configure(opts: ConfigureOptions) {
  startWorker.configure(opts);
}

async function _scheduleUpdate(
  params: ScheduleParams<string>
): Promise<string> {
  const { targetId, delaySeconds, handler, args } = params;
  if (!targetId || typeof targetId !== "string") {
    throw new Error("Invalid targetId");
  }
  const { collection } = parseHandler(handler);
  resolveCollection(collection);
  const dueAt = new Date(Date.now() + delaySeconds * 1000);
  const id = await Jobs.insertAsync({
    targetCollection: collection,
    targetId,
    handler,
    args,
    dueAt,
    status: "queued",
    attempts: 0,
    createdAt: new Date(),
  } as Job);
  console.log(
    `scheduled-collection-updates: scheduled ${id} for ${handler} due ${dueAt.toISOString()}`
  );
  return id;
}

export function defineHandlers<H extends Record<string, UpdateHandler>>(
  handlers: H
): DefineHandlersReturn<H> {
  for (const name of Object.keys(handlers) as (keyof H & string)[]) {
    parseHandler(name); // Validate format
    if (HANDLERS.has(name)) {
      throw new Error(`Handler already registered: ${name}`);
    }
    if (!handlers[name]) {
      throw new Error(`Handler function for "${name}" is undefined`);
    }
    HANDLERS.set(name, handlers[name]);
  }
  startWorker.boot();
  return {
    scheduleUpdate: (params: ScheduleParams<keyof H & string>) =>
      _scheduleUpdate(params),
  };
}

export const _internal = {
  HANDLERS,
  resolveCollection,
};
