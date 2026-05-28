/** @type {import('next').NextConfig} */
const nextConfig = async (phase) => {
  const ngrokOrigins = [];
  const isDev = phase === 'phase-development-server' || process.env.NODE_ENV === 'development';

  if (isDev) {
    try {
      const res = await fetch('http://127.0.0.1:4040/api/tunnels');
      if (res.ok) {
        const data = await res.json();
        if (data.tunnels) {
          for (const tunnel of data.tunnels) {
            if (tunnel.public_url) {
              try {
                const url = new URL(tunnel.public_url);
                ngrokOrigins.push(url.hostname);
              } catch (err) {
                // ignore invalid URL
              }
            }
          }
        }
      }
    } catch (e) {
      // ngrok local API not running or unreachable
    }
  }

  const customOrigins = process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(',')
    : [];

  return {
    typescript: {
      ignoreBuildErrors: true,
    },
    images: {
      unoptimized: true,
    },
    allowedDevOrigins: [
      ...ngrokOrigins,
      ...customOrigins,
    ],
  };
};

export default nextConfig;
