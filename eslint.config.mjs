import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

// `next lint` ayant disparu en Next 16, la config qu'il appliquait implicitement
// est reprise ici pour que `npm run lint` (eslint .) garde le même comportement.
export default [
  ...coreWebVitals,
  ...typescript,
  { ignores: ['.next/**', 'node_modules/**', 'out/**', 'public/**'] },
];
