import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Garde ces libs en require Node natif côté serveur (extraction de texte).
  // Évite que le bundler ne casse pdf-parse / mammoth ou n'exécute leur code au chargement.
  serverExternalPackages: ['pdf-parse', 'mammoth'],
};

export default nextConfig;
