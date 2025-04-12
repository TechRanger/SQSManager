import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { PermissionModule } from '../permission/permission.module';
import { RoleModule } from '../role/role.module';
import { UserModule } from '../user/user.module';
import { Permission } from '../permission/entities/permission.entity';
import { Role } from '../role/entities/role.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Permission, Role, User]), // Import repositories needed for seeding
    PermissionModule,
    RoleModule,
    UserModule,
  ],
  providers: [SeedService],
  exports: [SeedService], // Export if needed elsewhere, maybe not necessary
})
export class SeedModule {} 