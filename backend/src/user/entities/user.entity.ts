import { Entity, Column, PrimaryGeneratedColumn, BeforeInsert, BeforeUpdate, ManyToOne, JoinColumn } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Role } from '../../role/entities/role.entity'; // Import Role entity

// Remove old UserRole enum
// export enum UserRole { ... }

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string; // Will store hashed password

  // Change to ManyToOne relation with Role
  @ManyToOne(() => Role, role => role.users, {
      nullable: true // Keep nullable: true for dev sync
  })
  @JoinColumn({ name: 'role_id' }) // Specify the foreign key column name
  role: Role; // Rename field to singular 'role'

  // Hash password before saving
  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    // Only hash if the password has changed or is new
    // TypeORM doesn't easily track changes, so we might re-hash unnecessarily on update
    // A more robust solution might involve checking if the password field looks like a hash already
    // or having a separate mechanism to indicate password change.
    // For simplicity now, we hash if it doesn't look like a bcrypt hash.
    if (this.password && !this.password.startsWith('$2b$')) { 
        const saltRounds = 10;
        this.password = await bcrypt.hash(this.password, saltRounds);
    }
  }

   // Helper method to compare passwords (optional but useful)
   async comparePassword(attempt: string): Promise<boolean> {
       return bcrypt.compare(attempt, this.password);
   }
} 