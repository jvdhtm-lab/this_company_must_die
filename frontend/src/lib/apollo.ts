import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

function getGraphQLUri() {
  if (typeof window === "undefined") {
    return process.env.GRAPHQL_URL ?? "http://localhost:8010/polls/graphql/";
  }

  return process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "/graphql";
}

export function createApolloClient() {
  return new ApolloClient({
    link: new HttpLink({
      uri: getGraphQLUri(),
      credentials: "same-origin",
    }),
    cache: new InMemoryCache(),
  });
}
