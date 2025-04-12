import { Controller, Post, UseGuards, Request, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { LoginDto } from './dto/login.dto'; // Need to create this DTO
import { Public } from './decorators/public.decorator'; // Import the Public decorator

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Apply the Public decorator to skip global JWT and Permissions guards
  @Public()
  // Use AuthGuard('local') specifically for this route to handle username/password validation
  @UseGuards(AuthGuard('local'))
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // @Body() required for Passport local strategy to find username/password
  // @Request() req contains the user object attached by LocalStrategy.validate
  async login(@Request() req, @Body() loginDto: LoginDto) { 
    console.log('Login endpoint hit for user:', req.user.username); // Debug log
    // req.user contains the validated user object from LocalStrategy
    return this.authService.login(req.user);
  }

  // TODO: Maybe add a /profile endpoint later protected by JwtAuthGuard
  // @UseGuards(AuthGuard('jwt'))
  // @Get('profile')
  // getProfile(@Request() req) {
  //   return req.user; // req.user is populated by JwtStrategy.validate
  // }
} 