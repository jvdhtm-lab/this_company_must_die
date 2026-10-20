"use client";

import type { ApolloClient } from "@apollo/client";
import { useApolloClient, useQuery } from "@apollo/client/react";
import { parse, type DocumentNode } from "graphql";
import {
  mutationMeta,
  resourceMeta,
  resourceMutationMeta,
  type MutationMeta,
  type MutationName,
  type MutationResultMap,
  type MutationVariablesMap,
  type ResourceFieldMap,
  type ResourceMeta,
  type ResourceMutationActions,
  type ResourceName,
  type ResourceRelations,
  type ResourceResultMap,
  type ResourceVariablesMap,
} from "@/gql/resources";

export type DeepPartial<T> = T extends (infer U)[]
  ? Array<DeepPartial<U>>
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

type RelationField<R extends ResourceName> = keyof ResourceRelations[R];

type ScalarField<R extends ResourceName> = Exclude<
  ResourceFieldMap[R],
  RelationField<R>
>;

export interface ResourceSelectionLike {
  readonly resource: ResourceName;
  toSelectionString(): string;
}

type IncludeItem<R extends ResourceName> =
  | ScalarField<R>
  | ResourceSelectionLike;

type RuntimeIncludeItem<R extends ResourceName> =
  | ResourceFieldMap[R]
  | ResourceSelectionLike;

type SelectionEntry =
  | { readonly kind: "field"; readonly name: string }
  | {
      readonly kind: "relation";
      readonly field: string;
      readonly selection: ResourceSelectionLike;
    };

function isSelection(value: unknown): value is ResourceSelectionLike {
  return value instanceof ResourceSelection;
}

function getResourceMeta<R extends ResourceName>(resource: R): ResourceMeta {
  return resourceMeta[resource] as ResourceMeta;
}

function getMutationMeta<M extends MutationName>(name: M): MutationMeta {
  return mutationMeta[name] as MutationMeta;
}

function getResourceMutationName<R extends ResourceName>(
  resource: R,
  action: string,
): MutationName | undefined {
  const actions = (
    resourceMutationMeta as Partial<
      Record<ResourceName, Partial<Record<string, MutationName>>>
    >
  )[resource];

  return actions?.[action];
}

const documentCache = new Map<string, DocumentNode>();

function parseQuery(query: string): DocumentNode {
  const cached = documentCache.get(query);

  if (cached) {
    return cached;
  }

  const document = parse(query);
  documentCache.set(query, document);

  return document;
}

export type ResourceQueryResult<R extends ResourceName> = Omit<
  useQuery.Result<Record<string, unknown>, ResourceVariablesMap[R]>,
  "data"
> & {
  data: DeepPartial<ResourceResultMap[R]> | undefined;
};

export function useResourceQuery<R extends ResourceName>(
  query: ResourceQuery<R>,
): ResourceQueryResult<R> {
  const meta = getResourceMeta(query.resource);

  if (!meta.root) {
    throw new Error(`Resource "${query.resource}" cannot be queried directly.`);
  }

  const result = useQuery<Record<string, unknown>, ResourceVariablesMap[R]>(
    query.document(),
    { variables: query.getVariables() },
  );

  return {
    ...result,
    data: pluckField(result.data, meta.root.field) as
      | DeepPartial<ResourceResultMap[R]>
      | undefined,
  };
}

export function resourceQueries<R extends ResourceName>(
  resource: R,
): ResourceQuery<R> {
  return new ResourceQuery(resource);
}

export class ResourceSelection<R extends ResourceName>
  implements ResourceSelectionLike
{
  readonly resource: R;
  protected readonly entries: readonly SelectionEntry[];

  constructor(resource: R, entries: readonly SelectionEntry[] = []) {
    this.resource = resource;
    this.entries = entries;
  }

  get self(): ResourceSelection<R> {
    return this;
  }

  include<F extends RelationField<R>>(
    field: F,
    nested: ResourceSelectionLike,
  ): ResourceSelection<R>;
  include(...items: IncludeItem<R>[]): ResourceSelection<R>;
  include(...items: RuntimeIncludeItem<R>[]): ResourceSelection<R> {
    return new ResourceSelection(this.resource, this.extend(items));
  }

  toSelectionString(): string {
    if (this.entries.length === 0) {
      throw new Error(`No fields selected for "${this.resource}".`);
    }

    return this.entries
      .map((entry) => {
        if (entry.kind === "field") {
          return entry.name;
        }

        return `${entry.field} { ${entry.selection.toSelectionString()} }`;
      })
      .join(" ");
  }

  protected extend(items: readonly RuntimeIncludeItem<R>[]): SelectionEntry[] {
    const entries = [...this.entries];

    for (let index = 0; index < items.length; index++) {
      const item = items[index];

      if (typeof item === "string") {
        const field = getResourceMeta(this.resource).fields[item as string];

        if (!field) {
          throw new Error(
            `Field "${item}" does not exist on resource "${this.resource}".`,
          );
        }

        if (field.kind === "object") {
          const nested = items[index + 1];

          if (!isSelection(nested)) {
            throw new Error(
              `Field "${item}" requires a nested resource selection.`,
            );
          }

          this.addRelation(entries, item, nested);
          index++;
          continue;
        }

        entries.push({ kind: "field", name: item });
        continue;
      }

      this.addRelation(entries, item.resource, item);
    }

    return entries;
  }

  private addRelation(
    entries: SelectionEntry[],
    field: string,
    nested: ResourceSelectionLike,
  ) {
    const fieldMeta = getResourceMeta(this.resource).fields[field];

    if (!fieldMeta || fieldMeta.kind !== "object") {
      throw new Error(
        `Relation "${field}" does not exist on resource "${this.resource}".`,
      );
    }

    const nestedMeta = getResourceMeta(nested.resource);

    if (fieldMeta.type !== nestedMeta.objectType) {
      throw new Error(
        `Resource "${nested.resource}" cannot be included through "${field}". Expected "${fieldMeta.type}", received "${nestedMeta.objectType}".`,
      );
    }

    entries.push({ kind: "relation", field, selection: nested });
  }
}

export class ResourceQuery<R extends ResourceName> extends ResourceSelection<R> {
  private readonly variables: ResourceVariablesMap[R];

  constructor(
    resource: R,
    entries: readonly SelectionEntry[] = [],
    variables: ResourceVariablesMap[R] = {} as ResourceVariablesMap[R],
  ) {
    super(resource, entries);
    this.variables = variables;
  }

  where(variables: ResourceVariablesMap[R]): ResourceQuery<R> {
    return new ResourceQuery(this.resource, this.entries, variables);
  }

  include<F extends RelationField<R>>(
    field: F,
    nested: ResourceSelectionLike,
  ): ResourceQuery<R>;
  include(...items: IncludeItem<R>[]): ResourceQuery<R>;
  include(...items: RuntimeIncludeItem<R>[]): ResourceQuery<R> {
    return new ResourceQuery(this.resource, this.extend(items), this.variables);
  }

  document() {
    const meta = getResourceMeta(this.resource);

    if (!meta.root) {
      throw new Error(
        `Resource "${this.resource}" cannot be queried directly.`,
      );
    }

    const root = meta.root;
    const variables = this.variables as Record<string, unknown>;
    const providedArgs = root.args.filter(
      (arg) =>
        Object.prototype.hasOwnProperty.call(variables, arg.name) &&
        variables[arg.name] !== undefined,
    );

    for (const arg of root.args) {
      if (arg.required && !providedArgs.includes(arg)) {
        throw new Error(
          `Missing required variable "${arg.name}" for resource "${this.resource}".`,
        );
      }
    }

    const variableDefinitions = providedArgs.map(
      (arg) => `$${arg.name}: ${arg.type}`,
    );
    const argumentValues = providedArgs.map(
      (arg) => `${arg.name}: $${arg.name}`,
    );
    const variablesPart =
      variableDefinitions.length > 0
        ? `(${variableDefinitions.join(", ")})`
        : "";
    const argsPart =
      argumentValues.length > 0 ? `(${argumentValues.join(", ")})` : "";
    const selection = this.toSelectionString();
    const rootSelection =
      root.resultKind === "connection"
        ? `total limit page nodes { ${selection} }`
        : selection;
    const operationName = `${this.resource.charAt(0).toUpperCase()}${this.resource.slice(1)}ResourceQuery`;
    const query = `query ${operationName}${variablesPart} { ${root.field}${argsPart} { ${rootSelection} } }`;

    return parseQuery(query);
  }

  getVariables(): ResourceVariablesMap[R] {
    return this.variables;
  }

  exec(): ResourceQueryResult<R> {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useResourceQuery(this);
  }
}

export type MutationAction<R extends ResourceName> =
  keyof ResourceMutationActions[R] & string;

export type ResourceMutationsApi<R extends ResourceName> = {
  [A in MutationAction<R>]: CallableResourceMutation<R, A>;
};

export type MutationNameFor<
  R extends ResourceName,
  A extends MutationAction<R>,
> = ResourceMutationActions[R][A] & MutationName;

export type MutationCallOptions<M extends MutationName> = Omit<
  ApolloClient.MutateOptions<Record<string, unknown>, MutationVariablesMap[M]>,
  "mutation" | "variables"
>;

export type MutationCallResult<M extends MutationName> = Omit<
  ApolloClient.MutateResult<Record<string, unknown>>,
  "data"
> & {
  data: DeepPartial<MutationResultMap[M]> | null | undefined;
};

export interface CallableResourceMutation<
  R extends ResourceName,
  A extends MutationAction<R>,
> {
  (
    variables: MutationVariablesMap[MutationNameFor<R, A>],
    options?: MutationCallOptions<MutationNameFor<R, A>>,
  ): Promise<MutationCallResult<MutationNameFor<R, A>>>;
  include<F extends RelationField<R>>(
    field: F,
    nested: ResourceSelectionLike,
  ): CallableResourceMutation<R, A>;
  include(...items: IncludeItem<R>[]): CallableResourceMutation<R, A>;
  document(): DocumentNode;
}

export function resourceMutations<R extends ResourceName>(
  resource: R,
): ResourceMutationsApi<R> {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const client = useApolloClient();

  return new Proxy({} as ResourceMutationsApi<R>, {
    get(_target, property) {
      if (typeof property !== "string") {
        return undefined;
      }

      return createMutationAction(client, resource, property);
    },
  });
}

function createMutationAction<R extends ResourceName>(
  client: ApolloClient,
  resource: R,
  action: string,
): CallableResourceMutation<R, MutationAction<R>> {
  const mutationName = getResourceMutationName(resource, action);

  if (!mutationName) {
    throw new Error(`Resource "${resource}" has no "${action}" mutation.`);
  }

  return makeCallableMutation(
    client,
    new ResourceMutationAction(
      resource,
      action as MutationAction<R>,
      mutationName as MutationNameFor<R, MutationAction<R>>,
    ),
  );
}

function makeCallableMutation<
  R extends ResourceName,
  A extends MutationAction<R>,
>(
  client: ApolloClient,
  builder: ResourceMutationAction<R, A>,
): CallableResourceMutation<R, A> {
  const callable = (async (
    variables: MutationVariablesMap[MutationNameFor<R, A>],
    options?: MutationCallOptions<MutationNameFor<R, A>>,
  ): Promise<MutationCallResult<MutationNameFor<R, A>>> => {
    const meta = getMutationMeta(builder.mutationName);
    const result = await client.mutate({
      ...(options as
        | ApolloClient.MutateOptions<
            Record<string, unknown>,
            Record<string, unknown>
          >
        | undefined),
      mutation: builder.document(),
      variables: variables as Record<string, unknown>,
    });

    return {
      ...result,
      data: pluckField(result.data, meta.field) as
        | DeepPartial<MutationResultMap[MutationNameFor<R, A>]>
        | null
        | undefined,
    };
  }) as CallableResourceMutation<R, A>;

  callable.include = ((...items: RuntimeIncludeItem<R>[]) =>
    makeCallableMutation(
      client,
      builder.includeAll(items),
    )) as CallableResourceMutation<R, A>["include"];
  callable.document = () => builder.document();

  return callable;
}

export class ResourceMutationAction<
  R extends ResourceName,
  A extends MutationAction<R>,
> extends ResourceSelection<R> {
  readonly action: A;
  readonly mutationName: MutationNameFor<R, A>;

  constructor(
    resource: R,
    action: A,
    mutationName: MutationNameFor<R, A>,
    entries: readonly SelectionEntry[] = [],
  ) {
    super(resource, entries);
    this.action = action;
    this.mutationName = mutationName;
  }

  include<F extends RelationField<R>>(
    field: F,
    nested: ResourceSelectionLike,
  ): ResourceMutationAction<R, A>;
  include(...items: IncludeItem<R>[]): ResourceMutationAction<R, A>;
  include(...items: RuntimeIncludeItem<R>[]): ResourceMutationAction<R, A> {
    return this.includeAll(items);
  }

  includeAll(
    items: readonly RuntimeIncludeItem<R>[],
  ): ResourceMutationAction<R, A> {
    return new ResourceMutationAction(
      this.resource,
      this.action,
      this.mutationName,
      this.extend(items),
    );
  }

  document(): DocumentNode {
    const meta = getMutationMeta(this.mutationName);
    const variableDefinitions = meta.args.map(
      (arg) => `$${arg.name}: ${arg.type}`,
    );
    const argumentValues = meta.args.map(
      (arg) => `${arg.name}: $${arg.name}`,
    );
    const operationName = `${this.mutationName.charAt(0).toUpperCase()}${this.mutationName.slice(1)}Mutation`;
    const query =
      variableDefinitions.length > 0
        ? `mutation ${operationName}(${variableDefinitions.join(", ")}) { ${meta.field}(${argumentValues.join(", ")}) { ${this.toSelectionString()} } }`
        : `mutation ${operationName} { ${meta.field} { ${this.toSelectionString()} } }`;

    return parseQuery(query);
  }
}

function pluckField(data: unknown, field: string): unknown {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  return (data as Record<string, unknown>)[field];
}
