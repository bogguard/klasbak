import type { CreateStaffRequest, StaffMember, StaffRole } from '@library/shared';
import { cognitoDirectory } from './cognito-directory';
import { memoryDirectory } from './memory-directory';

/**
 * Where staff accounts live: Cognito on AWS. Local development has no Cognito, so it uses an
 * in-memory list with the same behaviour (STAFF_DIRECTORY=memory, set by the local server).
 */
export interface StaffDirectory {
  list(): Promise<StaffMember[]>;
  get(username: string): Promise<StaffMember | undefined>;
  create(input: CreateStaffRequest, temporaryPassword: string): Promise<StaffMember>;
  setRole(username: string, role: StaffRole): Promise<void>;
  setEnabled(username: string, enabled: boolean): Promise<void>;
  setTemporaryPassword(username: string, password: string): Promise<void>;
  resetMfa(username: string): Promise<void>;
}

export function staffDirectory(): StaffDirectory {
  return process.env.STAFF_DIRECTORY === 'memory' ? memoryDirectory : cognitoDirectory;
}
