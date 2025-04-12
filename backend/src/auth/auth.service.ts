import { Injectable, Logger } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { User } from '../user/entities/user.entity'; // Import User for type hinting

// Define the shape of the user object passed to login after validation
// Note: We only need the basic user info here, the full details might be fetched elsewhere if needed.
export interface ValidatedUserPayload {
    userId: number;
    username: string;
    role: { name: string }; // Expect the role object with at least the name
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name); // Instantiate Logger

  constructor(
    private userService: UserService,
    private jwtService: JwtService
  ) {}

  /**
   * Validates a user based on username and password.
   * Called by LocalStrategy.
   * @returns The user object (including role) if validation is successful, otherwise null.
   */
  async validateUser(username: string, pass: string): Promise<User | null> {
    this.logger.verbose(`Validating user: ${username}`);
    const user = await this.userService.findOneByUsername(username);

    // Log the fetched user object, specifically checking for the role
    this.logger.verbose(`User fetched from DB: ${user ? JSON.stringify({ id: user.id, username: user.username, hasRole: !!user.role, roleName: user.role?.name }) : 'null'}`);

    if (user && await user.comparePassword(pass)) {
      if (!user.role) {
          this.logger.error(`User ${username} (ID: ${user.id}) authenticated but has no role loaded!`);
      }
      this.logger.verbose(`User ${username} validation successful.`);
      return user;
    }
    this.logger.warn(`User ${username} validation failed (user not found or password mismatch).`);
    return null;
  }

  /**
   * Generates a JWT access token for a validated user.
   * @param user The user object (including role) returned from validateUser.
   * @returns An object containing the access token.
   */
  async login(user: User) {
    this.logger.verbose(`Login requested for user: ${user?.username} (ID: ${user?.id}), Role loaded: ${!!user?.role}`);
    if (!user || !user.role) {
        this.logger.error(`Attempting to login user without valid user or role object. User: ${JSON.stringify(user)}`);
        throw new Error('User or user role information is missing for JWT generation.');
    }
    // Payload should contain essential, non-sensitive info
    const payload = {
        username: user.username,
        sub: user.id, // Use 'sub' (subject) for userId as per JWT standard
        roles: [user.role.name] // Put the single role name in an array
    };
    this.logger.verbose(`Generating JWT payload: ${JSON.stringify(payload)}`);
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
} 