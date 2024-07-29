import { Operation } from 'fast-json-patch';
import { AnyMachineSnapshot, AnyStateMachine } from 'xstate';

export interface XStateMigrate {
  generateMigrations: (
    machine: AnyStateMachine,
    persistedSnapshot: AnyMachineSnapshot,
  ) => Operation[];

  applyMigrations: (
    persistedSnapshot: AnyMachineSnapshot,
    migrations: Operation[],
  ) => AnyMachineSnapshot;
}
