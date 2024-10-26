import { Operation, applyPatch, compare } from 'fast-json-patch';
import { AnyMachineSnapshot, AnyStateMachine, InputFrom, createActor } from 'xstate';
import { XStateMigrate } from './types';

const getValidStates = (machine: AnyStateMachine): Set<string> => {
  if (
    typeof machine === 'object' &&
    machine !== null &&
    'idMap' in machine &&
    machine.idMap instanceof Map
  ) {
    return new Set(Array.from(machine.idMap.keys()).map((key) => key.replace(/\./g, '/')));
  } else {
    throw new Error('Unable to find idMap on machine');
  }
};

export const xstateMigrate: XStateMigrate = {
  generateMigrations: <TMachine extends AnyStateMachine>(
    machine: TMachine,
    persistedSnapshot: AnyMachineSnapshot,
    input?: InputFrom<TMachine>,
  ) => {
    // Create a new actor with the provided input
    const actor = createActor(machine, { input }).start();
    const initialSnap = actor.getSnapshot() as AnyMachineSnapshot;

    // Handle cases where context might be undefined
    const persistedContext = persistedSnapshot.context || {};
    const initialContext = initialSnap.context || {};

    // Only generate 'add' operations for new properties in the initial snapshot
    const contextOperations = compare(persistedContext, initialContext)
      .filter((operation) => operation.op === 'add')
      .map((operation) => ({
        ...operation,
        path: `/context${operation.path}`,
      }));

    const validStates = getValidStates(machine);
    const valueOperations: Operation[] = [];

    const getInitialStateValue = (initialState: any, path: string[]): any => {
      if (path.length === 0) return initialState;
      return getInitialStateValue(initialState[path[0]], path.slice(1));
    };

    const handleStateValue = (stateValue: any, path: string, initialPath: string[] = []) => {
      if (typeof stateValue === 'object' && stateValue !== null) {
        Object.keys(stateValue).forEach((key) => {
          const newPath = `${path}/${key}`;
          const newInitialPath = [...initialPath, key];
          if (
            typeof stateValue[key] === 'string' &&
            !validStates.has(`${machine.id}${newPath}/${stateValue[key]}`)
          ) {
            const initialStateValue = getInitialStateValue(initialSnap.value, newInitialPath);
            valueOperations.push({
              op: 'replace',
              path: `/value${newPath}`,
              value: initialStateValue,
            });
          } else {
            handleStateValue(stateValue[key], newPath, newInitialPath);
          }
        });
      } else if (typeof stateValue === 'string') {
        const fullPath = `${machine.id}${path}/${stateValue}`.replace(/\./g, '/');
        if (!validStates.has(fullPath)) {
          const initialStateValue = getInitialStateValue(initialSnap.value, initialPath);
          valueOperations.push({
            op: 'replace',
            path: `/value${path}`,
            value: initialStateValue,
          });
        }
      }
    };

    handleStateValue(persistedSnapshot.value, '');

    const allOperations = [...valueOperations, ...contextOperations];
    return allOperations;
  },

  applyMigrations: (persistedSnapshot, migrations) => {
    const migratedSnapshot = JSON.parse(JSON.stringify(persistedSnapshot));
    applyPatch(migratedSnapshot, migrations);
    return migratedSnapshot;
  },
};
