import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node24",
  clean: true,
  // Bundle our workspace packages (they ship TypeScript source); load every
  // third-party package from node_modules, so each must be a dependency here.
  noExternal: [/^@sendcoop\//],
  external: [/^(?!@sendcoop\/|\.|\/)/],
});
