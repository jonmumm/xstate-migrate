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

    const handleStateValue = (stateValue: any, path: string) => {
      console.debug(`Handling state value at path: ${path}`, stateValue);
      if (typeof stateValue === 'object' && stateValue !== null) {
        Object.keys(stateValue).forEach((key) => {
          const newPath = `${path}/${key}`;
          if (
            typeof stateValue[key] === 'string' &&
            !validStates.has(`${machine.id}${newPath}/${stateValue[key]}`)
          ) {
            console.debug(`Invalid substate found: ${stateValue[key]} in ${newPath}`);
            const initialStateValue = initialSnap.value[key] || initialSnap.value;
            valueOperations.push({
              op: 'replace',
              path: `/value${newPath}`,
              value: initialStateValue,
            });
          } else {
            handleStateValue(stateValue[key], newPath);
          }
        });
      } else if (typeof stateValue === 'string') {
        const fullPath = `${machine.id}${path}/${stateValue}`.replace(/\./g, '/');
        console.debug(`Checking state validity: ${fullPath}`);
        if (!validStates.has(fullPath)) {
          console.debug(`Invalid state found: ${fullPath}`);
          const initialStateValue = initialSnap.value;
          console.debug(`Initial state for replacement: ${initialStateValue}`);
          valueOperations.push({
            op: 'replace',
            path: `/value${path}`,
            value: initialStateValue,
          });
        }
      }
    };

    handleStateValue(persistedSnapshot.value, '');

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
