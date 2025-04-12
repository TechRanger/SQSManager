import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    // Proceed with JWT validation for non-public routes
    // Need to handle potential errors like expired tokens gracefully
    try {
        return super.canActivate(context);
    } catch (err) {
        // Log error or handle specific exceptions if needed
        // For example, rethrow or return false/throw UnauthorizedException
        console.error("Error during JWT activation:", err);
        // Depending on how super.canActivate throws, might need specific catch blocks
        throw err; // Rethrow the original error by default
    }

  }
} 