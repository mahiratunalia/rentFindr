/**
 * Vercel injects VERCEL_URL on every deployment, so NEXTAUTH_URL never has to be
 * guessed. NextAuth v4 throws `new URL('')` during prerender if NEXTAUTH_URL is
 * present but empty — an empty value is worse than no value — so normalise it
 * here before the build reads it.
 */
const authUrl =
  (process.env.NEXTAUTH_URL && process.env.NEXTAUTH_URL.trim()) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
  "http://localhost:3000";

process.env.NEXTAUTH_URL = authUrl;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  env: {
    NEXTAUTH_URL: authUrl,
  },
};

export default nextConfig;
