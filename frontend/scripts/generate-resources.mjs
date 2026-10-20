import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSchema,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isListType,
  isNonNullType,
  isObjectType,
  valueFromAST,
} from "graphql";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = resolve(
  root,
  process.env.GRAPHQL_SCHEMA_PATH ?? "../server/polls/schema.graphql",
);
const outputPath = resolve(root, "src/gql/resources.ts");

const schema = buildSchema(readFileSync(schemaPath, "utf8"));
const queryType = schema.getQueryType();

if (!queryType) {
  throw new Error("Schema has no Query type.");
}

const scalarTypeMap = {
  ID: "string",
  String: "string",
  Boolean: "boolean",
  Int: "number",
  Float: "number",
  DateTime: "string",
};

function unwrapType(type) {
  let nonNull = false;
  let list = false;

  if (isNonNullType(type)) {
    nonNull = true;
    type = type.ofType;
  }

  if (isListType(type)) {
    list = true;
    type = type.ofType;
    if (isNonNullType(type)) {
      type = type.ofType;
    }
  }

  return { named: getNamedType(type), list, nonNull };
}

function makeRoot(field) {
  const info = unwrapType(field.type);
  let objectType = info.named;
  let resultType = info.named;
  let resultKind = info.list ? "list" : "single";

  if (isObjectType(info.named) && info.named.getFields().nodes) {
    const nodes = info.named.getFields().nodes;
    objectType = unwrapType(nodes.type).named;
    resultType = info.named;
    resultKind = "connection";
  }

  return {
    root: {
      field: field.name,
      args: field.args.map((arg) => {
        const defaultValue =
          arg.astNode?.defaultValue === undefined
            ? undefined
            : valueFromAST(arg.astNode.defaultValue, arg.type);
        const argMeta = {
          name: arg.name,
          type: String(arg.type),
          required: isNonNullType(arg.type) && defaultValue === undefined,
          hasDefault: defaultValue !== undefined,
        };

        if (defaultValue !== undefined) {
          argMeta.defaultValue = defaultValue;
        }

        return argMeta;
      }),
      resultKind,
    },
    objectType,
    resultType,
    resultKind,
    nullable: !info.nonNull,
  };
}

function makeResource(name, objectType, root) {
  const fields = {};

  for (const field of Object.values(objectType.getFields())) {
    if (field.name.startsWith("__")) {
      continue;
    }

    const info = unwrapType(field.type);
    fields[field.name] = {
      kind: isObjectType(info.named) ? "object" : "scalar",
      type: info.named.name,
      list: info.list,
      nonNull: info.nonNull,
    };
  }

  return {
    name,
    objectType: objectType.name,
    root,
    fields,
  };
}

const actionPrefixes = [
  "create",
  "update",
  "delete",
  "upsert",
  "remove",
  "publish",
  "vote",
  "toggle",
  "close",
  "archive",
  "restore",
];

function deriveAction(fieldName) {
  const prefix = actionPrefixes.find(
    (candidate) =>
      fieldName.startsWith(candidate) && fieldName.length > candidate.length,
  );

  return prefix ?? fieldName;
}

function pickMutationResource(objectType) {
  const candidates = Object.values(resources).filter(
    (resource) => resource.objectType === objectType.name,
  );
  const baseName = `${objectType.name.charAt(0).toLowerCase()}${objectType.name.slice(1)}`;

  return (
    candidates.find((resource) => resource.name === `${baseName}s`) ??
    candidates.find((resource) => resource.name === baseName) ??
    candidates.find((resource) => resource.root?.resultKind === "single") ??
    candidates[0]
  );
}

function buildArgLines(args) {
  const lines = [];

  for (const arg of args) {
    const info = unwrapTypeFromString(arg.type);
    const named = info.named;

    if (named && (isInputObjectType(named) || isEnumType(named))) {
      importedTypes.add(named.name);
    }

    const baseType = tsTypeForString(arg.type);
    const valueType = isNonNullTypeString(arg.type)
      ? baseType
      : `${baseType} | null`;
    lines.push(`    ${arg.name}${arg.required ? "" : "?"}: ${valueType};`);
  }

  return lines;
}

function mutationResultType(mutation) {
  if (mutation.resultKind === "connection") {
    return mutation.resultTypeName;
  }

  if (mutation.resultKind === "list") {
    const suffix = mutation.nullable ? " | null" : "";
    return `Array<${mutation.objectType}>${suffix}`;
  }

  const suffix = mutation.nullable ? " | null" : "";
  return `${mutation.objectType}${suffix}`;
}

const resources = {};
const rootObjects = new Set();

for (const field of Object.values(queryType.getFields())) {
  const info = makeRoot(field);

  if (!isObjectType(info.objectType)) {
    continue;
  }

  resources[field.name] = makeResource(
    field.name,
    info.objectType,
    info.root,
  );
  rootObjects.add(info.objectType.name);
  resources[field.name].resultTypeName = info.resultType.name;
  resources[field.name].resultKind = info.resultKind;
  resources[field.name].nullable = info.nullable;
}

const modelTypes = Object.values(schema.getTypeMap()).filter(
  (type) =>
    isObjectType(type) &&
    !type.name.startsWith("__") &&
    !["Query", "Mutation", "Subscription"].includes(type.name) &&
    !type.name.endsWith("Connection"),
);

for (const objectType of modelTypes) {
  if (rootObjects.has(objectType.name)) {
    continue;
  }

  const name = `${objectType.name.charAt(0).toLowerCase()}${objectType.name.slice(1)}s`;
  const resource = makeResource(name, objectType, null);
  resource.resultTypeName = objectType.name;
  resource.resultKind = "list";
  resource.nullable = false;
  resources[name] = resource;
}

function pickNestedResource(fieldMeta) {
  const candidates = Object.values(resources).filter(
    (resource) => resource.objectType === fieldMeta.type,
  );

  if (candidates.length === 0) {
    return `${fieldMeta.type.charAt(0).toLowerCase()}${fieldMeta.type.slice(1)}s`;
  }

  const preferredKind = fieldMeta.list ? ["connection", "list"] : ["single"];
  const rootCandidates = candidates.filter(
    (resource) =>
      resource.root && preferredKind.includes(resource.root.resultKind),
  );

  if (rootCandidates.length > 0) {
    return rootCandidates[0].name;
  }

  return candidates[0].name;
}

const relations = {};

for (const resource of Object.values(resources)) {
  const resourceRelations = {};

  for (const [fieldName, fieldMeta] of Object.entries(resource.fields)) {
    if (fieldMeta.kind !== "object") {
      continue;
    }

    resourceRelations[fieldName] = pickNestedResource(fieldMeta);
  }

  if (Object.keys(resourceRelations).length > 0) {
    relations[resource.name] = resourceRelations;
  }
}

const resourceNames = Object.keys(resources);
const importedTypes = new Set();
const variableLines = [];

for (const resource of Object.values(resources)) {
  importedTypes.add(resource.objectType);

  if (resource.resultTypeName) {
    importedTypes.add(resource.resultTypeName);
  }

  if (!resource.root) {
    variableLines.push(`  ${resource.name}: never;`);
    continue;
  }

  const args = resource.root.args;

  if (args.length === 0) {
    variableLines.push(`  ${resource.name}: Record<string, never>;`);
    continue;
  }

  variableLines.push(`  ${resource.name}: {`);
  variableLines.push(...buildArgLines(args));
  variableLines.push("  };");
}

const mutationType = schema.getMutationType();
const mutations = {};
const resourceMutationMap = {};

if (mutationType) {
  for (const field of Object.values(mutationType.getFields())) {
    if (field.name.startsWith("__")) {
      continue;
    }

    const info = makeRoot(field);

    if (!isObjectType(info.objectType)) {
      continue;
    }

    const resource = pickMutationResource(info.objectType);

    if (!resource) {
      throw new Error(
        `No resource is available for mutation "${field.name}" (${info.objectType.name}).`,
      );
    }

    const action = deriveAction(field.name);
    const actionMap = (resourceMutationMap[resource.name] ??= {});

    if (actionMap[action]) {
      throw new Error(
        `Resource "${resource.name}" has more than one "${action}" mutation: "${actionMap[action]}" and "${field.name}".`,
      );
    }

    actionMap[action] = field.name;
    mutations[field.name] = {
      name: field.name,
      field: field.name,
      resource: resource.name,
      action,
      objectType: info.objectType.name,
      resultTypeName: info.resultType.name,
      resultKind: info.resultKind,
      nullable: info.nullable,
      args: info.root.args,
    };
    importedTypes.add(info.objectType.name);

    if (info.resultKind === "connection") {
      importedTypes.add(info.resultType.name);
    }
  }
}

function unwrapTypeFromString(typeString) {
  let nonNull = false;
  let list = false;
  let value = typeString.trim();

  if (value.endsWith("!")) {
    nonNull = true;
    value = value.slice(0, -1);
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    list = true;
    value = value.slice(1, -1);
    if (value.endsWith("!")) {
      value = value.slice(0, -1);
    }
  }

  return {
    named: schema.getType(value),
    list,
    nonNull,
  };
}

function isNonNullTypeString(typeString) {
  return typeString.trim().endsWith("!");
}

function tsTypeForString(typeString) {
  const value = typeString.trim();

  if (value.endsWith("!")) {
    return tsTypeForString(value.slice(0, -1));
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    return `Array<${tsTypeForString(value.slice(1, -1))}>`;
  }

  return scalarTypeMap[value] ?? value;
}

const typeLines = [];

for (const resource of Object.values(resources)) {
  if (resource.root?.resultKind === "connection") {
    typeLines.push(
      `  ${resource.name}: ${resource.resultTypeName};`,
    );
    continue;
  }

  if (resource.root?.resultKind === "list") {
    const suffix = resource.nullable ? " | null" : "";
    typeLines.push(
      `  ${resource.name}: Array<${resource.objectType}>${suffix};`,
    );
    continue;
  }

  if (resource.root?.resultKind === "single") {
    const suffix = resource.nullable ? " | null" : "";
    typeLines.push(`  ${resource.name}: ${resource.objectType}${suffix};`);
    continue;
  }

  typeLines.push(`  ${resource.name}: Array<${resource.objectType}>;`);
}

const fieldLines = resourceNames.map((name) => {
  const fields = Object.keys(resources[name].fields);
  const union = fields.length > 0 ? fields.map(JSON.stringify).join(" | ") : "never";
  return `  ${name}: ${union};`;
});

const relationFieldLines = resourceNames.map((name) => {
  const fields = Object.keys(relations[name] ?? {});
  const union = fields.length > 0 ? fields.map(JSON.stringify).join(" | ") : "never";
  return `  ${name}: ${union};`;
});

const relationLines = resourceNames.map((name) => {
  const entries = Object.entries(relations[name] ?? {});

  if (entries.length === 0) {
    return `  ${name}: Record<string, never>;`;
  }

  return [
    `  ${name}: {`,
    ...entries.map(
      ([field, target]) => `    ${field}: ${JSON.stringify(target)};`,
    ),
    "  };",
  ].join("\n");
});

const mutationNames = Object.keys(mutations);
const mutationResultLines = Object.values(mutations).map(
  (mutation) => `  ${mutation.name}: ${mutationResultType(mutation)};`,
);
const mutationVariableLines = [];

for (const mutation of Object.values(mutations)) {
  if (mutation.args.length === 0) {
    mutationVariableLines.push(
      `  ${mutation.name}: Record<string, never>;`,
    );
    continue;
  }

  mutationVariableLines.push(`  ${mutation.name}: {`);
  mutationVariableLines.push(...buildArgLines(mutation.args));
  mutationVariableLines.push("  };");
}

const mutationActionLines = resourceNames.map((name) => {
  const actions = resourceMutationMap[name];

  if (!actions) {
    return `  ${name}: {};`;
  }

  return [
    `  ${name}: {`,
    ...Object.entries(actions).map(
      ([action, mutationName]) =>
        `    ${action}: ${JSON.stringify(mutationName)};`,
    ),
    "  };",
  ].join("\n");
});

const metaResources = {};

for (const [name, resource] of Object.entries(resources)) {
  metaResources[name] = {
    name: resource.name,
    objectType: resource.objectType,
    root: resource.root,
    fields: resource.fields,
  };
}

const mutationMetaResources = {};

for (const mutation of Object.values(mutations)) {
  mutationMetaResources[mutation.name] = {
    name: mutation.name,
    field: mutation.field,
    resource: mutation.resource,
    action: mutation.action,
    objectType: mutation.objectType,
    resultKind: mutation.resultKind,
    nullable: mutation.nullable,
    args: mutation.args,
  };
}

const resourceMutationMeta = {};

for (const [resource, actions] of Object.entries(resourceMutationMap)) {
  resourceMutationMeta[resource] = actions;
}

const importList = Array.from(importedTypes).sort().join(", ");
const content = `/* eslint-disable */
import type { ${importList} } from "./schema";

export type ResourceName = ${resourceNames.map(JSON.stringify).join(" | ")};

export type ResourceObjectMap = {
${resourceNames.map((name) => `  ${name}: ${resources[name].objectType};`).join("\n")}
};

export type ResourceResultMap = {
${typeLines.join("\n")}
};

export type ResourceFieldMap = {
${fieldLines.join("\n")}
};

export type ResourceRelationFields = {
${relationFieldLines.join("\n")}
};

export type ResourceRelations = {
${relationLines.join("\n")}
};

export type ResourceVariablesMap = {
${variableLines.join("\n")}
};

export type MutationName = ${mutationNames.length > 0 ? mutationNames.map(JSON.stringify).join(" | ") : "never"};

export type MutationResultMap = {
${mutationResultLines.join("\n")}
};

export type MutationVariablesMap = {
${mutationVariableLines.join("\n")}
};

export type ResourceMutationActions = {
${mutationActionLines.join("\n")}
};

export type ResourceFieldMeta = {
  readonly kind: "scalar" | "object";
  readonly type: string;
  readonly list: boolean;
  readonly nonNull: boolean;
};

export type ResourceArgMeta = {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly hasDefault: boolean;
  readonly defaultValue?: unknown;
};

export type ResourceRootMeta = {
  readonly field: string;
  readonly args: readonly ResourceArgMeta[];
  readonly resultKind: "connection" | "list" | "single";
};

export type ResourceMeta = {
  readonly name: string;
  readonly objectType: string;
  readonly root: ResourceRootMeta | null;
  readonly fields: Readonly<Record<string, ResourceFieldMeta>>;
};

export type MutationMeta = {
  readonly name: string;
  readonly field: string;
  readonly resource: ResourceName;
  readonly action: string;
  readonly objectType: string;
  readonly resultKind: "connection" | "list" | "single";
  readonly nullable: boolean;
  readonly args: readonly ResourceArgMeta[];
};

export const resourceMeta = ${JSON.stringify(metaResources, null, 2)} as const satisfies Record<
  ResourceName,
  ResourceMeta
>;

export const mutationMeta = ${JSON.stringify(mutationMetaResources, null, 2)} as const satisfies Record<
  MutationName,
  MutationMeta
>;

export const resourceMutationMeta = ${JSON.stringify(resourceMutationMeta, null, 2)} as const satisfies Partial<
  Record<ResourceName, Record<string, MutationName>>
>;
`;

writeFileSync(outputPath, content);
console.log(`Generated ${outputPath}`);
