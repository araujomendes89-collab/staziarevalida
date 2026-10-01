import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  doc,
  query,
  onSnapshot,
  getDocs,
  getDoc,
  QueryConstraint,
  DocumentData,
  FirestoreError,
} from "firebase/firestore";
import { db, FirestoreOperationType, handleFirestoreError } from "../lib/firebase";

export interface UseFirestoreCollectionOptions {
  /**
   * Whether to listen to real-time changes with onSnapshot (default: true)
   */
  realtime?: boolean;
  /**
   * Dependency list to re-run query when parameters change
   */
  deps?: unknown[];
}

export interface UseFirestoreCollectionResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Custom React hook to fetch and optionally listen to a Firestore collection in real time.
 *
 * @param collectionName Firestore collection path (e.g. 'sessions', 'errors', 'questions')
 * @param constraints Optional Firestore query constraints (where, orderBy, limit, etc.)
 * @param options Configuration options (realtime mode, dependency list)
 */
export function useFirestoreCollection<T = DocumentData>(
  collectionName: string | null | undefined,
  constraints: QueryConstraint[] = [],
  options: UseFirestoreCollectionOptions = {}
): UseFirestoreCollectionResult<T> {
  const { realtime = true, deps = [] } = options;
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(collectionName));
  const [error, setError] = useState<string | null>(null);

  // Keep ref to avoid stale closure in refetch
  const constraintsRef = useRef<QueryConstraint[]>(constraints);
  constraintsRef.current = constraints;

  const fetchData = useCallback(async () => {
    if (!collectionName) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const colRef = collection(db, collectionName);
      const q = query(colRef, ...constraintsRef.current);
      const snapshot = await getDocs(q);
      const items: T[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as unknown as T[];
      setData(items);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[useFirestoreCollection] Error querying collection "${collectionName}":`, err);
      setError(errMsg);
      try {
        handleFirestoreError(err, FirestoreOperationType.LIST, collectionName);
      } catch {
        // Logged by handleFirestoreError
      }
    } finally {
      setLoading(false);
    }
  }, [collectionName]);

  useEffect(() => {
    if (!collectionName) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    if (realtime) {
      const colRef = collection(db, collectionName);
      const q = query(colRef, ...constraints);

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items: T[] = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as unknown as T[];
          setData(items);
          setLoading(false);
        },
        (err: FirestoreError) => {
          console.error(`[useFirestoreCollection] Realtime subscription error on "${collectionName}":`, err);
          setError(err.message);
          setLoading(false);
        }
      );

      return () => {
        unsubscribe();
      };
    } else {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, realtime, ...deps]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

export interface UseFirestoreDocumentResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Custom React hook to fetch a single Firestore document.
 *
 * @param collectionName Firestore collection path
 * @param docId Document ID
 * @param realtime Whether to listen in real time (default: true)
 */
export function useFirestoreDocument<T = DocumentData>(
  collectionName: string | null | undefined,
  docId: string | null | undefined,
  realtime = true
): UseFirestoreDocumentResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(collectionName && docId));
  const [error, setError] = useState<string | null>(null);

  const fetchDoc = useCallback(async () => {
    if (!collectionName || !docId) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const docRef = doc(db, collectionName, docId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setData({ id: snap.id, ...snap.data() } as unknown as T);
      } else {
        setData(null);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[useFirestoreDocument] Error fetching document "${collectionName}/${docId}":`, err);
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, [collectionName, docId]);

  useEffect(() => {
    if (!collectionName || !docId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    if (realtime) {
      const docRef = doc(db, collectionName, docId);
      const unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (snap.exists()) {
            setData({ id: snap.id, ...snap.data() } as unknown as T);
          } else {
            setData(null);
          }
          setLoading(false);
        },
        (err: FirestoreError) => {
          console.error(`[useFirestoreDocument] Realtime error on "${collectionName}/${docId}":`, err);
          setError(err.message);
          setLoading(false);
        }
      );

      return () => {
        unsubscribe();
      };
    } else {
      fetchDoc();
    }
  }, [collectionName, docId, realtime, fetchDoc]);

  return {
    data,
    loading,
    error,
    refetch: fetchDoc,
  };
}
