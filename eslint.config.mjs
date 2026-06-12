import nextConfig from "./eslint-config-next/index.js";

export default [
  ...nextConfig,
  {
    rules: {
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": "warn"
    }
  }
];
