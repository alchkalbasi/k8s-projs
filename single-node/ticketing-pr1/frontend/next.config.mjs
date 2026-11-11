const isDev = process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: `next build` writes plain HTML/JS/CSS to out/, served by nginx.
  // There is no Node server at runtime; nginx also proxies /api/* to the backend.
  output: "export",
  reactStrictMode: true,
  poweredByHeader: false,
  // `npm run dev` only: stand in for nginx's /api proxy (rewrites don't exist in a static export).
  ...(isDev && {
    async rewrites() {
      const backend = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
      return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
    },
  }),
};

export default nextConfig;
