"use client";

import { gql } from "@apollo/client";
import { useApolloClient, useMutation, useQuery } from "@apollo/client/react";
import { createContext, useContext, type ReactNode } from "react";

import type { Author, User } from "@/gql/schema";

export type AuthUser = Pick<User, "id" | "username" | "email"> & {
  author: Pick<Author, "id" | "name"> | null;
};

type MeData = {
  me: AuthUser | null;
};

type LoginData = {
  login: AuthUser;
};

type LoginVariables = {
  username: string;
  password: string;
};

const ME_QUERY = gql`
  query Me {
    me {
      id
      username
      email
      author {
        id
        name
      }
    }
  }
`;

const LOGIN_MUTATION = gql`
  mutation Login($username: String!, $password: String!) {
    login(username: $username, password: $password) {
      id
      username
      email
      author {
        id
        name
      }
    }
  }
`;

const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout
  }
`;

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useApolloClient();
  const { data, loading, refetch } = useQuery<MeData>(ME_QUERY);
  const [loginMutation] = useMutation<LoginData, LoginVariables>(
    LOGIN_MUTATION,
  );
  const [logoutMutation] = useMutation<{ logout: boolean }>(LOGOUT_MUTATION);

  async function login(username: string, password: string) {
    await loginMutation({
      variables: { username: username.trim(), password },
    });
    await client.resetStore();
  }

  async function logout() {
    await logoutMutation();
    await client.resetStore();
  }

  async function refresh() {
    await refetch();
  }

  return (
    <AuthContext.Provider
      value={{ user: data?.me ?? null, loading, login, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
