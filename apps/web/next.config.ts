import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@rounds/domain"],
  serverExternalPackages: ["@node-rs/argon2"],
};
export default config;
