import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: without this, requests arriving on an origin other than the one the dev server
  // prints (127.0.0.1, or a LAN IP when testing on a phone) are blocked and the client bundle
  // never loads, so the page renders but never hydrates.
  allowedDevOrigins: ["127.0.0.1", "192.168.50.71"],
};

export default nextConfig;
