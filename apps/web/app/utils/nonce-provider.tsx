import { createContext, useContext } from 'react';

/** The per-request CSP nonce; empty in the browser, which never needs it */
const NonceContext = createContext('');

export const NonceProvider = NonceContext.Provider;

export const useNonce = () => useContext(NonceContext);
