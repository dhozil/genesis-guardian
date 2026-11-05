import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * eslint-config-next 16 publishes native flat configs. `next/typescript` adds
 * the TypeScript parser + rules; `next/core-web-vitals` adds the Next and
 * React/a11y rule sets on top of the base config.
 */
const asArray = (config) => (Array.isArray(config) ? config : [config]);

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  ...asArray(coreWebVitals),
  ...asArray(typescript),
];

export default config;
