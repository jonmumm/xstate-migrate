import { Operation, applyPatch, compare } from 'fast-json-patch';
import { AnyStateMachine, createActor } from 'xstate';
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
  generateMigrations: (machine, persistedSnapshot) => {
    console.debug('Generating migrations');
    console.debug('Persisted snapshot:', JSON.stringify(persistedSnapshot, null, 2));

    const actor = createActor(machine).start();
    const initialSnap = actor.getSnapshot();
    console.debug('Initial snapshot:', JSON.stringify(initialSnap, null, 2));

    const contextOperations = compare(persistedSnapshot.context, initialSnap.context);
    const filteredContextOperations = contextOperations
      .filter((operation) => operation.op === 'add' || operation.op === 'remove')
      .map((operation) => ({
        ...operation,
        path: `/context${operation.path}`,
      }));
    console.debug('Context operations:', filteredContextOperations);

    const validStates = getValidStates(machine);
    console.debug('Valid states:', validStates);

    let valueOperations: Operation[] = [];

    const handleStateValue = (stateValue: any, path: string, machineStates: any) => {
      console.debug(`Handling state value at path: ${path}`, stateValue);
      if (typeof stateValue === 'object' && stateValue !== null) {
        Object.keys(stateValue).forEach((key) => {
          const newPath = `${path}/${key}`;
          const currentState = machineStates[key];
          if (currentState) {
            if (
              typeof stateValue[key] === 'string' &&
              currentState.states &&
              !currentState.states[stateValue[key]]
            ) {
              console.debug(`Invalid substate found: ${stateValue[key]} in ${newPath}`);
              valueOperations.push({
                op: 'replace',
                path: newPath,
                value: currentState.initial,
              });
            } else {
              handleStateValue(stateValue[key], newPath, currentState.states);
            }
          } else {
            console.debug(`Invalid state found: ${newPath}`);
            valueOperations.push({
              op: 'remove',
              path: newPath,
            });
          }
        });
      } else if (typeof stateValue === 'string') {
        const fullPath = `${machine.id}/${stateValue}`; // Combine machine ID with state value
        if (!validStates.has(fullPath)) {
          // Check the full path in valid states
          console.debug(`Invalid state found: ${fullPath}`);
          valueOperations.push({
            op: 'replace',
            path,
            value: machineStates.initial || Object.keys(machineStates)[0],
          });
        }
      }
    };

    handleStateValue(persistedSnapshot.value, '/value', machine.config.states);

    const allOperations = [...valueOperations, ...filteredContextOperations];
    console.debug('All generated migrations:', allOperations);
    return allOperations;
  },

  applyMigrations: (persistedSnapshot, migrations) => {
    console.debug('Applying migrations:', migrations);
    const migratedSnapshot = JSON.parse(JSON.stringify(persistedSnapshot));
    applyPatch(migratedSnapshot, migrations);
    console.debug('Migrated snapshot:', JSON.stringify(migratedSnapshot, null, 2));
    return migratedSnapshot;
  },
};
