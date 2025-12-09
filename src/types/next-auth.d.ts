// types/next-auth.d.ts
/**
 * Extension des types NextAuth
 * Place ce fichier dans le dossier types/ à la racine
 */

import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT, DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      companyId: string;
      companyName: string;
      companyPackType: string;
      firstName?: string;
      lastName?: string;
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    role: string;
    companyId: string;
    companyName: string;
    companyPackType: string;
    firstName?: string;
    lastName?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    role: string;
    companyId: string;
    companyName: string;
    companyPackType: string;
    firstName?: string;
    lastName?: string;
  }
}
