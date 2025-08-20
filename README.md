# johnner:scheduled-collection-updates

Schedule MongoDB updates with Meteor reactivity, restart-safe, and multi-container support.

## Install

```bash
meteor add johnner:scheduled-collection-updates
```

## Quick Start

1. **Register collections** (server startup):

```ts
import { setCollections } from "meteor/johnner:scheduled-collection-updates";
import { Tests } from "/imports/api/tests";

setCollections({ Tests });
```

2. **Define handlers** (`CollectionName.handler` format):

```ts
import { defineHandlers } from "meteor/johnner:scheduled-collection-updates";

const { scheduleUpdate } = defineHandlers({
  "Tests.expireIfProcessing": async (doc) => {
    if (!doc || doc.status !== "processing") return { noop: true };

    return {
      selector: { status: "processing" }, // Atomic operation (only process if status is processing)
      modifier: { $set: { status: "expired", expiredAt: new Date() } },
    };
  },
  "Tests.setStatus": (doc, args: { status: string }) => ({
    selector: { status: "pending" },
    modifier: { $set: { status: args.status } },
  }),
} as const);
```

3. **Schedule job**:

```ts
await scheduleUpdate({
  targetId: "docId",
  delaySeconds: 30,
  handler: "Tests.expireIfProcessing",
});

// With args
await scheduleUpdate({
  targetId: "docId",
  delaySeconds: 10,
  handler: "Tests.setStatus",
  args: { status: "active" },
});
```

## How It Works

- Jobs stored in `ttlUpdateJobs` Mongo collection.
- Worker polls, claims jobs with atomic `findOneAndUpdate`, and runs handlers.
- Updates use Meteor's collection methods for reactivity.
- Leases ensure one worker per job; expired leases are reclaimed.
- Jobs retry on failure up to `maxAttempts`.
- Handlers must be idempotent (same result if executed multiple times).

## API

### `setCollections(map)`

Register collections:

```ts
setCollections({ Tests, Files });
```

### `defineHandlers(handlers) → { scheduleUpdate }`

Define handlers and get typed `scheduleUpdate`:

```ts
const { scheduleUpdate } = defineHandlers({
  "Files.setProcessing": (doc) => ({
    selector: { status: "enabled" },
    modifier: { $set: { status: "processing" } },
  }),
} as const);
```

### `scheduleUpdate(params) → Promise<string>`

Schedule job, returns job ID:

```ts
await scheduleUpdate({
  targetId: "docId",
  delaySeconds: 10,
  handler: "Files.setProcessing",
  args: {
    /* optional */
  },
});
```

### Handler

```ts
(doc: any | null, args: any, ctx: { now: Date; jobId: string }) =>
  Promise<HandlerResult | null> | HandlerResult | null;
interface HandlerResult {
  selector?: Mongo.Selector<any>;
  modifier?: Mongo.Modifier<any>;
  options?: { multi?: boolean; upsert?: boolean; [key: string]: unknown };
  delete?: boolean;
  noop?: boolean;
}
```

**Atomic Operations:**

- **Update**: Query becomes `{ _id: targetId, ...selector }`, then applies `modifier`.
- **Delete**: Query becomes `{ _id: targetId, ...selector }`, then removes document.
- **Noop**: No database operation performed.
  The `selector` provides additional conditions beyond the target document ID, enabling conditional operations.

## Configuration

Defaults (dev/prod):

- Dev: `pollMs: 250`, `leaseSeconds: 5`, `maxAttempts: 5`
- Prod: `pollMs: 1000`, `leaseSeconds: 15`, `maxAttempts: 5`
  Override:

```ts
import { configure } from "meteor/johnner:scheduled-collection-updates";

configure({ pollMs: 500, leaseSeconds: 30, maxAttempts: 3 });
```

**Performance Notes**:

- Smaller `pollMs` increases responsiveness but raises database load.
- Longer `leaseSeconds` reduces contention but delays lease reclamation.

## Observability

- Collection: `ttlUpdateJobs`
- Statuses: `queued`, `processing`, `done`, `failed`
- Fields: `dueAt`, `leasedUntil`, `attempts`, `workerId`, `lastError`
- Indexes: `{ status, dueAt, leasedUntil, attempts }`, TTL on `createdAt` (7 days)
  Inspect:

```js
// Queued jobs
db.ttlUpdateJobs
  .find({ status: "queued", dueAt: { $lte: new Date() } })
  .sort({ dueAt: 1 });

// Failed jobs
db.ttlUpdateJobs
  .find({ status: "failed" })
  .forEach((job) => print(job.lastError));
```

## Error Handling

If a handler throws an error, the job is marked `failed` with `lastError` set. Jobs retry up to `maxAttempts` before stopping. Check `ttlUpdateJobs` for debugging.

## Multi-Container Setup

Ensure all instances share the same MongoDB database. The `workerId` (`Meteor.release:process.pid`) prevents duplicate processing.

## Testing Recommendations

Test handlers with `Tinytest` or similar, simulating document states and args. Mock `Jobs` collection to test worker behavior without polling.

## Notes

- Requires Meteor 3.0+ and MongoDB. Ensure `mongo` and `typescript` packages are installed.
- Handlers should be idempotent (at-least-once execution).
- MIT License.
