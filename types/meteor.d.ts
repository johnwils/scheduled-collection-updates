// Type declarations for Meteor modules used in tests

declare module "meteor/tinytest" {
  export interface TestContext {
    equal: (actual: unknown, expected: unknown) => void;
    isTrue: (value: boolean) => void;
    isFalse: (value: boolean) => void;
    include: (actual: string, expected: string) => void;
    fail: (message?: string) => void;
    throws: (fn: () => void, expected?: RegExp) => void;
  }

  export const Tinytest: {
    add: (name: string, func: (test: TestContext) => void) => void;
    addAsync: (
      name: string,
      func: (test: TestContext) => Promise<void>
    ) => void;
  };
}
