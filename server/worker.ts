import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
import { _internal } from "./runtime";
import type { Job } from "./types";

export const Jobs = new Mongo.Collection<Job>("ttlUpdateJobs");

type Opts = { pollMs: number; leaseSeconds: number; maxAttempts: number };
const state: { configured?: Opts; timer?: ReturnType<typeof setTimeout>; booted?: boolean } = {};

const DEFAULTS: Opts = Meteor.isDevelopment
  ? { pollMs: 250, leaseSeconds: 5, maxAttempts: 5 }
  : { pollMs: 1000, leaseSeconds: 15, maxAttempts: 5 };

function opts(): Opts {
  return state.configured ?? DEFAULTS;
}

async function claimJob(): Promise<Job | null> {
  const { maxAttempts, leaseSeconds } = opts();
  const now = new Date();
  const lease = new Date(Date.now() + leaseSeconds * 1000);
  const workerId = `${Meteor.release || "app"}:${process.pid}`;
  const res = await Jobs.rawCollection().findOneAndUpdate(
    {
      $or: [
        { status: "queued", dueAt: { $lte: now }, $or: [{ leasedUntil: { $exists: false } }, { leasedUntil: { $lte: now } }] },
        { status: "processing", leasedUntil: { $lte: now } },
      ],
      attempts: { $lt: maxAttempts },
    },
    { $set: { status: "processing", leasedUntil: lease, workerId }, $inc: { attempts: 1 } },
    { sort: { dueAt: 1, createdAt: 1 }, returnDocument: "after" }
  );
  return (res && typeof res === "object" && "value" in res ? res.value : res) || null;
}

async function runJob(job: Job) {
  if (!job._id) throw new Error("Job ID missing");
  const handler = _internal.HANDLERS.get(job.handler);
  if (!handler) throw new Error(`Missing handler: ${job.handler}`);
  const coll = _internal.resolveCollection(job.targetCollection);
  const doc = await coll.findOneAsync(job.targetId);
  const result = await handler(doc ?? null, job.args, { now: new Date(), jobId: job._id });
  if (!result || result.noop) return;
  const query = result.selector ? { _id: job.targetId, ...result.selector } : { _id: job.targetId };
  if (result.delete) {
    await coll.removeAsync(query);
  } else {
    if (!result.modifier) throw new Error("Modifier required for update");
    await coll.updateAsync(query, result.modifier, result.options);
  }
}

async function tick() {
  let job: Job | null = null;
  try {
    job = await claimJob();
    if (!job) return;
    await runJob(job);
    await Jobs.updateAsync(job._id!, { $set: { status: "done" }, $unset: { leasedUntil: 1 } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("scheduled-collection-updates worker error", { jobId: job?._id, handler: job?.handler, message });
    if (job?._id) {
      await Jobs.updateAsync(job._id, { $set: { status: "failed", lastError: message }, $unset: { leasedUntil: 1 } }).catch((e) =>
        console.error("Failed to update job status", e)
      );
    }
  }
}

async function ensureIndexes() {
  await Jobs.rawCollection().createIndex({ status: 1, dueAt: 1, leasedUntil: 1, attempts: 1 });
  await Jobs.rawCollection().createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });
}

function boot() {
  if (state.booted) return;
  state.booted = true;
  Meteor.startup(async () => {
    await ensureIndexes();
    const { pollMs } = opts();
    state.timer = setInterval(() => void tick(), pollMs);
    process.on("exit", () => state.timer && clearInterval(state.timer));
  });
}

function configure(partial: Partial<Opts>) {
  state.configured = { ...DEFAULTS, ...partial };
}

export const startWorker = { boot, configure };
