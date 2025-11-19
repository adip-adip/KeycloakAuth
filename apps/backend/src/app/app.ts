import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import crypto from 'crypto';

// Type definitions for Keycloak responses
interface TokenSet {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

interface UserInfo {
  sub: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: {
    roles: string[];
  };
}

interface SessionData {
  user?: UserInfo;
  tokenSet?: TokenSet;
  returnTo?: string;
  oauth_state?: string;
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    keycloak: {
      protect: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
      getLoginUrl: () => string;
      handleCallback: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
      handleLogout: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    };
  }

  interface FastifyRequest {
    user?: UserInfo;
  }

  interface Session extends SessionData {}
}

export function app(fastify: FastifyInstance) {
  // Register cookie and session plugins first
  fastify.register(cookie);
  
  fastify.register(session, {
    secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-minimum-32-characters-long',
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      path: '/',
      sameSite: 'lax'
    },
    saveUninitialized: false,
  });

  // Secure state generator using crypto
  const generateState = () => {
    return crypto.randomBytes(32).toString('hex');
  };

  // Keycloak configuration
  const keycloakConfig = {
    url: process.env.KEYCLOAK_URL || 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM || 'test-realm',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'fastify-backend',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || 'your-client-secret',
    appOrigin: process.env.APP_ORIGIN || 'http://localhost:3000',
  };

  // Register Keycloak functionality
  fastify.decorate('keycloak', {
    protect: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.session.user) {
        const state = generateState();
        const authUrl = `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/auth?client_id=${keycloakConfig.clientId}&redirect_uri=${encodeURIComponent(keycloakConfig.appOrigin + '/callback')}&response_type=code&scope=openid profile email&state=${state}`;
        
        request.session.returnTo = request.url;
        request.session.oauth_state = state;
        
        fastify.log.info(`🛡️ Protecting route: ${request.url}, redirecting to Keycloak`);
        fastify.log.info(`📝 Generated state: ${state}`);
        
        return reply.redirect(authUrl);
      }
    },
    getLoginUrl: () => {
      const state = generateState();
      return `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/auth?client_id=${keycloakConfig.clientId}&redirect_uri=${encodeURIComponent(keycloakConfig.appOrigin + '/callback')}&response_type=code&scope=openid profile email&state=${state}`;
    },
    handleCallback: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { code, state } = request.query as { code?: string; state?: string };
        
        // Add debug logging to see what's happening
        fastify.log.info(`🔐 Callback received - Code: ${code ? 'present' : 'missing'}, State: ${state}`);
        fastify.log.info(`📝 Session state: ${request.session.oauth_state}`);
        
        if (!code) {
          throw new Error('No authorization code received');
        }

        if (!state) {
          throw new Error('No state parameter received from Keycloak');
        }

        // Store session state in variable and CLEAR it immediately
        const sessionState = request.session.oauth_state;
        request.session.oauth_state = undefined; // ⚠️ CRITICAL: Clear immediately to prevent reuse

        if (!sessionState) {
          throw new Error('No state found in session - session may have expired or was cleared');
        }

        if (state !== sessionState) {
          fastify.log.error(`❌ State mismatch! Session: "${sessionState}", Received: "${state}"`);
          throw new Error('Invalid state parameter - possible CSRF attack or session issue');
        }

        fastify.log.info('✅ State parameter validated successfully');

        // Debug: Log the credentials being used
        fastify.log.info(`🔑 Using client_id: ${keycloakConfig.clientId}`);
        fastify.log.info(`🔑 Client secret: ${keycloakConfig.clientSecret ? '***' + keycloakConfig.clientSecret.slice(-4) : 'MISSING'}`);

        // Exchange code for tokens
        const tokenEndpoint = `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`;
        fastify.log.info(`🔄 Calling token endpoint: ${tokenEndpoint}`);
        
        const tokenResponse = await fetch(
          tokenEndpoint,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: keycloakConfig.clientId,
              client_secret: keycloakConfig.clientSecret,
              code: code,
              redirect_uri: `${keycloakConfig.appOrigin}/callback`,
            }),
          }
        );

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          fastify.log.error(`❌ Token exchange failed: ${tokenResponse.status} - ${errorText}`);
          throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorText}`);
        }

        const tokenSet = await tokenResponse.json() as TokenSet;
        fastify.log.info('✅ Successfully obtained tokens from Keycloak');

        // Get user info using access token
        const userResponse = await fetch(
          `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/userinfo`,
          {
            headers: {
              Authorization: `Bearer ${tokenSet.access_token}`,
            },
          }
        );

        if (!userResponse.ok) {
          const errorText = await userResponse.text();
          throw new Error(`Failed to fetch user info: ${userResponse.status} - ${errorText}`);
        }

        const userInfo = await userResponse.json() as UserInfo;
        fastify.log.info(`✅ Successfully fetched user info for: ${userInfo.preferred_username || userInfo.sub}`);

        // Store user info and tokens in session
        request.session.user = {
          sub: userInfo.sub,
          preferred_username: userInfo.preferred_username,
          email: userInfo.email,
          name: userInfo.name,
          given_name: userInfo.given_name,
          family_name: userInfo.family_name,
          realm_access: userInfo.realm_access,
        };
        request.session.tokenSet = tokenSet;

        const returnTo = request.session.returnTo || '/profile';
        fastify.log.info(`🔄 Authentication successful, redirecting to: ${returnTo}`);
        return reply.redirect(returnTo);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        fastify.log.error(`💥 Callback error: ${errorMessage}`);
        return reply.status(500).send({ 
          error: 'Authentication failed',
          details: errorMessage 
        });
      }
    },
    handleLogout: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tokenSet = request.session.tokenSet;
        
        // Clear session
        request.session.destroy((err) => {
          if (err) {
            fastify.log.error(err);
          }
        });

        // If we have tokens, logout from Keycloak too
        if (tokenSet?.id_token) {
          const logoutUrl = `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/logout?id_token_hint=${tokenSet.id_token}&post_logout_redirect_uri=${encodeURIComponent(keycloakConfig.appOrigin + '/logout-success')}`;
          return reply.redirect(logoutUrl);
        }

        // Fallback to local logout
        return reply.redirect('/logout-success');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        fastify.log.error(`Logout error: ${errorMessage}`);
        return reply.redirect('/logout-success');
      }
    }
  });

  // Routes
  fastify.get('/', async (request, reply) => {
    return { 
      message: 'Welcome to Fastify + Keycloak',
      endpoints: {
        public: '/public',
        profile: '/profile (protected)',
        logout: '/logout',
        health: '/health'
      }
    };
  });

  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  fastify.get('/public', async (request, reply) => {
    return { message: 'This is a public route' };
  });

  // Auth routes
  fastify.get('/login', async (request, reply) => {
    const loginUrl = fastify.keycloak.getLoginUrl();
    fastify.log.info(`🔗 Redirecting to login: ${loginUrl}`);
    return reply.redirect(loginUrl);
  });

  fastify.get('/callback', async (request, reply) => {
    await fastify.keycloak.handleCallback(request, reply);
  });

  fastify.get('/logout', async (request, reply) => {
    await fastify.keycloak.handleLogout(request, reply);
  });

  fastify.get('/logout-success', async (request, reply) => {
    return { message: 'You have been logged out successfully' };
  });

  // Protected routes
  fastify.get('/profile', async (request, reply) => {
    if (!request.session.user) {
      fastify.log.info('🔒 Profile access denied, redirecting to login');
      return fastify.keycloak.protect(request, reply);
    }
    
    request.user = request.session.user;
    fastify.log.info(`👤 Profile accessed by: ${request.user.preferred_username || request.user.sub}`);
    return reply.send({ 
      message: 'Your profile',
      user: request.user,
      authenticated: true
    });
  });

  fastify.get('/protected', async (request, reply) => {
    if (!request.session.user) {
      return fastify.keycloak.protect(request, reply);
    }
    
    request.user = request.session.user;
    return reply.send({ 
      message: 'Protected route accessed successfully',
      user: request.user
    });
  });

  return fastify;
}