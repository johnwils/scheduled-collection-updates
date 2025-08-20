Package.describe({
  name: "johnner:scheduled-collection-updates",
  version: "1.0.2",
  summary:
    "Schedule conditional MongoDB collection updates (reactive, restart-safe, multi-container).",
  git: "https://github.com/johnwils/scheduled-collection-updates",
  documentation: "README.md",
});

Package.onUse(function (api) {
  api.versionsFrom("3.0.3");
  api.use([
    "ecmascript",
    "typescript",
    "mongo",
    "meteor",
    "zodern:types@1.0.13",
  ]);
  api.mainModule("index.ts", "server");
});

Package.onTest(function (api) {
  api.versionsFrom("3.0.3");
  api.use([
    "ecmascript",
    "typescript",
    "mongo",
    "meteor",
    "zodern:types@1.0.13",
  ]);
  api.use("tinytest");
  api.use("johnner:scheduled-collection-updates");
  api.mainModule("tests.ts", "server");
});
