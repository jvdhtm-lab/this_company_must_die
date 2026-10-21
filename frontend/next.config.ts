import type { NextConfig } from "next";

const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : undefined,
  images: isStaticExport ? { unoptimized: true } : undefined,
  async rewrites() {
    if (isStaticExport) {
      return [];
    }

    return [
      {
        source: "/graphql",
        destination:
          process.env.GRAPHQL_PROXY_TARGET ??
          "http://localhost:8010/polls/graphql/",
      },
    ];
  },
  cacheComponents: !isStaticExport,
  partialPrefetching: !isStaticExport,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
