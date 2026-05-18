import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: './openapi.json',
  output: './src/api/generated',
  // Types only — keep existing manual fetch calls. The SDK migration
  // (TanStack Query / openapi-fetch) is a separate audit item.
  plugins: ['@hey-api/typescript'],
})
