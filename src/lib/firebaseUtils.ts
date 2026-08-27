import { auth } from './firebase';
import { onSnapshot, DocumentReference, Query, Unsubscribe, getDocs } from 'firebase/firestore';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  
  const errMsg = String(errInfo.error);
  console.warn('Firestore Error / Quota Notice: ', JSON.stringify(errInfo));
  
  // Do not throw for resource-exhausted / quota exceeded / list operations in listeners to prevent crashing snapshot listeners
  if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota') || errMsg.includes('quota') || operationType === OperationType.LIST) {
    return;
  }
  
  throw new Error(JSON.stringify(errInfo));
}

export function safeOnSnapshot<T>(
  queryOrRef: DocumentReference<T> | Query<T>,
  onNext: (snapshot: any) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let isUnsubscribed = false;
  
  const unsubscribe = onSnapshot(
    queryOrRef as any,
    (snapshot) => {
      if (!isUnsubscribed) {
        onNext(snapshot);
      }
    },
    (error) => {
      console.warn('SafeOnSnapshot caught error (quota/network):', error);
      if (!isUnsubscribed) {
        if (onError) {
          onError(error as Error);
        }
        // Fallback: try fetching once via getDocs/getDoc if resource exhausted
        const errStr = String(error);
        if (errStr.includes('resource-exhausted') || errStr.includes('quota') || errStr.includes('Quota')) {
          getDocs(queryOrRef as any).then((snap) => {
            if (!isUnsubscribed) {
              onNext(snap);
            }
          }).catch((err) => {
            console.warn('Fallback getDocs also failed:', err);
          });
        }
      }
    }
  );

  return () => {
    isUnsubscribed = true;
    unsubscribe();
  };
}

