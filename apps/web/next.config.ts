import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@printerhub/contracts"],
  poweredByHeader: false,
  agentRules: false,
};

export default config;
