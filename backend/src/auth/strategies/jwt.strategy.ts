import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../../user/user.service'; // Assuming UserService needed for validation
import { Request } from 'express'; // Import Request

// Custom extractor function
const cookieExtractor = (req: Request): string | null => {
    let token = null;
    if (req && req.cookies) {
        token = req.cookies['access_token']; // Assuming cookie name is access_token
    }
    return token;
};

// Custom extractor to get token from header OR query param
const authHeaderOrQueryParamExtractor = (req: Request): string | null => {
    let token = ExtractJwt.fromAuthHeaderAsBearerToken()(req); // Try header first
    if (!token && req.query && req.query.token) {
        token = req.query.token as string; // Fallback to query param 'token'
        console.log('Extracted token from query parameter'); // Log for debugging
    }
    return token;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
      private userService: UserService // Inject UserService to potentially check if user still exists
  ) {
    super({
      // Use the custom extractor
      jwtFromRequest: authHeaderOrQueryParamExtractor,
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'VERY_SECRET_KEY_CHANGE_THIS_IN_PROD', // Same secret as in JwtModule
    });
  }

  // Passport automatically calls this after verifying the JWT signature and expiration
  async validate(payload: { username: string; sub: number; roles: string[] }) {
    // Payload contains the properties we included when signing the JWT in AuthService.login
    console.log(`JwtStrategy validating payload for user ID: ${payload.sub} with roles: ${payload.roles.join(', ')}`); // Debug log

    // Optional: Check if user still exists in DB (more secure but adds DB lookup)
    // const user = await this.userService.findOneById(payload.sub);
    // if (!user) {
    //   throw new UnauthorizedException('用户不存在或已被禁用');
    // }

    // The value returned here will be attached to request.user by Passport
    // Ensure the returned object uses 'sub' for consistency with JWT standard and PermissionsGuard
    return { sub: payload.sub, username: payload.username, roles: payload.roles };
  }
} 