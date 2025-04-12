import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '../user/user.module'; // Import UserModule
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UserModule, // To use UserService
    PassportModule, // Default strategy: jwt
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'VERY_SECRET_KEY_CHANGE_THIS_IN_PROD', // !!! Change this via env var in production !!!
      signOptions: { expiresIn: '1d' }, // Token expires in 1 day (adjust as needed)
    }),
  ],
  providers: [
      AuthService, 
      LocalStrategy, // Provider for validating username/password
      JwtStrategy    // Provider for validating JWT token
    ],
  controllers: [AuthController],
  exports: [AuthService], // Export AuthService if needed by other modules?
})
export class AuthModule {} 