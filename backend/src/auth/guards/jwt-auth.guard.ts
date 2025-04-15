import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
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
      // Check if it's an SSE request (e.g., by checking headers or path pattern)
      const request = context.switchToHttp().getRequest();
      const isSseRequest = request.headers.accept === 'text/event-stream'; // Common way to identify SSE

      if (isSseRequest && request.query.token) {
        // If it's SSE and token is in query param, attach it to headers for passport-jwt strategy
        // This allows the standard JWT strategy to pick it up
        request.headers.authorization = `Bearer ${request.query.token}`;
      }

      return super.canActivate(context);
    } catch (err) {
      // Log error or handle specific exceptions if needed
      // For example, rethrow or return false/throw UnauthorizedException
      console.error("Error during JWT activation:", err);
      // Depending on how super.canActivate throws, might need specific catch blocks
      throw err; // Rethrow the original error by default
    }
  }

  handleRequest(err, user, info) {
    // You can throw an exception based on either details passed via info or err arguments
    if (err || !user) {
      // Log the specific error/info for debugging
      console.error('JWT Authentication Error:', err, info?.message);
      throw err || new UnauthorizedException(info?.message || 'Could not authenticate with token');
    }
    return user;
  }
} 