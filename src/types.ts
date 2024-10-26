import { Operation } from 'fast-json-patch';
import { AnyMachineSnapshot, AnyStateMachine, InputFrom } from 'xstate';

export interface XStateMigrate {
  generateMigrations: <TMachine extends AnyStateMachine>(
    machine: TMachine,
    persistedSnapshot: AnyMachineSnapshot,
    input?: InputFrom<TMachine>
  ) => Operation[];

  applyMigrations: (
    persistedSnapshot: AnyMachineSnapshot,
    migrations: Operation[],
  ) => AnyMachineSnapshot;
}
