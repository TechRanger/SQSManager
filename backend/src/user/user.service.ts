import { Injectable, NotFoundException, UnauthorizedException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsRelations } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from '../role/entities/role.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
  ) {}

  async findAll(): Promise<Omit<User, 'password' | 'hashPassword' | 'comparePassword'>[]> {
    const users = await this.userRepository.find({ relations: ['role'] });
    return users.map(({ password, hashPassword, comparePassword, ...user }) => user);
  }

  async findOneByUsername(username: string): Promise<User | undefined> {
    const user = await this.userRepository.findOne({ where: { username }, relations: ['role'] });
    return user ?? undefined;
  }

  async findOneById(id: number): Promise<User | undefined> {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['role'] });
    return user ?? undefined;
  }

  async findOneByIdWithRelations(id: number, relations: FindOptionsRelations<User>): Promise<User | undefined> {
    const user = await this.userRepository.findOne({ where: { id }, relations });
    return user ?? undefined;
  }

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    const { username, password, roleId } = createUserDto;

    const existingUser = await this.findOneByUsername(username);
    if (existingUser) {
      throw new ConflictException('用户名已存在');
    }

    const role = await this.roleRepository.findOne({ where: { id: roleId } });
    if (!role) {
      throw new BadRequestException('提供的角色 ID 无效');
    }
    if (role.name === 'Owner') {
      throw new ForbiddenException('无法直接创建 Owner 角色的用户。');
    }

    const newUser = this.userRepository.create({ username, password, role });
    const savedUser = await this.userRepository.save(newUser);
    const { password: _, ...result } = savedUser;
    return result as User;
  }

  async deleteUser(id: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['role'] });
    if (!user) {
      throw new NotFoundException('用户未找到');
    }
    if (user.role?.name === 'Owner') {
      throw new ForbiddenException('无法删除 Owner 角色的用户。');
    }
    const result = await this.userRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('用户未找到');
    }
  }

  async changePassword(userId: number, currentPass: string, newPass: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户未找到。');
    }

    const isPasswordMatching = await user.comparePassword(currentPass);
    if (!isPasswordMatching) {
      throw new UnauthorizedException('当前密码不正确。');
    }

    user.password = newPass;
    await this.userRepository.save(user);
  }

  async assignRole(userId: number, roleId: number): Promise<User> {
    const user = await this.findOneByIdWithRelations(userId, { role: true });
    if (!user) {
      throw new NotFoundException('用户未找到');
    }
    if (user.role?.name === 'Owner') {
      throw new ForbiddenException('无法更改 Owner 角色的分配。');
    }

    const role = await this.roleRepository.findOne({ where: { id: roleId } });
    if (!role) {
      throw new BadRequestException('角色 ID 无效');
    }
    if (role.name === 'Owner') {
      throw new ForbiddenException('无法将用户分配给 Owner 角色。');
    }

    user.role = role;
    await this.userRepository.save(user);
    const { password, ...result } = user;
    return result as User;
  }
} 