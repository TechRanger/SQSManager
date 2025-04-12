import { Permission } from '../../permission/entities/permission.entity';
import { User } from '../../user/entities/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, OneToMany } from 'typeorm';

@Entity()
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string; // e.g., 'Owner', 'Operator', 'Map Maintainer'

  @Column({ nullable: true })
  description?: string;

  @OneToMany(() => User, user => user.role)
  users: User[];

  @ManyToMany(() => Permission, permission => permission.roles, {
    cascade: true, // When a role is saved, associated permissions are also managed
    eager: true,   // Load permissions when loading a role
  })
  @JoinTable({
      name: 'role_permission', // Name of the join table
      joinColumn: { name: 'role_id', referencedColumnName: 'id' },
      inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];
} 