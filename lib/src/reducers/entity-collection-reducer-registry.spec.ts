import { TestBed } from '@angular/core/testing';
import { Action, ActionReducer, MetaReducer } from '@ngrx/store';

import { EntityAction } from '../actions/entity-action';
import { EntityActionFactory } from '../actions/entity-action-factory';
import { EntityCache } from './entity-cache';
import { EntityCacheReducerFactory } from './entity-cache-reducer-factory';
import { EntityCollection } from './entity-collection';
import { EntityCollectionCreator } from './entity-collection-creator';
import { ENTITY_COLLECTION_META_REDUCERS } from './constants';
import { EntityCollectionReducerFactory } from './entity-collection-reducer';
import { EntityCollectionReducerMethodsFactory } from './entity-collection-reducer-methods';
import { EntityCollectionReducerRegistry, EntityCollectionReducers } from './entity-collection-reducer-registry';
import { EntityDefinitionService } from '../entity-metadata/entity-definition.service';
import { EntityMetadataMap, ENTITY_METADATA_TOKEN } from '../entity-metadata/entity-metadata';
import { EntityOp } from '../actions/entity-op';
import { IdSelector } from '../utils/ngrx-entity-models';
import { Logger } from '../utils/interfaces';

class Bar {
  id: number;
  bar: string;
}
class Foo {
  id: string;
  foo: string;
}
class Hero {
  id: number;
  name: string;
  power?: string;
}
class Villain {
  key: string;
  name: string;
}

const metadata: EntityMetadataMap = {
  Hero: {},
  Villain: { selectId: (villain: Villain) => villain.key }
};
describe('EntityCollectionReducerRegistry', () => {
  let collectionCreator: EntityCollectionCreator;
  let entityActionFactory: EntityActionFactory;
  let entityCacheReducer: ActionReducer<EntityCache, Action>;
  let entityCollectionReducerRegistry: EntityCollectionReducerRegistry;

  beforeEach(() => {
    entityActionFactory = new EntityActionFactory();
    const logger = jasmine.createSpyObj('Logger', ['error', 'log', 'warn']);

    TestBed.configureTestingModule({
      providers: [
        EntityCacheReducerFactory,
        EntityCollectionCreator,
        {
          provide: EntityCollectionReducerMethodsFactory,
          useClass: EntityCollectionReducerMethodsFactory
        },
        EntityCollectionReducerFactory,
        EntityCollectionReducerRegistry,
        EntityDefinitionService,
        { provide: ENTITY_METADATA_TOKEN, multi: true, useValue: metadata },
        { provide: Logger, useValue: logger }
      ]
    });
  });

  /** Sets the test variables with injected values. Closes TestBed configuration. */
  function setup() {
    collectionCreator = TestBed.get(EntityCollectionCreator);
    const entityCacheReducerFactory = TestBed.get(EntityCacheReducerFactory) as EntityCacheReducerFactory;
    entityCacheReducer = entityCacheReducerFactory.create();
    entityCollectionReducerRegistry = TestBed.get(EntityCollectionReducerRegistry);
  }

  describe('#registerReducer', () => {
    beforeEach(setup);

    it('can register a new reducer', () => {
      const reducer = createNoopReducer();
      entityCollectionReducerRegistry.registerReducer('Foo', reducer);
      const action = entityActionFactory.create<Foo>('Foo', EntityOp.ADD_ONE, {
        id: 'forty-two',
        foo: 'fooz'
      });
      // Must initialize the state by hand
      const state = entityCacheReducer({}, action);
      const collection = state['Foo'];
      expect(collection.ids.length).toBe(0, 'ADD_ONE should not add');
    });

    it('can replace existing reducer by registering with same name', () => {
      // Just like ADD_ONE test above with default reducer
      // but this time should not add the hero.
      const hero: Hero = { id: 42, name: 'Bobby' };
      const reducer = createNoopReducer();
      entityCollectionReducerRegistry.registerReducer('Hero', reducer);
      const action = entityActionFactory.create<Hero>('Hero', EntityOp.ADD_ONE, hero);
      const state = entityCacheReducer({}, action);
      const collection = state['Hero'];
      expect(collection.ids.length).toBe(0, 'ADD_ONE should not add');
    });
  });

  describe('#registerReducers', () => {
    beforeEach(setup);

    it('can register several reducers at the same time.', () => {
      const reducer = createNoopReducer();
      const reducers: EntityCollectionReducers = {
        Foo: reducer,
        Bar: reducer
      };
      entityCollectionReducerRegistry.registerReducers(reducers);

      const fooAction = entityActionFactory.create<Foo>('Foo', EntityOp.ADD_ONE, { id: 'forty-two', foo: 'fooz' });
      const barAction = entityActionFactory.create<Bar>('Bar', EntityOp.ADD_ONE, { id: 84, bar: 'baz' });

      let state = entityCacheReducer({}, fooAction);
      state = entityCacheReducer(state, barAction);

      expect(state['Foo'].ids.length).toBe(0, 'ADD_ONE Foo should not add');
      expect(state['Bar'].ids.length).toBe(0, 'ADD_ONE Bar should not add');
    });

    it('can register several reducers that may override.', () => {
      const reducer = createNoopReducer();
      const reducers: EntityCollectionReducers = {
        Foo: reducer,
        Hero: reducer
      };
      entityCollectionReducerRegistry.registerReducers(reducers);

      const fooAction = entityActionFactory.create<Foo>('Foo', EntityOp.ADD_ONE, { id: 'forty-two', foo: 'fooz' });
      const heroAction = entityActionFactory.create<Hero>('Hero', EntityOp.ADD_ONE, { id: 84, name: 'Alex' });

      let state = entityCacheReducer({}, fooAction);
      state = entityCacheReducer(state, heroAction);

      expect(state['Foo'].ids.length).toBe(0, 'ADD_ONE Foo should not add');
      expect(state['Hero'].ids.length).toBe(0, 'ADD_ONE Hero should not add');
    });
  });

  describe('with EntityCollectionMetadataReducers', () => {
    let metaReducerA: MetaReducer<EntityCollection, EntityAction>;
    let metaReducerB: MetaReducer<EntityCollection, EntityAction>;
    let metaReducerOutput: any[];

    // Create MetaReducer that reports how it was called on the way in and out
    function testMetadataReducerFactory(name: string) {
      // Return the MetaReducer
      return (r: ActionReducer<EntityCollection, EntityAction>) => {
        // Return the wrapped reducer
        return (state: EntityCollection, action: EntityAction) => {
          // entered
          metaReducerOutput.push({ metaReducer: name, inOut: 'in', action });
          // called reducer
          const newState = r(state, action);
          // exited
          metaReducerOutput.push({ metaReducer: name, inOut: 'out', action });
          return newState;
        };
      };
    }

    let addOneAction: EntityAction<Hero>;
    let hero: Hero;

    beforeEach(() => {
      metaReducerOutput = [];
      metaReducerA = jasmine.createSpy('metaReducerA').and.callFake(testMetadataReducerFactory('A'));
      metaReducerB = jasmine.createSpy('metaReducerA').and.callFake(testMetadataReducerFactory('B'));
      const metaReducers = [metaReducerA, metaReducerB];

      TestBed.configureTestingModule({
        providers: [{ provide: ENTITY_COLLECTION_META_REDUCERS, useValue: metaReducers }]
      });

      setup();

      hero = { id: 42, name: 'Bobby' };
      addOneAction = entityActionFactory.create<Hero>('Hero', EntityOp.ADD_ONE, hero);
    });

    it('should run inner default reducer as expected', () => {
      const state = entityCacheReducer({}, addOneAction);

      // inner default reducer worked as expected
      const collection = state['Hero'];
      expect(collection.ids.length).toBe(1, 'should have added one');
      expect(collection.entities[42]).toEqual(hero, 'should be added hero');
    });

    it('should call meta reducers for inner default reducer as expected', () => {
      const expected = [
        { metaReducer: 'A', inOut: 'in', action: addOneAction },
        { metaReducer: 'B', inOut: 'in', action: addOneAction },
        { metaReducer: 'B', inOut: 'out', action: addOneAction },
        { metaReducer: 'A', inOut: 'out', action: addOneAction }
      ];

      const state = entityCacheReducer({}, addOneAction);
      expect(metaReducerA).toHaveBeenCalled();
      expect(metaReducerB).toHaveBeenCalled();
      expect(metaReducerOutput).toEqual(expected);
    });

    it('should call meta reducers for custom registered reducer', () => {
      const reducer = createNoopReducer();
      entityCollectionReducerRegistry.registerReducer('Foo', reducer);
      const action = entityActionFactory.create<Foo>('Foo', EntityOp.ADD_ONE, {
        id: 'forty-two',
        foo: 'fooz'
      });

      const state = entityCacheReducer({}, action);
      expect(metaReducerA).toHaveBeenCalled();
      expect(metaReducerB).toHaveBeenCalled();
    });

    it('should call meta reducers for multiple registered reducers', () => {
      const reducer = createNoopReducer();
      const reducers: EntityCollectionReducers = {
        Foo: reducer,
        Hero: reducer
      };
      entityCollectionReducerRegistry.registerReducers(reducers);

      const fooAction = entityActionFactory.create<Foo>('Foo', EntityOp.ADD_ONE, { id: 'forty-two', foo: 'fooz' });

      entityCacheReducer({}, fooAction);
      expect(metaReducerA).toHaveBeenCalled();
      expect(metaReducerB).toHaveBeenCalled();

      const heroAction = entityActionFactory.create<Hero>('Hero', EntityOp.ADD_ONE, { id: 84, name: 'Alex' });

      entityCacheReducer({}, heroAction);
      expect(metaReducerA).toHaveBeenCalledTimes(2);
      expect(metaReducerB).toHaveBeenCalledTimes(2);
    });
  });

  // #region helpers
  function createCollection<T = any>(entityName: string, data: T[], selectId: IdSelector<any>) {
    return {
      ...collectionCreator.create<T>(entityName),
      ids: data.map(e => selectId(e)) as string[] | number[],
      entities: data.reduce(
        (acc, e) => {
          acc[selectId(e)] = e;
          return acc;
        },
        {} as any
      )
    } as EntityCollection<T>;
  }

  function createInitialCache(entityMap: { [entityName: string]: any[] }) {
    const cache: EntityCache = {};
    // tslint:disable-next-line:forin
    for (const entityName in entityMap) {
      const selectId = metadata[entityName].selectId || ((entity: any) => entity.id);
      cache[entityName] = createCollection(entityName, entityMap[entityName], selectId);
    }

    return cache;
  }

  function createNoopReducer<T>() {
    return function NoopReducer(collection: EntityCollection<T>, action: EntityAction): EntityCollection<T> {
      return collection;
    };
  }
  // #endregion helpers
});
