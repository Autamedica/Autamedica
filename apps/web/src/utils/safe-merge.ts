/**
 * Safe Merge Utility
 * 
 * Implements defensive checks to prevent runtime 'TypeError: object has no method' 
 * during complex object synchronization (like Clinical Case States).
 */

/** Contract for objects that handle their own update logic */
export interface UpdatableModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- duck-typed model methods accept arbitrary data
  updateFrom?: (data: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- duck-typed model methods accept arbitrary data
  set?: (data: any) => void;
}

/**
 * Merges source data into a target object safely.
 * 
 * 1. Checks if target has 'updateFrom' or 'set' methods.
 * 2. If methods exist, calls them to handle internal logic.
 * 3. Fallback: Creates a new object with spread operator if no methods found.
 */
export function safeMerge<T extends object>(target: T, source: Partial<T>): T {
  if (!target) return source as T;
  if (!source) return target;

  // Defensive: check for updateFrom (legacy/custom model pattern)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime duck-type check on unknown model shape
  if ('updateFrom' in target && typeof (target as any).updateFrom === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same duck-type call
    (target as any).updateFrom(source);
    return target;
  }

  // Defensive: check for set (Backbone/Standard model pattern)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime duck-type check on unknown model shape
  if ('set' in target && typeof (target as any).set === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same duck-type call
    (target as any).set(source);
    return target;
  }

  // Modern functional fallback: Return merged clone
  // This ensures we don't break if target is a plain interface-based object
  return {
    ...target,
    ...source
  };
}

/**
 * Safely updates an item within a collection.
 * Maintains immutability if the item is a plain object, 
 * or mutates in-place if it follows a Model pattern.
 */
export function safeApplyToCollection<T extends { id: string | number }>(
  collection: T[],
  item: Partial<T> & { id: string | number },
  merge: boolean = true
): T[] {
  const index = collection.findIndex(i => i.id === item.id);
  
  if (index === -1) {
    // New item: append to collection
    return [...collection, item as T];
  }

  const existing = collection[index];
  
  if (merge) {
    const merged = safeMerge(existing, item);
    
    // If safeMerge returned a new object (functional fallback), update the array
    if (merged !== existing) {
      const newCollection = [...collection];
      newCollection[index] = merged as T;
      return newCollection;
    }
    
    // If it mutated in-place (model pattern), return a new array reference for React/Astro stability
    return [...collection];
  }

  // Non-merge: Total replacement
  const newCollection = [...collection];
  newCollection[index] = item as T;
  return newCollection;
}
