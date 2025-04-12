import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';

@Injectable()
export class PermissionService {
    constructor(
        @InjectRepository(Permission)
        private permissionRepository: Repository<Permission>,
    ) {}

    async findAll(): Promise<Permission[]> {
        // Simple find all for now
        return this.permissionRepository.find();
    }

    // Add other methods like findByIds if needed later
} 