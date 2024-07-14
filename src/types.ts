import { Operation } from 'fast-json-patch';
import { AnyMachineSnapshot, AnyStateMachine } from 'xstate';

export interface XStateMigrate {
  generateMigrations: <TContext, TEvent extends { type: string }>(
    machine: AnyStateMachine,
    persistedSnapshot: AnyMachineSnapshot,
  ) => Operation[];

  applyMigrations: <TContext, TEvent extends { type: string }>(
    persistedSnapshot: AnyMachineSnapshot,
    migrations: Operation[],
  ) => AnyMachineSnapshot;
}
