const FS = require("fs");
const Path = require("path");

const { frontDependencies } = require("./package.json");

tryLink(
  "./dist/front/public/styles",
  Path.resolve(__dirname, "./src/front/styles"),
  "dir"
);
if (!FS.existsSync("./dist/front/public/libs")) {
  FS.mkdirSync("./dist/front/public/libs");
}
for (const [k, v] of Object.entries(frontDependencies)) {
  const path = `./dist/front/public/libs/${k}`;
  const dest = Path.resolve(__dirname, `./node_modules/${v}`);

  tryLink(path, dest, "dir");
}
function tryLink(path, dest, type) {
  try {
    FS.readlinkSync(path);
  } catch (e) {
    if (FS.existsSync()) {
      return;
    }
    FS.symlinkSync(dest, path, type);
  }
}
process.exit();
