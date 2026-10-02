// usageledger reads the ledger with node:sqlite (or DuckDB), so it runs on the server, unbundled.
/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['usageledger', '@duckdb/node-api'],
};

export default nextConfig;
