import { AuthConfig } from 'convex/server'

export default {
  providers: [
    {
      // Clerk's JWT issuer domain - this tells Convex to accept JWTs from Clerk
      // Set CLERK_JWT_ISSUER_DOMAIN in the Convex dashboard
      // Format: https://verb-noun-00.clerk.accounts.dev (dev) or https://clerk.yourdomain.com (prod)
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      // Application ID must match the JWT template name in Clerk (default: "convex")
      applicationID: 'convex',
    },
  ],
} satisfies AuthConfig
