


/** @type {import('next').NextConfig} */
const nextConfig = {
    eslint: {
      // Skip ESLint during Vercel build — run it locally / in CI instead
      ignoreDuringBuilds: true,
    },
    typescript: {
      // Skip TS checking during Vercel build (most common hang cause)
      ignoreBuildErrors: true,
    },
    // Optional: if you have many pages or heavy getStaticProps / ISR
    staticPageGenerationTimeout: 120,  // increase from default 60s if needed
  };
  
  export default nextConfig;