import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { User } from '../../user/entities/user.entity';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'username' }); // Ensure Passport uses 'username' field
  }

  // Passport automatically calls this method with credentials from the request body
  async validate(username: string, password: string): Promise<User> {
    console.log(`LocalStrategy validating: ${username}`); // Debug log
    const user = await this.authService.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    // The user object returned by validateUser is already clean
    return user; 
  }
} 