import type { CodegenConfig } from "@graphql-codegen/cli";

const schemaPath =
  process.env.GRAPHQL_SCHEMA_PATH ?? "../server/polls/schema.graphql";

const config: CodegenConfig = {
  schema: schemaPath,
  generates: {
    "./src/gql/schema.ts": {
      plugins: ["typescript"],
      config: {
        useTypeImports: true,
        scalars: {
          DateTime: "string",
          ID: "string",
        },
      },
    },
  },
};

export default config;
