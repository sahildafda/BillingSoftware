const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");
const { Arch } = require("builder-util");

const execAsync = promisify(exec);

exports.default = async function afterPack(context) {
  const serverPath = path.join(context.appOutDir, "resources", "server");

  console.log(`Rebuilding packaged server native modules in ${serverPath}`);

  const electronVersion = context.packager.info.framework.version;
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  await execAsync(`${npmCommand} rebuild better-sqlite3`, {
    cwd: serverPath,
    env: {
      ...process.env,
      npm_config_runtime: "electron",
      npm_config_target: electronVersion,
      npm_config_arch: Arch[context.arch],
      npm_config_disturl: "https://electronjs.org/headers",
    },
    maxBuffer: 10 * 1024 * 1024,
  });
};
