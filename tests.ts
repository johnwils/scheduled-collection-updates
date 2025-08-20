import { Tinytest } from "meteor/tinytest";
import { Mongo } from "meteor/mongo";

// Define test interface for Tinytest
interface TestContext {
  equal: (actual: unknown, expected: unknown) => void;
  isTrue: (value: boolean) => void;
  isFalse: (value: boolean) => void;
  include: (actual: string, expected: string) => void;
  fail: (message?: string) => void;
  throws: (fn: () => void, expected?: RegExp) => void;
}

// Define test document interface
interface TestDocument {
  _id?: string;
  name?: string;
  status?: string;
  processed?: boolean;
  [key: string]: unknown;
}
import {
  name as packageName,
  configure,
  defineHandlers,
  setCollections,
} from "meteor/johnwils:scheduled-collection-updates";

// Mock collections for testing
const TestCollection = new Mongo.Collection<TestDocument>("testCollection");

// Import the Jobs collection to clear it between tests
import { Jobs } from "meteor/johnwils:scheduled-collection-updates/server/worker";

// Test setup helper
async function resetTest() {
  try {
    await Jobs.removeAsync({});
    await TestCollection.removeAsync({});
    setCollections({}); // Reset collections registry
  } catch {
    // Collections might not exist yet, that's fine
  }
}

// Basic package test
Tinytest.addAsync("package exports correct name", async (test: TestContext) => {
  test.equal(packageName, "scheduled-collection-updates");
});

// Test setCollections
Tinytest.addAsync(
  "setCollections registers collections",
  async (test: TestContext) => {
    await resetTest();

    // Should not throw
    setCollections({ TestCollection });
    test.isTrue(true);
  }
);

// Test configure
Tinytest.addAsync("configure accepts options", async (test: TestContext) => {
  await resetTest();

  // Should not throw
  configure({ pollMs: 1000, leaseSeconds: 10, maxAttempts: 3 });
  test.isTrue(true);
});

// Test defineHandlers
Tinytest.addAsync(
  "defineHandlers registers handlers and returns scheduleUpdate",
  async (test: TestContext) => {
    await resetTest();

    setCollections({ TestCollection });

    const handlers = {
      "TestCollection.testHandler": () => ({
        modifier: { $set: { processed: true } },
      }),
    };

    const result = defineHandlers(handlers);
    test.equal(typeof result.scheduleUpdate, "function");
  }
);

Tinytest.addAsync(
  "defineHandlers throws on invalid handler names",
  async (test: TestContext) => {
    await resetTest();

    test.throws(
      () => defineHandlers({ invalidname: () => ({ modifier: { $set: {} } }) }),
      /Handler key must be "CollectionName.handler"/
    );
  }
);

// Test scheduleUpdate
Tinytest.addAsync(
  "scheduleUpdate creates job successfully",
  async (test: TestContext) => {
    await resetTest();

    setCollections({ TestCollection });

    const { scheduleUpdate } = defineHandlers({
      "TestCollection.process": () => ({
        modifier: { $set: { status: "processed" } },
      }),
    });

    // Insert test document
    const docId = await TestCollection.insertAsync({ name: "test" });

    const jobId = await scheduleUpdate({
      handler: "TestCollection.process",
      targetId: docId,
      delaySeconds: 1,
    });

    test.isTrue(typeof jobId === "string");

    // Verify job was created
    const job = await Jobs.findOneAsync(jobId);
    test.isTrue(job !== null);
    test.equal(job?.handler, "TestCollection.process");
    test.equal(job?.targetId, docId);
  }
);

Tinytest.addAsync(
  "scheduleUpdate throws on unknown collection",
  async (test: TestContext) => {
    await resetTest();

    setCollections({ TestCollection });

    const { scheduleUpdate } = defineHandlers({
      "UnknownCollection.handler": () => ({ modifier: { $set: {} } }),
    });

    try {
      await scheduleUpdate({
        handler: "UnknownCollection.handler",
        targetId: "someId",
        delaySeconds: 1,
      });
      test.fail("Should have thrown an error");
    } catch (error: unknown) {
      if (error instanceof Error) {
        test.include(error.message, "Unknown collection");
      } else {
        test.fail("Error should be an instance of Error");
      }
    }
  }
);

// Test with args
Tinytest.addAsync(
  "scheduleUpdate works with args",
  async (test: TestContext) => {
    await resetTest();

    setCollections({ TestCollection });

    const { scheduleUpdate } = defineHandlers({
      "TestCollection.withArgs": (
        doc: TestDocument | null,
        args: { status?: string }
      ) => ({
        modifier: { $set: { status: args?.status || "default" } },
      }),
    });

    const docId = await TestCollection.insertAsync({ name: "test" });

    const jobId = await scheduleUpdate({
      handler: "TestCollection.withArgs",
      targetId: docId,
      delaySeconds: 0,
      args: { status: "custom" },
    });

    test.isTrue(typeof jobId === "string");
  }
);

Tinytest.addAsync(
  "scheduleUpdate supports delete operations",
  async (test: TestContext) => {
    await resetTest();

    setCollections({ TestCollection });

    const { scheduleUpdate } = defineHandlers({
      "TestCollection.deleteExpired": (doc: TestDocument | null) => {
        if (!doc || doc.status !== "expired") return { noop: true };
        return {
          selector: { status: "expired" },
          delete: true,
        };
      },
    });

    const docId = await TestCollection.insertAsync({
      name: "test",
      status: "expired",
    });

    const jobId = await scheduleUpdate({
      handler: "TestCollection.deleteExpired",
      targetId: docId,
      delaySeconds: 0,
    });

    test.isTrue(typeof jobId === "string");
  }
);
