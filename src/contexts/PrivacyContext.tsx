import { createContext, useContext } from 'react';

export const PrivacyContext = createContext(false);
export const usePrivacy = () => useContext(PrivacyContext);

export const HIDDEN = '••••';
