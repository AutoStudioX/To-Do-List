import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bublina dev nástrojů sedí ve vývoji na spodní navigaci — na 390px překrývá
  // první položku „Přehled", takže cesta zpět na dashboard vypadá jako
  // nefunkční tlačítko (změřeno: `elementFromPoint` uprostřed odkazu vrací
  // `NEXTJS-PORTAL`). V produkci nic takového není, ale při ladění na telefonu
  // to mate. Přesouvat ji nemá smysl — na 390px má appka v každém rohu něco,
  // na co se ťuká (navigace dole, hamburger a mikrofon nahoře).
  devIndicators: false,
  // Keep bookmarked/external /goals links working — the real page is /goaly.
  async redirects() {
    return [
      { source: '/goals', destination: '/goaly', permanent: true },
      { source: '/goals/:path*', destination: '/goaly', permanent: true },
      // Sekce se přejmenovala z /navyky na /habits — záložky ať fungují dál.
      { source: '/navyky', destination: '/habits', permanent: true },
      { source: '/navyky/:path*', destination: '/habits/:path*', permanent: true },
    ]
  },
};

export default nextConfig;
