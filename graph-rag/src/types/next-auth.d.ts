import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id?: string;
      provider?: string;
    };
  }

  interface User {
    id: string;
  }
}

